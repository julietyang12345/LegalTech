import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Play,
  Check,
  Lock,
  Pause,
  Zap,
  Clock,
  Archive,
  Plus,
  FastForward,
  Loader2,
  CheckCircle,
  SkipForward,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { useAuthStore } from '@/stores/authStore';
import { Button, Card, ProgressBar } from '@/components/common';
import { SessionMode, QuotaTier, DayStatus, CurriculumDay } from '@/types';

// Day card in timeline with two-phase support
function DayCard({
  day,
  dayData,
  onExpand,
  isExpanded,
  onStartDay,
  onSkipTest,
  isLoading,
}: {
  day: number;
  dayData: CurriculumDay;
  onExpand: () => void;
  isExpanded: boolean;
  onStartDay: () => void;
  onSkipTest: () => void;
  isLoading: boolean;
}) {
  const status = dayData?.status || DayStatus.LOCKED;
  const isLocked = status === DayStatus.LOCKED;
  const isUnlockable = status === DayStatus.UNLOCKABLE;
  const isInProgress = status === DayStatus.IN_PROGRESS;
  const isCompleted = status === DayStatus.COMPLETED;
  const isSkipped = status === DayStatus.SKIPPED;

  const getStatusIcon = () => {
    if (isCompleted) return <CheckCircle className="w-5 h-5" />;
    if (isSkipped) return <SkipForward className="w-5 h-5" />;
    if (isLoading) return <Loader2 className="w-5 h-5 animate-spin" />;
    if (isLocked) return <Lock className="w-4 h-4" />;
    return <span className="font-semibold">{day}</span>;
  };

  const getStatusStyles = () => {
    if (isCompleted || isSkipped) return 'bg-focus-500 text-white';
    if (isInProgress) return 'bg-brand-500 text-white';
    if (isUnlockable) return 'bg-brand-100 text-brand-700 ring-2 ring-brand-300';
    return 'bg-gray-200 text-gray-400';
  };

  return (
    <Card
      variant={isInProgress || isUnlockable ? 'active' : 'default'}
      className={clsx(
        'transition-all duration-200',
        isLocked && 'opacity-60',
        (isInProgress || isUnlockable) && 'ring-2 ring-brand-200',
        !isLocked && 'cursor-pointer'
      )}
      onClick={isLocked ? undefined : onExpand}
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Status icon */}
            <div
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center',
                getStatusStyles()
              )}
            >
              {getStatusIcon()}
            </div>

            {/* Day info */}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-gray-900">
                  Day {day}: {dayData?.title?.split(':')[1]?.trim() || dayData?.title || 'Loading...'}
                </h3>
                {isSkipped && (
                  <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                    Mastered
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                ~{dayData?.skeleton?.estimatedMinutes || dayData?.estimatedMinutes || 45} min
              </p>
            </div>
          </div>

          {/* Expand chevron or action buttons */}
          {!isLocked && (
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </motion.div>
          )}
        </div>

        {/* Expanded content - skeleton preview */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-4 mt-4 border-t border-gray-100 space-y-4">
                {/* Objectives */}
                {dayData?.objectives && dayData.objectives.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-2">Learning objectives:</p>
                    <ul className="space-y-1">
                      {dayData.objectives.map((obj: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                          {obj}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Skeleton preview (Phase 1 content) */}
                {dayData?.skeleton && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-600">What you'll learn:</p>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="p-2 bg-gray-50 rounded text-sm">
                        <span className="text-gray-500">Video:</span>{' '}
                        <span className="text-gray-700">{dayData.skeleton.videoTitle}</span>
                      </div>
                      <div className="p-2 bg-gray-50 rounded text-sm">
                        <span className="text-gray-500">Task:</span>{' '}
                        <span className="text-gray-700">{dayData.skeleton.task1Preview}</span>
                      </div>
                      <div className="p-2 bg-gray-50 rounded text-sm">
                        <span className="text-gray-500">Practice:</span>{' '}
                        <span className="text-gray-700">{dayData.skeleton.practicePreview}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Full content preview if loaded */}
                {dayData?.detailsLoaded && dayData.video && (
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-2">Today's content:</p>
                    <ul className="space-y-1">
                      <li className="text-sm text-gray-700 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                        {dayData.video.title}
                      </li>
                      {dayData.task1 && (
                        <li className="text-sm text-gray-700 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                          {dayData.task1.title}
                        </li>
                      )}
                      {dayData.practiceProject && (
                        <li className="text-sm text-gray-700 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                          {dayData.practiceProject.title}
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Boss milestone if present */}
                {dayData?.bossMilestone && (
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <p className="text-sm font-medium text-purple-700 flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Boss Milestone: {dayData.bossMilestone.description}
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                {(isUnlockable || isInProgress) && !isCompleted && !isSkipped && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartDay();
                      }}
                      disabled={isLoading}
                      leftIcon={isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    >
                      {isLoading ? 'Generating...' : dayData?.detailsLoaded ? 'Continue Day' : 'Start Day'}
                    </Button>
                    {dayData?.skipTest && isInProgress && (
                      <Button
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSkipTest();
                        }}
                        leftIcon={<FastForward className="w-4 h-4" />}
                      >
                        Skip Test
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

// Life Happens Modal
function LifeHappensModal({
  isOpen,
  onClose,
  onSelectMode,
  currentMode,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectMode: (mode: SessionMode) => void;
  currentMode: SessionMode;
}) {
  if (!isOpen) return null;

  const modes = [
    {
      mode: SessionMode.SPRINT,
      icon: Zap,
      title: 'Sprint Mode',
      description: 'Condense the remaining days. Core concepts only, practice tasks go to Backlog.',
      color: 'from-alert-500 to-orange-500',
    },
    {
      mode: SessionMode.EXTENDED,
      icon: Clock,
      title: 'Extend Mode',
      description: 'Add extra days for more practice. Take your time to master each concept.',
      color: 'from-blue-500 to-cyan-500',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl"
      >
        <h2 className="text-xl font-bold text-gray-900 mb-2">Life Happens 💙</h2>
        <p className="text-gray-600 mb-6">
          No guilt here. Choose how you'd like to adjust your learning pace.
        </p>

        <div className="space-y-3">
          {modes.map(({ mode, icon: Icon, title, description, color }) => (
            <button
              key={mode}
              onClick={() => {
                onSelectMode(mode);
                onClose();
              }}
              className={clsx(
                'w-full p-4 rounded-xl border-2 text-left transition-all',
                currentMode === mode
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <div className="flex items-start gap-3">
                <div className={clsx('w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center', color)}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{title}</h3>
                  <p className="text-sm text-gray-600">{description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => onSelectMode(SessionMode.NORMAL)}>
            Back to Normal
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// Skip Test Modal (Multiple Choice)
function SkipTestModal({
  isOpen,
  onClose,
  dayNumber,
  skipTest,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  dayNumber: number;
  skipTest: {
    questionSets?: Array<Array<{ question: string; options: string[]; correctIndex: number }>>;
    currentSetIndex?: number;
    passThreshold?: number;
  } | undefined;
  onSubmit: (answers: number[]) => void;
}) {
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get current questions from questionSets
  const questions = useMemo(() => {
    if (!skipTest?.questionSets || skipTest.questionSets.length === 0) return [];
    const setIndex = skipTest.currentSetIndex ?? 0;
    return skipTest.questionSets[setIndex] || [];
  }, [skipTest]);

  const passThreshold = skipTest?.passThreshold ?? 3;

  useEffect(() => {
    if (isOpen && questions.length > 0) {
      setSelectedAnswers(new Array(questions.length).fill(null));
    }
  }, [isOpen, questions]);

  if (!isOpen || !skipTest || questions.length === 0) return null;

  const allAnswered = selectedAnswers.every(a => a !== null);

  const handleSubmit = async () => {
    if (!allAnswered) return;
    setIsSubmitting(true);
    try {
      onSubmit(selectedAnswers as number[]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
            <FastForward className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Skip Test - Day {dayNumber}</h2>
            <p className="text-sm text-gray-600">Answer all questions correctly to skip this day</p>
          </div>
        </div>

        <div className="space-y-6 mb-6">
          {questions.map((q, qIndex) => (
            <div key={qIndex} className="space-y-3">
              <div className="flex items-start gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">
                  {qIndex + 1}
                </span>
                <p className="text-gray-800 font-medium">{q.question}</p>
              </div>
              <div className="grid gap-2 pl-8">
                {q.options.map((option, optIndex) => (
                  <button
                    key={optIndex}
                    onClick={() => {
                      const newAnswers = [...selectedAnswers];
                      newAnswers[qIndex] = optIndex;
                      setSelectedAnswers(newAnswers);
                    }}
                    className={clsx(
                      'w-full text-left px-4 py-3 rounded-lg border-2 transition-all',
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
          ))}
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            Must get all {passThreshold} correct to skip
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !allAnswered}
              leftIcon={isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              {isSubmitting ? 'Checking...' : 'Submit Answers'}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Backlog drawer
function BacklogDrawer({ isOpen, onClose, tasks }: {
  isOpen: boolean;
  onClose: () => void;
  tasks: string[];
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed right-0 top-0 bottom-0 w-80 bg-white shadow-xl z-50 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Archive className="w-5 h-5 text-gray-600" />
                <h2 className="font-semibold text-gray-900">Backlog</h2>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                ×
              </button>
            </div>

            {tasks.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No tasks in backlog. Tasks moved here during Sprint Mode will appear here.
              </p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((task, i) => (
                  <li key={i} className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                    {task}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function PlanPage() {
  const navigate = useNavigate();
  const {
    activeSession,
    updateSession,
    fetchActiveSession,
    loadDayContentSplit,
    submitSkipTest,
    forceSkipDay,
    isDayLoading,
    dayLoadingNumber,
    error,
    clearError,
  } = useSessionStore();
  const { hasTierAccess } = useAuthStore();
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [showLifeHappens, setShowLifeHappens] = useState(false);
  const [showBacklog, setShowBacklog] = useState(false);
  const [skipTestDay, setSkipTestDay] = useState<number | null>(null);
  const [skipTestResult, setSkipTestResult] = useState<{ passed: boolean; message: string; suggestion?: string; allSetsExhausted?: boolean } | null>(null);

  useEffect(() => {
    if (!activeSession) {
      fetchActiveSession();
    }
  }, [activeSession, fetchActiveSession]);

  const handleModeChange = async (mode: SessionMode) => {
    if (!activeSession) return;
    await updateSession(activeSession.id, { mode });
  };

  const handleStartDay = async (dayNumber: number) => {
    try {
      // Load core content first (fast), deferred loads in background
      await loadDayContentSplit(dayNumber);
      navigate(`/session/${activeSession?.id}`);
    } catch (err) {
      console.error('Failed to start day:', err);
    }
  };

  const handleOpenSkipTest = (dayNumber: number) => {
    setSkipTestDay(dayNumber);
    setSkipTestResult(null);
  };

  const handleSubmitSkipTest = async (answers: number[]) => {
    if (skipTestDay === null) return;

    try {
      const result = await submitSkipTest(skipTestDay, answers);
      setSkipTestResult({
        passed: result.passed,
        message: result.passed
          ? `Day ${skipTestDay} skipped! You demonstrated mastery.`
          : `${result.correctCount}/${result.totalQuestions} correct. Need ${result.passThreshold} to pass.`,
        suggestion: result.suggestion,
        allSetsExhausted: result.allSetsExhausted,
      });

      if (result.passed) {
        // Close modal after a delay to show success
        setTimeout(() => {
          setSkipTestDay(null);
          setSkipTestResult(null);
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to submit skip test:', err);
    }
  };

  const handleForceSkip = async () => {
    if (skipTestDay === null) return;

    try {
      await forceSkipDay(skipTestDay);
      setSkipTestDay(null);
      setSkipTestResult(null);
    } catch (err) {
      console.error('Failed to force skip:', err);
    }
  };

  const getSkipTestForDay = (dayNumber: number) => {
    const day = activeSession?.curriculum.days.find(d => d.day === dayNumber);
    return day?.skipTest;
  };

  if (!activeSession) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Card className="p-8 text-center">
          <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Active Curriculum</h2>
          <p className="text-gray-600 mb-6">
            Create a curriculum to see your learning timeline here.
          </p>
          <Button onClick={() => navigate('/start')} leftIcon={<Plus className="w-4 h-4" />}>
            Create Curriculum
          </Button>
        </Card>
      </div>
    );
  }

  const { curriculum, currentDay } = activeSession;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Learning Plan</h1>
          <p className="text-gray-600">{activeSession.skillName}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowBacklog(true)}
            leftIcon={<Archive className="w-4 h-4" />}
          >
            Backlog
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowLifeHappens(true)}
          >
            Life Happens
          </Button>
        </div>
      </div>

      {/* Progress overview */}
      <Card className="mb-6">
        <div className="p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Overall Progress</span>
            <span className="text-sm text-gray-500">
              Day {currentDay} of {activeSession.durationDays}
            </span>
          </div>
          <ProgressBar value={currentDay} max={activeSession.durationDays} />
          {activeSession.mode !== SessionMode.NORMAL && (
            <p className="mt-2 text-sm text-alert-600">
              📍 Currently in {activeSession.mode} mode
            </p>
          )}
        </div>
      </Card>

      {/* Error display */}
      {error && (
        <Card className="mb-4 p-4 bg-red-50 border-red-200">
          <div className="flex items-center justify-between">
            <p className="text-red-700 text-sm">{error}</p>
            <button onClick={clearError} className="text-red-500 hover:text-red-700">
              ×
            </button>
          </div>
        </Card>
      )}

      {/* Timeline */}
      <div className="space-y-3">
        {curriculum.days.map((dayData) => {
          const day = dayData.day;

          return (
            <DayCard
              key={day}
              day={day}
              dayData={dayData}
              isExpanded={expandedDay === day}
              onExpand={() => setExpandedDay(expandedDay === day ? null : day)}
              onStartDay={() => handleStartDay(day)}
              onSkipTest={() => handleOpenSkipTest(day)}
              isLoading={isDayLoading && dayLoadingNumber === day}
            />
          );
        })}

        {/* Boss Projects */}
        {curriculum.bossProjects.map((boss) => (
          <Card
            key={`boss-${boss.day}`}
            className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200"
          >
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 
                               flex items-center justify-center text-white">
                  🏆
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Boss Project: {boss.title}</h3>
                  <p className="text-sm text-gray-600">
                    Day {boss.day} • Combines days {boss.combinesDays.join(', ')}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Create new curriculum button (if PRO+) */}
      {hasTierAccess(QuotaTier.PRO) && (
        <div className="mt-8 pt-8 border-t border-gray-200">
          <Button
            variant="ghost"
            onClick={() => navigate('/start')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create Another Curriculum
          </Button>
        </div>
      )}

      {/* Modals */}
      <LifeHappensModal
        isOpen={showLifeHappens}
        onClose={() => setShowLifeHappens(false)}
        onSelectMode={handleModeChange}
        currentMode={activeSession.mode}
      />

      <BacklogDrawer
        isOpen={showBacklog}
        onClose={() => setShowBacklog(false)}
        tasks={[]} // Would come from session state
      />

      <SkipTestModal
        isOpen={skipTestDay !== null}
        onClose={() => setSkipTestDay(null)}
        dayNumber={skipTestDay || 1}
        skipTest={skipTestDay ? getSkipTestForDay(skipTestDay) : undefined}
        onSubmit={handleSubmitSkipTest}
      />

      {/* Skip test result toast */}
      <AnimatePresence>
        {skipTestResult && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={clsx(
              'fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-md',
              skipTestResult.passed ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'
            )}
          >
            <p className="font-medium">{skipTestResult.message}</p>
            {skipTestResult.suggestion && (
              <p className="text-sm mt-2 opacity-90">{skipTestResult.suggestion}</p>
            )}
            {!skipTestResult.passed && (
              <div className="flex gap-2 mt-3">
                {skipTestResult.allSetsExhausted ? (
                  <>
                    <button
                      onClick={() => {
                        setSkipTestDay(null);
                        setSkipTestResult(null);
                        if (skipTestDay) handleStartDay(skipTestDay);
                      }}
                      className="px-3 py-1 bg-white hover:bg-white/90 text-amber-600 rounded text-sm font-medium transition-colors"
                    >
                      Complete Day
                    </button>
                    <button
                      onClick={handleForceSkip}
                      className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors"
                    >
                      Skip Anyway
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setSkipTestResult(null)}
                      className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={() => {
                        setSkipTestDay(null);
                        setSkipTestResult(null);
                        if (skipTestDay) handleStartDay(skipTestDay);
                      }}
                      className="px-3 py-1 bg-white hover:bg-white/90 text-amber-600 rounded text-sm font-medium transition-colors"
                    >
                      Continue Day
                    </button>
                  </>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
