import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, ChevronDown, CheckCircle, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/common';
import type { RoleSimulation } from '@/data/careerPathsRoles';

interface DeliverableTaskProps {
  role: RoleSimulation;
  onComplete: () => void;
}

export function DeliverableTask({ role, onComplete }: DeliverableTaskProps) {
  const navigate = useNavigate();
  const { task } = role;
  const [text, setText] = useState(task.template);
  const [revealedHints, setRevealedHints] = useState<number>(0);
  const [showHints, setShowHints] = useState(false);

  const hasEdited = text !== task.template;
  const hintsAvailable = task.hints.length - revealedHints;

  const revealNextHint = () => {
    if (revealedHints < task.hints.length) {
      setRevealedHints((prev) => prev + 1);
      setShowHints(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-3xl mx-auto"
    >
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold text-content mb-1">{task.title}</h2>
        <p className="text-sm text-content-secondary">{task.instructions}</p>
      </div>

      {/* Skill tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {role.skillTags.map((tag) => (
          <span
            key={tag}
            className="px-2.5 py-1 text-xs font-medium bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 rounded-full"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Template editor */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden mb-4">
        <div className="px-4 py-2.5 border-b border-border bg-surface-secondary flex items-center justify-between">
          <span className="text-sm font-medium text-content-secondary">Your deliverable</span>
          <span className="text-xs text-content-tertiary">~{task.estimatedMinutes} min</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full p-4 text-sm text-content bg-transparent resize-none focus:outline-none font-mono leading-relaxed placeholder:text-content-tertiary"
          style={{ minHeight: '400px' }}
        />
      </div>

      {/* Hint controls */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={hintsAvailable > 0 ? revealNextHint : undefined}
          disabled={hintsAvailable <= 0}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors',
            hintsAvailable <= 0
              ? 'text-content-tertiary cursor-not-allowed'
              : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
          )}
        >
          <HelpCircle className="w-4 h-4" />
          {revealedHints === 0
            ? 'Stuck? Get a hint'
            : hintsAvailable > 0
              ? `Get another hint (${hintsAvailable} left)`
              : 'No more hints'}
        </button>

        {revealedHints > 0 && (
          <button
            onClick={() => setShowHints(!showHints)}
            className="inline-flex items-center gap-1 text-sm text-content-tertiary hover:text-content-secondary"
          >
            <ChevronDown
              className={clsx('w-4 h-4 transition-transform', showHints && 'rotate-180')}
            />
            {revealedHints} hint{revealedHints > 1 ? 's' : ''} revealed
          </button>
        )}
      </div>

      {/* Revealed hints */}
      <AnimatePresence>
        {showHints && revealedHints > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 mb-6 overflow-hidden"
          >
            {task.hints.slice(0, revealedHints).map((hint, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800"
              >
                <div className="text-xs font-medium text-amber-600 mb-1.5">
                  {hint.level === 1 ? 'Nudge' : 'Detailed Example'}
                </div>
                <p className="text-sm text-content-secondary whitespace-pre-wrap leading-relaxed">
                  {hint.hint}
                </p>
                {hint.encouragement && (
                  <p className="text-xs text-amber-600 mt-2 italic">{hint.encouragement}</p>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button
          size="lg"
          onClick={onComplete}
          disabled={!hasEdited}
          leftIcon={<CheckCircle className="w-5 h-5" />}
        >
          I'm Done — See Example
        </Button>

        <button
          onClick={() => navigate('/register')}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
        >
          <Lock className="w-4 h-4" />
          Want AI feedback on your work? Sign up free
        </button>
      </div>
    </motion.div>
  );
}
