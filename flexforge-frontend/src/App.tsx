import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Toaster } from 'react-hot-toast';

// Layouts
import { MainLayout } from '@/components/layout';

// Auth
import { ProtectedRoute } from '@/components/auth';
import { useAuthStore } from '@/stores/authStore';
import { analyticsService } from '@/services/analyticsService';

// Pages
import {
  LoginPage,
  RegisterPage,
  OnboardingPage,
  ConfirmationPage,
  TodayPage,
  SessionPage,
  PlanPage,
  ShowcasePage,
  VaultPage,
  CommunityPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
  TermsPage,
  PrivacyPage,
  DemoSessionPage,
  CareerPathsDemoPage,
  ExplorePage,
  SettingsPage,
  RepsPage,
  AbilityPage,
} from '@/pages';

// React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const VisualMindPage = lazy(() => import('@/visualmind'));
const ANON_PAGE_VIEW_STORAGE_KEY = 'ff_anon_page_views';
const ANON_PAGE_VIEW_DEDUPE_MS = 30_000;

function AnonymousPageViewTracker() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) return;
    const path = `${location.pathname}${location.search}${location.hash}`;
    const now = Date.now();

    try {
      const raw = sessionStorage.getItem(ANON_PAGE_VIEW_STORAGE_KEY);
      const visits = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      const lastSeen = visits[path] ?? 0;
      if (now - lastSeen < ANON_PAGE_VIEW_DEDUPE_MS) {
        return;
      }

      visits[path] = now;
      for (const [key, ts] of Object.entries(visits)) {
        if (now - ts > ANON_PAGE_VIEW_DEDUPE_MS * 10) {
          delete visits[key];
        }
      }
      sessionStorage.setItem(ANON_PAGE_VIEW_STORAGE_KEY, JSON.stringify(visits));
    } catch {
      // Ignore sessionStorage failures and still attempt tracking.
    }

    void analyticsService.pageViewed(path, {
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
    });
  }, [isAuthenticated, location.pathname, location.search, location.hash]);

  return null;
}

function App() {
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AnonymousPageViewTracker />
        <Routes>
          {/* Public routes - no login required */}
          <Route path="/" element={<Navigate to="/visualmind" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/demo" element={<DemoSessionPage />} />
          <Route path="/demo/career-paths" element={<CareerPathsDemoPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route
            path="/visualmind"
            element={
              <Suspense fallback={<div style={{ padding: '24px' }}>Loading VisualMind...</div>}>
                <VisualMindPage />
              </Suspense>
            }
          />

          {/* Onboarding - protected but skip onboarding check to avoid redirect loop */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute skipOnboardingCheck>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* Protected routes - require login + onboarding */}
          <Route
            path="/confirm"
            element={
              <ProtectedRoute>
                <ConfirmationPage />
              </ProtectedRoute>
            }
          />

          {/* Main app layout with sidebar/nav */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/today" element={<TodayPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/showcase" element={<ShowcasePage />} />
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Focus mode - full screen session */}
          <Route
            path="/session/:sessionId"
            element={
              <ProtectedRoute>
                <SessionPage />
              </ProtectedRoute>
            }
          />

          {/* Reps - full screen practice */}
          <Route
            path="/reps"
            element={
              <ProtectedRoute skipOnboardingCheck>
                <RepsPage />
              </ProtectedRoute>
            }
          />

          {/* Ability dashboard - full screen */}
          <Route
            path="/ability"
            element={
              <ProtectedRoute skipOnboardingCheck>
                <AbilityPage />
              </ProtectedRoute>
            }
          />

          {/* Catch all - redirect to landing or today */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>

      {/* Global toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
            borderRadius: '12px',
          },
          success: {
            iconTheme: {
              primary: '#10B981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#EF4444',
              secondary: '#fff',
            },
          },
        }}
      />
    </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
