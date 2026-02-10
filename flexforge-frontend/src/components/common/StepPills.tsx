import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import type { SessionStep } from '@/types';

interface StepPillsProps {
  steps: SessionStep[];
  currentStep: SessionStep;
  completedSteps: SessionStep[];
  onStepClick?: (step: SessionStep) => void;
  className?: string;
  isProjectBased?: boolean;
  videoUnavailable?: boolean;
  /** Only reveal steps up to current+1; remaining show as tiny dots */
  progressive?: boolean;
}

const getStepLabels = (isProjectBased: boolean, videoUnavailable: boolean): Record<SessionStep, string> => ({
  prePrompt: 'Prep',
  video: videoUnavailable ? 'AI Learn' : 'Watch',
  foundationCards: 'Cards',
  task1: 'Practice',
  bossMilestone: isProjectBased ? 'Boss' : 'Intensive',
  openTask: 'Apply',
  reflection: 'Reflect',
});

export function StepPills({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
  className,
  isProjectBased = true,
  videoUnavailable = false,
  progressive = false,
}: StepPillsProps) {
  const stepLabels = getStepLabels(isProjectBased, videoUnavailable);

  // In progressive mode, find the "reveal boundary": current step + 1
  const currentIndex = steps.indexOf(currentStep);
  const revealUpTo = currentIndex + 1; // index of the next step after current

  return (
    <div className={clsx('flex items-center gap-0.5 sm:gap-1 flex-shrink min-w-0', className)}>
      {steps.map((step, index) => {
        const isComplete = completedSteps.includes(step);
        const isCurrent = step === currentStep;
        const isUpcoming = !isComplete && !isCurrent;
        // In progressive mode, steps beyond current+1 are "hidden" (shown as tiny dots)
        const isHidden = progressive && isUpcoming && index > revealUpTo;

        return (
          <div key={step} className="flex items-center">
            {isHidden ? (
              // Tiny dot for unrevealed future steps
              <div
                className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-gray-200 transition-all duration-300"
                title={undefined}
              />
            ) : (
              <button
                type="button"
                onClick={() => onStepClick?.(step)}
                className={clsx(
                  'w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center',
                  'text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer hover:scale-110',
                  isComplete && 'bg-focus-500 text-white',
                  isCurrent && 'bg-brand-500 text-white ring-2 sm:ring-4 ring-brand-200',
                  isUpcoming && 'bg-gray-200 text-gray-500 hover:bg-gray-300',
                )}
                title={stepLabels[step]}
              >
                {isComplete ? (
                  <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                ) : (
                  <span className="text-[10px] sm:text-xs">{index + 1}</span>
                )}
              </button>
            )}

            {/* Connector line - shorter on mobile, thinner for hidden steps */}
            {index < steps.length - 1 && (
              <div
                className={clsx(
                  'h-0.5 mx-0.5',
                  isHidden ? 'w-1.5 sm:w-2' : 'w-2 sm:w-4',
                  isComplete ? 'bg-focus-500' : 'bg-gray-200'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface StepPillsExpandedProps extends StepPillsProps {
  showLabels?: boolean;
}

export function StepPillsExpanded({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
  showLabels = true,
  className,
  isProjectBased = true,
  videoUnavailable = false,
}: StepPillsExpandedProps) {
  const stepLabels = getStepLabels(isProjectBased, videoUnavailable);
  return (
    <div className={clsx('flex items-center gap-2 overflow-x-auto no-scrollbar px-1', className)}>
      {steps.map((step, index) => {
        const isComplete = completedSteps.includes(step);
        const isCurrent = step === currentStep;
        const isUpcoming = !isComplete && !isCurrent;

        return (
          <button
            key={step}
            type="button"
            onClick={() => onStepClick?.(step)}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-full',
              'text-sm font-medium transition-all duration-200 whitespace-nowrap cursor-pointer hover:scale-105',
              isComplete && 'bg-focus-100 text-focus-700',
              isCurrent && 'bg-brand-500 text-white shadow-md',
              isUpcoming && 'bg-gray-100 text-gray-400 hover:bg-gray-200',
            )}
          >
            {isComplete ? (
              <Check className="w-4 h-4" />
            ) : (
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                {index + 1}
              </span>
            )}
            {showLabels && <span>{stepLabels[step]}</span>}
          </button>
        );
      })}
    </div>
  );
}
