import api from './api';
import type { Progress, UpdateProgressDto, ProgressStats, ProgressResponse } from '@/types';

export const progressService = {
  /**
   * Get all progress for a session
   */
  async getBySession(sessionId: string): Promise<{ progress: Progress[] }> {
    const { data } = await api.get<{ progress: Progress[] }>(`/progress/session/${sessionId}`);
    return data;
  },

  /**
   * Get progress stats for a session
   */
  async getStats(sessionId: string): Promise<{ stats: ProgressStats }> {
    const { data } = await api.get<{ stats: ProgressStats }>(`/progress/session/${sessionId}/stats`);
    return data;
  },

  /**
   * Update task progress
   */
  async updateTask(
    sessionId: string,
    taskId: string,
    dto: UpdateProgressDto
  ): Promise<ProgressResponse> {
    const { data } = await api.patch<ProgressResponse>(
      `/progress/session/${sessionId}/task/${taskId}`,
      dto
    );
    return data;
  },

  /**
   * Submit answer and get feedback
   */
  async submitAnswer(
    sessionId: string,
    body: {
      taskId: string;
      answer: string;
      topic?: string;
      isCorrect?: boolean;
      consecutiveFailures?: number;
    }
  ): Promise<{
    correct: boolean;
    progress: Progress;
    companionMessage?: { content: string; mood: string };
  }> {
    const { data } = await api.post(`/progress/session/${sessionId}/answer`, body);
    return data;
  },

  /**
   * Get companion encouragement for session
   */
  async getCompanionEncouragement(sessionId: string): Promise<{
    stats: ProgressStats;
    companionMessage: { content: string; mood: string };
  }> {
    const { data } = await api.get(`/progress/session/${sessionId}/companion`);
    return data;
  },

  /**
   * Generate personalized review (PRO+)
   */
  async generateReview(sessionId: string): Promise<{
    questions: Array<{
      question: string;
      topic: string;
      difficulty: string;
      answer: string;
    }>;
    focusAreas: string[];
  }> {
    const { data } = await api.post(`/progress/session/${sessionId}/review`);
    return data;
  },

  /**
   * Check if user is stuck
   */
  async checkStuckStatus(sessionId: string): Promise<{
    isStuck: boolean;
    reason?: string;
    recommendations?: string[];
  }> {
    const { data } = await api.get(`/progress/session/${sessionId}/stuck`);
    return data;
  },
};
