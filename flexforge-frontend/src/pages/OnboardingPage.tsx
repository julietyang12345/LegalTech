import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Sparkles } from 'lucide-react';
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
                <GeneratingState />
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
                <CompletingState />
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

// Loading state while AI generates directions
function GeneratingState() {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-full mb-6">
        <Sparkles className="w-8 h-8 text-brand-600 animate-pulse" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Finding your learning path...
      </h2>
      <p className="text-gray-600 mb-6">
        AI is analyzing your goal and generating personalized directions
      </p>
      <Loader2 className="w-6 h-6 text-brand-500 animate-spin mx-auto" />
    </div>
  );
}

// Loading state while completing onboarding
function CompletingState() {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <Sparkles className="w-8 h-8 text-green-600" />
        </motion.div>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Setting up your experience...
      </h2>
      <p className="text-gray-600 mb-6">
        Personalizing your learning journey
      </p>
      <Loader2 className="w-6 h-6 text-green-500 animate-spin mx-auto" />
    </div>
  );
}
