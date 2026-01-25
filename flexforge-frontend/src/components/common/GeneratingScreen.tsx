import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle, LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { Card } from './Card';

export interface LoadingStep {
  icon: LucideIcon;
  text: string;
  duration: number;
}

interface GeneratingScreenProps {
  steps: LoadingStep[];
  title: string;
  subtitle: string;
  timeEstimate: string;
}

export function GeneratingScreen({ steps, title, subtitle, timeEstimate }: GeneratingScreenProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  useEffect(() => {
    let totalTime = 0;
    const timers: NodeJS.Timeout[] = [];

    steps.forEach((step, index) => {
      const startTimer = setTimeout(() => {
        setCurrentStep(index);
      }, totalTime);
      timers.push(startTimer);

      totalTime += step.duration;
      const completeTimer = setTimeout(() => {
        setCompletedSteps((prev) => [...prev, index]);
      }, totalTime - 500);
      timers.push(completeTimer);
    });

    return () => timers.forEach(clearTimeout);
  }, [steps]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-brand-50 to-gray-50 py-12 px-4"
    >
      <div className="max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full
                         bg-gradient-to-br from-brand-400 to-brand-500 mb-4 relative">
            <span className="text-4xl">🦊</span>
            <motion.div
              className="absolute inset-0 rounded-full border-4 border-brand-300"
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              style={{ borderTopColor: 'transparent' }}
            />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
          <p className="text-gray-600">{subtitle}</p>
        </motion.div>

        <Card className="p-6">
          <div className="space-y-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === index;
              const isCompleted = completedSteps.includes(index);
              const isPending = currentStep < index;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={clsx(
                    'flex items-center gap-3 p-3 rounded-lg transition-colors',
                    isActive && 'bg-brand-50',
                    isCompleted && 'bg-green-50',
                    isPending && 'opacity-50'
                  )}
                >
                  <div
                    className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                      isActive && 'bg-brand-100 text-brand-600',
                      isCompleted && 'bg-green-100 text-green-600',
                      isPending && 'bg-gray-100 text-gray-400'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : isActive ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        <Loader2 className="w-5 h-5" />
                      </motion.div>
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <span
                    className={clsx(
                      'text-sm font-medium',
                      isActive && 'text-brand-700',
                      isCompleted && 'text-green-700',
                      isPending && 'text-gray-400'
                    )}
                  >
                    {step.text}
                  </span>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-4 sm:mt-6 pt-4 border-t border-gray-100">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-brand-400 to-brand-500"
                initial={{ width: '0%' }}
                animate={{ width: `${((completedSteps.length) / steps.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            {/* Time estimate - hidden on mobile */}
            <p className="hidden sm:block text-xs text-gray-500 text-center mt-2">
              {timeEstimate}
            </p>
          </div>
        </Card>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center text-sm text-gray-500 mt-6"
        >
          Did you know? Active recall improves retention by 50%
        </motion.p>
      </div>
    </motion.div>
  );
}
