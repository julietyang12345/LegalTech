import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface StepCelebrationProps {
  stepName: string;
  stepIndex: number;
  totalSteps: number;
  onComplete: () => void;
}

export function StepCelebration({ stepName, stepIndex, totalSteps, onComplete }: StepCelebrationProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        {/* Animated checkmark circle */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
          className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-200"
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Check className="w-10 h-10 text-white" strokeWidth={3} />
          </motion.div>
        </motion.div>

        {/* Step label */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="text-xl font-bold text-gray-900"
        >
          {stepName} Complete!
        </motion.h2>

        {/* Step progress */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-sm text-gray-500"
        >
          Step {stepIndex + 1} of {totalSteps}
        </motion.p>
      </div>
    </motion.div>
  );
}

/** Map step keys to human-readable celebration labels (longer form of StepPills labels) */
export function getCelebrationLabel(
  step: string,
  opts?: { isProjectBased?: boolean; videoUnavailable?: boolean },
): string {
  const labels: Record<string, string> = {
    prePrompt: 'Preparation',
    video: opts?.videoUnavailable ? 'AI Lesson' : 'Video Lesson',
    foundationCards: 'Foundation Cards',
    task1: 'Practice',
    bossMilestone: opts?.isProjectBased !== false ? 'Boss Milestone' : 'Intensive Practice',
    openTask: 'Real-World Challenge',
    reflection: 'Reflection',
  };
  return labels[step] || step;
}
