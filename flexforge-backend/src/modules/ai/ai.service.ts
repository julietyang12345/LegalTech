import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { CompanionService, CompanionContext } from '../companion/companion.service';

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
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private anthropic: Anthropic;
  private openai: OpenAI;
  private gemini: GoogleGenerativeAI;
  private groq: Groq;

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
      } catch (error) {
        this.logger.error(
          `❌ ${provider} failed for ${task}:`,
          error.message,
        );

        // Try next provider in fallback chain
        continue;
      }
    }

    throw new Error(`All AI providers failed for task: ${task}`);
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
        { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' },
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.ALTERNATIVE_EXPLANATION]: [
        { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.CODE_REVIEW]: [
        { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' },
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      ],
      [AITask.STUCK_DETECTION]: [
        { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.LIFE_HAPPENS_ADJUST]: [
        { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.REFLECTION_ANALYSIS]: [
        { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' },
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],

      // Video/Multimodal
      [AITask.VIDEO_SUMMARY]: [
        { provider: 'gemini', model: 'gemini-2.0-flash-exp' },
        { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' },
      ],
      [AITask.VIDEO_TIMESTAMP_EXTRACTION]: [
        { provider: 'gemini', model: 'gemini-2.0-flash-exp' },
        { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' },
      ],
      [AITask.VIDEO_CHAPTER_GENERATION]: [
        { provider: 'gemini', model: 'gemini-2.0-flash-exp' },
      ],
      [AITask.TRANSCRIPT_ANALYSIS]: [
        { provider: 'gemini', model: 'gemini-2.0-flash-exp' },
        { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' },
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
        { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' },
      ],
      [AITask.SPACED_REPETITION_SCHEDULE]: [
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.SIMPLE_CLASSIFICATION]: [
        { provider: 'openai', model: 'gpt-4o-mini' },
      ],
      [AITask.DATA_VALIDATION]: [
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

    return routes[task] || [
      { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' },
    ];
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
    const genModel = this.gemini.getGenerativeModel({ model });

    const fullPrompt = systemPrompt
      ? `${systemPrompt}\n\n${prompt}`
      : prompt;

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
    const companionContext = await this.companionService?.getUserContext(userId);

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
  async getUserCompanionContext(userId: string): Promise<CompanionContext | null> {
    if (!this.companionService) {
      return null;
    }
    return this.companionService.getUserContext(userId);
  }
}
