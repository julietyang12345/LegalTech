import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Shuffle, HelpCircle, FileText, Sparkles, Target, BookOpen, Trophy, GraduationCap, Bookmark } from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import { useCommunityShareStore } from '@/stores/communityShareStore';
import { useAuthStore } from '@/stores/authStore';
import { analyticsService } from '@/services/analyticsService';
import { FocusModeLayout } from '@/components/layout';
import { Button, GeneratingScreen, FakePaywallModal } from '@/components/common';
import { AiTutorPanel } from '@/components/session/AiTutorPanel';
import { StepCelebration, getCelebrationLabel } from '@/components/session/StepCelebration';
import { DayCompletionScreen } from '@/components/session/DayCompletionScreen';
import { GoalType, type CurriculumDay } from '@/types';
import { getTrainingConfig, isTrainingMode } from '@/config/training-configs';

// Import step components
import { PrePromptStep } from '@/components/session/PrePromptStep';
import { VideoStep } from '@/components/session/VideoStep';
import { QuizTaskStep, FillBlankTaskStep } from '@/components/session/AlternativeTaskSteps';
import { SectionTaskStep } from '@/components/session/SectionTaskStep';
import { BossMilestoneStep } from '@/components/session/BossMilestoneStep';
import { OpenTaskStep } from '@/components/session/OpenTaskStep';
import { ReflectionStep } from '@/components/session/ReflectionStep';
import { TimedWorkspace } from '@/components/session/TimedWorkspace';

import type { SessionStep as SessionStepType } from '@/types';
import type { CourseBookmark } from './VaultPage';

// Bookmark storage
const BOOKMARKS_STORAGE_KEY = 'flexforge_bookmarks';

function addBookmark(bookmark: Omit<CourseBookmark, 'id' | 'createdAt'>) {
  const stored = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
  const bookmarks: CourseBookmark[] = stored ? JSON.parse(stored) : [];

  const newBookmark: CourseBookmark = {
    ...bookmark,
    id: `bm_${Date.now()}`,
    createdAt: new Date().toISOString(),
  };

  bookmarks.unshift(newBookmark);
  localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  return newBookmark;
}

