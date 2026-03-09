import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { byUserOrIpKey, createRateLimit } from '../middleware/rate-limit.js';
import {
  addProjectSource,
  countProjectSources,
  createProject,
  deleteProjectById,
  deleteProjectSourceById,
  getProjectById,
  listProjectSources,
  listProjects,
  saveGeneration,
  createFeatureRequest,
  updatePrimarySourceTitle,
  updateProjectTitle,
  updateProjectSource,
} from '../services/project.service.js';
import { generateFlashcards, generateMindMapJson, generateSlides } from '../services/model.service.js';
import { assertInputAllowed, InputPolicyViolationError } from '../services/input-policy.service.js';
import { getLimitsForPlan, PRO_MAX_TEXT_CHARS } from '../services/plan.service.js';
import { normalizeGeneratedTree } from '../services/tree.service.js';
import { toFreemindXml, toNotionMarkdown } from '../utils/mm-export.js';
import type { TreeNode, UserPlan } from '../types.js';
const TOTAL_PASTED_INPUT_LIMIT = 10000;

const createProjectSchema = z.object({
  title: z.string().min(1).max(120),
  rawText: z.string().max(PRO_MAX_TEXT_CHARS),
  sourceSessions: z.array(z.string().min(1).max(PRO_MAX_TEXT_CHARS)).optional(),
});

const addSourceSchema = z.object({
  kind: z.enum(['text', 'pdf', 'url']).default('text'),
  title: z.string().trim().min(1).max(120).optional(),
  contentText: z.string().min(1).max(PRO_MAX_TEXT_CHARS),
});

const updateSourceSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  contentText: z.string().min(1).max(PRO_MAX_TEXT_CHARS),
});

const updateProjectTitleSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

const generateSchema = z.object({
  inputText: z.string().min(1).max(PRO_MAX_TEXT_CHARS).optional(),
});

const slidesSchema = z.object({
  inputText: z.string().min(1).max(PRO_MAX_TEXT_CHARS).optional(),
  slideCount: z.number().int().min(4).max(12).optional(),
});

const flashcardsSchema = z.object({
  inputText: z.string().min(1).max(PRO_MAX_TEXT_CHARS).optional(),
  cardCount: z.number().int().min(6).max(24).optional(),
});

const featureRequestSchema = z.object({
  message: z.string().trim().min(10).max(2000),
});

const treeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    text: z.string().min(1).max(120),
    children: z.array(treeNodeSchema),
  }),
);

const treePatchSchema = z.object({
  tree: treeNodeSchema,
});

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

const asyncHandler =
  (fn: (req: any, res: any, next: any) => Promise<void>) =>
  (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const inferSourceTitle = (text: string, fallback: string): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  return clean.slice(0, 120);
};

const buildGenerationInput = async (projectId: string, userId: string): Promise<string> => {
  const sources = await listProjectSources(projectId, userId);
  const persistedText = sources.map((source) => source.content_text).join('\n\n---\n\n').trim();
  return persistedText;
};

const generateRateLimit = createRateLimit({
  name: 'vm-generate',
  windowMs: 60_000,
  max: 12,
  key: byUserOrIpKey,
});

