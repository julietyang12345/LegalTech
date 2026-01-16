import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { AiService, AITask } from '../ai/ai.service';
import {
  LearnerPrefs,
  LearningDirection,
  RefinementContext,
  DirectionsResponse,
  CompleteOnboardingDto,
} from '../curriculum/types/learner-prefs.interface';
import { SkillType } from '../curriculum/services/skill-detector.service';
import { parseAiJson } from '../curriculum/utils/shared.utils';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private aiService: AiService,
  ) {}

  /**
   * Generate 4-6 learning directions based on user's goal and optional refinement.
   * Directions are intentionally "not too detailed" so video matching succeeds.
   */
  async generateDirections(
    goal: string,
    refinement?: RefinementContext,
  ): Promise<DirectionsResponse> {
    this.logger.log(`Generating directions for goal: "${goal}"`);

    const systemPrompt = this.buildDirectionSystemPrompt();
    const userPrompt = this.buildDirectionUserPrompt(goal, refinement);

    const response = await this.aiService.routeRequest(
      AITask.SIMPLE_CLASSIFICATION, // Fast, cheap model is fine for this
      userPrompt,
      systemPrompt,
    );

    const parsed = parseAiJson(response.content);

    if (!parsed || !Array.isArray(parsed.directions)) {
      this.logger.error('Failed to parse AI response for directions');
      return {
        directions: this.getFallbackDirections(goal),
        interpretedGoal: goal,
      };
    }

    // Validate and normalize directions
    let allDirections = parsed.directions
      .slice(0, 8) // Get more initially, we'll filter
      .map((d: any, index: number) => ({
        id: `dir-${index + 1}`,
        title: String(d.title || `Direction ${index + 1}`).slice(0, 60),
        outcome: String(d.outcome || 'Learn the basics').slice(0, 150),
        keywords: Array.isArray(d.keywords)
          ? d.keywords.slice(0, 5).map(String)
          : [],
        isToolSpecific: Boolean(d.isToolSpecific),
        isFree: d.isFree !== false, // Default to free if not specified
        paymentNote: d.isToolSpecific && !d.isFree ? String(d.paymentNote || 'May require payment') : undefined,
        estimatedMinutes: Number(d.estimatedMinutes) || 60,
        skillType: this.parseSkillType(d.skillType),
      })) as LearningDirection[];

    // Separate concept vs tool-specific
    // Allow up to 3 tool directions, but at least 2 must be free
    const conceptDirections = allDirections.filter(d => !d.isToolSpecific);
    const freeToolDirections = allDirections.filter(d => d.isToolSpecific && d.isFree);
    const paidToolDirections = allDirections.filter(d => d.isToolSpecific && !d.isFree);

    // Take up to 2 free tools first, then at most 1 paid tool (total max 3)
    const toolDirections = [
      ...freeToolDirections.slice(0, 2),
      ...paidToolDirections.slice(0, Math.min(1, 3 - freeToolDirections.slice(0, 2).length)),
    ].slice(0, 3);

    // Combine: concepts first, then tools (max 6 total)
    const directions = [...conceptDirections, ...toolDirections]
      .slice(0, 6)
      .map((d, i) => ({ ...d, id: `dir-${i + 1}` }));

    this.logger.log(`Generated ${directions.length} directions (${toolDirections.length} tool-specific)`);

    return {
      directions,
      interpretedGoal: parsed.interpretedGoal || goal,
    };
  }

  /**
   * Save learner preferences after onboarding completes.
   */
  async savePreferences(
    userId: string,
    dto: CompleteOnboardingDto,
  ): Promise<void> {
    this.logger.log(`Saving preferences for user ${userId}`);

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const learnerPrefs: LearnerPrefs = {
      originalGoal: dto.originalGoal,
      selectedDirection: dto.selectedDirection,
      directionKeywords: dto.directionKeywords,
      contentDepth: dto.contentDepth,
      platformTolerance: dto.platformTolerance,
      outputType: dto.outputType,
      usageContext: dto.usageContext,
      dailyMinutes: dto.dailyMinutes,
      skillLevel: dto.skillLevel,
      completedOnboarding: true,
      onboardingCompletedAt: new Date().toISOString(),
      version: 1,
    };

    // Merge with existing preferences
    user.preferences = {
      ...user.preferences,
      learner: learnerPrefs,
    };

    await this.userRepository.save(user);
    this.logger.log(`Saved learner preferences for user ${userId}`);
  }

  /**
   * Check if user needs onboarding.
   */
  async getOnboardingStatus(
    userId: string,
  ): Promise<{ completedOnboarding: boolean; needsOnboarding: boolean }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const completedOnboarding =
      user.preferences?.learner?.completedOnboarding ?? false;

    return {
      completedOnboarding,
      needsOnboarding: !completedOnboarding,
    };
  }

  /**
   * Reset onboarding - clears learner preferences so user can start over.
   */
  async resetOnboarding(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Clear learner preferences
    if (user.preferences) {
      delete user.preferences.learner;
    }

    await this.userRepository.save(user);
    this.logger.log(`Reset onboarding for user ${userId}`);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private buildDirectionSystemPrompt(): string {
    return `You are helping a learner find the right learning direction.

Your job is to interpret their goal and generate 4-6 concrete learning directions.

Each direction MUST be:
1. SEARCHABLE: Use common terms that YouTube tutorials and courses would use. No niche jargon.
2. BOUNDED: Achievable in 30-90 minutes of focused learning. Not a whole course.
3. ACTIONABLE: Can become a concrete curriculum topic with clear learning outcomes.

GRANULARITY RULES (CRITICAL):
- GOOD: "Webhooks + retries for reliable automations"
- TOO DETAILED: "Implement exponential backoff with jitter in NestJS axios interceptors"
- TOO VAGUE: "Learn programming"

Keep directions broad enough that video search will find good matches.

SKILL TYPE DETECTION (REQUIRED for each direction):
Classify each direction into one of these skill types:
- CODE: Programming, software development, coding tutorials (Python, JavaScript, APIs, etc.)
- AI_AGENT: AI agents, automation with AI, LLM integrations
- DESIGN: UI/UX design, graphic design, visual design tools
- KNOWLEDGE: Academic learning, languages, theory, concepts (French, history, math, etc.)
- PHYSICAL: Sports, music, dance, physical activities, hands-on crafts

TOOL-SPECIFIC DIRECTIONS:
- Include UP TO 3 tool-specific directions (isToolSpecific: true)
- AT LEAST 2 must be FREE tools (isFree: true) - e.g., Python, Node.js, VS Code, Git
- AT MOST 1 can be a paid/freemium tool (isFree: false) - e.g., Zapier, Make, AWS
- For paid tools, set isFree: false and add paymentNote
- paymentNote examples: "May require paid subscription", "Free tier available with limits", "Paid service"

COMMON TOOLS REFERENCE:
- FREE: Python, JavaScript, Node.js, VS Code, Git, Docker (free tier), PostgreSQL, MongoDB (free tier)
- PAID/FREEMIUM: Zapier, Make, AWS, GCP, Azure, Notion API, Airtable, Slack (advanced features)

Return JSON in this exact format:
{
  "interpretedGoal": "Brief summary of what you understood",
  "directions": [
    {
      "title": "Short title (max 8 words)",
      "outcome": "You'll be able to... (one sentence)",
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "skillType": "CODE",
      "isToolSpecific": false,
      "isFree": true,
      "paymentNote": null,
      "estimatedMinutes": 60
    },
    {
      "title": "Learn French conversation basics",
      "outcome": "You'll hold basic conversations in French",
      "keywords": ["French", "conversation", "language learning"],
      "skillType": "KNOWLEDGE",
      "isToolSpecific": false,
      "isFree": true,
      "paymentNote": null,
      "estimatedMinutes": 45
    }
  ]
}`;
  }

  private buildDirectionUserPrompt(
    goal: string,
    refinement?: RefinementContext,
  ): string {
    let prompt = `USER'S GOAL: "${goal}"`;

    if (refinement) {
      prompt += `

REFINEMENT CONTEXT (user clarified their intent):`;

      if (refinement.outputType) {
        const outputLabels = {
          working_code: 'They want to write working code',
          understand_concept: 'They want to understand concepts (not necessarily code)',
          fix_bug: 'They want to fix a specific bug or problem',
          ship_project: 'They want to ship a small project',
        };
        prompt += `\n- Output type: ${outputLabels[refinement.outputType]}`;
      }

      if (refinement.usageContext) {
        const contextLabels = {
          work: 'This is for work',
          personal: 'This is for a personal project',
          interview: 'This is for interview prep',
          school: 'This is for school/learning',
        };
        prompt += `\n- Context: ${contextLabels[refinement.usageContext]}`;
      }

      if (refinement.timeMinutes) {
        prompt += `\n- Available time: ${refinement.timeMinutes} minutes per session`;
      }

      if (refinement.skillLevel) {
        prompt += `\n- Skill level: ${refinement.skillLevel}`;
      }

      if (refinement.platformTolerance) {
        const toleranceLabels = {
          any: 'Okay with tool-specific tutorials (Zapier, Make, etc.)',
          preferGeneric: 'Prefers concepts but tools are okay',
          genericOnly: 'Wants vendor-neutral content only',
        };
        prompt += `\n- Platform tolerance: ${toleranceLabels[refinement.platformTolerance]}`;
      }
    }

    prompt += `

Generate 4-6 learning directions. Include at least one tool-specific option if relevant.
Remember: directions must be searchable (common terms) and bounded (30-90 min).`;

    return prompt;
  }

  /**
   * Parse and validate skillType from AI response.
   */
  private parseSkillType(value: any): SkillType {
    const validTypes = Object.values(SkillType);
    const normalized = String(value || '').toUpperCase();
    if (validTypes.includes(normalized as SkillType)) {
      return normalized as SkillType;
    }
    // Default to CODE if not recognized
    return SkillType.CODE;
  }

  /**
   * Fallback directions if AI fails to generate.
   */
  private getFallbackDirections(goal: string): LearningDirection[] {
    // Extract key terms from goal for basic directions
    const goalLower = goal.toLowerCase();

    // Detect common themes
    const isAI =
      goalLower.includes('ai') ||
      goalLower.includes('automation') ||
      goalLower.includes('agent');
    const isWeb =
      goalLower.includes('web') ||
      goalLower.includes('api') ||
      goalLower.includes('frontend');
    const isPython =
      goalLower.includes('python') || goalLower.includes('data');

    if (isAI) {
      return [
        {
          id: 'fallback-1',
          title: 'AI fundamentals and prompting',
          outcome: "You'll understand how to work with AI models effectively",
          keywords: ['AI', 'prompting', 'ChatGPT', 'fundamentals'],
          isToolSpecific: false,
          estimatedMinutes: 60,
          skillType: SkillType.AI_AGENT,
        },
        {
          id: 'fallback-2',
          title: 'Automation basics with triggers and actions',
          outcome: "You'll be able to build simple automated workflows",
          keywords: ['automation', 'workflows', 'triggers', 'actions'],
          isToolSpecific: false,
          estimatedMinutes: 45,
          skillType: SkillType.AI_AGENT,
        },
        {
          id: 'fallback-3',
          title: 'Zapier/Make automation tutorial',
          outcome: "You'll build automations using popular no-code tools",
          keywords: ['Zapier', 'Make', 'automation', 'no-code'],
          isToolSpecific: true,
          estimatedMinutes: 60,
          skillType: SkillType.AI_AGENT,
        },
      ];
    }

    if (isWeb) {
      return [
        {
          id: 'fallback-1',
          title: 'Web development fundamentals',
          outcome: "You'll understand HTML, CSS, and JavaScript basics",
          keywords: ['web development', 'HTML', 'CSS', 'JavaScript'],
          isToolSpecific: false,
          estimatedMinutes: 60,
          skillType: SkillType.CODE,
        },
        {
          id: 'fallback-2',
          title: 'Building APIs with REST',
          outcome: "You'll be able to create and consume REST APIs",
          keywords: ['API', 'REST', 'HTTP', 'backend'],
          isToolSpecific: false,
          estimatedMinutes: 60,
          skillType: SkillType.CODE,
        },
      ];
    }

    if (isPython) {
      return [
        {
          id: 'fallback-1',
          title: 'Python basics and syntax',
          outcome: "You'll write basic Python programs",
          keywords: ['Python', 'programming', 'basics', 'syntax'],
          isToolSpecific: false,
          estimatedMinutes: 60,
          skillType: SkillType.CODE,
        },
        {
          id: 'fallback-2',
          title: 'Data analysis with Pandas',
          outcome: "You'll analyze data using Python and Pandas",
          keywords: ['Python', 'Pandas', 'data analysis', 'dataframe'],
          isToolSpecific: false,
          estimatedMinutes: 60,
          skillType: SkillType.CODE,
        },
      ];
    }

    // Generic fallback
    return [
      {
        id: 'fallback-1',
        title: 'Getting started with the basics',
        outcome: "You'll understand the fundamental concepts",
        keywords: ['basics', 'fundamentals', 'tutorial', 'beginner'],
        isToolSpecific: false,
        estimatedMinutes: 60,
        skillType: SkillType.KNOWLEDGE,
      },
      {
        id: 'fallback-2',
        title: 'Hands-on practice project',
        outcome: "You'll build something practical to apply your learning",
        keywords: ['project', 'hands-on', 'practical', 'build'],
        isToolSpecific: false,
        estimatedMinutes: 60,
        skillType: SkillType.KNOWLEDGE,
      },
    ];
  }
}
