import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Progress } from '../../database/entities/progress.entity';
import { Session } from '../../database/entities/session.entity';
import { User, QuotaTier } from '../../database/entities/user.entity';
import { AiService, AITask } from '../ai/ai.service';

export class UpdateProgressDto {
  completed?: boolean;
  confidenceScore?: number;
  timeSpentMinutes?: number;
  notes?: string;
  submittedCode?: string;
}

@Injectable()
export class ProgressService {
  constructor(
    @InjectRepository(Progress)
    private progressRepository: Repository<Progress>,
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private aiService: AiService,
  ) {}

  async findBySession(sessionId: string, userId: string): Promise<Progress[]> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return this.progressRepository.find({
      where: { sessionId },
      order: { dayNumber: 'ASC', createdAt: 'ASC' },
    });
  }

  async updateTask(
    sessionId: string,
    taskId: string,
    userId: string,
    updateProgressDto: UpdateProgressDto,
  ): Promise<Progress> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const dayMatch = taskId.match(/day(\d+)/);
    const dayNumber = dayMatch ? parseInt(dayMatch[1]) : 1;

    let progress = await this.progressRepository.findOne({
      where: { sessionId, taskId },
    });

    if (!progress) {
      let taskType = 'task1';
      if (taskId.includes('practice')) taskType = 'practice';
      if (taskId.includes('boss')) taskType = 'boss';

      progress = this.progressRepository.create({
        sessionId,
        taskId,
        dayNumber,
        taskType,
      });
    }

    Object.assign(progress, updateProgressDto);

    if (updateProgressDto.completed && !progress.completedAt) {
      progress.completedAt = new Date();
    }

    progress.lastAttemptAt = new Date();
    progress.attempts = (progress.attempts || 0) + 1;

    const savedProgress = await this.progressRepository.save(progress);

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (
      user?.hasTierAccess(QuotaTier.PREMIUM) &&
      savedProgress.confidenceScore
    ) {
      await this.checkDifficultyAdjustment(session, savedProgress, userId);
    }

    return savedProgress;
  }

  private async checkDifficultyAdjustment(
    session: Session,
    latestProgress: Progress,
    userId: string,
  ): Promise<void> {
    const dayProgress = await this.progressRepository.find({
      where: {
        sessionId: session.id,
        dayNumber: latestProgress.dayNumber,
      },
    });

    const confidenceScores = dayProgress
      .filter((p) => p.completed && p.confidenceScore)
      .map((p) => p.confidenceScore);

    if (confidenceScores.length === 0) return;

    const avgConfidence =
      confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length;

    const weakAreas: string[] = dayProgress
      .filter((p) => p.completed && p.confidenceScore && p.confidenceScore < 3)
      .map((p) => {
        const topicMatch = p.taskId.match(/-([\w]+)$/);
        return topicMatch ? topicMatch[1] : null;
      })
      .filter(Boolean) as string[];

    const nextDay = session.curriculum.days.find(
      (d) => d.day === latestProgress.dayNumber + 1,
    );

    if (!nextDay) return;

    if (avgConfidence >= 4) {
      await this.addChallengeExtensions(nextDay, session.skillName);
      nextDay.adaptationNote =
        "💎 Challenge increased! You're excelling, so we added advanced exercises.";
    } else if (avgConfidence < 3) {
      await this.simplifyAndReinforce(nextDay, weakAreas, session.skillName);
      nextDay.adaptationNote =
        '🎯 Adjusted for better learning. We simplified tasks and added focused practice on weak areas.';
    }

    await this.sessionRepository.save(session);
  }

  private async addChallengeExtensions(
    day: any,
    skillName: string,
  ): Promise<void> {
    try {
      const prompt = `Add 2-3 challenge stretch goals:

Skill: ${skillName}
Project: ${day.task1?.title || day.bossMilestone?.title || 'Practice'}

Return ONLY JSON:
{
  "stretchGoals": [
    {"goal": "...", "hint": "...", "estimatedMinutes": 10}
  ]
}`;

      const response = await this.aiService.routeRequest(
        AITask.SIMPLE_CLASSIFICATION,
        prompt,
      );

      const additions = JSON.parse(response.content);

      if (day.bossMilestone) {
        day.bossMilestone.stretchGoals = [
          ...(day.bossMilestone.stretchGoals || []),
          ...additions.stretchGoals,
        ];
      }
    } catch (error) {
      if (day.bossMilestone) {
        day.bossMilestone.stretchGoals = [
          {
            goal: 'Add error handling for edge cases',
            hint: 'Think about what could go wrong',
            estimatedMinutes: 10,
          },
        ];
      }
    }
  }

  private async simplifyAndReinforce(
    day: any,
    weakAreas: string[],
    skillName: string,
  ): Promise<void> {
    if (day.bossMilestone) {
      day.bossMilestone.simplifiedMode = true;
      day.bossMilestone.hint1 =
        "SIMPLIFIED: Let's break this into smaller steps...";
      day.bossMilestone.subSteps = [
        'Step 1: Set up basic structure',
        'Step 2: Add core functionality',
        'Step 3: Test one feature at a time',
      ];
    }

    if (weakAreas.length > 0) {
      try {
        const prompt = `Generate 2 reinforcement exercises:

Skill: ${skillName}
Weak areas: ${weakAreas.join(', ')}

Return ONLY JSON with 2 simple exercises.`;

        const response = await this.aiService.routeRequest(
          AITask.TUTOR_CHAT,
          prompt,
        );

        const reinforcement = JSON.parse(response.content);
        day.reinforcementExercises = reinforcement.exercises;
      } catch (error) {
        // Fail silently
      }
    }
  }

  async getStats(sessionId: string, userId: string) {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['progress'],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const totalTasks = session.curriculum.days.reduce((sum, day) => {
      let dayTasks = 0;
      if (day.task1) dayTasks++;
      if (day.bossMilestone) dayTasks++;
      if (day.bossProject) dayTasks++;
      return sum + dayTasks;
    }, 0);

    const completedTasks = session.progress.filter((p) => p.completed).length;
    const completionPercentage =
      totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    const confidenceScores = session.progress
      .filter((p) => p.completed && p.confidenceScore)
      .map((p) => p.confidenceScore);

    const averageConfidence =
      confidenceScores.length > 0
        ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
        : 0;

    const totalTimeSpent = session.progress.reduce(
      (sum, p) => sum + (p.timeSpentMinutes || 0),
      0,
    );

    const progressByDay = session.curriculum.days.map((day) => {
      const dayProgress = session.progress.filter(
        (p) => p.dayNumber === day.day,
      );

      let dayTotalTasks = 0;
      if (day.task1) dayTotalTasks++;
      if (day.bossMilestone) dayTotalTasks++;
      if (day.bossProject) dayTotalTasks++;

      const dayCompletedTasks = dayProgress.filter((p) => p.completed).length;
      const dayConfidenceScores = dayProgress
        .filter((p) => p.completed && p.confidenceScore)
        .map((p) => p.confidenceScore);

      return {
        day: day.day,
        totalTasks: dayTotalTasks,
        completedTasks: dayCompletedTasks,
        averageConfidence:
          dayConfidenceScores.length > 0
            ? dayConfidenceScores.reduce((a, b) => a + b, 0) /
              dayConfidenceScores.length
            : 0,
      };
    });

    return {
      totalTasks,
      completedTasks,
      completionPercentage: Math.round(completionPercentage * 10) / 10,
      averageConfidence: Math.round(averageConfidence * 10) / 10,
      totalTimeSpent,
      progressByDay,
    };
  }

  async generatePersonalizedReview(sessionId: string, userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user?.hasTierAccess(QuotaTier.PRO)) {
      throw new ForbiddenException(
        'Personalized reviews require PRO tier or higher',
      );
    }

    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['progress'],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const weakTopics = new Map<string, number[]>();

    session.progress.forEach((p) => {
      if (p.completed && p.confidenceScore && p.confidenceScore < 3) {
        const topicMatch = p.taskId.match(/-([\w]+)$/);
        const topic = topicMatch ? topicMatch[1] : 'general';

        if (!weakTopics.has(topic)) {
          weakTopics.set(topic, []);
        }
        weakTopics.get(topic).push(p.confidenceScore);
      }
    });

    const focusAreas = Array.from(weakTopics.keys()).slice(0, 3);

    if (focusAreas.length === 0) {
      return {
        questions: [],
        focusAreas: [],
      };
    }

    const prompt = `Generate 5 review questions for ${session.skillName}.
Weak areas: ${focusAreas.join(', ')}

Return ONLY JSON with questions array.`;

    const response = await this.aiService.routeRequest(
      AITask.TUTOR_CHAT,
      prompt,
    );

    const parsed = JSON.parse(response.content);

    return {
      questions: parsed.questions,
      focusAreas,
    };
  }

  async checkStuckStatus(sessionId: string, userId: string) {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['progress'],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const recentProgress = session.progress.filter((p) => {
      const hoursSinceUpdate =
        (Date.now() - new Date(p.updatedAt).getTime()) / (1000 * 60 * 60);
      return hoursSinceUpdate < 72;
    });

    if (recentProgress.length === 0 && session.progress.length > 0) {
      return {
        isStuck: true,
        reason: 'No progress in the last 72 hours',
        recommendations: [
          'Break current task into smaller steps',
          "Review previous day's materials",
          'Try Extended Mode for more time',
        ],
      };
    }

    const recentConfidenceScores = session.progress
      .filter((p) => p.completed && p.confidenceScore)
      .slice(-5)
      .map((p) => p.confidenceScore);

    if (recentConfidenceScores.length >= 3) {
      const avgRecentConfidence =
        recentConfidenceScores.reduce((a, b) => a + b, 0) /
        recentConfidenceScores.length;

      if (avgRecentConfidence < 3) {
        return {
          isStuck: true,
          reason: 'Low confidence on recent tasks',
          recommendations: [
            'Switch to Extended Mode',
            'Review prerequisite concepts',
            'Request personalized review (PRO feature)',
          ],
        };
      }
    }

    return { isStuck: false };
  }

  // In-memory rate limit tracking (in production, use Redis)
  private aiEvaluationUsage: Map<string, { count: number; date: string }> = new Map();
  private readonly FREE_USER_DAILY_LIMIT = 1;

  /**
   * Check and update AI evaluation rate limit for free users
   */
  private checkAIEvaluationLimit(userId: string, isPro: boolean): { allowed: boolean; remaining: number } {
    if (isPro) {
      return { allowed: true, remaining: -1 }; // Unlimited for Pro
    }

    const today = new Date().toISOString().split('T')[0];
    const usage = this.aiEvaluationUsage.get(userId);

    if (!usage || usage.date !== today) {
      // First use today
      this.aiEvaluationUsage.set(userId, { count: 1, date: today });
      return { allowed: true, remaining: this.FREE_USER_DAILY_LIMIT - 1 };
    }

    if (usage.count >= this.FREE_USER_DAILY_LIMIT) {
      return { allowed: false, remaining: 0 };
    }

    // Increment usage
    this.aiEvaluationUsage.set(userId, { count: usage.count + 1, date: today });
    return { allowed: true, remaining: this.FREE_USER_DAILY_LIMIT - usage.count - 1 };
  }

  /**
   * Get remaining AI evaluations for today
   */
  async getAIEvaluationRemaining(userId: string): Promise<{ remaining: number; limit: number; isPro: boolean }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const isPro = user?.hasTierAccess(QuotaTier.PRO) ?? false;

    if (isPro) {
      return { remaining: -1, limit: -1, isPro: true }; // Unlimited
    }

    const today = new Date().toISOString().split('T')[0];
    const usage = this.aiEvaluationUsage.get(userId);

    if (!usage || usage.date !== today) {
      return { remaining: this.FREE_USER_DAILY_LIMIT, limit: this.FREE_USER_DAILY_LIMIT, isPro: false };
    }

    return {
      remaining: Math.max(0, this.FREE_USER_DAILY_LIMIT - usage.count),
      limit: this.FREE_USER_DAILY_LIMIT,
      isPro: false
    };
  }

  /**
   * AI-powered evaluation for open-ended questions
   * Pro users: Unlimited
   * Free users: 1/day limit
   */
  async evaluateOpenEndedWithAI(
    userId: string,
    request: {
      questionId: string;
      question: string;
      category: string;
      scenario?: string;
      constraints?: string[];
      response: string;
      evaluationDimensions: {
        id: string;
        label: string;
        hint: string;
        required?: boolean;
        keywords?: string[];
      }[];
    },
  ): Promise<{
    success: boolean;
    result?: {
      passed: boolean;
      score: number;
      evaluationType: 'ai';
      dimensionResults: {
        dimensionId: string;
        label: string;
        found: boolean;
        hint?: string;
        aiScore?: number;
        aiFeedback?: string;
      }[];
      feedback: string;
      aiOverallFeedback?: string;
      aiStrengths?: string[];
      aiImprovements?: string[];
    };
    error?: string;
    tokensUsed?: number;
    remaining?: number;  // Remaining AI evaluations for free users
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const isPro = user?.hasTierAccess(QuotaTier.PRO) ?? false;

    // Check rate limit
    const limitCheck = this.checkAIEvaluationLimit(userId, isPro);
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: 'Daily AI evaluation limit reached. Upgrade to Pro for unlimited AI feedback.',
        remaining: 0,
      };
    }

    try {
      const dimensionsDescription = request.evaluationDimensions
        .map(d => `- ${d.id}: ${d.label} (${d.required ? 'required' : 'optional'}) - ${d.hint}`)
        .join('\n');

      const prompt = `You are evaluating a learner's open-ended response. Assess the QUALITY OF REASONING, not correctness of any specific answer.

QUESTION TYPE: ${request.category}
${request.scenario ? `SCENARIO: ${request.scenario}` : ''}
${request.constraints?.length ? `CONSTRAINTS: ${request.constraints.join(', ')}` : ''}

QUESTION: ${request.question}

LEARNER'S RESPONSE:
"""
${request.response}
"""

EVALUATION DIMENSIONS:
${dimensionsDescription}

Evaluate each dimension on a 0-1 scale based on how well the learner demonstrated that element.
Be encouraging but honest. Focus on the reasoning process, not whether you agree with their conclusion.

Return ONLY valid JSON (no markdown, no code blocks, no extra text):
{
  "dimensions": [
    {
      "id": "dimension_id",
      "score": 0.0-1.0,
      "found": true/false,
      "feedback": "Brief specific feedback for this dimension"
    }
  ],
  "overallScore": 0.0-1.0,
  "passed": true/false,
  "strengths": ["What they did well - 1-2 points"],
  "improvements": ["Specific suggestions - 1-2 points"],
  "overallFeedback": "1-2 sentence encouraging summary"
}`;

      const response = await this.aiService.routeRequest(
        AITask.TUTOR_CHAT,
        prompt,
      );

      // Clean the response content - remove markdown code blocks if present
      let jsonContent = response.content.trim();
      // Remove ```json or ``` wrapper if present
      if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }
      // Try to extract JSON object if there's extra text
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonContent = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonContent);

      // Map AI results to our format
      const dimensionResults = request.evaluationDimensions.map(dim => {
        const aiDim = parsed.dimensions?.find((d: any) => d.id === dim.id);
        return {
          dimensionId: dim.id,
          label: dim.label,
          found: aiDim?.found ?? aiDim?.score >= 0.5,
          hint: aiDim?.found ? undefined : dim.hint,
          aiScore: aiDim?.score,
          aiFeedback: aiDim?.feedback,
        };
      });

      return {
        success: true,
        result: {
          passed: parsed.passed ?? parsed.overallScore >= 0.6,
          score: parsed.overallScore ?? 0,
          evaluationType: 'ai',
          dimensionResults,
          feedback: parsed.overallFeedback || 'Response evaluated.',
          aiOverallFeedback: parsed.overallFeedback,
          aiStrengths: parsed.strengths,
          aiImprovements: parsed.improvements,
        },
        tokensUsed: response.tokensUsed,
        remaining: limitCheck.remaining,
      };
    } catch (error) {
      console.error('AI evaluation error:', error?.message || error);
      return {
        success: false,
        error: `AI evaluation failed: ${error?.message || 'Unknown error'}. Please try again or use basic evaluation.`,
        remaining: limitCheck.remaining,
      };
    }
  }
}


