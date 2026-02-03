import {
  Injectable,
  Logger,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import {
  CompanionService,
  CompanionContext,
} from '../companion/companion.service';

/**
 * Simple semaphore to limit concurrent AI API calls
 * Prevents overwhelming AI providers with too many concurrent requests
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }

  get available(): number {
    return this.permits;
  }

  get waiting(): number {
    return this.queue.length;
  }
}

// Max concurrent AI API calls (across all providers)
const MAX_CONCURRENT_AI_CALLS = 20;

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1 second
const MAX_DELAY_MS = 60000; // 60 seconds

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 * Jitter prevents "thundering herd" when many clients retry at once
 */
function getBackoffDelay(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs) {
    // Respect the API's retry-after header
    return retryAfterMs;
  }
  // Exponential: 1s, 2s, 4s, 8s... with random jitter (±25%)
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5); // ±25%
  return Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
}

export enum AITask {
  // Heavy reasoning (Claude Sonnet 4)
  CURRICULUM_GENERATION = 'CURRICULUM_GENERATION',
  CODE_GENERATION = 'CODE_GENERATION',

  // Interactive (Claude Haiku 3.5)
  TUTOR_CHAT = 'TUTOR_CHAT',
  ALTERNATIVE_EXPLANATION = 'ALTERNATIVE_EXPLANATION',
  CODE_REVIEW = 'CODE_REVIEW',
  STUCK_DETECTION = 'STUCK_DETECTION',
  LIFE_HAPPENS_ADJUST = 'LIFE_HAPPENS_ADJUST',
  REFLECTION_ANALYSIS = 'REFLECTION_ANALYSIS',

  // Lightweight content generation (Haiku - for reflection, openTask)
  LIGHTWEIGHT_CONTENT = 'LIGHTWEIGHT_CONTENT',

  // Video/Multimodal (Gemini Flash 2.0)
  VIDEO_SUMMARY = 'VIDEO_SUMMARY',
  VIDEO_TIMESTAMP_EXTRACTION = 'VIDEO_TIMESTAMP_EXTRACTION',
  VIDEO_CHAPTER_GENERATION = 'VIDEO_CHAPTER_GENERATION',
  TRANSCRIPT_ANALYSIS = 'TRANSCRIPT_ANALYSIS',
  VISUAL_CONTENT_ANALYSIS = 'VISUAL_CONTENT_ANALYSIS',

  // Basic logic (GPT-4o-mini)
  BATCH_LOGIC = 'BATCH_LOGIC',
  QUIZ_GENERATION = 'QUIZ_GENERATION',
  SPACED_REPETITION_SCHEDULE = 'SPACED_REPETITION_SCHEDULE',
  SIMPLE_CLASSIFICATION = 'SIMPLE_CLASSIFICATION',
  DATA_VALIDATION = 'DATA_VALIDATION',

  // Lightweight extraction (Haiku - minimal tokens)
  LIGHTWEIGHT_EXTRACTION = 'LIGHTWEIGHT_EXTRACTION',

  // Fast text (Groq Llama 3.1)
  EMAIL_SUMMARY = 'EMAIL_SUMMARY',
  NOTIFICATION_GENERATION = 'NOTIFICATION_GENERATION',
}

export interface AIResponse {
  content: string;
  tokensUsed: number;
  cost: number;
  provider: string;
  model: string;
  cacheHit?: boolean;
}

export interface CacheablePrompt {
  staticPart: string; // Cacheable instructions (>1024 tokens)
  dynamicPart: string; // User-specific context
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private anthropic: Anthropic;
  private openai: OpenAI;
  private gemini: GoogleGenerativeAI;
  private groq: Groq;

  // Semaphore to limit concurrent AI API calls globally
  private static aiSemaphore = new Semaphore(MAX_CONCURRENT_AI_CALLS);

  // Cost per 1M tokens (input + output average)
  private readonly costs = {
    'claude-sonnet-4': 0.05,
    'claude-haiku-3.5': 0.005,
    'gemini-2.0-flash-exp': 0.02,
    'gpt-4o-mini': 0.002,
    'llama-3.1-70b': 0.0005,
  };

  constructor(
    private configService: ConfigService,
    @Optional()
    @Inject(forwardRef(() => CompanionService))
    private companionService?: CompanionService,
  ) {
    this.initializeClients();
  }

