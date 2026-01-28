import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Palette, Lightbulb } from 'lucide-react';
import { clsx } from 'clsx';
import type {
  DesignCritiqueSection,
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

// ============================================
// Design Critique Exercise
// ============================================

interface DesignCritiqueExerciseProps {
  section: DesignCritiqueSection;
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function DesignCritiqueExercise({ section, onComplete, savedProgress, onProgressChange }: DesignCritiqueExerciseProps) {
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

  const items = section.items;
  const currentItem = items[currentIndex];
  const hasAnswered = currentItem?.id in answers;

  const handleAnswer = (optionIndex: number) => {
    if (hasAnswered) return;

    const correct = optionIndex === currentItem.correctIndex;
    const newAnswers = { ...answers, [currentItem.id]: optionIndex };
    setAnswers(newAnswers);
    setIsCorrect(correct);
    setShowFeedback(true);

    // Report progress
    if (onProgressChange) {
      onProgressChange(newAnswers as Record<string, number | string | boolean>, currentIndex);
    }

    setTimeout(() => {
      setShowFeedback(false);
      if (currentIndex < items.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        const correctCount = Object.entries(newAnswers)
          .filter(([id, ans]) => {
            const item = items.find(i => i.id === id);
            return item && ans === item.correctIndex;
          }).length;
        onComplete(correctCount, items.length, newAnswers as Record<string, number | string | boolean>);
      }
    }, 2500);
  };

  if (!currentItem) return null;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions="Evaluate the design choices based on design principles"
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        {/* Design principle badge */}
        <div className="mb-4 flex items-center gap-2">
          <Palette className="w-5 h-5 text-purple-600" />
          <span className="text-sm font-medium text-purple-700 bg-purple-50 px-3 py-1 rounded-full">
            Principle: {currentItem.principle}
          </span>
        </div>

        {/* Design scenario/description */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
          <p className="text-gray-700">{currentItem.description}</p>
        </div>

        {/* Optional design image */}
        {currentItem.imageUrl && (
          <div className="mb-4">
            <img
              src={currentItem.imageUrl}
              alt="Design example"
              className="w-full rounded-lg border"
            />
          </div>
        )}

        {/* Question */}
        <p className="text-lg font-medium mb-4">{currentItem.question}</p>

        {/* Options */}
        <div className="space-y-2">
          {currentItem.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswer(index)}
              disabled={hasAnswered}
              className={clsx(
                'w-full p-4 text-left rounded-lg border transition-all',
                hasAnswered
                  ? index === currentItem.correctIndex
                    ? 'bg-green-100 border-green-500'
                    : index === answers[currentItem.id]
                    ? 'bg-red-100 border-red-500'
                    : 'bg-gray-50 border-gray-200'
                  : 'hover:bg-purple-50 hover:border-purple-300 border-gray-200'
              )}
            >
              <span className="text-gray-800">{option}</span>
            </button>
          ))}
        </div>

        {/* Explanation after answering */}
        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4"
          >
            <div className={clsx(
              'p-4 rounded-lg',
              answers[currentItem.id] === currentItem.correctIndex
                ? 'bg-green-50 border border-green-200'
                : 'bg-blue-50 border border-blue-200'
            )}>
              <div className="flex items-start gap-2">
                <Lightbulb className={clsx(
                  'w-5 h-5 flex-shrink-0 mt-0.5',
                  answers[currentItem.id] === currentItem.correctIndex
                    ? 'text-green-600'
                    : 'text-blue-600'
                )} />
                <div>
                  <p className={clsx(
                    'font-medium mb-1',
                    answers[currentItem.id] === currentItem.correctIndex
                      ? 'text-green-800'
                      : 'text-blue-800'
                  )}>
                    {answers[currentItem.id] === currentItem.correctIndex
                      ? 'Great design thinking!'
                      : `The better choice was: "${currentItem.options[currentItem.correctIndex]}"`}
                  </p>
                  <p className={clsx(
                    'text-sm',
                    answers[currentItem.id] === currentItem.correctIndex
                      ? 'text-green-700'
                      : 'text-blue-700'
                  )}>
                    {currentItem.explanation}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}
