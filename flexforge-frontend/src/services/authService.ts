import api from './api';
import type { User } from '@/types';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  // Token is now stored in HTTP-only cookie, not returned in response body
}

export const authService = {
  async login(dto: LoginDto): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/login', dto);
    return data;
  },

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/register', dto);
    return data;
  },

  async getProfile(): Promise<{ user: User }> {
    const { data } = await api.get<{ user: User }>('/users/me');
    return data;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },
};
