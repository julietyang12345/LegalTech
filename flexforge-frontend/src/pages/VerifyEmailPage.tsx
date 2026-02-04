import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button, Card } from '@/components/common';
import { authService } from '@/services/authService';

export function VerifyEmailPage() {
  const navigate = useNavigate();

  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Extract token from URL fragment and verify
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.slice(1)); // Remove # and parse
    const urlToken = params.get('token');

    if (urlToken) {
      setToken(urlToken);
      // Remove token from URL for security
      window.history.replaceState({}, '', '/verify-email');
      // Verify the token
      verifyToken(urlToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifyToken = async (verifyToken: string) => {
    try {
      await authService.verifyEmail({ token: verifyToken });
      setIsSuccess(true);
    } catch (err: unknown) {
      // Check for specific error messages from API
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const apiError = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
        if (apiError) {
          setError(apiError);
          return;
        }
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to verify email';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-gray-50 flex items-center justify-center">
        <Card className="p-8 max-w-md w-full text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-16 h-16 mx-auto mb-4"
          >
            <Loader2 className="w-16 h-16 text-brand-500" />
          </motion.div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Verifying your email...</h1>
          <p className="text-gray-600">Please wait while we verify your email address.</p>
        </Card>
      </div>
    );
  }

  // No token provided
  if (!token && !isSuccess && !error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-gray-50 flex items-center justify-center px-4">
        <Card className="p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-8 h-8 text-yellow-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid verification link</h1>
          <p className="text-gray-600 mb-6">
            This verification link is invalid. Please check your email for the correct link or request a new one.
          </p>
          <div className="space-y-3">
            <Link to="/login">
              <Button className="w-full">Go to login</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-gray-50 flex items-center justify-center px-4">
        <Card className="p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification failed</h1>
          <p className="text-gray-600 mb-2">{error}</p>
          <p className="text-sm text-gray-500 mb-6">
            The link may have expired or already been used.
          </p>
          <div className="space-y-3">
            <Link to="/login">
              <Button className="w-full">Go to login</Button>
            </Link>
            <p className="text-sm text-gray-500">
              Need a new link? Request one from the login page.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Success state
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-gray-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <Card className="p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Email verified!</h1>
          <p className="text-gray-600 mb-6">
            Your email has been verified successfully. You can now sign in to your account.
          </p>
          <Button
            className="w-full"
            onClick={() => navigate('/login')}
          >
            Sign in
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}
