import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  private async track(
    userId: string,
    action: string,
    resourceId: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    try {
      await this.auditLogRepo.save({
        userId,
        action,
        resourceType: 'session',
        resourceId,
        metadata,
      });
    } catch (error) {
      // Log but don't fail the main operation
      this.logger.warn(`Analytics tracking failed: ${error.message}`);
    }
  }

  async sessionStarted(
    userId: string,
    sessionId: string,
    skillName: string,
    dayNumber: number,
  ): Promise<void> {
    await this.track(userId, 'session_started', sessionId, {
      skill_name: skillName,
      day_number: dayNumber,
    });
    this.logger.debug(
      `📊 Tracked session_started: session=${sessionId}, skill=${skillName}, day=${dayNumber}`,
    );
  }

  async stepCompleted(
    userId: string,
    sessionId: string,
    step: string,
    dayNumber: number,
  ): Promise<void> {
    await this.track(userId, 'session_step_completed', sessionId, {
      step,
      day_number: dayNumber,
    });
    this.logger.debug(
      `📊 Tracked session_step_completed: session=${sessionId}, step=${step}, day=${dayNumber}`,
    );
  }

  async sessionCompleted(
    userId: string,
    sessionId: string,
    dayNumber: number,
  ): Promise<void> {
    await this.track(userId, 'session_completed', sessionId, {
      day_number: dayNumber,
    });
    this.logger.debug(
      `📊 Tracked session_completed: session=${sessionId}, day=${dayNumber}`,
    );
  }

  // ==========================================================================
  // ONBOARDING TRACKING
  // ==========================================================================

  async onboardingGoalSubmitted(userId: string, goal: string): Promise<void> {
    await this.track(userId, 'onboarding_goal_submitted', userId, {
      goal,
      step: 1,
    });
    this.logger.debug(`📊 Tracked onboarding_goal_submitted: user=${userId}`);
  }

  async onboardingDirectionsShown(
    userId: string,
    directionCount: number,
  ): Promise<void> {
    await this.track(userId, 'onboarding_directions_shown', userId, {
      direction_count: directionCount,
      step: 2,
    });
    this.logger.debug(
      `📊 Tracked onboarding_directions_shown: user=${userId}, count=${directionCount}`,
    );
  }

  async onboardingDirectionSelected(
    userId: string,
    directionTitle: string,
    skillType: string,
  ): Promise<void> {
    await this.track(userId, 'onboarding_direction_selected', userId, {
      direction_title: directionTitle,
      skill_type: skillType,
      step: 3,
    });
    this.logger.debug(
      `📊 Tracked onboarding_direction_selected: user=${userId}, direction=${directionTitle}`,
    );
  }

  async onboardingFeelingSubmitted(
    userId: string,
    familiarity: string,
    sessionLength: string,
  ): Promise<void> {
    await this.track(userId, 'onboarding_feeling_submitted', userId, {
      familiarity,
      session_length: sessionLength,
      step: 4,
    });
    this.logger.debug(
      `📊 Tracked onboarding_feeling_submitted: user=${userId}, familiarity=${familiarity}`,
    );
  }

  async onboardingCompleted(
    userId: string,
    durationSeconds: number,
  ): Promise<void> {
    await this.track(userId, 'onboarding_completed', userId, {
      duration_seconds: durationSeconds,
      step: 5,
    });
    this.logger.debug(
      `📊 Tracked onboarding_completed: user=${userId}, duration=${durationSeconds}s`,
    );
  }

  // ==========================================================================
  // CURRICULUM TRACKING
  // ==========================================================================

  async curriculumEstimateStarted(
    userId: string,
    skillName: string,
  ): Promise<void> {
    await this.track(userId, 'curriculum_estimate_started', userId, {
      skill_name: skillName,
    });
    this.logger.debug(
      `📊 Tracked curriculum_estimate_started: user=${userId}, skill=${skillName}`,
    );
  }

  async curriculumEstimateCompleted(
    userId: string,
    skillName: string,
    estimatedDays: number,
  ): Promise<void> {
    await this.track(userId, 'curriculum_estimate_completed', userId, {
      skill_name: skillName,
      estimated_days: estimatedDays,
    });
    this.logger.debug(
      `📊 Tracked curriculum_estimate_completed: user=${userId}, skill=${skillName}, days=${estimatedDays}`,
    );
  }

  async curriculumRegenerated(
    userId: string,
    skillName: string,
    regenCountToday: number,
  ): Promise<void> {
    await this.track(userId, 'curriculum_regenerated', userId, {
      skill_name: skillName,
      regen_count_today: regenCountToday,
    });
    this.logger.debug(
      `📊 Tracked curriculum_regenerated: user=${userId}, skill=${skillName}, count=${regenCountToday}`,
    );
  }

  // ==========================================================================
  // SESSION DAY TRACKING
  // ==========================================================================

  async sessionDayRegenerated(
    userId: string,
    sessionId: string,
    skillName: string,
    dayNumber: number,
    regenCountToday: number,
  ): Promise<void> {
    await this.track(userId, 'session_day_regenerated', sessionId, {
      skill_name: skillName,
      day_number: dayNumber,
      regen_count_today: regenCountToday,
    });
    this.logger.debug(
      `📊 Tracked session_day_regenerated: session=${sessionId}, day=${dayNumber}, count=${regenCountToday}`,
    );
  }

  // ==========================================================================
  // SESSION STEP TRACKING
  // ==========================================================================

  async sessionStepViewed(
    userId: string,
    sessionId: string,
    dayNumber: number,
    stepName: string,
  ): Promise<void> {
    await this.track(userId, 'session_step_viewed', sessionId, {
      day_number: dayNumber,
      step_name: stepName,
    });
    this.logger.debug(
      `📊 Tracked session_step_viewed: session=${sessionId}, day=${dayNumber}, step=${stepName}`,
    );
  }

  async sessionStepCompleted(
    userId: string,
    sessionId: string,
    dayNumber: number,
    stepName: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.track(userId, 'session_step_completed', sessionId, {
      day_number: dayNumber,
      step_name: stepName,
      ...metadata,
    });
    this.logger.debug(
      `📊 Tracked session_step_completed: session=${sessionId}, day=${dayNumber}, step=${stepName}`,
    );
  }

  // ==========================================================================
  // GENERIC TRACKING (for frontend)
  // ==========================================================================

  async trackEvent(
    userId: string,
    action: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    await this.track(userId, action, userId, metadata);
    this.logger.debug(`📊 Tracked ${action}: user=${userId}`);
  }

  // ==========================================================================
  // USER SPENDING REPORTS
  // ==========================================================================

  /**
   * Get all users' daily AI spending (for admin dashboard)
   */
  async getUsersDailySpending(): Promise<
    Array<{
      email: string;
      name: string | null;
      tokensToday: number;
      spendingToday: number;
      usageDate: string | null;
      tokensThisMonth: number;
      quotaTier: string;
    }>
  > {
    const users = await this.userRepo.find({
      select: [
        'email',
        'name',
        'aiTokensUsedToday',
        'aiSpendingToday',
        'aiUsageDate',
        'tokensUsedThisMonth',
        'quotaTier',
      ],
      order: { aiSpendingToday: 'DESC' },
    });

    return users.map((u) => ({
      email: u.email,
      name: u.name,
      tokensToday: u.aiTokensUsedToday || 0,
      spendingToday: Number(u.aiSpendingToday) || 0,
      usageDate: u.aiUsageDate ? u.aiUsageDate.toISOString().split('T')[0] : null,
      tokensThisMonth: u.tokensUsedThisMonth || 0,
      quotaTier: u.quotaTier,
    }));
  }
}