const enforceInputPolicy = async (
  res: any,
  plan: UserPlan,
  inputText: string,
  context: string,
): Promise<boolean> => {
  if (plan !== 'pro') return true;
  try {
    await assertInputAllowed(inputText, context);
    return true;
  } catch (error) {
    if (error instanceof InputPolicyViolationError) {
      res.status(400).json({
        message: 'Input blocked by safety policy. Remove illegal or disallowed content and try again.',
        categories: error.categories,
      });
      return false;
    }
    console.warn('[VisualMind] input-policy:check-failed-allowing-request', {
      context,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return true;
  }
};

projectsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
      return;
    }

    const limits = getLimitsForPlan(req.user!.plan);
    const rawText = parsed.data.rawText.trim();
    const draftSessions = [...(parsed.data.sourceSessions ?? []), rawText]
      .map((session) => session.trim())
      .filter(Boolean);

    if (draftSessions.length === 0) {
      res.status(400).json({ message: 'At least one source session is required' });
      return;
    }
    if (draftSessions.length > limits.maxSourceSessions) {
      res.status(403).json({
        message: `Your plan supports up to ${limits.maxSourceSessions} source sessions per project. Upgrade to add more.`,
      });
      return;
    }

    const tooLong = draftSessions.find((session) => session.length > limits.maxTextChars);
    if (tooLong) {
      res.status(403).json({
        message: `Your plan supports up to ${limits.maxTextChars} characters per source session.`,
      });
      return;
    }
    const totalChars = draftSessions.reduce((sum, session) => sum + session.length, 0);
    if (totalChars > TOTAL_PASTED_INPUT_LIMIT) {
      res.status(403).json({
        message: `Total pasted input is limited to ${TOTAL_PASTED_INPUT_LIMIT} characters per project.`,
      });
      return;
    }

    for (let i = 0; i < draftSessions.length; i += 1) {
      const isAllowed = await enforceInputPolicy(
        res,
        req.user!.plan,
        draftSessions[i],
        `create-project:source-${i + 1}`,
      );
      if (!isAllowed) return;
    }

    const project = await createProject({
      userId: req.user!.id,
      title: parsed.data.title,
      rawText: rawText || draftSessions[0],
    });

    await Promise.all(
      draftSessions.map((session, index) =>
        addProjectSource({
          projectId: project.id,
          userId: req.user!.id,
          kind: 'text',
          title: inferSourceTitle(session, `Source Session ${index + 1}`),
          contentText: session,
        }),
      ),
    );

    res.status(201).json({ project });
  }),
);

projectsRouter.post(
  '/:id/sources',
  asyncHandler(async (req, res) => {
    const parsed = addSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
      return;
    }

    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const limits = getLimitsForPlan(req.user!.plan);
    const contentText = parsed.data.contentText.trim();
    if (contentText.length > limits.maxTextChars) {
      res.status(403).json({
        message: `Your plan supports up to ${limits.maxTextChars} characters per source session.`,
      });
      return;
    }

    const currentCount = await countProjectSources(project.id, req.user!.id);
    if (currentCount >= limits.maxSourceSessions) {
      res.status(403).json({
        message: `Your plan supports up to ${limits.maxSourceSessions} source sessions per project.`,
      });
      return;
    }
    const existingSources = await listProjectSources(project.id, req.user!.id);
    const nextTotalChars =
      existingSources.reduce((sum, source) => sum + source.content_text.length, 0) + contentText.length;
    if (nextTotalChars > TOTAL_PASTED_INPUT_LIMIT) {
      res.status(403).json({
        message: `Total pasted input is limited to ${TOTAL_PASTED_INPUT_LIMIT} characters per project.`,
      });
      return;
    }
    if (!(await enforceInputPolicy(res, req.user!.plan, contentText, 'add-source'))) return;

    const source = await addProjectSource({
      projectId: project.id,
      userId: req.user!.id,
      kind: parsed.data.kind,
      title: parsed.data.title?.trim() || inferSourceTitle(contentText, `Source Session ${currentCount + 1}`),
      contentText,
    });

    res.status(201).json({ source });
  }),
);

projectsRouter.get(
  '/:id/sources',
  asyncHandler(async (req, res) => {
    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const sources = await listProjectSources(project.id, req.user!.id);
    res.json({ sources, count: sources.length });
  }),
);

