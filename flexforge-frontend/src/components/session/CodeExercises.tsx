import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Lightbulb, Eye, EyeOff, Play, ArrowRight, ChevronLeft } from 'lucide-react';
import { clsx } from 'clsx';
import type {
  CodeCompletionSection,
  DebuggingSection,
  OutputPredictionSection,
  AICodeReviewSection,
  AICodeReviewIssue,
} from '@/types';

// Progress persistence types
export interface SectionSavedProgress {
  answers: Record<string, number | string | boolean>;
  currentIndex: number;
}

// ============================================
// Shared Components
// ============================================

interface ExerciseHeaderProps {
  title: string;
  instructions?: string;
  progress: { current: number; total: number };
}

function ExerciseHeader({ title, instructions, progress }: ExerciseHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <span className="text-sm text-gray-500">
          {progress.current} / {progress.total}
        </span>
      </div>
      {instructions && (
        <p className="text-sm text-gray-600">{instructions}</p>
      )}
      <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-brand-500"
          initial={{ width: 0 }}
          animate={{ width: `${(progress.current / progress.total) * 100}%` }}
        />
      </div>
    </div>
  );
}

interface FeedbackToastProps {
  show: boolean;
  correct: boolean;
  message?: string;
}

function FeedbackToast({ show, correct, message }: FeedbackToastProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={clsx(
            'fixed bottom-20 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg flex items-center gap-2',
            correct ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          )}
        >
          {correct ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
          <span>{message || (correct ? 'Correct!' : 'Try again')}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Simple code block component with basic syntax highlighting appearance
function CodeBlock({ code, language: _language }: { code: string; language?: string }) {
  return (
    <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
      <code>{code}</code>
    </pre>
  );
}

// ============================================
// Code Completion Exercise
// ============================================

interface CodeCompletionExerciseProps {
  section: CodeCompletionSection;
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function CodeCompletionExercise({ section, onComplete, savedProgress, onProgressChange }: CodeCompletionExerciseProps) {
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0);
  const [userCode, setUserCode] = useState('');
  const [results, setResults] = useState<Record<string, boolean>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, boolean> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'boolean') result[k] = v;
    });
    return result;
  });
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [currentHintIndex, setCurrentHintIndex] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  const items = section.items;
  const currentItem = items[currentIndex];
  const hasAnswered = currentItem?.id in results;

  const checkAnswer = () => {
    if (!userCode.trim()) return;

    // Simple check: normalize whitespace and compare
    const normalizeCode = (code: string) =>
      code.replace(/\s+/g, ' ').trim().toLowerCase();

    const correct = normalizeCode(userCode) === normalizeCode(currentItem.solution);
    const newResults = { ...results, [currentItem.id]: correct };

    setResults(newResults);
    setIsCorrect(correct);
    setShowFeedback(true);

    // Report progress
    if (onProgressChange) {
      onProgressChange(newResults as Record<string, number | string | boolean>, currentIndex);
    }

    setTimeout(() => {
      setShowFeedback(false);
    }, 2000);
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setUserCode('');
      setShowHint(false);
      setCurrentHintIndex(0);
      setShowSolution(false);
    } else {
      const correctCount = Object.values(results).filter(Boolean).length;
      onComplete(correctCount, items.length, results as Record<string, number | string | boolean>);
    }
  };

  const showNextHint = () => {
    if (currentHintIndex < currentItem.hints.length - 1) {
      setCurrentHintIndex(prev => prev + 1);
    }
    setShowHint(true);
  };

  if (!currentItem) return null;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions="Complete the code to solve the challenge"
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <p className="text-gray-700 mb-4">{currentItem.description}</p>

        {/* Starter code */}
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-500 mb-2">Starter Code:</p>
          <CodeBlock code={currentItem.starterCode} language={currentItem.language} />
        </div>

        {/* User input */}
        {!hasAnswered && (
          <>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-500 mb-2 block">Your Solution:</label>
              <textarea
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                placeholder="Write your code here..."
                className="w-full h-40 p-3 font-mono text-base border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-gray-50"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={showNextHint}
                disabled={showHint && currentHintIndex >= currentItem.hints.length - 1}
                className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
              >
                <Lightbulb className="w-4 h-4" />
                {showHint ? `Hint ${currentHintIndex + 1}/${currentItem.hints.length}` : 'Show Hint'}
              </button>

              <button
                onClick={() => setShowSolution(!showSolution)}
                className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
              >
                {showSolution ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showSolution ? 'Hide Solution' : 'Reveal Solution'}
              </button>

              <button
                onClick={checkAnswer}
                disabled={!userCode.trim()}
                className="ml-auto px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Check
              </button>
            </div>

            {showHint && currentItem.hints[currentHintIndex] && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg"
              >
                <p className="text-sm text-amber-800">
                  <strong>Hint {currentHintIndex + 1}:</strong> {currentItem.hints[currentHintIndex]}
                </p>
              </motion.div>
            )}

            {showSolution && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3"
              >
                <p className="text-sm font-medium text-gray-500 mb-2">Solution:</p>
                <CodeBlock code={currentItem.solution} language={currentItem.language} />
              </motion.div>
            )}
          </>
        )}

        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={clsx(
              'p-4 rounded-lg',
              results[currentItem.id] ? 'bg-green-100' : 'bg-orange-100'
            )}
          >
            <p className={clsx(
              'font-medium mb-2',
              results[currentItem.id] ? 'text-green-800' : 'text-orange-800'
            )}>
              {results[currentItem.id] ? 'Correct!' : 'Not quite - here\'s the solution:'}
            </p>
            {!results[currentItem.id] && (
              <CodeBlock code={currentItem.solution} language={currentItem.language} />
            )}
          </motion.div>
        )}

        {/* Next button */}
        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 flex justify-end"
          >
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center gap-2"
            >
              {currentIndex < items.length - 1 ? 'Next' : 'Finish'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}