// More costly version: 
//async generatePersonalizedReview(sessionId: string, userId: string) {
//   const user = await this.userRepository.findOne({ where: { id: userId } });
//   if (!user?.hasTierAccess(QuotaTier.PRO)) {
//     throw new ForbiddenException('Personalized reviews require PRO tier or higher');
//   }

//   const session = await this.sessionRepository.findOne({
//     where: { id: sessionId, userId },
//     relations: ['progress'],
//   });

//   if (!session) {
//     throw new NotFoundException('Session not found');
//   }

//   const weakTopics = new Map<string, number[]>();
//   session.progress.forEach((p) => {
//     if (p.completed && p.confidenceScore && p.confidenceScore < 3) {
//       const topicMatch = p.taskId.match(/-([\w]+)$/);
//       const topic = topicMatch ? topicMatch[1] : 'general';
//       if (!weakTopics.has(topic)) weakTopics.set(topic, []);
//       weakTopics.get(topic).push(p.confidenceScore);
//     }
//   });

//   const focusAreas = Array.from(weakTopics.keys()).slice(0, 3);
//   if (focusAreas.length === 0) return { questions: [], focusAreas: [] };

//   // ✅ OPTIMIZED: Clear but concise
//   const prompt = `Generate 5 review questions for a student learning ${session.skillName}.

// Focus on these weak areas: ${focusAreas.join(', ')}

// Requirements:
// - Difficulty: 2 easy, 2 medium, 1 hard
// - Mix topics from weak areas
// - Include detailed answer with explanation for each

// Return ONLY this JSON format:
// {"questions": [{"question": "...", "topic": "...", "difficulty": "easy|medium|hard", "answer": "..."}]}`;

//   const response = await this.aiService.routeRequest(AITask.TUTOR_CHAT, prompt);
//   const parsed = JSON.parse(response.content);

//   return {
//     questions: parsed.questions,
//     focusAreas,
//   };
// }