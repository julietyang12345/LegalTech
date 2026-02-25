import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Mail, HelpCircle, Loader2, ChevronDown, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useRepsStore } from '@/stores/repsStore';
import type { RepBrief, RepScenarioTask, RepHintRevealed } from '@/types';

interface DeliverableModeProps {
  brief: RepBrief;
  template: string;
  tasks: RepScenarioTask[];
  hintsRevealed: RepHintRevealed[];
  isHintLoading: boolean;
  onRequestHint: (taskIndex: number) => void;
}

export function DeliverableMode({
  brief,
  template,
  tasks,
  hintsRevealed,
  isHintLoading,
  onRequestHint,
}: DeliverableModeProps) {
  const { scratchPadContent, setScratchPad } = useRepsStore();
  const [showFocusAreas, setShowFocusAreas] = useState(true);
  const [showHints, setShowHints] = useState(true);

  const ChannelIcon = brief.channel === 'slack' ? MessageSquare : Mail;

  const timestamp = useMemo(() => {
    const now = new Date();
    return `today at ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }, []);

  const avatarInitial = brief.managerName.charAt(0).toUpperCase();

  // All hints for deliverable are indexed to 0
  const deliverableHints = hintsRevealed.filter(h => h.taskIndex === 0);
  const maxHints = 3;
  const hintsRemaining = maxHints - deliverableHints.length;

  return (
    <div className="space-y-6">
      {/* Manager brief card */}
      <div className="rounded-xl shadow-card overflow-hidden border border-border bg-surface">
        <div className="px-5 py-3 border-b border-border bg-surface-secondary">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-semibold">
                  {avatarInitial}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-surface-secondary" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-content">{brief.managerName}</span>
                  <span className="text-xs text-content-tertiary">· {brief.managerRole}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-content-tertiary">
                  <ChannelIcon className="w-3 h-3" />
                  {brief.channel === 'slack'
                    ? <span># general</span>
                    : <span>Subject: Re: {brief.deliverable}</span>
                  }
                </div>
              </div>
            </div>
            <span className="text-xs text-content-tertiary">{timestamp}</span>
          </div>
        </div>
        <div className="p-5">
          <p className="text-sm text-content-secondary whitespace-pre-wrap leading-relaxed">
            {brief.message}
          </p>
        </div>
        <div className="px-5 py-3 border-t border-border bg-surface-secondary flex items-center justify-between">
          <span className="text-xs text-content-tertiary flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Deadline: <span className="font-medium text-content-secondary">{brief.deadline}</span>
          </span>
          <span className="text-xs font-medium text-brand-600 dark:text-brand-400">
            Deliverable: {brief.deliverable}
          </span>
        </div>
      </div>

      {/* Template editor */}
      <div>
        <h3 className="text-sm font-medium text-content-secondary mb-2">Your deliverable</h3>
        <textarea
          value={scratchPadContent}
          onChange={(e) => setScratchPad(e.target.value)}
          className="w-full min-h-[400px] p-4 rounded-xl border border-border bg-surface font-mono text-sm
                     text-content leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand-300
                     dark:focus:ring-brand-600 placeholder:text-content-tertiary"
          placeholder="Fill in the template above..."
          spellCheck={false}
        />
        {scratchPadContent === template && (
          <p className="mt-1 text-xs text-content-tertiary">
            Replace the [fill in] placeholders with your answers
          </p>
        )}
      </div>

      {/* Focus areas */}
      <div>
        <button
          onClick={() => setShowFocusAreas(!showFocusAreas)}
          className="flex items-center gap-2 text-sm font-medium text-content-secondary hover:text-content mb-3"
        >
          <ChevronDown className={clsx('w-4 h-4 transition-transform', showFocusAreas && 'rotate-180')} />
          Focus Areas ({tasks.length})
        </button>
        {showFocusAreas && (
          <div className="space-y-2">
            {tasks.map((task, i) => (
              <div
                key={task.id}
                className="p-3 rounded-lg border border-border bg-surface-tertiary"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-brand-600 dark:text-brand-400">
                    Area {i + 1}
                  </span>
                </div>
                <h4 className="font-medium text-sm text-content mb-0.5">{task.title}</h4>
                <p className="text-xs text-content-tertiary">{task.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hint controls */}
      <div>
        <div className="flex items-center gap-3">
          <button
            onClick={hintsRemaining > 0 ? () => onRequestHint(0) : undefined}
            disabled={isHintLoading || hintsRemaining <= 0}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors',
              hintsRemaining <= 0
                ? 'text-content-tertiary cursor-not-allowed'
                : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20',
            )}
          >
            {isHintLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <HelpCircle className="w-3.5 h-3.5" />
            )}
            {deliverableHints.length === 0
              ? 'Stuck? Get a hint'
              : hintsRemaining > 0
                ? `Next hint (${hintsRemaining} left)`
                : 'No hints left'}
          </button>

          {deliverableHints.length > 0 && (
            <button
              onClick={() => setShowHints(!showHints)}
              className="inline-flex items-center gap-1 text-xs text-content-tertiary hover:text-content-secondary"
            >
              <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', showHints && 'rotate-180')} />
              {deliverableHints.length} hint{deliverableHints.length > 1 ? 's' : ''} revealed
            </button>
          )}
        </div>

        {/* Revealed hints */}
        <AnimatePresence>
          {showHints && deliverableHints.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 space-y-2 overflow-hidden"
            >
              {deliverableHints.map((hint, i) => (
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
  );
}
