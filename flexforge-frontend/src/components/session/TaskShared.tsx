import { motion } from 'framer-motion';
import { Trophy, ChevronRight, RotateCcw } from 'lucide-react';
import { Card, Button } from '@/components/common';
import { StepLayout } from './StepLayout';
import { clsx } from 'clsx';

// ============================================
// TaskResultsScreen - Shared results view
// ============================================

interface TaskResultsScreenProps {
  score: number;           // 0-1
  passed: boolean;
  passingScore: number;    // 0-1
  correctCount: number;
  totalCount: number;
  itemLabel?: string;      // "questions" or "blanks"
  passedMessage?: string;
  failedMessage?: string;
  onRetry: () => void;
  onComplete: () => void;
  children?: React.ReactNode;  // Optional summary content
}

export function TaskResultsScreen({
  score,
  passed,
  passingScore,
  correctCount,
  totalCount,
  itemLabel = 'items',
  passedMessage = "Great job! You've demonstrated good understanding.",
  failedMessage,
  onRetry,
  onComplete,
  children,
}: TaskResultsScreenProps) {
  const defaultFailedMessage = `You need ${Math.round(passingScore * 100)}% to pass. Review and try again.`;

  return (
    <StepLayout
      icon={Trophy}
      iconGradient={passed ? "from-green-400 to-green-500" : "from-amber-400 to-amber-500"}
      title={passed ? "Great Job!" : "Keep Practicing"}
      subtitle={`You got ${correctCount} of ${totalCount} ${itemLabel} correct`}
    >
      <Card className="p-6 text-center">
        <div className={clsx(
          'text-6xl font-bold mb-4',
          passed ? 'text-green-500' : 'text-amber-500'
        )}>
          {Math.round(score * 100)}%
        </div>

        <p className="text-content-secondary mb-6">
          {passed ? passedMessage : (failedMessage || defaultFailedMessage)}
        </p>

        {children}

        <div className="flex gap-3 justify-center">
          {!passed && (
            <Button variant="secondary" onClick={onRetry}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          )}
          <Button onClick={onComplete}>
            {passed ? 'Continue' : 'Continue Anyway'}
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </Card>
    </StepLayout>
  );
}

// ============================================
// TaskProgress - Progress dots + animated bar
// ============================================

interface TaskProgressProps {
  currentIndex: number;
  totalItems: number;
  items: { id: string; status?: 'pending' | 'correct' | 'incorrect' | 'submitted' }[];
  onNavigate: (index: number) => void;
  color?: string;  // Tailwind color class (e.g., 'blue', 'purple')
  label?: string;  // "Question" or "Item"
}

export function TaskProgress({
  currentIndex,
  totalItems,
  items,
  onNavigate,
  color = 'blue',
  label = 'Item',
}: TaskProgressProps) {
  const colorMap: Record<string, { active: string; correct: string; bar: string }> = {
    blue: { active: 'bg-blue-500', correct: 'bg-green-400', bar: 'bg-blue-500' },
    purple: { active: 'bg-purple-500', correct: 'bg-green-400', bar: 'bg-purple-500' },
  };
  const colors = colorMap[color] || colorMap.blue;

  return (
    <>
      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-content-tertiary">
          {label} {currentIndex + 1} of {totalItems}
        </span>
        <div className="flex gap-1.5">
          {items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => onNavigate(i)}
              className={clsx(
                'w-2.5 h-2.5 rounded-full transition-all duration-200',
                i === currentIndex && `${colors.active} scale-125`,
                i !== currentIndex && item.status === 'correct' && 'bg-green-400',
                i !== currentIndex && item.status === 'incorrect' && 'bg-red-400',
                i !== currentIndex && item.status === 'submitted' && colors.correct,
                i !== currentIndex && (!item.status || item.status === 'pending') && 'bg-surface-tertiary'
              )}
            />
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-surface-tertiary rounded-full overflow-hidden mb-6">
        <motion.div
          className={`h-full ${colors.bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${((currentIndex + 1) / totalItems) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </>
  );
}

// ============================================
// TaskNavigation - Previous/Next buttons
// ============================================

interface TaskNavigationProps {
  onPrev: () => void;
  onNext: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  nextLabel?: string;
  nextDisabledLabel?: string;
  showCheckButton?: boolean;
  onCheck?: () => void;
  checkDisabled?: boolean;
  isLastItem?: boolean;
  allCompleted?: boolean;
}

export function TaskNavigation({
  onPrev,
  onNext,
  canGoPrev,
  canGoNext,
  nextLabel = 'Next',
  nextDisabledLabel,
  showCheckButton = false,
  onCheck,
  checkDisabled = false,
  isLastItem = false,
  allCompleted = false,
}: TaskNavigationProps) {
  const getFinalNextLabel = () => {
    if (isLastItem) {
      return allCompleted ? 'See Results' : (nextDisabledLabel || 'Complete All Items');
    }
    return nextLabel;
  };

  return (
    <div className="flex items-center justify-between mt-6">
      <Button
        variant="ghost"
        onClick={onPrev}
        disabled={!canGoPrev}
      >
        Previous
      </Button>

      <div className="flex gap-2">
        {showCheckButton && onCheck && (
          <Button
            variant="secondary"
            onClick={onCheck}
            disabled={checkDisabled}
          >
            Check Answer
          </Button>
        )}

        {(!showCheckButton || !onCheck) && (
          <Button
            onClick={onNext}
            disabled={!canGoNext}
          >
            {isLastItem ? getFinalNextLabel() : (
              <>{nextLabel} <ChevronRight className="w-4 h-4 ml-1" /></>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
