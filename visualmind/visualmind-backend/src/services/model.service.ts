import { z } from 'zod';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from '../config.js';
import type { TreeNode, UserPlan } from '../types.js';
import { normalizeGeneratedTree } from './tree.service.js';

const ollamaResponseSchema = z.object({
  response: z.string(),
});

const openAiChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable(),
      }),
    }),
  ),
});

const openAiUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});

type StructuredOutputSchema<T> = {
  name: string;
  schema: Record<string, unknown>;
  validator: z.ZodType<T>;
};

export type GenerationUsageSummary = {
  openAiPromptTokens: number;
  openAiCompletionTokens: number;
  openAiTotalTokens: number;
  openAiCostUsd: number;
};

const MAX_INPUT_CHARS = 8000;
const MAX_SLIDES = 12;
const MAX_FLASHCARDS = 24;
const MAX_MINDMAP_INPUT_CHARS = 120000;
const MINDMAP_FINAL_MERGE_TOKENS = 1800;
const MINDMAP_REGROUP_TOKENS = 500;
const MAX_REGROUP_CALLS = 3;
const STAGE1_MODEL_NAME = config.modelName;
const STAGE2_MODEL_NAME = config.modelName;
const SEMANTIC_MODEL_NAME = config.modelNameSemantic;
const STAGE2_FALLBACK_MODEL_NAME = config.modelName;
const STAGE2_PRO_MODEL_NAME = config.openAiModelPro;
const OPENAI_MODEL_PREFIXES = ['gpt-', 'o1', 'o3', 'o4'];
const usageStorage = new AsyncLocalStorage<GenerationUsageSummary>();

const emptyUsageSummary = (): GenerationUsageSummary => ({
  openAiPromptTokens: 0,
  openAiCompletionTokens: 0,
  openAiTotalTokens: 0,
  openAiCostUsd: 0,
});

const roundUsd = (value: number): number => Math.round(value * 100000000000) / 100000000000;
const formatUsd = (value: number): string => roundUsd(value).toFixed(11);

const calculateOpenAiCostUsd = (promptTokens: number, completionTokens: number): number => {
  const inputCost = (promptTokens / 1_000_000) * config.openAiInputCostPer1M;
  const outputCost = (completionTokens / 1_000_000) * config.openAiOutputCostPer1M;
  return roundUsd(inputCost + outputCost);
};

const usageLogDetails = (usage: z.infer<typeof openAiUsageSchema> | null): Record<string, number | string | null> => ({
  promptTokens: usage?.prompt_tokens ?? null,
  completionTokens: usage?.completion_tokens ?? null,
  totalTokens: usage?.total_tokens ?? null,
  costUsd: usage ? formatUsd(calculateOpenAiCostUsd(usage.prompt_tokens, usage.completion_tokens)) : null,
});

const recordOpenAiUsage = (usage: z.infer<typeof openAiUsageSchema> | null): void => {
  if (!usage) return;
  const summary = usageStorage.getStore();
  if (!summary) return;

  summary.openAiPromptTokens += usage.prompt_tokens;
  summary.openAiCompletionTokens += usage.completion_tokens;
  summary.openAiTotalTokens += usage.total_tokens;
  summary.openAiCostUsd = roundUsd(
    summary.openAiCostUsd + calculateOpenAiCostUsd(usage.prompt_tokens, usage.completion_tokens),
  );
};

const extractOpenAiUsage = (payload: unknown): z.infer<typeof openAiUsageSchema> | null => {
  const usage = typeof payload === 'object' && payload !== null ? (payload as { usage?: unknown }).usage : undefined;
  const parsed = openAiUsageSchema.safeParse(usage);
  return parsed.success ? parsed.data : null;
};

export const runWithGenerationUsageTracking = async <T>(
  work: () => Promise<T>,
): Promise<{ result: T; usage: GenerationUsageSummary }> => {
  const initial = emptyUsageSummary();
  return usageStorage.run(initial, async () => {
    const result = await work();
    return {
      result,
      usage: { ...initial },
    };
  });
};

const FLOW_ARROW_REGEX = /\s*(?:↓|->|→|=>|➡|➜|⟶)\s*/g;
const FLOW_ARROW_TEST_REGEX = /(?:↓|->|→|=>|➡|➜|⟶)/;

const normalizeLines = (inputText: string): string => {
  return inputText
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
};


const countWords = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

const cloneTree = (node: TreeNode): TreeNode => ({
  ...node,
  children: node.children.map(cloneTree),
});

const cloneNodeWithChildren = (node: TreeNode, children: TreeNode[]): TreeNode => ({
  ...node,
  children,
});

