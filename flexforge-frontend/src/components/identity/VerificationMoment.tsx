import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { Button } from '../common/Button';
import type { VerificationMilestone, Aspiration } from '@/types';

interface VerificationMomentProps {
  aspiration: Aspiration;
  milestone: VerificationMilestone;
  onDismiss: () => void;
}

export function VerificationMoment({
  aspiration,
  milestone,
  onDismiss,
}: VerificationMomentProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Content */}
          <div className="p-6 text-center">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-green-100 rounded-full"
            >
              <Check className="w-8 h-8 text-green-600" />
            </motion.div>

            {/* Message */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <p className="text-sm text-gray-500 mb-2">
                You said you wanted to be a{' '}
                <span className="font-medium text-gray-700">
                  {aspiration.name}
                </span>
              </p>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {milestone.label}
              </h3>
              <p className="text-gray-600">{milestone.proofStatement}</p>
            </motion.div>

            {/* Proof statement */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-6 p-4 bg-brand-50 rounded-lg"
            >
              <p className="text-sm font-medium text-brand-800">
                That's proof.
              </p>
            </motion.div>

            {/* Dismiss button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-6"
            >
              <Button onClick={onDismiss} className="w-full">
                Continue
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
