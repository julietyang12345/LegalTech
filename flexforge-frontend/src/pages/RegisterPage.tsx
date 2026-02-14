import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, User, AlertCircle, ArrowLeft, CheckCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/services/authService';
import { Button, Card, TurnstileWidget } from '@/components/common';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, googleLogin, isLoading, error, clearError, requiresVerification, pendingVerificationEmail, clearVerificationState } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      const result = await register(email, password, name, turnstileToken);
      // If verification is not required, navigate to confirm
      if (!result.requiresVerification) {
        navigate('/confirm', { replace: true });
      }
      // Otherwise, the UI will show the verification message
    } catch (_err) {
      // Error is handled by store
    }
  };

  const handleResendVerification = async () => {
    if (!pendingVerificationEmail) return;
    setIsResending(true);
    setResendSuccess(false);
    try {
      await authService.resendVerification(pendingVerificationEmail);
      setResendSuccess(true);
    } catch (_err) {
      // Silently fail - still show success to prevent enumeration
      setResendSuccess(true);
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToRegister = () => {
    clearVerificationState();
    setEmail('');
    setPassword('');
    setName('');
  };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    clearError();
    try {
      const result = await googleLogin(credentialResponse.credential);
      if (result.isNewUser) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/today', { replace: true });
      }
    } catch (_err) {
      // Error is handled by store
    }
  };

  const benefits = [
    'AI builds your personalized 7-day curriculum',
    'Daily sessions with videos, concept cards & quizzes',
    'Build a real project as you learn',
    'On-demand AI tutor that knows your progress',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 dark:from-brand-900/20 to-surface-secondary flex flex-col">
      {/* Back button */}
      <div className="p-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-content-secondary hover:text-content transition-colors"
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
              <span className="font-display font-bold text-2xl text-content">FlexForge</span>
            </Link>
          </div>

          <Card className="p-8">
            {/* Email Verification Pending */}
            {requiresVerification ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-green-600" />
                </div>
                <h1 className="text-2xl font-bold text-content mb-2">Verify your email</h1>
                <p className="text-content-secondary mb-2">
                  We've sent a verification link to:
                </p>
                <p className="font-medium text-content mb-6">{pendingVerificationEmail}</p>
                <div className="text-sm text-content-tertiary mb-6 space-y-2">
                  <p>Please check your email and click the link to verify your account.</p>
                  <p className="font-medium text-amber-700 bg-amber-50 p-2 rounded">
                    Can't find it? Check your spam or junk folder.
                  </p>
                  <p>The link expires in 24 hours.</p>
                </div>

                {resendSuccess ? (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-700">Verification email sent!</span>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    className="w-full mb-3"
                    onClick={handleResendVerification}
                    isLoading={isResending}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Resend verification email
                  </Button>
                )}

                <button
                  onClick={handleBackToRegister}
                  className="text-sm text-content-tertiary hover:text-content-secondary"
                >
                  Use a different email
                </button>

                <div className="mt-6 pt-6 border-t border-border">
                  <p className="text-content-secondary">
                    Already verified?{' '}
                    <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">
                      Sign in
                    </Link>
                  </p>
                </div>
              </motion.div>
            ) : (
              <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-content mb-2">Sign up to start learning</h1>
              <p className="text-content-secondary">Tell us your goal and we'll build your personalized curriculum</p>
            </div>

            {/* Benefits */}
            <div className="mb-6 p-4 bg-focus-50 rounded-lg">
              <p className="text-sm font-medium text-focus-800 mb-2">You'll get:</p>
              <ul className="space-y-1">
                {benefits.map((benefit, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-focus-700">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 text-sm">{error}</p>
              </motion.div>
            )}

            {/* Google Sign Up */}
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => clearError()}
                size="large"
                width="100%"
                text="signup_with"
              />
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-surface px-4 text-content-tertiary">or sign up with email</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-content-tertiary" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                    className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg 
                             focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                             transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-content-tertiary" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg 
                             focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                             transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-content-tertiary" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                    required
                    minLength={8}
                    className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg 
                             focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                             transition-colors"
                  />
                </div>
                <p className="mt-1 text-xs text-content-tertiary">Minimum 8 characters</p>
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border text-brand-600
                           focus:ring-brand-500 cursor-pointer"
                  required
                />
                <label htmlFor="terms" className="text-sm text-content-secondary cursor-pointer">
                  I agree to the{' '}
                  <Link to="/terms" className="text-brand-600 hover:underline" target="_blank">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" className="text-brand-600 hover:underline" target="_blank">
                    Privacy Policy
                  </Link>
                </label>
              </div>

              <TurnstileWidget onToken={setTurnstileToken} />

              <Button
                type="submit"
                size="lg"
                className="w-full"
                isLoading={isLoading}
                disabled={!agreedToTerms}
              >
                Create Account
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-content-secondary">
                Already have an account?{' '}
                <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">
                  Sign in
                </Link>
              </p>
            </div>
              </>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
