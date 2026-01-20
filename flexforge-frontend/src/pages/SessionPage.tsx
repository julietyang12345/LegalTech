import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Zap, X, CheckCircle, XCircle, Loader2, Shuffle, Code2, HelpCircle, FileText, Sparkles, Target, BookOpen, Trophy, MessageCircle, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import { useAuthStore } from '@/stores/authStore';
import { FocusModeLayout } from '@/components/layout';
import { Button, GeneratingScreen } from '@/components/common';
import { AiTutorPanel } from '@/components/session/AiTutorPanel';
import { QuotaTier } from '@/types';
import type { CurriculumDay } from '@/types';

// Import step components
import { PrePromptStep } from '@/components/session/PrePromptStep';
import { VideoStep } from '@/components/session/VideoStep';
import { FoundationCardsStep } from '@/components/session/FoundationCardsStep';
import { TaskStep } from '@/components/session/TaskStep';
import { QuizTaskStep, FillBlankTaskStep } from '@/components/session/AlternativeTaskSteps';
import { SectionTaskStep } from '@/components/session/SectionTaskStep';
import { BossMilestoneStep } from '@/components/session/BossMilestoneStep';
import { ReflectionStep } from '@/components/session/ReflectionStep';

import type { QuizTask, FillBlankTask } from '@/types';

import type { SessionStep as SessionStepType } from '@/types';

