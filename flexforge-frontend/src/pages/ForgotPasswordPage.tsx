import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button, Card, TurnstileWidget } from '@/components/common';
import { authService } from '@/services/authService';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await authService.forgotPassword({ email, turnstileToken });
      setIsSuccess(true);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send reset email';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-gray-50 flex flex-col">
      {/* Back button */}
      <div className="p-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
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
              <span className="font-display font-bold text-2xl text-gray-900">FlexForge</span>
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
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h1>
                <p className="text-gray-600 mb-6">
                  If an account exists with <span className="font-medium">{email}</span>,
                  you'll receive a password reset link shortly.
                </p>
                <div className="text-sm text-gray-500 mb-6 space-y-2">
                  <p>The link will expire in 1 hour.</p>
                  <p className="font-medium text-amber-700 bg-amber-50 p-2 rounded">
                    Can't find it? Check your spam or junk folder.
                  </p>
                </div>
                <Link to="/login">
                  <Button variant="secondary" className="w-full">
                    Back to login
                  </Button>
                </Link>
              </motion.div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">Forgot password?</h1>
                  <p className="text-gray-600">
                    No worries, we'll send you reset instructions.
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
                        autoFocus
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
                                 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                                 transition-colors"
                      />
                    </div>
                  </div>

                  <TurnstileWidget onToken={setTurnstileToken} />

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    isLoading={isLoading}
                  >
                    Send reset link
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-gray-600">
                    Remember your password?{' '}
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
