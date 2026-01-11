import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Code2, Lightbulb, Eye, Clock, MessageCircle, Lock, AlertTriangle } from 'lucide-react';
import { Card, Button, TextArea, ProgressBar } from '@/components/common';
import { StepLayout } from './StepLayout';
import { useAuthStore } from '@/stores/authStore';
import { useCompanionStore } from '@/stores/companionStore';
import { QuotaTier } from '@/types';
import { clsx } from 'clsx';
import type { CurriculumDay, Session, Task } from '@/types';

interface TaskStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

export function TaskStep({ day, onComplete }: TaskStepProps) {
  const [code, setCode] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [isStuck, setIsStuck] = useState(false);

  const { hasTierAccess } = useAuthStore();
  const { encourage } = useCompanionStore();

  const canUseAITutor = hasTierAccess(QuotaTier.PRO);
  const isPremium = hasTierAccess(QuotaTier.PREMIUM);

  // TaskStep only receives code format tasks (TaskRouter handles routing)
  const task = day.task1 as Task | undefined;
  const stuckThreshold = task?.stuckDetection?.triggerAfterMinutes || 7;
  // Use actual hints array length if available
  const totalHints = task?.hints?.length || 3;
  const maxFreeHints = Math.min(totalHints, 1);
  const maxProHints = totalHints;

  // Timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMinutes(prev => {
        const newValue = prev + 1/60; // Update every second
        if (newValue >= stuckThreshold && !isStuck) {
          setIsStuck(true);
          encourage('stuck');
        }
        return newValue;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [stuckThreshold, isStuck, encourage]);

  const handleRevealHint = () => {
    const maxHints = canUseAITutor ? maxProHints : maxFreeHints;
    if (hintsUsed < maxHints) {
      setHintsUsed(prev => prev + 1);
      setShowHint(true);
    }
  };

  const getHint = (index: number): string | undefined => {
    // Backend generates hints as array of {level, hint} objects
    if (task?.hints && Array.isArray(task.hints) && task.hints[index]) {
      const hint = task.hints[index];
      return typeof hint === 'string' ? hint : hint?.hint;
    }
    // Fallback to legacy structure
    if (canUseAITutor && task?.pro?.hints && task.pro.hints[index]) {
      return task.pro.hints[index];
    }
    return task?.free?.hint1;
  };

  return (
    <StepLayout
      icon={Code2}
      iconGradient="from-focus-400 to-focus-500"
      title="Let's Try It! 💻"
      subtitle="Experiment freely — mistakes help you learn"
    >
      {/* Timer and progress */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-gray-500">
          <Clock className="w-4 h-4" />
          <span>{Math.floor(elapsedMinutes)}:{String(Math.floor((elapsedMinutes % 1) * 60)).padStart(2, '0')}</span>
        </div>
        <ProgressBar
          value={Math.min(elapsedMinutes, task?.estimatedMinutes || 10)}
          max={task?.estimatedMinutes || 10}
          size="sm"
          className="w-32"
        />
      </div>

      {/* Stuck detection alert */}
      <AnimatePresence>
        {isStuck && !showSolution && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="bg-alert-50 border border-alert-200">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-alert-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-alert-800 mb-1">
                      Need a nudge?
                    </h3>
                    <p className="text-sm text-alert-700 mb-3">
                      Totally normal! Try one of these:
                    </p>
                    <ul className="text-sm text-alert-700 space-y-1 mb-3">
                      {task?.stuckDetection?.suggestions?.map((suggestion, i) => (
                        <li key={i}>• {suggestion}</li>
                      ))}
                    </ul>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleRevealHint}
                        leftIcon={<Lightbulb className="w-4 h-4" />}
                      >
                        Get a hint
                      </Button>
                      {canUseAITutor && (
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<MessageCircle className="w-4 h-4" />}
                        >
                          Ask AI Tutor
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task description */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {task?.title || 'Practice Task'}
          </h2>
          <p className="text-gray-600 mb-4">
            {task?.description || task?.free?.challengeDescription}
          </p>

          {/* Expected output */}
          {(task?.expectedOutput || task?.free?.expectedOutput) && (
            <div className="p-4 bg-gray-100 rounded-lg mb-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Expected output:</p>
              <pre className="text-sm text-gray-600 whitespace-pre-wrap">
                {task?.expectedOutput || task?.free?.expectedOutput}
              </pre>
            </div>
          )}

          {/* Starter code - available for all tiers */}
          {(task?.starterCode || task?.pro?.starterCode) && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Starter code:</p>
              <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg text-sm overflow-x-auto">
                {task?.starterCode || task?.pro?.starterCode}
              </pre>
            </div>
          )}
        </div>
      </Card>

      {/* Code editor */}
      <Card>
        <div className="p-6">
          <TextArea
            label="Give it a try"
            placeholder="// Start typing... there's no wrong answer while learning!"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
          />
          <p className="text-xs text-gray-400 mt-2">
            Stuck? Use hints or peek at the solution — that's what they're for!
          </p>
        </div>
      </Card>

      {/* Hints section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRevealHint}
            disabled={hintsUsed >= (canUseAITutor ? maxProHints : maxFreeHints)}
            leftIcon={<Lightbulb className="w-4 h-4" />}
          >
            Hint ({hintsUsed}/{canUseAITutor ? maxProHints : maxFreeHints})
          </Button>

          {canUseAITutor ? (
            <Button variant="ghost" size="sm" leftIcon={<MessageCircle className="w-4 h-4" />}>
              Ask AI Tutor
            </Button>
          ) : (
            <div className="flex items-center gap-1 text-sm text-gray-400">
              <Lock className="w-3 h-3" />
              AI Tutor (PRO)
            </div>
          )}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowSolution(!showSolution)}
          leftIcon={<Eye className="w-4 h-4" />}
        >
          {showSolution ? 'Hide Answer' : 'See How It Works'}
        </Button>
      </div>

      {/* Hint display */}
      <AnimatePresence>
        {showHint && hintsUsed > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="bg-amber-50 border border-amber-200">
              <div className="p-4">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-amber-800 mb-1">Hint {hintsUsed}</h4>
                    <p className="text-amber-700">{getHint(hintsUsed - 1)}</p>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Solution display */}
      <AnimatePresence>
        {showSolution && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="bg-focus-50 border border-focus-200">
              <div className="p-4">
                <h4 className="font-medium text-focus-800 mb-3">Here's one way to do it:</h4>
                <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                  {task?.solution || task?.free?.solution || '// Solution will be shown here'}
                </pre>

                {/* Annotations */}
                {((task?.solutionAnnotations && task.solutionAnnotations.length > 0) ||
                  (task?.free?.solutionAnnotations && task.free.solutionAnnotations.length > 0)) && (
                  <div className="mt-4 space-y-2">
                    <h5 className="font-medium text-focus-700">Why this works:</h5>
                    {(task?.solutionAnnotations || task?.free?.solutionAnnotations || []).map((annotation: string, i: number) => (
                      <p key={i} className="text-sm text-focus-700">{annotation}</p>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

    </StepLayout>
  );
}
