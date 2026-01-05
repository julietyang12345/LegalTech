-- ============================================================================
-- FlexForge Curriculum Caching - Regen-Rate Focused
-- Migration: 001_curriculum_cache
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. QUALITY STATUS ENUM
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE quality_status AS ENUM ('testing', 'good', 'bad', 'winner');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE regen_category AS ENUM ('immediate', 'quick', 'considered');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 2. CACHE KEYS - Unique topic + params combinations
-- ============================================================================
CREATE TABLE IF NOT EXISTS curriculum_cache_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    cache_key_hash VARCHAR(64) NOT NULL UNIQUE,

    -- Original params (aligned with GenerateCurriculumDto)
    skill_name VARCHAR(500) NOT NULL,
    skill_name_normalized VARCHAR(500) NOT NULL,
    duration_days INTEGER NOT NULL,
    hours_per_day DECIMAL(3,1) NOT NULL,
    skill_level VARCHAR(20) NOT NULL,

    -- Versioning (for cache invalidation)
    prompt_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    model_version VARCHAR(50) NOT NULL DEFAULT 'claude-sonnet-4',

    -- Winner
    winner_variant_id UUID,

    -- Stats
    cache_hits INTEGER DEFAULT 0,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days')
);

CREATE INDEX IF NOT EXISTS idx_cache_key_lookup
    ON curriculum_cache_keys(cache_key_hash)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cache_key_expiry
    ON curriculum_cache_keys(expires_at)
    WHERE is_active = true;

-- ============================================================================
-- 3. CACHE VARIANTS - Multiple versions per key
-- ============================================================================
CREATE TABLE IF NOT EXISTS curriculum_cache_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key_id UUID NOT NULL REFERENCES curriculum_cache_keys(id) ON DELETE CASCADE,

    content JSONB NOT NULL,
    content_hash VARCHAR(64) NOT NULL,

    -- Core metrics (computed from serve logs)
    times_served INTEGER DEFAULT 0,
    times_regenerated INTEGER DEFAULT 0,
    immediate_regens INTEGER DEFAULT 0,
    quick_regens INTEGER DEFAULT 0,
    considered_regens INTEGER DEFAULT 0,

    -- Secondary signals
    times_completed_day1 INTEGER DEFAULT 0,
    bounce_count INTEGER DEFAULT 0,

    -- Computed rate
    regen_rate DECIMAL(5,4),
    quality_status quality_status DEFAULT 'testing',

    is_active BOOLEAN DEFAULT true,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_served_at TIMESTAMP WITH TIME ZONE,

    UNIQUE(cache_key_id, content_hash)
);

-- Add foreign key for winner after variants table exists
ALTER TABLE curriculum_cache_keys
    DROP CONSTRAINT IF EXISTS fk_winner_variant;
ALTER TABLE curriculum_cache_keys
    ADD CONSTRAINT fk_winner_variant
    FOREIGN KEY (winner_variant_id)
    REFERENCES curriculum_cache_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_variant_cache_key
    ON curriculum_cache_variants(cache_key_id)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_variant_quality
    ON curriculum_cache_variants(cache_key_id, quality_status)
    WHERE is_active = true;

-- ============================================================================
-- 4. SERVE LOG - Track every serve for regen analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS curriculum_serves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    variant_id UUID NOT NULL REFERENCES curriculum_cache_variants(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,

    served_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Outcome tracking
    regenerated BOOLEAN DEFAULT false,
    regenerated_at TIMESTAMP WITH TIME ZONE,
    seconds_before_regen INTEGER,
    regen_category regen_category,

    completed_day1 BOOLEAN DEFAULT false,
    bounced BOOLEAN DEFAULT false,

    UNIQUE(user_id, variant_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_serve_variant ON curriculum_serves(variant_id);
CREATE INDEX IF NOT EXISTS idx_serve_session ON curriculum_serves(session_id);
CREATE INDEX IF NOT EXISTS idx_serve_user ON curriculum_serves(user_id);

-- ============================================================================
-- 5. SKILL ALIASES - Map similar topics to canonical names
-- ============================================================================
CREATE TABLE IF NOT EXISTS skill_aliases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alias VARCHAR(500) NOT NULL UNIQUE,
    canonical VARCHAR(500) NOT NULL
);

-- Seed common aliases
INSERT INTO skill_aliases (alias, canonical) VALUES
    ('react hooks', 'react'),
    ('usestate', 'react'),
    ('reactjs', 'react'),
    ('react.js', 'react'),
    ('python3', 'python'),
    ('python 3', 'python'),
    ('js', 'javascript'),
    ('ts', 'typescript'),
    ('node.js', 'nodejs'),
    ('node', 'nodejs'),
    ('machine learning', 'ml'),
    ('deep learning', 'dl'),
    ('artificial intelligence', 'ai'),
    ('nextjs', 'next.js'),
    ('next', 'next.js'),
    ('vue.js', 'vue'),
    ('vuejs', 'vue'),
    ('angular.js', 'angular'),
    ('angularjs', 'angular'),
    ('postgresql', 'postgres'),
    ('mongo', 'mongodb'),
    ('k8s', 'kubernetes'),
    ('tf', 'terraform'),
    ('aws lambda', 'serverless'),
    ('gcp functions', 'serverless'),
    ('azure functions', 'serverless')
ON CONFLICT (alias) DO NOTHING;

-- ============================================================================
-- 6. CLEANUP JOB - Run periodically to expire old cache
-- ============================================================================
-- Can be called via cron: SELECT cleanup_expired_cache();
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM curriculum_cache_keys
        WHERE expires_at < NOW() OR is_active = false
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE curriculum_cache_keys IS 'Unique combinations of topic + params for curriculum caching';
COMMENT ON TABLE curriculum_cache_variants IS 'Multiple AI-generated variants per cache key, tracked for quality';
COMMENT ON TABLE curriculum_serves IS 'Every serve logged for regen analysis and quality scoring';
COMMENT ON COLUMN curriculum_cache_variants.regen_rate IS 'times_regenerated / times_served - lower is better';
COMMENT ON COLUMN curriculum_serves.regen_category IS 'immediate (<30s), quick (30s-2m), considered (>2m) - considered is worst signal';
