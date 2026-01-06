import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  Session,
  SessionStatus,
  SessionMode,
} from '../../database/entities/session.entity';
import { QuotaTier } from '../../database/entities/user.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { CurriculumService } from '../curriculum/curriculum.service';
import { CurriculumCacheService } from '../curriculum/services/curriculum-cache.service';
import { UserService } from '../user/user.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(Session)
    private sessionsRepository: Repository<Session>,
    private curriculumService: CurriculumService,
    private cacheService: CurriculumCacheService,
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
    fromCache?: boolean;
    variantId?: string;
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

    // Generate a session ID upfront for cache tracking
    const tempSessionId = crypto.randomUUID();

    // Try to use preview curriculum first, then cache, then generate new
    let curriculum: any;
    let variantId: string | null = null;
    let fromCache = false;
    let fromPreview = false;
    let tokensUsed = 0;
    let cost = 0;
    let skillDetection: any = null;
    let warnings: string[] = [];

    if (createSessionDto.previewCurriculum) {
      // Use preview curriculum (instant - no AI call needed)
      curriculum = createSessionDto.previewCurriculum;
      fromPreview = true;
      this.logger.log(`⚡ Using preview curriculum for "${createSessionDto.skillName}" (instant)`);

      // Cache the preview for future users
      const cached = await this.cacheService.cacheNewContent(
        createSessionDto,
        curriculum,
        userId,
        tempSessionId,
      );
      variantId = cached.variantId;
    } else {
      // No preview - try cache or generate new
      const cacheResult = await this.cacheService.tryGetFromCache(
        createSessionDto,
        userId,
        tempSessionId,
      );

      if (cacheResult) {
        // Cache HIT
        curriculum = cacheResult.curriculum;
        variantId = cacheResult.variantId;
        fromCache = true;
        this.logger.log(`📦 Cache HIT for "${createSessionDto.skillName}" - variant ${variantId}`);
      } else {
        // Cache MISS - generate new curriculum
        const generated = await this.curriculumService.generateCurriculum(
          createSessionDto,
          tierString,
        );

        curriculum = generated.curriculum;
        tokensUsed = generated.tokensUsed;
        cost = generated.cost;
        skillDetection = generated.skillDetection;
        warnings = generated.warnings || [];

        // Cache the new content
        const cached = await this.cacheService.cacheNewContent(
          createSessionDto,
          curriculum,
          userId,
          tempSessionId,
        );
        variantId = cached.variantId;

        this.logger.log(`🆕 Cache MISS for "${createSessionDto.skillName}" - created variant ${variantId}`);
      }
    }

    // Increment user's usage (only if we generated new content)
    if (tokensUsed > 0) {
      await this.userService.incrementUsage(userId, tokensUsed, 1);
    }

    // Create session
    const session = this.sessionsRepository.create({
      userId,
      skillName: createSessionDto.skillName,
      durationDays: createSessionDto.durationDays,
      hoursPerDay: createSessionDto.hoursPerDay,
      skillLevel: createSessionDto.skillLevel,
      curriculum,
      variantId,
      fromCache,
      status: SessionStatus.ACTIVE,
      currentDay: 1,
      mode: SessionMode.NORMAL,
      startedAt: new Date(),
    });

    const savedSession = await this.sessionsRepository.save(session);

    if (fromPreview) {
      this.logger.log(`✅ Session created: ${savedSession.id} (from preview, instant)`);
    } else if (fromCache) {
      this.logger.log(`✅ Session created: ${savedSession.id} (from cache, variant=${variantId})`);
    } else {
      this.logger.log(
        `✅ Session created: ${savedSession.id}. Type: ${skillDetection?.skillType}, Complexity: ${skillDetection?.complexity}, Tokens: ${tokensUsed}, Cost: $${cost.toFixed(4)}`,
      );
    }

    // Day 1 content will be generated when user clicks "Start Day 1" via startDay()

    return {
      session: savedSession,
      warnings,
      skillDetection,
      fromCache: fromCache || fromPreview,
      variantId,
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

  // ═══════════════════════════════════════════════════
  // TWO-PHASE CURRICULUM METHODS
  // ═══════════════════════════════════════════════════

  /**
   * Start a day - generates full day content (Phase 2)
   * Day 1: Always available
   * Day 2+: Requires previous day's practice project submitted
   */
  async startDay(
    sessionId: string,
    userId: string,
    dayNumber: number,
  ): Promise<{ dayContent: any; tokensUsed: number }> {
    const session = await this.findOne(sessionId, userId);
    const user = await this.userService.findById(userId);
    const tierString = user.quotaTier.toUpperCase();

    // Check if day is unlockable
    const dayOverview = session.curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    // Day 1 is always unlockable
    if (dayNumber > 1) {
      const previousDay = session.curriculum.days.find((d: any) => d.day === dayNumber - 1);
      if (previousDay?.status !== 'completed' && previousDay?.status !== 'skipped') {
        throw new ForbiddenException(
          `Complete Day ${dayNumber - 1} practice project first to unlock Day ${dayNumber}`,
        );
      }
    }

    // Check if already loaded
    if (dayOverview.detailsLoaded && dayOverview.content) {
      return {
        dayContent: dayOverview.content,
        tokensUsed: 0, // Already loaded, no new tokens used
      };
    }

    // Generate day details (Phase 2)
    const result = await this.curriculumService.generateDayDetails(
      session.curriculum,
      dayNumber,
      tierString,
    );

    // Update session curriculum with loaded content
    const dayIndex = session.curriculum.days.findIndex((d: any) => d.day === dayNumber);
    session.curriculum.days[dayIndex] = {
      ...session.curriculum.days[dayIndex],
      content: result.dayContent,
      detailsLoaded: true,
      status: 'in_progress',
    };

    // Increment user's usage
    await this.userService.incrementUsage(userId, result.tokensUsed, 0);

    // Save session
    await this.sessionsRepository.save(session);

    this.logger.log(`✅ Day ${dayNumber} started for session ${sessionId}`);

    return {
      dayContent: result.dayContent,
      tokensUsed: result.tokensUsed,
    };
  }

  /**
   * Submit skip test answers to skip a day
   */
  async submitSkipTest(
    sessionId: string,
    userId: string,
    dayNumber: number,
    answers: string[],
  ): Promise<{
    passed: boolean;
    correctCount: number;
    totalQuestions: number;
    passThreshold: number;
  }> {
    const session = await this.findOne(sessionId, userId);

    const dayOverview = session.curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    const skipTest = dayOverview.skipTest;
    if (!skipTest) {
      throw new NotFoundException(`Skip test not found for Day ${dayNumber}`);
    }

    // Check answers (case-insensitive, trim whitespace)
    let correctCount = 0;
    const questions = skipTest.questions || [];

    answers.forEach((answer, index) => {
      if (index < questions.length) {
        const correctAnswer = questions[index].answer.toLowerCase().trim();
        const userAnswer = answer.toLowerCase().trim();
        // Simple match - could be improved with fuzzy matching
        if (userAnswer.includes(correctAnswer) || correctAnswer.includes(userAnswer)) {
          correctCount++;
        }
      }
    });

    const passThreshold = skipTest.passThreshold || 2;
    const passed = correctCount >= passThreshold;

    if (passed) {
      // Mark day as skipped/mastered
      const dayIndex = session.curriculum.days.findIndex((d: any) => d.day === dayNumber);
      session.curriculum.days[dayIndex].status = 'skipped';

      // Unlock next day
      if (dayNumber < session.curriculum.days.length) {
        const nextDayIndex = session.curriculum.days.findIndex((d: any) => d.day === dayNumber + 1);
        if (nextDayIndex !== -1) {
          session.curriculum.days[nextDayIndex].status = 'unlockable';
        }
      }

      await this.sessionsRepository.save(session);
      this.logger.log(`✅ Day ${dayNumber} skipped (mastered) for session ${sessionId}`);
    }

    return {
      passed,
      correctCount,
      totalQuestions: questions.length,
      passThreshold,
    };
  }

  /**
   * Submit practice project answer - unlocks next day
   */
  async submitPracticeProject(
    sessionId: string,
    userId: string,
    dayNumber: number,
    answer: string,
    confidence?: number,
  ): Promise<{
    nextDayUnlocked: boolean;
    feedback?: string;
  }> {
    const session = await this.findOne(sessionId, userId);

    const dayIndex = session.curriculum.days.findIndex((d: any) => d.day === dayNumber);
    if (dayIndex === -1) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    // Mark day as completed
    session.curriculum.days[dayIndex].status = 'completed';
    session.curriculum.days[dayIndex].practiceSubmitted = true;
    session.curriculum.days[dayIndex].practiceAnswer = answer;
    session.curriculum.days[dayIndex].practiceConfidence = confidence;

    // Unlock next day
    let nextDayUnlocked = false;
    if (dayNumber < session.curriculum.days.length) {
      const nextDayIndex = session.curriculum.days.findIndex((d: any) => d.day === dayNumber + 1);
      if (nextDayIndex !== -1) {
        session.curriculum.days[nextDayIndex].status = 'unlockable';
        nextDayUnlocked = true;
      }
    }

    // Update current day
    if (dayNumber >= session.currentDay) {
      session.currentDay = dayNumber + 1;
    }

    await this.sessionsRepository.save(session);

    this.logger.log(`✅ Day ${dayNumber} practice submitted for session ${sessionId}`);

    return {
      nextDayUnlocked,
      feedback: 'Great job! Your submission has been recorded.',
    };
  }

  /**
   * Get day details (overview + content if loaded)
   */
  async getDayDetails(
    sessionId: string,
    userId: string,
    dayNumber: number,
  ): Promise<{
    day: any;
    status: string;
    detailsLoaded: boolean;
    content?: any;
  }> {
    const session = await this.findOne(sessionId, userId);

    const dayOverview = session.curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    return {
      day: dayOverview,
      status: dayOverview.status || 'locked',
      detailsLoaded: dayOverview.detailsLoaded || false,
      content: dayOverview.content,
    };
  }
}