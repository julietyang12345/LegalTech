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
    CREATE INDEX IF NOT EXISTS vm_projects_user_id_idx
    ON vm_projects(user_id, created_at DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS vm_generations_project_id_idx
    ON vm_generations(project_id, created_at DESC);
  `);
};
