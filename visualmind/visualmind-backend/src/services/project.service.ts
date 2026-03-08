import { db } from '../db.js';
import type { ProjectRecord, TreeNode } from '../types.js';
import { config } from '../config.js';

interface CreateProjectInput {
  userId: string;
  title: string;
  rawText: string;
}

export const createProject = async (input: CreateProjectInput): Promise<ProjectRecord> => {
  const result = await db.query<ProjectRecord>(
    `
      INSERT INTO vm_projects (user_id, title, raw_text)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
    [input.userId, input.title, input.rawText],
  );
  return result.rows[0];
};

export const listProjects = async (userId: string): Promise<ProjectRecord[]> => {
  const result = await db.query<ProjectRecord>(
    `
      SELECT * FROM vm_projects
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [userId],
  );
  return result.rows;
};

export const getProjectById = async (projectId: string, userId: string): Promise<ProjectRecord | null> => {
  const result = await db.query<ProjectRecord>(
    `
      SELECT * FROM vm_projects
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [projectId, userId],
  );
  return result.rows[0] ?? null;
};

export const deleteProjectById = async (projectId: string, userId: string): Promise<boolean> => {
  const result = await db.query(
    `
      DELETE FROM vm_projects
      WHERE id = $1 AND user_id = $2
    `,
    [projectId, userId],
  );
  return (result.rowCount ?? 0) > 0;
};

export const saveGeneration = async (params: {
  projectId: string;
  promptUsed: string;
  rawModelOutput: string;
  tree: TreeNode;
}): Promise<number> => {
  const versionRow = await db.query<{ next_version: number }>(
    `
      SELECT COALESCE(MAX(version), 0) + 1 AS next_version
      FROM vm_generations
      WHERE project_id = $1
    `,
    [params.projectId],
  );
  const version = versionRow.rows[0].next_version;

  await db.query(
    `
      INSERT INTO vm_generations
      (project_id, version, model_name, prompt_used, raw_model_output, tree_json)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      params.projectId,
      version,
      config.modelName,
      params.promptUsed,
      params.rawModelOutput,
      JSON.stringify(params.tree),
    ],
  );

  await db.query(
    `
      UPDATE vm_projects
      SET current_tree_json = $2::jsonb, updated_at = NOW()
      WHERE id = $1
    `,
    [params.projectId, JSON.stringify(params.tree)],
  );

  return version;
};