const cleanDisplayLabel = (text: string): string =>
  text
    .replace(/^[\s:：\-–—]+|[\s:：\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const labelKey = (text: string): string =>
  cleanDisplayLabel(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const labelsEquivalent = (left: string, right: string): boolean => {
  const leftKey = labelKey(left);
  const rightKey = labelKey(right);
  return Boolean(leftKey) && leftKey === rightKey;
};

const isSyntheticSummary = (summary?: string): boolean => {
  const value = summary?.trim();
  if (!value) return false;

  const normalized = value.toLowerCase();
  return (
    normalized.startsWith('groups related items under ') ||
    normalized.startsWith('clarifies how ')
  );
};

const mergeNodePair = (base: TreeNode, incoming: TreeNode): TreeNode => {
  const mergedSummary =
    base.summary?.trim() && !isSyntheticSummary(base.summary)
      ? base.summary.trim()
      : incoming.summary?.trim() && !isSyntheticSummary(incoming.summary)
        ? incoming.summary.trim()
        : undefined;

  const merged: TreeNode = {
    ...base,
    children: [...base.children, ...incoming.children],
  };
  if (mergedSummary) {
    merged.summary = mergedSummary;
  } else {
    delete merged.summary;
  }
  return merged;
};

const dedupeSiblingLabels = (tree: TreeNode): TreeNode => {
  const visit = (node: TreeNode): TreeNode => {
    const deduped = new Map<string, TreeNode>();

    for (const child of node.children.map(visit)) {
      const key = labelKey(child.text);
      if (!key) continue;
      const existing = deduped.get(key);
      deduped.set(key, existing ? mergeNodePair(existing, child) : child);
    }

    return { ...node, children: Array.from(deduped.values()) };
  };

  return visit(tree);
};

const collapseRedundantBranches = (tree: TreeNode, isRoot = true): TreeNode => {
  const collapsedChildren = tree.children.map((child) => collapseRedundantBranches(child, false));
  const next = cloneNodeWithChildren(tree, collapsedChildren);

  if (isRoot || next.children.length !== 1 || next.summary?.trim()) {
    return next;
  }

  const onlyChild = next.children[0];
  if (!labelsEquivalent(next.text, onlyChild.text)) {
    return next;
  }

  return {
    ...onlyChild,
    id: next.id,
    properties: next.properties ?? onlyChild.properties,
  };
};

const finalizeTree = (node: TreeNode): TreeNode => {
  const seen = new Set<string>();
  const children: TreeNode[] = [];

  for (const child of node.children) {
    const next = finalizeTree(child);
    const key = labelKey(next.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    children.push(next);
  }

  return {
    ...(() => {
      const finalized: TreeNode = { ...node, children };
      if (node.summary?.trim() && !isSyntheticSummary(node.summary) && !labelsEquivalent(node.text, node.summary)) {
        finalized.summary = node.summary.trim();
      } else {
        delete finalized.summary;
      }
      return finalized;
    })(),
  };
};


const buildTreeSynthesisPrompt = (text: string): string =>
  [
    'Create a mind map from the following text.',
    'Return only valid JSON:',
    '{"title":"root topic","children":[{"text":"short node title","summary":"fuller meaning or null","children":[{"text":"subnode","summary":"fuller meaning or null","children":[]}]}]}',
    'Rules:',
    '- Prioritize structural quality and correct thematic grouping over maximum compression, while still keeping labels and summaries concise.',
    '- Build a theme-first, detail-later tree directly from the source text.',
    '- Choose 3 to 8 top-level themes when the source supports them. Do not compress a clearly multi-part source into a few umbrella buckets.',
    '- Root children must be parallel thematic summary branches drawn from the source, such as problems, features, audiences, use cases, integrations, technical considerations, business considerations, constraints, workflow, or outcomes.',
    '- Avoid one giant umbrella branch; split clearly distinct source themes.',
    '- Avoid generic top-level labels unless they are truly central to the source.',
    '- First classify the content into distinct themes, then place details under the right theme.',
    '- Identify the author main point, then organize supporting details beneath it.',
    '- Keep each parent role-pure: a parent should represent one coherent theme, and its children should stay at a similar abstraction level.',
    '- Non-leaf parent nodes must represent one coherent theme shared by their children.',
    '- If a branch mixes roles, add an intermediate split before the leaves. Example: "Use Cases and Audiences" should usually split into "Audiences" and "Use Cases". Audience leaves should be people/groups; use-case leaves should be tasks, scenarios, or outcomes.',
    '- For technical or business content, prefer grouped subthemes like "Integrations", "Development", "Architecture", "Differentiation", "Cost", or "Constraints" before listing concrete items. Do not flatten mixed technical concerns into one sibling list when they can be grouped cleanly.',
    '- Only add an intermediate node when it groups multiple related children under a meaningful theme. Do not create redundant single-child wrappers.',
    '- When introducing an intermediate node, classify its children into one clean theme instead of a mixed bucket.',
    '- Parent-child relationships must reflect meaning, not keyword overlap. Do not group by shared words alone. Make a node the parent when its children explain it, support it, exemplify it, provide inputs/outputs, or describe consequences.',
    '- Preserve the source logic when present, including claims, evidence, examples, workflows, solutions, implications, and constraints.',
    '- Keep labels concise and source-native at every level. Prefer compact meaningful phrases over generic category language or isolated keyword fragments.',
    '- Avoid duplicates: sibling labels must be unique, root and direct child labels must not repeat the same concept, and parent-child label duplication should be collapsed.',
    '- Sibling nodes at the same level should stay at a similar abstraction level.',
    '- Prefer the simplest structure that still preserves clear thematic classification.',
    '- Deepest child nodes may be loosely summarized, but each should still convey its meaning clearly in one short understandable phrase.',
    '- Distinguish between the point being made and the example used to explain it.',
    '- Use summary only when a higher-level label needs clarification. Most concrete leaves and examples should have summary set to null.',
    '',
    `Text:\n${text}`,
  ].join('\n');
const buildMindMapDirectly = async (text: string, plan: UserPlan): Promise<TreeNode> => {
  const rawTree = await runStage2Prompt(
    buildTreeSynthesisPrompt(text),
    MINDMAP_FINAL_MERGE_TOKENS,
    plan,
    treeJsonSchema,
  );

  return normalizeGeneratedTree(typeof rawTree === 'string' ? rawTree : JSON.stringify(rawTree));
};

const regroupSchema = z.object({
  groups: z.array(
    z.object({
      text: z.string().min(1).max(80),
      summary: z.string().min(1).max(220).nullable(),
      childIds: z.array(z.string().min(1).max(80)).min(1),
    }),
  ).min(2).max(4),
});

const buildRegroupPrompt = (
  parent: string,
  childDescriptors: Array<{ id: string; text: string; summary?: string }>,
): string =>
  [
    'Classify the following child nodes into clearer thematic summary groups.',
    'Return only valid JSON with this exact schema:',
    '{"groups":[{"text":"summary label","summary":"optional short explanation","childIds":["c1","c2"]}]}',
    'Rules:',
    '- create 2 to 4 summary groups',
    '- summary labels must be concise noun phrases',
    '- use the optional summary field when it helps preserve meaning while keeping the text label short',
    '- use the provided childIds exactly; do not rename or paraphrase them',
    '- first classify children by theme, then group them under thematic summary labels',
    '- create intermediate summary nodes when several children belong to the same theme',
    '- only leave a child effectively ungrouped when it is already the most detailed useful node',
    '- group by theme and meaning, not just shared words',
    '- do not invent factual content that is not implied by the children',
    '- every listed childId must come from the provided list',
    '- avoid singleton groups unless the child is structurally distinct and truly deserves its own branch',
    '- do not add a group if its label would just repeat the parent or a single child label',
    '- do not combine distinct roles like problem, feature, audience, use case, integration, constraint, or business concern into one mixed group unless the children clearly express the same role',
    '',
    `Parent: ${parent}`,
    `Children: ${JSON.stringify(childDescriptors)}`,
  ].join('\n');

const buildParentClassificationPrompt = (
  parent: string,
  childDescriptors: Array<{ id: string; text: string; summary?: string; childLabels: string[] }>,
): string =>
  [
    'Improve the intermediate category structure of this mind map.',
    'Return only valid JSON with this exact schema:',
    '{"groups":[{"text":"category label","summary":"short clarification or null","childIds":["p1","p2"]}]}',
    'Rules:',
    '- group only by clean semantic category',
    '- each category must represent one coherent role or concept',
    '- do not mix use cases with integrations, or business concerns with technical constraints, unless the source explicitly unifies them',
    '- prefer short category labels',
    '- use summary only when the category title would otherwise be ambiguous; otherwise use null',
    '- if children belong to different roles, split them into separate categories instead of using a catch-all label',
    '- use the provided childIds exactly',
    '',
    `Parent: ${parent}`,
    `Children: ${JSON.stringify(childDescriptors)}`,
  ].join('\n');

const averageLabelWords = (nodes: TreeNode[]): number =>
  nodes.reduce((sum, node) => sum + countWords(cleanDisplayLabel(node.text)), 0) / Math.max(nodes.length, 1);

const hasMixedDepth = (nodes: TreeNode[]): boolean =>
  new Set(nodes.map((child) => (child.children.length === 0 ? 'leaf' : 'branch'))).size > 1;

const hasMixedAbstraction = (nodes: TreeNode[]): boolean => {
  const summaryLikeCount = nodes.filter((child) => countWords(cleanDisplayLabel(child.text)) <= 3 && !child.summary).length;
  const detailLikeCount = nodes.filter(
    (child) => countWords(cleanDisplayLabel(child.text)) >= 4 || Boolean(child.summary?.trim()),
  ).length;
  return summaryLikeCount > 0 && detailLikeCount > 0;
};

const shouldRegroupNode = (node: TreeNode): boolean => {
  if (node.children.length < 4) return false;

  const leafCount = node.children.filter((child) => child.children.length === 0).length;
  const leafRatio = leafCount / node.children.length;
  const avgWords = averageLabelWords(node.children);
  const mixedDepth = hasMixedDepth(node.children);
  const mixedAbstraction = hasMixedAbstraction(node.children);

  return (
    node.children.length >= 6 ||
    leafRatio >= 0.6 ||
    mixedDepth ||
    mixedAbstraction ||
    avgWords >= 4
  );
};

const shouldRegroupRoot = (node: TreeNode): boolean => {
  if (node.children.length <= 6) return false;

  const avgWords = averageLabelWords(node.children);
  return node.children.length >= 7 || avgWords >= 4 || hasMixedDepth(node.children) || hasMixedAbstraction(node.children);
};

const shouldReclassifyParentLayer = (node: TreeNode): boolean => {
  if (node.children.length < 4) return false;
  const branchChildren = node.children.filter((child) => child.children.length > 0).length;
  const avgWords = averageLabelWords(node.children);
  return branchChildren >= 2 && (hasMixedDepth(node.children) || hasMixedAbstraction(node.children) || avgWords >= 3.5);
};

const shouldKeepSingletonGroup = (
  groupLabel: string,
  child: TreeNode,
  totalGroups: number,
): boolean => {
  const groupKey = cleanDisplayLabel(groupLabel).toLowerCase();
  const childKey = cleanDisplayLabel(child.text).toLowerCase();
  if (!groupKey || groupKey === childKey) return false;
  return totalGroups >= 3;
};

const regroupNodeChildren = async (node: TreeNode): Promise<TreeNode> => {
  const originalChildren = node.children;
  const childDescriptors = originalChildren.map((child, index) => ({
    id: `c${index + 1}`,
    text: child.text,
    ...(child.summary?.trim() ? { summary: child.summary.trim() } : {}),
  }));
  const childIdMap = new Map(childDescriptors.map((descriptor, index) => [descriptor.id, originalChildren[index]]));

  const grouped = await runSemanticPrompt(
    buildRegroupPrompt(node.text, childDescriptors),
    MINDMAP_REGROUP_TOKENS,
    {
      name: 'mind_map_regroup',
      validator: regroupSchema,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          groups: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                text: { type: 'string', minLength: 1, maxLength: 80 },
                summary: {
                  anyOf: [{ type: 'string', minLength: 1, maxLength: 220 }, { type: 'null' }],
                },
                childIds: {
                  type: 'array',
                  minItems: 1,
                  items: { type: 'string', minLength: 1, maxLength: 80 },
                },
              },
              required: ['text', 'summary', 'childIds'],
            },
          },
        },
        required: ['groups'],
      },
    },
  );

  const parsed = regroupSchema.safeParse(grouped);
  if (!parsed.success) return node;

  const usedIds = new Set<string>();
  const regroupedChildren: TreeNode[] = [];

  for (const [index, group] of parsed.data.groups.entries()) {
    const matchedChildren: TreeNode[] = [];

    for (const childId of group.childIds) {
      const matched = childIdMap.get(childId);
      if (!matched || usedIds.has(childId)) continue;
      usedIds.add(childId);
      matchedChildren.push(matched);
    }

    if (matchedChildren.length === 0) continue;

    if (matchedChildren.length === 1) {
      if (shouldKeepSingletonGroup(group.text, matchedChildren[0], parsed.data.groups.length)) {
        regroupedChildren.push({
          id: `${node.id}-g${index + 1}`,
          text: cleanDisplayLabel(group.text) || `Group ${index + 1}`,
          ...(group.summary?.trim() ? { summary: group.summary.trim() } : {}),
          properties: {
            createdAt: node.properties?.createdAt,
            updatedAt: node.properties?.updatedAt ?? new Date().toISOString(),
          },
          children: matchedChildren,
        });
      } else {
        regroupedChildren.push(matchedChildren[0]);
      }
      continue;
    }

    regroupedChildren.push({
      id: `${node.id}-g${index + 1}`,
      text: cleanDisplayLabel(group.text) || `Group ${index + 1}`,
      ...(group.summary?.trim() ? { summary: group.summary.trim() } : {}),
      properties: {
        createdAt: node.properties?.createdAt,
        updatedAt: node.properties?.updatedAt ?? new Date().toISOString(),
      },
      children: matchedChildren,
    });
  }

  for (const descriptor of childDescriptors) {
    if (!usedIds.has(descriptor.id)) {
      const child = childIdMap.get(descriptor.id);
      if (child) regroupedChildren.push(child);
    }
  }

  return regroupedChildren.length >= 2 ? cloneNodeWithChildren(node, regroupedChildren) : node;
};