projectsRouter.patch(
  '/:id/sources/:sourceId',
  asyncHandler(async (req, res) => {
    const parsed = updateSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
      return;
    }

    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const limits = getLimitsForPlan(req.user!.plan);
    const contentText = parsed.data.contentText.trim();
    if (contentText.length > limits.maxTextChars) {
      res.status(403).json({
        message: `Your plan supports up to ${limits.maxTextChars} characters per source session.`,
      });
      return;
    }
    const existingSources = await listProjectSources(project.id, req.user!.id);
    const existing = existingSources.find((source) => source.id === req.params.sourceId);
    if (!existing) {
      res.status(404).json({ message: 'Source not found' });
      return;
    }
    const nextTotalChars =
      existingSources.reduce((sum, source) => sum + source.content_text.length, 0) -
      existing.content_text.length +
      contentText.length;
    if (nextTotalChars > TOTAL_PASTED_INPUT_LIMIT) {
      res.status(403).json({
        message: `Total pasted input is limited to ${TOTAL_PASTED_INPUT_LIMIT} characters per project.`,
      });
      return;
    }
    if (!(await enforceInputPolicy(res, req.user!.plan, contentText, 'update-source'))) return;

    const source = await updateProjectSource({
      projectId: project.id,
      sourceId: req.params.sourceId,
      userId: req.user!.id,
      title: parsed.data.title?.trim() || inferSourceTitle(contentText, 'Source Session'),
      contentText,
    });

    if (!source) {
      res.status(404).json({ message: 'Source not found' });
      return;
    }

    res.json({ source });
  }),
);

projectsRouter.delete(
  '/:id/sources/:sourceId',
  asyncHandler(async (req, res) => {
    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const deleted = await deleteProjectSourceById(project.id, req.params.sourceId, req.user!.id);
    if (!deleted) {
      res.status(404).json({ message: 'Source not found' });
      return;
    }

    res.json({ message: 'Source deleted' });
  }),
);

projectsRouter.post(
  '/:id/sources/:sourceId/delete',
  asyncHandler(async (req, res) => {
    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const deleted = await deleteProjectSourceById(project.id, req.params.sourceId, req.user!.id);
    if (!deleted) {
      res.status(404).json({ message: 'Source not found' });
      return;
    }

    res.json({ message: 'Source deleted' });
  }),
);

projectsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const projects = await listProjects(req.user!.id);
    res.json({ projects, count: projects.length });
  }),
);

projectsRouter.patch(
  '/:id/title',
  asyncHandler(async (req, res) => {
    const parsed = updateProjectTitleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
      return;
    }

    const project = await updateProjectTitle(req.params.id, req.user!.id, parsed.data.title);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    await updatePrimarySourceTitle(project.id, req.user!.id, parsed.data.title);
    res.json({ project });
  }),
);

projectsRouter.post(
  '/feature-requests',
  asyncHandler(async (req, res) => {
    const parsed = featureRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
      return;
    }

    const request = await createFeatureRequest({
      userId: req.user!.id,
      userEmail: req.user!.email,
      message: parsed.data.message,
    });

    res.status(201).json({ request });
  }),
);

projectsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const deleted = await deleteProjectById(req.params.id, req.user!.id);
    if (!deleted) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }
    res.json({ message: 'Project deleted' });
  }),
);

projectsRouter.get(
  '/:id/tree',
  asyncHandler(async (req, res) => {
    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }
    res.json({ tree: project.current_tree_json });
  }),
);

projectsRouter.post(
  '/:id/tree/patch',
  asyncHandler(async (req, res) => {
    const parsed = treePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
      return;
    }

    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const { tree } = parsed.data;
    await saveGeneration({
      projectId: project.id,
      promptUsed: 'manual-tree-patch',
      rawModelOutput: JSON.stringify(tree),
      tree,
    });

    res.json({ projectId: project.id, tree });
  }),
);

