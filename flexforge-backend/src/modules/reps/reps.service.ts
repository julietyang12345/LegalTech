import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Rep } from '../../database/entities/rep.entity';
import { User } from '../../database/entities/user.entity';
import { AiService, AITask } from '../ai/ai.service';
import { UserService } from '../user/user.service';
import { SkillDetectorService, SkillType } from '../curriculum/services/skill-detector.service';
import { AbilityService } from '../ability/ability.service';
import { getDimensions } from '../ability/dimension-registry';
import { GenerateScenariosDto } from './dto/generate-scenarios.dto';
import { SaveIntakeDto } from './dto/save-intake.dto';
import { StartRepDto } from './dto/start-rep.dto';
import { CompleteRepDto } from './dto/complete-rep.dto';
import {
  buildScenarioGenerationPrompt,
  buildProgressiveHintPrompt,
  buildRepFeedbackPrompt,
} from './prompts/reps-prompts';

@Injectable()
export class RepsService {
  private readonly logger = new Logger(RepsService.name);

  constructor(
    @InjectRepository(Rep)
    private repsRepository: Repository<Rep>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private aiService: AiService,
    private userService: UserService,
    private skillDetectorService: SkillDetectorService,
    private abilityService: AbilityService,
  ) {}

  /**
   * Check if user needs to complete the reps intake questionnaire
   */
  async checkIntake(userId: string): Promise<{ needsIntake: boolean }> {
    const user = await this.userService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const hasRepsContext = !!(user.preferences as any)?.repsContext;

    return { needsIntake: !hasRepsContext };
  }

  /**
   * Save intake questionnaire answers to user preferences
   */
  async saveIntake(userId: string, dto: SaveIntakeDto): Promise<{ saved: boolean }> {
    const user = await this.userService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const preferences = user.preferences || {} as any;
    (preferences as any).repsContext = {
      background: dto.background,
      target: dto.target,
      struggle: dto.struggle,
      updatedAt: new Date().toISOString(),
    };

    await this.usersRepository.update(userId, { preferences });
    return { saved: true };
  }

  /**
   * Generate 3 practice scenarios using AI
   */
  async generateScenarios(userId: string, dto: GenerateScenariosDto) {
    const user = await this.userService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Build user context from preferences
    const repsContext = (user.preferences as any)?.repsContext;
    const learner = user.preferences?.learner;

    const userContext = {
      background: repsContext?.background || learner?.originalGoal || '',
      target: repsContext?.target || '',
      struggle: repsContext?.struggle || '',
      skillLevel: learner?.familiarity || '',
      previousReps: await this.repsRepository.count({ where: { userId } }),
    };

    // Fetch skill profile + recent user feedback for adaptive scenario generation
    const skillType = dto.skillName
      ? (await this.skillDetectorService.detectSkillType(dto.skillName).catch(() => null))?.skillType
      : null;

    let profileContext: { summary: string | null; recentFeedback: any[] } | undefined;
    if (skillType) {
      const [summary, recentReps] = await Promise.all([
        this.abilityService.getProfileSummary(userId, skillType),
        this.repsRepository.find({
          where: { userId, userFeedback: Not(IsNull()) },
          order: { createdAt: 'DESC' },
          take: 3,
          select: ['scenario', 'userFeedback'],
        }),
      ]);

      if (summary || recentReps.length > 0) {
        profileContext = {
          summary,
          recentFeedback: recentReps
            .filter((r) => r.userFeedback)
            .map((r) => ({
              scenarioTitle: r.scenario?.title || 'Unknown',
              userFeedback: r.userFeedback,
            })),
        };
      }
    }

    const { staticPart, dynamicPart } = buildScenarioGenerationPrompt(
      userContext,
      dto.skillName,
      dto.topic,
      profileContext,
    );

    const response = await this.aiService.routeRequest(
      AITask.REP_SCENARIO_GENERATION,
      dynamicPart,
      staticPart,
    );

    // Track usage
    await this.userService.incrementUsage(userId, response.tokensUsed, 0, 0, response.cost);

    // Parse scenarios from response
    let scenarios;
    try {
      const parsed = JSON.parse(response.content);
      scenarios = parsed.scenarios || parsed;
    } catch {
      // Try to extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        scenarios = parsed.scenarios || parsed;
      } else {
        throw new BadRequestException('Failed to parse AI response');
      }
    }

