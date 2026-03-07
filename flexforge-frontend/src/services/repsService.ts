import api from './api';
import type { Rep, RepScenario, RepFeedback as RepFeedbackType, RepUserFeedback } from '@/types';

export const repsService = {
  async checkIntake(): Promise<{ needsIntake: boolean }> {
    const { data } = await api.get<{ needsIntake: boolean }>('/reps/intake');
    return data;
  },

  async saveIntake(dto: { background: string; target: string; struggle: string }): Promise<{ saved: boolean }> {
    const { data } = await api.post<{ saved: boolean }>('/reps/intake', dto);
    return data;
  },

  async generateScenarios(dto: {
    skillName?: string;
    topic?: string;
    sourceSessionId?: string;
    sourceConcept?: string;
  }): Promise<{ scenarios: RepScenario[]; tokensUsed: number }> {
    const { data } = await api.post<{ scenarios: RepScenario[]; tokensUsed: number }>('/reps/scenarios', dto);
    return data;
  },

  async startRep(scenario: RepScenario): Promise<{ rep: Rep }> {
    const { data } = await api.post<{ rep: Rep }>('/reps', { scenario });
    return data;
  },

  async getHint(repId: string, taskIndex: number): Promise<{
    hint: string;
    encouragement: string;
    level: number;
    tokensUsed: number;
  }> {
    const { data } = await api.post(`/reps/${repId}/hint`, { taskIndex });
    return data;
  },

  async sendCoachMessage(repId: string, message: string): Promise<{
    reply: string;
    tokensUsed: number;
  }> {
    const { data } = await api.post(`/reps/${repId}/coach`, { message });
    return data;
  },

  async completeRep(repId: string, dto: {
    scratchPadContent?: string;
    confidenceScore?: number;
    tasksCompleted?: string[];
  }): Promise<{ feedback: Rep['feedback']; rep: Rep; tokensUsed: number }> {
    const { data } = await api.post(`/reps/${repId}/complete`, dto);
    return data;
  },

  async submitUserFeedback(
    repId: string,
    feedback: { difficulty: RepUserFeedback['difficulty']; relevance: RepUserFeedback['relevance']; note?: string },
  ): Promise<{ saved: boolean }> {
    const { data } = await api.post<{ saved: boolean }>(`/reps/${repId}/feedback`, feedback);
    return data;
  },

  async generateQuizRound(dto?: {
    skillName?: string;
    topic?: string;
  }): Promise<{ rep: Rep; tokensUsed: number }> {
    const { data } = await api.post<{ rep: Rep; tokensUsed: number }>('/reps/quiz/generate', dto || {});
    return data;
  },

  async completeQuizRound(repId: string, payload: {
    answers: Array<{ questionId: string; selectedIndex: number }>;
    confidenceScore?: number;
  }): Promise<{ feedback: RepFeedbackType; rep: Rep; tokensUsed: number }> {
    const { data } = await api.post(`/reps/${repId}/quiz/complete`, payload);
    return data;
  },

  async getHistory(): Promise<{ reps: Rep[] }> {
    const { data } = await api.get<{ reps: Rep[] }>('/reps');
    return data;
  },
};
