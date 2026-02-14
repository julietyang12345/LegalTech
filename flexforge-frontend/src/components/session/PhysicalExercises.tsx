import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, CheckCircle, AlertTriangle, ThumbsUp, ThumbsDown } from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import type {
  FormCheckSection,
  SafetyCheckSection,
} from '@/types';

// Progress persistence types
export interface SectionSavedProgress {
  answers: Record<string, number | string | boolean>;
  currentIndex: number;
}

// ============================================
// Shared Components
// ============================================

function QuestionStreamingSkeleton({ title, current, total }: { title?: string; current: number; total: number }) {
  return (
    <div className="space-y-4">
      {title && <ExerciseHeader title={title} progress={{ current, total }} />}
      <div className="bg-surface rounded-lg p-6 shadow-sm border animate-pulse">
        <div className="h-5 bg-surface-tertiary rounded w-3/4 mb-4" />
        <div className="space-y-2">
          <div className="h-12 bg-surface-tertiary rounded-lg" />
          <div className="h-12 bg-surface-tertiary rounded-lg" />
          <div className="h-12 bg-surface-tertiary rounded-lg" />
        </div>
      </div>
    </div>
  );
}

interface ExerciseHeaderProps {
  title: string;
  instructions?: string;
  progress: { current: number; total: number };
}

