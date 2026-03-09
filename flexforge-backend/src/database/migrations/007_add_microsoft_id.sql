-- Add Microsoft OAuth identity column for users
-- Safe to run multiple times.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS "microsoftId" VARCHAR;

-- Unique only for non-null values (multiple NULLs allowed)
CREATE UNIQUE INDEX IF NOT EXISTS users_microsoft_id_unique
ON users ("microsoftId")
WHERE "microsoftId" IS NOT NULL;

