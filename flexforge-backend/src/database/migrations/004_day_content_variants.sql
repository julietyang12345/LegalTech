-- Migration: Day Content Variant Tracking
-- Purpose: Add variant tracking and quality scoring for day content (similar to curriculum cache)

-- Add winner_variant_id to existing day_content_cache table
ALTER TABLE day_content_cache
ADD COLUMN IF NOT EXISTS winner_variant_id UUID;

-- Create day_content_variants table
CREATE TABLE IF NOT EXISTS day_content_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key_id UUID NOT NULL REFERENCES day_content_cache(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  content_hash VARCHAR(64) NOT NULL,

  -- Core metrics (regen-focused)
  times_served INTEGER NOT NULL DEFAULT 0,
  times_regenerated INTEGER NOT NULL DEFAULT 0,
  immediate_regens INTEGER NOT NULL DEFAULT 0,
  quick_regens INTEGER NOT NULL DEFAULT 0,
  considered_regens INTEGER NOT NULL DEFAULT 0,

  -- Computed rate
  regen_rate DECIMAL(5, 4),

  -- Quality status
  quality_status VARCHAR(20) NOT NULL DEFAULT 'testing'
    CHECK (quality_status IN ('testing', 'good', 'bad', 'winner')),

  is_active BOOLEAN NOT NULL DEFAULT true,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_served_at TIMESTAMPTZ
);

-- Create index for variant lookup
CREATE INDEX IF NOT EXISTS idx_day_variant_cache_key
ON day_content_variants(cache_key_id)
WHERE is_active = true;

-- Create day_content_serves table (serve log)
CREATE TABLE IF NOT EXISTS day_content_serves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  variant_id UUID NOT NULL REFERENCES day_content_variants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  day_number INTEGER NOT NULL,
  served_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Outcome tracking
  regenerated BOOLEAN NOT NULL DEFAULT false,
  regenerated_at TIMESTAMPTZ,
  seconds_before_regen INTEGER,
  regen_category VARCHAR(20)
    CHECK (regen_category IS NULL OR regen_category IN ('immediate', 'quick', 'considered'))
);

-- Create indexes for serve log
CREATE INDEX IF NOT EXISTS idx_day_serve_variant ON day_content_serves(variant_id);
CREATE INDEX IF NOT EXISTS idx_day_serve_session ON day_content_serves(session_id);

-- Unique constraint: one serve per user/variant/session/day combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_day_serve_user_variant_session_day
ON day_content_serves(user_id, variant_id, session_id, day_number);

-- Add foreign key from day_content_cache to winner variant
ALTER TABLE day_content_cache
ADD CONSTRAINT fk_day_content_winner_variant
FOREIGN KEY (winner_variant_id) REFERENCES day_content_variants(id)
ON DELETE SET NULL;

-- Comments for documentation
COMMENT ON TABLE day_content_variants IS 'Different AI-generated versions of day content for quality tracking';
COMMENT ON TABLE day_content_serves IS 'Audit log of every day content serve for regen rate analysis';
COMMENT ON COLUMN day_content_variants.regen_rate IS 'Computed as times_regenerated / times_served';
COMMENT ON COLUMN day_content_variants.quality_status IS 'testing: <10 serves, good: <=20% regen, bad: >40% regen, winner: <=12% regen after 10+ serves';
COMMENT ON COLUMN day_content_serves.regen_category IS 'immediate: <30s, quick: 30s-2min, considered: >2min (worst signal)';
