import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar,
  Play,
  Check,
  Lock,
  Clock,
  Plus,
  FastForward,
  Loader2,
  SkipForward,
  Target,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { useAuthStore } from '@/stores/authStore';
import { Button, Card, ProgressBar } from '@/components/common';
import { QuotaTier, DayStatus, CurriculumDay } from '@/types';

// Timeline Day Item - clean timeline format
function TimelineDayItem({
  day,
  dayData,
  isLast,
  isCurrentDay,
}: {
  day: number;
  dayData: CurriculumDay;
  isLast: boolean;
  isCurrentDay: boolean;
}) {
  const status = dayData?.status || DayStatus.LOCKED;
  const isLocked = status === DayStatus.LOCKED;
  const isUnlockable = status === DayStatus.UNLOCKABLE;
  const isInProgress = status === DayStatus.IN_PROGRESS;
  const isCompleted = status === DayStatus.COMPLETED;
  const isSkipped = status === DayStatus.SKIPPED;

  // Get data from dayData
  const title = dayData?.title?.includes(':')
    ? dayData.title.split(':')[1]?.trim()
    : dayData?.title || 'Loading...';

  const teaser = (dayData as any)?.teaser ||
                 (dayData as any)?.subtitle ||
                 dayData?.objectives?.[0] ||
                 '';

  const skills = (dayData as any)?.skills || [];
  const estimatedMinutes = dayData?.estimatedMinutes || 45;

  const getCircleStyles = () => {
    if (isCompleted || isSkipped) return 'bg-green-500 text-white border-green-500';
    if (isInProgress || isCurrentDay) return 'bg-brand-500 text-white border-brand-500';
    if (isUnlockable) return 'bg-white text-brand-600 border-brand-500 border-2';
    return 'bg-gray-100 text-gray-400 border-gray-200';
  };

  const getLineStyles = () => {
    if (isCompleted || isSkipped) return 'bg-green-300';
    return 'bg-gray-200';
  };

  return (
    <div className="relative flex gap-4">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        {/* Circle with number */}
        <div
          className={clsx(
            'w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm border-2 z-10 flex-shrink-0',
            getCircleStyles()
          )}
        >
          {isCompleted ? (
            <Check className="w-5 h-5" />
          ) : isSkipped ? (
            <SkipForward className="w-4 h-4" />
          ) : isLocked ? (
            <Lock className="w-4 h-4" />
          ) : (
            day
          )}
        </div>
        {/* Vertical line */}
        {!isLast && (
          <div className={clsx('w-0.5 flex-1 min-h-[20px]', getLineStyles())} />
        )}
      </div>

      {/* Content card */}
      <div
        className={clsx(
          'flex-1 pb-6 transition-all',
          isLocked && 'opacity-50'
        )}
      >
        <div
          className={clsx(
            'p-4 rounded-xl border transition-all',
            (isInProgress || isCurrentDay) && 'bg-brand-50 border-brand-200 shadow-sm',
            isCompleted && 'bg-green-50 border-green-200',
            isSkipped && 'bg-purple-50 border-purple-200',
            !isInProgress && !isCurrentDay && !isCompleted && !isSkipped && 'bg-white border-gray-200 hover:border-gray-300'
          )}
        >
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              {/* Day label */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Day {day}
                </span>
                {isSkipped && (
                  <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                    Mastered
                  </span>
                )}
              </div>

              {/* Title */}
              <h3 className="font-semibold text-gray-900 text-lg">
                {title}
              </h3>

              {/* Teaser / Learning objective */}
              {teaser && (
                <p className="text-gray-600 mt-1 text-sm">
                  {teaser}
                </p>
              )}
            </div>

            {/* Time */}
            <div className="flex items-center gap-1.5 text-gray-500 flex-shrink-0">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">{estimatedMinutes}m</span>
            </div>
          </div>

          {/* Skills tags */}
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {skills.map((skill: string, i: number) => (
                <span
                  key={i}
                  className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// Skip Test Modal
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
        className="bg-white rounded-2xl p-4 sm:p-6 max-w-2xl w-[calc(100vw-2rem)] sm:w-full shadow-xl max-h-[90vh] overflow-y-auto"
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

// Improvement Areas Section - shows current improve areas set during reflections
function ImproveAreasSection({
  improvementAreas,
  onClear,
}: {
  improvementAreas: string[];
  onClear: () => void;
}) {
  if (improvementAreas.length === 0) return null;

  return (
    <Card className="mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-gray-900">Your Improvement Areas</span>
          </div>
          <button
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Clear all
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {improvementAreas.map((area) => (
            <span
              key={area}
              className="px-3 py-1 bg-white/70 text-purple-700 rounded-full text-sm border border-purple-200"
            >
              {area}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Set during daily reflections. These shape examples in upcoming days.
        </p>
      </div>
    </Card>
  );
}

export function PlanPage() {
  const navigate = useNavigate();
  const {
    activeSession,
    fetchActiveSession,
    updateSession,
    submitSkipTest,
    error,
    clearError,
  } = useSessionStore();
  const { hasTierAccess } = useAuthStore();
  const [skipTestDay, setSkipTestDay] = useState<number | null>(null);
  const [skipTestResult, setSkipTestResult] = useState<{ passed: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!activeSession) {
      fetchActiveSession();
    }
  }, [activeSession, fetchActiveSession]);

  const handleStartLearning = () => {
    // Navigate to today page which shows day preview
    navigate('/today');
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
      });

      if (result.passed) {
        setTimeout(() => {
          setSkipTestDay(null);
          setSkipTestResult(null);
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to submit skip test:', err);
    }
  };

  const getSkipTestForDay = (dayNumber: number) => {
    const day = activeSession?.curriculum.days.find(d => d.day === dayNumber);
    return day?.skipTest;
  };

  const handleClearImproveAreas = async () => {
    if (!activeSession) return;
    try {
      await updateSession(activeSession.id, { improvementAreas: [] });
    } catch (err) {
      console.error('Failed to clear improve areas:', err);
    }
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
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Learning Path Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Your {activeSession.durationDays}-Day Learning Path
        </h1>
        <p className="text-gray-600">
          {activeSession.skillName} • Day {currentDay} of {activeSession.durationDays}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Progress</span>
          <span>{activeSession.durationDays ? Math.round(((currentDay - 1) / activeSession.durationDays) * 100) : 0}% complete</span>
        </div>
        <ProgressBar value={currentDay - 1} max={activeSession.durationDays} />
      </div>

      {/* Improvement Areas Section - TODO: implement FocusAreasSection component */}

      {/* Error display */}
      {error && (
        <Card className="mb-6 p-4 bg-red-50 border-red-200">
          <div className="flex items-center justify-between">
            <p className="text-red-700 text-sm">{error}</p>
            <button onClick={clearError} className="text-red-500 hover:text-red-700">
              ×
            </button>
          </div>
        </Card>
      )}

      {/* Timeline */}
      <div className="relative">
        {curriculum.days.map((dayData, index) => (
          <TimelineDayItem
            key={dayData.day}
            day={dayData.day}
            dayData={dayData}
            isLast={index === curriculum.days.length - 1}
            isCurrentDay={dayData.day === currentDay}
          />
        ))}
      </div>

      {/* Start Learning CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 p-6 bg-gradient-to-r from-brand-50 to-focus-50 rounded-2xl border border-brand-200"
      >
        <div className="text-center">
          <p className="text-gray-600 mb-3">Ready to begin your journey?</p>
          <Button
            size="lg"
            onClick={handleStartLearning}
            leftIcon={<Play className="w-5 h-5" />}
          >
            Start Session
          </Button>
        </div>
      </motion.div>

      {/* Create new curriculum button */}
      {hasTierAccess(QuotaTier.PRO) && (
        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <Button
            variant="ghost"
            onClick={() => navigate('/start')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create another curriculum
          </Button>
        </div>
      )}

      {/* Skip Test Modal */}
      {skipTestDay !== null && (
        <SkipTestModal
          isOpen={skipTestDay !== null}
          onClose={() => {
            setSkipTestDay(null);
            setSkipTestResult(null);
          }}
          dayNumber={skipTestDay}
          skipTest={getSkipTestForDay(skipTestDay)}
          onSubmit={handleSubmitSkipTest}
        />
      )}
    </div>
  );
}
