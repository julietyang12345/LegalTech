import { z } from 'zod';
import { config } from '../config.js';

const ollamaResponseSchema = z.object({
  response: z.string(),
});

const MAX_INPUT_CHARS = 8000;
const MAX_SLIDES = 12;
const MAX_FLASHCARDS = 24;

const buildPrompt = (inputText: string): string => {
  const clippedInput = inputText.slice(0, MAX_INPUT_CHARS);
  return [
    'Convert input text into a concise mind map JSON.',
    'Output strictly valid JSON with this exact schema:',
    '{"title":"root topic","children":[{"text":"node","children":[{"text":"subnode","children":[]}]}]}',
    'Rules:',
    '- max depth: 4',
    '- each node text <= 12 words',
    '- each node <= 6 children',
    '- no markdown, no explanation, no code fences',
    '',
    `Input:\n${clippedInput}`,
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

const runPrompt = async (prompt: string, maxTokens: number): Promise<string> => {

  const runOnce = async (): Promise<string> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.modelTimeoutMs);

    try {
      const resp = await fetch(`${config.modelApiBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.modelName,
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
        throw new Error(`Model server failed (${resp.status}): ${text}`);
      }

      const data = await resp.json();
      const parsed = ollamaResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error('Model server returned unexpected payload');
      }

      return parsed.data.response;
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    return await runOnce();
  } catch (error) {
    // One retry for transient timeout/network issues
    if (error instanceof Error && error.name === 'AbortError') {
      try {
        return await runOnce();
      } catch {
        throw new Error(
          `Model request timed out after ${config.modelTimeoutMs}ms (retried once). Try shorter input or faster model.`,
        );
      }
    }
    throw error;
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

export const generateMindMapJson = async (inputText: string): Promise<string> => {
  return runPrompt(buildPrompt(inputText), 900);
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
