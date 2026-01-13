import { useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, MultipleChoiceQuestion } from '@/components/common';
import { StepLayout } from './StepLayout';
import { clsx } from 'clsx';
import type { CurriculumDay, Session, FoundationCard, MicroQuestion } from '@/types';

interface FoundationCardsStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

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
    <StepLayout
      icon={Layers}
      iconGradient="from-violet-400 to-violet-500"
      title="Learn the Concepts"
      subtitle={`Swipe through ${cards.length} concept cards`}
    >
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
              <div className="p-6 pb-3">
                <p className="text-gray-700 leading-relaxed text-lg">
                  {currentCard.explanation}
                </p>
              </div>

              {/* Real World Context - Why This Matters */}
              {currentCard.realWorldContext && (
                <div className="mx-6 mb-4 p-3 rounded-lg bg-gradient-to-r from-brand-50 to-focus-50 border border-brand-100">
                  <div className="flex items-start gap-2">
                    <span className="text-brand-500 flex-shrink-0">🎯</span>
                    <p className="text-sm text-brand-800 font-medium">
                      {currentCard.realWorldContext}
                    </p>
                  </div>
                </div>
              )}

              {/* Video Timestamp Reference */}
              {currentCard.videoTimestampRef && (
                <div className="mx-6 mb-4 flex items-center gap-2 text-sm text-gray-500">
                  <span className="text-focus-500">📹</span>
                  <p className="italic">{currentCard.videoTimestampRef}</p>
                </div>
              )}

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
    </StepLayout>
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
      <MultipleChoiceQuestion
        question={question.question}
        options={question.options || []}
        correctIndex={question.correctIndex ?? 0}
        explanation={question.explanation}
        selectedIndex={selectedIndex}
        onSelect={handleSelect}
        showResult={answered}
      />
    </div>
  );
}
