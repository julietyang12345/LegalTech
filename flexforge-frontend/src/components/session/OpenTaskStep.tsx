import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  Check,
  Lightbulb,
  Clock,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { CurriculumDay, OpenTask } from '@/types';
import { ExerciseLoadingScreen } from '@/components/common';
import { useSessionStore } from '@/stores/sessionStore';

interface OpenTaskStepProps {
  day: CurriculumDay;
  session: any;
  onComplete: () => void;
}

// Difficulty config
const DIFFICULTY_CONFIG = {
  easy: { label: '5-10 min', color: 'text-green-600 bg-green-50' },
  medium: { label: '15-20 min', color: 'text-amber-600 bg-amber-50' },
  challenging: { label: '30+ min', color: 'text-rose-600 bg-rose-50' },
};

export function OpenTaskStep({ day, session, onComplete }: OpenTaskStepProps) {
  const openTask = day.openTask as OpenTask | undefined;
  const [isCompleted, setIsCompleted] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [reflectionAnswers, setReflectionAnswers] = useState<Record<number, string>>({});
  const { isCoreLoaded } = useSessionStore();

  // Show loading UI while core content is being loaded (openTask comes from core via Haiku)
  if (!openTask && !isCoreLoaded) {
    return (
      <div className="max-w-lg mx-auto">
        <ExerciseLoadingScreen
          type="task"
          skillName={session?.skillName || 'your skill'}
          dayNumber={day.day}
        />
      </div>
    );
  }

  // Auto-skip if no open task - hide this section entirely
  useEffect(() => {
    if (!openTask && isCoreLoaded) {
      onComplete();
    }
  }, [openTask, isCoreLoaded, onComplete]);

  if (!openTask) {
    return null;
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
      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={clsx(
          'bg-white rounded-2xl shadow-md border overflow-hidden',
          isCompleted ? 'border-green-200' : 'border-purple-100'
        )}
      >
        {/* Header - Purple accent bar with icon */}
        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100">
          <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-xl flex items-center justify-center text-xl shadow-sm">
            {openTask.icon || '🎯'}
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">
              {openTask.sectionTitle || 'Real-World Task'}
            </h2>
            <p className="text-sm text-gray-500">
              {openTask.sectionSubtitle || 'Take your learning beyond the screen'}
            </p>
          </div>
          <div className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', difficulty.color)}>
            <Clock className="w-3 h-3" />
            {difficulty.label}
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* Title */}
          <h3 className="font-medium text-gray-900 text-lg mb-2">
            {openTask.title}
          </h3>

          {/* Context badge */}
          {openTask.context && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
              <MapPin className="w-3.5 h-3.5" />
              {openTask.context}
            </div>
          )}

          {/* Description */}
          <p className="text-gray-600 text-sm leading-relaxed mb-4">
            {openTask.description}
          </p>

          {/* Concept Connection */}
          <div className="flex items-start gap-2.5 p-3 bg-purple-50/70 rounded-lg mb-4">
            <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-purple-700">
              <span className="font-medium">Practicing:</span> {openTask.conceptConnection}
            </p>
          </div>

          {/* Tips */}
          {openTask.tips && openTask.tips.length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setShowTips(!showTips)}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span>Tips for success</span>
                {showTips ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              <AnimatePresence>
                {showTips && (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 space-y-1 pl-6 text-sm text-gray-600 list-disc overflow-hidden"
                  >
                    {openTask.tips.map((tip, index) => (
                      <li key={index}>{tip}</li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Completion checkbox - subtle */}
          <div className="pt-3 border-t border-gray-100">
            {!isCompleted ? (
              <button
                onClick={handleMarkComplete}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-purple-600 transition-colors group"
              >
                <div className="w-5 h-5 rounded border-2 border-gray-300 group-hover:border-purple-400 flex items-center justify-center transition-colors">
                  <Check className="w-3 h-3 text-transparent group-hover:text-purple-400" />
                </div>
                <span>I've completed this task</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <div className="w-5 h-5 rounded bg-green-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <span className="font-medium">Completed!</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Reflection */}
      <AnimatePresence>
        {showReflection && openTask.reflectionPrompts && openTask.reflectionPrompts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
          >
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span>🤔</span> Quick Reflection
            </h4>

            <div className="space-y-3">
              {openTask.reflectionPrompts.map((prompt, index) => (
                <div key={index}>
                  <label className="block text-sm text-gray-700 mb-1.5">{prompt}</label>
                  <textarea
                    value={reflectionAnswers[index] || ''}
                    onChange={(e) => setReflectionAnswers(prev => ({ ...prev, [index]: e.target.value }))}
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

      {/* Skip */}
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
