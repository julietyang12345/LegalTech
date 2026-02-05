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
import { AnalyticsService } from '../analytics/analytics.service';
import { AiService, AITask } from '../ai/ai.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(Session)
    private sessionsRepository: Repository<Session>,
    private curriculumService: CurriculumService,
    private cacheService: CurriculumCacheService,
    private userService: UserService,
    private analyticsService: AnalyticsService,
    private aiService: AiService,
  ) {}

  // ============================================
  // SHARED HELPERS (avoid code duplication)
  // ============================================

  /**
   * Get day overview from session or throw NotFoundException
   */
  private getDayOverview(session: Session, dayNumber: number): any {
    const dayOverview = session.curriculum.days.find(
      (d: any) => d.day === dayNumber,
    );
    if (!dayOverview) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }
    return dayOverview;
  }

  /**
   * Check if core content is valid (has foundation cards)
   * Returns false if forceRegenerate or content is missing/invalid
   */
  private isCoreContentValid(
    dayOverview: any,
    forceRegenerate: boolean,
  ): boolean {
    if (forceRegenerate) return false;
    if (!dayOverview.coreLoaded || !dayOverview.coreContent) return false;

    const cards =
      dayOverview.coreContent.foundationCards ||
      dayOverview.coreContent.languageFoundationCards ||
      [];
    return cards.length > 0;
  }

  /**
   * Check if deferred content is valid (loaded and present)
   * Returns false if forceRegenerate or content is missing
   */
  private isDeferredContentValid(
    dayOverview: any,
    forceRegenerate: boolean,
  ): boolean {
    if (forceRegenerate) return false;
    return dayOverview.deferredLoaded && dayOverview.deferredContent;
  }

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

    // Check daily curriculum generation limit
    const dailyLimit = await this.userService.checkDailyCurriculumLimit(userId);
    if (!dailyLimit.allowed) {
      throw new ForbiddenException(
        `Daily curriculum limit reached (${dailyLimit.limit}/day). Try again tomorrow or upgrade your plan.`,
      );
    }

    // Generate curriculum with tier-specific access
    const tierString = user.getEffectiveTier().toUpperCase();

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
        // Cache HIT - but STRICTLY verify the cached curriculum is for the right skill
        const cachedSkillName = cacheResult.curriculum?.metadata?.skillName;
        const requestedSkillName = createSessionDto.skillName;

        // Strict skill match verification
        const isValidMatch = this.verifySkillMatch(requestedSkillName, cachedSkillName);

        if (!isValidMatch) {
          this.logger.warn(
            `🚨 Cache HIT REJECTED: requested "${requestedSkillName}" but cached is "${cachedSkillName}". ` +
            `Skills don't match - treating as cache MISS.`
          );
          // Treat as cache miss - fall through to generate new curriculum
        } else {
          curriculum = cacheResult.curriculum;
          variantId = cacheResult.variantId;
          fromCache = true;
          this.logger.log(
            `📦 Cache HIT for "${createSessionDto.skillName}" - variant ${variantId}`,
          );
        }
      }

      if (!curriculum) {
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

    let savedSession: Session;
    try {
      this.logger.log(`💾 Attempting to save session for user ${userId}...`);
      savedSession = await this.sessionsRepository.save(session);
      this.logger.log(`💾 Session save returned ID: ${savedSession?.id}`);
    } catch (saveError) {
      this.logger.error(`❌ Session save FAILED: ${saveError.message}`, saveError.stack);
      throw saveError;
    }

    // Verify the session was actually persisted
    const verifySession = await this.sessionsRepository.findOne({ where: { id: savedSession.id } });
    if (!verifySession) {
      this.logger.error(`❌ Session ${savedSession.id} was NOT persisted to database!`);
      throw new Error(`Session save appeared successful but session ${savedSession.id} not found in database`);
    }
    this.logger.log(`✅ Session ${savedSession.id} verified in database`);

    // Track session started
    await this.analyticsService.sessionStarted(
      userId,
      savedSession.id,
      savedSession.skillName,
      1, // Day 1
    );

    // Increment daily curriculum usage counter (always, even from cache)
    await this.userService.incrementDailyCurriculumUsage(userId);

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
   * Also fixes missing coreLoaded/deferredLoaded flags for old sessions
   */
  async findOne(id: string, userId: string): Promise<Session> {
    const session = await this.sessionsRepository.findOne({
      where: { id, userId },
      relations: ['progress'],
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Fix missing coreLoaded/deferredLoaded flags for old sessions
    const repaired = await this.repairContentFlags(session);
    return repaired;
  }

  /**
   * Repair missing coreLoaded/deferredLoaded flags for old sessions
   * This fixes data from before the JSONB save fix was applied
   */
  private async repairContentFlags(session: Session): Promise<Session> {
    if (!session.curriculum?.days) return session;

    let flagsFixed = false;
    const updatedDays = session.curriculum.days.map((day: any) => {
      let updated = { ...day };
      if (day.coreContent && !day.coreLoaded) {
        updated.coreLoaded = true;
        flagsFixed = true;
      }
      if (day.deferredContent && !day.deferredLoaded) {
        updated.deferredLoaded = true;
        flagsFixed = true;
      }
      return updated;
    });

    if (flagsFixed) {
      this.logger.log(
        `🔧 Repaired content flags for session ${session.id}`,
      );
      session.curriculum = {
        ...session.curriculum,
        days: updatedDays,
      };
      await this.sessionsRepository.save(session);
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
      // Track session completion
      await this.analyticsService.sessionCompleted(
        userId,
        id,
        session.currentDay,
      );
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
   * And fixes missing coreLoaded/deferredLoaded flags for old sessions
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

    // Fix missing coreLoaded/deferredLoaded flags for old sessions
    const repaired = await this.repairContentFlags(session);
    return repaired;
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
   * Check regeneration rate limit status
   * Frontend can use this to show upgrade panel before attempting regeneration
   */
  async checkRegenRateLimit(
    sessionId: string,
    userId: string,
    dayNumber: number,
  ): Promise<{
    canRegenerate: boolean;
    used: number;
    limit: number;
    remaining: number;
    requiresUpgrade: boolean;
    currentTier: string;
    upgradeMessage: string;
  }> {
    const user = await this.userService.findById(userId);
    const dailyLimits = user.getDailyLimits();
    const regenLimit = dailyLimits.dayContentRegens;
    const regenCount = await this.cacheService.getDayRegenCount(sessionId, dayNumber);
    const userTier = user.getEffectiveTier();
    const remaining = Math.max(0, regenLimit - regenCount);
    const canRegenerate = remaining > 0;

    let upgradeMessage = '';
    let requiresUpgrade = false;

    if (!canRegenerate) {
      requiresUpgrade = userTier === 'FREE' || userTier === 'PRO';
      upgradeMessage = userTier === 'FREE'
        ? 'Upgrade to Pro for more daily regenerations'
        : userTier === 'PRO'
          ? 'Upgrade to Premium for unlimited regenerations'
          : 'Try again tomorrow';
    }

    return {
      canRegenerate,
      used: regenCount,
      limit: regenLimit,
      remaining,
      requiresUpgrade,
      currentTier: userTier,
      upgradeMessage,
    };
  }

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
    const tierString = user.getEffectiveTier().toUpperCase();
    // Use user's tier-based daily limit (admins get PRO limits)
    const dailyLimits = user.getDailyLimits();
    const regenLimit = dailyLimits.dayContentRegens;

    // Check if day is unlockable (uses shared helper)
    const dayOverview = this.getDayOverview(session, dayNumber);

    // Day 1 is always unlockable
    if (dayNumber > 1) {
      const previousDay = this.getDayOverview(session, dayNumber - 1);
      if (
        previousDay?.status !== 'completed' &&
        previousDay?.status !== 'skipped'
      ) {
        throw new ForbiddenException(
          `Complete Day ${dayNumber - 1} practice project first to unlock Day ${dayNumber}`,
        );
      }
    }

    // Check if core content already loaded (uses shared helper)
    if (this.isCoreContentValid(dayOverview, forceRegenerate)) {
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
      // Check rate limit before allowing regeneration (use user-specific limit)
      const isLimitReached = await this.cacheService.isDayRegenLimitReached(
        sessionId,
        dayNumber,
        regenLimit,
      );
      if (isLimitReached) {
        const regenCount = await this.cacheService.getDayRegenCount(sessionId, dayNumber);
        const userTier = user.getEffectiveTier();
        throw new HttpException(
          {
            message: `Daily regeneration limit reached (${regenLimit} per day)`,
            code: 'REGEN_LIMIT_REACHED',
            requiresUpgrade: userTier === 'FREE' || userTier === 'PRO',
            currentTier: userTier,
            currentLimit: regenLimit,
            currentUsage: regenCount,
            upgradeMessage: userTier === 'FREE'
              ? 'Upgrade to Pro for more daily regenerations'
              : userTier === 'PRO'
                ? 'Upgrade to Premium for unlimited regenerations'
                : 'Try again tomorrow',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Track day regeneration for analytics
      const currentRegenCount = await this.cacheService.getDayRegenCount(sessionId, dayNumber);
      await this.analyticsService.sessionDayRegenerated(
        userId,
        sessionId,
        session.skillName,
        dayNumber,
        currentRegenCount + 1, // Include this regeneration in the count
      );

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
      // Force TypeORM to detect JSONB change by reassigning entire curriculum
      const dayIndex = session.curriculum.days.findIndex(
        (d: any) => d.day === dayNumber,
      );
      if (dayIndex !== -1) {
        const dayData = session.curriculum.days[dayIndex];
        const updatedDays = [...session.curriculum.days];
        // Create a clean day object without the cleared properties
        const {
          practiceSubmitted, practiceAnswer, practiceConfidence,
          reflectionData, deferredLoaded, deferredContent, alternativeFormats,
          ...cleanDayData
        } = dayData;
        updatedDays[dayIndex] = {
          ...cleanDayData,
          status: 'in_progress',
          forceRegenerated: true, // Flag to bypass L2 cache in deferred generation
        };
        session.curriculum = {
          ...session.curriculum,
          days: updatedDays,
        };
        this.logger.log(`🧹 Cleared all progress for Day ${dayNumber}`);
      }

      // Also clear boss project cache if this day is part of one
      if (session.curriculum.bossProjects) {
        const bossProjectIndex = session.curriculum.bossProjects.findIndex((bp: any) =>
          bp.combinesDays?.includes(dayNumber),
        );
        if (bossProjectIndex !== -1) {
          const bossProject = session.curriculum.bossProjects[bossProjectIndex];
          // Create a clean boss project object without the cleared properties
          const { phases, requirements, hints, files, ...cleanBossData } = bossProject;
          const updatedBossProjects = [...session.curriculum.bossProjects];
          updatedBossProjects[bossProjectIndex] = {
            ...cleanBossData,
            detailsLoaded: false,
          };
          session.curriculum = {
            ...session.curriculum,
            bossProjects: updatedBossProjects,
          };
          this.logger.log(
            `🧹 Cleared boss project cache for Day ${bossProject.day}`,
          );
        }
      }

      // Clear L1 (in-memory) day content caches for both CORE and DEFERRED
      // Only clears in-memory cache - L2 (database) is preserved for variant tracking and regen rate metrics
      const metadata = session.curriculum.metadata;
      if (metadata?.skillName) {
        try {
          // Use the same AI normalization as the cache key builder
          const normalizedSkill = await this.cacheService.normalizeSkillForDayCache(metadata.skillName);
          const skillKey = normalizedSkill.replace(/\s+/g, '-');
          const cacheKeyBase = `day-content:${skillKey}:d${metadata.durationDays || 0}:h${metadata.hoursPerDay || 0}:${(metadata.skillLevel || 'beginner').toLowerCase()}:day${dayNumber}`;

          // Clear L1 caches only (preserve L2 for variant tracking)
          this.cacheService.clearDayContentFromMemory(`${cacheKeyBase}:core`);
          this.cacheService.clearDayContentFromMemory(`${cacheKeyBase}:deferred`);
          this.logger.log(`🧹 Cleared L1 day content caches for Day ${dayNumber} (core + deferred)`);
        } catch (error) {
          this.logger.warn(`⚠️ Failed to clear day content caches: ${error.message}`);
        }
      }
    }

    // Validate curriculum metadata before generating day content
    // This prevents cache key collisions between different subjects
    const metadataSkillName = session.curriculum?.metadata?.skillName;
    const sessionSkillName = session.skillName;

    // Check 1: Missing metadata.skillName
    if (!metadataSkillName) {
      this.logger.error(
        `⚠️ Session ${sessionId} has curriculum with missing metadata.skillName! ` +
          `Session skillName: "${sessionSkillName}", ` +
          `Curriculum metadata: ${JSON.stringify(session.curriculum?.metadata)}`,
      );
      // Fix the metadata if it's missing but session has skillName
      if (sessionSkillName && session.curriculum) {
        session.curriculum.metadata = {
          ...session.curriculum.metadata,
          skillName: sessionSkillName,
          durationDays: session.durationDays,
          hoursPerDay: session.hoursPerDay,
          skillLevel: session.skillLevel,
        };
        this.logger.log(
          `🔧 Fixed curriculum metadata for session ${sessionId}: skillName="${sessionSkillName}"`,
        );
        await this.sessionsRepository.save(session);
      }
    }
    // Check 2: Mismatched skillName (wrong curriculum from cache collision)
    else if (metadataSkillName.toLowerCase() !== sessionSkillName.toLowerCase()) {
      this.logger.error(
        `🚨 CRITICAL: Session ${sessionId} has MISMATCHED skillName! ` +
          `Session wants "${sessionSkillName}" but curriculum is for "${metadataSkillName}". ` +
          `This indicates a cache collision - fixing metadata and forcing regeneration.`,
      );
      // Fix the metadata to match what the session actually requested
      if (session.curriculum) {
        session.curriculum.metadata = {
          ...session.curriculum.metadata,
          skillName: sessionSkillName,
          durationDays: session.durationDays,
          hoursPerDay: session.hoursPerDay,
          skillLevel: session.skillLevel,
        };
        this.logger.log(
          `🔧 Fixed curriculum metadata mismatch for session ${sessionId}: "${metadataSkillName}" → "${sessionSkillName}"`,
        );
        await this.sessionsRepository.save(session);
        // Force regeneration since the content is for the wrong subject
        forceRegenerate = true;
        this.logger.log(`🔄 Forcing day content regeneration due to skillName mismatch`);
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

    const updatedDays = [...session.curriculum.days];
    updatedDays[dayIndex] = {
      ...updatedDays[dayIndex],
      coreContent: result.coreContent,
      coreLoaded: true,
      status: 'in_progress',
      variantId: result.variantId, // Store variant ID for regen tracking
      foundationCardConcepts: result.foundationCardConcepts, // Store for deferred generation
    };

    // Force TypeORM to detect JSONB change by reassigning entire curriculum
    session.curriculum = {
      ...session.curriculum,
      days: updatedDays,
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
      `💾 Saved session with coreLoaded=true for day ${dayNumber}`,
    );

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
    const tierString = user.getEffectiveTier().toUpperCase();

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

      // Force TypeORM to detect JSONB change by reassigning entire curriculum
      const updatedDays = [...session.curriculum.days];
      updatedDays[dayIndex] = {
        ...updatedDays[dayIndex],
        coreContent: finalResult.coreContent,
        coreLoaded: true,
        status: 'in_progress',
        variantId: finalResult.variantId,
        foundationCardConcepts: finalResult.foundationCardConcepts,
      };

      session.curriculum = {
        ...session.curriculum,
        days: updatedDays,
      };

      if (dayNumber > session.currentDay) {
        session.currentDay = dayNumber;
      }

      await this.userService.incrementUsage(userId, finalResult.tokensUsed, 0);
      await this.sessionsRepository.save(session);

      this.logger.log(
        `💾 Saved session with coreLoaded=true for day ${dayNumber} (streaming)`,
      );

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
    forceRegenerateParam?: boolean,
  ): Promise<{
    deferredContent: any;
    tokensUsed: number;
    fromCache: boolean;
    bossProject?: any;
  }> {
    const session = await this.findOne(sessionId, userId);
    const user = await this.userService.findById(userId);
    const tierString = user.getEffectiveTier().toUpperCase();

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

    // Check if this day was force regenerated (flag set by loadDayContent or passed directly)
    // This flag must be checked BEFORE the cache check
    const forceRegenerate = forceRegenerateParam || dayOverview.forceRegenerated || false;

    // Check if deferred already loaded (unless force regenerating)
    if (!forceRegenerate && dayOverview.deferredLoaded && dayOverview.deferredContent) {
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
      forceRegenerate, // Pass through to bypass L2 cache when day was force regenerated
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
        // Force TypeORM to detect JSONB change by reassigning entire array
        const bossIndex = session.curriculum.bossProjects.findIndex(
          (bp: any) => bp.day === bossProject.day,
        );
        if (bossIndex !== -1) {
          const updatedBossProjects = [...session.curriculum.bossProjects];
          updatedBossProjects[bossIndex] = {
            ...updatedBossProjects[bossIndex],
            ...bossDetails,
            detailsLoaded: true,
          };
          session.curriculum = {
            ...session.curriculum,
            bossProjects: updatedBossProjects,
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

    // Force TypeORM to detect JSONB change by reassigning entire curriculum
    const updatedDays = [...session.curriculum.days];
    // Clear forceRegenerated flag after deferred generation
    const { forceRegenerated: _, ...dayDataWithoutFlag } = updatedDays[dayIndex];
    updatedDays[dayIndex] = {
      ...dayDataWithoutFlag,
      deferredContent: result.deferredContent,
      deferredLoaded: true,
    };

    session.curriculum = {
      ...session.curriculum,
      days: updatedDays,
    };

    // Increment usage
    await this.userService.incrementUsage(userId, totalTokensUsed, 0);
    await this.sessionsRepository.save(session);

    this.logger.log(
      `💾 Saved session with deferredLoaded=true for day ${dayNumber}`,
    );

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
    const tierString = user.getEffectiveTier().toUpperCase();

    const dayOverview = session.curriculum.days.find(
      (d: any) => d.day === dayNumber,
    );
    if (!dayOverview) {
      yield { event: 'error', data: { error: `Day ${dayNumber} not found` } };
      return;
    }

    // Check if this day was force regenerated (flag set by loadDayContent)
    // This flag must be checked BEFORE the cache check
    const forceRegenerate = dayOverview.forceRegenerated || false;

    // Check if already loaded (unless force regenerating)
    if (!forceRegenerate && dayOverview.deferredLoaded && dayOverview.deferredContent) {
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
      forceRegenerate, // Pass through to bypass L2 cache when day was force regenerated
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

      // Force TypeORM to detect JSONB change by reassigning entire curriculum
      const updatedDays = [...session.curriculum.days];
      // Clear forceRegenerated flag after deferred generation
      const { forceRegenerated: _, ...dayDataWithoutFlag } = updatedDays[dayIndex];
      updatedDays[dayIndex] = {
        ...dayDataWithoutFlag,
        deferredContent: finalResult.deferredContent,
        deferredLoaded: true,
      };

      session.curriculum = {
        ...session.curriculum,
        days: updatedDays,
      };

      await this.userService.incrementUsage(userId, finalResult.tokensUsed, 0);
      await this.sessionsRepository.save(session);

      this.logger.log(
        `💾 Saved session with deferredLoaded=true for day ${dayNumber} (streaming)`,
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

    // Force TypeORM to detect JSONB change by reassigning entire curriculum
    const updatedDays = [...session.curriculum.days];

    // Mark day as completed
    updatedDays[dayIndex] = {
      ...updatedDays[dayIndex],
      status: 'completed',
      practiceSubmitted: true,
      practiceAnswer: answer,
      practiceConfidence: confidence,
    };

    // Unlock next day
    let nextDayUnlocked = false;
    if (dayNumber < session.curriculum.days.length) {
      const nextDayIndex = updatedDays.findIndex(
        (d: any) => d.day === dayNumber + 1,
      );
      if (nextDayIndex !== -1) {
        updatedDays[nextDayIndex] = {
          ...updatedDays[nextDayIndex],
          status: 'unlockable',
        };
        nextDayUnlocked = true;
      }
    }

    session.curriculum = {
      ...session.curriculum,
      days: updatedDays,
    };

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

    // Force TypeORM to detect JSONB change by reassigning entire curriculum
    const updatedDays = [...session.curriculum.days];
    updatedDays[dayIndex] = {
      ...updatedDays[dayIndex],
      alternativeFormats: {
        ...cachedFormats,
        [targetFormat]: result.task,
      },
    };

    session.curriculum = {
      ...session.curriculum,
      days: updatedDays,
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

    // Force TypeORM to detect JSONB change by reassigning entire curriculum
    const updatedDays = [...session.curriculum.days];
    updatedDays[dayIndex] = {
      ...updatedDays[dayIndex],
      reflectionData: {
        ...reflectionData,
        savedAt: new Date().toISOString(),
      },
    };

    session.curriculum = {
      ...session.curriculum,
      days: updatedDays,
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
   * Generate AI-powered skill combos based on user's learned skills
   * Pro: 1 per day, Premium: unlimited
   * Uses Haiku for fast, cheap generation
   */
  async generateSkillCombos(
    userId: string,
    selectedSkills: string[] = [],
    action: 'combo' | 'analyze' | 'related' | 'path' = 'combo',
  ): Promise<{
    combos: Array<{
      project: string;
      description: string;
      skills: string[];
      icon: string;
    }>;
    suggestedSkills: Array<{
      skill: string;
      unlocks: string[];
      icon: string;
    }>;
    analysis?: {
      realWorldUses: string[];
    } | null;
    tokensUsed: number;
    remainingToday: number;
    limit: number;
  }> {
    const user = await this.userService.findById(userId);
    const isAdmin = user.isAdmin();
    const effectiveTier = user.getEffectiveTier();

    // Debug logging for admin issues
    this.logger.log(
      `🎯 Skill combos for user ${userId}: email=${user.email}, role=${user.role}, ` +
      `isAdmin=${isAdmin}, effectiveTier=${effectiveTier}`,
    );

    // Daily limits by tier: FREE=1, PRO=5, PREMIUM/ADMIN=unlimited
    let dailyLimit: number;
    if (isAdmin || effectiveTier === QuotaTier.UNLIMITED || effectiveTier === QuotaTier.PREMIUM) {
      dailyLimit = Infinity;
    } else if (effectiveTier === QuotaTier.PRO) {
      dailyLimit = 5;
    } else {
      dailyLimit = 1; // FREE tier
    }

    // Check daily limit
    const today = new Date().toISOString().split('T')[0];
    const comboGen = user.preferences?.skillComboGeneration;
    const lastGenDate = comboGen?.lastGeneratedAt?.split('T')[0];
    const countToday = lastGenDate === today ? (comboGen?.countToday || 0) : 0;

    if (dailyLimit !== Infinity && countToday >= dailyLimit) {
      const upgradeMsg = effectiveTier === QuotaTier.FREE
        ? 'Upgrade to Pro for 5/day or Premium for unlimited.'
        : 'Upgrade to Premium for unlimited.';
      throw new ForbiddenException(
        `Daily limit reached (${dailyLimit}/day). ${upgradeMsg}`,
      );
    }

    // Get user's completed and in-progress skills
    const sessions = await this.findAllByUser(userId);
    const userSkills = sessions
      .filter(
        (s) =>
          s.status === SessionStatus.COMPLETED ||
          s.status === SessionStatus.ACTIVE,
      )
      .map((s) => s.skillName);

    // Use selected skills if provided, otherwise fall back to user's learned skills
    const targetSkills = selectedSkills.length > 0 ? selectedSkills : userSkills;

    this.logger.log(
      `🎯 Skill combos: action=${action}, selectedSkills=[${selectedSkills.join(', ')}], userSkills=[${userSkills.join(', ')}], targetSkills=[${targetSkills.join(', ')}]`,
    );

    if (targetSkills.length === 0) {
      return {
        combos: [],
        suggestedSkills: [],
        tokensUsed: 0,
        remainingToday: dailyLimit === Infinity ? Infinity : dailyLimit - countToday,
        limit: dailyLimit,
      };
    }

    // Common JSON format instructions
    const jsonInstruction = 'Return ONLY valid JSON, no markdown or explanation.';
    const suggestedSkillFormat = '{ skill: string, unlocks: string[], icon: emoji, reason: string }';

    // Generate prompt based on action type
    let prompt: string;
    let systemPrompt: string;

    switch (action) {
      case 'analyze':
        // Deep analysis of a single skill - focused on real world uses
        const skill = targetSkills[0];
        prompt = `Analyze "${skill}" for a learner.

Return JSON with:
{
  "analysis": {
    "realWorldUses": ["5-6 specific industry applications and use cases"]
  }
}

${jsonInstruction}`;
        systemPrompt = `Skill analysis expert. Provide practical, real-world applications for "${skill}". Return valid JSON.`;
        break;

      case 'related':
        // Find related/complementary skills
        prompt = `Find skills related to: ${targetSkills.join(', ')}

Return JSON with:
{
  "suggestedSkills": [${suggestedSkillFormat}] // 4-5 closely related skills with reasons
}

Focus on skills commonly used together in real projects.

${jsonInstruction}`;
        systemPrompt = `Technology ecosystem expert. Find skills that complement: ${targetSkills.join(', ')}. Return valid JSON.`;
        break;

      case 'combo':
      default:
        // Project ideas combining multiple skills
        prompt = `Create project ideas combining: ${targetSkills.join(' + ')}
${userSkills.length > 0 ? `Context - user also knows: ${userSkills.join(', ')}` : ''}

Return JSON with:
{
  "combos": [{ project: string, description: string (15 words), skills: string[], icon: emoji }], // 3-5 projects
  "suggestedSkills": [${suggestedSkillFormat}] // 2-3 skills to learn next
}

Projects MUST use ${targetSkills.join(' AND ')} together. Be creative but practical.

${jsonInstruction}`;
        systemPrompt = `Creative project advisor. Generate achievable projects combining: ${targetSkills.join(', ')}. Return valid JSON.`;
        break;
    }

    try {
      // Use GPT-4o-mini for fast, cheap generation
      const response = await this.aiService.routeRequest(
        AITask.QUIZ_GENERATION,
        prompt,
        systemPrompt,
      );

      // Parse the JSON response
      const cleanContent = response.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const parsed = JSON.parse(cleanContent);

      // Update daily generation count
      const newCount = countToday + 1;
      await this.userService.updateSkillComboGeneration(userId, newCount);

      // Increment token usage
      await this.userService.incrementUsage(userId, response.tokensUsed, 0);

      this.logger.log(
        `🎨 Generated skill ${action} for user ${userId} (${newCount}/${dailyLimit} today)`,
      );

      return {
        combos: parsed.combos || [],
        suggestedSkills: parsed.suggestedSkills || [],
        analysis: parsed.analysis || null, // Include analysis for 'analyze' action
        tokensUsed: response.tokensUsed,
        remainingToday: dailyLimit === Infinity ? Infinity : dailyLimit - newCount,
        limit: dailyLimit,
      };
    } catch (error) {
      this.logger.error(`Failed to generate skill combos: ${error.message}`);
      throw error;
    }
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

  /**
   * Strictly verify that requested skill matches cached skill
   * Returns true only if they're essentially the same skill
   */
  private verifySkillMatch(requestedSkill: string, cachedSkill: string | undefined): boolean {
    if (!cachedSkill) return false;

    const requestedLower = requestedSkill.toLowerCase().trim();
    const cachedLower = cachedSkill.toLowerCase().trim();

    // Exact match
    if (requestedLower === cachedLower) return true;

    // Extract meaningful words (ignore filler words)
    const fillerWords = new Set([
      'the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'with', 'and', 'or',
      'how', 'learn', 'learning', 'basics', 'basic', 'beginner', 'beginners',
      'introduction', 'intro', 'tutorial', 'course', 'guide', 'advanced',
      'intermediate', 'using', 'build', 'building', 'create', 'creating'
    ]);

    const getKeyWords = (text: string): string[] =>
      text.split(/\s+/)
        .map(w => w.replace(/[^a-z0-9]/g, ''))
        .filter(w => w.length > 1 && !fillerWords.has(w));

    const requestedWords = getKeyWords(requestedLower);
    const cachedWords = getKeyWords(cachedLower);

    if (requestedWords.length === 0 || cachedWords.length === 0) {
      return false;
    }

    // PRIMARY SUBJECT must match (first meaningful word)
    const requestedPrimary = requestedWords[0];
    const cachedPrimary = cachedWords[0];

    const primaryMatch =
      requestedPrimary === cachedPrimary ||
      requestedPrimary.includes(cachedPrimary) ||
      cachedPrimary.includes(requestedPrimary);

    if (!primaryMatch) {
      this.logger.debug(
        `Skill mismatch: primary "${requestedPrimary}" vs "${cachedPrimary}"`
      );
      return false;
    }

    // Require high word overlap (at least 80% of cached words in requested)
    const overlapCount = cachedWords.filter(w =>
      requestedWords.includes(w) || requestedLower.includes(w)
    ).length;
    const overlapRatio = overlapCount / cachedWords.length;

    if (overlapRatio < 0.8) {
      this.logger.debug(
        `Skill mismatch: overlap ${(overlapRatio * 100).toFixed(0)}% < 80%`
      );
      return false;
    }

    return true;
  }
}
