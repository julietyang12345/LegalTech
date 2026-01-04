import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import type { SessionStep } from '@/types';

interface StepPillsProps {
  steps: SessionStep[];
  currentStep: SessionStep;
  completedSteps: SessionStep[];
  onStepClick?: (step: SessionStep) => void;
  className?: string;
}

const STEP_LABELS: Record<SessionStep, string> = {
  prePrompt: 'Prep',
  video: 'Watch',
  activeRecall: 'Recall',
  memoryBridge: 'Connect',
  conceptCheck: 'Check',
  task1: 'Code',
  bossMilestone: 'Boss',
  reflection: 'Reflect',
};

export function StepPills({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
  className,
}: StepPillsProps) {
  return (
    <div className={clsx('flex items-center gap-1', className)}>
      {steps.map((step, index) => {
        const isComplete = completedSteps.includes(step);
        const isCurrent = step === currentStep;
        const isUpcoming = !isComplete && !isCurrent;

        return (
          <div key={step} className="flex items-center">
            <button
              type="button"
              onClick={() => onStepClick?.(step)}
              disabled={isUpcoming}
              className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center',
                'text-sm font-medium transition-all duration-200',
                isComplete && 'bg-focus-500 text-white',
                isCurrent && 'bg-brand-500 text-white ring-4 ring-brand-200',
                isUpcoming && 'bg-gray-200 text-gray-500',
                !isUpcoming && 'cursor-pointer hover:scale-110'
              )}
              title={STEP_LABELS[step]}
            >
              {isComplete ? (
                <Check className="w-4 h-4" />
              ) : (
                <span className="text-xs">{index + 1}</span>
              )}
            </button>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={clsx(
                  'w-4 h-0.5 mx-0.5',
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
}: StepPillsExpandedProps) {
  return (
    <div className={clsx('flex items-center gap-2 overflow-x-auto no-scrollbar', className)}>
      {steps.map((step, index) => {
        const isComplete = completedSteps.includes(step);
        const isCurrent = step === currentStep;
        const isUpcoming = !isComplete && !isCurrent;

        return (
          <button
            key={step}
            type="button"
            onClick={() => onStepClick?.(step)}
            disabled={isUpcoming}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-full',
              'text-sm font-medium transition-all duration-200 whitespace-nowrap',
              isComplete && 'bg-focus-100 text-focus-700',
              isCurrent && 'bg-brand-500 text-white shadow-md',
              isUpcoming && 'bg-gray-100 text-gray-400',
              !isUpcoming && 'cursor-pointer hover:scale-105'
            )}
          >
            {isComplete ? (
              <Check className="w-4 h-4" />
            ) : (
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                {index + 1}
              </span>
            )}
            {showLabels && <span>{STEP_LABELS[step]}</span>}
          </button>
        );
      })}
    </div>
  );
}