    return {
      scenarios,
      tokensUsed: response.tokensUsed,
    };
  }

  /**
   * Start a new rep with a chosen scenario
   */
  async startRep(userId: string, dto: StartRepDto, allScenarios?: any[]) {
    // Detect skill type from the scenario's skill tags or title
    const skillHint = dto.scenario.skillTags?.[0] || dto.scenario.title || 'general';
    let skillType: string = SkillType.KNOWLEDGE;
    try {
      const detection = await this.skillDetectorService.detectSkillType(skillHint);
      skillType = detection.skillType;
    } catch (error) {
      this.logger.warn(`Failed to detect skill type for "${skillHint}", defaulting to KNOWLEDGE`);
    }

    const rep = this.repsRepository.create({
      userId,
      skillName: dto.scenario.skillTags?.[0] || 'general',
      topic: dto.scenario.title,
      scenario: dto.scenario,
      scenarioOptions: allScenarios || null,
      skillType,
      coachConversation: [],
      hintsRevealed: [],
    });

    const saved = await this.repsRepository.save(rep);
    return { rep: saved };
  }

  /**
   * Get progressive hint for a task (auto-increments hint level)
   */
  async getHint(userId: string, repId: string, taskIndex: number) {
    const rep = await this.repsRepository.findOne({
      where: { id: repId, userId },
    });
    if (!rep) throw new NotFoundException('Rep not found');
    if (rep.completed) throw new BadRequestException('Rep already completed');

    // In deliverable mode, all hints are indexed to task 0 (max 3 for whole deliverable)
    const isDeliverable = !!rep.scenario.template;
    const effectiveTaskIndex = isDeliverable ? 0 : taskIndex;

    // Find existing hints for this task
    const taskHints = rep.hintsRevealed.filter(h => h.taskIndex === effectiveTaskIndex);
    const nextLevel = taskHints.length + 1;

    if (nextLevel > 3) {
      throw new BadRequestException(
        isDeliverable ? 'All hints already revealed for this deliverable' : 'All hints already revealed for this task',
      );
    }

    const task = rep.scenario.tasks[effectiveTaskIndex];
    if (!task) throw new BadRequestException('Invalid task index');

    const user = await this.userService.findById(userId);
    const repsContext = (user.preferences as any)?.repsContext;

    const userContext = {
      background: repsContext?.background || '',
      target: repsContext?.target || '',
      struggle: repsContext?.struggle || '',
      skillLevel: user.preferences?.learner?.familiarity || '',
    };

    const { staticPart, dynamicPart } = buildProgressiveHintPrompt(
      rep.scenario,
      task,
      nextLevel,
      userContext,
    );

    const response = await this.aiService.routeRequest(
      AITask.REP_HINT,
      dynamicPart,
      staticPart,
    );

    await this.userService.incrementUsage(userId, response.tokensUsed, 0, 0, response.cost);

    let hintData;
    try {
      hintData = JSON.parse(response.content);
    } catch {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        hintData = JSON.parse(jsonMatch[0]);
      } else {
        hintData = { hint: response.content, encouragement: 'Keep going!' };
      }
    }

    // Save hint to rep
    const newHint = {
      taskIndex: effectiveTaskIndex,
      level: nextLevel,
      hint: hintData.hint,
      encouragement: hintData.encouragement || '',
    };

    rep.hintsRevealed = [...rep.hintsRevealed, newHint];
    rep.hintsUsed = rep.hintsRevealed.length;
    await this.repsRepository.save(rep);

    return {
      hint: hintData.hint,
      encouragement: hintData.encouragement,
      level: nextLevel,
      tokensUsed: response.tokensUsed,
    };
  }

  /**
   * Coach chat message (reuses TUTOR_CHAT task)
   */
  async coachMessage(userId: string, repId: string, message: string) {
    const rep = await this.repsRepository.findOne({
      where: { id: repId, userId },
    });
    if (!rep) throw new NotFoundException('Rep not found');

    // Build system context with scenario info
    const user = await this.userService.findById(userId);
    const repsContext = (user?.preferences as any)?.repsContext;
    const isDeliverable = !!rep.scenario.template;

    const systemPrompt = isDeliverable
      ? `You are a supportive but direct coach helping someone fill in a work deliverable. Answer their question to help them make progress, but don't write their content for them. Be concise — 2-4 sentences max.

THE PERSON: Background: ${repsContext?.background || 'Not specified'} | Target: ${repsContext?.target || 'Not specified'}
SCENARIO: ${rep.scenario.title}
MANAGER'S REQUEST: ${rep.scenario.brief?.message || rep.scenario.briefing}
DELIVERABLE: ${rep.scenario.brief?.deliverable || 'Complete the template'}
FOCUS AREAS: ${rep.scenario.tasks.map((t) => t.title).join(' | ')}

RULES:
- Guide, don't write their deliverable for them. Help them think through what goes in each section.
- Reference the manager's message and deadline context to keep them focused.
- If they're stuck on a section, ask what the stakeholder would need to see there.
- Keep it conversational, like a senior colleague reviewing their draft.
- Be concise. 2-4 sentences max per reply.`
      : `You are a supportive but direct coach helping someone practice a real work scenario. Answer their question to help them make progress, but don't do the work for them. Be concise — 2-4 sentences max.

THE PERSON: Background: ${repsContext?.background || 'Not specified'} | Target: ${repsContext?.target || 'Not specified'}
SCENARIO: ${rep.scenario.title} — ${rep.scenario.briefing}
TASKS: ${rep.scenario.tasks.map((t) => t.title).join(' | ')}

RULES:
- Guide, don't solve. Help them think through the problem.
- If they're stuck, point them to the right task or concept — don't give them the answer.
- Keep it conversational, like a senior dev sitting next to them.
- Be concise. 2-4 sentences max per reply.`;

    // Build conversation for context
    const conversationHistory = rep.coachConversation
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = conversationHistory
      ? `Previous conversation:\n${conversationHistory}\n\nUser: ${message}`
      : `User: ${message}`;

    const response = await this.aiService.routeRequest(
      AITask.TUTOR_CHAT,
      prompt,
      systemPrompt,
    );

    await this.userService.incrementUsage(userId, response.tokensUsed, 0, 0, response.cost);

    // Append to conversation
    const now = new Date().toISOString();
    rep.coachConversation = [
      ...rep.coachConversation,
      { role: 'user' as const, content: message, timestamp: now },
      { role: 'assistant' as const, content: response.content, timestamp: now },
    ];
    await this.repsRepository.save(rep);

    return {
      reply: response.content,
      tokensUsed: response.tokensUsed,
    };
  }

  /**
   * Complete a rep and get AI feedback
   */
  async completeRep(userId: string, repId: string, dto: CompleteRepDto) {
    const rep = await this.repsRepository.findOne({
      where: { id: repId, userId },
    });
    if (!rep) throw new NotFoundException('Rep not found');
    if (rep.completed) throw new BadRequestException('Rep already completed');

    const user = await this.userService.findById(userId);
    const repsContext = (user.preferences as any)?.repsContext;

    const userContext = {
      background: repsContext?.background || '',
      target: repsContext?.target || '',
      struggle: repsContext?.struggle || '',
      skillLevel: user.preferences?.learner?.familiarity || '',
    };

    // Calculate time spent
    const timeSpent = Math.round(
      (Date.now() - new Date(rep.createdAt).getTime()) / 1000,
    );

    // Load fixed dimensions for this rep's skill type
    const dimensions = rep.skillType
      ? getDimensions(rep.skillType as SkillType)
      : undefined;

    const { staticPart, dynamicPart } = buildRepFeedbackPrompt(
      rep.scenario,
      dto.scratchPadContent || rep.scratchPadContent,
      dto.tasksCompleted || [],
      timeSpent,
      rep.hintsUsed,
      dto.confidenceScore || null,
      userContext,
      dimensions,
    );

    const response = await this.aiService.routeRequest(
      AITask.REP_FEEDBACK,
      dynamicPart,
      staticPart,
    );

    await this.userService.incrementUsage(userId, response.tokensUsed, 0, 0, response.cost);

    let feedback;
    try {
      feedback = JSON.parse(response.content);
    } catch {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        feedback = JSON.parse(jsonMatch[0]);
      } else {
        throw new BadRequestException('Failed to parse feedback response');
      }
    }

    // Update rep
    rep.completed = true;
    rep.timeSpentSeconds = timeSpent;
    rep.confidenceScore = dto.confidenceScore || null;
    rep.scratchPadContent = dto.scratchPadContent || rep.scratchPadContent;
    rep.feedback = feedback;
    await this.repsRepository.save(rep);

    // Record skill scores for ability tracking (fire-and-forget)
    if (rep.skillType && feedback.skillEvaluation?.length > 0) {
      this.abilityService
        .recordScores(
          userId,
          rep.skillType,
          feedback.skillEvaluation.map((e: any) => ({
            dimensionId: e.dimension,
            score: e.score,
          })),
          'rep',
          rep.id,
          rep.skillName,
        )
        .catch((err) =>
          this.logger.error(`Failed to record skill scores: ${err.message}`),
        );
    }

    return {
      feedback,
      rep,
      tokensUsed: response.tokensUsed,
    };
  }

  /**
   * Submit user feedback on a completed rep (difficulty, relevance, note)
   */
  async submitUserFeedback(
    userId: string,
    repId: string,
    feedback: {
      difficulty: 'too_easy' | 'just_right' | 'too_hard';
      relevance: 'relevant' | 'not_relevant';
      note?: string;
    },
  ) {
    const rep = await this.repsRepository.findOne({
      where: { id: repId, userId },
    });
    if (!rep) throw new NotFoundException('Rep not found');
    if (!rep.completed)
      throw new BadRequestException('Rep must be completed before submitting feedback');

    rep.userFeedback = {
      ...feedback,
      submittedAt: new Date().toISOString(),
    };
    await this.repsRepository.save(rep);

    return { saved: true };
  }

  /**
   * Get rep history for a user
   */
  async getHistory(userId: string) {
    const reps = await this.repsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    return { reps };
  }

  /**
   * Get a single rep by ID
   */
  async getRep(userId: string, repId: string) {
    const rep = await this.repsRepository.findOne({
      where: { id: repId, userId },
    });
    if (!rep) throw new NotFoundException('Rep not found');
    return { rep };
  }
}
