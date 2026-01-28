import { motion } from 'framer-motion';
import { Check, Circle, Target } from 'lucide-react';
import { clsx } from 'clsx';
import type { IdentityProfile } from '@/types';

interface IdentityProgressProps {
  profile: IdentityProfile;
  variant?: 'compact' | 'full';
}

export function IdentityProgress({ profile, variant = 'full' }: IdentityProgressProps) {
  const { aspiration, milestones, verificationProgress } = profile;

  const achievedCount = milestones.filter((m) => m.achieved).length;
  const totalCount = milestones.length;

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-center w-8 h-8 bg-brand-50 rounded-full">
          <Target className="w-4 h-4 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {aspiration.name}
          </p>
          <p className="text-xs text-gray-500">
            {achievedCount} of {totalCount} milestones
          </p>
        </div>
        <div className="text-right">
          <span className="text-sm font-semibold text-brand-600">
            {Math.round(verificationProgress)}%
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 bg-brand-50 rounded-full">
            <Target className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">You wanted to become:</p>
            <p className="font-semibold text-gray-900">{aspiration.name}</p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-3 bg-gray-50">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">Identity verification</span>
          <span className="text-xs font-medium text-brand-600">
            {Math.round(verificationProgress)}%
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-brand-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${verificationProgress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Milestones */}
      <div className="p-4 space-y-3">
        {milestones.map((milestone, index) => (
          <motion.div
            key={milestone.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={clsx(
              'flex items-start gap-3 p-3 rounded-lg transition-colors',
              milestone.achieved ? 'bg-green-50' : 'bg-gray-50'
            )}
          >
            <div
              className={clsx(
                'flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0',
                milestone.achieved
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-400'
              )}
            >
              {milestone.achieved ? (
                <Check className="w-4 h-4" />
              ) : (
                <Circle className="w-3 h-3" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={clsx(
                  'text-sm font-medium',
                  milestone.achieved ? 'text-green-800' : 'text-gray-700'
                )}
              >
                {milestone.label}
              </p>
              {milestone.achieved && (
                <p className="text-xs text-green-600 mt-0.5">
                  {milestone.proofStatement}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Footer message */}
      <div className="px-4 pb-4">
        <p className="text-center text-sm text-gray-600 italic">
          {verificationProgress < 25 && "You're just getting started."}
          {verificationProgress >= 25 &&
            verificationProgress < 50 &&
            "You're making progress."}
          {verificationProgress >= 50 &&
            verificationProgress < 75 &&
            `You're becoming the ${aspiration.name.toLowerCase()} you wanted to be.`}
          {verificationProgress >= 75 &&
            verificationProgress < 100 &&
            "Almost there. The proof is undeniable."}
          {verificationProgress >= 100 &&
            `You are a ${aspiration.name.toLowerCase()} now. The proof speaks for itself.`}
        </p>
      </div>
    </div>
  );
}
