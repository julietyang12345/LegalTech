import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, HelpCircle, Loader2, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import type { RepScenarioTask, RepHintRevealed } from '@/types';

interface RepTaskItemProps {
  task: RepScenarioTask;
  index: number;
  isCompleted: boolean;
  hints: RepHintRevealed[];
  isHintLoading: boolean;
  onToggle: () => void;
  onRequestHint: () => void;
}

export function RepTaskItem({
  task,
  index,
  isCompleted,
  hints,
  isHintLoading,
  onToggle,
  onRequestHint,
}: RepTaskItemProps) {
  const [showHints, setShowHints] = useState(false);
  const maxHints = 3;
  const hintsRemaining = maxHints - hints.length;

  return (
    <div className={clsx(
      'rounded-xl border transition-colors',
      isCompleted
        ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10'
        : 'border-border bg-surface'
    )}>
      <div className="flex items-start gap-3 p-4">
        {/* Checkbox */}
        <button
          onClick={onToggle}
          className={clsx(
            'w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
            isCompleted
              ? 'bg-green-500 border-green-500'
              : 'border-border-secondary hover:border-brand-400'
          )}
        >
          {isCompleted && <Check className="w-4 h-4 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-content-tertiary">
              Task {index + 1}
            </span>
            <span className="text-xs text-content-tertiary">
              ~{task.estimatedMinutes}min
            </span>
          </div>
          <h4 className={clsx(
            'font-medium mb-1',
            isCompleted ? 'text-content-secondary line-through' : 'text-content'
          )}>
            {task.title}
          </h4>
          <p className="text-sm text-content-tertiary">
            {task.description}
          </p>

          {/* Hint button */}
          {!isCompleted && (
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={hints.length < maxHints ? onRequestHint : undefined}
                disabled={isHintLoading || hints.length >= maxHints}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors',
                  hints.length >= maxHints
                    ? 'text-content-tertiary cursor-not-allowed'
                    : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                )}
              >
                {isHintLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <HelpCircle className="w-3.5 h-3.5" />
                )}
                {hints.length === 0
                  ? 'Stuck? Get a hint'
                  : hintsRemaining > 0
                    ? `Get hint (${hintsRemaining} left)`
                    : 'No hints left'}
              </button>

              {hints.length > 0 && (
                <button
                  onClick={() => setShowHints(!showHints)}
                  className="inline-flex items-center gap-1 text-xs text-content-tertiary hover:text-content-secondary"
                >
                  <ChevronDown className={clsx(
                    'w-3.5 h-3.5 transition-transform',
                    showHints && 'rotate-180'
                  )} />
                  {hints.length} hint{hints.length > 1 ? 's' : ''} revealed
                </button>
              )}
            </div>
          )}

          {/* Revealed hints */}
          <AnimatePresence>
            {showHints && hints.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 space-y-2 overflow-hidden"
              >
                {hints.map((hint, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800"
                  >
                    <div className="text-xs font-medium text-amber-600 mb-1">
                      {hint.level === 1 ? 'Nudge' : hint.level === 2 ? 'Hint' : 'Walkthrough'}
                    </div>
                    <p className="text-sm text-content-secondary whitespace-pre-wrap">
                      {hint.hint}
                    </p>
                    {hint.encouragement && (
                      <p className="text-xs text-amber-600 mt-2 italic">
                        {hint.encouragement}
                      </p>
                    )}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