projectsRouter.post(
  '/:id/generate',
  generateRateLimit,
  asyncHandler(async (req, res) => {
    console.log('[VisualMind] /generate:start', {
      projectId: req.params.id,
      userId: req.user?.id,
      hasInputText: Boolean(req.body?.inputText),
      inputChars: typeof req.body?.inputText === 'string' ? req.body.inputText.length : 0,
    });

    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      console.warn('[VisualMind] /generate:invalid-payload', { projectId: req.params.id });
      res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
      return;
    }

    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      console.warn('[VisualMind] /generate:project-not-found', {
        projectId: req.params.id,
        userId: req.user?.id,
      });
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (parsed.data.inputText?.trim()) {
      res.status(400).json({
        message: 'Generation uses Added Sources only. Save text into Added Sources before generating.',
      });
      return;
    }

    const inputText = await buildGenerationInput(project.id, req.user!.id);
    console.log('[VisualMind] /generate:input-ready', {
      projectId: project.id,
      combinedChars: inputText.length,
    });
    if (!inputText.trim()) {
      console.warn('[VisualMind] /generate:no-input', { projectId: project.id });
      res.status(400).json({ message: 'No source content found. Add at least one source before generating.' });
      return;
    }
    if (!(await enforceInputPolicy(res, req.user!.plan, inputText, 'generate-mindmap'))) return;

    let rawModelOutput: string;
    let tree: TreeNode;
    try {
      rawModelOutput = await generateMindMapJson(inputText, req.user!.plan);
      tree = normalizeGeneratedTree(rawModelOutput);
    } catch (error) {
      console.error('[VisualMind] /generate:model-or-parse-failed', {
        projectId: project.id,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      const message = error instanceof Error ? error.message : 'Mind map generation failed';
      res.status(502).json({ message });
      return;
    }

    const promptUsed = `Generate a concise mind map tree from input text. Input length=${inputText.length}`;
    const version = await saveGeneration({ projectId: project.id, promptUsed, rawModelOutput, tree });
    console.log('[VisualMind] /generate:success', {
      projectId: project.id,
      version,
      root: tree.text,
    });

    res.json({ projectId: project.id, version, tree });
  }),
);

projectsRouter.post(
  '/:id/generate/slides',
  generateRateLimit,
  asyncHandler(async (req, res) => {
    const parsed = slidesSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
      return;
    }

    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (parsed.data.inputText?.trim()) {
      res.status(400).json({
        message: 'Slides use Added Sources only. Save text into Added Sources before generating.',
      });
      return;
    }

    const inputText = await buildGenerationInput(project.id, req.user!.id);
    if (!(await enforceInputPolicy(res, req.user!.plan, inputText, 'generate-slides'))) return;
    const slides = await generateSlides(inputText, parsed.data.slideCount);
    res.json({ projectId: project.id, slides });
  }),
);

projectsRouter.post(
  '/:id/generate/flashcards',
  generateRateLimit,
  asyncHandler(async (req, res) => {
    const parsed = flashcardsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
      return;
    }

    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (parsed.data.inputText?.trim()) {
      res.status(400).json({
        message: 'Flashcards use Added Sources only. Save text into Added Sources before generating.',
      });
      return;
    }

    const inputText = await buildGenerationInput(project.id, req.user!.id);
    if (!(await enforceInputPolicy(res, req.user!.plan, inputText, 'generate-flashcards'))) return;
    const flashcards = await generateFlashcards(inputText, parsed.data.cardCount);
    res.json({ projectId: project.id, flashcards });
  }),
);

projectsRouter.get(
  '/:id/export/mm',
  asyncHandler(async (req, res) => {
    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }
    if (!project.current_tree_json) {
      res.status(400).json({ message: 'No generated tree found for this project' });
      return;
    }

    const xml = toFreemindXml(project.current_tree_json);
    const filename = `${project.title.replaceAll(/[^a-zA-Z0-9-_]+/g, '_') || 'mindmap'}.mm`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  }),
);

projectsRouter.get(
  '/:id/export/md',
  asyncHandler(async (req, res) => {
    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }
    if (!project.current_tree_json) {
      res.status(400).json({ message: 'No generated tree found for this project' });
      return;
    }

    const markdown = toNotionMarkdown(project.current_tree_json, project.title);
    const filename = `${project.title.replaceAll(/[^a-zA-Z0-9-_]+/g, '_') || 'mindmap'}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(markdown);
  }),
);

projectsRouter.get(
  '/:id/export/notion-markdown',
  asyncHandler(async (req, res) => {
    const project = await getProjectById(req.params.id, req.user!.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }
    if (!project.current_tree_json) {
      res.status(400).json({ message: 'No generated tree found for this project' });
      return;
    }

    const markdown = toNotionMarkdown(project.current_tree_json, project.title);
    const filename = `${project.title.replaceAll(/[^a-zA-Z0-9-_]+/g, '_') || 'mindmap'}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(markdown);
  }),
);
