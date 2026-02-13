import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, AlertCircle, ArrowLeft, RefreshCw, CheckCircle2 } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/services/authService';
import { Button, Card, TurnstileWidget } from '@/components/common';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, googleLogin, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState('');

  const rawFrom = (location.state as any)?.from?.pathname || '/today';
  // Prevent open redirect — only allow relative paths starting with /
  const from = typeof rawFrom === 'string' && rawFrom.startsWith('/') && !rawFrom.startsWith('//') ? rawFrom : '/today';

  // Check if error is related to email verification
  const isVerificationError = error?.toLowerCase().includes('verify');

  const showTurnstile = failedAttempts >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setResendSuccess(false);

    try {
      await login(email, password, showTurnstile ? turnstileToken : undefined);
      setFailedAttempts(0);
      navigate(from, { replace: true });
    } catch (_err) {
      setFailedAttempts((prev) => prev + 1);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    clearError();
    try {
      const result = await googleLogin(credentialResponse.credential);
      if (result.isNewUser) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch (_err) {
      // Error is handled by store
    }
  };

  const handleResendVerification = async () => {
    if (!email) return;
    setIsResending(true);
    setResendSuccess(false);
    try {
      await authService.resendVerification(email);
      setResendSuccess(true);
    } catch (_err) {
      // Silently fail - still show success to prevent enumeration
      setResendSuccess(true);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-gray-50 flex flex-col">
      {/* Back button */}
      <div className="p-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2">
              <span className="text-4xl">🔥</span>
              <span className="font-display font-bold text-2xl text-gray-900">FlexForge</span>
            </Link>
          </div>

          <Card className="p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome back</h1>
              <p className="text-gray-600">Sign in to continue your learning journey</p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
                {isVerificationError && (
                  <div className="mt-3 pt-3 border-t border-red-200">
                    {resendSuccess ? (
                      <div className="flex items-center gap-2 text-green-700 text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        Verification email sent! Check your inbox.
                      </div>
                    ) : (
                      <button
                        onClick={handleResendVerification}
                        disabled={isResending || !email}
                        className="flex items-center gap-2 text-sm text-red-700 hover:text-red-800 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${isResending ? 'animate-spin' : ''}`} />
                        {isResending ? 'Sending...' : 'Resend verification email'}
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* Google Sign In */}
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => clearError()}
                size="large"
                width="100%"
                text="signin_with"
              />
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-4 text-gray-500">or sign in with email</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                             transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-sm text-brand-600 hover:text-brand-700"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg 
                             focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                             transition-colors"
                  />
                </div>
              </div>

              {showTurnstile && <TurnstileWidget onToken={setTurnstileToken} />}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                isLoading={isLoading}
              >
                Sign In
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-gray-600">
                Don't have an account?{' '}
                <Link to="/register" className="text-brand-600 hover:text-brand-700 font-medium">
                  Sign up free
                </Link>
              </p>
            </div>
          </Card>

        </motion.div>
      </div>
    </div>
  );
}
