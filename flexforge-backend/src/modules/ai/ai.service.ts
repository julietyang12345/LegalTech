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

// Default daily spending limit in USD (can be overridden via env)
const DEFAULT_DAILY_SPENDING_LIMIT_USD = 10;

// Rolling window spending limits
const HALF_HOUR_SPENDING_LIMIT_USD = 2;
const HOURLY_SPENDING_LIMIT_USD = 4;
const HALF_HOUR_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1 second
const MAX_DELAY_MS = 60000; // 60 seconds

interface SpendingEntry {
  timestamp: number;
  cost: number;
}

export interface WindowStatus {
  spending: number;
  limit: number;
  remaining: number;
  blocked: boolean;
  resumesAt: string | null; // ISO timestamp when the oldest entry in the window expires
}

/**
 * Global spending tracker with multiple circuit breakers:
 * - $2 per rolling 30-minute window
 * - $4 per rolling 1-hour window
 * - $10 per day (resets at midnight UTC)
 */
class GlobalSpendingTracker {
  private dailySpending: number = 0;
  private currentDate: string = '';
  private dailyLimitUsd: number;
  private isDailyPaused: boolean = false;
  private spendingEntries: SpendingEntry[] = [];

  constructor(dailyLimitUsd: number) {
    this.dailyLimitUsd = dailyLimitUsd;
    this.resetIfNewDay();
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  private resetIfNewDay(): void {
    const today = this.getTodayDate();
    if (this.currentDate !== today) {
      this.dailySpending = 0;
      this.currentDate = today;
      this.isDailyPaused = false;
      this.spendingEntries = [];
    }
  }

  private pruneEntries(): void {
    // Remove entries older than 1 hour (the largest rolling window)
    const cutoff = Date.now() - HOUR_MS;
    this.spendingEntries = this.spendingEntries.filter(e => e.timestamp > cutoff);
  }

  private getWindowSpending(windowMs: number): { total: number; oldestTimestamp: number | null } {
    const cutoff = Date.now() - windowMs;
    let total = 0;
    let oldestTimestamp: number | null = null;
    for (const entry of this.spendingEntries) {
      if (entry.timestamp > cutoff) {
        total += entry.cost;
        if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
          oldestTimestamp = entry.timestamp;
        }
      }
    }
    return { total, oldestTimestamp };
  }

  addSpending(costUsd: number): void {
    this.resetIfNewDay();
    this.dailySpending += costUsd;
    this.spendingEntries.push({ timestamp: Date.now(), cost: costUsd });
    if (this.dailySpending >= this.dailyLimitUsd) {
      this.isDailyPaused = true;
    }
    this.pruneEntries();
  }

  checkLimit(): { allowed: boolean; currentSpending: number; limit: number; remaining: number; blockedBy: string | null } {
    this.resetIfNewDay();
    this.pruneEntries();

    // Check 30-minute window
    const halfHour = this.getWindowSpending(HALF_HOUR_MS);
    if (halfHour.total >= HALF_HOUR_SPENDING_LIMIT_USD) {
      return {
        allowed: false,
        currentSpending: halfHour.total,
        limit: HALF_HOUR_SPENDING_LIMIT_USD,
        remaining: 0,
        blockedBy: '30min',
      };
    }

    // Check 1-hour window
    const hourly = this.getWindowSpending(HOUR_MS);
    if (hourly.total >= HOURLY_SPENDING_LIMIT_USD) {
      return {
        allowed: false,
        currentSpending: hourly.total,
        limit: HOURLY_SPENDING_LIMIT_USD,
        remaining: 0,
        blockedBy: '1hour',
      };
    }

    // Check daily limit
    if (this.isDailyPaused || this.dailySpending >= this.dailyLimitUsd) {
      return {
        allowed: false,
        currentSpending: this.dailySpending,
        limit: this.dailyLimitUsd,
        remaining: 0,
        blockedBy: 'daily',
      };
    }

    return {
      allowed: true,
      currentSpending: this.dailySpending,
      limit: this.dailyLimitUsd,
      remaining: Math.max(0, this.dailyLimitUsd - this.dailySpending),
      blockedBy: null,
    };
  }

