import { z } from 'zod';
import { config } from '../config.js';

const moderationResponseSchema = z.object({
  results: z
    .array(
      z.object({
        flagged: z.boolean(),
        categories: z.record(z.boolean()).optional(),
      }),
    )
    .min(1),
});

export class InputPolicyViolationError extends Error {
  readonly categories: string[];

  constructor(categories: string[] = []) {
    super('Input violates policy');
    this.name = 'InputPolicyViolationError';
    this.categories = categories;
  }
}

const extractTriggeredCategories = (categories: Record<string, boolean> | undefined): string[] => {
  if (!categories) return [];
  return Object.entries(categories)
    .filter(([, triggered]) => triggered)
    .map(([name]) => name);
};

export const assertInputAllowed = async (inputText: string, context: string): Promise<void> => {
  const text = inputText.trim();
  if (!text) return;

  if (!config.openAiApiKey) {
    console.warn('[VisualMind] input-policy:skip-no-openai-key', { context });
    return;
  }

  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI moderation request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  const parsed = moderationResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('OpenAI moderation returned unexpected payload');
  }

  const result = parsed.data.results[0];
  if (!result.flagged) return;

  const categories = extractTriggeredCategories(result.categories);
  throw new InputPolicyViolationError(categories);
};
