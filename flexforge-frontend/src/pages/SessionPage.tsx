import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Zap, X, CheckCircle, XCircle, Loader2, Shuffle, Code2, HelpCircle, FileText } from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import { FocusModeLayout } from '@/components/layout';
import { Button } from '@/components/common';
import type { CurriculumDay } from '@/types';

// Import step components
import { PrePromptStep } from '@/components/session/PrePromptStep';
import { VideoStep } from '@/components/session/VideoStep';
import { FoundationCardsStep } from '@/components/session/FoundationCardsStep';
import { ActiveRecallStep } from '@/components/session/ActiveRecallStep';
import { MemoryBridgeStep } from '@/components/session/MemoryBridgeStep';
import { ConceptCheckStep } from '@/components/session/ConceptCheckStep';
import { TaskStep } from '@/components/session/TaskStep';
import { QuizTaskStep, FillBlankTaskStep } from '@/components/session/AlternativeTaskSteps';
import { BossMilestoneStep } from '@/components/session/BossMilestoneStep';
import { ReflectionStep } from '@/components/session/ReflectionStep';

import type { QuizTask, FillBlankTask } from '@/types';

import type { SessionStep as SessionStepType } from '@/types';

// Skip Test Modal (Multiple Choice)
function SkipTestModal({
  day,
  isOpen,
  onClose,
  onSuccess
}: {
  day: CurriculumDay;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { submitSkipTest } = useSessionStore();
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    passed: boolean;
    correctCount: number;
    totalQuestions: number;
    message: string;
  } | null>(null);

  // Get questions from questionSets (filter for valid multiple choice format)
  const questions = useMemo(() => {
    if (!day.skipTest?.questionSets || day.skipTest.questionSets.length === 0) return [];
    const setIndex = day.skipTest.currentSetIndex ?? 0;
    const questionSet = day.skipTest.questionSets[setIndex] || [];
    // Only include questions with valid options array (for multiple choice format)
    return questionSet.filter(q => q.options && Array.isArray(q.options) && q.options.length > 0);
  }, [day.skipTest]);

  const passThreshold = day.skipTest?.passThreshold ?? 3;

  useEffect(() => {
    if (isOpen && questions.length > 0) {
      setSelectedAnswers(new Array(questions.length).fill(null));
      setResult(null);
    }
  }, [isOpen, questions.length]);

  if (!isOpen) return null;

  // If skipTest not loaded or no questions, show message
  if (!day.skipTest || questions.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl text-center"
        >
          <Zap className="w-12 h-12 text-brand-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Skip Test Not Available
          </h3>
          <p className="text-gray-500 mb-6">
            The skip test for Day {day.day} hasn't been generated yet. Complete the lesson to progress, or check back later.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
          >
            Continue with lesson
          </button>
        </motion.div>
      </div>
    );
  }

  const allAnswered = selectedAnswers.every(a => a !== null);

  const handleSubmit = async () => {
    if (!allAnswered) return;

    setIsSubmitting(true);
    try {
      const submitResult = await submitSkipTest(day.day, selectedAnswers as number[]);
      setResult(submitResult);
      if (submitResult.passed) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (error) {
      console.error('Skip test error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedAnswers([]);
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-xl flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Skip Test: Day {day.day}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Answer all {passThreshold} questions correctly to skip
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Questions */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {result ? (
            <div className={clsx(
              'p-6 rounded-xl text-center',
              result.passed ? 'bg-green-50' : 'bg-amber-50'
            )}>
              {result.passed ? (
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              ) : (
                <XCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
              )}
              <h4 className={clsx(
                'text-lg font-semibold mb-2',
                result.passed ? 'text-green-700' : 'text-amber-700'
              )}>
                {result.passed ? 'Congratulations!' : 'Not quite there'}
              </h4>
              <p className={result.passed ? 'text-green-600' : 'text-amber-600'}>
                {result.message}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Score: {result.correctCount}/{result.totalQuestions}
              </p>
              {!result.passed && (
                <button
                  onClick={handleClose}
                  className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Continue with lesson
                </button>
              )}
            </div>
          ) : (
            questions.map((q, qIndex) => (
              <div key={qIndex} className="space-y-3">
                <p className="text-sm font-medium text-gray-700">
                  {qIndex + 1}. {q.question}
                </p>
                <div className="space-y-2">
                  {q.options.map((option, optIndex) => (
                    <button
                      key={optIndex}
                      onClick={() => {
                        const newAnswers = [...selectedAnswers];
                        newAnswers[qIndex] = optIndex;
                        setSelectedAnswers(newAnswers);
                      }}
                      className={clsx(
                        'w-full text-left px-4 py-3 rounded-lg border-2 transition-all text-sm',
                        selectedAnswers[qIndex] === optIndex
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      <span className="font-medium mr-2">{String.fromCharCode(65 + optIndex)}.</span>
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleSubmit}
              disabled={!allAnswered || isSubmitting}
              className={clsx(
                'w-full py-2.5 rounded-xl font-medium transition-colors flex items-center justify-center gap-2',
                allAnswered && !isSubmitting
                  ? 'bg-brand-500 hover:bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Answers'
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// Task format types for switching
type TaskFormat = 'code' | 'quiz' | 'fillBlank';

// Task Router: Renders the appropriate task component based on task format
// Fetches alternative formats on-demand when user switches
function TaskRouter({ day, session, onComplete }: { day: CurriculumDay; session: any; onComplete: () => void }) {
  const task = day.task1;
  const originalFormat = (task as any)?.format || 'code';
  const [selectedFormat, setSelectedFormat] = useState<TaskFormat>(originalFormat);
  const [alternativeTask, setAlternativeTask] = useState<any>(null);
  const [isLoadingFormat, setIsLoadingFormat] = useState(false);
  const [loadingFormatType, setLoadingFormatType] = useState<TaskFormat | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { getAlternativeTaskFormat } = useSessionStore();

  if (!task) return null;

  const handleFormatSwitch = async (format: TaskFormat) => {
    // If switching back to original format, just use the original task
    if (format === originalFormat) {
      setSelectedFormat(format);
      setAlternativeTask(null);
      setLoadError(null);
      return;
    }

    // Fetch alternative format
    setIsLoadingFormat(true);
    setLoadingFormatType(format);
    setLoadError(null);
    try {
      const altTask = await getAlternativeTaskFormat(day.day, format);
      setAlternativeTask(altTask);
      setSelectedFormat(format);
    } catch (error: any) {
      setLoadError(error.message || 'Failed to load alternative format');
    } finally {
      setIsLoadingFormat(false);
      setLoadingFormatType(null);
    }
  };

  // Create a modified day object with the alternative task if loaded
  const modifiedDay = alternativeTask && selectedFormat !== originalFormat
    ? { ...day, task1: alternativeTask }
    : day;

  // Render the appropriate component based on selected format
  const renderTaskComponent = () => {
    if (isLoadingFormat) {
      const formatLabel = loadingFormatType === 'quiz' ? 'quiz' : loadingFormatType === 'fillBlank' ? 'fill-in-the-blank' : 'code';
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          <p className="text-gray-600">Generating {formatLabel} version...</p>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="text-center py-8">
          <p className="text-red-500 mb-4">{loadError}</p>
          <button
            onClick={() => handleFormatSwitch(originalFormat)}
            className="text-brand-500 hover:text-brand-600"
          >
            Back to original task
          </button>
        </div>
      );
    }

    switch (selectedFormat) {
      case 'quiz':
        return <QuizTaskStep day={modifiedDay} session={session} onComplete={onComplete} />;
      case 'fillBlank':
        return <FillBlankTaskStep day={modifiedDay} session={session} onComplete={onComplete} />;
      case 'code':
      default:
        return <TaskStep day={modifiedDay} session={session} onComplete={onComplete} />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Alternative formats banner */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Shuffle className="w-4 h-4" />
            <span>Try a different style:</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleFormatSwitch('code')}
              disabled={isLoadingFormat}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors',
                selectedFormat === 'code'
                  ? 'bg-white text-gray-900 shadow-sm font-medium'
                  : 'text-gray-600 hover:text-gray-700 hover:bg-gray-100'
              )}
            >
              <Code2 className="w-4 h-4" />
              Code
            </button>
            <button
              onClick={() => handleFormatSwitch('quiz')}
              disabled={isLoadingFormat}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors',
                selectedFormat === 'quiz'
                  ? 'bg-white text-purple-700 shadow-sm font-medium'
                  : 'text-purple-600 hover:text-purple-700 hover:bg-purple-100'
              )}
            >
              <HelpCircle className="w-4 h-4" />
              Quiz
            </button>
            <button
              onClick={() => handleFormatSwitch('fillBlank')}
              disabled={isLoadingFormat}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors',
                selectedFormat === 'fillBlank'
                  ? 'bg-white text-blue-700 shadow-sm font-medium'
                  : 'text-blue-600 hover:text-blue-700 hover:bg-blue-100'
              )}
            >
              <FileText className="w-4 h-4" />
              Fill Blanks
            </button>
          </div>
        </div>
      </div>

      {renderTaskComponent()}
    </div>
  );
}

const STEP_COMPONENTS: Record<SessionStepType, React.ComponentType<any>> = {
  prePrompt: PrePromptStep,
  video: VideoStep,
  foundationCards: FoundationCardsStep,
  activeRecall: ActiveRecallStep,
  memoryBridge: MemoryBridgeStep,
  conceptCheck: ConceptCheckStep,
  task1: TaskRouter,
  bossMilestone: BossMilestoneStep,
  reflection: ReflectionStep,
};

// New flow with foundation cards (replaces activeRecall + memoryBridge + conceptCheck)
const STEP_ORDER_NEW: SessionStepType[] = [
  'prePrompt',
  'video',
  'foundationCards',
  'task1',
  'bossMilestone',
  'reflection',
];

// Legacy flow for backward compatibility
const STEP_ORDER_LEGACY: SessionStepType[] = [
  'prePrompt',
  'video',
  'activeRecall',
  'memoryBridge',
  'conceptCheck',
  'task1',
  'bossMilestone',
  'reflection',
];

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [showSkipTest, setShowSkipTest] = useState(false);

  const {
    activeSession,
    currentDay,
    currentStep,
    completedSteps,
    fetchActiveSession,
    setActiveSession,
    startDay,
    setCurrentStep,
    completeStep,
    isDeferredLoading,
  } = useSessionStore();

  const { celebrate, addSystemMessage } = useCompanionStore();

  // Load session on mount
  useEffect(() => {
    if (sessionId && !activeSession) {
      fetchActiveSession();
    }
  }, [sessionId, activeSession, fetchActiveSession]);

  // Start the day when session loads
  useEffect(() => {
    if (activeSession && !currentDay) {
      startDay(activeSession.currentDay);
    }
  }, [activeSession, currentDay, startDay]);

  // Determine which flow to use based on content
  const useNewFlow = !!(currentDay?.foundationCards && currentDay.foundationCards.length > 0);
  const baseStepOrder = useNewFlow ? STEP_ORDER_NEW : STEP_ORDER_LEGACY;

  // Debug logging
  console.log('[SessionPage] Flow detection:', {
    useNewFlow,
    hasFoundationCards: !!currentDay?.foundationCards,
    foundationCardsCount: currentDay?.foundationCards?.length ?? 0,
    hasActiveRecall: !!currentDay?.activeRecall,
    hasConceptCheck: !!currentDay?.conceptCheck,
    currentStep,
    availableSteps: baseStepOrder,
  });

  // Get available steps (filter out skipped ones)
  const availableSteps = baseStepOrder.filter(step => {
    // Skip memoryBridge on day 1 (only in legacy flow)
    if (step === 'memoryBridge' && currentDay?.day === 1) return false;
    // Skip bossMilestone if not present
    if (step === 'bossMilestone' && !currentDay?.bossMilestone) return false;
    // Skip foundationCards if not present (fallback to legacy)
    if (step === 'foundationCards' && (!currentDay?.foundationCards || currentDay.foundationCards.length === 0)) return false;
    // Skip legacy steps if using new flow
    if (useNewFlow && (step === 'activeRecall' || step === 'conceptCheck' || step === 'memoryBridge')) return false;
    return true;
  });

  const currentStepIndex = availableSteps.indexOf(currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === availableSteps.length - 1;

  const handlePrevious = () => {
    if (isFirstStep) return;
    const prevStep = availableSteps[currentStepIndex - 1];
    setCurrentStep(prevStep);
  };

  const handleContinue = () => {
    if (isLastStep) {
      // Session complete!
      celebrate('dayComplete');
      addSystemMessage(
        "🎉 Incredible! You finished the whole day! Take a moment to feel proud!",
        'celebratory'
      );
      navigate('/today');
      return;
    }

    // Mark current step complete and move to next
    completeStep(currentStep);
    
    // Celebrate based on step
    if (currentStep === 'task1') {
      celebrate('taskComplete');
    }
  };

  // Loading state
  if (!activeSession || !currentDay) {
    return (
      <FocusModeLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse space-y-4 w-full max-w-lg">
            <div className="h-8 bg-gray-200 rounded w-3/4 mx-auto" />
            <div className="h-64 bg-gray-200 rounded-xl" />
            <div className="h-12 bg-gray-200 rounded-lg" />
          </div>
        </div>
      </FocusModeLayout>
    );
  }

  // Check if deferred content needed but still loading
  const needsDeferredContent = currentStep === 'reflection';
  const deferredContentMissing = needsDeferredContent && !currentDay.reflection;

  if (deferredContentMissing && isDeferredLoading) {
    return (
      <FocusModeLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          <p className="text-gray-600">Loading reflection questions...</p>
        </div>
      </FocusModeLayout>
    );
  }

  const StepComponent = STEP_COMPONENTS[currentStep];

  return (
    <FocusModeLayout>
      {/* Step content with animation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <StepComponent
            day={currentDay}
            session={activeSession}
            onComplete={handleContinue}
          />
        </motion.div>
      </AnimatePresence>

      {/* Navigation footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-4">
        <div className="max-w-focus mx-auto px-4">
          {/* Skip test link */}
          <div className="flex justify-center mb-3">
            <button
              onClick={() => setShowSkipTest(true)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-brand-500 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Already know this? Take the skip test to advance to the next day.</span>
            </button>
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-between items-center">
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={isFirstStep}
              leftIcon={<ChevronLeft className="w-5 h-5" />}
            >
              Previous
            </Button>

            <Button
              variant={isLastStep ? 'accent' : 'primary'}
              onClick={handleContinue}
              rightIcon={<ChevronRight className="w-5 h-5" />}
            >
              {isLastStep ? 'Complete Session 🎉' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>

      {/* Spacer for fixed footer */}
      <div className="h-24" />

      {/* Skip Test Modal */}
      {currentDay && (
        <SkipTestModal
          day={currentDay}
          isOpen={showSkipTest}
          onClose={() => setShowSkipTest(false)}
          onSuccess={() => {
            setShowSkipTest(false);
            navigate('/today');
          }}
        />
      )}
    </FocusModeLayout>
  );
}
