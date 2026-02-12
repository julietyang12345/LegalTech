import api from './api';

// Analytics event types for type safety
export type OnboardingEvent =
  | 'onboarding_goal_submitted'
  | 'onboarding_direction_selected'
  | 'onboarding_feeling_submitted';

export type SessionStepEvent =
  | 'session_step_viewed'
  | 'session_step_completed';

export type AnalyticsEvent = OnboardingEvent | SessionStepEvent;

// Session step names for type safety
export type SessionStepName =
  | 'prePrompt'
  | 'video'
  | 'foundationCards'  // Legacy: kept for backward compat with old sessions
  | 'task1'
  | 'bossMilestone'
  | 'openTask'
  | 'reflection';

export interface TrackEventPayload {
  action: AnalyticsEvent;
  metadata?: Record<string, unknown>;
}

export const analyticsService = {
  /**
   * Track an analytics event
   * Fire-and-forget: errors are logged but don't affect the main flow
   */
  async track(action: AnalyticsEvent, metadata?: Record<string, unknown>): Promise<void> {
    try {
      await api.post('/analytics/track', { action, metadata });
    } catch (error) {
      // Log but don't fail the main operation
      console.warn('[Analytics] Failed to track event:', action, error);
    }
  },

  // ==========================================================================
  // ONBOARDING EVENTS
  // ==========================================================================

  /**
   * Track when user submits their learning goal
   */
  async onboardingGoalSubmitted(goal: string): Promise<void> {
    await this.track('onboarding_goal_submitted', { goal, step: 1 });
  },

  /**
   * Track when user selects a learning direction
   */
  async onboardingDirectionSelected(
    directionTitle: string,
    skillType: string
  ): Promise<void> {
    await this.track('onboarding_direction_selected', {
      direction_title: directionTitle,
      skill_type: skillType,
      step: 3,
    });
  },

  /**
   * Track when user submits preferences (familiarity, session length)
   */
  async onboardingFeelingSubmitted(
    familiarity: string,
    sessionLength: string
  ): Promise<void> {
    await this.track('onboarding_feeling_submitted', {
      familiarity,
      session_length: sessionLength,
      step: 4,
    });
  },

  // ==========================================================================
  // SESSION STEP EVENTS
  // ==========================================================================

  /**
   * Track when user views a session step
   */
  async sessionStepViewed(
    sessionId: string,
    dayNumber: number,
    stepName: SessionStepName
  ): Promise<void> {
    await this.track('session_step_viewed', {
      session_id: sessionId,
      day_number: dayNumber,
      step_name: stepName,
    });
  },

  /**
   * Track when user completes a session step
   */
  async sessionStepCompleted(
    sessionId: string,
    dayNumber: number,
    stepName: SessionStepName,
    additionalMetadata?: Record<string, unknown>
  ): Promise<void> {
    await this.track('session_step_completed', {
      session_id: sessionId,
      day_number: dayNumber,
      step_name: stepName,
      ...additionalMetadata,
    });
  },
};
