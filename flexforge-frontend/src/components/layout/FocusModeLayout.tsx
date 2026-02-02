import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { X, Clock } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { StepPills } from '@/components/common';
import { CourseSidebar } from '@/components/session/CourseSidebar';
import type { SessionStep } from '@/types';

// Session flow steps
const STEPS: SessionStep[] = [
  'prePrompt',
  'video',
  'foundationCards',
  'task1',
  'bossMilestone',
  'openTask',
  'reflection',
];

interface FocusModeLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

function ExitConfirmModal({ isOpen, onClose, onConfirm }: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-xl"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Leave session?
        </h3>
        <p className="text-gray-600 mb-6">
          Your progress has been saved. You can continue later from where you left off.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Stay
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
          >
            Exit Session
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function PresenceBar() {
  const navigate = useNavigate();
  const [showExitModal, setShowExitModal] = useState(false);
  const {
    activeSession,
    currentStep,
    completedSteps,
    currentDay,
    setCurrentStep,
    isCoreLoaded,
  } = useSessionStore();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showTimer, setShowTimer] = useState(true);

  // Timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Check if curriculum is project-based (has boss projects)
  const isProjectBased = activeSession?.curriculum?.metadata?.isProjectBased !== false &&
    (activeSession?.curriculum?.bossProjects?.length ?? 0) > 0;

  // Check if video is available for this day
  const hasVideo = !!(currentDay?.video?.videoId || currentDay?.video?.backupVideo?.videoId);
  const isLanguageLearning = activeSession?.curriculum?.metadata?.isLanguageLearning;
  const videoStrategy = (currentDay as any)?.videoStrategy;
  const videoSkipped = currentDay?.video?.skipped === true;
  const videoUnavailable = isLanguageLearning || videoStrategy === 'skip' || !hasVideo || videoSkipped;

  // Filter steps based on current day
  const availableSteps = STEPS.filter(step => {
    // Skip video step when video is unavailable - foundationCards step handles learning content
    if (step === 'video') {
      if (videoUnavailable) return false;
    }
    // Skip foundationCards only if core is loaded AND no cards present
    // While loading, always show the step (component will show its own loader)
    if (step === 'foundationCards') {
      if (!isCoreLoaded) return true; // Still loading, show the step
      const hasCards = (currentDay?.foundationCards && currentDay.foundationCards.length > 0) ||
                       (currentDay?.languageFoundationCards && currentDay.languageFoundationCards.length > 0);
      if (!hasCards) return false;
    }
    // Skip openTask for project-based curricula (they have bossMilestone instead)
    // or when openTask content is not available
    if (step === 'openTask') {
      if (isProjectBased) return false;
      const hasOpenTask = !!(currentDay?.openTask || (currentDay as any)?.deferredContent?.openTask);
      if (!hasOpenTask) return false;
    }
    return true;
  });

  const handleExit = () => {
    navigate('/today');
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="relative h-12 sm:h-14">
          {/* Exit button - fixed to left corner */}
          <button
            onClick={() => setShowExitModal(true)}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Step pills - centered in full width */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="overflow-x-auto no-scrollbar px-12">
              <StepPills
                steps={availableSteps}
                currentStep={currentStep}
                completedSteps={completedSteps}
                onStepClick={(step) => setCurrentStep(step)}
                isProjectBased={isProjectBased}
                videoUnavailable={videoUnavailable}
              />
            </div>
          </div>

          {/* Right side: timer (desktop only) */}
          <div className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-3">
            {/* Topic */}
            <span className="hidden lg:block text-sm text-gray-600 max-w-[200px] truncate">
              Day {currentDay?.day}: {currentDay?.title?.split(':')[1]?.trim() || 'Loading...'}
            </span>

            {/* Timer */}
            {showTimer && (
              <button
                onClick={() => setShowTimer(false)}
                className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded transition-colors"
              >
                <Clock className="w-4 h-4" />
                {formatTime(elapsedSeconds)}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <motion.div
            className="h-full bg-brand-500"
            initial={{ width: 0 }}
            animate={{
              width: `${(completedSteps.length / availableSteps.length) * 100}%`,
            }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </header>

      <ExitConfirmModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onConfirm={handleExit}
      />
    </>
  );
}

export function FocusModeLayout({ children, showSidebar = true }: FocusModeLayoutProps) {
  const { startDay, activeSession, loadDayContentSplit, canStartDay } = useSessionStore();

  const handleDayClick = async (dayNumber: number) => {
    if (!activeSession || !canStartDay(dayNumber)) return;

    // Load core content first (fast), deferred loads in background
    const day = activeSession.curriculum.days.find(d => d.day === dayNumber);
    if (day && !day.detailsLoaded) {
      await loadDayContentSplit(dayNumber);
    }
    startDay(dayNumber);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-sm sm:text-base">
      <PresenceBar />

      {/* Course Sidebar */}
      {showSidebar && (
        <CourseSidebar
          onDayClick={handleDayClick}
        />
      )}

      {/* Content area - always centered */}
      <main className="max-w-focus mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      </main>

    </div>
  );
}