const reclassifyParentLayer = async (node: TreeNode): Promise<TreeNode> => {
  const originalChildren = node.children;
  const childDescriptors = originalChildren.map((child, index) => ({
    id: `p${index + 1}`,
    text: child.text,
    ...(child.summary?.trim() ? { summary: child.summary.trim() } : {}),
    childLabels: child.children.slice(0, 8).map((grandchild) => grandchild.text),
  }));
  const childIdMap = new Map(childDescriptors.map((descriptor, index) => [descriptor.id, originalChildren[index]]));

  const grouped = await runSemanticPrompt(
    buildParentClassificationPrompt(node.text, childDescriptors),
    MINDMAP_REGROUP_TOKENS,
    {
      name: 'mind_map_parent_classification',
      validator: regroupSchema,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          groups: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                text: { type: 'string', minLength: 1, maxLength: 80 },
                summary: {
                  anyOf: [{ type: 'string', minLength: 1, maxLength: 220 }, { type: 'null' }],
                },
                childIds: {
                  type: 'array',
                  minItems: 1,
                  items: { type: 'string', minLength: 1, maxLength: 80 },
                },
              },
              required: ['text', 'summary', 'childIds'],
            },
          },
        },
        required: ['groups'],
      },
    },
  );

  const parsed = regroupSchema.safeParse(grouped);
  if (!parsed.success) return node;

  const usedIds = new Set<string>();
  const regroupedChildren: TreeNode[] = [];

  for (const [index, group] of parsed.data.groups.entries()) {
    const matchedChildren: TreeNode[] = [];

    for (const childId of group.childIds) {
      const matched = childIdMap.get(childId);
      if (!matched || usedIds.has(childId)) continue;
      usedIds.add(childId);
      matchedChildren.push(matched);
    }

    if (matchedChildren.length === 0) continue;
    if (matchedChildren.length === 1) {
      regroupedChildren.push(matchedChildren[0]);
      continue;
    }

    regroupedChildren.push({
      id: `${node.id}-c${index + 1}`,
      text: cleanDisplayLabel(group.text) || `Category ${index + 1}`,
      ...(group.summary?.trim() ? { summary: group.summary.trim() } : {}),
      properties: {
        createdAt: node.properties?.createdAt,
        updatedAt: node.properties?.updatedAt ?? new Date().toISOString(),
      },
      children: matchedChildren,
    });
  }

  for (const descriptor of childDescriptors) {
    if (!usedIds.has(descriptor.id)) {
      const child = childIdMap.get(descriptor.id);
      if (child) regroupedChildren.push(child);
    }
  }

  return regroupedChildren.length >= 2 ? cloneNodeWithChildren(node, regroupedChildren) : node;
};