  private initializeClients(): void {
    const anthropicKey = this.configService.get<string>('ai.anthropic.apiKey');
    const openaiKey = this.configService.get<string>('ai.openai.apiKey');
    const geminiKey = this.configService.get<string>('ai.gemini.apiKey');
    const groqKey = this.configService.get<string>('ai.groq.apiKey');

    if (anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicKey });
      this.logger.log('✅ Anthropic Claude initialized');
    }

    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
      this.logger.log('✅ OpenAI initialized');
    }

    if (geminiKey) {
      this.gemini = new GoogleGenerativeAI(geminiKey);
      this.logger.log('✅ Google Gemini initialized');
    }

    if (groqKey) {
      this.groq = new Groq({ apiKey: groqKey });
      this.logger.log('✅ Groq initialized');
    }
  }

  async routeRequest(
    task: AITask,
    prompt: string,
    systemPrompt?: string,
  ): Promise<AIResponse> {
    const routing = this.getRoutingStrategy(task);

    // Acquire semaphore to limit concurrent AI calls
    const semaphore = AiService.aiSemaphore;
    if (semaphore.waiting > 0) {
      this.logger.debug(`⏳ AI semaphore queue: ${semaphore.waiting} waiting, ${semaphore.available} available`);
    }
    await semaphore.acquire();

    try {
      for (const { provider, model } of routing) {
        try {
          this.logger.log(`🎯 Routing ${task} to ${provider} (${model})`);

          const response = await this.callProvider(
            provider,
            model,
            prompt,
            systemPrompt,
          );

          this.logger.log(
            `✅ ${provider} success. Tokens: ${response.tokensUsed}, Cost: $${response.cost.toFixed(4)}`,
          );

          return response;
        } catch (error: any) {
          const isRateLimited = error?.status === 429 || error?.message?.includes('rate');

          // If rate limited, retry twice with exponential backoff before falling back
          if (isRateLimited) {
            let lastError = error;

            for (let attempt = 1; attempt <= 2; attempt++) {
              const retryAfter = lastError?.headers?.['retry-after'];
              const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : getBackoffDelay(attempt - 1);

              this.logger.warn(
                `⏳ ${provider} rate limited, retry ${attempt}/2 in ${Math.round(delayMs / 1000)}s...`,
              );
              await sleep(delayMs);

              try {
                const retryResponse = await this.callProvider(
                  provider,
                  model,
                  prompt,
                  systemPrompt,
                );
                this.logger.log(
                  `✅ ${provider} retry ${attempt} success. Tokens: ${retryResponse.tokensUsed}`,
                );
                return retryResponse;
              } catch (retryError: any) {
                lastError = retryError;
                this.logger.warn(
                  `❌ ${provider} retry ${attempt} failed: ${retryError.message}`,
                );
              }
            }

            this.logger.error(`❌ ${provider} all retries failed, falling back`);
          } else {
            this.logger.error(`❌ ${provider} failed for ${task}: ${error.message}`);
          }

          // Try next provider in fallback chain
          continue;
        }
      }

      throw new Error(`All AI providers failed for task: ${task}`);
    } finally {
      // Always release semaphore
      semaphore.release();
    }
  }

  private getRoutingStrategy(
    task: AITask,
  ): Array<{ provider: string; model: string }> {
    const routes = {
      // Heavy reasoning
      [AITask.CURRICULUM_GENERATION]: [
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        { provider: 'openai', model: 'gpt-4o' },
      ],
      [AITask.CODE_GENERATION]: [
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        { provider: 'openai', model: 'gpt-4o' },
      ],

      // Interactive
      [AITask.TUTOR_CHAT]: [
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.ALTERNATIVE_EXPLANATION]: [
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.CODE_REVIEW]: [
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      ],
      [AITask.STUCK_DETECTION]: [
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.LIFE_HAPPENS_ADJUST]: [
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.REFLECTION_ANALYSIS]: [
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.LIGHTWEIGHT_CONTENT]: [
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],

      // Video/Multimodal
      [AITask.VIDEO_SUMMARY]: [
        { provider: 'gemini', model: 'gemini-2.0-flash-exp' },
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
      ],
      [AITask.VIDEO_TIMESTAMP_EXTRACTION]: [
        { provider: 'gemini', model: 'gemini-2.0-flash-exp' },
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
      ],
      [AITask.VIDEO_CHAPTER_GENERATION]: [
        { provider: 'gemini', model: 'gemini-2.0-flash-exp' },
      ],
      [AITask.TRANSCRIPT_ANALYSIS]: [
        { provider: 'gemini', model: 'gemini-2.0-flash-exp' },
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
      ],
      [AITask.VISUAL_CONTENT_ANALYSIS]: [
        { provider: 'gemini', model: 'gemini-2.0-flash-exp' },
      ],

      // Basic logic
      [AITask.BATCH_LOGIC]: [
        { provider: 'openai', model: 'gpt-4o-mini' },
        { provider: 'gemini', model: 'gemini-2.0-flash-exp' },
      ],
      [AITask.QUIZ_GENERATION]: [
        { provider: 'openai', model: 'gpt-4o-mini' },
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
      ],
      [AITask.SPACED_REPETITION_SCHEDULE]: [
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.SIMPLE_CLASSIFICATION]: [
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.DATA_VALIDATION]: [{ provider: 'openai', model: 'gpt-4o-mini' }],

      // Lightweight extraction (minimal tokens)
      [AITask.LIGHTWEIGHT_EXTRACTION]: [
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
        { provider: 'groq', model: 'llama-3.1-70b-versatile' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],

      // Fast text
      [AITask.EMAIL_SUMMARY]: [
        { provider: 'groq', model: 'llama-3.1-70b-versatile' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.NOTIFICATION_GENERATION]: [
        { provider: 'groq', model: 'llama-3.1-70b-versatile' },
      ],
    };

    return (
      routes[task] || [
        { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
      ]
    );
  }

  private async callProvider(
    provider: string,
    model: string,
    prompt: string,
    systemPrompt?: string,
  ): Promise<AIResponse> {
    switch (provider) {
      case 'anthropic':
        return this.callAnthropic(model, prompt, systemPrompt);
      case 'openai':
        return this.callOpenAI(model, prompt, systemPrompt);
      case 'gemini':
        return this.callGemini(model, prompt, systemPrompt);
      case 'groq':
        return this.callGroq(model, prompt, systemPrompt);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private async callAnthropic(
    model: string,
    prompt: string,
    systemPrompt?: string,
  ): Promise<AIResponse> {
    const response = await this.anthropic.messages.create({
      model,
      max_tokens: 16384,
      system: systemPrompt || '',
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    const text = content.type === 'text' ? content.text : '';

    return {
      content: text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      cost: this.calculateCost(
        model,
        response.usage.input_tokens + response.usage.output_tokens,
      ),
      provider: 'anthropic',
      model,
    };
  }

  /**
   * Call Anthropic with prompt caching and STREAMING enabled
   * Yields text chunks as they're generated for real-time UI updates
   * Use for long-running generations like foundation cards
   */
  async *callAnthropicWithCacheStream(
    model: string,
    prompt: string,
    cacheableSystem: CacheablePrompt,
  ): AsyncGenerator<{ type: 'text' | 'done'; text?: string; usage?: any }> {
    // Acquire semaphore to limit concurrent AI calls
    const semaphore = AiService.aiSemaphore;
    await semaphore.acquire();

    try {
      // Build system with cache_control for static parts
      const systemBlocks: Array<{
        type: 'text';
        text: string;
        cache_control?: { type: 'ephemeral' };
      }> = [];

      if (cacheableSystem.staticPart) {
        systemBlocks.push({
          type: 'text',
          text: cacheableSystem.staticPart,
          cache_control: { type: 'ephemeral' },
        });
      }

      if (cacheableSystem.dynamicPart) {
        systemBlocks.push({
          type: 'text',
          text: cacheableSystem.dynamicPart,
        });
      }

      const stream = await this.anthropic.messages.stream({
        model,
        max_tokens: 16384,
        system: systemBlocks,
        messages: [{ role: 'user', content: prompt }],
      });

      // Yield text chunks as they arrive
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield { type: 'text', text: event.delta.text };
        }
      }

      // Get final message for usage stats
      const finalMessage = await stream.finalMessage();
      yield {
        type: 'done',
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
          cacheReadTokens: (finalMessage as any).usage?.cache_read_input_tokens || 0,
          cacheWriteTokens: (finalMessage as any).usage?.cache_creation_input_tokens || 0,
        },
      };
    } finally {
      semaphore.release();
    }
  }

  /**
   * Call Anthropic with prompt caching enabled
   * Static parts are cached for 5 minutes, saving up to 90% on repeated calls
   */
  async callAnthropicWithCache(
    model: string,
    prompt: string,
    cacheableSystem: CacheablePrompt,
  ): Promise<AIResponse> {
    // Acquire semaphore to limit concurrent AI calls
    const semaphore = AiService.aiSemaphore;
    await semaphore.acquire();

    try {
      // Build system with cache_control for static parts
      const systemBlocks: Array<{
        type: 'text';
        text: string;
        cache_control?: { type: 'ephemeral' };
      }> = [];

      // Static part gets cached (must be >1024 tokens to be effective)
      if (cacheableSystem.staticPart) {
        systemBlocks.push({
          type: 'text',
          text: cacheableSystem.staticPart,
          cache_control: { type: 'ephemeral' },
        });
      }

      // Dynamic part is not cached
      if (cacheableSystem.dynamicPart) {
        systemBlocks.push({
          type: 'text',
          text: cacheableSystem.dynamicPart,
        });
      }

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 16384,
        system: systemBlocks,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      const text = content.type === 'text' ? content.text : '';

      // Check if cache was used
      const cacheHit = (response as any).usage?.cache_read_input_tokens > 0;

      if (cacheHit) {
        this.logger.log(
          `🎯 Cache HIT - saved ${(response as any).usage.cache_read_input_tokens} tokens`,
        );
      }

      return {
        content: text,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        cost: this.calculateCostWithCache(
          model,
          response.usage.input_tokens,
          response.usage.output_tokens,
          (response as any).usage?.cache_creation_input_tokens || 0,
          (response as any).usage?.cache_read_input_tokens || 0,
        ),
        provider: 'anthropic',
        model,
        cacheHit,
      };
    } finally {
      semaphore.release();
    }
  }

  private calculateCostWithCache(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cacheWriteTokens: number,
    cacheReadTokens: number,
  ): number {
    // Pricing per 1M tokens (Claude Sonnet 4)
    const inputCost = 3.0; // $3/1M input
    const outputCost = 15.0; // $15/1M output
    const cacheWriteCost = 3.75; // $3.75/1M (25% more)
    const cacheReadCost = 0.3; // $0.30/1M (90% less!)

    const normalInputTokens = inputTokens - cacheWriteTokens - cacheReadTokens;

    return (
      (normalInputTokens / 1_000_000) * inputCost +
      (outputTokens / 1_000_000) * outputCost +
      (cacheWriteTokens / 1_000_000) * cacheWriteCost +
      (cacheReadTokens / 1_000_000) * cacheReadCost
    );
  }

  private async callOpenAI(
    model: string,
    prompt: string,
    systemPrompt?: string,
  ): Promise<AIResponse> {
    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.openai.chat.completions.create({
      model,
      messages,
      max_tokens: 16384,
    });

    const content = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;

    return {
      content,
      tokensUsed,
      cost: this.calculateCost(model, tokensUsed),
      provider: 'openai',
      model,
    };
  }

  private async callGemini(
    model: string,
    prompt: string,
    systemPrompt?: string,
  ): Promise<AIResponse> {
    if (!this.gemini) {
      throw new Error('Gemini API key not configured');
    }
    const genModel = this.gemini.getGenerativeModel({ model });

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

    const result = await genModel.generateContent(fullPrompt);
    const response = await result.response;
    const content = response.text();

    // Gemini doesn't return token counts easily, estimate
    const tokensUsed = Math.ceil((fullPrompt.length + content.length) / 4);

    return {
      content,
      tokensUsed,
      cost: this.calculateCost(model, tokensUsed),
      provider: 'gemini',
      model,
    };
  }

  private async callGroq(
    model: string,
    prompt: string,
    systemPrompt?: string,
  ): Promise<AIResponse> {
    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.groq.chat.completions.create({
      model,
      messages,
      max_tokens: 8192,
    });

    const content = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;

    return {
      content,
      tokensUsed,
      cost: this.calculateCost(model, tokensUsed),
      provider: 'groq',
      model,
    };
  }

  private calculateCost(model: string, tokens: number): number {
    const costPer1M = this.costs[model] || 0.01;
    return (tokens / 1000000) * costPer1M;
  }

  // ============ CROSS-REFERENCED REQUESTS ============

  /**
   * Cross-reference existing directions with Gemini review and Claude synthesis.
   * Used when user provides feedback ("Not quite") to improve existing directions.
   *
   * Strategy:
   * 1. Take existing directions (already generated, passed from frontend)
   * 2. Gemini reviews for quality AND incorporates user feedback
   * 3. Claude synthesizes final directions incorporating Gemini's feedback
   *
   * @param prompt - The user prompt with refinement context
   * @param systemPrompt - System prompt for direction generation
   * @param userFeedback - User's specific feedback text
   * @param existingDirections - Previously generated directions JSON (required)
   */
  async crossReferencedRequest(
    prompt: string,
    systemPrompt: string,
    userFeedback: string,
    existingDirections: string, // Required - directions already shown to user
  ): Promise<AIResponse> {
    this.logger.log('✅ Step 1: Using existing directions (no regeneration)');

    // Step 2: Send to Gemini to review quality AND incorporate user feedback
    // Compress directions to just titles/outcomes to save tokens
    let compressedDirections = existingDirections;
    try {
      const parsed = JSON.parse(existingDirections);
      if (parsed.directions) {
        compressedDirections = parsed.directions
          .map(
            (d: any, i: number) => `${i + 1}. ${d.title}: ${d.outcome || ''}`,
          )
          .join('\n');
      }
    } catch {
      /* use full if parse fails */
    }

    const reviewPrompt = `Review these learning directions. User feedback: "${userFeedback}"

DIRECTIONS:
${compressedDirections}

Check: searchable terms? scoped (30-90min)? diverse approaches? low-friction options?
Return JSON: {overallQuality, issues[], suggestions[], missingApproaches[], feedbackAlignment}`;

    let geminiReview: AIResponse;
    let reviewData: any = null;

    try {
      geminiReview = await this.callGemini(
        'gemini-2.0-flash-exp',
        reviewPrompt,
        '',
      );

      this.logger.log('✅ Step 2: Gemini reviewed directions');

      // Try to parse Gemini's review
      try {
        const jsonMatch = geminiReview.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          reviewData = JSON.parse(jsonMatch[0]);
        }
      } catch {
        this.logger.warn(
          'Could not parse Gemini review as JSON, using raw content',
        );
      }
    } catch (error) {
      this.logger.error(`Gemini review failed: ${error.message || error}`);
      // Don't silently return old directions - continue to Claude without review
      this.logger.log(
        'Skipping Gemini review, proceeding directly to Claude synthesis',
      );
    }

    // Step 3: Claude synthesizes final directions incorporating Gemini's feedback
    // Extract just the actionable feedback from Gemini's review (or empty if Gemini failed)
    let reviewSummary =
      geminiReview?.content || 'No automated review available';
    if (reviewData) {
      const parts = [];
      if (reviewData.issues?.length)
        parts.push(`Issues: ${reviewData.issues.join('; ')}`);
      if (reviewData.suggestions?.length)
        parts.push(`Suggestions: ${reviewData.suggestions.join('; ')}`);
      if (reviewData.missingApproaches?.length)
        parts.push(`Missing: ${reviewData.missingApproaches.join('; ')}`);
      if (parts.length) reviewSummary = parts.join('\n');
    }

    const synthesisPrompt = `Regenerate learning directions based on user feedback.

PREVIOUS DIRECTIONS (user wasn't satisfied):
${existingDirections}

REVIEW:
${reviewSummary}

USER FEEDBACK (this is why they clicked regenerate):
"${userFeedback}"

REQUIREMENTS:
- Apply user feedback to ALL directions
- Include at least 1 completely new approaches (not just reworded originals)

Return improved JSON with same format. Each direction must achieve user's complete goal.`;

    try {
      const finalResponse = await this.callAnthropic(
        'claude-sonnet-4-20250514',
        synthesisPrompt,
        systemPrompt,
      );

      this.logger.log('✅ Step 3: Claude synthesized final directions');

      return {
        ...finalResponse,
        tokensUsed: (geminiReview?.tokensUsed || 0) + finalResponse.tokensUsed,
        cost: (geminiReview?.cost || 0) + finalResponse.cost,
      };
    } catch (error) {
      this.logger.error(`Claude synthesis failed: ${error.message || error}`);
      throw new Error('Failed to regenerate directions. Please try again.');
    }
  }

  // ============ COMPANION-ENHANCED CURRICULUM ============

  /**
   * Generate curriculum with companion personality
   */
  async generateCurriculumWithCompanion(
    userId: string,
    topic: string,
    userMessage: string,
    baseCurriculumPrompt: string,
  ): Promise<AIResponse> {
    // Get companion context for personalization
    const companionContext =
      await this.companionService?.getUserContext(userId);

    let systemPrompt = baseCurriculumPrompt;

    if (companionContext && this.companionService) {
      // Get companion-flavored system prompt
      const companionPrompt = this.companionService.getCompanionSystemPrompt({
        ...companionContext,
        currentTopic: topic,
      });

      // Add companion personality to curriculum prompt
      systemPrompt = `${companionPrompt}\n\n${baseCurriculumPrompt}`;
    }

    // Make AI call with personalized prompt
    const response = await this.callAnthropic(
      'claude-sonnet-4-20250514',
      userMessage,
      systemPrompt,
    );

    // Transform response to companion voice
    if (companionContext && this.companionService) {
      response.content = this.companionService.transformToCompanionVoice(
        response.content,
        companionContext,
      );
    }

    return response;
  }

  /**
   * Get user's companion context
   */
  async getUserCompanionContext(
    userId: string,
  ): Promise<CompanionContext | null> {
    if (!this.companionService) {
      return null;
    }
    return this.companionService.getUserContext(userId);
  }
}