  getStatus(): {
    daily: { spending: number; limit: number; paused: boolean; date: string };
    halfHour: WindowStatus;
    hourly: WindowStatus;
  } {
    this.resetIfNewDay();
    this.pruneEntries();

    const halfHourData = this.getWindowSpending(HALF_HOUR_MS);
    const hourlyData = this.getWindowSpending(HOUR_MS);

    const halfHourBlocked = halfHourData.total >= HALF_HOUR_SPENDING_LIMIT_USD;
    const hourlyBlocked = hourlyData.total >= HOURLY_SPENDING_LIMIT_USD;

    return {
      daily: {
        spending: this.dailySpending,
        limit: this.dailyLimitUsd,
        paused: this.isDailyPaused,
        date: this.currentDate,
      },
      halfHour: {
        spending: halfHourData.total,
        limit: HALF_HOUR_SPENDING_LIMIT_USD,
        remaining: Math.max(0, HALF_HOUR_SPENDING_LIMIT_USD - halfHourData.total),
        blocked: halfHourBlocked,
        resumesAt: halfHourBlocked && halfHourData.oldestTimestamp
          ? new Date(halfHourData.oldestTimestamp + HALF_HOUR_MS).toISOString()
          : null,
      },
      hourly: {
        spending: hourlyData.total,
        limit: HOURLY_SPENDING_LIMIT_USD,
        remaining: Math.max(0, HOURLY_SPENDING_LIMIT_USD - hourlyData.total),
        blocked: hourlyBlocked,
        resumesAt: hourlyBlocked && hourlyData.oldestTimestamp
          ? new Date(hourlyData.oldestTimestamp + HOUR_MS).toISOString()
          : null,
      },
    };
  }

  // For manual override (e.g., admin reset)
  reset(): void {
    this.dailySpending = 0;
    this.isDailyPaused = false;
    this.spendingEntries = [];
  }

  setDailyLimit(newLimit: number): void {
    this.dailyLimitUsd = newLimit;
    // Re-check if we should be paused with new limit
    this.isDailyPaused = this.dailySpending >= this.dailyLimitUsd;
  }
}

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

  // Reps (practice scenarios)
  REP_SCENARIO_GENERATION = 'REP_SCENARIO_GENERATION',
  REP_HINT = 'REP_HINT',
  REP_FEEDBACK = 'REP_FEEDBACK',

  // Reps (quiz mode)
  REP_QUIZ_GENERATION = 'REP_QUIZ_GENERATION',
  REP_QUIZ_FEEDBACK = 'REP_QUIZ_FEEDBACK',
}

export interface AIResponse {
  content: string;
  tokensUsed: number;
  cost: number;
  provider: string;
  model: string;
  cacheHit?: boolean;
  truncated?: boolean; // true when stop_reason is "max_tokens" (output was cut off)
}

export interface CacheablePrompt {
  staticPart: string; // Cacheable instructions (>1024 tokens)
  dynamicPart: string; // User-specific context
}

// Custom exception for spending limit exceeded
export class GlobalSpendingLimitExceededError extends Error {
  constructor(
    public readonly currentSpending: number,
    public readonly limit: number,
    public readonly window: '30min' | '1hour' | 'daily' = 'daily',
  ) {
    const windowLabel = window === '30min' ? '30-minute' : window === '1hour' ? '1-hour' : 'daily';
    super(
      `Global ${windowLabel} AI spending limit exceeded. Current: $${currentSpending.toFixed(2)}, Limit: $${limit.toFixed(2)}. Service paused until window resets.`,
    );
    this.name = 'GlobalSpendingLimitExceededError';
  }
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

  // Global spending tracker (shared across all instances)
  private static spendingTracker: GlobalSpendingTracker;

  // Cost per 1M tokens (input + output average)
  private readonly costs = {
    'claude-sonnet-4': 0.05,
    'claude-haiku-3.5': 0.005,
    'gemini-2.0-flash': 0.02,
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
    this.initializeSpendingTracker();
  }

