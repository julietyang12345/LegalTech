import api from './api';

export interface DimensionProfile {
  dimensionId: string;
  label: string;
  average: number;
  count: number;
  trend: 'improving' | 'declining' | 'stable';
  recentScores: number[];
}

export interface SkillProfile {
  skillType: string;
  dimensions: DimensionProfile[];
  totalReps: number;
}

export interface TimelinePoint {
  score: number;
  createdAt: string;
  sourceId: string;
}

export const abilityService = {
  async getProfile(skillType?: string): Promise<{ profile: SkillProfile | null }> {
    const params = skillType ? { skillType } : {};
    const { data } = await api.get<{ profile: SkillProfile | null }>('/ability/profile', { params });
    return data;
  },

  async getTimeline(dimensionId: string, limit?: number): Promise<{ timeline: TimelinePoint[] }> {
    const params: any = { dimensionId };
    if (limit) params.limit = limit;
    const { data } = await api.get<{ timeline: TimelinePoint[] }>('/ability/timeline', { params });
    return data;
  },
};
