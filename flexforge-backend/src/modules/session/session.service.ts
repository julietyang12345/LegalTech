import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Session,
  SessionStatus,
  SessionMode,
} from '../../database/entities/session.entity';
import { QuotaTier } from '../../database/entities/user.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { CurriculumService } from '../curriculum/curriculum.service';
import { UserService } from '../user/user.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(Session)
    private sessionsRepository: Repository<Session>,
    private curriculumService: CurriculumService,
    private userService: UserService,
  ) {}

  /**
   * Create new learning session with AI-generated curriculum
   */
  async create(
    userId: string,
    createSessionDto: CreateSessionDto,
  ): Promise<{
    session: Session;
    warnings?: string[];
    skillDetection?: any;
  }> {
    // Get user and check quota
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

  

  

    const quota = await this.userService.checkQuota(userId);
    if (!quota.hasQuota) {
      throw new ForbiddenException(
        'You have exceeded your monthly quota. Please upgrade your plan.',
      );
    }

    if (quota.curriculaRemaining <= 0) {
      throw new ForbiddenException(
        `You have used all your curricula for this month. Resets on ${new Date(user.quotaResetDate).toLocaleDateString()}.`,
      );
    }

    // Generate curriculum with tier-specific access
    const tierString = user.quotaTier.toUpperCase();
    
    this.logger.log(
      `Creating session for user ${userId} (${tierString} tier): ${createSessionDto.skillName}`,
    );

    const {
      curriculum,
      tokensUsed,
      cost,
      skillDetection,
      warnings,
    } = await this.curriculumService.generateCurriculum(
      createSessionDto,
      tierString,
    );

    // Increment user's usage
    await this.userService.incrementUsage(userId, tokensUsed, 1);

    // Create session
    const session = this.sessionsRepository.create({
      userId,
      skillName: createSessionDto.skillName,
      durationDays: createSessionDto.durationDays,
      hoursPerDay: createSessionDto.hoursPerDay,
      skillLevel: createSessionDto.skillLevel,
      curriculum,
      status: SessionStatus.ACTIVE,
      currentDay: 1,
      mode: SessionMode.NORMAL,
      startedAt: new Date(),
    });

    const savedSession = await this.sessionsRepository.save(session);

    this.logger.log(
      `✅ Session created: ${savedSession.id}. Type: ${skillDetection.skillType}, Complexity: ${skillDetection.complexity}, Tokens: ${tokensUsed}, Cost: $${cost.toFixed(4)}`,
    );

    return {
      session: savedSession,
      warnings,
      skillDetection,
    };
  }

  /**
   * Get all sessions for a user
   */
  async findAllByUser(userId: string): Promise<Session[]> {
    return this.sessionsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: ['progress'],
    });
  }

  /**
   * Get single session by ID
   */
  async findOne(id: string, userId: string): Promise<Session> {
    const session = await this.sessionsRepository.findOne({
      where: { id, userId },
      relations: ['progress'],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  /**
   * Update session (status, mode, current day)
   */
  async update(
    id: string,
    userId: string,
    updateSessionDto: UpdateSessionDto,
  ): Promise<Session> {
    const session = await this.findOne(id, userId);

    // Handle status changes
    if (updateSessionDto.status === SessionStatus.COMPLETED) {
      session.completedAt = new Date();
    }

    // Handle mode changes (Life Happens button)
    if (updateSessionDto.mode && updateSessionDto.mode !== session.mode) {
      await this.handleModeChange(session, updateSessionDto.mode);
    }

    Object.assign(session, updateSessionDto);
    return this.sessionsRepository.save(session);
  }

  /**
   * Handle "Life Happens" mode changes
   */
  private async handleModeChange(
    session: Session,
    newMode: SessionMode,
  ): Promise<void> {
    if (!session.originalDuration) {
      session.originalDuration = session.durationDays;
    }

    switch (newMode) {
      case SessionMode.SPRINT:
        // Condensed mode: reduce by 30%
        session.durationDays = Math.ceil(session.originalDuration * 0.7);
        break;

      case SessionMode.EXTENDED:
        // Extended mode: add 5 days
        session.durationDays = session.originalDuration + 5;
        break;

      case SessionMode.PAUSED:
        // Just pause
        session.status = SessionStatus.PAUSED;
        break;

      case SessionMode.NORMAL:
        // Back to original
        session.durationDays = session.originalDuration;
        break;
    }

    this.logger.log(
      `🔄 Session ${session.id} mode → ${newMode}. Duration: ${session.durationDays} days`,
    );
  }

  /**
   * Delete session
   */
  async delete(id: string, userId: string): Promise<void> {
    const session = await this.findOne(id, userId);
    await this.sessionsRepository.remove(session);
  }

  /**
   * Get active session for user
   */
  async getActiveSession(userId: string): Promise<Session | null> {
    return this.sessionsRepository.findOne({
      where: {
        userId,
        status: SessionStatus.ACTIVE,
      },
      relations: ['progress'],
    });
  }

  /**
   * Get session progress summary
   */
  async getProgressSummary(id: string, userId: string): Promise<{
    session: Session;
    progressPercentage: number;
    tasksCompleted: number;
    totalTasks: number;
    daysCompleted: number;
    daysRemaining: number;
    averageConfidence: number;
    weakAreas?: string[]; // For PRO/PREMIUM users
    strongAreas?: string[]; // For PRO/PREMIUM users
  }> {
    const session = await this.findOne(id, userId);
    const user = await this.userService.findById(userId);

    // Calculate total tasks
    let totalTasks = 0;
    session.curriculum.days.forEach((day) => {
      totalTasks += day.tasks?.length || 0;
    });

    // Get completed tasks
    const tasksCompleted = session.progress.filter((p) => p.completed).length;

    // Calculate average confidence
    const confidenceScores = session.progress
      .filter((p) => p.completed && p.confidenceScore)
      .map((p) => p.confidenceScore);

    const averageConfidence =
      confidenceScores.length > 0
        ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
        : 0;

    const summary: any = {
      session,
      progressPercentage: totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : 0,
      tasksCompleted,
      totalTasks,
      daysCompleted: session.currentDay - 1,
      daysRemaining: session.durationDays - session.currentDay + 1,
      averageConfidence: Math.round(averageConfidence * 10) / 10,
    };

    // Add weak/strong areas for PRO+ users
    if (user.hasTierAccess(QuotaTier.PRO)) {
      const analysis = this.analyzeStrengthsWeaknesses(session.progress);
      summary.weakAreas = analysis.weakAreas;
      summary.strongAreas = analysis.strongAreas;
    }

    return summary;
  }

  /**
   * Analyze strengths and weaknesses from progress
   * (PRO/PREMIUM feature)
   */
  private analyzeStrengthsWeaknesses(progress: any[]): {
    weakAreas: string[];
    strongAreas: string[];
  } {
    const tasksByTopic = new Map<string, number[]>();

    // Group confidence scores by task topic
    progress.forEach((p) => {
      if (p.completed && p.confidenceScore) {
        // Extract topic from task ID (e.g., "day1-task1-loops" -> "loops")
        const topicMatch = p.taskId.match(/-([\w]+)$/);
        const topic = topicMatch ? topicMatch[1] : 'general';

        if (!tasksByTopic.has(topic)) {
          tasksByTopic.set(topic, []);
        }
        tasksByTopic.get(topic).push(p.confidenceScore);
      }
    });

    // Calculate average confidence per topic
    const topicAverages = Array.from(tasksByTopic.entries()).map(
      ([topic, scores]) => ({
        topic,
        average: scores.reduce((a, b) => a + b, 0) / scores.length,
      }),
    );

    // Sort by confidence
    topicAverages.sort((a, b) => a.average - b.average);

    // Weak areas: lowest 30% (confidence < 3)
    const weakAreas = topicAverages
      .filter((t) => t.average < 3)
      .slice(0, 3)
      .map((t) => t.topic);

    // Strong areas: highest 30% (confidence >= 4)
    const strongAreas = topicAverages
      .filter((t) => t.average >= 4)
      .slice(-3)
      .reverse()
      .map((t) => t.topic);

    return { weakAreas, strongAreas };
  }

  /**
   * Get personalized next steps for user
   * (PRO/PREMIUM feature)
   */
  async getPersonalizedNextSteps(
    sessionId: string,
    userId: string,
  ): Promise<{
    recommendations: string[];
    shouldExtendSession: boolean;
    suggestedNextSkill?: string;
  }> {
    const user = await this.userService.findById(userId);

    if (!user.hasTierAccess(QuotaTier.PRO)) {
      throw new ForbiddenException(
        'Personalized recommendations require PRO tier',
      );
    }

    const summary = await this.getProgressSummary(sessionId, userId);

    const recommendations: string[] = [];
    let shouldExtendSession = false;

    // Check if user is struggling
    if (summary.averageConfidence < 3) {
      recommendations.push(
        '⚠️ Your confidence is low. Consider switching to Extended Mode for more practice time.',
      );
      shouldExtendSession = true;
    }

    // Check weak areas
    if (summary.weakAreas && summary.weakAreas.length > 0) {
      recommendations.push(
        `📚 Extra practice needed on: ${summary.weakAreas.join(', ')}`,
      );
    }

    // Check if ahead of schedule
    if (summary.averageConfidence >= 4.5 && summary.progressPercentage > 70) {
      recommendations.push(
        "🚀 You're doing great! Consider Sprint Mode to finish faster.",
      );
    }

    // Suggest next skill (PREMIUM only)
    let suggestedNextSkill: string | undefined;
    if (
      user.hasTierAccess(QuotaTier.PREMIUM) &&
      summary.progressPercentage > 80
    ) {
      // This would call AI to suggest next skill based on current skill
      // For now, placeholder
      suggestedNextSkill = 'Advanced AI Automation (suggested based on your progress)';
      recommendations.push(
        `💡 Next recommended skill: ${suggestedNextSkill}`,
      );
    }

    return {
      recommendations,
      shouldExtendSession,
      suggestedNextSkill,
    };
  }

  
}