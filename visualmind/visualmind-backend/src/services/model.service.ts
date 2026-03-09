import { z } from 'zod';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import type { UserPlan } from '../types.js';

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

const MAX_INPUT_CHARS = 8000;
const MAX_SLIDES = 12;
const MAX_FLASHCARDS = 24;
const MAX_MINDMAP_INPUT_CHARS = 9800;
const MAX_MINDMAP_OUTPUT_TOKENS = 1100;
const MINDMAP_CHUNK_SIZE = 3000;
const MINDMAP_KEYPOINT_TOKENS = 220;
const MINDMAP_KEYPOINTS_PER_CHUNK = 20;
const MINDMAP_MAX_MERGED_IDEAS = 180;
const MINDMAP_CHUNK_THRESHOLD_CHARS = MINDMAP_CHUNK_SIZE;
const MINDMAP_CHUNK_CONCURRENCY = 1;
const MINDMAP_KEYPOINT_CACHE_MAX_ENTRIES = 500;
const MINDMAP_CLUSTER_MAX_THEMES = 20;
const MINDMAP_CLUSTER_TOKENS = 240;
const mindMapKeyPointCache = new Map<string, string[]>();
const STAGE1_MODEL_NAME = config.modelNameStage1;
const STAGE2_MODEL_NAME = config.modelName;
const STAGE2_FALLBACK_MODEL_NAME = config.modelNameStage1;
const STAGE2_PRO_MODEL_NAME = config.openAiModelPro;

const compressMindMapInput = (inputText: string): string => {
  const lines = inputText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const isPriorityLine = (line: string): boolean =>
    /^#{1,6}\s/.test(line) ||
    /^[\-\*\u2022]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /:$/.test(line);

  const prioritized = lines.filter(isPriorityLine);
  const regular = lines.filter((line) => !isPriorityLine(line));
  const merged = [...prioritized, ...regular];

  const unique = new Set<string>();
  const distilled: string[] = [];
  for (const line of merged) {
    const normalized = line.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    if (unique.has(normalized)) continue;
    unique.add(normalized);
    distilled.push(normalized);
    if (distilled.length >= 520) break;
  }

  return distilled.join('\n').slice(0, MAX_MINDMAP_INPUT_CHARS);
};

const normalizeTextForChunking = (inputText: string): string => {
  const lines = inputText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const unique = new Set<string>();
  const deduped: string[] = [];
  for (const line of lines) {
    if (unique.has(line)) continue;
    unique.add(line);
    deduped.push(line);
  }
  return deduped.join('\n');
};

const chunkText = (text: string, size = MINDMAP_CHUNK_SIZE): string[] => {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    const chunk = text.slice(i, i + size).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
};

const buildKeyPointsPrompt = (chunk: string): string =>
  [
    'Extract the most important ideas from this text.',
    `Return ${Math.min(5, MINDMAP_KEYPOINTS_PER_CHUNK)} to ${MINDMAP_KEYPOINTS_PER_CHUNK} bullet lines only.`,
    'Each bullet must be under 16 words.',
    'Preserve markdown section headings as their own bullets when present.',
    'Include concrete topic names, key problems, tools, use-cases, and open questions when present.',
    'No numbering, no explanation, no markdown fence.',
    '',
    `Text:\n${chunk}`,
  ].join('\n');

const normalizeIdea = (value: string): string =>
  value
    .replace(/^[\-\*\d\.\)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

const parseKeyPoints = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map(normalizeIdea)
    .filter((line) => line.length > 2)
    .slice(0, MINDMAP_KEYPOINTS_PER_CHUNK);

const hashChunk = (chunk: string): string => createHash('sha256').update(chunk).digest('hex');

const setChunkCache = (key: string, ideas: string[]): void => {
  mindMapKeyPointCache.set(key, ideas);
  if (mindMapKeyPointCache.size <= MINDMAP_KEYPOINT_CACHE_MAX_ENTRIES) return;
  const firstKey = mindMapKeyPointCache.keys().next().value as string | undefined;
  if (firstKey) {
    mindMapKeyPointCache.delete(firstKey);
  }
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) break;
      results[index] = await mapper(items[index], index);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
};

