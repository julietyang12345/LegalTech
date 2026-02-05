import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

// Layouts
import { MainLayout } from '@/components/layout';

// Auth
import { ProtectedRoute } from '@/components/auth';

// Pages
import {
  LandingPage,
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public routes - no login required */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />

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
  );
}

export default App;
