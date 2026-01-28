-- Add user roles for authorization
-- Run this migration: psql -d flexforge_prod -f 005_user_roles.sql

-- Create the enum type
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('MEMBER', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add role column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'MEMBER';

-- Create index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Verify the changes
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'role';
