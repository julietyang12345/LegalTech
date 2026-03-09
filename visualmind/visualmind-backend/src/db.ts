import { Pool } from 'pg';
import { config } from './config.js';

export const db = new Pool({
  connectionString: config.databaseUrl,
});

export const initDb = async (): Promise<void> => {
  await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS vm_projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      title TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      current_tree_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS vm_generations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES vm_projects(id) ON DELETE CASCADE,
      version INT NOT NULL,
      model_name TEXT NOT NULL,
      prompt_used TEXT NOT NULL,
      raw_model_output TEXT,
      tree_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_id, version)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS vm_project_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES vm_projects(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('text', 'pdf', 'url')),
      title TEXT NOT NULL,
      content_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS vm_projects_user_id_idx
    ON vm_projects(user_id, created_at DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS vm_generations_project_id_idx
    ON vm_generations(project_id, created_at DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS vm_project_sources_project_id_idx
    ON vm_project_sources(project_id, created_at ASC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS vm_feature_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      user_email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS vm_feature_requests_user_id_idx
    ON vm_feature_requests(user_id, created_at DESC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS vm_user_plan_overrides (
      user_id UUID PRIMARY KEY,
      plan TEXT NOT NULL CHECK (plan IN ('pro')),
      source TEXT NOT NULL DEFAULT 'mvp-free-upgrade',
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS vm_user_plan_overrides_expires_at_idx
    ON vm_user_plan_overrides(expires_at DESC);
  `);
};
