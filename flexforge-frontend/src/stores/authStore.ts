import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { QuotaTier } from '@/types';
import type { User } from '@/types';
import { authService } from '@/services/authService';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  clearError: () => void;
  
  // Helpers
  hasTierAccess: (tier: QuotaTier) => boolean;
}

const tierHierarchy: Record<QuotaTier, number> = {
  [QuotaTier.FREE]: 0,
  [QuotaTier.PRO]: 1,
  [QuotaTier.PREMIUM]: 2,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.login({ email, password });
          set({
            user: response.user,
            token: response.access_token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.message || 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (email: string, password: string, name?: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.register({ email, password, name });
          set({
            user: response.user,
            token: response.access_token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.message || 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      fetchProfile: async () => {
        const { token } = get();
        if (!token) return;
        
        set({ isLoading: true });
        try {
          const response = await authService.getProfile();
          set({ user: response.user, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          get().logout();
        }
      },

      clearError: () => set({ error: null }),

      hasTierAccess: (requiredTier: QuotaTier) => {
        const { user } = get();
        if (!user) return false;
        return tierHierarchy[user.quotaTier] >= tierHierarchy[requiredTier];
      },
    }),
    {
      name: 'flexforge-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
