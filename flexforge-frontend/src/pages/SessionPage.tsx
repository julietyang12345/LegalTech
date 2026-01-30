import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, CheckCircle, Shuffle, HelpCircle, FileText, Sparkles, Target, BookOpen, Trophy, GraduationCap } from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import { useAuthStore } from '@/stores/authStore';
import { FocusModeLayout } from '@/components/layout';
import { Button, GeneratingScreen, ExerciseLoadingScreen } from '@/components/common';
import { AiTutorPanel } from '@/components/session/AiTutorPanel';
import { QuotaTier } from '@/types';
import type { CurriculumDay } from '@/types';

// Import step components
import { PrePromptStep } from '@/components/session/PrePromptStep';
import { VideoStep } from '@/components/session/VideoStep';
import { FoundationCardsStep } from '@/components/session/FoundationCardsStep';
import { QuizTaskStep, FillBlankTaskStep } from '@/components/session/AlternativeTaskSteps';
import { SectionTaskStep } from '@/components/session/SectionTaskStep';
import { BossMilestoneStep } from '@/components/session/BossMilestoneStep';
import { OpenTaskStep } from '@/components/session/OpenTaskStep';
import { ReflectionStep } from '@/components/session/ReflectionStep';

import type { SessionStep as SessionStepType } from '@/types';

// Draggable AI Tutor Button for mobile
function DraggableAiTutorButton({
  canUseAITutor,
  onOpenTutor,
  onOpenUpgrade,
}: {
  canUseAITutor: boolean;
  onOpenTutor: () => void;
  onOpenUpgrade: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState(() => {
    const saved = localStorage.getItem('ai-tutor-btn-pos');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { right: 16, bottom: 112 };
      }
    }
    return { right: 16, bottom: 112 };
  });
  const dragInfo = useRef({ startX: 0, startY: 0, startRight: 0, startBottom: 0, moved: false });

  useEffect(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      dragInfo.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startRight: pos.right,
        startBottom: pos.bottom,
        moved: false,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      const deltaX = dragInfo.current.startX - touch.clientX;
      const deltaY = dragInfo.current.startY - touch.clientY;

      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        dragInfo.current.moved = true;
      }

      const newRight = Math.max(10, Math.min(window.innerWidth - 150, dragInfo.current.startRight + deltaX));
      const newBottom = Math.max(10, Math.min(window.innerHeight - 60, dragInfo.current.startBottom + deltaY));

      setPos({ right: newRight, bottom: newBottom });
    };

    const handleTouchEnd = () => {
      localStorage.setItem('ai-tutor-btn-pos', JSON.stringify(pos));
      if (!dragInfo.current.moved) {
        if (canUseAITutor) {
          onOpenTutor();
        } else {
          onOpenUpgrade();
        }
      }
    };

    btn.addEventListener('touchstart', handleTouchStart, { passive: false });
    btn.addEventListener('touchmove', handleTouchMove, { passive: false });
    btn.addEventListener('touchend', handleTouchEnd);

    return () => {
      btn.removeEventListener('touchstart', handleTouchStart);
      btn.removeEventListener('touchmove', handleTouchMove);
      btn.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pos, canUseAITutor, onOpenTutor, onOpenUpgrade]);

  return (
    <button
      ref={buttonRef}
      onClick={() => {
        if (!dragInfo.current.moved) {
          if (canUseAITutor) {
            onOpenTutor();
          } else {
            onOpenUpgrade();
          }
        }
        dragInfo.current.moved = false;
      }}
      style={{
        position: 'fixed',
        right: pos.right,
        bottom: pos.bottom,
        touchAction: 'none',
      }}
      className={clsx(
        'z-30 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg transition-all duration-200',
        canUseAITutor
          ? 'bg-gradient-to-br from-focus-500 to-focus-600 text-white hover:shadow-xl active:scale-95'
          : 'bg-gray-200 text-gray-500 hover:bg-gray-300 active:scale-95'
      )}
    >
      <GraduationCap className="w-5 h-5" />
      <span className="text-sm font-medium">AI Tutor</span>
    </button>
  );
}

