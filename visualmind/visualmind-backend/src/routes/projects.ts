import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { createProject, deleteProjectById, getProjectById, listProjects, saveGeneration } from '../services/project.service.js';
import { generateMindMapJson } from '../services/model.service.js';
import { normalizeGeneratedTree } from '../services/tree.service.js';
import { toFreemindXml } from '../utils/mm-export.js';
import type { TreeNode } from '../types.js';

const createProjectSchema = z.object({
  title: z.string().min(1).max(120),
  rawText: z.string().min(1).max(40000),
});

const generateSchema = z.object({
  inputText: z.string().min(1).max(40000).optional(),
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

const asyncHandler = (
  fn: (req: any, res: any, next: any) => Promise<void>,
) => (req: any, res: any, next: any) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

projectsRouter.post('/', asyncHandler(async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
    return;
  }

  const project = await createProject({
    userId: req.user!.id,
    title: parsed.data.title,
    rawText: parsed.data.rawText,
  });
  res.status(201).json({ project });
}));

projectsRouter.get('/', asyncHandler(async (req, res) => {
  const projects = await listProjects(req.user!.id);
  res.json({ projects, count: projects.length });
}));

projectsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const deleted = await deleteProjectById(req.params.id, req.user!.id);
  if (!deleted) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }
  res.json({ message: 'Project deleted' });
}));

projectsRouter.get('/:id/tree', asyncHandler(async (req, res) => {
  const project = await getProjectById(req.params.id, req.user!.id);
  if (!project) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }
  res.json({ tree: project.current_tree_json });
}));

projectsRouter.post('/:id/tree/patch', asyncHandler(async (req, res) => {
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
}));

projectsRouter.post('/:id/generate', asyncHandler(async (req, res) => {
  const parsed = generateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
    return;
  }

  const project = await getProjectById(req.params.id, req.user!.id);
  if (!project) {
    res.status(404).json({ message: 'Project not found' });
    return;
  }

  const inputText = parsed.data.inputText ?? project.raw_text;
  const promptUsed = `Generate a concise mind map tree from input text. Input length=${inputText.length}`;
  const rawModelOutput = await generateMindMapJson(inputText);
  const tree = normalizeGeneratedTree(rawModelOutput);
  const version = await saveGeneration({
    projectId: project.id,
    promptUsed,
    rawModelOutput,
    tree,
  });

  res.json({ projectId: project.id, version, tree });
}));

projectsRouter.get('/:id/export/mm', asyncHandler(async (req, res) => {
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
}));
