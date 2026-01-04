import api from './api';
import type { Project, CreateProjectDto } from '@/types';

export const projectService = {
  /**
   * Create a new project
   */
  async create(dto: CreateProjectDto): Promise<{ message: string; project: Project }> {
    const { data } = await api.post<{ message: string; project: Project }>('/projects', dto);
    return data;
  },

  /**
   * Get all projects for current user
   */
  async getAll(): Promise<{ projects: Project[]; count: number }> {
    const { data } = await api.get<{ projects: Project[]; count: number }>('/projects');
    return data;
  },

  /**
   * Get single project by ID
   */
  async getById(id: string): Promise<{ project: Project }> {
    const { data } = await api.get<{ project: Project }>(`/projects/${id}`);
    return data;
  },

  /**
   * Update project
   */
  async update(id: string, updates: Partial<CreateProjectDto>): Promise<{ message: string; project: Project }> {
    const { data } = await api.patch<{ message: string; project: Project }>(`/projects/${id}`, updates);
    return data;
  },

  /**
   * Delete project
   */
  async delete(id: string): Promise<{ message: string }> {
    const { data } = await api.delete<{ message: string }>(`/projects/${id}`);
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

  /**
   * Like a project
   */
  async like(id: string): Promise<{ likes: number }> {
    const { data } = await api.post<{ likes: number }>(`/projects/${id}/like`);
    return data;
  },
};
