import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/common';
import { useRepsStore } from '@/stores/repsStore';
import { RepTimer } from './RepTimer';
import { RepTaskItem } from './RepTaskItem';
import { ScratchPad } from './ScratchPad';
import { RepCoachChat } from './RepCoachChat';
import type { RepScenario } from '@/types';

interface RepPracticeProps {
  scenario: RepScenario;
  onComplete: () => void;
  onSwitchToStudy: (skill: string) => void;
}

export function RepPractice({ scenario, onComplete, onSwitchToStudy }: RepPracticeProps) {
  const {
    activeRep,
    tasksCompleted,
    toggleTask,
    requestHint,
    isHintLoading,
  } = useRepsStore();

  const [showCoach, setShowCoach] = useState(false);
  const [showBriefing, setShowBriefing] = useState(true);
  const [showScratchPad, setShowScratchPad] = useState(true);

  const allTasksDone = tasksCompleted.length === scenario.tasks.length;
  const hintsRevealed = activeRep?.hintsRevealed || [];

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface">
        <div className="flex items-center gap-4">
          <RepTimer estimatedMinutes={scenario.estimatedMinutes} />
          <div className="hidden sm:block">
            <h1 className="font-semibold text-content text-sm">{scenario.title}</h1>
            <span className="text-xs text-content-tertiary">
              {tasksCompleted.length}/{scenario.tasks.length} tasks done
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onSwitchToStudy(scenario.skillTags[0] || scenario.title)}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-content-tertiary hover:text-content-secondary transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Switch to study mode
          </button>
          <button
            onClick={() => setShowCoach(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors dark:bg-emerald-900/20 dark:text-emerald-400"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Coach
          </button>
          <Button
            onClick={onComplete}
            size="sm"
            disabled={tasksCompleted.length === 0}
          >
            {allTasksDone ? 'Submit & get feedback' : 'Finish early'}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          {/* Scenario briefing (collapsible) */}
          <div className="mb-6">
            <button
              onClick={() => setShowBriefing(!showBriefing)}
              className="flex items-center gap-2 text-sm font-medium text-content-secondary hover:text-content mb-2"
            >
              {showBriefing ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Scenario Briefing
            </button>
            {showBriefing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-4 rounded-xl bg-surface-tertiary border border-border overflow-hidden"
              >
                <p className="text-sm text-content-secondary whitespace-pre-wrap leading-relaxed">
                  {scenario.briefing}
                </p>
              </motion.div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tasks */}
            <div>
              <h3 className="text-sm font-medium text-content-secondary mb-3">Tasks</h3>
              <div className="space-y-3">
                {scenario.tasks.map((task, i) => (
                  <RepTaskItem
                    key={task.id}
                    task={task}
                    index={i}
                    isCompleted={tasksCompleted.includes(task.id)}
                    hints={hintsRevealed.filter(h => h.taskIndex === i)}
                    isHintLoading={isHintLoading}
                    onToggle={() => toggleTask(task.id)}
                    onRequestHint={() => requestHint(i)}
                  />
                ))}
              </div>
            </div>

            {/* Scratch pad */}
            <div>
              <button
                onClick={() => setShowScratchPad(!showScratchPad)}
                className="flex items-center gap-2 text-sm font-medium text-content-secondary hover:text-content mb-3"
              >
                {showScratchPad ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Scratch Pad
              </button>
              {showScratchPad && (
                <div className="rounded-xl border border-border bg-surface overflow-hidden" style={{ minHeight: '300px' }}>
                  <ScratchPad />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Coach chat */}
      <RepCoachChat
        isOpen={showCoach}
        onClose={() => setShowCoach(false)}
        scenarioTitle={scenario.title}
      />
    </div>
  );
}
