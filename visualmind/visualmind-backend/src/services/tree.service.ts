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
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawModelOutput);
  } catch {
    throw new Error('Model output is not valid JSON');
  }

  const result = generatedSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('Model output does not match required tree schema');
  }

  const root = normalizeNode(result.data.title, result.data.children, 'root');
  const finalCheck = nodeSchema.safeParse(root);
  if (!finalCheck.success) {
    throw new Error('Normalized tree failed validation');
  }
  return root;
};
