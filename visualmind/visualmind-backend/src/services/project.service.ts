import { db } from '../db.js';
import type { ProjectRecord, ProjectSourceRecord, TreeNode } from '../types.js';
import { config } from '../config.js';

interface CreateProjectInput {
  userId: string;
  userEmail: string;
  title: string;
  rawText: string;
}

export const createProject = async (input: CreateProjectInput): Promise<ProjectRecord> => {
  const result = await db.query<ProjectRecord>(
    `
      INSERT INTO vm_projects (user_id, user_email, title, raw_text)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [input.userId, input.userEmail, input.title, input.rawText],
  );
  return result.rows[0];
};

export const addProjectSource = async (params: {
  projectId: string;
  userId: string;
  kind: 'text' | 'pdf' | 'url';
  title: string;
  contentText: string;
}): Promise<ProjectSourceRecord> => {
  const result = await db.query<ProjectSourceRecord>(
    `
      INSERT INTO vm_project_sources (project_id, user_id, kind, title, content_text)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [params.projectId, params.userId, params.kind, params.title, params.contentText],
  );
  return result.rows[0];
};

export const updateProjectSource = async (params: {
  projectId: string;
  sourceId: string;
  userId: string;
  title: string;
  contentText: string;
}): Promise<ProjectSourceRecord | null> => {
  const result = await db.query<ProjectSourceRecord>(
    `
      UPDATE vm_project_sources
      SET title = $4, content_text = $5
      WHERE project_id = $1 AND id = $2 AND user_id = $3
      RETURNING *
    `,
    [params.projectId, params.sourceId, params.userId, params.title, params.contentText],
  );
  return result.rows[0] ?? null;
};

export const countProjectSources = async (projectId: string, userId: string): Promise<number> => {
  const result = await db.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM vm_project_sources
      WHERE project_id = $1 AND user_id = $2
    `,
    [projectId, userId],
  );
  return Number(result.rows[0]?.count ?? 0);
};

export const listProjectSources = async (projectId: string, userId: string): Promise<ProjectSourceRecord[]> => {
  const result = await db.query<ProjectSourceRecord>(
    `
      SELECT *
      FROM vm_project_sources
      WHERE project_id = $1 AND user_id = $2
      ORDER BY created_at ASC
    `,
    [projectId, userId],
  );
  return result.rows;
};

export const listProjects = async (userId: string): Promise<ProjectRecord[]> => {
  const result = await db.query<ProjectRecord>(
    `
      SELECT
        p.*,
        (
          SELECT s.title
          FROM vm_project_sources s
          WHERE s.project_id = p.id AND s.user_id = p.user_id
          ORDER BY s.created_at ASC
          LIMIT 1
        ) AS primary_source_title
      FROM vm_projects p
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
    `,
    [userId],
  );
  return result.rows;
};

export const updateProjectTitle = async (
  projectId: string,
  userId: string,
  title: string,
): Promise<ProjectRecord | null> => {
  const result = await db.query<ProjectRecord>(
    `
      UPDATE vm_projects
      SET title = $3, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `,
    [projectId, userId, title],
  );
  return result.rows[0] ?? null;
};

export const updatePrimarySourceTitle = async (
  projectId: string,
  userId: string,
  title: string,
): Promise<boolean> => {
  const result = await db.query(
    `
      UPDATE vm_project_sources s
      SET title = $3
      WHERE s.id = (
        SELECT id
        FROM vm_project_sources
        WHERE project_id = $1 AND user_id = $2
        ORDER BY created_at ASC
        LIMIT 1
      )
    `,
    [projectId, userId, title],
  );
  return (result.rowCount ?? 0) > 0;
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

export const deleteProjectSourceById = async (
  projectId: string,
  sourceId: string,
  userId: string,
): Promise<boolean> => {
  const result = await db.query(
    `
      DELETE FROM vm_project_sources
      WHERE project_id = $1 AND id = $2 AND user_id = $3
    `,
    [projectId, sourceId, userId],
  );
  return (result.rowCount ?? 0) > 0;
};

export const saveGeneration = async (params: {
  projectId: string;
  promptUsed: string;
  rawModelOutput: string;
  tree: TreeNode;
  usage?: {
    openAiPromptTokens: number;
    openAiCompletionTokens: number;
    openAiTotalTokens: number;
    openAiCostUsd: number;
  };
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
      (
        project_id,
        version,
        model_name,
        prompt_used,
        raw_model_output,
        tree_json,
        openai_prompt_tokens,
        openai_completion_tokens,
        openai_total_tokens,
        openai_cost_usd
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
    `,
    [
      params.projectId,
      version,
      config.modelName,
      params.promptUsed,
      params.rawModelOutput,
      JSON.stringify(params.tree),
      params.usage?.openAiPromptTokens ?? 0,
      params.usage?.openAiCompletionTokens ?? 0,
      params.usage?.openAiTotalTokens ?? 0,
      params.usage?.openAiCostUsd ?? 0,
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

export const countGenerationsForUserToday = async (userId: string): Promise<number> => {
  const result = await db.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM vm_generations g
      JOIN vm_projects p ON p.id = g.project_id
      WHERE p.user_id = $1
        AND g.created_at >= date_trunc('day', NOW())
        AND g.created_at < date_trunc('day', NOW()) + INTERVAL '1 day'
    `,
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
};

export const createFeatureRequest = async (params: {
  userId: string;
  userEmail: string;
  message: string;
}): Promise<{ id: string; created_at: string }> => {
  const result = await db.query<{ id: string; created_at: string }>(
    `
      INSERT INTO vm_feature_requests (user_id, user_email, message)
      VALUES ($1, $2, $3)
      RETURNING id, created_at
    `,
    [params.userId, params.userEmail, params.message],
  );
  return result.rows[0];
};
