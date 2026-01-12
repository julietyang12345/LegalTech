import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import {
  GoalInputStep,
  DirectionsStep,
  RefinementPanel,
  DepthStep,
} from '@/components/onboarding';
import { onboardingService } from '@/services/onboardingService';
import { useAuthStore } from '@/stores/authStore';
import type {
  LearningDirection,
  RefinementContext,
  LearnerPrefs,
  CompleteOnboardingDto,
} from '@/types';

// Onboarding state machine
type OnboardingStep =
  | 'goal_input'     // Step 1: Free-text goal
  | 'generating'     // Loading: AI generating directions
  | 'directions'     // Step 2-3: Show directions + confirmation
  | 'refinement'     // Step 3b: Refinement panel (if "Not quite")
  | 'depth'          // Step 5: Depth test
  | 'completing';    // Final: Saving preferences

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuthStore();

  // State machine
  const [step, setStep] = useState<OnboardingStep>('goal_input');

  // Data collected through the flow
  const [goal, setGoal] = useState('');
  const [directions, setDirections] = useState<LearningDirection[]>([]);
  const [interpretedGoal, setInterpretedGoal] = useState('');
  const [selectedDirection, setSelectedDirection] = useState<LearningDirection | null>(null);
  const [refinementContext, setRefinementContext] = useState<RefinementContext | undefined>();

  // Error handling
  const [error, setError] = useState<string | null>(null);

  // Step 1: Submit goal → generate directions
  const handleGoalSubmit = useCallback(async (goalText: string) => {
    setGoal(goalText);
    setError(null);
    setStep('generating');

    try {
      const response = await onboardingService.generateDirections(goalText);
      setDirections(response.directions);
      setInterpretedGoal(response.interpretedGoal);
      setStep('directions');
    } catch (err: any) {
      console.error('Failed to generate directions:', err);
      setError(err.response?.data?.message || 'Failed to generate directions. Please try again.');
      setStep('goal_input');
    }
  }, []);

  // Step 2-3: Select direction → go to depth step
  const handleDirectionSelect = useCallback((direction: LearningDirection) => {
    setSelectedDirection(direction);
    setStep('depth');
  }, []);

  // Step 3b: Refinement → regenerate directions
  const handleRefinementSubmit = useCallback(async (refinement: RefinementContext) => {
    setRefinementContext(refinement);
    setError(null);
    setStep('generating');

    try {
      const response = await onboardingService.generateDirections(goal, refinement);
      setDirections(response.directions);
      setInterpretedGoal(response.interpretedGoal);
      setStep('directions');
    } catch (err: any) {
      console.error('Failed to regenerate directions:', err);
      setError(err.response?.data?.message || 'Failed to regenerate directions. Please try again.');
      setStep('refinement');
    }
  }, [goal]);

  // Step 5: Select depth → complete onboarding
  const handleDepthSelect = useCallback(async (depth: LearnerPrefs['contentDepth']) => {
    if (!selectedDirection) return;

    setError(null);
    setStep('completing');

    try {
      const dto: CompleteOnboardingDto = {
        originalGoal: goal,
        selectedDirection: selectedDirection.title,
        directionKeywords: selectedDirection.keywords,
        contentDepth: depth,
        // Use tool-specific directions to set platform tolerance
        platformTolerance: selectedDirection.isToolSpecific ? 'any' : 'preferGeneric',
        // Include refinement context if used
        outputType: refinementContext?.outputType,
        usageContext: refinementContext?.usageContext,
        dailyMinutes: refinementContext?.timeMinutes,
        skillLevel: refinementContext?.skillLevel,
      };

      await onboardingService.completeOnboarding(dto);

      // Refresh user to get updated preferences
      await refreshUser();

      // Navigate to start page
      navigate('/start', { replace: true });
    } catch (err: any) {
      console.error('Failed to complete onboarding:', err);
      setError(err.response?.data?.message || 'Failed to save preferences. Please try again.');
      setStep('depth');
    }
  }, [goal, selectedDirection, refinementContext, navigate, refreshUser]);

  // Progress indicator
  const getProgress = () => {
    switch (step) {
      case 'goal_input':
        return 20;
      case 'generating':
        return 40;
      case 'directions':
        return 50;
      case 'refinement':
        return 50;
      case 'depth':
        return 80;
      case 'completing':
        return 100;
      default:
        return 0;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-gray-50">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gray-200 z-50">
        <motion.div
          className="h-full bg-brand-500"
          initial={{ width: 0 }}
          animate={{ width: `${getProgress()}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Main content */}
      <div className="min-h-screen flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-2xl">
          {/* Error message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
            >
              {error}
            </motion.div>
          )}

          {/* Step content */}
          <AnimatePresence mode="wait">
            {step === 'goal_input' && (
              <StepWrapper key="goal">
                <GoalInputStep onSubmit={handleGoalSubmit} />
              </StepWrapper>
            )}

            {step === 'generating' && (
              <StepWrapper key="generating">
                <LoadingState
                  title="Finding your learning path..."
                  subtitle="AI is analyzing your goal"
                  steps={[
                    'Understanding your goal',
                    'Identifying key concepts',
                    'Creating learning directions',
                  ]}
                />
              </StepWrapper>
            )}

            {step === 'directions' && (
              <StepWrapper key="directions">
                <DirectionsStep
                  directions={directions}
                  interpretedGoal={interpretedGoal}
                  onSelect={handleDirectionSelect}
                  onRefine={() => setStep('refinement')}
                />
              </StepWrapper>
            )}

            {step === 'refinement' && (
              <StepWrapper key="refinement">
                <RefinementPanel
                  originalGoal={goal}
                  onSubmit={handleRefinementSubmit}
                  onBack={() => setStep('directions')}
                />
              </StepWrapper>
            )}

            {step === 'depth' && selectedDirection && (
              <StepWrapper key="depth">
                <DepthStep
                  selectedDirection={selectedDirection.title}
                  onSelect={handleDepthSelect}
                />
              </StepWrapper>
            )}

            {step === 'completing' && (
              <StepWrapper key="completing">
                <LoadingState
                  title="Setting up your experience..."
                  subtitle="Personalizing your learning journey"
                  variant="green"
                  steps={[
                    'Saving your preferences',
                    'Preparing your dashboard',
                  ]}
                />
              </StepWrapper>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// Animation wrapper for steps
function StepWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

// Reusable loading state component with elegant animations
function LoadingState({
  title,
  subtitle,
  variant = 'brand',
  steps,
}: {
  title: string;
  subtitle: string;
  variant?: 'brand' | 'green';
  steps?: string[];
}) {
  const colors = variant === 'green'
    ? {
        ring: 'stroke-green-500',
        ringBg: 'stroke-green-100',
        bg: 'bg-green-50',
        icon: 'text-green-600',
        check: 'text-green-500',
        text: 'text-green-600',
      }
    : {
        ring: 'stroke-brand-500',
        ringBg: 'stroke-brand-100',
        bg: 'bg-brand-50',
        icon: 'text-brand-600',
        check: 'text-brand-500',
        text: 'text-brand-600',
      };

  return (
    <div className="text-center py-12">
      {/* Animated ring with icon */}
      <div className="relative inline-flex items-center justify-center mb-8">
        {/* Spinning ring */}
        <motion.svg
          className="w-24 h-24"
          viewBox="0 0 100 100"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
        >
          {/* Background ring */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="4"
            className={colors.ringBg}
          />
          {/* Animated arc */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            className={colors.ring}
            strokeDasharray="80 200"
          />
        </motion.svg>

        {/* Center icon */}
        <div className={`absolute w-14 h-14 ${colors.bg} rounded-full flex items-center justify-center`}>
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          >
            <Sparkles className={`w-7 h-7 ${colors.icon}`} />
          </motion.div>
        </div>
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-600 mb-8">{subtitle}</p>

      {/* Animated steps with checkmarks */}
      {steps && steps.length > 0 && (
        <div className="inline-flex flex-col items-start gap-3 text-left">
          {steps.map((step, i) => (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 1.5, duration: 0.4 }}
              className="flex items-center gap-3"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 1.5 + 0.2, type: 'spring', stiffness: 300 }}
                className={`w-5 h-5 rounded-full ${colors.bg} flex items-center justify-center`}
              >
                <motion.svg
                  className={`w-3 h-3 ${colors.check}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ delay: i * 1.5 + 0.3, duration: 0.3 }}
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </motion.svg>
              </motion.div>
              <span className={`text-sm ${colors.text}`}>{step}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