const buildPrompt = (inputText: string): string => {
  const clippedInput = compressMindMapInput(inputText);
  const markdownHeadings = inputText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^##\s+/.test(line))
    .map((line) => line.replace(/^##\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
  const headingInstruction =
    markdownHeadings.length >= 3
      ? [
          'Important structure rule:',
          'The source includes markdown section headings. Use them as top-level children in the same order when possible.',
          `Headings: ${markdownHeadings.join(' | ')}`,
        ].join('\n')
      : '';
  return [
    'Build a comprehensive but readable mind map from the input.',
    'Return only valid JSON:',
    '{"title":"root topic","children":[{"text":"node","children":[{"text":"subnode","children":[]}]}]}',
    'Constraints: depth<=4, children_per_node<=7, total_nodes<=60, node_text<=14 words.',
    'Structure requirements:',
    '- create as many top-level children as needed to reflect distinct themes',
    '- do not collapse unrelated ideas into one long node',
    '- split workflows like "A -> B -> C" into separate sequential child nodes',
    '- separate categories such as problems, tools, workflow, benefits, risks, and open questions',
    'Preserve major sections and meaningful details from the source when possible.',
    headingInstruction,
    'No markdown. No prose.',
    `Input:\n${clippedInput}`,
  ].join('\n');
};

const buildPromptFromIdeas = (ideas: string[]): string => {
  const clippedIdeas = ideas
    .map((idea) => normalizeIdea(idea))
    .filter(Boolean)
    .slice(0, MINDMAP_MAX_MERGED_IDEAS)
    .join('\n');

  return [
    'Organize the ideas into a comprehensive but readable mind map.',
    'Return only valid JSON:',
    '{"title":"root topic","children":[{"text":"node","children":[{"text":"subnode","children":[]}]}]}',
    'Constraints: depth<=4, children_per_node<=7, total_nodes<=60, node_text<=14 words.',
    'Structure requirements:',
    '- create as many top-level children as needed to reflect distinct themes',
    '- avoid over-compressing many ideas into one node',
    '- split process chains into ordered nodes rather than one sentence node',
    '- keep sibling branches semantically distinct',
    'Keep breadth across distinct themes instead of over-compressing into too few nodes.',
    'No markdown. No prose.',
    '',
    `Ideas:\n${clippedIdeas}`,
  ].join('\n');
};

const buildClusterPrompt = (ideas: string[]): string => {
  const clippedIdeas = ideas
    .map((idea) => normalizeIdea(idea))
    .filter(Boolean)
    .slice(0, MINDMAP_MAX_MERGED_IDEAS)
    .join('\n');

  return [
    'Cluster these ideas into themes before mind map generation.',
    'Return only valid JSON:',
    '{"themes":[{"name":"theme","ideas":["idea"]}]}',
    `Rules: 4-${MINDMAP_CLUSTER_MAX_THEMES} themes, no duplicate ideas, short names, each idea in one best theme.`,
    'No markdown. No explanation.',
    '',
    `Ideas:\n${clippedIdeas}`,
  ].join('\n');
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

const runPrompt = async (
  prompt: string,
  maxTokens: number,
  modelName: string = STAGE2_MODEL_NAME,
  provider: PromptProvider = 'ollama',
): Promise<string> => {
  console.log('[VisualMind] model:request:start', {
    provider,
    model: modelName,
    modelApiBaseUrl: provider === 'ollama' ? config.modelApiBaseUrl : undefined,
    promptChars: prompt.length,
    maxTokens,
  });

  const runOnce = async (): Promise<string> => {
    const controller = new AbortController();
    const timeout =
      config.modelTimeoutMs > 0 ? setTimeout(() => controller.abort(), config.modelTimeoutMs) : null;

    try {
      if (provider === 'openai') {
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
            temperature: 0.2,
            max_completion_tokens: maxTokens,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const text = await resp.text();
          console.error('[VisualMind] model:request:non-200', {
            provider,
            status: resp.status,
            bodyPreview: text.slice(0, 300),
          });
          throw new Error(`OpenAI request failed (${resp.status}): ${text}`);
        }

        const data = await resp.json();
        const parsed = openAiChatResponseSchema.safeParse(data);
        if (!parsed.success) {
          console.error('[VisualMind] model:request:bad-payload', { provider, payload: data });
          throw new Error('OpenAI returned unexpected payload');
        }
        const content = parsed.data.choices[0]?.message?.content?.trim();
        if (!content) {
          throw new Error('OpenAI returned empty content');
        }
        return content;
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
          provider,
          status: resp.status,
          bodyPreview: text.slice(0, 300),
        });
        throw new Error(`Model server failed (${resp.status}): ${text}`);
      }

      const data = await resp.json();
      const parsed = ollamaResponseSchema.safeParse(data);
      if (!parsed.success) {
        console.error('[VisualMind] model:request:bad-payload', { provider, payload: data });
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
      provider,
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
      provider,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

const isTimeoutError = (error: unknown): boolean =>
  error instanceof Error && /timed out/i.test(error.message);

const runStage2Prompt = async (prompt: string, maxTokens: number, plan: UserPlan = 'free'): Promise<string> => {
  const shouldUseOpenAiForPro = plan === 'pro' && Boolean(config.openAiApiKey);
  if (plan === 'pro' && !config.openAiApiKey) {
    console.warn('[VisualMind] stage2:pro-openai-key-missing-fallback', {
      fallbackModel: STAGE2_MODEL_NAME,
    });
  }
  try {
    if (shouldUseOpenAiForPro) {
      return await runPrompt(prompt, maxTokens, STAGE2_PRO_MODEL_NAME, 'openai');
    }
    return await runPrompt(prompt, maxTokens, STAGE2_MODEL_NAME);
  } catch (error) {
    if (shouldUseOpenAiForPro) {
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

const clusterSchema = z.object({
  themes: z.array(
    z.object({
      name: z.string().min(1).max(80),
      ideas: z.array(z.string().min(1).max(120)).min(1),
    }),
  ),
});

const clusterIdeas = async (ideas: string[]): Promise<string[]> => {
  if (ideas.length <= 12) return ideas;

  try {
    const raw = await runPrompt(buildClusterPrompt(ideas), MINDMAP_CLUSTER_TOKENS, STAGE1_MODEL_NAME);
    const jsonCandidate = extractJsonCandidate(raw);
    const parsed = JSON.parse(jsonCandidate);
    const result = clusterSchema.safeParse(parsed);
    if (!result.success) {
      return ideas;
    }

    const flattened = result.data.themes.flatMap((theme) => [
      `${normalizeIdea(theme.name)}:`,
      ...theme.ideas.map((idea) => `- ${normalizeIdea(idea)}`),
    ]);

    const deduped = Array.from(new Set(flattened.map((line) => line.trim()).filter(Boolean)));
    return deduped.length > 0 ? deduped : ideas;
  } catch {
    return ideas;
  }
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
    return runStage2Prompt(buildPrompt(text), MAX_MINDMAP_OUTPUT_TOKENS, plan);
  }

  if (text.length <= MINDMAP_CHUNK_THRESHOLD_CHARS) {
    return runStage2Prompt(buildPrompt(text), MAX_MINDMAP_OUTPUT_TOKENS, plan);
  }

  const preparedText = normalizeTextForChunking(text);
  const chunks = chunkText(preparedText, MINDMAP_CHUNK_SIZE);
  const effectiveChunks = chunks.length > 0 ? chunks : [preparedText];

  console.log('[VisualMind] mindmap:chunking', {
    originalChars: text.length,
    preparedChars: preparedText.length,
    chunkSize: MINDMAP_CHUNK_SIZE,
    chunkCount: effectiveChunks.length,
    concurrency: MINDMAP_CHUNK_CONCURRENCY,
  });

  const chunkIdeas = await mapWithConcurrency(
    effectiveChunks,
    MINDMAP_CHUNK_CONCURRENCY,
    async (chunk, index): Promise<string[]> => {
      const cacheKey = hashChunk(chunk);
      const cached = mindMapKeyPointCache.get(cacheKey);
      if (cached) {
        console.log('[VisualMind] mindmap:chunk-keypoints:cache-hit', {
          chunkIndex: index,
          chunkChars: chunk.length,
          extractedIdeas: cached.length,
        });
        return cached;
      }

      const rawIdeas = await runPrompt(buildKeyPointsPrompt(chunk), MINDMAP_KEYPOINT_TOKENS, STAGE1_MODEL_NAME);
      const ideas = parseKeyPoints(rawIdeas);
      setChunkCache(cacheKey, ideas);
      console.log('[VisualMind] mindmap:chunk-keypoints', {
        chunkIndex: index,
        chunkChars: chunk.length,
        extractedIdeas: ideas.length,
      });
      return ideas;
    },
  );

  const allIdeas = chunkIdeas.flat();

  const dedupedIdeas = Array.from(new Set(allIdeas.map(normalizeIdea).filter(Boolean))).slice(
    0,
    MINDMAP_MAX_MERGED_IDEAS,
  );

  const clusteredIdeas = await clusterIdeas(dedupedIdeas);

  console.log('[VisualMind] mindmap:ideas-merged', {
    rawIdeaCount: allIdeas.length,
    dedupedIdeaCount: dedupedIdeas.length,
    clusteredIdeaCount: clusteredIdeas.length,
  });

  return runStage2Prompt(buildPromptFromIdeas(clusteredIdeas), MAX_MINDMAP_OUTPUT_TOKENS, plan);
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
