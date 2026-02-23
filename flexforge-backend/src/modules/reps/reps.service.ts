import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rep } from '../../database/entities/rep.entity';
import { User } from '../../database/entities/user.entity';
import { AiService, AITask } from '../ai/ai.service';
import { UserService } from '../user/user.service';
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
  ) {}

  /**
   * Check if user needs to complete the reps intake questionnaire
   */
  async checkIntake(userId: string): Promise<{ needsIntake: boolean }> {
    const user = await this.userService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const hasRepsContext = !!(user.preferences as any)?.repsContext;
    const hasLearnerOnboarding = !!user.preferences?.learner;

    return { needsIntake: !hasRepsContext && !hasLearnerOnboarding };
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

    const { staticPart, dynamicPart } = buildScenarioGenerationPrompt(
      userContext,
      dto.skillName,
      dto.topic,
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
    const rep = this.repsRepository.create({
      userId,
      skillName: dto.scenario.skillTags?.[0] || 'general',
      topic: dto.scenario.title,
      scenario: dto.scenario,
      scenarioOptions: allScenarios || null,
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

    // Find existing hints for this task
    const taskHints = rep.hintsRevealed.filter(h => h.taskIndex === taskIndex);
    const nextLevel = taskHints.length + 1;

    if (nextLevel > 3) {
      throw new BadRequestException('All hints already revealed for this task');
    }

    const task = rep.scenario.tasks[taskIndex];
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
      taskIndex,
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
    const systemPrompt = `You are a supportive but direct coach helping someone practice a real work scenario. Answer their question to help them make progress, but don't do the work for them. Be concise — 2-4 sentences max.

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

    const { staticPart, dynamicPart } = buildRepFeedbackPrompt(
      rep.scenario,
      dto.scratchPadContent || rep.scratchPadContent,
      dto.tasksCompleted || [],
      timeSpent,
      rep.hintsUsed,
      dto.confidenceScore || null,
      userContext,
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

    return {
      feedback,
      rep,
      tokensUsed: response.tokensUsed,
    };
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
