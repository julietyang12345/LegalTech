import { lazy, Suspense, useEffect, type ReactNode } from 'react';
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

// Pages kept eager for app boot, auth, and public/legal flows
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { VerifyEmailPage } from '@/pages/VerifyEmailPage';
import { TermsPage } from '@/pages/TermsPage';
import { PrivacyPage } from '@/pages/PrivacyPage';

// React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));
const ConfirmationPage = lazy(() => import('@/pages/ConfirmationPage').then((module) => ({ default: module.ConfirmationPage })));
const TodayPage = lazy(() => import('@/pages/TodayPage').then((module) => ({ default: module.TodayPage })));
const SessionPage = lazy(() => import('@/pages/SessionPage').then((module) => ({ default: module.SessionPage })));
const PlanPage = lazy(() => import('@/pages/PlanPage').then((module) => ({ default: module.PlanPage })));
const ShowcasePage = lazy(() => import('@/pages/ShowcasePage').then((module) => ({ default: module.ShowcasePage })));
const VaultPage = lazy(() => import('@/pages/VaultPage').then((module) => ({ default: module.VaultPage })));
const CommunityPage = lazy(() => import('@/pages/CommunityPage').then((module) => ({ default: module.CommunityPage })));
const DemoSessionPage = lazy(() => import('@/pages/DemoSessionPage').then((module) => ({ default: module.DemoSessionPage })));
const CareerPathsDemoPage = lazy(() => import('@/pages/CareerPathsDemoPage').then((module) => ({ default: module.CareerPathsDemoPage })));
const ExplorePage = lazy(() => import('@/pages/ExplorePage').then((module) => ({ default: module.ExplorePage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const RepsPage = lazy(() => import('@/pages/RepsPage').then((module) => ({ default: module.RepsPage })));
const AbilityPage = lazy(() => import('@/pages/AbilityPage').then((module) => ({ default: module.AbilityPage })));
const TransformHubPage = lazy(() => import('@/transformhub'));
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

function renderLazyPage(node: ReactNode, label = 'Loading...') {
  return <Suspense fallback={<div style={{ padding: '24px' }}>{label}</div>}>{node}</Suspense>;
}

function App() {
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AnonymousPageViewTracker />
          <Routes>
            <Route path="/" element={<Navigate to="/transformhub" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/demo" element={renderLazyPage(<DemoSessionPage />, 'Loading demo...')} />
            <Route path="/demo/career-paths" element={renderLazyPage(<CareerPathsDemoPage />, 'Loading demo...')} />
            <Route path="/explore" element={renderLazyPage(<ExplorePage />, 'Loading explore...')} />
            <Route
              path="/transformhub"
              element={renderLazyPage(<TransformHubPage />, 'Loading TransformHub...')}
            />

            <Route
              path="/onboarding"
              element={
                <ProtectedRoute skipOnboardingCheck>
                  {renderLazyPage(<OnboardingPage />, 'Loading onboarding...')}
                </ProtectedRoute>
              }
            />

            <Route
              path="/confirm"
              element={
                <ProtectedRoute>
                  {renderLazyPage(<ConfirmationPage />, 'Loading confirmation...')}
                </ProtectedRoute>
              }
            />

            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/today" element={renderLazyPage(<TodayPage />, 'Loading today...')} />
              <Route path="/plan" element={renderLazyPage(<PlanPage />, 'Loading plan...')} />
              <Route path="/showcase" element={renderLazyPage(<ShowcasePage />, 'Loading showcase...')} />
              <Route path="/vault" element={renderLazyPage(<VaultPage />, 'Loading vault...')} />
              <Route path="/community" element={renderLazyPage(<CommunityPage />, 'Loading community...')} />
              <Route path="/settings" element={renderLazyPage(<SettingsPage />, 'Loading settings...')} />
            </Route>

            <Route
              path="/session/:sessionId"
              element={
                <ProtectedRoute>
                  {renderLazyPage(<SessionPage />, 'Loading session...')}
                </ProtectedRoute>
              }
            />

            <Route
              path="/reps"
              element={
                <ProtectedRoute skipOnboardingCheck>
                  {renderLazyPage(<RepsPage />, 'Loading reps...')}
                </ProtectedRoute>
              }
            />

            <Route
              path="/ability"
              element={
                <ProtectedRoute skipOnboardingCheck>
                  {renderLazyPage(<AbilityPage />, 'Loading ability...')}
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>

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
