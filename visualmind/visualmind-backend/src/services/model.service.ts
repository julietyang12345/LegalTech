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

const cleanDisplayLabel = (text: string): string =>
  text
    .replace(/^[\s:：\-–—]+|[\s:：\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const dedupeSiblingLabels = (tree: TreeNode): TreeNode => {
  const visit = (node: TreeNode): TreeNode => {
    const seen = new Set<string>();
    const deduped: TreeNode[] = [];

    for (const child of node.children.map(visit)) {
      const key = child.text.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(child);
    }

    return { ...node, children: deduped };
  };

  return visit(tree);
};

const finalizeTree = (node: TreeNode): TreeNode => {
  const seen = new Set<string>();
  const children: TreeNode[] = [];

  for (const child of node.children) {
    const next = finalizeTree(child);
    const key = next.text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    children.push(next);
  }

  return {
    ...node,
    children,
  };
};


const conceptExtractionSchema = z.object({
  concepts: z.array(z.string().min(1).max(40)).min(2).max(16),
});

const buildConceptExtractionPrompt = (text: string): string =>
  [
    'What are the important concepts mentioned in this text?',
    'Return only valid JSON with this exact schema:',
    '{"concepts":["concept phrase"]}',
    'Rules:',
    '- identify the main claim, problem, opportunity, or solution idea, not just repeated surface words',
    '- use noun phrases only',
    '- keep concepts concise but specific',
    '- extract only the strongest concepts needed to support the tree',
    '- usually 2 to 6 words per concept',
    '- no sentences',
    '- prefer source-native concepts over generic category words',
    '- when a procedure or sequence is presented as evidence of a pain point, keep both the pain point and the procedure evidence',
    '- when an example supports a broader idea, include the broader idea as a concept',
    '- preserve the semantic role of important content such as core problem, supporting evidence, inputs, outputs, proposed solution, and market implication when present',
    '- avoid duplicates',
    '',
    `Text:\n${text}`,
  ].join('\n');

const buildTreeSynthesisPrompt = (text: string, concepts: string[]): string =>
  [
    'Create a mind map from the following text.',
    'Return only valid JSON:',
    '{"title":"root topic","children":[{"text":"node","children":[{"text":"subnode","children":[]}]}]}',
    'Rules:',
    '- choose 2 to 6 main themes',
    '- top-level themes should be major solution concepts, systems, or product ideas',
    '- avoid making one giant umbrella theme that absorbs everything',
    '- avoid generic top-level labels unless they are clearly central to the source',
    '- if the input describes a product, startup idea, or solution concept, organize the direct children as meaningful product-side branches rather than repeating the title',
    '- identify the author’s main point, then organize supporting details beneath it',
    '- preserve the reasoning structure of the source when it is present, such as main point, supporting evidence, example, input, output, solution, implication, or conclusion',
    '- use source-native labels at every level',
    '- the root label and a direct child label must not repeat the same concept',
    '- parent-child relationships must reflect the actual logic of the text, not just word overlap',
    '- make a node the parent when its children explain it, support it, exemplify it, provide inputs to it, produce outputs from it, or describe its consequences',
    '- do not group nodes together only because they share similar keywords if their logical roles are different',
    '- when the source centers on one main topic, prefer grouping child branches by semantic role rather than surface wording, using roles like problem, process, components, inputs, outputs, examples, comparisons, causes, effects, implications, or evaluation when supported by the text',
    '- when several details relate to the same central topic in different ways, group them by semantic role such as components, process, inputs, outputs, examples, comparisons, causes, effects, implications, or evaluation, when those roles are supported by the text',
    '- prefer explicit parent-child relationships over flat lists when several details clearly belong together',
    '- sibling nodes at the same level should have similar semantic roles',
    '- intermediate nodes may summarize the branches below them',
    '- only the lowest-layer leaf nodes should stay close to the source details',
    '- keep the final leaf nodes concrete when the source contains concrete phrases',
    '- if a workflow, sequence, or example is presented as evidence for a pain point, value proposition, or opportunity, place that workflow under the broader idea instead of making the workflow the main theme',
    '- distinguish between the point being made and the example used to explain it',
    '- do not reduce important supporting text into isolated keyword fragments when the source expresses a clear claim-evidence-conclusion relationship',
    '- prefer compact meaningful labels over bare keyword extraction',
    '- AI may choose depth when the structure supports it',
    '- keep labels concise, but allow slightly longer labels when needed to preserve meaning',
    '',
    `Concepts:\n${JSON.stringify(concepts)}`,
    `Text:\n${text}`,
  ].join('\n');
const buildMindMapDirectly = async (text: string, plan: UserPlan): Promise<TreeNode> => {
  const conceptResult = await runSemanticPrompt(buildConceptExtractionPrompt(text), 500, {
    name: 'concept_extraction',
    validator: conceptExtractionSchema,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        concepts: {
          type: 'array',
          minItems: 2,
          maxItems: 16,
          items: {
            type: 'string',
            minLength: 1,
            maxLength: 40,
          },
        },
      },
      required: ['concepts'],
    },
  });

  const parsedConcepts = conceptExtractionSchema.safeParse(conceptResult);
  if (!parsedConcepts.success) {
    throw new Error('Concept extraction failed validation');
  }

  const rawTree = await runStage2Prompt(
    buildTreeSynthesisPrompt(text, parsedConcepts.data.concepts),
    MINDMAP_FINAL_MERGE_TOKENS,
    plan,
    treeJsonSchema,
  );

  return normalizeGeneratedTree(typeof rawTree === 'string' ? rawTree : JSON.stringify(rawTree));
};

const shapeTreeForMindMap = (tree: TreeNode): TreeNode => {
  let next = cloneTree(tree);
  next = removeDuplicateRootChild(next);
  next = dedupeSiblingLabels(next);
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
          children: {
            type: 'array',
            items: { $ref: '#/$defs/node' },
          },
        },
        required: ['text', 'children'],
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
    const parsedJson = JSON.parse(extractJsonCandidate(content));
    const result = structuredSchema.validator.safeParse(parsedJson);
    if (!result.success) {
      console.error('[VisualMind] model:structured-request:validation-failed', {
        schema: structuredSchema.name,
        issues: result.error.issues,
      });
      throw new Error(`Structured output validation failed for ${structuredSchema.name}`);
    }

    console.log('[VisualMind] model:structured-request:success', {
      provider: 'openai',
      model: modelName,
      schema: structuredSchema.name,
      ...usageLogDetails(usage),
    });
    return result.data;
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
  finalTree = shapeTreeForMindMap(finalTree);

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
