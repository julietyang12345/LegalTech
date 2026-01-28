import api from './api';
import type { Project } from '@/types';

export const projectService = {
  /**
   * Get all projects for current user
   */
  async getAll(): Promise<{ projects: Project[]; count: number }> {
    const { data } = await api.get<{ projects: Project[]; count: number }>('/projects');
    return data;
  },

  /**
   * Get public gallery (all public projects)
   */
  async getGallery(params?: {
    skill?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    projects: Project[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { data } = await api.get('/projects/gallery', { params });
    return data;
  },
};
