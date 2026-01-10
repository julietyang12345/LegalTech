import { useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { Layers, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { Card } from '@/components/common';
import { clsx } from 'clsx';
import type { CurriculumDay, Session, FoundationCard, MicroQuestion } from '@/types';

interface FoundationCardsStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

// Swipe threshold for card navigation
const SWIPE_CONFIDENCE_THRESHOLD = 10000;
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

export function FoundationCardsStep({ day, onComplete }: FoundationCardsStepProps) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [answeredCards, setAnsweredCards] = useState<Record<string, boolean>>({});
  const [direction, setDirection] = useState(0);

  const cards = day.foundationCards || [];

  // Debug logging
  console.log('[FoundationCardsStep] Day data:', {
    dayNumber: day.day,
    hasFoundationCards: !!day.foundationCards,
    foundationCardsCount: day.foundationCards?.length ?? 0,
    hasActiveRecall: !!day.activeRecall,
    hasConceptCheck: !!day.conceptCheck,
    cardIds: cards.map(c => c.id),
  });
  const currentCard = cards[currentCardIndex];
  const progress = cards.length > 0 ? ((currentCardIndex + 1) / cards.length) * 100 : 0;
  const allAnswered = cards.length > 0 && Object.keys(answeredCards).length >= cards.length;

  const handleNextCard = () => {
    if (currentCardIndex < cards.length - 1) {
      setDirection(1);
      setCurrentCardIndex(prev => prev + 1);
    } else if (allAnswered) {
      onComplete();
    }
  };

  const handlePrevCard = () => {
    if (currentCardIndex > 0) {
      setDirection(-1);
      setCurrentCardIndex(prev => prev - 1);
    }
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const swipe = swipePower(info.offset.x, info.velocity.x);
    if (swipe < -SWIPE_CONFIDENCE_THRESHOLD) {
      handleNextCard();
    } else if (swipe > SWIPE_CONFIDENCE_THRESHOLD) {
      handlePrevCard();
    }
  };

  const handleAnswer = (cardId: string, correct: boolean) => {
    setAnsweredCards(prev => ({ ...prev, [cardId]: correct }));
  };

  if (!currentCard) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No foundation cards available for this day.</p>
      </div>
    );
  }

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full
                       bg-gradient-to-br from-violet-400 to-violet-500 mb-4">
          <Layers className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Learn the Concepts
        </h1>
        <p className="text-gray-600">
          Swipe through {cards.length} concept cards
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-between px-4">
        <span className="text-sm text-gray-500">
          Card {currentCardIndex + 1} of {cards.length}
        </span>
        <div className="flex gap-1.5">
          {cards.map((card, i) => (
            <button
              key={card.id}
              onClick={() => {
                setDirection(i > currentCardIndex ? 1 : -1);
                setCurrentCardIndex(i);
              }}
              className={clsx(
                'w-2.5 h-2.5 rounded-full transition-all duration-200',
                i === currentCardIndex && 'bg-brand-500 scale-125',
                i !== currentCardIndex && answeredCards[card.id] !== undefined && 'bg-green-400',
                i !== currentCardIndex && answeredCards[card.id] === undefined && 'bg-gray-200'
              )}
            />
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-brand-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Swipeable Card */}
      <div className="relative min-h-[450px] overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentCard.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={1}
            onDragEnd={handleDragEnd}
            className="cursor-grab active:cursor-grabbing"
          >
            <Card className="overflow-hidden">
              {/* Visual + Concept header */}
              <div className="p-6 border-b border-gray-100 bg-gradient-to-br from-gray-50 to-white">
                <div className="flex items-start gap-4">
                  <span className="text-4xl">{currentCard.visual || '💡'}</span>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-900 leading-tight">
                      {currentCard.concept}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Explanation */}
              <div className="p-6">
                <p className="text-gray-700 leading-relaxed text-lg">
                  {currentCard.explanation}
                </p>
              </div>

              {/* Code Example (if present) */}
              {currentCard.codeExample && (
                <div className="mx-6 mb-6 rounded-lg overflow-hidden">
                  <div className="bg-gray-800 px-4 py-2 text-xs text-gray-400 font-mono">
                    Example
                  </div>
                  <pre className="bg-gray-900 p-4 text-sm text-gray-100 overflow-x-auto">
                    <code>{currentCard.codeExample}</code>
                  </pre>
                </div>
              )}

              {/* Micro Question */}
              <div className="p-6 pt-0">
                <MicroQuestionComponent
                  cardId={currentCard.id}
                  question={currentCard.microQuestion}
                  onAnswer={(correct) => handleAnswer(currentCard.id, correct)}
                  answered={answeredCards[currentCard.id] !== undefined}
                  wasCorrect={answeredCards[currentCard.id]}
                />
              </div>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrevCard}
          disabled={currentCardIndex === 0}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
            currentCardIndex === 0
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Previous</span>
        </button>

        <span className="text-xs text-gray-400">
          Swipe or use buttons
        </span>

        <button
          onClick={handleNextCard}
          disabled={currentCardIndex === cards.length - 1 && !allAnswered}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
            currentCardIndex === cards.length - 1 && !allAnswered
              ? 'text-gray-300 cursor-not-allowed'
              : currentCardIndex === cards.length - 1 && allAnswered
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          <span className="text-sm">
            {currentCardIndex === cards.length - 1 ? 'Continue' : 'Next'}
          </span>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Completion hint */}
      {allAnswered && currentCardIndex === cards.length - 1 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-sm text-green-600 font-medium"
        >
          All cards reviewed! Click Continue to proceed.
        </motion.div>
      )}
    </div>
  );
}

