import { z } from 'zod';
import { config } from '../config.js';

const ollamaResponseSchema = z.object({
  response: z.string(),
});

export const generateMindMapJson = async (inputText: string): Promise<string> => {
  const prompt = [
    'Convert input text into a mind map JSON.',
    'Output strictly JSON with this schema:',
    '{"title":"root topic","children":[{"text":"node","children":[{"text":"subnode","children":[]}]}]}',
    'Do not output markdown, explanations, or code fences.',
    '',
    `Input:\n${inputText}`,
  ].join('\n');

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
