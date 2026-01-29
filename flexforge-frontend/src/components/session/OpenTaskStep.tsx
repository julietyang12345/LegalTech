import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
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
    color: 'bg-green-100 text-green-700 border-green-200',
    description: 'Quick and low-stakes',
  },
  medium: {
    label: '15-20 min',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    description: 'Some preparation needed',
  },
  challenging: {
    label: '30+ min',
    color: 'bg-rose-100 text-rose-700 border-rose-200',
    description: 'Requires planning',
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
        className="text-center mb-6"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-100 to-indigo-100 rounded-full mb-3">
          <Target className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-medium text-purple-700">
            {openTask.sectionTitle || 'Real-World Challenge'}
          </span>
        </div>
        <p className="text-gray-500 text-sm">
          {openTask.sectionSubtitle || 'Take your learning beyond the screen'}
        </p>
      </motion.div>

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={clsx(
          'bg-white rounded-2xl shadow-lg border overflow-hidden transition-all duration-300',
          isCompleted ? 'border-green-300 shadow-green-100' : 'border-gray-200'
        )}
      >
        {/* Card Header with Icon */}
        <div className="relative bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 p-6 text-white">
          {/* Floating Icon */}
          <div className="absolute -bottom-6 left-6 w-14 h-14 bg-white rounded-2xl shadow-lg flex items-center justify-center text-3xl">
            {openTask.icon || '🎯'}
          </div>

          {/* Difficulty Badge */}
          <div className="flex justify-end">
            <div className={clsx(
              'px-3 py-1 rounded-full text-xs font-medium border',
              'bg-white/20 text-white border-white/30'
            )}>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                {difficulty.label}
              </span>
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="pt-10 px-6 pb-6">
          {/* Title */}
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {openTask.title}
          </h2>

          {/* Context Badge */}
          <div className="flex items-center gap-2 mb-4">
            <span className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium',
              difficulty.color
            )}>
              {difficulty.description}
            </span>
            {openTask.context && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                <MapPin className="w-3 h-3" />
                {openTask.context}
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-gray-600 leading-relaxed mb-4">
            {openTask.description}
          </p>

          {/* Concept Connection */}
          <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-xl mb-4">
            <Sparkles className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-purple-900">Practicing</p>
              <p className="text-sm text-purple-700">{openTask.conceptConnection}</p>
            </div>
          </div>

          {/* Tips Section (Collapsible) */}
          {openTask.tips && openTask.tips.length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setShowTips(!showTips)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span>Tips for success</span>
                {showTips ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              <AnimatePresence>
                {showTips && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <ul className="mt-3 space-y-2 pl-6">
                      {openTask.tips.map((tip, index) => (
                        <li
                          key={index}
                          className="text-sm text-gray-600 list-disc"
                        >
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Action Button */}
          {!isCompleted ? (
            <button
              onClick={handleMarkComplete}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              I've Completed This Challenge
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 py-3 text-green-600 font-medium">
              <CheckCircle2 className="w-5 h-5" />
              Challenge Completed!
            </div>
          )}
        </div>
      </motion.div>

      {/* Reflection Section (Shows after completion) */}
      <AnimatePresence>
        {showReflection && openTask.reflectionPrompts && openTask.reflectionPrompts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: 0.2 }}
            className="mt-6 bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden"
          >
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-xl">🤔</span>
                Quick Reflection
              </h3>

              <div className="space-y-4">
                {openTask.reflectionPrompts.map((prompt, index) => (
                  <div key={index}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {prompt}
                    </label>
                    <textarea
                      value={reflectionAnswers[index] || ''}
                      onChange={(e) => setReflectionAnswers(prev => ({
                        ...prev,
                        [index]: e.target.value
                      }))}
                      placeholder="Share your thoughts... (optional)"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      rows={2}
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleFinishReflection}
                className="mt-4 w-full py-3 px-6 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-colors"
              >
                Continue to Next Step →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip option (if not completed) */}
      {!isCompleted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-6"
        >
          <button
            onClick={onComplete}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Skip for now
          </button>
        </motion.div>
      )}
    </div>
  );
}
