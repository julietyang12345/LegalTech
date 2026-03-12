import { z } from 'zod';
import type { TreeNode, TreeNodeProperties } from '../types.js';

const nodePropertiesSchema: z.ZodType<TreeNodeProperties> = z.object({
  status: z.enum(['backlog', 'active', 'done', 'blocked']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  owner: z.string().trim().min(1).max(80).optional(),
  source: z.string().trim().min(1).max(120).optional(),
  confidence: z.number().min(0).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

const nodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    summary: z.string().trim().min(1).optional(),
    properties: nodePropertiesSchema.optional(),
    children: z.array(nodeSchema),
  }),
);

const generatedSchema = z.object({
  title: z.string().min(1),
  children: z.array(
    z.object({
      text: z.string().min(1),
      summary: z.string().min(1).optional(),
      children: z.array(z.any()).optional(),
    }),
  ),
});

const PROCESS_ARROW_REGEX = /\s*(?:->|→|=>|➡|➜|⟶)\s*/g;

const splitProcessChain = (value: string): string[] =>
  value
    .split(PROCESS_ARROW_REGEX)
    .map((part) => part.trim())
    .filter(Boolean);

const normalizeNodeProperties = (
  raw: unknown,
  fallbackTimestamp: string,
): TreeNodeProperties | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;

  const parsed = nodePropertiesSchema.safeParse(raw);
  if (!parsed.success) return undefined;

  const next: TreeNodeProperties = { ...parsed.data };
  next.tags = Array.isArray(next.tags)
    ? Array.from(new Set(next.tags.map((tag) => tag.trim()).filter(Boolean)))
    : undefined;
  next.createdAt = next.createdAt ?? fallbackTimestamp;
  next.updatedAt = next.updatedAt ?? fallbackTimestamp;
  return next;
};

const toProcessChainNode = (parts: string[], idPrefix: string, timestamp: string): TreeNode => {
  const [head, ...rest] = parts;
  return {
    id: idPrefix,
    text: head || '',
    properties: {
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    children: rest.length > 0 ? [toProcessChainNode(rest, `${idPrefix}-1`, timestamp)] : [],
  };
};

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

const normalizeNodeFromUnknown = (
  raw: unknown,
  idPrefix: string,
  fallbackTimestamp: string,
): TreeNode | null => {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;
  const labelRaw = obj.text ?? obj.title ?? obj.name ?? obj.label ?? obj.topic;
  const text = typeof labelRaw === 'string' ? labelRaw.trim() : '';
  const summaryRaw = obj.summary;
  const summary = typeof summaryRaw === 'string' ? summaryRaw.trim() : '';
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
        .map((child, index) => normalizeNodeFromUnknown(child, `${idPrefix}-${index + 1}`, fallbackTimestamp))
        .filter((v): v is TreeNode => Boolean(v))
    : [];

  const properties = normalizeNodeProperties(obj.properties, fallbackTimestamp);

  if (normalizedChildren.length === 0) {
    const parts = splitProcessChain(text);
    if (parts.length > 1) {
      return toProcessChainNode(parts, idPrefix, properties?.createdAt ?? fallbackTimestamp);
    }
  }

  return {
    id: idPrefix,
    text,
    ...(summary ? { summary } : {}),
    properties,
    children: normalizedChildren,
  };
};

const normalizeNode = (
  text: string,
  children: unknown,
  idPrefix: string,
  fallbackTimestamp: string,
  summary?: string,
  properties?: TreeNodeProperties,
): TreeNode => {
  const normalizedChildren = Array.isArray(children)
    ? children
        .map((child, index) => {
          if (!child || typeof child !== 'object') {
            return null;
          }
          const next = child as Record<string, unknown>;
          const childText = typeof next.text === 'string' ? next.text : '';
          const childSummary = typeof next.summary === 'string' ? next.summary.trim() : undefined;
          const childChildren = Array.isArray(next.children) ? next.children : [];
          const childProperties = normalizeNodeProperties(next.properties, fallbackTimestamp);
          if (!childText.trim()) {
            return null;
          }
          return normalizeNode(
            childText.trim(),
            childChildren,
            `${idPrefix}-${index + 1}`,
            fallbackTimestamp,
            childSummary,
            childProperties,
          );
        })
        .filter((v): v is TreeNode => Boolean(v))
    : [];

  if (normalizedChildren.length === 0) {
    const parts = splitProcessChain(text);
    if (parts.length > 1) {
      return toProcessChainNode(parts, idPrefix, properties?.createdAt ?? fallbackTimestamp);
    }
  }

  return {
    id: idPrefix,
    text,
    ...(summary?.trim() ? { summary: summary.trim() } : {}),
    properties: properties ?? {
      createdAt: fallbackTimestamp,
      updatedAt: fallbackTimestamp,
    },
    children: normalizedChildren,
  };
};

export const normalizeGeneratedTree = (rawModelOutput: string): TreeNode => {
  const fallbackTimestamp = new Date().toISOString();
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
    const fallbackRoot = normalizeNodeFromUnknown(parsed, 'root', fallbackTimestamp);
    if (!fallbackRoot) {
      throw new Error('Model output does not match required tree schema');
    }
    const fallbackCheck = nodeSchema.safeParse(fallbackRoot);
    if (!fallbackCheck.success) {
      throw new Error('Normalized tree failed validation');
    }
    return fallbackRoot;
  }

  const root = normalizeNode(result.data.title, result.data.children, 'root', fallbackTimestamp);
  const finalCheck = nodeSchema.safeParse(root);
  if (!finalCheck.success) {
    throw new Error('Normalized tree failed validation');
  }
  return root;
};

export const normalizePatchedTree = (tree: TreeNode): TreeNode => {
  const fallbackTimestamp = new Date().toISOString();
  const stampNode = (node: TreeNode): TreeNode => ({
    ...node,
    properties: normalizeNodeProperties(node.properties, fallbackTimestamp) ?? {
      createdAt: fallbackTimestamp,
      updatedAt: fallbackTimestamp,
    },
    children: node.children.map(stampNode),
  });

  const result = nodeSchema.safeParse(stampNode(tree));
  if (!result.success) {
    throw new Error('Patched tree failed validation');
  }
  return result.data;
};