// Draggable AI Tutor Button for mobile
function DraggableAiTutorButton({
  onOpenTutor,
}: {
  onOpenTutor: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState(() => {
    const saved = localStorage.getItem('ai-tutor-btn-pos');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Default to center bottom (button is ~130px wide)
        const centerRight = typeof window !== 'undefined' ? (window.innerWidth - 130) / 2 : 120;
        return { right: centerRight, bottom: 112 };
      }
    }
    // Default to center bottom (button is ~130px wide)
    const centerRight = typeof window !== 'undefined' ? (window.innerWidth - 130) / 2 : 120;
    return { right: centerRight, bottom: 112 };
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
        onOpenTutor();
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
  }, [pos, onOpenTutor]);

  return (
    <button
      ref={buttonRef}
      onClick={() => {
        if (!dragInfo.current.moved) {
          onOpenTutor();
        }
        dragInfo.current.moved = false;
      }}
      style={{
        position: 'fixed',
        right: pos.right,
        bottom: pos.bottom,
        touchAction: 'none',
      }}
      className="z-30 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg transition-all duration-200 bg-gradient-to-br from-focus-500 to-focus-600 text-white hover:shadow-xl active:scale-95"
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
        className="bg-surface rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-border-secondary">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <span className="text-xl">⚠️</span>
            </div>
            <div>
              <h3 className="font-semibold text-content">Hold on!</h3>
              <p className="text-sm text-content-tertiary">You have uncompleted activities</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-content-secondary mb-4">
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
          <p className="text-sm text-content-tertiary mt-4">
            Completing these activities helps reinforce your learning and improves retention.
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-secondary flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-medium transition-colors"
          >
            Go Back & Complete
          </button>
          <button
            onClick={onProceedAnyway}
            className="py-2.5 px-4 min-h-[44px] text-content-tertiary hover:text-content-secondary hover:bg-surface-tertiary active:bg-surface-tertiary rounded-xl font-medium transition-colors"
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
function TaskRouter({ day, session, onComplete, onBookmarkQuestion, onShareQuestion }: { day: CurriculumDay; session: any; onComplete: () => void; onBookmarkQuestion?: (q: { question: string; options?: string[]; correctAnswer?: string }) => void; onShareQuestion?: (q: { question: string; options?: string[]; correctAnswer?: string }) => void }) {

  const task = day.task1;
  const originalFormat = ((task as any)?.format || 'quiz') as TaskFormat;
  const [selectedFormat, setSelectedFormat] = useState<TaskFormat>(originalFormat);
  const [alternativeTask, setAlternativeTask] = useState<any>(null);
  const [isLoadingFormat, setIsLoadingFormat] = useState(false);
  const [loadingFormatType, setLoadingFormatType] = useState<TaskFormat | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { getAlternativeTaskFormat } = useSessionStore();

  // Show quiz-shaped skeleton when task1 is not yet available (streaming in progress)
  // This replaces the big ExerciseLoadingScreen with a per-question skeleton
  // so the transition to real questions is seamless
  if (!task) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <div className="h-7 bg-surface-tertiary rounded w-1/3 animate-pulse mb-2" />
          <div className="h-4 bg-surface-tertiary rounded w-2/3 animate-pulse" />
        </div>
        <div className="h-2 bg-surface-tertiary rounded-full mb-4" />
        <div className="bg-surface rounded-xl shadow-lg p-6">
          <div className="space-y-4 animate-pulse">
            <div className="h-5 bg-surface-tertiary rounded w-3/4" />
            <div className="space-y-2">
              <div className="h-12 bg-surface-tertiary rounded-lg" />
              <div className="h-12 bg-surface-tertiary rounded-lg" />
              <div className="h-12 bg-surface-tertiary rounded-lg" />
              <div className="h-12 bg-surface-tertiary rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // For section-based formats (sections, mixed), use unified SectionTaskStep
  // This handles ALL skill types with appropriate section rendering
  if (originalFormat === 'sections' || originalFormat === 'mixed') {
    return <SectionTaskStep day={day} session={session} onComplete={onComplete} onBookmarkQuestion={onBookmarkQuestion} onShareQuestion={onShareQuestion} />;
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
        <div className="max-w-2xl mx-auto">
          <div className="bg-surface rounded-xl shadow-lg p-6">
            <div className="space-y-4 animate-pulse">
              <div className="h-5 bg-surface-tertiary rounded w-3/4" />
              <div className="space-y-2">
                <div className="h-12 bg-surface-tertiary rounded-lg" />
                <div className="h-12 bg-surface-tertiary rounded-lg" />
                <div className="h-12 bg-surface-tertiary rounded-lg" />
                <div className="h-12 bg-surface-tertiary rounded-lg" />
              </div>
            </div>
          </div>
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
        return <QuizTaskStep day={modifiedDay} session={session} onComplete={onComplete} onBookmarkQuestion={onBookmarkQuestion} onShareQuestion={onShareQuestion} />;
      case 'fillBlank':
        return <FillBlankTaskStep day={modifiedDay} session={session} onComplete={onComplete} />;
      case 'sections':
      case 'mixed':
        // Use unified SectionTaskStep which auto-converts legacy formats
        return <SectionTaskStep day={modifiedDay} session={session} onComplete={onComplete} onBookmarkQuestion={onBookmarkQuestion} onShareQuestion={onShareQuestion} />;
      default:
        return <QuizTaskStep day={modifiedDay} session={session} onComplete={onComplete} onBookmarkQuestion={onBookmarkQuestion} onShareQuestion={onShareQuestion} />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Alternative formats banner (quiz and fillBlank only) */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm text-content-secondary">
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
                  ? 'bg-surface text-purple-700 shadow-sm font-medium'
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
                  ? 'bg-surface text-blue-700 shadow-sm font-medium'
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

const STEP_COMPONENTS: Record<string, React.ComponentType<any>> = {
  prePrompt: PrePromptStep,
  video: VideoStep,
  task1: TaskRouter,
  bossMilestone: BossMilestoneStep,
  openTask: OpenTaskStep,
  reflection: ReflectionStep,
};

// Step engagement tracking - what user has actually done
interface StepEngagement {
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
  const [showDayCompletionLimitModal, setShowDayCompletionLimitModal] = useState(false);
  const [showBookmarkToast, setShowBookmarkToast] = useState(false);
  const [celebratingStep, setCelebratingStep] = useState<{ name: string; index: number; total: number } | null>(null);
  const [showDayCompletion, setShowDayCompletion] = useState(false);

  const { user } = useAuthStore();

  // Track what user has actually engaged with
  const [stepEngagement, setStepEngagement] = useState<StepEngagement>({
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
    isRegenerating,
    hasStepEngagement,
    loadDayCoreContent,
    loadDayDeferredContent,
    isCoreLoaded,
    isDeferredLoaded,
    isDeferredLoading,
    isDayLoading,
    showRegenLimitModal,
    dismissRegenLimitModal,
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
  // SKIP this during regeneration - regenerateDayContent handles its own loading
  // SKIP if already loading - prevents race condition where this calls without forceRegenerate
  // while regenerateDayContent's call (with forceRegenerate) is still in progress
  useEffect(() => {
    if (activeSession && !isCoreLoaded && !isRegenerating && !isDayLoading) {
      // Content loading started by TodayPage, continues here
      // Each section will show its own loader until content arrives
      loadDayCoreContent(activeSession.currentDay).then(() => {
        loadDayDeferredContent(activeSession.currentDay).catch(console.error);
      }).catch(console.error);
    }
  }, [activeSession, isCoreLoaded, isRegenerating, isDayLoading, loadDayCoreContent, loadDayDeferredContent]);

  // Ensure deferred content is loaded even if core was already cached
  // This handles the case where TodayPage loaded core content but deferred failed silently
  useEffect(() => {
    if (activeSession && isCoreLoaded && !isDeferredLoaded && !isDeferredLoading && !isRegenerating) {
      loadDayDeferredContent(activeSession.currentDay).catch(console.error);
    }
  }, [activeSession, isCoreLoaded, isDeferredLoaded, isDeferredLoading, isRegenerating, loadDayDeferredContent]);

  // Get step order based on session's goalType
  const goalType = activeSession?.goalType;
  const trainingConfig = getTrainingConfig(goalType);
  const STEP_ORDER = trainingConfig.stepFlow as SessionStepType[];

  // Get available steps (filter out skipped ones)
  const availableSteps = STEP_ORDER.filter(step => {
    // Skip video step if no actual video OR if video was skipped
    // But show it while core content is still loading (video might not be populated yet)
    if (step === 'video') {
      if (!isCoreLoaded) return true; // Still loading - show the step
      // If core is loaded but video is still undefined, backend didn't send video → skip
      if (currentDay?.video === undefined) return false;
      const hasActualVideo = !!(currentDay?.video?.videoId || currentDay?.video?.backupVideo?.videoId);
      const videoSkipped = currentDay?.video?.skipped === true;
      if (!hasActualVideo || videoSkipped) return false;
    }
    // Always show bossMilestone step (renders as either boss milestone OR intensive practice)
    // The BossMilestoneStep component handles both project-based and practice-based curricula
    // Don't filter based on content existence - content loads async via deferred
    if (step === 'bossMilestone') {
      return true;
    }
    // Always show openTask step (renders as Real-World Challenge)
    // The OpenTaskStep component handles empty/loading states
    if (step === 'openTask') {
      return true;
    }
    return true;
  });

  // If current step is not in available steps, skip to next available
  useEffect(() => {
    if (availableSteps.length > 0 && !availableSteps.includes(currentStep)) {
      // Find the first available step that comes after the current step in STEP_ORDER
      const currentOrderIndex = STEP_ORDER.indexOf(currentStep);
      const nextAvailable = availableSteps.find(step =>
        STEP_ORDER.indexOf(step) > currentOrderIndex
      );
      setCurrentStep(nextAvailable || availableSteps[0]);
    }
  }, [currentStep, availableSteps, setCurrentStep]);

  // Track step views for analytics
  useEffect(() => {
    if (activeSession && currentDay && currentStep) {
      analyticsService.sessionStepViewed(
        activeSession.id,
        currentDay.day,
        currentStep
      );
    }
  }, [activeSession?.id, currentDay?.day, currentStep]);

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

  // Mark current day complete without navigating (used by gap session re-assessment)
  const markCurrentDayComplete = async () => {
    if (!activeSession || !currentDay) return;
    await submitPracticeProject(currentDay.day, 'Day completed via reflection', 4);
    resetSteps();
    setStepEngagement({ task1: false, bossMilestone: false, reflection: false });
  };

  // Proceed with day completion (after validation or skip)
  // Note: Visual celebration (confetti + achievement card) is handled by DayCompletionScreen
  // which shows BEFORE this function is called via onContinue callback
  const proceedWithCompletion = async () => {
    const hasNextDay = activeSession && currentDay && currentDay.day < activeSession.durationDays;

    if (hasNextDay) {
      setIsAdvancingDay(true);
      try {
        // 1. Mark current day as complete (unlocks next day)
        await submitPracticeProject(currentDay.day, 'Day completed via reflection', 4);

        // 2. Reset steps and engagement for new day
        resetSteps();
        setStepEngagement({ task1: false, bossMilestone: false, reflection: false });

        addSystemMessage(
          `🎉 Day ${currentDay.day} complete! Ready for the next day!`,
          'celebratory'
        );

        // 3. Navigate to today page - user clicks "Start Learning" to load next day
        setIsAdvancingDay(false);
        navigate('/today');
      } catch (error: any) {
        console.error('Failed to advance day:', error);
        setIsAdvancingDay(false);

        // Check if this is a daily day-completion limit error
        const errorData = error?.response?.data;
        if (errorData?.code === 'DAY_COMPLETION_LIMIT_REACHED') {
          addSystemMessage(
            `You've reached your daily learning limit (${errorData.currentLimit}/day). Come back tomorrow to continue!`,
            'supportive'
          );
          // Show upgrade modal for FREE users
          if (errorData?.requiresUpgrade) {
            setShowDayCompletionLimitModal(true);
          }
          // Stay on the current page — don't navigate away
          return;
        }

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
    if (step === 'task1') return hasStepEngagement(currentDay.day, 'task1');
    if (step === 'bossMilestone') return hasStepEngagement(currentDay.day, 'bossMilestone');
    if (step === 'reflection') return stepEngagement.reflection;
    // Other steps (prePrompt, video, etc.) are considered complete when viewed
    return true;
  };

  // Handle bookmarking a specific question from within a quiz
  const handleBookmarkQuestion = (questionData: { question: string; options?: string[]; correctAnswer?: string }) => {
    if (!activeSession || !currentDay) return;

    addBookmark({
      sessionId: activeSession.id,
      skillName: activeSession.skillName,
      dayNumber: currentDay.day,
      section: 'task1',
      sectionTitle: (currentDay.task1 as any)?.title || 'Practice Question',
      content: {
        taskTitle: (currentDay.task1 as any)?.title,
        taskQuestions: [questionData],
      },
    });

    setShowBookmarkToast(true);
    setTimeout(() => setShowBookmarkToast(false), 2000);
  };

  // Handle sharing a specific question to the community
  const { setShareData } = useCommunityShareStore();

  const handleShareQuestion = (questionData: { question: string; options?: string[]; correctAnswer?: string }) => {
    if (!activeSession || !currentDay) return;

    // Set the share data with the specific question
    setShareData({
      scope: 'question',
      sessionId: activeSession.id,
      skillName: activeSession.skillName,
      skillLevel: activeSession.skillLevel,
      durationDays: activeSession.durationDays,
      currentDay: activeSession.currentDay,
      progress: Math.round((activeSession.currentDay / activeSession.durationDays) * 100),
      dayNumber: currentDay.day,
      taskTitle: (currentDay.task1 as any)?.title || 'Practice Question',
      currentState: 'in-progress',
      questionData: questionData,
    });

    // Navigate to community page
    navigate('/community?share=true');
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

      // All work done — show day completion screen instead of proceeding directly
      setShowDayCompletion(true);
      return;
    }

    // Show micro-celebration if the user engaged with this step, then advance
    if (isStepEngaged(currentStep)) {
      const videoUnavailable = !currentDay?.video?.videoId && !currentDay?.video?.backupVideo?.videoId;
      const isProjectBased = !!(currentDay?.bossMilestone || currentDay?.hasBossProject);
      const stepLabel = getCelebrationLabel(currentStep, { isProjectBased, videoUnavailable });
      setCelebratingStep({
        name: stepLabel,
        index: currentStepIndex,
        total: availableSteps.length,
      });
      // completeStep will be called from StepCelebration's onComplete callback
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
            <div className="h-8 bg-surface-tertiary rounded w-3/4 mx-auto" />
            <div className="h-64 bg-surface-tertiary rounded-xl" />
            <div className="h-12 bg-surface-tertiary rounded-lg" />
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

  // Regenerating day content - show 10s loading screen then transition to page with loading spinners
  if (isRegenerating) {
    const dayNum = currentDay?.day || activeSession.currentDay;
    return (
      <FocusModeLayout>
        <GeneratingScreen
          inline
          steps={[
            { icon: Sparkles, text: 'Generating fresh content...', duration: 2500 },
            { icon: Target, text: 'Creating new exercises...', duration: 2500 },
            { icon: BookOpen, text: 'Finding a new video...', duration: 2500 },
            { icon: Trophy, text: 'Preparing your refreshed session...', duration: 2500 },
          ]}
          title={`Regenerating Day ${dayNum}`}
          subtitle={`Creating fresh ${activeSession.skillName} content just for you`}
          timeEstimate="This usually takes about 10 seconds"
        />
      </FocusModeLayout>
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
    // reflection still uses local state
    if (currentStep === 'reflection') {
      markStepEngaged('reflection');
    }
    // task1, bossMilestone engagement is automatically tracked
    // when user answers questions or types code

    // Track step completion for analytics
    if (activeSession && currentDay) {
      analyticsService.sessionStepCompleted(
        activeSession.id,
        currentDay.day,
        currentStep
      );
    }

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
            onBookmarkQuestion={currentStep === 'task1' ? handleBookmarkQuestion : undefined}
            onShareQuestion={currentStep === 'task1' ? handleShareQuestion : undefined}
          />
        </motion.div>
      </AnimatePresence>

      {/* Navigation footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-focus mx-auto px-3 sm:px-4">
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

            {/* Center buttons - Desktop only */}
            <div className="hidden md:flex items-center gap-2">
              {/* AI Tutor Button - available to all users with daily limits */}
              <button
                onClick={() => setShowAiTutor(true)}
                className="group flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl text-sm font-medium transition-all duration-300 bg-surface hover:bg-surface-secondary active:bg-surface-tertiary border border-border hover:border-purple-300 hover:shadow-md hover:shadow-purple-100"
              >
                <Sparkles className="w-4 h-4 text-purple-500 group-hover:text-purple-600" />
                <span className="text-content-secondary group-hover:text-content">Ask AI Tutor</span>
              </button>
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

      {/* Spacer for fixed footer - includes safe area for notched phones */}
      <div className="h-28 sm:h-24" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />

      {/* Incomplete Work Warning Modal */}
      <IncompleteWorkModal
        isOpen={showIncompleteModal}
        onClose={() => setShowIncompleteModal(false)}
        onProceedAnyway={() => {
          setShowIncompleteModal(false);
          setShowDayCompletion(true);
        }}
        incompleteItems={incompleteItems}
      />

      {/* Floating AI Tutor Button - Mobile only (draggable) */}
      <div className="md:hidden">
        <DraggableAiTutorButton
          onOpenTutor={() => setShowAiTutor(true)}
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

      {/* AI Tutor Upgrade Modal - Full Feature Comparison */}
      <FakePaywallModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        source="feature_gate"
        reason="ai_tutor_limit"
      />

      {/* Regeneration Limit Modal - Full Feature Comparison */}
      <FakePaywallModal
        isOpen={showRegenLimitModal}
        onClose={dismissRegenLimitModal}
        source="rate_limit"
        reason="day_regen_limit"
      />

      {/* Day Completion Limit Modal - Upgrade prompt for FREE users */}
      <FakePaywallModal
        isOpen={showDayCompletionLimitModal}
        onClose={() => setShowDayCompletionLimitModal(false)}
        source="rate_limit"
        reason="day_completion_limit"
      />

      {/* Bookmark Toast */}
      <AnimatePresence>
        {showBookmarkToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-xl shadow-lg">
              <Bookmark className="w-4 h-4 text-brand-400" />
              <span className="text-sm font-medium">Bookmarked! Find it in your Vault.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step completion micro-celebration */}
      <AnimatePresence>
        {celebratingStep && (
          <StepCelebration
            stepName={celebratingStep.name}
            stepIndex={celebratingStep.index}
            totalSteps={celebratingStep.total}
            onComplete={() => {
              completeStep(currentStep);
              setCelebratingStep(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Day completion celebration */}
      <AnimatePresence>
        {showDayCompletion && activeSession && currentDay && user && (
          <DayCompletionScreen
            session={activeSession}
            currentDay={currentDay}
            user={user}
            onContinue={async () => {
              // Keep overlay visible during API call to avoid session page flash
              await proceedWithCompletion();
              // Only dismiss after navigation (or on error where we stay on page)
              setShowDayCompletion(false);
            }}
            onMarkComplete={markCurrentDayComplete}
            isLoading={isAdvancingDay}
          />
        )}
      </AnimatePresence>
    </FocusModeLayout>
  );
}
