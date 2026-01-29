import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  Check,
  Lightbulb,
  Clock,
  MapPin,
  Sparkles,
  Target
} from 'lucide-react';
import { clsx } from 'clsx';
import type { CurriculumDay, OpenTask } from '@/types';

interface OpenTaskStepProps {
  day: CurriculumDay;
  session: any;
  onComplete: () => void;
}

// Difficulty badge colors and labels
const DIFFICULTY_CONFIG = {
  easy: {
    label: '5-10 min',
    color: 'text-green-600',
  },
  medium: {
    label: '15-20 min',
    color: 'text-amber-600',
  },
  challenging: {
    label: '30+ min',
    color: 'text-rose-600',
  },
};

export function OpenTaskStep({ day, onComplete }: OpenTaskStepProps) {
  const openTask = day.openTask as OpenTask | undefined;
  const [isCompleted, setIsCompleted] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [reflectionAnswers, setReflectionAnswers] = useState<Record<number, string>>({});

  // If no openTask, show a message and allow skipping
  if (!openTask) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <div className="bg-gray-50 rounded-2xl p-8">
          <p className="text-gray-500">No real-world challenge for today.</p>
          <button
            onClick={onComplete}
            className="mt-4 text-brand-500 hover:text-brand-600 font-medium"
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  const difficulty = DIFFICULTY_CONFIG[openTask.difficulty] || DIFFICULTY_CONFIG.medium;

  const handleMarkComplete = () => {
    setIsCompleted(true);
    setShowReflection(true);
  };

  const handleFinishReflection = () => {
    onComplete();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-4"
      >
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-xl">
          {openTask.icon || '🎯'}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">
              {openTask.sectionTitle || 'Real-World Challenge'}
            </h2>
            <span className={clsx('text-xs font-medium flex items-center gap-1', difficulty.color)}>
              <Clock className="w-3 h-3" />
              {difficulty.label}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {openTask.sectionSubtitle || 'Practice beyond the screen'}
          </p>
        </div>
      </motion.div>

      {/* Main Content Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={clsx(
          'bg-white rounded-xl border p-5 transition-all',
          isCompleted ? 'border-green-200 bg-green-50/30' : 'border-gray-200'
        )}
      >
        {/* Title */}
        <h3 className="font-medium text-gray-900 mb-2">
          {openTask.title}
        </h3>

        {/* Context */}
        {openTask.context && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
            <MapPin className="w-3 h-3" />
            {openTask.context}
          </div>
        )}

        {/* Description */}
        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          {openTask.description}
        </p>

        {/* Concept Connection */}
        <div className="flex items-start gap-2.5 p-3 bg-purple-50 rounded-lg mb-4">
          <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-purple-700">
            <span className="font-medium">Practicing:</span> {openTask.conceptConnection}
          </p>
        </div>

        {/* Tips Section (Collapsible) */}
        {openTask.tips && openTask.tips.length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setShowTips(!showTips)}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              <span>Tips</span>
              {showTips ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            <AnimatePresence>
              {showTips && (
                <motion.ul
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 space-y-1 pl-5 text-sm text-gray-600 list-disc overflow-hidden"
                >
                  {openTask.tips.map((tip, index) => (
                    <li key={index}>{tip}</li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Completion - subtle checkbox style */}
        {!isCompleted ? (
          <button
            onClick={handleMarkComplete}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors group"
          >
            <div className="w-5 h-5 rounded border-2 border-gray-300 group-hover:border-purple-400 flex items-center justify-center transition-colors">
              <Check className="w-3 h-3 text-transparent group-hover:text-purple-400" />
            </div>
            <span>I've done this challenge</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <div className="w-5 h-5 rounded bg-green-500 flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
            <span>Completed</span>
          </div>
        )}
      </motion.div>

      {/* Reflection Section (Shows after completion) */}
      <AnimatePresence>
        {showReflection && openTask.reflectionPrompts && openTask.reflectionPrompts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.1 }}
            className="mt-4 bg-white rounded-xl border border-gray-200 p-5"
          >
            <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
              <span>🤔</span> Quick Reflection
            </h4>

            <div className="space-y-3">
              {openTask.reflectionPrompts.map((prompt, index) => (
                <div key={index}>
                  <label className="block text-sm text-gray-700 mb-1.5">
                    {prompt}
                  </label>
                  <textarea
                    value={reflectionAnswers[index] || ''}
                    onChange={(e) => setReflectionAnswers(prev => ({
                      ...prev,
                      [index]: e.target.value
                    }))}
                    placeholder="Optional..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={2}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleFinishReflection}
              className="mt-4 text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              Continue →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Continue/Skip option */}
      {!showReflection && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mt-5"
        >
          <button
            onClick={onComplete}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            {isCompleted ? 'Continue →' : 'Skip for now'}
          </button>
        </motion.div>
      )}
    </div>
  );
}