  private initializeSpendingTracker(): void {
    // Initialize global spending tracker only once (static)
    if (!AiService.spendingTracker) {
      const limit = this.configService.get<number>('ai.dailySpendingLimitUsd') || DEFAULT_DAILY_SPENDING_LIMIT_USD;
      AiService.spendingTracker = new GlobalSpendingTracker(limit);
      this.logger.log(`💰 Spending circuit breakers: $${HALF_HOUR_SPENDING_LIMIT_USD}/30min, $${HOURLY_SPENDING_LIMIT_USD}/hour, $${limit}/day`);
    }
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
    // Check global spending limits BEFORE doing anything (30min, 1hour, daily)
    const spendingStatus = AiService.spendingTracker.checkLimit();
    if (!spendingStatus.allowed) {
      this.logger.error(
        `🚫 Global spending limit exceeded (${spendingStatus.blockedBy})! Current: $${spendingStatus.currentSpending.toFixed(2)}, Limit: $${spendingStatus.limit.toFixed(2)}`,
      );
      throw new GlobalSpendingLimitExceededError(
        spendingStatus.currentSpending,
        spendingStatus.limit,
        spendingStatus.blockedBy as '30min' | '1hour' | 'daily',
      );
    }

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

          // Track spending after successful call
          AiService.spendingTracker.addSpending(response.cost);
          const status = AiService.spendingTracker.getStatus();

          this.logger.log(
            `✅ ${provider} success. Tokens: ${response.tokensUsed}, Cost: $${response.cost.toFixed(4)} | 30m: $${status.halfHour.spending.toFixed(2)}/$${status.halfHour.limit} | 1h: $${status.hourly.spending.toFixed(2)}/$${status.hourly.limit} | Daily: $${status.daily.spending.toFixed(2)}/$${status.daily.limit}`,
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
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.ALTERNATIVE_EXPLANATION]: [
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.CODE_REVIEW]: [
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      ],
      [AITask.STUCK_DETECTION]: [
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.LIFE_HAPPENS_ADJUST]: [
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.REFLECTION_ANALYSIS]: [
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.LIGHTWEIGHT_CONTENT]: [
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],

      // Video/Multimodal
      [AITask.VIDEO_SUMMARY]: [
        { provider: 'gemini', model: 'gemini-2.0-flash' },
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
      ],
      [AITask.VIDEO_TIMESTAMP_EXTRACTION]: [
        { provider: 'gemini', model: 'gemini-2.0-flash' },
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
      ],
      [AITask.VIDEO_CHAPTER_GENERATION]: [
        { provider: 'gemini', model: 'gemini-2.0-flash' },
      ],
      [AITask.TRANSCRIPT_ANALYSIS]: [
        { provider: 'gemini', model: 'gemini-2.0-flash' },
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
      ],
      [AITask.VISUAL_CONTENT_ANALYSIS]: [
        { provider: 'gemini', model: 'gemini-2.0-flash' },
      ],

      // Basic logic
      [AITask.BATCH_LOGIC]: [
        { provider: 'openai', model: 'gpt-4o-mini' },
        { provider: 'gemini', model: 'gemini-2.0-flash' },
      ],
      [AITask.QUIZ_GENERATION]: [
        { provider: 'openai', model: 'gpt-4o-mini' },
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
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
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
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

      // Reps
      [AITask.REP_SCENARIO_GENERATION]: [
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        { provider: 'openai', model: 'gpt-4o' },
      ],
      [AITask.REP_HINT]: [
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.REP_FEEDBACK]: [
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        { provider: 'openai', model: 'gpt-4o' },
      ],

      // Reps (quiz mode)
      [AITask.REP_QUIZ_GENERATION]: [
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        { provider: 'openai', model: 'gpt-4o' },
      ],
      [AITask.REP_QUIZ_FEEDBACK]: [
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        { provider: 'openai', model: 'gpt-4o' },
      ],
    };

    return (
      routes[task] || [
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
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
    // Haiku has a lower max_tokens limit (8192) than Sonnet/Opus (16384)
    const maxTokens = model.includes('haiku') ? 8192 : 16384;

    const response = await this.anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt || '',
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    const text = content.type === 'text' ? content.text : '';
    const truncated = response.stop_reason === 'max_tokens';

    if (truncated) {
      this.logger.warn(
        `⚠️ Response truncated (hit max_tokens: ${maxTokens}). Output may be incomplete.`,
      );
    }

    return {
      content: text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      cost: this.calculateCost(
        model,
        response.usage.input_tokens + response.usage.output_tokens,
      ),
      provider: 'anthropic',
      model,
      truncated,
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

      // Haiku has a lower max_tokens limit (8192) than Sonnet/Opus (16384)
      const maxTokens = model.includes('haiku') ? 8192 : 16384;

      const stream = await this.anthropic.messages.stream({
        model,
        max_tokens: maxTokens,
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

      // Haiku has a lower max_tokens limit (8192) than Sonnet/Opus (16384)
      const maxTokens = model.includes('haiku') ? 8192 : 16384;

      this.logger.log(`🤖 callAnthropicWithCache using model: ${model}`);

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemBlocks,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      const text = content.type === 'text' ? content.text : '';

      // Check if cache was used
      const cacheHit = (response as any).usage?.cache_read_input_tokens > 0;
      const truncated = response.stop_reason === 'max_tokens';

      if (cacheHit) {
        this.logger.log(
          `🎯 Cache HIT - saved ${(response as any).usage.cache_read_input_tokens} tokens`,
        );
      }
      if (truncated) {
        this.logger.warn(
          `⚠️ Response truncated (hit max_tokens: ${maxTokens}). Output may be incomplete.`,
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
        truncated,
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
    // Pricing per 1M tokens - varies by model
    const isHaiku = model.includes('haiku');
    const inputCost = isHaiku ? 0.8 : 3.0;       // Haiku: $0.80/1M, Sonnet: $3/1M
    const outputCost = isHaiku ? 4.0 : 15.0;      // Haiku: $4/1M, Sonnet: $15/1M
    const cacheWriteCost = isHaiku ? 1.0 : 3.75;   // Haiku: $1/1M, Sonnet: $3.75/1M
    const cacheReadCost = isHaiku ? 0.08 : 0.3;    // Haiku: $0.08/1M, Sonnet: $0.30/1M

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
    this.logger.log('🔄 Regenerating directions with user feedback (single Claude call)');

    // Single Claude call: review + synthesize in one prompt
    const synthesisPrompt = `Regenerate learning directions based on user feedback.

PREVIOUS DIRECTIONS (user wasn't satisfied):
${existingDirections}

USER FEEDBACK (this is why they clicked regenerate):
"${userFeedback}"

SELF-REVIEW CHECKLIST (apply before generating):
- Are all direction titles searchable on YouTube/Google? (no vague terms)
- Is each direction scoped to 30-90 minutes daily? (not too broad)
- Are there diverse approaches? (not all similar angles)
- Are there low-friction options? (at least 1 requiring no paid tools)
- Does each direction align with the user's feedback?

REQUIREMENTS:
- Apply user feedback to ALL directions
- Include at least 1 completely new approach (not just reworded originals)
- Fix any issues found in the self-review

Return improved JSON with same format. Each direction must achieve user's complete goal.`;

    try {
      const finalResponse = await this.callAnthropic(
        'claude-sonnet-4-20250514',
        synthesisPrompt,
        systemPrompt,
      );

      this.logger.log('✅ Directions regenerated with review + synthesis');

      return finalResponse;
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

  // ============ GLOBAL SPENDING MANAGEMENT ============

  /**
   * Get current global spending status across all circuit breakers
   */
  getSpendingStatus() {
    return AiService.spendingTracker.getStatus();
  }

  /**
   * Reset global spending (admin only)
   * Use cautiously - this allows AI calls to resume if any limit was hit
   */
  resetSpending(): void {
    this.logger.warn('⚠️ Global spending manually reset by admin');
    AiService.spendingTracker.reset();
  }

  /**
   * Update the global daily spending limit (admin only)
   * @param newLimitUsd New limit in USD
   */
  setSpendingLimit(newLimitUsd: number): void {
    this.logger.log(`💰 Global daily spending limit updated to $${newLimitUsd}`);
    AiService.spendingTracker.setDailyLimit(newLimitUsd);
  }
}