// Sub-component for micro questions
interface MicroQuestionProps {
  cardId: string;
  question: MicroQuestion;
  onAnswer: (correct: boolean) => void;
  answered: boolean;
  wasCorrect?: boolean;
}

function MicroQuestionComponent({ cardId, question, onAnswer, answered, wasCorrect }: MicroQuestionProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  // "Got it" type question
  if (question.type === 'gotit') {
    return (
      <div className="border-t border-gray-100 pt-4">
        <p className="text-gray-800 font-medium mb-4">{question.question}</p>
        {!answered ? (
          <div className="flex gap-3">
            <button
              onClick={() => onAnswer(true)}
              className="flex-1 py-3 px-4 rounded-lg bg-green-50 text-green-700 font-medium
                        border border-green-200 hover:bg-green-100 transition-colors"
            >
              Got it!
            </button>
            <button
              onClick={() => onAnswer(false)}
              className="flex-1 py-3 px-4 rounded-lg bg-amber-50 text-amber-700 font-medium
                        border border-amber-200 hover:bg-amber-100 transition-colors"
            >
              Still confused
            </button>
          </div>
        ) : (
          <div className={clsx(
            'py-3 px-4 rounded-lg font-medium text-center',
            wasCorrect ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          )}>
            {wasCorrect ? 'Great! Moving on...' : "That's okay! Review again later."}
          </div>
        )}
      </div>
    );
  }

  // "Understanding" type (MCQ)
  const handleSelect = (index: number) => {
    if (answered) return;
    setSelectedIndex(index);
    const isCorrect = index === question.correctIndex;
    onAnswer(isCorrect);
    setShowExplanation(true);
  };

  return (
    <div className="border-t border-gray-100 pt-4">
      <p className="text-gray-800 font-medium mb-4">{question.question}</p>
      <div className="space-y-2">
        {question.options?.map((option, index) => {
          const isSelected = selectedIndex === index;
          const isCorrectOption = index === question.correctIndex;
          const showResult = answered;

          return (
            <button
              key={index}
              onClick={() => handleSelect(index)}
              disabled={answered}
              className={clsx(
                'w-full p-3 rounded-lg border text-left flex items-start gap-3 transition-all',
                !answered && 'hover:border-brand-300 hover:bg-brand-50 cursor-pointer',
                answered && 'cursor-default',
                !showResult && 'bg-white border-gray-200',
                showResult && isCorrectOption && 'bg-green-100 border-green-400',
                showResult && isSelected && !isCorrectOption && 'bg-red-100 border-red-400',
                showResult && !isSelected && !isCorrectOption && 'bg-gray-50 border-gray-200 opacity-60'
              )}
            >
              <span className={clsx(
                'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium',
                !showResult && 'bg-gray-100 text-gray-600',
                showResult && isCorrectOption && 'bg-green-500 text-white',
                showResult && isSelected && !isCorrectOption && 'bg-red-500 text-white',
                showResult && !isSelected && !isCorrectOption && 'bg-gray-200 text-gray-500'
              )}>
                {showResult && isCorrectOption ? (
                  <Check className="w-4 h-4" />
                ) : showResult && isSelected && !isCorrectOption ? (
                  <X className="w-4 h-4" />
                ) : (
                  OPTION_LABELS[index]
                )}
              </span>
              <span className={clsx(
                'text-sm',
                showResult && isCorrectOption && 'text-green-800 font-medium',
                showResult && isSelected && !isCorrectOption && 'text-red-800',
                !showResult && 'text-gray-700'
              )}>
                {option}
              </span>
            </button>
          );
        })}
      </div>

      {/* Explanation */}
      {showExplanation && question.explanation && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={clsx(
            'mt-4 p-3 rounded-lg text-sm',
            wasCorrect ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
          )}
        >
          <p className="font-medium mb-1">
            {wasCorrect ? '✓ Correct!' : '✗ Not quite'}
          </p>
          <p>{question.explanation}</p>
        </motion.div>
      )}
    </div>
  );
}