// ============================================
// Debugging Exercise
// ============================================

interface DebuggingExerciseProps {
  section: DebuggingSection;
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function DebuggingExercise({ section, onComplete, savedProgress, onProgressChange }: DebuggingExerciseProps) {
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0);
  const [userCode, setUserCode] = useState('');
  const [results, setResults] = useState<Record<string, boolean>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, boolean> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'boolean') result[k] = v;
    });
    return result;
  });
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const items = section.items;
  const currentItem = items[currentIndex];
  const hasAnswered = currentItem?.id in results;

  // Initialize user code with buggy code
  useEffect(() => {
    if (currentItem && !hasAnswered) {
      setUserCode(currentItem.buggyCode);
    }
  }, [currentIndex, currentItem, hasAnswered]);

  const checkAnswer = () => {
    if (!userCode.trim()) return;

    const normalizeCode = (code: string) =>
      code.replace(/\s+/g, ' ').trim().toLowerCase();

    const correct = normalizeCode(userCode) === normalizeCode(currentItem.fixedCode);
    const newResults = { ...results, [currentItem.id]: correct };

    setResults(newResults);
    setIsCorrect(correct);
    setShowFeedback(true);

    // Report progress
    if (onProgressChange) {
      onProgressChange(newResults as Record<string, number | string | boolean>, currentIndex);
    }

    setTimeout(() => {
      setShowFeedback(false);
    }, 2000);
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setUserCode(items[currentIndex + 1]?.buggyCode || '');
      setShowHint(false);
    } else {
      const correctCount = Object.values(results).filter(Boolean).length;
      onComplete(correctCount, items.length, results as Record<string, number | string | boolean>);
    }
  };

  if (!currentItem) return null;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions="Find and fix the bug in the code"
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 font-medium">Bug Report:</p>
          <p className="text-sm text-red-700">There's a bug in this code. Find and fix it!</p>
        </div>

        {!hasAnswered && (
          <>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-500 mb-2 block">Fix the code:</label>
              <textarea
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                className="w-full h-40 p-3 font-mono text-base border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-gray-50"
              />
            </div>

            <div className="flex gap-2">
              {currentItem.hint && (
                <button
                  onClick={() => setShowHint(true)}
                  className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                >
                  <Lightbulb className="w-4 h-4" />
                  {showHint ? currentItem.hint : 'Show Hint'}
                </button>
              )}

              <button
                onClick={checkAnswer}
                disabled={!userCode.trim()}
                className="ml-auto px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                Check Fix
              </button>
            </div>
          </>
        )}

        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={clsx(
              'p-4 rounded-lg',
              results[currentItem.id] ? 'bg-green-100' : 'bg-orange-100'
            )}
          >
            <p className={clsx(
              'font-medium mb-2',
              results[currentItem.id] ? 'text-green-800' : 'text-orange-800'
            )}>
              {results[currentItem.id] ? 'Bug squashed!' : 'Not quite - here\'s the fix:'}
            </p>
            <p className="text-sm mb-3">{currentItem.explanation}</p>
            {!results[currentItem.id] && (
              <CodeBlock code={currentItem.fixedCode} language={currentItem.language} />
            )}
          </motion.div>
        )}

        {/* Next button */}
        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 flex justify-end"
          >
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center gap-2"
            >
              {currentIndex < items.length - 1 ? 'Next' : 'Finish'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}

