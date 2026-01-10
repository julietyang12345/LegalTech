import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { X, AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  title?: string;
  duration?: number;
  onClose?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; icon: React.ReactNode; title: string }> = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
    title: 'Success',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: <XCircle className="w-5 h-5 text-red-500" />,
    title: 'Error',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    title: 'Warning',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: <Info className="w-5 h-5 text-blue-500" />,
    title: 'Info',
  },
};

export function Toast({
  message,
  type,
  title,
  duration = 5000,
  onClose,
  action,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const style = TOAST_STYLES[type];

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="fixed top-6 right-6 z-50 max-w-md"
        >
          <div
            className={clsx(
              'flex items-start gap-3 p-4 rounded-xl shadow-lg border',
              style.bg,
              style.border
            )}
          >
            <div className="flex-shrink-0 mt-0.5">{style.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{title || style.title}</p>
              <p className="text-sm text-gray-700 mt-1">{message}</p>
              {action && (
                <button
                  onClick={action.onClick}
                  className={clsx(
                    'mt-2 text-sm font-medium underline transition-colors',
                    type === 'error' && 'text-red-700 hover:text-red-800',
                    type === 'warning' && 'text-amber-700 hover:text-amber-800',
                    type === 'success' && 'text-green-700 hover:text-green-800',
                    type === 'info' && 'text-blue-700 hover:text-blue-800'
                  )}
                >
                  {action.label}
                </button>
              )}
            </div>
            <button
              onClick={handleClose}
              className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Quota Exceeded Modal - special modal for quota errors
interface QuotaExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: string;
}

export function QuotaExceededModal({ isOpen, onClose, message }: QuotaExceededModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl"
      >
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
          Monthly Quota Exceeded
        </h2>

        {/* Message */}
        <p className="text-gray-600 text-center mb-6">
          {message || "You've used all your curricula for this month. Upgrade your plan to continue learning without limits."}
        </p>

        {/* Benefits of upgrading */}
        <div className="bg-gradient-to-br from-brand-50 to-focus-50 rounded-xl p-4 mb-6">
          <p className="font-medium text-gray-900 mb-2">Upgrade to PRO for:</p>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              20 curricula per month
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Step-by-step coding guides
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Personalized learning reviews
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Maybe Later
          </button>
          <button
            onClick={() => {
              // Navigate to upgrade page
              window.location.href = '/upgrade';
            }}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-white font-medium hover:from-brand-600 hover:to-brand-700 transition-colors"
          >
            Upgrade Now
          </button>
        </div>
      </motion.div>
    </div>
  );
}
