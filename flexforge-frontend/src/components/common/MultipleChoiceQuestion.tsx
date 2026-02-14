import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { clsx } from 'clsx';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export interface MultipleChoiceQuestionProps {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  disabled?: boolean;
  showResult?: boolean;
  questionNumber?: number;
}

export function MultipleChoiceQuestion({
  question,
  options,
  correctIndex,
  explanation,
  selectedIndex,
  onSelect,
  disabled = false,
  showResult = false,
  questionNumber,
}: MultipleChoiceQuestionProps) {
  const hasAnswered = selectedIndex !== null;
  const isCorrect = hasAnswered && selectedIndex === correctIndex;

  return (
    <div className={clsx(
      'p-4 rounded-lg border',
      showResult && isCorrect && 'bg-green-50 border-green-200',
      showResult && hasAnswered && !isCorrect && 'bg-amber-50 border-amber-200',
      !showResult && 'bg-surface-secondary border-border'
    )}>
      <p className="font-medium text-content mb-4">
        {questionNumber !== undefined && `${questionNumber}. `}{question}
      </p>

      <div className="space-y-2">
        {options.map((option, optionIndex) => {
          const isSelected = selectedIndex === optionIndex;
          const isCorrectOption = optionIndex === correctIndex;

          return (
            <button
              key={optionIndex}
              onClick={() => !disabled && !hasAnswered && onSelect(optionIndex)}
              disabled={disabled || hasAnswered}
              className={clsx(
                'w-full p-3 rounded-lg border text-left flex items-start gap-3 transition-all',
                !hasAnswered && !disabled && 'hover:border-brand-300 hover:bg-brand-50 cursor-pointer',
                (hasAnswered || disabled) && 'cursor-default',
                !showResult && 'bg-surface border-border',
                showResult && isCorrectOption && 'bg-green-100 border-green-400',
                showResult && isSelected && !isCorrectOption && 'bg-red-100 border-red-400',
                showResult && !isSelected && !isCorrectOption && 'bg-surface-secondary border-border opacity-60'
              )}
            >
              <span className={clsx(
                'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium',
                !showResult && 'bg-surface-tertiary text-content-secondary',
                showResult && isCorrectOption && 'bg-green-500 text-white',
                showResult && isSelected && !isCorrectOption && 'bg-red-500 text-white',
                showResult && !isSelected && !isCorrectOption && 'bg-surface-tertiary text-content-tertiary'
              )}>
                {showResult && isCorrectOption ? (
                  <Check className="w-4 h-4" />
                ) : showResult && isSelected && !isCorrectOption ? (
                  <X className="w-4 h-4" />
                ) : (
                  OPTION_LABELS[optionIndex]
                )}
              </span>
              <span className={clsx(
                'text-sm',
                showResult && isCorrectOption && 'text-green-800 font-medium',
                showResult && isSelected && !isCorrectOption && 'text-red-800',
                !showResult && 'text-content-secondary'
              )}>
                {option}
              </span>
            </button>
          );
        })}
      </div>

      {/* Explanation after answering */}
      {showResult && explanation && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={clsx(
            'mt-4 p-3 rounded-lg text-sm',
            isCorrect ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
          )}
        >
          <p className="font-medium mb-1">
            {isCorrect ? '✓ Correct!' : '✗ Not quite'}
          </p>
          <p>{explanation}</p>
        </motion.div>
      )}
    </div>
  );
}
