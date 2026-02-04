import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { QuotaTier, getEffectiveTier } from '@/types';
import type { User } from '@/types';
import { authService } from '@/services/authService';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  requiresVerification: boolean; // True when user registered but needs email verification
  pendingVerificationEmail: string | null; // Email that needs verification

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<{ requiresVerification: boolean }>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
  clearVerificationState: () => void;

  // Helpers
  hasTierAccess: (tier: QuotaTier) => boolean;
  needsOnboarding: () => boolean;
}

const tierHierarchy: Record<QuotaTier, number> = {
  [QuotaTier.FREE]: 0,
  [QuotaTier.PRO]: 1,
  [QuotaTier.PREMIUM]: 2,
  [QuotaTier.UNLIMITED]: 3,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      requiresVerification: false,
      pendingVerificationEmail: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.login({ email, password });
          // Token is now stored in HTTP-only cookie by the server
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            requiresVerification: false,
            pendingVerificationEmail: null,
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

          // Check if email verification is required
          if (response.requiresVerification) {
            set({
              isLoading: false,
              requiresVerification: true,
              pendingVerificationEmail: email,
              // Don't set isAuthenticated - user must verify first
            });
            return { requiresVerification: true };
          }

          // Token is now stored in HTTP-only cookie by the server
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            requiresVerification: false,
            pendingVerificationEmail: null,
          });
          return { requiresVerification: false };
        } catch (error: any) {
          set({
            error: error.response?.data?.message || 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          // Clear the HTTP-only cookie on the server
          await authService.logout();
        } catch (_error) {
          // Continue with local logout even if server call fails
        }
        set({
          user: null,
          isAuthenticated: false,
          error: null,
        });
      },

      fetchProfile: async () => {
        const { isAuthenticated } = get();
        if (!isAuthenticated) return;

        set({ isLoading: true });
        try {
          const response = await authService.getProfile();
          set({ user: response.user, isLoading: false });
        } catch (_error) {
          set({ isLoading: false });
          get().logout();
        }
      },

      // Alias for fetchProfile - used after onboarding to refresh user preferences
      refreshUser: async () => {
        await get().fetchProfile();
      },

      clearError: () => set({ error: null }),

      clearVerificationState: () => set({
        requiresVerification: false,
        pendingVerificationEmail: null,
      }),

      hasTierAccess: (requiredTier: QuotaTier) => {
        const { user } = get();
        if (!user) return false;
        // Use effective tier (admins get PRO tier)
        const effectiveTier = getEffectiveTier(user);
        return tierHierarchy[effectiveTier] >= tierHierarchy[requiredTier];
      },

      // Check if user needs to complete onboarding
      needsOnboarding: () => {
        const { user } = get();
        if (!user) return false;
        return !user.preferences?.learner?.completedOnboarding;
      },
    }),
    {
      name: 'flexforge-auth',
      // Only persist user info and auth state, NOT the token (stored in HTTP-only cookie)
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
