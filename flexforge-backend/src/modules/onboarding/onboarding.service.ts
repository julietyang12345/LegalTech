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

    // Use cross-referencing when user provides feedback AND we have previous directions
    // Otherwise, generate fresh directions with Claude
    const response = (refinement?.userFeedback && refinement?.previousDirections)
      ? await this.aiService.crossReferencedRequest(
          userPrompt,
          systemPrompt,
          refinement.userFeedback,
          refinement.previousDirections,
        )
      : await this.aiService.routeRequest(
          AITask.SIMPLE_CLASSIFICATION,
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
        // Pass through languageConfig for CODE/AI_AGENT skillTypes
        languageConfig: d.languageConfig ? {
          recommended: String(d.languageConfig.recommended || 'TypeScript'),
          recommendedReason: String(d.languageConfig.recommendedReason || 'Best tooling support'),
          alternatives: Array.isArray(d.languageConfig.alternatives)
            ? d.languageConfig.alternatives.slice(0, 3).map((alt: any) => ({
                language: String(alt.language),
                reason: String(alt.reason || ''),
                tradeoffs: alt.tradeoffs ? String(alt.tradeoffs) : undefined,
              }))
            : [],
        } : undefined,
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
      selectedDirectionOutcome: dto.selectedDirectionOutcome,
      directionKeywords: dto.directionKeywords,
      selectedLanguage: dto.selectedLanguage,
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
    return `Generate 4-6 learning directions based on the user's goal.

GOAL TYPE DETECTION:
- PROJECT goal (e.g., "build a Reddit monitor that summarizes and emails"): Each direction is a DIFFERENT WAY to build the user's EXACT project. Not subtopics - the COMPLETE system.
  Example: code approach, no-code approach, AI-assisted approach, etc.
- LEARNING goal (e.g., "learn Python"): Each direction is a bounded subtopic (30-90 min).

FOR PROJECT GOALS - LOW FRICTION PATHS ONLY:
- Auto-deploy platforms (git push = live)
- No manual server config or SSH
- Free tier or <$20/month
- Each direction suits a different skill/preference (code vs no-code, quick vs production-ready)

DIRECTION REQUIREMENTS:
1. SEARCHABLE: Use common terms YouTube tutorials would use.
2. LOW-FRICTION: Prioritize managed services, serverless, auto-deploy.
3. TRADEOFFS: Each direction should suit a different user preference/skill.
4. PRESERVE CONTEXT: Direction titles/outcomes must include user's specific subject (e.g., "AI app", "Reddit bot"). Never strip context to generic tool tutorials.

GRANULARITY (for LEARNING goals):
- GOOD: "Webhooks + retries for reliable automations"
- TOO DETAILED: "Implement exponential backoff with jitter in NestJS"
- TOO VAGUE: "Learn programming"

SKILL TYPES: CODE, AI_AGENT, DESIGN, KNOWLEDGE, PHYSICAL

TOOL-SPECIFIC RULES:
- For LEARNING goals: up to 3 tool-specific directions
- For PROJECT goals: up to 5 tool-specific directions (prioritize tools)
- Majority must be FREE (isFree: true) - e.g., Python, VS Code, Git
- At most 1-2 paid/freemium (isFree: false) - add paymentNote

LANGUAGE CONFIG (for CODE/AI_AGENT skillTypes only):
- Include languageConfig with recommended language and reason
- Only add alternatives that are GENUINELY EQUIVALENT (not a downgrade)
- Alternatives should have sandbox support and similar learning curve
- Don't offer languages that would fundamentally change the project

Return JSON:
{
  "interpretedGoal": "Summary of goal",
  "directions": [{
    "title": "Short title (max 8 words)",
    "outcome": "You'll be able to... (one sentence)",
    "keywords": ["keyword1", "keyword2"],
    "skillType": "CODE",
    "isToolSpecific": false,
    "isFree": true,
    "paymentNote": null,
    "estimatedMinutes": 60,
    "languageConfig": {
      "recommended": "TypeScript",
      "recommendedReason": "Best tooling + instant preview in sandbox",
      "alternatives": [
        {"language": "Python", "reason": "Good for data-focused projects", "tradeoffs": "Slower feedback loop"}
      ]
    }
  }]
}

Note: languageConfig is ONLY for CODE/AI_AGENT skillTypes. Omit for KNOWLEDGE/PHYSICAL/DESIGN.`;
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

      if (refinement.userFeedback) {
        prompt += `\n\nUSER'S SPECIFIC FEEDBACK (IMPORTANT - address this directly):\n"${refinement.userFeedback}"`;
      }
    }

    prompt += `

First determine if this is a PROJECT goal or LEARNING goal.
- For PROJECT goals: generate 4-6 directions that each achieve the COMPLETE project using different approaches
- For LEARNING goals: generate 4-6 directions that each cover a bounded subtopic (30-90 min)

Include at least one tool-specific option if relevant.`;

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
