import api from './api';
import type { CompanionMessage } from '@/types';

export interface CompanionChatResponse {
  message: string;
  response: {
    content: string;
    mood: string;
  };
  quickActions?: string[];
}

export const companionService = {
  /**
   * Send message to companion (Flexi)
   */
  async chat(
    message: string,
    context?: {
      sessionId?: string;
      currentTopic?: string;
      currentStep?: string;
    }
  ): Promise<CompanionChatResponse> {
    const { data } = await api.post<CompanionChatResponse>('/companion/chat', {
      message,
      ...context,
    });
    return data;
  },

  /**
   * Get companion greeting based on context
   */
  async getGreeting(): Promise<{
    greeting: string;
    mood: string;
    suggestions?: string[];
  }> {
    const { data } = await api.get('/companion/greeting');
    return data;
  },

  /**
   * Get quick actions for current context
   */
  async getQuickActions(context: {
    sessionId?: string;
    currentStep?: string;
  }): Promise<{
    actions: Array<{
      id: string;
      label: string;
      emoji: string;
      action: string;
    }>;
  }> {
    const { data } = await api.post('/companion/quick-actions', context);
    return data;
  },

  /**
   * Get encouragement for specific situation
   */
  async getEncouragement(situation: 'start' | 'stuck' | 'complete' | 'streak'): Promise<{
    message: string;
    mood: string;
  }> {
    const { data } = await api.get(`/companion/encouragement/${situation}`);
    return data;
  },

  /**
   * Report mood/feeling (for adaptive responses)
   */
  async reportMood(mood: 'great' | 'okay' | 'struggling'): Promise<{
    response: string;
    suggestions: string[];
  }> {
    const { data } = await api.post('/companion/mood', { mood });
    return data;
  },
};