function ExerciseHeader({ title, instructions, progress }: ExerciseHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-content">{title}</h3>
        <span className="text-sm text-content-tertiary">
          {progress.current} / {progress.total}
        </span>
      </div>
      {instructions && (
        <p className="text-sm text-content-secondary">{instructions}</p>
      )}
      <div className="mt-2 h-1 bg-surface-tertiary rounded-full overflow-hidden">
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

// ============================================
// Form Check Exercise
// ============================================

interface FormCheckExerciseProps {
  section: FormCheckSection;
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function FormCheckExercise({ section, onComplete, savedProgress, onProgressChange }: FormCheckExerciseProps) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => {
    if (!savedProgress?.answers) return new Set();
    const result = new Set<string>();
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (v === true) result.add(k);
    });
    return result;
  });
  const [showCommonMistake, setShowCommonMistake] = useState<string | null>(null);

  const items = section.items || [];
  const checkedCount = checkedItems.size;

  const toggleItem = (itemId: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      // Report progress
      if (onProgressChange) {
        const answers: Record<string, boolean> = {};
        next.forEach(id => { answers[id] = true; });
        onProgressChange(answers, next.size);
      }
      return next;
    });
  };

  const handleComplete = () => {
    // All items should be checked for proper form
    const answers: Record<string, boolean> = {};
    checkedItems.forEach(id => { answers[id] = true; });
    onComplete(checkedCount, items.length, answers);
  };

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions="Check each point as you verify your form"
        progress={{ current: checkedCount, total: items.length }}
      />

      <div className="bg-surface rounded-lg p-6 shadow-sm border">
        <div className="space-y-4">
          {items.map((item) => {
            const isChecked = checkedItems.has(item.id);
            return (
              <div key={item.id} className="border-b border-border-secondary pb-4 last:border-0 last:pb-0">
                <button
                  onClick={() => toggleItem(item.id)}
                  className={clsx(
                    'w-full flex items-start gap-3 text-left transition-all p-3 rounded-lg',
                    isChecked ? 'bg-green-50' : 'hover:bg-surface-secondary'
                  )}
                >
                  <div className={clsx(
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                    isChecked ? 'bg-green-500 border-green-500' : 'border-border'
                  )}>
                    {isChecked && <Check className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1">
                    <p className={clsx(
                      'font-medium',
                      isChecked ? 'text-green-800' : 'text-content'
                    )}>
                      {item.checkpoint}
                    </p>
                    <p className="text-sm text-content-secondary mt-1">{item.description}</p>
                  </div>
                </button>

                {item.commonMistake && (
                  <button
                    onClick={() => setShowCommonMistake(
                      showCommonMistake === item.id ? null : item.id
                    )}
                    className="ml-9 mt-2 flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    {showCommonMistake === item.id ? 'Hide common mistake' : 'Common mistake to avoid'}
                  </button>
                )}

                {showCommonMistake === item.id && item.commonMistake && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="ml-9 mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg"
                  >
                    <p className="text-sm text-amber-800">{item.commonMistake}</p>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={handleComplete}
          disabled={checkedCount === 0}
          className="mt-6 w-full px-4 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-5 h-5" />
          Complete Form Check ({checkedCount}/{items.length})
        </button>
      </div>
    </div>
  );
}

// ============================================
// Safety Check Exercise
// ============================================

interface SafetyCheckExerciseProps {
  section: SafetyCheckSection;
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function SafetyCheckExercise({ section, onComplete, savedProgress, onProgressChange }: SafetyCheckExerciseProps) {
  const isStillStreaming = useSessionStore((s) => !s.isStreamingComplete);
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0);
  const [answers, setAnswers] = useState<Record<string, boolean>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, boolean> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'boolean' && !k.endsWith('_result')) result[k] = v;
    });
    return result;
  });
  const [results, setResults] = useState<Record<string, boolean>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, boolean> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (k.endsWith('_result') && typeof v === 'boolean') {
        result[k.replace('_result', '')] = v;
      }
    });
    return result;
  });
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const items = section.items || [];
  const currentItem = items[currentIndex];
  const hasAnswered = currentItem?.id in results;

  const handleAnswer = (answer: boolean) => {
    if (hasAnswered) return;

    const correct = answer === currentItem.correctAnswer;
    const newAnswers = { ...answers, [currentItem.id]: answer };
    const newResults = { ...results, [currentItem.id]: correct };
    setAnswers(newAnswers);
    setResults(newResults);
    setIsCorrect(correct);
    setShowFeedback(true);

    // Report progress
    if (onProgressChange) {
      const progressAnswers: Record<string, number | string | boolean> = { ...newAnswers };
      Object.entries(newResults).forEach(([k, v]) => {
        progressAnswers[`${k}_result`] = v;
      });
      onProgressChange(progressAnswers, currentIndex);
    }

    setTimeout(() => {
      setShowFeedback(false);
      if (currentIndex < items.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (isStillStreaming) {
        setCurrentIndex(prev => prev + 1);
      } else {
        const correctCount = Object.values(newResults).filter(Boolean).length;
        const finalAnswers: Record<string, number | string | boolean> = { ...newAnswers };
        Object.entries(newResults).forEach(([k, v]) => {
          finalAnswers[`${k}_result`] = v;
        });
        onComplete(correctCount, items.length, finalAnswers);
      }
    }, 2000);
  };

  useEffect(() => {
    if (!isStillStreaming && currentIndex >= items.length && items.length > 0) {
      const correctCount = Object.values(results).filter(Boolean).length;
      const finalAnswers: Record<string, number | string | boolean> = { ...answers };
      Object.entries(results).forEach(([k, v]) => {
        finalAnswers[`${k}_result`] = v;
      });
      onComplete(correctCount, items.length, finalAnswers);
    }
  }, [isStillStreaming, items.length]);

  if (!currentItem) return <QuestionStreamingSkeleton title={section.title} current={currentIndex + 1} total={Math.max(items?.length || 0, currentIndex + 1)} />;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions="Answer each safety question correctly"
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <div className="bg-surface rounded-lg p-6 shadow-sm border">
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">
            Safety first! Answer these questions to ensure you're practicing safely.
          </p>
        </div>

        <p className="text-lg font-medium text-content mb-6">{currentItem.question}</p>

        {!hasAnswered && (
          <div className="flex gap-4">
            <button
              onClick={() => handleAnswer(true)}
              className="flex-1 py-4 px-6 rounded-lg border-2 border-green-300 bg-green-50 hover:bg-green-100 transition-colors flex items-center justify-center gap-2"
            >
              <ThumbsUp className="w-6 h-6 text-green-600" />
              <span className="font-medium text-green-700">True</span>
            </button>
            <button
              onClick={() => handleAnswer(false)}
              className="flex-1 py-4 px-6 rounded-lg border-2 border-red-300 bg-red-50 hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
            >
              <ThumbsDown className="w-6 h-6 text-red-600" />
              <span className="font-medium text-red-700">False</span>
            </button>
          </div>
        )}

        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={clsx(
              'p-4 rounded-lg',
              results[currentItem.id] ? 'bg-green-100' : 'bg-red-100'
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              {results[currentItem.id] ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <X className="w-5 h-5 text-red-600" />
              )}
              <p className={clsx(
                'font-medium',
                results[currentItem.id] ? 'text-green-800' : 'text-red-800'
              )}>
                {results[currentItem.id]
                  ? 'Correct!'
                  : `The correct answer is: ${currentItem.correctAnswer ? 'True' : 'False'}`}
              </p>
            </div>
            <p className="text-sm text-content-secondary">{currentItem.explanation}</p>
          </motion.div>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}
