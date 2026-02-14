import api from './api';
import type { User } from '@/types';

export interface LoginDto {
  email: string;
  password: string;
  turnstileToken?: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name?: string;
  turnstileToken?: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  // Token is now stored in HTTP-only cookie, not returned in response body
  requiresVerification?: boolean;
  isNewUser?: boolean;
}

export interface ForgotPasswordDto {
  email: string;
  turnstileToken?: string;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

export interface VerifyEmailDto {
  token: string;
}

export interface MessageResponse {
  message: string;
}

export const authService = {
  async login(dto: LoginDto): Promise<AuthResponse> {
    const headers: Record<string, string> = {};
    if (dto.turnstileToken) {
      headers['x-turnstile-required'] = '1';
    }
    const { data } = await api.post<AuthResponse>('/auth/login', dto, { headers });
    return data;
  },

  async googleLogin(credential: string): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/google', { credential });
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

  // Planned Skills (wishlist)
  async getPlannedSkills(): Promise<{
    plannedSkills: Array<{ skill: string; icon: string; addedAt: string }>;
  }> {
    const { data } = await api.get('/users/planned-skills');
    return data;
  },

  async addPlannedSkill(
    skill: string,
    icon: string,
  ): Promise<{
    message: string;
    plannedSkills: Array<{ skill: string; icon: string; addedAt: string }>;
  }> {
    const { data } = await api.post('/users/planned-skills', { skill, icon });
    return data;
  },

  async removePlannedSkill(skill: string): Promise<{
    message: string;
    plannedSkills: Array<{ skill: string; icon: string; addedAt: string }>;
  }> {
    const { data } = await api.delete(
      `/users/planned-skills/${encodeURIComponent(skill)}`,
    );
    return data;
  },

  // Profile & Account Management

  async updateProfile(data: { name?: string }): Promise<{ message: string; user: User }> {
    const { data: response } = await api.patch<{ message: string; user: User }>('/users/profile', data);
    return response;
  },

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<MessageResponse> {
    const { data: response } = await api.patch<MessageResponse>('/users/password', data);
    return response;
  },

  async deleteAccount(): Promise<MessageResponse> {
    const { data: response } = await api.delete<MessageResponse>('/users/me');
    return response;
  },

  async updatePreferences(preferences: Record<string, unknown>): Promise<{ message: string; preferences: Record<string, unknown> }> {
    const { data: response } = await api.patch<{ message: string; preferences: Record<string, unknown> }>('/users/preferences', preferences);
    return response;
  },

  // Password Reset & Email Verification

  async forgotPassword(dto: ForgotPasswordDto): Promise<MessageResponse> {
    const { data } = await api.post<MessageResponse>('/auth/forgot-password', dto);
    return data;
  },

  async resetPassword(dto: ResetPasswordDto): Promise<MessageResponse> {
    const { data } = await api.post<MessageResponse>('/auth/reset-password', dto);
    return data;
  },

  async verifyEmail(dto: VerifyEmailDto): Promise<MessageResponse> {
    const { data } = await api.post<MessageResponse>('/auth/verify-email', dto);
    return data;
  },

  async resendVerification(email: string): Promise<MessageResponse> {
    const { data } = await api.post<MessageResponse>('/auth/resend-verification', { email });
    return data;
  },
};
