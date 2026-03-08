import { z } from 'zod';
import { config } from '../config.js';

const ollamaResponseSchema = z.object({
  response: z.string(),
});

const MAX_INPUT_CHARS = 8000;

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

export const generateMindMapJson = async (inputText: string): Promise<string> => {
  const prompt = buildPrompt(inputText);

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
            num_predict: 900,
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
