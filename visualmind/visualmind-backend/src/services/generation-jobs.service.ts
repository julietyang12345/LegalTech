import { randomUUID } from 'node:crypto';
import { saveGeneration } from './project.service.js';
import { generateMindMapJson, runWithGenerationUsageTracking } from './model.service.js';
import { normalizeGeneratedTree } from './tree.service.js';
import type { TreeNode, UserPlan } from '../types.js';

export type GenerationJobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface GenerationJobRecord {
  id: string;
  projectId: string;
  userId: string;
  status: GenerationJobStatus;
  createdAt: string;
  updatedAt: string;
  version?: number;
  tree?: TreeNode;
  error?: string;
}

const jobs = new Map<string, GenerationJobRecord>();
const JOB_TTL_MS = 1000 * 60 * 30;

const nowIso = (): string => new Date().toISOString();

const cleanupExpiredJobs = () => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [jobId, job] of jobs.entries()) {
    if (new Date(job.updatedAt).getTime() < cutoff) {
      jobs.delete(jobId);
    }
  }
};

const setJob = (job: GenerationJobRecord) => {
  cleanupExpiredJobs();
  jobs.set(job.id, job);
};

export const createGenerationJob = (params: {
  projectId: string;
  userId: string;
}): GenerationJobRecord => {
  const timestamp = nowIso();
  const job: GenerationJobRecord = {
    id: randomUUID(),
    projectId: params.projectId,
    userId: params.userId,
    status: 'queued',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  setJob(job);
  return job;
};

export const getGenerationJob = (jobId: string, userId: string): GenerationJobRecord | null => {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return null;
  return job;
};

export const runGenerationJob = async (params: {
  jobId: string;
  projectId: string;
  userId: string;
  inputText: string;
  plan: UserPlan;
}): Promise<void> => {
  const existing = jobs.get(params.jobId);
  if (!existing) return;

  setJob({
    ...existing,
    status: 'running',
    updatedAt: nowIso(),
  });

  try {
    const generation = await runWithGenerationUsageTracking(() => generateMindMapJson(params.inputText, params.plan));
    const rawModelOutput = generation.result;
    const tree = normalizeGeneratedTree(rawModelOutput);
    const promptUsed = `Generate a coverage-first mind map tree from input text. Input length=${params.inputText.length}`;
    const version = await saveGeneration({
      projectId: params.projectId,
      promptUsed,
      rawModelOutput,
      tree,
      usage: generation.usage,
    });
    console.log('[VisualMind] /generate-job:gpt-usage-summary', {
      projectId: params.projectId,
      jobId: params.jobId,
      version,
      userId: params.userId,
      openAiPromptTokens: generation.usage.openAiPromptTokens,
      openAiCompletionTokens: generation.usage.openAiCompletionTokens,
      openAiTotalTokens: generation.usage.openAiTotalTokens,
      openAiCostUsd: generation.usage.openAiCostUsd.toFixed(11),
    });

    setJob({
      ...existing,
      status: 'done',
      version,
      tree,
      updatedAt: nowIso(),
    });
  } catch (error) {
    setJob({
      ...existing,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Mind map generation failed',
      updatedAt: nowIso(),
    });
  }
};
