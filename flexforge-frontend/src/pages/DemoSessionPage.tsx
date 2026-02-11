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
  ChevronLeft,
  ChevronRight,
  Rocket,
  BookOpen,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button, MultipleChoiceQuestion } from '@/components/common';
import {
  DEMO_TOPIC,
  DEMO_PREPROMPT,
  DEMO_CARDS,
  DEMO_QUIZ,
} from '@/data/demoContent';

const STEP_LABELS = ['Objectives', 'Concepts', 'Quiz', 'Next Steps'];

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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {DEMO_TOPIC.title}
        </h2>
        <p className="text-gray-500">{DEMO_TOPIC.skill}</p>
      </div>

      <div className="bg-white rounded-xl shadow-card p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-focus-500" />
          What you'll learn
        </h3>
        <ul className="space-y-3">
          {DEMO_PREPROMPT.objectives.map((obj, i) => (
            <li key={i} className="flex items-start gap-3 text-gray-700">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-focus-100 text-focus-700 flex items-center justify-center text-xs font-medium">
                {i + 1}
              </span>
              {obj}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-xl shadow-card p-6 mb-8">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-brand-500" />
          Think about this before we start
        </h3>
        <ul className="space-y-3">
          {DEMO_PREPROMPT.primeQuestions.map((q, i) => (
            <li
              key={i}
              className="flex items-start gap-3 text-gray-600 italic"
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

function FoundationCardsStep({ onContinue }: { onContinue: () => void }) {
  const [cardIndex, setCardIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const card = DEMO_CARDS[cardIndex];
  const answered = answers[cardIndex] !== undefined && answers[cardIndex] !== null;
  const allAnswered = DEMO_CARDS.every(
    (_, i) => answers[i] !== undefined && answers[i] !== null
  );
  const isLast = cardIndex === DEMO_CARDS.length - 1;

  const handleSelect = useCallback(
    (optionIndex: number) => {
      setAnswers((prev) => ({ ...prev, [cardIndex]: optionIndex }));
    },
    [cardIndex]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-2xl mx-auto"
    >
      {/* Card counter */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">
          Card {cardIndex + 1} of {DEMO_CARDS.length}
        </span>
        <div className="flex gap-1.5">
          {DEMO_CARDS.map((_, i) => (
            <div
              key={i}
              className={clsx(
                'w-2.5 h-2.5 rounded-full transition-colors',
                i === cardIndex ? 'bg-brand-500' : i < cardIndex ? 'bg-focus-400' : 'bg-gray-200'
              )}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={cardIndex}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25 }}
        >
          <div className="bg-white rounded-xl shadow-card p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{card.emoji}</span>
              <h3 className="text-xl font-bold text-gray-900">{card.title}</h3>
            </div>
            <p className="text-gray-700 leading-relaxed mb-6">{card.content}</p>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-500 mb-3">
                Quick check
              </p>
              <MultipleChoiceQuestion
                question={card.microQuestion.question}
                options={card.microQuestion.options}
                correctIndex={card.microQuestion.correctIndex}
                explanation={card.microQuestion.explanation}
                selectedIndex={answers[cardIndex] ?? null}
                onSelect={handleSelect}
                showResult={answered}
              />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setCardIndex((i) => Math.max(0, i - 1))}
          disabled={cardIndex === 0}
          leftIcon={<ChevronLeft className="w-4 h-4" />}
        >
          Previous
        </Button>

        {isLast && allAnswered ? (
          <Button
            onClick={onContinue}
            rightIcon={<ArrowRight className="w-5 h-5" />}
          >
            Continue to Quiz
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() =>
              setCardIndex((i) => Math.min(DEMO_CARDS.length - 1, i + 1))
            }
            disabled={!answered || isLast}
            rightIcon={<ChevronRight className="w-4 h-4" />}
          >
            Next Card
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function QuizStep({ onContinue }: { onContinue: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const allAnswered = DEMO_QUIZ.every(
    (_, i) => answers[i] !== undefined && answers[i] !== null
  );
  const correctCount = DEMO_QUIZ.filter(
    (q, i) => answers[i] === q.correctIndex
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-2xl mx-auto"
    >
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Knowledge Check
        </h2>
        <p className="text-gray-500 text-sm">
          Test what you just learned — no pressure!
        </p>
      </div>

      <div className="space-y-4">
        {DEMO_QUIZ.map((q, i) => (
          <MultipleChoiceQuestion
            key={i}
            questionNumber={i + 1}
            question={q.question}
            options={q.options}
            correctIndex={q.correctIndex}
            explanation={q.explanation}
            selectedIndex={answers[i] ?? null}
            onSelect={(opt) =>
              setAnswers((prev) => ({ ...prev, [i]: opt }))
            }
            showResult={answers[i] !== undefined && answers[i] !== null}
          />
        ))}
      </div>

      {allAnswered && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6"
        >
          <div className="bg-white rounded-xl shadow-card p-5 text-center mb-4">
            <p className="text-lg font-semibold text-gray-900">
              {correctCount}/{DEMO_QUIZ.length} correct
            </p>
            <p className="text-sm text-gray-500 mt-1">
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
      <div className="bg-white rounded-2xl shadow-card p-8">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
          <Rocket className="w-8 h-8 text-white" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          That was just Day 1, Step 1.
        </h2>
        <p className="text-gray-600 mb-6">
          A full day includes videos, more concept cards, coding exercises, and
          a project step. Sign up to get your own personalized 7-day curriculum
          — free.
        </p>

        <div className="text-left mb-6 bg-gray-50 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Your full experience includes:
          </p>
          <ul className="space-y-2">
            {[
              'AI builds your personalized 7-day curriculum',
              'Daily sessions with videos, concept cards & quizzes',
              'Build a real project as you learn',
              'On-demand AI tutor that knows your progress',
            ].map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-sm text-gray-600"
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

        <p className="mt-4 text-xs text-gray-400">
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-gray-200/50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-2xl">🔥</span>
            <span className="font-display font-bold text-lg text-gray-900">
              FlexForge
            </span>
          </button>

          <div className="flex items-center gap-2 text-sm text-gray-500">
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
                        : 'bg-gray-200'
                  )}
                />
                <span
                  className={clsx(
                    'text-xs hidden sm:block',
                    i <= step ? 'text-gray-700 font-medium' : 'text-gray-400'
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
            <FoundationCardsStep key="cards" onContinue={() => setStep(2)} />
          )}
          {step === 2 && (
            <QuizStep key="quiz" onContinue={() => setStep(3)} />
          )}
          {step === 3 && <SignupWallStep key="wall" />}
        </AnimatePresence>
      </main>
    </div>
  );
}
