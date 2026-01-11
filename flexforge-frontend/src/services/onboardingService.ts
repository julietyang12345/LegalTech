import api from './api';
import type {
  LearningDirection,
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
    refinement?: RefinementContext
  ): Promise<DirectionsResponse> {
    const { data } = await api.post<DirectionsResponse>(
      '/onboarding/generate-directions',
      { goal, refinement }
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
};