const shapeTreeForMindMap = async (tree: TreeNode): Promise<TreeNode> => {
  let next = cloneTree(tree);
  next = removeDuplicateRootChild(next);
  next = dedupeSiblingLabels(next);
  let shapingCalls = 0;

  const shapeNode = async (node: TreeNode, isRoot = false): Promise<TreeNode> => {
    const shapedChildren = await Promise.all(node.children.map((child) => shapeNode(child, false)));
    let nextNode = cloneNodeWithChildren(node, shapedChildren);

    if (shapingCalls < MAX_REGROUP_CALLS && (isRoot ? shouldReclassifyParentLayer(nextNode) : shouldReclassifyParentLayer(nextNode))) {
      shapingCalls += 1;
      try {
        nextNode = await reclassifyParentLayer(nextNode);
      } catch (error) {
        console.warn('[VisualMind] mindmap:reclassify:failed', {
          node: nextNode.text,
          message: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    if (shapingCalls < MAX_REGROUP_CALLS && (isRoot ? shouldRegroupRoot(nextNode) : shouldRegroupNode(nextNode))) {
      shapingCalls += 1;
      try {
        nextNode = await regroupNodeChildren(nextNode);
      } catch (error) {
        console.warn('[VisualMind] mindmap:regroup:failed', {
          node: nextNode.text,
          message: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    return nextNode;
  };

  next = await shapeNode(next, true);
  next = removeDuplicateRootChild(next);
  next = dedupeSiblingLabels(next);
  next = collapseRedundantBranches(next);
  next = finalizeTree(next);
  return next;
};

const removeDuplicateRootChild = (tree: TreeNode): TreeNode => {
  const rootText = cleanDisplayLabel(tree.text).toLowerCase();
  if (!rootText) return tree;

  return {
    ...tree,
    children: tree.children.filter((child) => cleanDisplayLabel(child.text).toLowerCase() !== rootText),
  };
};

const treeJsonSchema: StructuredOutputSchema<unknown> = {
  name: 'mind_map_tree',
  validator: z.unknown(),
  schema: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      children: {
        type: 'array',
        items: { $ref: '#/$defs/node' },
      },
    },
    required: ['title', 'children'],
    $defs: {
      node: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          summary: {
            anyOf: [
              { type: 'string' },
              { type: 'null' },
            ],
          },
          children: {
            type: 'array',
            items: { $ref: '#/$defs/node' },
          },
        },
        required: ['text', 'summary', 'children'],
      },
    },
  },
};


const buildSlidesPrompt = (inputText: string, slideCount: number): string => {
  const clippedInput = inputText.slice(0, MAX_INPUT_CHARS);
  const safeCount = Math.min(Math.max(slideCount, 6), 8);
  return [
    'You are an expert presentation designer.',
    `Turn source content into a polished slide deck with exactly ${safeCount} slides.`,
    'Return ONLY valid JSON with this exact schema:',
    '{"title":"string","theme":"string","slides":[{"title":"string","subtitle":"string","layout":"title|title-bullets|two-column|quote|timeline|summary","bullets":["string"],"speakerNotes":"string","visualIdea":"string"}]}',
    'Rules:',
    '- each slide has a clear role',
    '- avoid repeated bullets across slides',
    '- bullets must be concise and specific',
    '- speakerNotes explain what to say',
    '- visualIdea describes chart/diagram/illustration/image concept',
    '- no markdown, no explanation, no code fences',
    '- output JSON only',
    '',
    `Input:\n${clippedInput}`,
  ].join('\n');
};

const buildFlashcardsPrompt = (inputText: string, cardCount: number): string => {
  const clippedInput = inputText.slice(0, MAX_INPUT_CHARS);
  const safeCount = Math.min(Math.max(cardCount, 6), MAX_FLASHCARDS);
  return [
    `Convert input text into exactly ${safeCount} study flashcards.`,
    'Output strictly valid JSON with this exact schema:',
    '{"title":"topic","cards":[{"front":"question or term","back":"answer or explanation","hint":"short hint","difficulty":"easy|medium|hard"}]}',
    'Rules:',
    '- front and back must be short and clear',
    '- include difficulty for each card',
    '- include hint for at least half the cards',
    '- avoid duplicates',
    '- no markdown, no explanation, no code fences',
    '- output JSON only',
    '',
    `Input:\n${clippedInput}`,
  ].join('\n');
};

type PromptProvider = 'ollama' | 'openai';

const isOpenAiModel = (modelName: string): boolean => {
  const normalized = modelName.trim().toLowerCase();
  return OPENAI_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

const resolvePromptProvider = (
  modelName: string,
  provider?: PromptProvider,
): PromptProvider => {
  if (provider) return provider;
  return isOpenAiModel(modelName) ? 'openai' : 'ollama';
};

const canUseModel = (modelName: string): boolean =>
  !isOpenAiModel(modelName) || Boolean(config.openAiApiKey);

const shouldUseStructuredOpenAi = (modelName: string): boolean =>
  isOpenAiModel(modelName) && Boolean(config.openAiApiKey);

const parseOpenAiMessageContent = (payload: unknown): string => {
  const parsed = openAiChatResponseSchema.safeParse(payload);
  if (!parsed.success) {
    console.error('[VisualMind] model:request:bad-payload', { provider: 'openai', payload });
    throw new Error('OpenAI returned unexpected payload');
  }

  const content = parsed.data.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI returned empty content');
  }
  return content;
};

const runOpenAiStructuredPrompt = async <T>(
  prompt: string,
  maxTokens: number,
  modelName: string,
  structuredSchema: StructuredOutputSchema<T>,
): Promise<T> => {
  if (!config.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured for structured OpenAI requests');
  }

  const controller = new AbortController();
  const timeout =
    config.modelTimeoutMs > 0 ? setTimeout(() => controller.abort(), config.modelTimeoutMs) : null;

  try {
    console.log('[VisualMind] model:structured-request:start', {
      provider: 'openai',
      model: modelName,
      schema: structuredSchema.name,
      promptChars: prompt.length,
      maxTokens,
    });

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: maxTokens,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: structuredSchema.name,
              strict: true,
              schema: structuredSchema.schema,
            },
          },
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error('[VisualMind] model:structured-request:non-200', {
          provider: 'openai',
          status: resp.status,
          schema: structuredSchema.name,
          bodyPreview: text.slice(0, 300),
        });
        throw new Error(`OpenAI request failed (${resp.status}): ${text}`);
      }

      const data = await resp.json();
      const usage = extractOpenAiUsage(data);
      recordOpenAiUsage(usage);
      const content = parseOpenAiMessageContent(data);

      try {
        const parsedJson = JSON.parse(extractJsonCandidate(content));
        const result = structuredSchema.validator.safeParse(parsedJson);
        if (!result.success) {
          console.error('[VisualMind] model:structured-request:validation-failed', {
            schema: structuredSchema.name,
            attempt,
            issues: result.error.issues,
          });
          throw new Error(`Structured output validation failed for ${structuredSchema.name}`);
        }

        console.log('[VisualMind] model:structured-request:success', {
          provider: 'openai',
          model: modelName,
          schema: structuredSchema.name,
          attempt,
          ...usageLogDetails(usage),
        });
        return result.data;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown parse error';
        console.warn('[VisualMind] model:structured-request:parse-or-validate-retry', {
          provider: 'openai',
          model: modelName,
          schema: structuredSchema.name,
          attempt,
          message,
          contentPreview: content.slice(0, 300),
        });
        if (attempt === 2) {
          throw error;
        }
      }
    }

    throw new Error(`Structured output retry exhausted for ${structuredSchema.name}`);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Model request timed out after ${config.modelTimeoutMs}ms. Try again in a moment (model may be cold/overloaded).`,
      );
    }
    console.error('[VisualMind] model:structured-request:failed', {
      provider: 'openai',
      model: modelName,
      schema: structuredSchema.name,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const runPrompt = async (
  prompt: string,
  maxTokens: number,
  modelName: string = STAGE2_MODEL_NAME,
  provider?: PromptProvider,
): Promise<string> => {
  const resolvedProvider = resolvePromptProvider(modelName, provider);
  console.log('[VisualMind] model:request:start', {
    provider: resolvedProvider,
    model: modelName,
    modelApiBaseUrl: resolvedProvider === 'ollama' ? config.modelApiBaseUrl : undefined,
    promptChars: prompt.length,
    maxTokens,
  });

  const runOnce = async (): Promise<string> => {
    const controller = new AbortController();
    const timeout =
      config.modelTimeoutMs > 0 ? setTimeout(() => controller.abort(), config.modelTimeoutMs) : null;

    try {
      if (resolvedProvider === 'openai') {
        if (!config.openAiApiKey) {
          throw new Error('OPENAI_API_KEY is not configured for pro model access');
        }
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.openAiApiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const text = await resp.text();
          console.error('[VisualMind] model:request:non-200', {
            provider: resolvedProvider,
            status: resp.status,
            bodyPreview: text.slice(0, 300),
          });
          throw new Error(`OpenAI request failed (${resp.status}): ${text}`);
        }

        const data = await resp.json();
        const usage = extractOpenAiUsage(data);
        recordOpenAiUsage(usage);
        console.log('[VisualMind] model:request:openai-usage', {
          provider: resolvedProvider,
          model: modelName,
          ...usageLogDetails(usage),
        });
        return parseOpenAiMessageContent(data);
      }

      const resp = await fetch(`${config.modelApiBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt,
          stream: false,
          format: 'json',
          options: {
            temperature: 0.2,
            num_predict: maxTokens,
          },
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error('[VisualMind] model:request:non-200', {
          provider: resolvedProvider,
          status: resp.status,
          bodyPreview: text.slice(0, 300),
        });
        throw new Error(`Model server failed (${resp.status}): ${text}`);
      }

      const data = await resp.json();
      const parsed = ollamaResponseSchema.safeParse(data);
      if (!parsed.success) {
        console.error('[VisualMind] model:request:bad-payload', { provider: resolvedProvider, payload: data });
        throw new Error('Model server returned unexpected payload');
      }

      return parsed.data.response;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };

  try {
    const response = await runOnce();
    console.log('[VisualMind] model:request:success', {
      provider: resolvedProvider,
      responseChars: response.length,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (config.modelTimeoutMs > 0) {
        throw new Error(
          `Model request timed out after ${config.modelTimeoutMs}ms. Try again in a moment (model may be cold/overloaded).`,
        );
      }
      throw new Error('Model request was aborted.');
    }
    console.error('[VisualMind] model:request:failed', {
      provider: resolvedProvider,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

const isTimeoutError = (error: unknown): boolean =>
  error instanceof Error && /timed out/i.test(error.message);

const isOpenAiQuotaOrRateLimitError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('openai request failed (429)') ||
    message.includes('insufficient_quota') ||
    message.includes('too many requests')
  );
};

const runStage2Prompt = async <T = string>(
  prompt: string,
  maxTokens: number,
  plan: UserPlan = 'free',
  structuredSchema?: StructuredOutputSchema<T>,
): Promise<T | string> => {
  const shouldUseOpenAi = canUseModel(STAGE2_PRO_MODEL_NAME);
  if (!shouldUseOpenAi && isOpenAiModel(STAGE2_PRO_MODEL_NAME)) {
    console.warn('[VisualMind] stage2:openai-key-missing-fallback', {
      fallbackModel: STAGE2_MODEL_NAME,
    });
  }
  console.log('[VisualMind] stage2:provider-selected', {
    plan,
    provider: shouldUseOpenAi ? resolvePromptProvider(STAGE2_PRO_MODEL_NAME) : resolvePromptProvider(STAGE2_MODEL_NAME),
    model: shouldUseOpenAi ? STAGE2_PRO_MODEL_NAME : STAGE2_MODEL_NAME,
  });
  try {
    if (shouldUseOpenAi) {
      if (structuredSchema && shouldUseStructuredOpenAi(STAGE2_PRO_MODEL_NAME)) {
        return await runOpenAiStructuredPrompt(prompt, maxTokens, STAGE2_PRO_MODEL_NAME, structuredSchema);
      }
      return await runPrompt(prompt, maxTokens, STAGE2_PRO_MODEL_NAME);
    }
    return await runPrompt(prompt, maxTokens, STAGE2_MODEL_NAME);
  } catch (error) {
    if (shouldUseOpenAi) {
      if (isOpenAiQuotaOrRateLimitError(error)) {
        console.warn('[VisualMind] stage2:openai-rate-or-quota-fallback', {
          primaryModel: STAGE2_PRO_MODEL_NAME,
          fallbackModel: STAGE2_MODEL_NAME,
          reason: error instanceof Error ? error.message : 'unknown',
        });
        return runPrompt(prompt, maxTokens, STAGE2_MODEL_NAME);
      }
      throw error;
    }
    if (!isTimeoutError(error) || STAGE2_MODEL_NAME === STAGE2_FALLBACK_MODEL_NAME) {
      throw error;
    }
    console.warn('[VisualMind] stage2:fallback-on-timeout', {
      primaryModel: STAGE2_MODEL_NAME,
      fallbackModel: STAGE2_FALLBACK_MODEL_NAME,
    });
    return runPrompt(prompt, maxTokens, STAGE2_FALLBACK_MODEL_NAME);
  }
};

const runSemanticPrompt = async <T = string>(
  prompt: string,
  maxTokens: number,
  structuredSchema?: StructuredOutputSchema<T>,
): Promise<T | string> => {
  console.log('[VisualMind] semantic:provider-selected', {
    provider: resolvePromptProvider(SEMANTIC_MODEL_NAME),
    model: SEMANTIC_MODEL_NAME,
    structured: Boolean(structuredSchema),
    structuredOpenAi: Boolean(structuredSchema) && shouldUseStructuredOpenAi(SEMANTIC_MODEL_NAME),
    openAiKeyConfigured: Boolean(config.openAiApiKey),
    fallbackModel: STAGE1_MODEL_NAME,
  });
  if (!canUseModel(SEMANTIC_MODEL_NAME)) {
    console.warn('[VisualMind] semantic:key-missing-fallback', {
      primaryModel: SEMANTIC_MODEL_NAME,
      fallbackModel: STAGE1_MODEL_NAME,
    });
    return runPrompt(prompt, maxTokens, STAGE1_MODEL_NAME);
  }
  try {
    if (structuredSchema && shouldUseStructuredOpenAi(SEMANTIC_MODEL_NAME)) {
      return await runOpenAiStructuredPrompt(prompt, maxTokens, SEMANTIC_MODEL_NAME, structuredSchema);
    }
    return await runPrompt(prompt, maxTokens, SEMANTIC_MODEL_NAME);
  } catch (error) {
    if (
      (!isTimeoutError(error) && !isOpenAiQuotaOrRateLimitError(error)) ||
      SEMANTIC_MODEL_NAME === STAGE1_MODEL_NAME
    ) {
      throw error;
    }
    console.warn('[VisualMind] semantic:fallback', {
      primaryModel: SEMANTIC_MODEL_NAME,
      fallbackModel: STAGE1_MODEL_NAME,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return runPrompt(prompt, maxTokens, STAGE1_MODEL_NAME);
  }
};

const slideSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().min(1).max(140).optional(),
  layout: z.enum(['title', 'title-bullets', 'two-column', 'quote', 'timeline', 'summary']),
  bullets: z.array(z.string().min(1).max(160)).max(7).optional(),
  speakerNotes: z.string().min(1).max(800).optional(),
  visualIdea: z.string().min(1).max(280).optional(),
});

const slidesResponseSchema = z.object({
  title: z.string().min(1).max(140),
  theme: z.string().min(1).max(80).optional(),
  slides: z.array(slideSchema).min(1).max(MAX_SLIDES),
});

const flashcardSchema = z.object({
  front: z.string().min(1).max(180),
  back: z.string().min(1).max(320),
  hint: z.string().min(1).max(180).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

const flashcardsResponseSchema = z.object({
  title: z.string().min(1).max(140),
  cards: z.array(flashcardSchema).min(6).max(MAX_FLASHCARDS),
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

const normalizeGeneratedSlides = (rawModelOutput: string): z.infer<typeof slidesResponseSchema> => {
  const jsonCandidate = extractJsonCandidate(rawModelOutput);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    throw new Error('Model output is not valid JSON');
  }

  const result = slidesResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('Generated slide deck failed validation');
  }

  return result.data;
};

const normalizeGeneratedFlashcards = (
  rawModelOutput: string,
): z.infer<typeof flashcardsResponseSchema> => {
  const jsonCandidate = extractJsonCandidate(rawModelOutput);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    throw new Error('Model output is not valid JSON');
  }

  const result = flashcardsResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('Generated flashcards failed validation');
  }

  return result.data;
};

export const generateMindMapJson = async (inputText: string, plan: UserPlan = 'free'): Promise<string> => {
  const text = inputText.trim();
  if (!text) {
    return JSON.stringify({ title: 'Mind Map', children: [] });
  }

  console.log('[VisualMind] mindmap:model-config', {
    plan,
    stage1Model: STAGE1_MODEL_NAME,
    stage2Model: STAGE2_MODEL_NAME,
    stage2ProModel: STAGE2_PRO_MODEL_NAME,
    semanticModel: SEMANTIC_MODEL_NAME,
    openAiKeyConfigured: Boolean(config.openAiApiKey),
  });

  const normalizedText = normalizeLines(text);
  const structuredInput = normalizedText;

  console.log('[VisualMind] mindmap:normalized-input', {
    inputChars: text.length,
    normalizedChars: normalizedText.length,
    markdownChars: structuredInput.length,
  });

  const effectiveChars = structuredInput.length;
  if (effectiveChars > MAX_MINDMAP_INPUT_CHARS) {
    console.log('[VisualMind] mindmap:path', {
      path: 'input-too-large',
      plan,
      inputChars: effectiveChars,
    });
    throw new Error(`Input too large. Max supported length is ${MAX_MINDMAP_INPUT_CHARS} chars.`);
  }

  let finalTree = await buildMindMapDirectly(structuredInput, plan);
  finalTree = await shapeTreeForMindMap(finalTree);

  console.log('[VisualMind] mindmap:path', {
    path: 'direct-concept-synthesis',
    plan,
    inputChars: effectiveChars,
    childCount: finalTree.children.length,
  });

  return JSON.stringify({
    title: finalTree.text,
    children: finalTree.children,
  });
};

export const generateSlides = async (
  inputText: string,
  slideCount = 6,
): Promise<z.infer<typeof slidesResponseSchema>> => {
  const raw = await runPrompt(buildSlidesPrompt(inputText, slideCount), 1300);
  return normalizeGeneratedSlides(raw);
};

export const generateFlashcards = async (
  inputText: string,
  cardCount = 10,
): Promise<z.infer<typeof flashcardsResponseSchema>> => {
  const raw = await runPrompt(buildFlashcardsPrompt(inputText, cardCount), 1300);
  return normalizeGeneratedFlashcards(raw);
};

export const warmupModel = async (): Promise<void> => {
  try {
    console.log('[VisualMind] model:warmup:start');
    await runPrompt('Return JSON: {"ok": true}', 40);
    console.log('[VisualMind] model:warmup:success');
  } catch (error) {
    console.warn('[VisualMind] model:warmup:failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
