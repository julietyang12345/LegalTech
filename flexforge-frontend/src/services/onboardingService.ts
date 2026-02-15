import api from './api';
import type {
  RefinementContext,
  DirectionsResponse,
  CompleteOnboardingDto,
} from '@/types';

export const onboardingService = {
  /**
   * Generate learning directions based on user's free-text goal
   * AI interprets the goal and generates 4-6 searchable directions
   */
  async generateDirections(
    goal: string,
    refinement?: RefinementContext,
    goalType?: string
  ): Promise<DirectionsResponse> {
    const { data } = await api.post<DirectionsResponse>(
      '/onboarding/generate-directions',
      { goal, refinement, goalType }
    );
    return data;
  },

  /**
   * Complete onboarding and save learner preferences
   * Called after user selects a direction and depth
   */
  async completeOnboarding(dto: CompleteOnboardingDto): Promise<{ message: string }> {
    const { data } = await api.post<{ message: string }>(
      '/onboarding/complete',
      dto
    );
    return data;
  },

  /**
   * Check if user has completed onboarding
   */
  async getStatus(): Promise<{
    completedOnboarding: boolean;
    needsOnboarding: boolean;
  }> {
    const { data } = await api.get<{
      completedOnboarding: boolean;
      needsOnboarding: boolean;
    }>('/onboarding/status');
    return data;
  },

  /**
   * Reset onboarding - clears preferences so user can start over
   */
  async reset(): Promise<{ message: string }> {
    const { data } = await api.post<{ message: string }>('/onboarding/reset');
    return data;
  },

  /**
   * Skip onboarding - marks as complete with defaults for returning users
   */
  async skipOnboarding(): Promise<{ message: string }> {
    const { data } = await api.post<{ message: string }>('/onboarding/skip');
    return data;
  },

  /**
   * Classify a skill to determine if it supports project-based learning
   * Used by FeelingStep to conditionally show learning style options
   */
  async classifySkill(skillName: string): Promise<{
    supportsProjectBased: boolean;
    skillType: string;
  }> {
    const { data } = await api.post<{
      supportsProjectBased: boolean;
      skillType: string;
    }>('/onboarding/classify-skill', { skillName });
    return data;
  },
};
