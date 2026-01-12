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
   * Start a day - CORE content only (fast initial load)
   * Returns: prePrompt, video, foundationCards, task1
   */
  async startDayCore(
    sessionId: string,
    userId: string,
    dayNumber: number,
  ): Promise<{ coreContent: any; tokensUsed: number; fromCache: boolean }> {
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

    // Check if core content already loaded
    if (dayOverview.coreLoaded && dayOverview.coreContent) {
      return {
        coreContent: dayOverview.coreContent,
        tokensUsed: 0,
        fromCache: true,
      };
    }

    // Generate core content (fast)
    const result = await this.curriculumService.generateDayCoreDetails(
      session.curriculum,
      dayNumber,
      tierString,
      sessionId,
    );

    // Update session with core content
    const dayIndex = session.curriculum.days.findIndex((d: any) => d.day === dayNumber);
    session.curriculum.days[dayIndex] = {
      ...session.curriculum.days[dayIndex],
      coreContent: result.coreContent,
      coreLoaded: true,
      status: 'in_progress',
    };

    // Increment usage
    await this.userService.incrementUsage(userId, result.tokensUsed, 0);
    await this.sessionsRepository.save(session);

    this.logger.log(`🚀 Day ${dayNumber} CORE loaded for session ${sessionId}`);

    return {
      coreContent: result.coreContent,
      tokensUsed: result.tokensUsed,
      fromCache: result.fromCache || false,
    };
  }

  /**
   * Load DEFERRED day content (background)
   * Returns: task2, practiceProject, reflection, skipTest
   */
  async loadDayDeferred(
    sessionId: string,
    userId: string,
    dayNumber: number,
  ): Promise<{ deferredContent: any; tokensUsed: number; fromCache: boolean }> {
    const session = await this.findOne(sessionId, userId);
    const user = await this.userService.findById(userId);
    const tierString = user.quotaTier.toUpperCase();

    const dayOverview = session.curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    // Check if deferred already loaded
    if (dayOverview.deferredLoaded && dayOverview.deferredContent) {
      return {
        deferredContent: dayOverview.deferredContent,
        tokensUsed: 0,
        fromCache: true,
      };
    }

    // Generate deferred content
    const result = await this.curriculumService.generateDayDeferredDetails(
      session.curriculum,
      dayNumber,
      tierString,
    );

    // Update session with deferred content
    const dayIndex = session.curriculum.days.findIndex((d: any) => d.day === dayNumber);
    session.curriculum.days[dayIndex] = {
      ...session.curriculum.days[dayIndex],
      deferredContent: result.deferredContent,
      deferredLoaded: true,
    };

    // Increment usage
    await this.userService.incrementUsage(userId, result.tokensUsed, 0);
    await this.sessionsRepository.save(session);

    this.logger.log(`⏳ Day ${dayNumber} DEFERRED loaded for session ${sessionId}`);

    return {
      deferredContent: result.deferredContent,
      tokensUsed: result.tokensUsed,
      fromCache: result.fromCache || false,
    };
  }

  /**
   * Submit skip test answers to skip a day (multiple choice)
   * Uses pre-generated question sets, then suggests completing the course
   */
  async submitSkipTest(
    sessionId: string,
    userId: string,
    dayNumber: number,
    answers: number[], // Array of selected option indices
  ): Promise<{
    passed: boolean;
    correctCount: number;
    totalQuestions: number;
    passThreshold: number;
    newQuestions?: { question: string; options: string[]; correctIndex: number }[];
    suggestion?: string;
    allSetsExhausted?: boolean;
  }> {
    const session = await this.findOne(sessionId, userId);

    const dayIndex = session.curriculum.days.findIndex((d: any) => d.day === dayNumber);
    const dayOverview = session.curriculum.days[dayIndex];
    if (!dayOverview) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    const skipTest = dayOverview.skipTest;
    if (!skipTest) {
      throw new NotFoundException(`Skip test not found for Day ${dayNumber}`);
    }

    // Get current questions from questionSets (new format) or questions (legacy format)
    let questionSets = skipTest.questionSets || [];
    const currentSetIndex = skipTest.currentSetIndex ?? 0;
    let questions = questionSets[currentSetIndex] || [];

    // Handle legacy format: if no questionSets but has questions array with text answers
    // Convert to multiple choice format if possible, or return early
    if (questions.length === 0 && skipTest.questions && Array.isArray(skipTest.questions)) {
      // Legacy format doesn't have options/correctIndex - can't do MCQ
      // Return a helpful message
      this.logger.warn(`Skip test for Day ${dayNumber} uses legacy format without MCQ options`);
      throw new NotFoundException(
        `Skip test not available - please start the day to load the updated test format.`
      );
    }

    // Validate questions have required MCQ fields
    questions = questions.filter((q: any) =>
      q.question && q.options && Array.isArray(q.options) && typeof q.correctIndex === 'number'
    );

    // Check answers by comparing selected index to correctIndex
    let correctCount = 0;
    answers.forEach((selectedIndex, questionIndex) => {
      if (questionIndex < questions.length) {
        if (selectedIndex === questions[questionIndex].correctIndex) {
          correctCount++;
        }
      }
    });

    const passThreshold = skipTest.passThreshold || 3;
    const passed = correctCount >= passThreshold;

    if (passed) {
      // Mark day as skipped/mastered
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

      return {
        passed: true,
        correctCount,
        totalQuestions: questions.length,
        passThreshold,
      };
    }

    // Failed - determine next action
    this.logger.log(`❌ Skip test failed for Day ${dayNumber} (${correctCount}/${passThreshold})`);

    if (questionSets && currentSetIndex < questionSets.length - 1) {
      // Use next pre-generated set (instant)
      const nextSetIndex = currentSetIndex + 1;
      const newQuestions = questionSets[nextSetIndex];

      session.curriculum.days[dayIndex].skipTest = {
        ...skipTest,
        currentSetIndex: nextSetIndex,
      };

      await this.sessionsRepository.save(session);
      this.logger.log(`📝 Switching to question set ${nextSetIndex + 1}/${questionSets.length} for Day ${dayNumber}`);

      return {
        passed: false,
        correctCount,
        totalQuestions: questions.length,
        passThreshold,
        newQuestions,
        suggestion: "Try again with a different set of questions, or complete the lesson to build a stronger foundation.",
      };
    }

    // All sets exhausted - suggest taking the course, but allow force skip
    this.logger.log(`📚 All question sets exhausted for Day ${dayNumber}. Suggesting course completion.`);

    return {
      passed: false,
      correctCount,
      totalQuestions: questions.length,
      passThreshold,
      allSetsExhausted: true,
      suggestion: "We recommend completing the lesson to build a stronger foundation. You can still skip if you're confident in your knowledge.",
    };
  }

  /**
   * Force skip a day without passing the test
   * Used when user exhausts all question sets but still wants to skip
   */
  async forceSkipDay(
    sessionId: string,
    userId: string,
    dayNumber: number,
  ): Promise<{ success: boolean; nextDayUnlocked: boolean }> {
    const session = await this.findOne(sessionId, userId);

    const dayIndex = session.curriculum.days.findIndex((d: any) => d.day === dayNumber);
    if (dayIndex === -1) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    // Mark day as skipped
    session.curriculum.days[dayIndex].status = 'skipped';
    session.curriculum.days[dayIndex].forceSkipped = true;

    // Unlock next day and advance currentDay
    let nextDayUnlocked = false;
    if (dayNumber < session.curriculum.days.length) {
      const nextDayIndex = session.curriculum.days.findIndex((d: any) => d.day === dayNumber + 1);
      if (nextDayIndex !== -1) {
        session.curriculum.days[nextDayIndex].status = 'unlockable';
        session.currentDay = dayNumber + 1;
        nextDayUnlocked = true;
      }
    }

    await this.sessionsRepository.save(session);
    this.logger.log(`⏭️ Day ${dayNumber} force-skipped, advanced to day ${session.currentDay} for session ${sessionId}`);

    return { success: true, nextDayUnlocked };
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

  /**
   * Get task in alternative format (on-demand generation with caching)
   * Converts between code, quiz, and fillBlank formats
   */
  async getAlternativeTaskFormat(
    sessionId: string,
    userId: string,
    dayNumber: number,
    targetFormat: 'code' | 'quiz' | 'fillBlank',
  ): Promise<{ task: any; tokensUsed: number; fromCache: boolean }> {
    const session = await this.findOne(sessionId, userId);
    const user = await this.userService.findById(userId);

    const dayIndex = session.curriculum.days.findIndex((d: any) => d.day === dayNumber);
    const dayOverview = session.curriculum.days[dayIndex];

    if (!dayOverview) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    // Get the original task (from coreContent or directly on day)
    const originalTask = dayOverview.coreContent?.task1 || dayOverview.task1;
    if (!originalTask) {
      throw new NotFoundException(`Task not found for Day ${dayNumber}. Start the day first.`);
    }

    // Check if we already have this format cached
    const cacheKey = `alternativeFormats`;
    const cachedFormats = dayOverview[cacheKey] || {};
    if (cachedFormats[targetFormat]) {
      this.logger.log(`📦 Alternative format ${targetFormat} cache HIT for Day ${dayNumber}`);
      return {
        task: cachedFormats[targetFormat],
        tokensUsed: 0,
        fromCache: true,
      };
    }

    // Check if original task is already in the target format
    const originalFormat = originalTask.format || 'code';
    if (originalFormat === targetFormat) {
      return {
        task: originalTask,
        tokensUsed: 0,
        fromCache: true,
      };
    }

    // Generate the alternative format
    const result = await this.curriculumService.generateAlternativeTaskFormat(
      originalTask,
      targetFormat,
      {
        dayNumber,
        dayTitle: dayOverview.title,
        skillName: session.curriculum.metadata.skillName,
      },
    );

    // Cache the result in the session
    session.curriculum.days[dayIndex] = {
      ...session.curriculum.days[dayIndex],
      alternativeFormats: {
        ...cachedFormats,
        [targetFormat]: result.task,
      },
    };

    // Increment usage
    await this.userService.incrementUsage(userId, result.tokensUsed, 0);
    await this.sessionsRepository.save(session);

    this.logger.log(`🔄 Alternative format ${targetFormat} generated for Day ${dayNumber}`);

    return {
      task: result.task,
      tokensUsed: result.tokensUsed,
      fromCache: false,
    };
  }
}