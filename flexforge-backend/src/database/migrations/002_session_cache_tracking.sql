-- ============================================================================
-- FlexForge Session Cache Tracking
-- Migration: 002_session_cache_tracking
-- ============================================================================

-- Add cache tracking columns to sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS variant_id UUID,
ADD COLUMN IF NOT EXISTS from_cache BOOLEAN DEFAULT false;

-- Add index for variant lookups
CREATE INDEX IF NOT EXISTS idx_sessions_variant_id ON sessions(variant_id);

-- Add foreign key constraint (optional - comment out if you want loose coupling)
-- ALTER TABLE sessions
-- ADD CONSTRAINT fk_sessions_variant
-- FOREIGN KEY (variant_id) REFERENCES curriculum_cache_variants(id) ON DELETE SET NULL;
