import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Target,
  HelpCircle,
  Sparkles,
  Rocket,
  BookOpen,
  Lightbulb,
  Zap,
  Flame,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button, MultipleChoiceQuestion } from '@/components/common';
import {
  DEMO_TOPIC,
  DEMO_PREPROMPT,
  DEMO_QUIZ,
} from '@/data/demoContent';

const STEP_LABELS = ['Objectives', 'Quiz', 'Next Steps'];

// --- Step renderers ---

function PrePromptStep({ onContinue }: { onContinue: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-2xl mx-auto"
    >
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-full text-sm font-medium mb-4">
          <Target className="w-4 h-4" />
          {DEMO_TOPIC.day}
        </div>
        <h2 className="text-2xl font-bold text-content mb-2">
          {DEMO_TOPIC.title}
        </h2>
        <p className="text-content-tertiary">{DEMO_TOPIC.skill}</p>
      </div>

      <div className="bg-surface rounded-xl shadow-card p-6 mb-6">
        <h3 className="font-semibold text-content mb-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-focus-500" />
          What you'll learn
        </h3>
        <ul className="space-y-3">
          {DEMO_PREPROMPT.objectives.map((obj, i) => (
            <li key={i} className="flex items-start gap-3 text-content-secondary">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-focus-100 text-focus-700 flex items-center justify-center text-xs font-medium">
                {i + 1}
              </span>
              {obj}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-surface rounded-xl shadow-card p-6 mb-8">
        <h3 className="font-semibold text-content mb-4 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-brand-500" />
          Think about this before we start
        </h3>
        <ul className="space-y-3">
          {DEMO_PREPROMPT.primeQuestions.map((q, i) => (
            <li
              key={i}
              className="flex items-start gap-3 text-content-secondary italic"
            >
              <span className="flex-shrink-0 text-brand-400 mt-0.5">?</span>
              {q}
            </li>
          ))}
        </ul>
      </div>

      <div className="text-center">
        <Button
          size="lg"
          onClick={onContinue}
          rightIcon={<ArrowRight className="w-5 h-5" />}
        >
          Start Learning
        </Button>
      </div>
    </motion.div>
  );
}

function QuizStep({ onContinue }: { onContinue: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [xp, setXp] = useState(0);

  const answeredCount = Object.values(answers).filter(v => v !== null && v !== undefined).length;
  const allAnswered = DEMO_QUIZ.every(
    (_, i) => answers[i] !== undefined && answers[i] !== null
  );
  const correctCount = DEMO_QUIZ.filter(
    (q, i) => answers[i] === q.correctIndex
  ).length;
  const progress = (answeredCount / DEMO_QUIZ.length) * 100;

  const handleSelect = useCallback(
    (questionIndex: number, optionIndex: number) => {
      if (answers[questionIndex] !== undefined && answers[questionIndex] !== null) return;
      setAnswers((prev) => ({ ...prev, [questionIndex]: optionIndex }));

      const isCorrect = optionIndex === DEMO_QUIZ[questionIndex].correctIndex;
      if (isCorrect) {
        setStreak((s) => {
          const newStreak = s + 1;
          setMaxStreak((m) => Math.max(m, newStreak));
          // Bonus XP at streak milestones
          if (newStreak === 3 || newStreak === 5) {
            setXp((x) => x + 15); // 10 base + 5 bonus
          } else {
            setXp((x) => x + 10);
          }
          return newStreak;
        });
      } else {
        setStreak(0);
        setXp((x) => x + 0);
      }
    },
    [answers]
  );

  const starCount = correctCount >= DEMO_QUIZ.length * 0.9 ? 3 : correctCount >= DEMO_QUIZ.length * 0.7 ? 2 : 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-2xl mx-auto"
    >
      {/* Duolingo-style header: progress bar + XP + streak */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-content">
            Learn by Doing
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm font-medium text-amber-600">
              <Zap className="w-4 h-4" />
              <span>{xp} XP</span>
            </div>
            {streak > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1.5 text-sm font-medium text-orange-500"
              >
                <Flame className="w-4 h-4" />
                <span>{streak}</span>
              </motion.div>
            )}
          </div>
        </div>
        <p className="text-content-tertiary text-sm">
          Answer questions and learn from the explanations — no pressure!
        </p>
        {/* Green progress bar */}
        <div className="w-full h-2.5 bg-surface-tertiary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {DEMO_QUIZ.map((q, i) => {
          const hasAnswered = answers[i] !== undefined && answers[i] !== null;
          const isCorrect = hasAnswered && answers[i] === q.correctIndex;

          return (
            <div key={i}>
              <MultipleChoiceQuestion
                questionNumber={i + 1}
                question={q.question}
                options={q.options}
                correctIndex={q.correctIndex}
                selectedIndex={answers[i] ?? null}
                onSelect={(opt) => handleSelect(i, opt)}
                showResult={hasAnswered}
              />

              {/* Rich concept explanation panel */}
              {hasAnswered && q.explanation && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="mt-2 rounded-xl border border-blue-200 overflow-hidden"
                >
                  {/* Correct/incorrect indicator + concept title */}
                  <div className={clsx(
                    'px-4 py-2.5 border-b flex items-center gap-2',
                    isCorrect
                      ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
                      : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'
                  )}>
                    <span className={clsx('text-sm font-semibold', isCorrect ? 'text-green-700' : 'text-amber-700')}>
                      {isCorrect ? '✓ Correct!' : '✗ Not quite —'}
                    </span>
                    {q.conceptTitle && (
                      <>
                        <Lightbulb className="w-3.5 h-3.5 text-blue-500 ml-1" />
                        <span className="text-sm font-medium text-blue-800">{q.conceptTitle}</span>
                      </>
                    )}
                  </div>

                  {/* Explanation paragraphs */}
                  <div className="px-4 py-3 bg-surface space-y-2">
                    {q.explanation.split('\n\n').map((paragraph, pIdx) => (
                      <p
                        key={pIdx}
                        className={clsx(
                          'text-sm leading-relaxed',
                          pIdx === 0 ? 'font-medium text-content' : 'text-content-secondary'
                        )}
                      >
                        {paragraph.split(/(`[^`]+`)/).map((part, partIdx) =>
                          part.startsWith('`') && part.endsWith('`') ? (
                            <code
                              key={partIdx}
                              className="px-1.5 py-0.5 bg-surface-tertiary text-indigo-700 rounded text-xs font-mono"
                            >
                              {part.slice(1, -1)}
                            </code>
                          ) : (
                            <span key={partIdx}>{part}</span>
                          )
                        )}
                      </p>
                    ))}
                  </div>

                  {/* Real-world context footer */}
                  {q.realWorldContext && (
                    <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 flex items-start gap-2">
                      <Target className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800">{q.realWorldContext}</p>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          );
        })}
      </div>

      {allAnswered && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8"
        >
          <div className="bg-surface rounded-2xl shadow-card p-6 text-center mb-4">
            {/* Stars */}
            <div className="flex justify-center gap-1 mb-3">
              {[1, 2, 3].map((s) => (
                <motion.div
                  key={s}
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: s <= starCount ? 1 : 0.6, rotate: 0, opacity: s <= starCount ? 1 : 0.3 }}
                  transition={{ delay: s * 0.15, type: 'spring', stiffness: 300 }}
                >
                  <svg
                    className={clsx('w-10 h-10', s <= starCount ? 'text-yellow-400' : 'text-content-tertiary')}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </motion.div>
              ))}
            </div>

            <p className="text-2xl font-bold text-content mb-1">
              {correctCount}/{DEMO_QUIZ.length} correct
            </p>

            {/* XP + streak stats */}
            <div className="flex items-center justify-center gap-4 mb-3">
              <span className="text-sm font-medium text-amber-600 flex items-center gap-1">
                <Zap className="w-4 h-4" /> {xp} XP earned
              </span>
              {maxStreak > 1 && (
                <span className="text-sm font-medium text-orange-500 flex items-center gap-1">
                  <Flame className="w-4 h-4" /> {maxStreak} best streak
                </span>
              )}
            </div>

            <p className="text-sm text-content-tertiary">
              {correctCount === DEMO_QUIZ.length
                ? 'Perfect score! You nailed it.'
                : correctCount >= DEMO_QUIZ.length / 2
                  ? 'Great job — you\'ve got the core ideas down!'
                  : 'Good effort! Review the explanations above to strengthen your understanding.'}
            </p>
          </div>
          <div className="text-center">
            <Button
              size="lg"
              onClick={onContinue}
              rightIcon={<ArrowRight className="w-5 h-5" />}
            >
              See What's Next
            </Button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function SignupWallStep() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-lg mx-auto text-center"
    >
      <div className="bg-surface rounded-2xl shadow-card p-8">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
          <Rocket className="w-8 h-8 text-white" />
        </div>

        <h2 className="text-2xl font-bold text-content mb-3">
          That was just Day 1, Step 1.
        </h2>
        <p className="text-content-secondary mb-6">
          A full day includes videos, more quiz challenges, coding exercises, and
          a project step. Sign up to get your own personalized 7-day curriculum
          — free.
        </p>

        <div className="text-left mb-6 bg-surface-secondary rounded-lg p-4">
          <p className="text-sm font-medium text-content-secondary mb-3">
            Your full experience includes:
          </p>
          <ul className="space-y-2">
            {[
              'AI builds your personalized 7-day curriculum',
              'Daily sessions with videos, quizzes & exercises',
              'Build a real project as you learn',
              'On-demand AI tutor that knows your progress',
            ].map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-sm text-content-secondary"
              >
                <CheckCircle className="w-4 h-4 text-focus-500 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full"
            onClick={() => navigate('/register')}
            rightIcon={<ArrowRight className="w-5 h-5" />}
          >
            Sign Up Free
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => navigate('/explore')}
            leftIcon={<BookOpen className="w-4 h-4" />}
          >
            Explore More Skills
          </Button>
        </div>

        <p className="mt-4 text-xs text-content-tertiary">
          No credit card required. Free plan includes 1 full curriculum.
        </p>
      </div>
    </motion.div>
  );
}

// --- Main page ---

export function DemoSessionPage() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-secondary to-surface flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-content-secondary hover:text-content transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-2xl">🔥</span>
            <span className="font-display font-bold text-lg text-content">
              FlexForge
            </span>
          </button>

          <div className="flex items-center gap-2 text-sm text-content-tertiary">
            <Sparkles className="w-4 h-4 text-brand-500" />
            <span className="hidden sm:inline">Demo Session</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="max-w-4xl mx-auto px-4 pb-3">
          <div className="flex items-center gap-2">
            {STEP_LABELS.map((label, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={clsx(
                    'w-full h-1.5 rounded-full transition-colors',
                    i < step
                      ? 'bg-focus-500'
                      : i === step
                        ? 'bg-brand-500'
                        : 'bg-surface-tertiary'
                  )}
                />
                <span
                  className={clsx(
                    'text-xs hidden sm:block',
                    i <= step ? 'text-content-secondary font-medium' : 'text-content-tertiary'
                  )}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-8">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <PrePromptStep key="preprompt" onContinue={() => setStep(1)} />
          )}
          {step === 1 && (
            <QuizStep key="quiz" onContinue={() => setStep(2)} />
          )}
          {step === 2 && <SignupWallStep key="wall" />}
        </AnimatePresence>
      </main>
    </div>
  );
}
