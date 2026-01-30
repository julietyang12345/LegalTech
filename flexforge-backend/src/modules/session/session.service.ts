import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CACHE_CONFIG } from '../curriculum/services/curriculum-cache.service';
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
      this.logger.log(
        `⚡ Using preview curriculum for "${createSessionDto.skillName}" (instant)`,
      );

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
        this.logger.log(
          `📦 Cache HIT for "${createSessionDto.skillName}" - variant ${variantId}`,
        );
      } else {
        // Cache MISS - generate new curriculum
        // Include user's learner preferences from onboarding
        const learnerPrefs = user.preferences?.learner;
        this.logger.log(
          `🎯 DEBUG user.preferences.learner:`,
          JSON.stringify(learnerPrefs, null, 2),
        );
        const generated = await this.curriculumService.generateCurriculum(
          {
            ...createSessionDto,
            selectedDirection: learnerPrefs?.selectedDirection,
            selectedDirectionOutcome: learnerPrefs?.selectedDirectionOutcome,
            directionKeywords: learnerPrefs?.directionKeywords,
            selectedLanguage: learnerPrefs?.selectedLanguage,
            // Output type - what user wants to achieve
            outputType: learnerPrefs?.outputType,
            // Feeling-based inputs from onboarding
            familiarity: learnerPrefs?.familiarity,
            sessionLength: learnerPrefs?.sessionLength,
            contentDepth: learnerPrefs?.contentDepth,
            // Explicit learning style choice (projects vs practice)
            learningStyle: learnerPrefs?.learningStyle,
            // Advanced mode: code writing exercises
            codeWritingEnabled: learnerPrefs?.codeWritingEnabled,
          },
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

        this.logger.log(
          `🆕 Cache MISS for "${createSessionDto.skillName}" - created variant ${variantId}`,
        );
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
      this.logger.log(
        `✅ Session created: ${savedSession.id} (from preview, instant)`,
      );
    } else if (fromCache) {
      this.logger.log(
        `✅ Session created: ${savedSession.id} (from cache, variant=${variantId})`,
      );
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
   * Also syncs currentDay with actual day progress if out of sync
   */
  async getActiveSession(userId: string): Promise<Session | null> {
    const session = await this.sessionsRepository.findOne({
      where: {
        userId,
        status: SessionStatus.ACTIVE,
      },
      relations: ['progress'],
    });

    if (!session) return null;

    // Calculate the correct currentDay based on day statuses
    // currentDay should be the first non-completed/non-skipped day, or the last day + 1 if all complete
    const days = session.curriculum?.days || [];
    let calculatedCurrentDay = 1;
    for (const day of days) {
      if (day.status === 'completed' || day.status === 'skipped') {
        calculatedCurrentDay = day.day + 1;
      } else {
        break;
      }
    }
    // Cap at total days + 1
    calculatedCurrentDay = Math.min(calculatedCurrentDay, days.length + 1);

    // If currentDay is out of sync, fix it
    if (session.currentDay !== calculatedCurrentDay) {
      this.logger.warn(
        `⚠️ currentDay out of sync for session ${session.id}: stored=${session.currentDay}, calculated=${calculatedCurrentDay}. Fixing...`,
      );
      session.currentDay = calculatedCurrentDay;
      await this.sessionsRepository.save(session);
    }

    return session;
  }

  /**
   * Get session progress summary
   */
  async getProgressSummary(
    id: string,
    userId: string,
  ): Promise<{
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
      progressPercentage:
        totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : 0,
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
      suggestedNextSkill =
        'Advanced AI Automation (suggested based on your progress)';
      recommendations.push(`💡 Next recommended skill: ${suggestedNextSkill}`);
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
   * Start a day - CORE content only (fast initial load)
   * Returns: prePrompt, video, foundationCards, task1
   * With variant tracking and rate limiting for regeneration
   */
  async startDayCore(
    sessionId: string,
    userId: string,
    dayNumber: number,
    forceRegenerate?: boolean,
  ): Promise<{
    coreContent: any;
    tokensUsed: number;
    fromCache: boolean;
    variantId?: string;
    regenCount?: number;
    regenLimit?: number;
  }> {
    const session = await this.findOne(sessionId, userId);
    const user = await this.userService.findById(userId);
    const tierString = user.quotaTier.toUpperCase();
    const regenLimit = CACHE_CONFIG.dayContentMaxRegensPerDay;

    // Check if day is unlockable
    const dayOverview = session.curriculum.days.find(
      (d: any) => d.day === dayNumber,
    );
    if (!dayOverview) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    // Day 1 is always unlockable
    if (dayNumber > 1) {
      const previousDay = session.curriculum.days.find(
        (d: any) => d.day === dayNumber - 1,
      );
      if (
        previousDay?.status !== 'completed' &&
        previousDay?.status !== 'skipped'
      ) {
        throw new ForbiddenException(
          `Complete Day ${dayNumber - 1} practice project first to unlock Day ${dayNumber}`,
        );
      }
    }

    // Check if core content already loaded (skip if forceRegenerate)
    if (!forceRegenerate && dayOverview.coreLoaded && dayOverview.coreContent) {
      // Get current regen count for UI
      const regenCount = await this.cacheService.getDayRegenCount(
        sessionId,
        dayNumber,
      );
      return {
        coreContent: dayOverview.coreContent,
        tokensUsed: 0,
        fromCache: true,
        variantId: dayOverview.variantId,
        regenCount,
        regenLimit,
      };
    }

    if (forceRegenerate) {
      // Check rate limit before allowing regeneration
      const isLimitReached = await this.cacheService.isDayRegenLimitReached(
        sessionId,
        dayNumber,
      );
      if (isLimitReached) {
        throw new HttpException(
          `Day content regeneration limit reached (${regenLimit} per day). Try again tomorrow or continue with current content.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Mark previous variant as regenerated (negative signal for quality tracking)
      const previousVariantId = dayOverview.variantId;
      if (previousVariantId) {
        await this.cacheService.markDayContentAsRegenerated(
          previousVariantId,
          userId,
          sessionId,
        );
        this.logger.log(
          `📊 Marked variant ${previousVariantId} as regenerated`,
        );
      }

      this.logger.log(
        `🔄 Force regenerating Day ${dayNumber} for session ${sessionId}`,
      );

      // Clear all progress for this day when regenerating
      const dayIndex = session.curriculum.days.findIndex(
        (d: any) => d.day === dayNumber,
      );
      if (dayIndex !== -1) {
        const dayData = session.curriculum.days[dayIndex];
        // Clear practice submission
        delete dayData.practiceSubmitted;
        delete dayData.practiceAnswer;
        delete dayData.practiceConfidence;
        // Clear reflection data
        delete dayData.reflectionData;
        // Clear deferred content (needs to reload with new core)
        delete dayData.deferredLoaded;
        delete dayData.deferredContent;
        // Clear alternative formats (new task = new alternatives)
        delete dayData.alternativeFormats;
        // Reset status to in_progress (not completed/skipped)
        dayData.status = 'in_progress';
        this.logger.log(`🧹 Cleared all progress for Day ${dayNumber}`);
      }

      // Also clear boss project cache if this day is part of one
      if (session.curriculum.bossProjects) {
        const bossProject = session.curriculum.bossProjects.find((bp: any) =>
          bp.combinesDays?.includes(dayNumber),
        );
        if (bossProject) {
          // Clear the boss project's detailsLoaded flag so it regenerates
          bossProject.detailsLoaded = false;
          // Clear the generated content
          delete bossProject.phases;
          delete bossProject.requirements;
          delete bossProject.hints;
          delete bossProject.files;
          this.logger.log(
            `🧹 Cleared boss project cache for Day ${bossProject.day}`,
          );
        }
      }
    }

    // Generate core content (fast) with variant tracking
    // Pass session's improvementAreas and lessOfAreas to bias content generation
    const result = await this.curriculumService.generateDayCoreDetails(
      session.curriculum,
      dayNumber,
      tierString,
      forceRegenerate,
      userId,
      sessionId,
      session.improvementAreas,
      session.lessOfAreas,
    );

    // Update session with core content
    const dayIndex = session.curriculum.days.findIndex(
      (d: any) => d.day === dayNumber,
    );

    // DEBUG: Log bossMilestone solution status
    const bossMilestone = result.coreContent?.bossMilestone;
    this.logger.log(`🔍 DEBUG Day ${dayNumber} bossMilestone:`, {
      hasBossMilestone: !!bossMilestone,
      hasStarterCode: !!bossMilestone?.starterCode,
      starterCodeLength: bossMilestone?.starterCode?.length || 0,
      starterCodePreview: bossMilestone?.starterCode?.substring(0, 100),
      hasSolution: !!bossMilestone?.solution,
      solutionLength: bossMilestone?.solution?.length || 0,
      solutionPreview: bossMilestone?.solution?.substring(0, 100),
    });

    session.curriculum.days[dayIndex] = {
      ...session.curriculum.days[dayIndex],
      coreContent: result.coreContent,
      coreLoaded: true,
      status: 'in_progress',
      variantId: result.variantId, // Store variant ID for regen tracking
      foundationCardConcepts: result.foundationCardConcepts, // Store for deferred generation
    };

    // Update currentDay if user is starting a new day
    // This ensures currentDay is always synced with actual progress
    if (dayNumber > session.currentDay) {
      session.currentDay = dayNumber;
      this.logger.log(
        `📍 Updated currentDay to ${dayNumber} for session ${sessionId}`,
      );
    }

    // Increment usage
    await this.userService.incrementUsage(userId, result.tokensUsed, 0);
    await this.sessionsRepository.save(session);

    this.logger.log(
      `🚀 Day ${dayNumber} CORE loaded for session ${sessionId} (variant=${result.variantId})`,
    );

    // Get current regen count for UI
    const regenCount = await this.cacheService.getDayRegenCount(
      sessionId,
      dayNumber,
    );

    return {
      coreContent: result.coreContent,
      tokensUsed: result.tokensUsed,
      fromCache: result.fromCache || false,
      variantId: result.variantId,
      regenCount,
      regenLimit,
    };
  }

  /**
   * Start a day with STREAMING - yields content as it's generated
   * Use for real-time UI updates (foundation cards appear one by one)
   */
  async *startDayCoreStream(
    sessionId: string,
    userId: string,
    dayNumber: number,
    forceRegenerate?: boolean,
  ): AsyncGenerator<{ event: string; data: any }> {
    const session = await this.findOne(sessionId, userId);
    const user = await this.userService.findById(userId);
    const tierString = user.quotaTier.toUpperCase();

    const dayOverview = session.curriculum.days.find(
      (d: any) => d.day === dayNumber,
    );
    if (!dayOverview) {
      yield { event: 'error', data: { error: `Day ${dayNumber} not found` } };
      return;
    }

    // Check if already loaded (quick return cached)
    if (!forceRegenerate && dayOverview.coreLoaded && dayOverview.coreContent) {
      this.logger.log(`📦 Day ${dayNumber} already loaded, streaming cached`);
      // Yield cached content piece by piece
      if (dayOverview.coreContent.prePrompt) {
        yield { event: 'prePrompt', data: dayOverview.coreContent.prePrompt };
      }
      const cards =
        dayOverview.coreContent.languageFoundationCards ||
        dayOverview.coreContent.foundationCards ||
        [];
      for (const card of cards) {
        yield { event: 'foundationCard', data: card };
      }
      if (dayOverview.coreContent.video) {
        yield { event: 'video', data: dayOverview.coreContent.video };
      }
      yield {
        event: 'complete',
        data: {
          coreContent: dayOverview.coreContent,
          tokensUsed: 0,
          fromCache: true,
          variantId: dayOverview.variantId,
        },
      };
      return;
    }

    // Stream from curriculum service
    let finalResult: any = null;
    for await (const chunk of this.curriculumService.generateDayCoreDetailsStream(
      session.curriculum,
      dayNumber,
      tierString,
      forceRegenerate,
      userId,
      sessionId,
      session.improvementAreas,
      session.lessOfAreas,
    )) {
      yield chunk;

      // Capture final result for saving
      if (chunk.event === 'complete') {
        finalResult = chunk.data;
      }
    }

    // Save to session after streaming completes
    if (finalResult?.coreContent) {
      const dayIndex = session.curriculum.days.findIndex(
        (d: any) => d.day === dayNumber,
      );
      session.curriculum.days[dayIndex] = {
        ...session.curriculum.days[dayIndex],
        coreContent: finalResult.coreContent,
        coreLoaded: true,
        status: 'in_progress',
        variantId: finalResult.variantId,
        foundationCardConcepts: finalResult.foundationCardConcepts,
      };

      if (dayNumber > session.currentDay) {
        session.currentDay = dayNumber;
      }

      await this.userService.incrementUsage(userId, finalResult.tokensUsed, 0);
      await this.sessionsRepository.save(session);

      this.logger.log(
        `🚀 Day ${dayNumber} CORE streamed and saved (variant=${finalResult.variantId})`,
      );
    }
  }

  /**
   * Load DEFERRED day content (background)
   * Returns: reflection
   */
  async loadDayDeferred(
    sessionId: string,
    userId: string,
    dayNumber: number,
  ): Promise<{
    deferredContent: any;
    tokensUsed: number;
    fromCache: boolean;
    bossProject?: any;
  }> {
    const session = await this.findOne(sessionId, userId);
    const user = await this.userService.findById(userId);
    const tierString = user.quotaTier.toUpperCase();

    const dayOverview = session.curriculum.days.find(
      (d: any) => d.day === dayNumber,
    );
    if (!dayOverview) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    // Check if this day is part of a boss project
    const bossProject = session.curriculum.bossProjects?.find((bp: any) =>
      bp.combinesDays?.includes(dayNumber),
    );

    // Check if deferred already loaded
    if (dayOverview.deferredLoaded && dayOverview.deferredContent) {
      // Return cached boss project if applicable
      const cachedBossProject = bossProject
        ? session.curriculum.bossProjects.find(
            (bp: any) => bp.day === bossProject.day,
          )
        : null;
      return {
        deferredContent: dayOverview.deferredContent,
        tokensUsed: 0,
        fromCache: true,
        bossProject: cachedBossProject,
      };
    }

    // Generate deferred content with foundation card concepts for consistent personalization
    // Pass foundationCardConcepts from core content and session's improvement areas
    const result = await this.curriculumService.generateDayDeferredDetails(
      session.curriculum,
      dayNumber,
      tierString,
      dayOverview.foundationCardConcepts, // From core generation
      session.improvementAreas,
      session.lessOfAreas,
    );

    let totalTokensUsed = result.tokensUsed;

    // Load boss project details if needed
    if (bossProject && !bossProject.detailsLoaded) {
      try {
        this.logger.log(
          `🎯 Loading boss project details for day ${dayNumber}...`,
        );
        const bossResult = await this.curriculumService.generateBossDetails(
          session.curriculum,
          bossProject.day,
          tierString,
        );
        const bossDetails = bossResult.bossContent;

        this.logger.log(
          `✅ Boss project details loaded: phases=${bossDetails.phases?.length || 0}, requirements=${bossDetails.requirements?.length || 0}, hints=${bossDetails.hints?.length || 0}`,
        );

        // Update the boss project in the curriculum
        const bossIndex = session.curriculum.bossProjects.findIndex(
          (bp: any) => bp.day === bossProject.day,
        );
        if (bossIndex !== -1) {
          session.curriculum.bossProjects[bossIndex] = {
            ...session.curriculum.bossProjects[bossIndex],
            ...bossDetails,
            detailsLoaded: true,
          };
        }

        totalTokensUsed += bossResult.tokensUsed;
      } catch (error) {
        this.logger.warn(`Failed to load boss details: ${error.message}`);
      }
    }

    // Update session with deferred content
    const dayIndex = session.curriculum.days.findIndex(
      (d: any) => d.day === dayNumber,
    );
    session.curriculum.days[dayIndex] = {
      ...session.curriculum.days[dayIndex],
      deferredContent: result.deferredContent,
      deferredLoaded: true,
    };

    // Increment usage
    await this.userService.incrementUsage(userId, totalTokensUsed, 0);
    await this.sessionsRepository.save(session);

    this.logger.log(
      `⏳ Day ${dayNumber} DEFERRED loaded for session ${sessionId}`,
    );

    // Return the boss project if this day is part of one
    const activeBossProject = bossProject
      ? session.curriculum.bossProjects.find(
          (bp: any) => bp.day === bossProject.day,
        )
      : null;

    return {
      deferredContent: result.deferredContent,
      tokensUsed: totalTokensUsed,
      fromCache: result.fromCache || false,
      bossProject: activeBossProject,
    };
  }

  /**
   * Load DEFERRED day content with STREAMING
   * Yields task1, bossMilestone, intensivePractice, openTask, reflection as they parse
   */
  async *loadDayDeferredStream(
    sessionId: string,
    userId: string,
    dayNumber: number,
  ): AsyncGenerator<{ event: string; data: any }> {
    const session = await this.findOne(sessionId, userId);
    const user = await this.userService.findById(userId);
    const tierString = user.quotaTier.toUpperCase();

    const dayOverview = session.curriculum.days.find(
      (d: any) => d.day === dayNumber,
    );
    if (!dayOverview) {
      yield { event: 'error', data: { error: `Day ${dayNumber} not found` } };
      return;
    }

    // Check if already loaded
    if (dayOverview.deferredLoaded && dayOverview.deferredContent) {
      this.logger.log(`📦 Day ${dayNumber} DEFERRED already loaded, streaming cached`);
      const cached = dayOverview.deferredContent;
      if (cached.task1) {
        yield { event: 'task1', data: cached.task1 };
      }
      if (cached.bossMilestone) {
        yield { event: 'bossMilestone', data: cached.bossMilestone };
      }
      if (cached.intensivePractice) {
        yield { event: 'intensivePractice', data: cached.intensivePractice };
      }
      if (cached.openTask) {
        yield { event: 'openTask', data: cached.openTask };
      }
      if (cached.reflection) {
        yield { event: 'reflection', data: cached.reflection };
      }
      yield {
        event: 'complete',
        data: {
          deferredContent: cached,
          tokensUsed: 0,
          fromCache: true,
        },
      };
      return;
    }

    // Stream from curriculum service
    let finalResult: any = null;
    for await (const chunk of this.curriculumService.generateDayDeferredDetailsStream(
      session.curriculum,
      dayNumber,
      tierString,
      dayOverview.foundationCardConcepts,
      session.improvementAreas,
      session.lessOfAreas,
    )) {
      yield chunk;

      if (chunk.event === 'complete') {
        finalResult = chunk.data;
      }
    }

    // Save to session after streaming completes
    if (finalResult?.deferredContent) {
      const dayIndex = session.curriculum.days.findIndex(
        (d: any) => d.day === dayNumber,
      );
      session.curriculum.days[dayIndex] = {
        ...session.curriculum.days[dayIndex],
        deferredContent: finalResult.deferredContent,
        deferredLoaded: true,
      };

      await this.userService.incrementUsage(userId, finalResult.tokensUsed, 0);
      await this.sessionsRepository.save(session);

      this.logger.log(
        `⏳ Day ${dayNumber} DEFERRED streamed and saved for session ${sessionId}`,
      );
    }
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

    const dayIndex = session.curriculum.days.findIndex(
      (d: any) => d.day === dayNumber,
    );
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
      const nextDayIndex = session.curriculum.days.findIndex(
        (d: any) => d.day === dayNumber + 1,
      );
      if (nextDayIndex !== -1) {
        session.curriculum.days[nextDayIndex].status = 'unlockable';
        nextDayUnlocked = true;
      }
    }

    // Update current day
    const previousCurrentDay = session.currentDay;
    if (dayNumber >= session.currentDay) {
      session.currentDay = dayNumber + 1;
      this.logger.log(
        `📍 Advancing currentDay from ${previousCurrentDay} to ${session.currentDay} for session ${sessionId}`,
      );
    }

    await this.sessionsRepository.save(session);

    this.logger.log(
      `✅ Day ${dayNumber} practice submitted for session ${sessionId}. currentDay is now ${session.currentDay}`,
    );

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

    const dayOverview = session.curriculum.days.find(
      (d: any) => d.day === dayNumber,
    );
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

    const dayIndex = session.curriculum.days.findIndex(
      (d: any) => d.day === dayNumber,
    );
    const dayOverview = session.curriculum.days[dayIndex];

    if (!dayOverview) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    // Get the original task (from coreContent or directly on day)
    const originalTask = dayOverview.coreContent?.task1 || dayOverview.task1;
    if (!originalTask) {
      throw new NotFoundException(
        `Task not found for Day ${dayNumber}. Start the day first.`,
      );
    }

    // Check if we already have this format cached
    const cacheKey = `alternativeFormats`;
    const cachedFormats = dayOverview[cacheKey] || {};
    if (cachedFormats[targetFormat]) {
      this.logger.log(
        `📦 Alternative format ${targetFormat} cache HIT for Day ${dayNumber}`,
      );
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

    this.logger.log(
      `🔄 Alternative format ${targetFormat} generated for Day ${dayNumber}`,
    );

    return {
      task: result.task,
      tokensUsed: result.tokensUsed,
      fromCache: false,
    };
  }

  /**
   * Save reflection data including confused concepts
   * This is used to personalize the next day's prePrompt
   */
  async saveReflection(
    sessionId: string,
    userId: string,
    dayNumber: number,
    reflectionData: {
      confidence: number;
      whatClicked?: string;
      whatsFoggy?: string;
      confusedConcepts?: string[];
      lockInSentence?: string;
      warmupPlan?: string;
      boostCompleted?: boolean;
      boostConcept?: string;
    },
  ): Promise<{ saved: boolean }> {
    const session = await this.findOne(sessionId, userId);

    const dayIndex = session.curriculum.days.findIndex(
      (d: any) => d.day === dayNumber,
    );
    if (dayIndex === -1) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    // Store reflection data on the day
    session.curriculum.days[dayIndex].reflectionData = {
      ...reflectionData,
      savedAt: new Date().toISOString(),
    };

    await this.sessionsRepository.save(session);

    this.logger.log(
      `📝 Reflection saved for Day ${dayNumber}, session ${sessionId}. Confused concepts: ${reflectionData.confusedConcepts?.join(', ') || 'none'}`,
    );

    return { saved: true };
  }

  /**
   * Generate a concept boost for a confused student
   */
  async generateConceptBoost(
    sessionId: string,
    userId: string,
    dayNumber: number,
    concept: string,
    originalExplanation: string,
  ): Promise<{ boost: any; tokensUsed: number }> {
    const session = await this.findOne(sessionId, userId);
    const user = await this.userService.findById(userId);

    const result = await this.curriculumService.generateConceptBoost({
      concept,
      originalExplanation,
      skillLevel: session.skillLevel,
      skillName: session.skillName,
      dayNumber,
    });

    // Increment usage
    await this.userService.incrementUsage(userId, result.tokensUsed, 0);

    this.logger.log(
      `💡 Concept boost generated for "${concept}" in session ${sessionId}`,
    );

    return {
      boost: result.boost,
      tokensUsed: result.tokensUsed,
    };
  }

  /**
   * Clear all deferred content from all sessions (admin utility)
   * This forces regeneration of intensive practice/reflection on next load
   */
  async clearAllDeferredContent(): Promise<{ sessionsUpdated: number }> {
    // Use raw query to update all sessions' curriculum.days to remove deferredContent
    const result = await this.sessionsRepository.query(`
      UPDATE sessions
      SET curriculum = jsonb_set(
        curriculum,
        '{days}',
        (
          SELECT COALESCE(jsonb_agg(
            day - 'deferredContent' - 'deferredLoaded'
          ), '[]'::jsonb)
          FROM jsonb_array_elements(curriculum->'days') AS day
        )
      )
      WHERE curriculum->'days' IS NOT NULL
    `);

    const count = result[1] || 0;
    this.logger.log(`✅ Cleared deferredContent from ${count} sessions`);

    return { sessionsUpdated: count };
  }
}
