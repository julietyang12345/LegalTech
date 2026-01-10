-- ============================================================================
-- FlexForge - Add UNLIMITED quota tier
-- Migration: 003_unlimited_tier
-- ============================================================================
--
-- NOTE: Unlimited quota is now configured via UNLIMITED_QUOTA_EMAIL env variable.
-- The user service automatically grants unlimited access to that email.
-- This migration only adds the UNLIMITED enum value for database compatibility.
-- ============================================================================

-- Add UNLIMITED to the quota_tier enum
-- Note: PostgreSQL doesn't allow easy modification of enums, so we check if it exists first
DO $$ BEGIN
    ALTER TYPE "QuotaTier" ADD VALUE IF NOT EXISTS 'UNLIMITED';
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN undefined_object THEN
        -- If enum doesn't exist (using varchar instead), just skip
        null;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN users."quotaTier" IS 'User quota tier: FREE, PRO, PREMIUM, or UNLIMITED (configured via UNLIMITED_QUOTA_EMAIL env var)';
