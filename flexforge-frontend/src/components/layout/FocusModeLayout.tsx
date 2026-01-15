import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { X, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import { StepPills } from '@/components/common';
import { CompanionChat, CompanionBubble } from '@/components/companion';
import { CourseSidebar } from '@/components/session/CourseSidebar';
import type { SessionStep } from '@/types';

// New flow with foundation cards
const STEPS_NEW: SessionStep[] = [
  'prePrompt',
  'video',
  'foundationCards',
  'task1',
  'bossMilestone',
  'reflection',
];

// Legacy flow for backward compatibility
const STEPS_LEGACY: SessionStep[] = [
  'prePrompt',
  'video',
  'activeRecall',
  'memoryBridge',
  'conceptCheck',
  'task1',
  'bossMilestone',
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
  const { toggleChat, currentMood } = useCompanionStore();
  const {
    activeSession,
    currentStep,
    completedSteps,
    currentDay,
    setCurrentStep,
  } = useSessionStore();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showTimer, setShowTimer] = useState(true);

  // Timer effect
  useState(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Check if curriculum is project-based
  const isProjectBased = activeSession?.curriculum?.metadata?.isProjectBased !== false &&
    (activeSession?.curriculum?.bossProjects?.length ?? 0) > 0;

  // Select step order based on whether foundationCards exist
  const hasFoundationCards = currentDay?.foundationCards && currentDay.foundationCards.length > 0;
  const baseSteps = hasFoundationCards ? STEPS_NEW : STEPS_LEGACY;

  // Filter steps based on current day
  const availableSteps = baseSteps.filter(step => {
    if (step === 'memoryBridge' && currentDay?.day === 1) return false;
    // Show bossMilestone step if project-based (with milestone or hasBossProject) or practice-based (with practice project)
    if (step === 'bossMilestone') {
      if (isProjectBased) return !!currentDay?.bossMilestone || !!currentDay?.hasBossProject;
      return !!currentDay?.deferredContent?.practiceProject;
    }
    return true;
  });

  const handleExit = () => {
    navigate('/today');
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-focus mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Exit button */}
            <button
              onClick={() => setShowExitModal(true)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Step pills */}
            <StepPills
              steps={availableSteps}
              currentStep={currentStep}
              completedSteps={completedSteps}
              onStepClick={(step) => setCurrentStep(step)}
              isProjectBased={isProjectBased}
            />

            {/* Right side: topic, timer, companion */}
            <div className="flex items-center gap-3">
              {/* Topic */}
              <span className="hidden sm:block text-sm text-gray-600">
                Day {currentDay?.day}: {currentDay?.title?.split(':')[1]?.trim() || 'Loading...'}
              </span>

              {/* Timer */}
              {showTimer && (
                <button
                  onClick={() => setShowTimer(false)}
                  className="flex items-center gap-1 px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded transition-colors"
                >
                  <Clock className="w-4 h-4" />
                  {formatTime(elapsedSeconds)}
                </button>
              )}

              {/* Companion toggle */}
              <button
                onClick={toggleChat}
                className={clsx(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                  'bg-gradient-to-br from-brand-400 to-brand-500 text-white',
                  'hover:scale-110'
                )}
              >
                <span className="text-lg">🦊</span>
              </button>
            </div>
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
    <div className="min-h-screen bg-gray-50">
      <PresenceBar />

      {/* Course Sidebar */}
      {showSidebar && (
        <CourseSidebar
          onDayClick={handleDayClick}
        />
      )}

      {/* Content area - always centered */}
      <main className="max-w-focus mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      </main>

      {/* Companion (always available) */}
      <CompanionChat />
    </div>
  );
}
