import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle, Lightbulb, Rocket, Target } from 'lucide-react';
import { clsx } from 'clsx';
import { Button, MultipleChoiceQuestion } from '@/components/common';
import type { RoleSimulation } from '@/data/careerPathsRoles';

interface SimulationDebriefProps {
  role: RoleSimulation;
  onTryAnother: () => void;
}

export function SimulationDebrief({ role, onTryAnother }: SimulationDebriefProps) {
  const navigate = useNavigate();
  const { debrief } = role;
  const quiz = debrief.quizQuestion;

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const hasAnswered = selectedAnswer !== null;
  const isCorrect = hasAnswered && selectedAnswer === quiz.correctIndex;

  const handleSelect = useCallback(
    (index: number) => {
      if (hasAnswered) return;
      setSelectedAnswer(index);
    },
    [hasAnswered],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-2xl mx-auto"
    >
      {/* Example deliverable */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-bold text-content">Here's what a strong answer looks like</h2>
        </div>
        <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
          <pre className="p-4 text-sm text-content-secondary whitespace-pre-wrap leading-relaxed font-mono overflow-x-auto">
            {debrief.exampleDeliverable}
          </pre>
        </div>
      </div>

      {/* What seniors do differently */}
      <div className="bg-surface rounded-xl shadow-card p-5 mb-6 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-purple-500" />
          <h3 className="font-semibold text-content">What senior {role.role}s do differently</h3>
        </div>
        <p className="text-sm text-content-secondary leading-relaxed">
          {debrief.whatSeniorsDoDifferently}
        </p>
      </div>

      {/* Quiz */}
      <div className="mb-6">
        <h3 className="font-semibold text-content mb-3">Quick check</h3>
        <MultipleChoiceQuestion
          question={quiz.question}
          options={quiz.options}
          correctIndex={quiz.correctIndex}
          selectedIndex={selectedAnswer}
          onSelect={handleSelect}
          showResult={hasAnswered}
          questionNumber={1}
        />

        {/* Explanation */}
        {hasAnswered && quiz.explanation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden"
          >
            <div
              className={clsx(
                'px-4 py-2.5 border-b flex items-center gap-2',
                isCorrect
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800'
                  : 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800',
              )}
            >
              <span
                className={clsx(
                  'text-sm font-semibold',
                  isCorrect ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400',
                )}
              >
                {isCorrect ? 'Correct!' : 'Not quite —'}
              </span>
              {quiz.conceptTitle && (
                <>
                  <Lightbulb className="w-3.5 h-3.5 text-blue-500 ml-1" />
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    {quiz.conceptTitle}
                  </span>
                </>
              )}
            </div>

            <div className="px-4 py-3 bg-surface space-y-2">
              {quiz.explanation.split('\n\n').map((paragraph, i) => (
                <p
                  key={i}
                  className={clsx(
                    'text-sm leading-relaxed',
                    i === 0 ? 'font-medium text-content' : 'text-content-secondary',
                  )}
                >
                  {paragraph}
                </p>
              ))}
            </div>

            {quiz.realWorldContext && (
              <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-200 dark:border-amber-800 flex items-start gap-2">
                <Target className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  {quiz.realWorldContext}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Signup CTA */}
      {hasAnswered && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="bg-surface rounded-2xl shadow-card p-6 text-center border border-border">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gradient-to-br from-brand-400 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
              <Rocket className="w-7 h-7 text-white" />
            </div>

            <h2 className="text-xl font-bold text-content mb-2">
              {debrief.signupHook.headline}
            </h2>
            <p className="text-sm text-content-secondary mb-5">
              Get a full 7-day curriculum personalized to YOUR background.
            </p>

            <ul className="text-left space-y-2 mb-5 max-w-md mx-auto">
              {debrief.signupHook.valueProps.map((prop, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-content-secondary">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  {prop}
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                rightIcon={<ArrowRight className="w-5 h-5" />}
              >
                {debrief.signupHook.ctaText}
              </Button>
              <Button variant="ghost" onClick={onTryAnother} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                Try Another Role
              </Button>
            </div>

            <p className="mt-3 text-xs text-content-tertiary">
              No credit card required. Free plan includes 1 full career path.
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