// Incomplete Work Warning Modal
function IncompleteWorkModal({
  isOpen,
  onClose,
  onProceedAnyway,
  incompleteItems,
}: {
  isOpen: boolean;
  onClose: () => void;
  onProceedAnyway: () => void;
  incompleteItems: { step: string; label: string; icon: string }[];
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <span className="text-xl">⚠️</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Hold on!</h3>
              <p className="text-sm text-gray-500">You have uncompleted activities</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-600 mb-4">
            You haven't finished these activities yet:
          </p>
          <div className="space-y-3">
            {incompleteItems.map((item) => (
              <div
                key={item.step}
                className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg"
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-amber-800 font-medium">{item.label}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Completing these activities helps reinforce your learning and improves retention.
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-medium transition-colors"
          >
            Go Back & Complete
          </button>
          <button
            onClick={onProceedAnyway}
            className="py-2.5 px-4 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl font-medium transition-colors"
          >
            Continue Anyway
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Task format types for switching (quiz and fillBlank only - code moved to bossMilestone)
type TaskFormat = 'quiz' | 'fillBlank' | 'mixed' | 'sections';

// Task Router: Renders the appropriate task component based on task format
// Unified section-based system: ALL skill types can use sections format
// Legacy quiz/fillBlank formats are auto-converted by SectionTaskStep
// Language learning uses 'mixed' format (treated same as 'sections')
function TaskRouter({ day, session, onComplete }: { day: CurriculumDay; session: any; onComplete: () => void }) {
  const task = day.task1;
  const originalFormat = ((task as any)?.format || 'quiz') as TaskFormat;
  const [selectedFormat, setSelectedFormat] = useState<TaskFormat>(originalFormat);
  const [alternativeTask, setAlternativeTask] = useState<any>(null);
  const [isLoadingFormat, setIsLoadingFormat] = useState(false);
  const [loadingFormatType, setLoadingFormatType] = useState<TaskFormat | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { getAlternativeTaskFormat, isDeferredLoading } = useSessionStore();

  // Show loading screen when task1 is not yet available (deferred content still loading)
  if (!task) {
    return (
      <div className="max-w-lg mx-auto">
        <ExerciseLoadingScreen
          type="task"
          skillName={session.skillName}
          dayNumber={day.day}
        />
        {!isDeferredLoading && (
          <div className="text-center mt-4">
            <button
              onClick={onComplete}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    );
  }

  // For section-based formats (sections, mixed), use unified SectionTaskStep
  // This handles ALL skill types with appropriate section rendering
  if (originalFormat === 'sections' || originalFormat === 'mixed') {
    return <SectionTaskStep day={day} session={session} onComplete={onComplete} />;
  }

  // For legacy formats (quiz, fillBlank), allow format switching
  // SectionTaskStep can also handle these via auto-conversion
  const handleFormatSwitch = async (format: TaskFormat) => {
    // If switching back to original format, just use the original task
    if (format === originalFormat) {
      setSelectedFormat(format);
      setAlternativeTask(null);
      setLoadError(null);
      return;
    }

    // Sections format uses the unified component with auto-conversion
    if (format === 'sections' || format === 'mixed') {
      setSelectedFormat(format);
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
      return (
        <ExerciseLoadingScreen
          type={loadingFormatType === 'quiz' ? 'quiz' : 'task'}
          skillName={session.skillName}
          dayNumber={day.day}
        />
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
      case 'sections':
      case 'mixed':
        // Use unified SectionTaskStep which auto-converts legacy formats
        return <SectionTaskStep day={modifiedDay} session={session} onComplete={onComplete} />;
      default:
        return <QuizTaskStep day={modifiedDay} session={session} onComplete={onComplete} />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Alternative formats banner (quiz and fillBlank only) */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Shuffle className="w-4 h-4" />
            <span>Try a different style:</span>
          </div>
          <div className="flex items-center gap-1">
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
  task1: TaskRouter,
  bossMilestone: BossMilestoneStep,
  openTask: OpenTaskStep,
  reflection: ReflectionStep,
};

// Step order for the session flow
const STEP_ORDER: SessionStepType[] = [
  'prePrompt',
  'video',
  'foundationCards',
  'task1',
  'bossMilestone',
  'openTask',
  'reflection',
];

// Step engagement tracking - what user has actually done
interface StepEngagement {
  foundationCards: boolean;  // Clicked through all cards
  task1: boolean;            // Completed quiz/fill-blank
  bossMilestone: boolean;    // Submitted boss milestone code
  reflection: boolean;       // Filled reflection
}

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [incompleteItems, setIncompleteItems] = useState<{ step: string; label: string; icon: string }[]>([]);
  const [showAiTutor, setShowAiTutor] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const { hasTierAccess } = useAuthStore();
  const canUseAITutor = hasTierAccess(QuotaTier.PRO);

  // Track what user has actually engaged with
  const [stepEngagement, setStepEngagement] = useState<StepEngagement>({
    foundationCards: false,
    task1: false,
    bossMilestone: false,
    reflection: false,
  });

  const markStepEngaged = (step: keyof StepEngagement) => {
    setStepEngagement(prev => ({ ...prev, [step]: true }));
  };

  const {
    activeSession,
    currentDay,
    currentStep,
    completedSteps: _completedSteps,
    fetchActiveSession,
    setActiveSession: _setActiveSession,
    startDay,
    setCurrentStep,
    completeStep,
    isDeferredLoading,
    isRegenerating,
    hasStepEngagement,
    loadDayCoreContent,
    loadDayDeferredContent,
    isCoreLoaded,
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

  // Continue loading content if not fully loaded (TodayPage started it, we continue)
  useEffect(() => {
    if (activeSession && !isCoreLoaded) {
      // Content loading started by TodayPage, continues here
      // Each section will show its own loader until content arrives
      loadDayCoreContent(activeSession.currentDay).then(() => {
        loadDayDeferredContent(activeSession.currentDay).catch(console.error);
      }).catch(console.error);
    }
  }, [activeSession, isCoreLoaded, loadDayCoreContent, loadDayDeferredContent]);


  // Get available steps (filter out skipped ones)
  const availableSteps = STEP_ORDER.filter(step => {
    // When video is skipped, show "Learn & Understand" step instead (handled in VideoStep)
    // Don't filter out video step - it will render AI content from foundation cards
    if (step === 'video') {
      // Only skip if no content at all (no video AND no foundation cards)
      const hasFoundationCards = (currentDay?.foundationCards && currentDay.foundationCards.length > 0) ||
                                  (currentDay?.languageFoundationCards && currentDay.languageFoundationCards.length > 0);
      if (!currentDay?.video && !hasFoundationCards) return false;
    }
    // Always show bossMilestone step (renders as either boss milestone OR intensive practice)
    // The BossMilestoneStep component handles both project-based and practice-based curricula
    // Don't filter based on content existence - content loads async via deferred
    if (step === 'bossMilestone') {
      // Only skip if explicitly marked as no practice day (rare edge case)
      return true;
    }
    // Skip foundationCards if not present (check both regular and language-specific cards)
    if (step === 'foundationCards') {
      const hasCards = (currentDay?.foundationCards && currentDay.foundationCards.length > 0) ||
                       (currentDay?.languageFoundationCards && currentDay.languageFoundationCards.length > 0);
      if (!hasCards) return false;
    }
    // Always show openTask step (renders as Real-World Challenge)
    // The OpenTaskStep component handles empty/loading states
    if (step === 'openTask') {
      return true;
    }
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

  const {
    submitPracticeProject,
    resetSteps,
  } = useSessionStore();

  const [isAdvancingDay, setIsAdvancingDay] = useState(false);

  // Check what work is incomplete (uses store's persisted progress)
  const checkIncompleteWork = (): { step: string; label: string; icon: string }[] => {
    if (!currentDay) return [];
    const incomplete: { step: string; label: string; icon: string }[] = [];

    // Check foundation cards (if they exist in this flow) - uses local state
    const hasCards = (currentDay?.foundationCards && currentDay.foundationCards.length > 0) ||
                     (currentDay?.languageFoundationCards && currentDay.languageFoundationCards.length > 0);
    if (hasCards && !stepEngagement.foundationCards) {
      incomplete.push({
        step: 'foundationCards',
        label: 'Review Foundation Cards',
        icon: '📚',
      });
    }

    // Check task completion (quiz or fillBlank) - uses store's persisted progress
    if (currentDay?.task1 && !hasStepEngagement(currentDay.day, 'task1')) {
      const taskFormat = (currentDay.task1 as any)?.format || 'quiz';
      incomplete.push({
        step: 'task1',
        label: taskFormat === 'quiz' ? 'Complete the Quiz' : 'Complete Fill-in-the-Blanks',
        icon: taskFormat === 'quiz' ? '❓' : '✍️',
      });
    }

    // Check boss milestone (coding practice) - uses store's persisted progress
    if ((currentDay?.bossMilestone || currentDay?.hasBossProject) && !hasStepEngagement(currentDay.day, 'bossMilestone')) {
      incomplete.push({
        step: 'bossMilestone',
        label: 'Complete Boss Milestone Code',
        icon: '🏆',
      });
    }

    return incomplete;
  };

  // Proceed with day completion (after validation or skip)
  const proceedWithCompletion = async () => {
    celebrate('dayComplete');
    const hasNextDay = activeSession && currentDay && currentDay.day < activeSession.durationDays;

    if (hasNextDay) {
      setIsAdvancingDay(true);
      try {
        // 1. Mark current day as complete (unlocks next day)
        await submitPracticeProject(currentDay.day, 'Day completed via reflection', 4);

        // 2. Reset steps and engagement for new day
        resetSteps();
        setStepEngagement({ foundationCards: false, task1: false, bossMilestone: false, reflection: false });

        addSystemMessage(
          `🎉 Day ${currentDay.day} complete! Ready for the next day!`,
          'celebratory'
        );

        // 3. Navigate to today page - user clicks "Start Learning" to load next day
        setIsAdvancingDay(false);
        navigate('/today');
      } catch (error) {
        console.error('Failed to advance day:', error);
        setIsAdvancingDay(false);
        navigate('/today');
      }
    } else {
      // No more days - course complete!
      addSystemMessage(
        "🎉 Incredible! You finished the entire course! Take a moment to feel proud!",
        'celebratory'
      );
      navigate('/today');
    }
  };

  // Check if current step should be marked as completed
  // Uses store's persisted progress for all engagement-required steps
  const isStepEngaged = (step: SessionStepType): boolean => {
    if (!currentDay) return false;

    // Steps that require explicit engagement - check store for persisted progress
    if (step === 'foundationCards') return hasStepEngagement(currentDay.day, 'foundationCards');
    if (step === 'task1') return hasStepEngagement(currentDay.day, 'task1');
    if (step === 'bossMilestone') return hasStepEngagement(currentDay.day, 'bossMilestone');
    if (step === 'reflection') return stepEngagement.reflection;
    // Other steps (prePrompt, video, etc.) are considered complete when viewed
    return true;
  };

  const handleContinue = async () => {
    if (isLastStep) {
      // Check for incomplete work before completing
      const incomplete = checkIncompleteWork();
      if (incomplete.length > 0) {
        setIncompleteItems(incomplete);
        setShowIncompleteModal(true);
        return;
      }

      // All work done, proceed
      await proceedWithCompletion();
      return;
    }

    // Only mark step as complete if user has engaged with it
    if (isStepEngaged(currentStep)) {
      completeStep(currentStep);
    } else {
      // Just move to next step without marking complete
      const nextStep = availableSteps[currentStepIndex + 1] as SessionStepType;
      setCurrentStep(nextStep || 'reflection');
    }

    // Celebrate based on step
    if (currentStep === 'task1') {
      celebrate('taskComplete');
    }
  };


  // Loading state - only block if no session at all
  // Once we have activeSession, show page with section-level loading spinners
  if (!activeSession) {
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

  // Create a placeholder day when loading - allows step components to show their own loaders
  const displayDay: CurriculumDay = currentDay || {
    day: activeSession.currentDay,
    title: 'Loading...',
    objectives: [],
    estimatedMinutes: 0,
    status: 'in_progress' as any,
    detailsLoaded: false,
  };

  // Regenerating day content - show loading screen regardless of currentDay state
  if (isRegenerating) {
    const dayNum = currentDay?.day || activeSession.currentDay;
    return (
      <GeneratingScreen
        steps={[
          { icon: Sparkles, text: 'Generating fresh content...', duration: 20000 },
          { icon: Target, text: 'Creating new exercises...', duration: 20000 },
          { icon: BookOpen, text: 'Finding a new video...', duration: 22000 },
          { icon: Trophy, text: 'Preparing your refreshed session...', duration: 15000 },
        ]}
        title={`Regenerating Day ${dayNum}`}
        subtitle={`Creating fresh ${activeSession.skillName} content just for you`}
        timeEstimate="This usually takes about 90 seconds"
      />
    );
  }

  // Loading next day content
  if (isAdvancingDay && currentDay) {
    const nextDayNumber = currentDay.day + 1;
    const nextDayData = activeSession.curriculum.days.find(d => d.day === nextDayNumber);
    return (
      <GeneratingScreen
        steps={[
          { icon: CheckCircle, text: `Saving Day ${currentDay.day} progress...`, duration: 2000 },
          { icon: Sparkles, text: 'Generating fresh content...', duration: 20000 },
          { icon: Target, text: 'Creating new exercises...', duration: 20000 },
          { icon: BookOpen, text: 'Finding a new video...', duration: 22000 },
          { icon: Trophy, text: 'Preparing your refreshed session...', duration: 15000 },
        ]}
        title={`Preparing Day ${nextDayNumber}`}
        subtitle={nextDayData?.title || `Your next ${activeSession.skillName} lesson`}
        timeEstimate="This usually takes about 90 seconds"
      />
    );
  }

  const StepComponent = STEP_COMPONENTS[currentStep];

  // Safety check - if StepComponent is undefined, show error
  if (!StepComponent) {
    console.error('Unknown step:', currentStep, 'Available steps:', Object.keys(STEP_COMPONENTS));
    return (
      <FocusModeLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <p className="text-red-500">Unknown step: {currentStep}</p>
          <Button onClick={() => navigate('/dashboard')}>Return to Dashboard</Button>
        </div>
      </FocusModeLayout>
    );
  }


  // Wrap onComplete to track engagement for specific steps
  const handleStepComplete = () => {
    // Mark engagement based on current step
    // task1, bossMilestone are tracked in the store (persisted progress)
    // foundationCards and reflection still use local state
    if (currentStep === 'foundationCards') {
      markStepEngaged('foundationCards');
    } else if (currentStep === 'reflection') {
      markStepEngaged('reflection');
    }
    // task1, bossMilestone engagement is automatically tracked
    // when user answers questions or types code
    handleContinue();
  };

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
            day={displayDay}
            session={activeSession}
            onComplete={handleStepComplete}
          />
        </motion.div>
      </AnimatePresence>

      {/* Navigation footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-4">
        <div className="max-w-focus mx-auto px-4">
          {/* Navigation buttons */}
          <div className="flex justify-between items-center">
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={isFirstStep || !currentDay}
              leftIcon={<ChevronLeft className="w-5 h-5" />}
            >
              Previous
            </Button>

            {/* AI Tutor Button - Desktop only (inline) */}
            <div className="hidden md:block">
              {canUseAITutor ? (
                <button
                  onClick={() => setShowAiTutor(true)}
                  className="group flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 bg-white hover:bg-gray-50 border border-gray-200 hover:border-purple-300 hover:shadow-md hover:shadow-purple-100"
                >
                  <Sparkles className="w-4 h-4 text-purple-500 group-hover:text-purple-600" />
                  <span className="text-gray-700 group-hover:text-gray-900">Ask AI Tutor</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowUpgradeModal(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Ask AI Tutor (PRO)
                </button>
              )}
            </div>

            <Button
              variant={isLastStep ? 'accent' : 'primary'}
              onClick={handleContinue}
              disabled={!currentDay}
              rightIcon={<ChevronRight className="w-5 h-5" />}
            >
              {!currentDay ? 'Loading...' : isLastStep ? 'Complete Session 🎉' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>

      {/* Spacer for fixed footer */}
      <div className="h-32 sm:h-24" />

      {/* Incomplete Work Warning Modal */}
      <IncompleteWorkModal
        isOpen={showIncompleteModal}
        onClose={() => setShowIncompleteModal(false)}
        onProceedAnyway={() => {
          setShowIncompleteModal(false);
          proceedWithCompletion();
        }}
        incompleteItems={incompleteItems}
      />

      {/* Floating AI Tutor Button - Mobile only (draggable) */}
      <div className="md:hidden">
        <DraggableAiTutorButton
          canUseAITutor={canUseAITutor}
          onOpenTutor={() => setShowAiTutor(true)}
          onOpenUpgrade={() => setShowUpgradeModal(true)}
        />
      </div>

      {/* AI Tutor Panel */}
      {activeSession && currentDay && (
        <AiTutorPanel
          isOpen={showAiTutor}
          onClose={() => setShowAiTutor(false)}
          sessionId={activeSession.id}
          dayNumber={currentDay.day}
          context={{
            taskTitle: (currentDay.task1 as any)?.title || currentDay.title,
            taskDescription: (currentDay.task1 as any)?.description,
            concept: currentDay.title,
          }}
        />
      )}

      {/* Upgrade Modal */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowUpgradeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-sm w-full shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">Unlock AI Tutor</h2>
                <p className="text-purple-100 text-sm mt-1">Get personalized help anytime</p>
              </div>

              {/* Content */}
              <div className="p-6">
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center gap-3 text-sm text-gray-700">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span>Ask unlimited questions about your lessons</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-700">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span>Get instant explanations and examples</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-700">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span>Personalized learning assistance 24/7</span>
                  </li>
                </ul>

                <Button
                  size="lg"
                  className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                  onClick={() => {
                    setShowUpgradeModal(false);
                    // Navigate to upgrade page or show payment modal
                    window.open('/upgrade', '_blank');
                  }}
                >
                  Upgrade to PRO
                </Button>

                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </FocusModeLayout>
  );
}