// Skip Test Modal (Multiple Choice) - Enhanced UI
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
  const { submitSkipTest, forceSkipDay } = useSessionStore();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForceSkipping, setIsForceSkipping] = useState(false);
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
    return questionSet.filter(q => q.options && Array.isArray(q.options) && q.options.length > 0);
  }, [day.skipTest]);

  const passThreshold = day.skipTest?.passThreshold ?? 3;

  useEffect(() => {
    if (isOpen && questions.length > 0) {
      setSelectedAnswers(new Array(questions.length).fill(null));
      setCurrentQuestion(0);
      setResult(null);
    }
  }, [isOpen, questions.length]);

  if (!isOpen) return null;

  // If skipTest not loaded or no questions, show message
  if (!day.skipTest || questions.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl text-center"
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
            <Zap className="w-8 h-8 text-amber-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Skip Test Not Available
          </h3>
          <p className="text-gray-500 mb-6 leading-relaxed">
            The skip test for Day {day.day} hasn't been generated yet. Complete the lesson to progress.
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Continue with lesson
          </button>
        </motion.div>
      </div>
    );
  }

  const allAnswered = selectedAnswers.every(a => a !== null);
  const currentQ = questions[currentQuestion];
  const isLastQuestion = currentQuestion === questions.length - 1;

  const handleAnswerSelect = (optIndex: number) => {
    const newAnswers = [...selectedAnswers];
    newAnswers[currentQuestion] = optIndex;
    setSelectedAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!allAnswered) return;

    setIsSubmitting(true);
    try {
      const submitResult = await submitSkipTest(day.day, selectedAnswers as number[]);
      setResult(submitResult);
      if (submitResult.passed) {
        setTimeout(() => {
          onSuccess();
        }, 2500);
      }
    } catch (error: any) {
      console.error('Skip test error:', error);
      const errorMessage = error?.response?.data?.message || 'Failed to submit skip test. Please try again.';
      setResult({
        passed: false,
        correctCount: 0,
        totalQuestions: questions.length,
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedAnswers([]);
    setCurrentQuestion(0);
    setResult(null);
    onClose();
  };

  const handleForceSkip = async () => {
    setIsForceSkipping(true);
    try {
      await forceSkipDay(day.day);
      onSuccess();
    } catch (error: any) {
      console.error('Force skip error:', error);
      setResult({
        passed: false,
        correctCount: 0,
        totalQuestions: questions.length,
        message: error?.response?.data?.message || 'Failed to skip day. Please try again.',
      });
    } finally {
      setIsForceSkipping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header with gradient */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiIHN0cm9rZS13aWR0aD0iMiIvPjwvZz48L3N2Zz4=')] opacity-30" />

          <div className="relative p-6 pb-8">
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Skip Test
                </h3>
                <p className="text-sm text-white/70">
                  Day {day.day} • {day.title?.split(':')[1]?.trim() || 'Knowledge Check'}
                </p>
              </div>
            </div>

            {/* Progress dots */}
            {!result && (
              <div className="flex items-center gap-2 mt-4">
                {questions.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentQuestion(idx)}
                    className={clsx(
                      'h-2 rounded-full transition-all duration-300',
                      idx === currentQuestion
                        ? 'w-8 bg-white'
                        : selectedAnswers[idx] !== null
                          ? 'w-2 bg-white/80'
                          : 'w-2 bg-white/30'
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="p-6"
              >
                {result.passed ? (
                  /* Success State */
                  <div className="text-center py-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', damping: 15, stiffness: 300, delay: 0.1 }}
                      className="relative inline-block mb-6"
                    >
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-green-200">
                        <CheckCircle className="w-12 h-12 text-white" />
                      </div>
                      {/* Celebration particles */}
                      {[...Array(8)].map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ scale: 0, x: 0, y: 0 }}
                          animate={{
                            scale: [0, 1, 0],
                            x: Math.cos(i * 45 * Math.PI / 180) * 60,
                            y: Math.sin(i * 45 * Math.PI / 180) * 60,
                          }}
                          transition={{ duration: 0.8, delay: 0.2 + i * 0.05 }}
                          className="absolute top-1/2 left-1/2 w-3 h-3 -ml-1.5 -mt-1.5 rounded-full"
                          style={{
                            background: ['#10b981', '#8b5cf6', '#f59e0b', '#ec4899'][i % 4],
                          }}
                        />
                      ))}
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <h4 className="text-2xl font-bold text-gray-900 mb-2">
                        You nailed it! 🎉
                      </h4>
                      <p className="text-gray-600 mb-4">
                        {result.message}
                      </p>
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium">
                        <CheckCircle className="w-4 h-4" />
                        {result.correctCount}/{result.totalQuestions} correct
                      </div>
                      <p className="text-sm text-gray-400 mt-6">
                        Advancing to the next day...
                      </p>
                    </motion.div>
                  </div>
                ) : (
                  /* Failed State */
                  <div className="text-center py-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                      className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center"
                    >
                      <span className="text-4xl">🤔</span>
                    </motion.div>

                    <h4 className="text-xl font-bold text-gray-900 mb-2">
                      Almost there!
                    </h4>
                    <p className="text-gray-600 mb-2">
                      {result.message}
                    </p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-full text-sm font-medium mb-6">
                      <Target className="w-4 h-4" />
                      {result.correctCount}/{result.totalQuestions} correct • Need {passThreshold}
                    </div>

                    <div className="space-y-3">
                      <button
                        onClick={handleClose}
                        className="w-full py-3.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-purple-200"
                      >
                        Learn the material first
                      </button>
                      <button
                        onClick={handleForceSkip}
                        disabled={isForceSkipping}
                        className="w-full py-3 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isForceSkipping ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Skipping...
                          </>
                        ) : (
                          <>
                            <Shuffle className="w-4 h-4" />
                            Skip anyway → Day {day.day + 1}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key={`question-${currentQuestion}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="p-6"
              >
                {/* Question number badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-50 text-violet-700 rounded-full text-sm font-medium mb-4">
                  <span>Question {currentQuestion + 1}</span>
                  <span className="text-violet-400">of {questions.length}</span>
                </div>

                {/* Question text */}
                <h4 className="text-lg font-semibold text-gray-900 mb-6 leading-relaxed">
                  {currentQ.question}
                </h4>

                {/* Options */}
                <div className="space-y-3">
                  {currentQ.options.map((option, optIndex) => {
                    const isSelected = selectedAnswers[currentQuestion] === optIndex;
                    const letters = ['A', 'B', 'C', 'D'];

                    return (
                      <motion.button
                        key={optIndex}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleAnswerSelect(optIndex)}
                        className={clsx(
                          'w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-start gap-3',
                          isSelected
                            ? 'border-violet-500 bg-violet-50 shadow-md shadow-violet-100'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        <span className={clsx(
                          'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors',
                          isSelected
                            ? 'bg-violet-500 text-white'
                            : 'bg-gray-100 text-gray-500'
                        )}>
                          {letters[optIndex]}
                        </span>
                        <span className={clsx(
                          'pt-1 text-sm leading-relaxed',
                          isSelected ? 'text-violet-900 font-medium' : 'text-gray-700'
                        )}>
                          {option}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Navigation */}
        {!result && (
          <div className="p-4 border-t border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrev}
                disabled={currentQuestion === 0}
                className={clsx(
                  'p-3 rounded-xl transition-colors',
                  currentQuestion === 0
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-200'
                )}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="flex-1">
                {isLastQuestion && allAnswered ? (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-purple-200 disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5" />
                        Submit & Check
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    disabled={selectedAnswers[currentQuestion] === null}
                    className={clsx(
                      'w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2',
                      selectedAnswers[currentQuestion] !== null
                        ? 'bg-gray-900 hover:bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    )}
                  >
                    Next Question
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}
              </div>

              <button
                onClick={handleNext}
                disabled={isLastQuestion || selectedAnswers[currentQuestion] === null}
                className={clsx(
                  'p-3 rounded-xl transition-colors',
                  isLastQuestion || selectedAnswers[currentQuestion] === null
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-200'
                )}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// Incomplete Work Warning Modal
function IncompleteWorkModal({
  isOpen,
  onClose,
  onTakeSkipTest,
  incompleteItems,
}: {
  isOpen: boolean;
  onClose: () => void;
  onTakeSkipTest: () => void;
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
              <p className="text-sm text-gray-500">You haven't completed some activities</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-600 mb-4">
            To get the most out of your learning, please complete:
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
            Completing these activities helps reinforce your learning and improves retention by up to 40%.
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
            onClick={onTakeSkipTest}
            className="flex items-center gap-2 py-2.5 px-4 text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-xl font-medium transition-colors"
          >
            <Zap className="w-4 h-4" />
            Take Skip Test
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

  const { getAlternativeTaskFormat } = useSessionStore();

  if (!task) return null;

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
      const formatLabel = loadingFormatType === 'quiz' ? 'quiz' : 'fill-in-the-blank';
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
  reflection: ReflectionStep,
};

// Step order for the session flow
const STEP_ORDER: SessionStepType[] = [
  'prePrompt',
  'video',
  'foundationCards',
  'task1',
  'bossMilestone',
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
  const [showSkipTest, setShowSkipTest] = useState(false);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [incompleteItems, setIncompleteItems] = useState<{ step: string; label: string; icon: string }[]>([]);
  const [showAiTutor, setShowAiTutor] = useState(false);

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
    completedSteps,
    fetchActiveSession,
    setActiveSession,
    startDay,
    setCurrentStep,
    completeStep,
    isDeferredLoading,
    isRegenerating,
    hasStepEngagement,
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

  // Get available steps (filter out skipped ones)
  const availableSteps = STEP_ORDER.filter(step => {
    // Skip bossMilestone if not present in day content
    if (step === 'bossMilestone' && !currentDay?.bossMilestone && !currentDay?.hasBossProject) return false;
    // Skip foundationCards if not present
    if (step === 'foundationCards' && (!currentDay?.foundationCards || currentDay.foundationCards.length === 0)) return false;
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
    loadDayCoreContent,
    loadDayDeferredContent,
    resetSteps,
  } = useSessionStore();

  const [isAdvancingDay, setIsAdvancingDay] = useState(false);

  // Check what work is incomplete (uses store's persisted progress)
  const checkIncompleteWork = (): { step: string; label: string; icon: string }[] => {
    if (!currentDay) return [];
    const incomplete: { step: string; label: string; icon: string }[] = [];

    // Check foundation cards (if they exist in this flow) - uses local state
    if (currentDay?.foundationCards && currentDay.foundationCards.length > 0 && !stepEngagement.foundationCards) {
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

        // 2. Load next day content
        const nextDayNumber = currentDay.day + 1;
        await loadDayCoreContent(nextDayNumber);

        // Start deferred loading in background
        loadDayDeferredContent(nextDayNumber).catch(console.error);

        // 3. Reset steps and engagement for new day
        resetSteps();
        setStepEngagement({ foundationCards: false, task1: false, bossMilestone: false, reflection: false });

        addSystemMessage(
          `🎉 Day ${currentDay.day} complete! Let's start Day ${nextDayNumber}!`,
          'celebratory'
        );

        // Stay on session page - it will now show next day
        setIsAdvancingDay(false);
      } catch (error) {
        console.error('Failed to advance day:', error);
        setIsAdvancingDay(false);
        // Fallback to today page
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

  // Regenerating day content
  if (isRegenerating) {
    return (
      <GeneratingScreen
        steps={[
          { icon: Sparkles, text: 'Generating fresh content...', duration: 30000 },
          { icon: Target, text: 'Creating new exercises...', duration: 30000 },
          { icon: BookOpen, text: 'Finding a new video...', duration: 30000 },
          { icon: Trophy, text: 'Preparing your refreshed session...', duration: 10000 },
        ]}
        title={`Regenerating Day ${currentDay.day}`}
        subtitle={`Creating fresh ${activeSession.skillName} content just for you`}
        timeEstimate="This usually takes 1-2 minutes"
      />
    );
  }

  // Loading next day content
  if (isAdvancingDay) {
    const nextDayNumber = currentDay.day + 1;
    const nextDayData = activeSession.curriculum.days.find(d => d.day === nextDayNumber);
    return (
      <GeneratingScreen
        steps={[
          { icon: CheckCircle, text: `Saving Day ${currentDay.day} progress...`, duration: 2000 },
          { icon: Sparkles, text: 'Generating next lesson...', duration: 30000 },
          { icon: Target, text: 'Creating practice exercises...', duration: 30000 },
          { icon: BookOpen, text: 'Finding the perfect video...', duration: 30000 },
          { icon: Trophy, text: 'Preparing your session...', duration: 10000 },
        ]}
        title={`Preparing Day ${nextDayNumber}`}
        subtitle={nextDayData?.title || `Your next ${activeSession.skillName} lesson`}
        timeEstimate="This usually takes 1-2 minutes"
      />
    );
  }

  const StepComponent = STEP_COMPONENTS[currentStep];

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
            day={currentDay}
            session={activeSession}
            onComplete={handleStepComplete}
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

            {/* AI Tutor Button - Center */}
            {canUseAITutor ? (
              <button
                onClick={() => setShowAiTutor(true)}
                className="group flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 bg-white hover:bg-gray-50 border border-gray-200 hover:border-purple-300 hover:shadow-md hover:shadow-purple-100"
              >
                <Sparkles className="w-4 h-4 text-purple-500 group-hover:text-purple-600" />
                <span className="text-gray-700 group-hover:text-gray-900">Ask AI Tutor</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
                <Lock className="w-3.5 h-3.5" />
                Ask AI Tutor (PRO)
              </div>
            )}

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

      {/* Incomplete Work Warning Modal */}
      <IncompleteWorkModal
        isOpen={showIncompleteModal}
        onClose={() => setShowIncompleteModal(false)}
        onTakeSkipTest={() => {
          setShowIncompleteModal(false);
          setShowSkipTest(true);
        }}
        incompleteItems={incompleteItems}
      />

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
    </FocusModeLayout>
  );
}
