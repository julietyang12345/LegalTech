import { z } from 'zod';
import type { TreeNode } from '../types.js';

const nodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    children: z.array(nodeSchema),
  }),
);

const generatedSchema = z.object({
  title: z.string().min(1),
  children: z.array(
    z.object({
      text: z.string().min(1),
      children: z.array(z.any()).optional(),
    }),
  ),
});

const extractJsonCandidate = (raw: string): string => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = raw.indexOf('{');
  if (start === -1) return raw.trim();

  let depth = 0;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1).trim();
      }
    }
  }
  return raw.slice(start).trim();
};

const toCanonicalTree = (input: unknown): { title: string; children: unknown[] } => {
  if (!input || typeof input !== 'object') {
    throw new Error('Model output is not an object');
  }

  const obj = input as Record<string, unknown>;
  const titleRaw = obj.title ?? obj.root ?? obj.topic ?? obj.name;
  const title = typeof titleRaw === 'string' ? titleRaw : '';
  if (!title.trim()) {
    throw new Error('Model output missing root title');
  }

  const childrenRaw =
    obj.children ??
    obj.nodes ??
    obj.items ??
    obj.subtopics ??
    obj.branches ??
    [];

  const children = Array.isArray(childrenRaw) ? childrenRaw : [];

  return { title: title.trim(), children };
};

const normalizeNodeFromUnknown = (raw: unknown, idPrefix: string): TreeNode | null => {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;
  const labelRaw = obj.text ?? obj.title ?? obj.name ?? obj.label ?? obj.topic;
  const text = typeof labelRaw === 'string' ? labelRaw.trim() : '';
  if (!text) return null;

  const childrenRaw =
    obj.children ??
    obj.nodes ??
    obj.items ??
    obj.subtopics ??
    obj.branches ??
    [];

  const normalizedChildren = Array.isArray(childrenRaw)
    ? childrenRaw
        .map((child, index) => normalizeNodeFromUnknown(child, `${idPrefix}-${index + 1}`))
        .filter((v): v is TreeNode => Boolean(v))
    : [];

  return {
    id: idPrefix,
    text: text.slice(0, 120),
    children: normalizedChildren,
  };
};

const normalizeNode = (text: string, children: unknown, idPrefix: string): TreeNode => {
  const normalizedChildren = Array.isArray(children)
    ? children
        .map((child, index) => {
          if (!child || typeof child !== 'object') {
            return null;
          }
          const next = child as Record<string, unknown>;
          const childText = typeof next.text === 'string' ? next.text : '';
          const childChildren = Array.isArray(next.children) ? next.children : [];
          if (!childText.trim()) {
            return null;
          }
          return normalizeNode(childText.trim(), childChildren, `${idPrefix}-${index + 1}`);
        })
        .filter((v): v is TreeNode => Boolean(v))
    : [];

  return {
    id: idPrefix,
    text: text.slice(0, 120),
    children: normalizedChildren,
  };
};

export const normalizeGeneratedTree = (rawModelOutput: string): TreeNode => {
  const jsonCandidate = extractJsonCandidate(rawModelOutput);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    throw new Error('Model output is not valid JSON');
  }

  const canonical = toCanonicalTree(parsed);
  const result = generatedSchema.safeParse(canonical);
  if (!result.success) {
    // Fallback parser for looser model shapes.
    const fallbackRoot = normalizeNodeFromUnknown(parsed, 'root');
    if (!fallbackRoot) {
      throw new Error('Model output does not match required tree schema');
    }
    const fallbackCheck = nodeSchema.safeParse(fallbackRoot);
    if (!fallbackCheck.success) {
      throw new Error('Normalized tree failed validation');
    }
    return fallbackRoot;
  }

  const root = normalizeNode(result.data.title, result.data.children, 'root');
  const finalCheck = nodeSchema.safeParse(root);
  if (!finalCheck.success) {
    throw new Error('Normalized tree failed validation');
  }
  return root;
};
