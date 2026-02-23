import { motion } from 'framer-motion';
import { Clock, Zap, Tag, RefreshCw, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/common';
import type { RepScenario } from '@/types';

interface ScenarioSelectProps {
  scenarios: RepScenario[];
  onSelect: (scenario: RepScenario) => void;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

const DIFFICULTY_COLORS = {
  beginner: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  advanced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export function ScenarioSelect({ scenarios, onSelect, onRegenerate, isRegenerating }: ScenarioSelectProps) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-content mb-2">
          Pick your challenge
        </h2>
        <p className="text-content-tertiary">
          Choose a scenario that matches what you want to practice right now.
        </p>
      </div>

      <div className="space-y-4">
        {scenarios.map((scenario, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => onSelect(scenario)}
            className="w-full text-left p-5 rounded-xl border border-border bg-surface
                       hover:border-brand-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <h3 className="font-semibold text-content group-hover:text-brand-600 transition-colors">
                {scenario.title}
              </h3>
              <span className={clsx(
                'px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0',
                DIFFICULTY_COLORS[scenario.difficulty] || DIFFICULTY_COLORS.intermediate,
              )}>
                {scenario.difficulty}
              </span>
            </div>

            <p className="text-sm text-content-secondary mb-3 line-clamp-3">
              {scenario.briefing}
            </p>

            <div className="flex items-center gap-4 text-xs text-content-tertiary">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                ~{scenario.estimatedMinutes} min
              </span>
              <span className="flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                {scenario.tasks.length} tasks
              </span>
              {scenario.skillTags.length > 0 && (
                <span className="flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" />
                  {scenario.skillTags.slice(0, 3).join(', ')}
                </span>
              )}
            </div>
          </motion.button>
        ))}
      </div>

      <div className="text-center mt-6">
        <button
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm text-content-tertiary
                     hover:text-content-secondary transition-colors disabled:opacity-50"
        >
          {isRegenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          These don't fit — generate new ones
        </button>
      </div>
    </div>
  );
}
