import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Button, Card } from '@/components/common';
import { authService } from '@/services/authService';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Extract token from URL and clean up
  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken) {
      setToken(urlToken);
      // Remove token from URL for security (prevents leaking in browser history, etc.)
      window.history.replaceState({}, '', '/reset-password');
    }
  }, [searchParams]);

  // Password validation
  const passwordValidation = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    matches: password === confirmPassword && password.length > 0,
  };

  const isValid = Object.values(passwordValidation).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Invalid reset link. Please request a new password reset.');
      return;
    }

    if (!isValid) {
      setError('Please meet all password requirements');
      return;
    }

    setIsLoading(true);

    try {
      await authService.resetPassword({ token, newPassword: password });
      setIsSuccess(true);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset password';
      // Check for specific error messages from API
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const apiError = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
        if (apiError) {
          setError(apiError);
          return;
        }
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // No token provided
  if (!token && !isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 dark:from-brand-900/20 to-surface-secondary flex flex-col">
        <div className="p-4">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-content-secondary hover:text-content transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <Card className="p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-content mb-2">Invalid reset link</h1>
            <p className="text-content-secondary mb-6">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <Link to="/forgot-password">
              <Button className="w-full">Request new reset link</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 dark:from-brand-900/20 to-surface-secondary flex flex-col">
      {/* Back button */}
      <div className="p-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-content-secondary hover:text-content transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
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
            {isSuccess ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h1 className="text-2xl font-bold text-content mb-2">Password reset!</h1>
                <p className="text-content-secondary mb-6">
                  Your password has been successfully reset. You can now sign in with your new password.
                </p>
                <Button
                  className="w-full"
                  onClick={() => navigate('/login')}
                >
                  Sign in
                </Button>
              </motion.div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h1 className="text-2xl font-bold text-content mb-2">Set new password</h1>
                  <p className="text-content-secondary">
                    Must be at least 8 characters with uppercase, lowercase, and a number.
                  </p>
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

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1.5">
                      New password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-content-tertiary" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoFocus
                        className="w-full pl-10 pr-12 py-2.5 bg-surface text-content border border-border rounded-lg
                                 placeholder:text-content-tertiary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                                 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-content-tertiary hover:text-content-secondary"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1.5">
                      Confirm password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-content-tertiary" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-surface text-content border border-border rounded-lg
                                 placeholder:text-content-tertiary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                                 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Password requirements */}
                  <div className="space-y-2 pt-2">
                    <PasswordRequirement met={passwordValidation.minLength}>
                      At least 8 characters
                    </PasswordRequirement>
                    <PasswordRequirement met={passwordValidation.hasUppercase}>
                      One uppercase letter
                    </PasswordRequirement>
                    <PasswordRequirement met={passwordValidation.hasLowercase}>
                      One lowercase letter
                    </PasswordRequirement>
                    <PasswordRequirement met={passwordValidation.hasNumber}>
                      One number
                    </PasswordRequirement>
                    <PasswordRequirement met={passwordValidation.matches}>
                      Passwords match
                    </PasswordRequirement>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    isLoading={isLoading}
                    disabled={!isValid}
                  >
                    Reset password
                  </Button>
                </form>
              </>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function PasswordRequirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${met ? 'text-green-600' : 'text-content-tertiary'}`}>
      <CheckCircle2 className={`w-4 h-4 ${met ? 'text-green-500' : 'text-content-tertiary'}`} />
      {children}
    </div>
  );
}