// ============================================
// Output Prediction Exercise
// ============================================

interface OutputPredictionExerciseProps {
  section: OutputPredictionSection;
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function OutputPredictionExercise({ section, onComplete, savedProgress, onProgressChange }: OutputPredictionExerciseProps) {
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0);
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, number> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'number') result[k] = v;
    });
    return result;
  });
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const questions = section.questions;
  const currentQuestion = questions[currentIndex];
  const hasAnswered = currentQuestion?.id in answers;

  const handleAnswer = (optionIndex: number) => {
    if (hasAnswered) return;

    const correct = optionIndex === currentQuestion.correctIndex;
    const newAnswers = { ...answers, [currentQuestion.id]: optionIndex };
    setAnswers(newAnswers);
    setIsCorrect(correct);
    setShowFeedback(true);

    // Report progress
    if (onProgressChange) {
      onProgressChange(newAnswers as Record<string, number | string | boolean>, currentIndex);
    }

    setTimeout(() => {
      setShowFeedback(false);
    }, 2000);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      const correctCount = Object.entries(answers)
        .filter(([id, ans]) => {
          const q = questions.find(q => q.id === id);
          return q && ans === q.correctIndex;
        }).length;
      onComplete(correctCount, questions.length, answers as Record<string, number | string | boolean>);
    }
  };

  const handlePrevQuestion = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  if (!currentQuestion) return null;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions="Predict what this code will output"
        progress={{ current: currentIndex + 1, total: questions.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <p className="text-sm font-medium text-gray-500 mb-2">What will this code output?</p>
        <div className="mb-4">
          <CodeBlock code={currentQuestion.code} language={currentQuestion.language} />
        </div>

        <div className="space-y-2">
          {currentQuestion.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswer(index)}
              disabled={hasAnswered}
              className={clsx(
                'w-full p-3 text-left rounded-lg border transition-all font-mono text-sm',
                hasAnswered
                  ? index === currentQuestion.correctIndex
                    ? 'bg-green-100 border-green-500'
                    : index === answers[currentQuestion.id]
                    ? 'bg-red-100 border-red-500'
                    : 'bg-gray-50 border-gray-200'
                  : 'hover:bg-brand-50 hover:border-brand-300 border-gray-200'
              )}
            >
              {option}
            </button>
          ))}
        </div>

        {hasAnswered && currentQuestion.explanation && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800"
          >
            {currentQuestion.explanation}
          </motion.p>
        )}

        {/* Question navigation */}
        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 flex justify-between items-center gap-2"
          >
            <button
              onClick={handlePrevQuestion}
              disabled={currentIndex === 0}
              className={clsx(
                'px-3 sm:px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 text-sm',
                currentIndex === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200'
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden xs:inline">Previous</span>
              <span className="xs:hidden">Prev</span>
            </button>
            <button
              onClick={handleNext}
              className="px-3 sm:px-4 py-2.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 active:bg-brand-700 transition-colors flex items-center gap-1.5 sm:gap-2 text-sm"
            >
              {currentIndex < questions.length - 1 ? 'Next' : 'Finish'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}

// ============================================
// AI Code Review Exercise (Two-Step Flow)
// Step 1: Select which line/location has an issue
// Step 2: Choose the reason why it's vulnerable
// ============================================

const ISSUE_TYPE_LABELS: Record<AICodeReviewIssue['type'], { label: string; color: string; icon: string }> = {
  bug: { label: 'Bug', color: 'text-red-600 bg-red-50 border-red-200', icon: '🐛' },
  security: { label: 'Security', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: '🔒' },
  assumption: { label: 'Assumption', color: 'text-purple-600 bg-purple-50 border-purple-200', icon: '🤔' },
  scalability: { label: 'Scalability', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: '📈' },
  hallucination: { label: 'Hallucination', color: 'text-pink-600 bg-pink-50 border-pink-200', icon: '👻' },
  'edge-case': { label: 'Edge Case', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: '⚠️' },
};

interface AICodeReviewExerciseProps {
  section: AICodeReviewSection;
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function AICodeReviewExercise({ section, onComplete, savedProgress, onProgressChange }: AICodeReviewExerciseProps) {
  const [currentItemIndex, setCurrentItemIndex] = useState(savedProgress?.currentIndex ?? 0);
  const [currentIssueIndex, setCurrentIssueIndex] = useState(0);
  const [step, setStep] = useState<'location' | 'reason'>('location');
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedReasonIndex, setSelectedReasonIndex] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [results, setResults] = useState<Record<string, { locationCorrect: boolean; reasonCorrect: boolean }>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, { locationCorrect: boolean; reasonCorrect: boolean }> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'string') {
        try {
          result[k] = JSON.parse(v);
        } catch {
          // ignore
        }
      }
    });
    return result;
  });

  const items = section.items;
  const currentItem = items[currentItemIndex];
  const currentIssue = currentItem?.issues[currentIssueIndex];
  const totalIssues = items.reduce((sum, item) => sum + item.issues.length, 0);
  const completedIssues = Object.keys(results).length;

  // Get all locations for step 1 (includes correct + decoy locations)
  const getLocationOptions = () => {
    if (!currentItem) return [];
    // Use all issues' locations as options
    return currentItem.issues.map(issue => issue.location);
  };

  const handleLocationSelect = (location: string) => {
    if (showFeedback) return;
    setSelectedLocation(location);

    // Check if selected location matches current issue
    const isCorrect = location === currentIssue?.location;

    if (isCorrect) {
      // Move to step 2: choose reason
      setStep('reason');
    } else {
      // Wrong location - show feedback
      setShowFeedback(true);
      const newResults = {
        ...results,
        [currentIssue.id]: { locationCorrect: false, reasonCorrect: false }
      };
      setResults(newResults);

      // Report progress
      if (onProgressChange) {
        const serialized: Record<string, string> = {};
        Object.entries(newResults).forEach(([k, v]) => {
          serialized[k] = JSON.stringify(v);
        });
        onProgressChange(serialized, currentItemIndex);
      }
    }
  };

  const handleReasonSelect = (optionIndex: number) => {
    if (showFeedback) return;
    setSelectedReasonIndex(optionIndex);
    setShowFeedback(true);

    const isCorrect = optionIndex === currentIssue?.correctIndex;
    const newResults = {
      ...results,
      [currentIssue.id]: { locationCorrect: true, reasonCorrect: isCorrect }
    };
    setResults(newResults);

    // Report progress
    if (onProgressChange) {
      const serialized: Record<string, string> = {};
      Object.entries(newResults).forEach(([k, v]) => {
        serialized[k] = JSON.stringify(v);
      });
      onProgressChange(serialized, currentItemIndex);
    }
  };

  const handleNext = () => {
    moveToNextIssue(results);
  };

  const moveToNextIssue = (currentResults: Record<string, { locationCorrect: boolean; reasonCorrect: boolean }>) => {
    setShowFeedback(false);
    setSelectedLocation(null);
    setSelectedReasonIndex(null);
    setStep('location');

    if (currentIssueIndex < currentItem.issues.length - 1) {
      // Next issue in same code block
      setCurrentIssueIndex(prev => prev + 1);
    } else if (currentItemIndex < items.length - 1) {
      // Next code block
      setCurrentItemIndex(prev => prev + 1);
      setCurrentIssueIndex(0);
    } else {
      // All done - calculate score
      const correctCount = Object.values(currentResults).filter(r => r.locationCorrect && r.reasonCorrect).length;
      const serialized: Record<string, string> = {};
      Object.entries(currentResults).forEach(([k, v]) => {
        serialized[k] = JSON.stringify(v);
      });
      onComplete(correctCount, totalIssues, serialized);
    }
  };

  if (!currentItem || !currentIssue) return null;

  const typeInfo = ISSUE_TYPE_LABELS[currentIssue.type];
  const locationOptions = getLocationOptions();

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions={section.instructions || "Review this AI-generated code and identify issues"}
        progress={{ current: completedIssues + 1, total: totalIssues }}
      />

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {/* Context */}
        <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-b">
          <div className="flex items-start gap-2">
            <span className="text-lg">🤖</span>
            <div>
              <p className="text-sm font-medium text-purple-800">AI-Generated Code</p>
              <p className="text-sm text-purple-700">{currentItem.context}</p>
            </div>
          </div>
          {currentItem.promptUsed && (
            <div className="mt-2 text-xs text-purple-600 italic">
              Prompt: "{currentItem.promptUsed}"
            </div>
          )}
        </div>

        {/* Code */}
        <div className="p-4">
          <CodeBlock code={currentItem.code} language={currentItem.language} />
        </div>

        {/* Step 1: Select Location */}
        {step === 'location' && (
          <div className="p-4 border-t bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <div className={clsx('px-2 py-0.5 rounded text-xs font-medium border', typeInfo.color)}>
                {typeInfo.icon} {typeInfo.label}
              </div>
              <p className="text-sm font-medium text-gray-700">
                Find the {typeInfo.label.toLowerCase()} issue - which line has the problem?
              </p>
            </div>

            <div className="grid gap-2">
              {locationOptions.map((location, index) => {
                const isSelected = selectedLocation === location;
                const isCorrectLocation = location === currentIssue.location;
                const showResult = showFeedback && isSelected;

                return (
                  <button
                    key={index}
                    onClick={() => handleLocationSelect(location)}
                    disabled={showFeedback}
                    className={clsx(
                      'p-3 rounded-lg border text-left transition-all font-mono text-sm',
                      !showFeedback && 'hover:bg-brand-50 hover:border-brand-300 border-gray-200',
                      showResult && isCorrectLocation && 'bg-green-100 border-green-500',
                      showResult && !isCorrectLocation && 'bg-red-100 border-red-500',
                      showFeedback && !isSelected && isCorrectLocation && 'bg-green-50 border-green-300'
                    )}
                  >
                    {location}
                  </button>
                );
              })}
            </div>

            {showFeedback && selectedLocation !== currentIssue.location && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg"
              >
                <p className="text-sm text-red-800">
                  <strong>Not quite.</strong> The issue is at <span className="font-mono">{currentIssue.location}</span>
                </p>
              </motion.div>
            )}

            {/* Next button for location step */}
            {showFeedback && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 flex justify-end"
              >
                <button
                  onClick={handleNext}
                  className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center gap-2"
                >
                  {currentIssueIndex < currentItem.issues.length - 1 || currentItemIndex < items.length - 1 ? 'Next' : 'Finish'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {currentItem.hint && !showFeedback && (
              <div className="mt-3 p-2 bg-amber-50 rounded-lg">
                <p className="text-sm text-amber-700">
                  <Lightbulb className="w-4 h-4 inline mr-1" />
                  {currentItem.hint}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Select Reason */}
        {step === 'reason' && currentIssue.options && (
          <div className="p-4 border-t bg-gray-50">
            <div className="flex items-center gap-2 mb-1">
              <div className={clsx('px-2 py-0.5 rounded text-xs font-medium border', typeInfo.color)}>
                {typeInfo.icon} {typeInfo.label}
              </div>
              <p className="text-sm text-gray-500 font-mono">{currentIssue.location}</p>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-3">
              Why is this line problematic?
            </p>

            <div className="grid gap-2">
              {currentIssue.options.map((option, index) => {
                const isSelected = selectedReasonIndex === index;
                const isCorrect = index === currentIssue.correctIndex;
                const showResult = showFeedback;

                return (
                  <button
                    key={index}
                    onClick={() => handleReasonSelect(index)}
                    disabled={showFeedback}
                    className={clsx(
                      'p-3 rounded-lg border text-left transition-all text-sm',
                      !showFeedback && 'hover:bg-brand-50 hover:border-brand-300 border-gray-200',
                      showResult && isSelected && isCorrect && 'bg-green-100 border-green-500',
                      showResult && isSelected && !isCorrect && 'bg-red-100 border-red-500',
                      showResult && !isSelected && isCorrect && 'bg-green-50 border-green-300'
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {showFeedback && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={clsx(
                  'mt-3 p-3 rounded-lg border',
                  selectedReasonIndex === currentIssue.correctIndex
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-200'
                )}
              >
                <p className={clsx(
                  'text-sm',
                  selectedReasonIndex === currentIssue.correctIndex ? 'text-green-800' : 'text-amber-800'
                )}>
                  {selectedReasonIndex === currentIssue.correctIndex ? (
                    <><strong>Correct!</strong> {currentIssue.explanation}</>
                  ) : (
                    <><strong>Not quite.</strong> {currentIssue.explanation}</>
                  )}
                </p>
              </motion.div>
            )}

            {/* Next button for reason step */}
            {showFeedback && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 flex justify-end"
              >
                <button
                  onClick={handleNext}
                  className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center gap-2"
                >
                  {currentIssueIndex < currentItem.issues.length - 1 || currentItemIndex < items.length - 1 ? 'Next' : 'Finish'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
