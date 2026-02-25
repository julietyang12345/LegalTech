import { useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, GraduationCap } from 'lucide-react';
import {
  GoalInputStep,
  DirectionsStep,
  RefinementPanel,
  FeelingStep,
} from '@/components/onboarding';
import { RepsIntake } from '@/components/reps';
import { repsService } from '@/services/repsService';
import { onboardingService } from '@/services/onboardingService';
import { analyticsService } from '@/services/analyticsService';
import { useAuthStore } from '@/stores/authStore';
import { GoalType } from '@/types';
import type {
  LearningDirection,
  RefinementContext,
  LearnerPrefs,
  CompleteOnboardingDto,
} from '@/types';

// Onboarding state machine
type OnboardingStep =
  | 'practice_intake'     // Default: 3-question practice intake
  | 'goal_input'          // Course creation flow
  | 'generating'          // Loading directions
  | 'directions'          // Pick direction
  | 'refinement'          // Refine directions
  | 'depth'               // Familiarity + session length
  | 'completing';         // Saving prefs → /confirm

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuthStore();

  // Get pre-filled skill from URL (from showcase page)
  const prefilledSkill = searchParams.get('skill') || '';

  // Track onboarding start time for duration calculation
  const onboardingStartTime = useRef<number>(Date.now());

  // State machine — default to practice intake unless coming from a specific skill link
  const [step, setStep] = useState<OnboardingStep>(prefilledSkill ? 'goal_input' : 'practice_intake');
  const [isSavingIntake, setIsSavingIntake] = useState(false);

  // Shared state
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [goal, setGoal] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Directions state
  const [directions, setDirections] = useState<LearningDirection[]>([]);
  const [interpretedGoal, setInterpretedGoal] = useState('');
  const [selectedDirection, setSelectedDirection] = useState<LearningDirection | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>();
  const [refinementContext, setRefinementContext] = useState<RefinementContext | undefined>();

  // ─── Callbacks ─────────────────────────────────────────────────

  // Practice intake → save answers → navigate to /reps for scenario generation
  const handlePracticeIntakeComplete = useCallback(async (data: { background: string; target: string; struggle: string }) => {
    setIsSavingIntake(true);
    try {
      await repsService.saveIntake(data);
      navigate('/reps?fresh=true');
    } catch (err) {
      console.error('Failed to save intake:', err);
      setIsSavingIntake(false);
    }
  }, [navigate]);

  // Step 1: Submit goal → generate directions
  const handleGoalSubmit = useCallback(async (goalText: string) => {
    setGoal(goalText);
    setError(null);
    setStep('generating');

    analyticsService.onboardingGoalSubmitted(goalText);

    try {
      const response = await onboardingService.generateDirections(goalText, undefined, goalType ?? GoalType.CURRICULUM);
      setDirections(response.directions);
      setInterpretedGoal(response.interpretedGoal);
      setStep('directions');
    } catch (err: any) {
      console.error('Failed to generate directions:', err);
      setError(err.response?.data?.message || 'Failed to generate directions. Please try again.');
      setStep('goal_input');
    }
  }, [goalType]);

  // Step 2: Select direction → go to depth step
  const handleDirectionSelect = useCallback((direction: LearningDirection, language?: string) => {
    setSelectedDirection(direction);

    analyticsService.onboardingDirectionSelected(
      direction.title,
      direction.skillType || 'unknown'
    );

    if (direction.languageConfig) {
      setSelectedLanguage(language || direction.languageConfig.recommended);
    }

    setStep('depth');
  }, []);

  // Step 2b: Refinement → regenerate directions
  const handleRefinementSubmit = useCallback(async (refinement: RefinementContext) => {
    setRefinementContext(refinement);
    setError(null);
    setStep('generating');

    try {
      const response = await onboardingService.generateDirections(goal, refinement, goalType ?? GoalType.CURRICULUM);
      setDirections(response.directions);
      setInterpretedGoal(response.interpretedGoal);
      setStep('directions');
    } catch (err: any) {
      console.error('Failed to regenerate directions:', err);
      setError(err.response?.data?.message || 'Failed to regenerate directions. Please try again.');
      setStep('refinement');
    }
  }, [goal, goalType]);

  // Step 3: Feelings → complete onboarding → /confirm
  const handleFeelingSelect = useCallback(async (
    depth: LearnerPrefs['contentDepth'],
    familiarity: string,
    sessionLength: string,
    learningStyle: 'projects' | 'practice',
    toolPreference: 'any' | 'preferGeneric' | 'genericOnly',
    outputType: CompleteOnboardingDto['outputType'],
    codeWritingEnabled: boolean
  ) => {
    if (!selectedDirection) return;

    analyticsService.onboardingFeelingSubmitted(familiarity, sessionLength);

    setError(null);
    setStep('completing');

    const durationSeconds = Math.round((Date.now() - onboardingStartTime.current) / 1000);

    try {
      const dto: CompleteOnboardingDto = {
        originalGoal: goal,
        selectedDirection: selectedDirection.title,
        selectedDirectionOutcome: selectedDirection.outcome,
        directionKeywords: selectedDirection.keywords,
        contentDepth: depth,
        platformTolerance: toolPreference,
        selectedLanguage: selectedLanguage,
        outputType,
        usageContext: refinementContext?.usageContext,
        familiarity,
        sessionLength,
        learningStyle,
        codeWritingEnabled,
        goalType: goalType ?? GoalType.CURRICULUM,
        durationSeconds,
      };

      await onboardingService.completeOnboarding(dto);
      await refreshUser();

      navigate('/confirm', { replace: true });
    } catch (err: any) {
      console.error('Failed to complete onboarding:', err);
      setError(err.response?.data?.message || 'Failed to save preferences. Please try again.');
      setStep('depth');
    }
  }, [goal, goalType, selectedDirection, selectedLanguage, refinementContext, navigate, refreshUser]);

  // ─── Progress bar ───────────────────────────────────────────

  const getProgress = () => {
    switch (step) {
      case 'practice_intake': return 10;
      case 'goal_input': return 15;
      case 'generating': return 35;
      case 'directions': return 55;
      case 'refinement': return 55;
      case 'depth': return 85;
      case 'completing': return 100;
      default: return 0;
    }
  };

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 dark:from-brand-900/20 to-surface-secondary">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-surface-tertiary z-50">
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
            {/* ── Practice Intake (default) ── */}
            {step === 'practice_intake' && (
              <StepWrapper key="practice_intake">
                <RepsIntake
                  onComplete={handlePracticeIntakeComplete}
                  isLoading={isSavingIntake}
                />
                <div className="max-w-xl mx-auto mt-8 text-center">
                  <button
                    type="button"
                    onClick={() => setStep('goal_input')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border
                               bg-surface text-sm font-medium text-content-secondary
                               hover:border-brand-300 hover:text-content transition-colors"
                  >
                    <GraduationCap className="w-4 h-4" />
                    I know what I want to study
                  </button>
                </div>
              </StepWrapper>
            )}

            {/* ── Goal Input ── */}
            {step === 'goal_input' && (
              <StepWrapper key="goal">
                <GoalInputStep
                  onSubmit={handleGoalSubmit}
                  initialValue={prefilledSkill}
                  goalType={goalType}
                  onGoalTypeChange={setGoalType}
                  onBackToPractice={prefilledSkill ? undefined : () => setStep('practice_intake')}
                />
              </StepWrapper>
            )}

            {/* ── Generating Directions ── */}
            {step === 'generating' && (
              <StepWrapper key="generating">
                <LoadingState
                  title={
                    goalType === GoalType.PROJECT || goalType === GoalType.AI_BUILDER
                      ? 'Finding project ideas...'
                      : 'Analyzing your situation...'
                  }
                  subtitle={
                    goalType === GoalType.PROJECT || goalType === GoalType.AI_BUILDER
                      ? 'Flexi is designing projects for you'
                      : 'Flexi is mapping out your problem'
                  }
                  steps={
                    goalType === GoalType.PROJECT || goalType === GoalType.AI_BUILDER
                      ? [
                          'Understanding your blockers',
                          'Designing project ideas',
                          'Matching skills to projects',
                        ]
                      : [
                          'Understanding your situation',
                          'Identifying the gaps',
                          'Mapping a fix-it plan',
                        ]
                  }
                />
              </StepWrapper>
            )}

            {/* ── Directions ── */}
            {step === 'directions' && (
              <StepWrapper key="directions">
                <DirectionsStep
                  directions={directions}
                  interpretedGoal={interpretedGoal}
                  onSelect={handleDirectionSelect}
                  onRefine={() => setStep('refinement')}
                  goalType={goalType ?? undefined}
                />
              </StepWrapper>
            )}

            {/* ── Refinement ── */}
            {step === 'refinement' && (
              <StepWrapper key="refinement">
                <RefinementPanel
                  originalGoal={goal}
                  directions={directions}
                  onSubmit={handleRefinementSubmit}
                  onBack={() => setStep('directions')}
                />
              </StepWrapper>
            )}

            {/* ── Depth/Familiarity ── */}
            {step === 'depth' && selectedDirection && (
              <StepWrapper key="depth">
                <FeelingStep
                  selectedDirection={selectedDirection.title}
                  goalType={goalType ?? undefined}
                  onSelect={handleFeelingSelect}
                />
              </StepWrapper>
            )}

            {/* ── Completing ── */}
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

// ─── Shared components ──────────────────────────────────────────

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

function LoadingState({
  title,
  subtitle,
  variant = 'brand',
  steps,
}: {
  title: string;
  subtitle: React.ReactNode;
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
      <div className="relative inline-flex items-center justify-center mb-8">
        <motion.svg
          className="w-24 h-24"
          viewBox="0 0 100 100"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
        >
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="4"
            className={colors.ringBg}
          />
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

        <div className={`absolute w-14 h-14 ${colors.bg} rounded-full flex items-center justify-center`}>
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          >
            <Sparkles className={`w-7 h-7 ${colors.icon}`} />
          </motion.div>
        </div>
      </div>

      <h2 className="text-xl font-semibold text-content mb-2">{title}</h2>
      <p className="text-content-secondary mb-8">{subtitle}</p>

      {steps && steps.length > 0 && (
        <div className="inline-flex flex-col items-start gap-3 text-left">
          {steps.map((s, i) => (
            <motion.div
              key={s}
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
              <span className={`text-sm ${colors.text}`}>{s}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

