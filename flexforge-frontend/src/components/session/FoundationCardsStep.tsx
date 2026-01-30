import { useState, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { Layers, ChevronLeft, ChevronRight, ChevronDown, Volume2 } from 'lucide-react';
import { Card, MultipleChoiceQuestion, Button, ExerciseLoadingScreen } from '@/components/common';
import { StepLayout } from './StepLayout';
import { VocabularyCard } from './VocabularyCard';
import { useSessionStore } from '@/stores/sessionStore';
import { useBrowserTTS } from '@/hooks/useBrowserTTS';
import { clsx } from 'clsx';
import type { CurriculumDay, Session, FoundationCard, MicroQuestion, LanguageFoundationCard, TargetLanguage, EmbeddedCaseStudy } from '@/types';

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

export function FoundationCardsStep({ day, session, onComplete }: FoundationCardsStepProps) {
  const { saveTaskProgress, getTaskProgress } = useSessionStore();
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [answeredCards, setAnsweredCards] = useState<Record<string, boolean>>({});
  const [direction, setDirection] = useState(0);

  // Check if this is a language learning session
  const isLanguageLearning = session.curriculum?.metadata?.isLanguageLearning;
  const targetLanguage = session.curriculum?.metadata?.targetLanguage as TargetLanguage | undefined;

  // Browser TTS for pronunciation (language learning)
  const { speak, isSpeaking } = useBrowserTTS(targetLanguage || 'other', { rate: 0.9 });

  // Use language-specific cards if available, otherwise regular cards
  const cards = (day.languageFoundationCards || day.foundationCards || []) as (FoundationCard | LanguageFoundationCard)[];

  // Check if a card is a vocabulary card
  const isVocabularyCard = (card: FoundationCard | LanguageFoundationCard): card is LanguageFoundationCard => {
    return 'vocabulary' in card && card.vocabulary !== undefined;
  };

  // Check if a card has audio (for language learning cards)
  const hasAudioText = (card: FoundationCard | LanguageFoundationCard): card is LanguageFoundationCard => {
    return 'audioText' in card && !!card.audioText;
  };

  // Play audio for the current card
  const playCardAudio = () => {
    const card = currentCard as LanguageFoundationCard;
    if (card.audioUrl) {
      const audio = new Audio(card.audioUrl);
      audio.play();
    } else if (card.audioText) {
      speak(card.audioText);
    } else if (isLanguageLearning && currentCard.concept) {
      // Fallback: speak the concept title for language learning
      speak(currentCard.concept);
    }
  };

  // Restore progress on mount
  useEffect(() => {
    const saved = getTaskProgress(day.day, 'foundationCards');
    if (saved?.answers) {
      // Convert stored number answers to boolean
      const restored: Record<string, boolean> = {};
      Object.entries(saved.answers).forEach(([key, val]) => {
        if (val !== null) restored[key] = val === 1;
      });
      setAnsweredCards(restored);
      setCurrentCardIndex(saved.currentIndex || 0);
    }
  }, [day.day, getTaskProgress]);

  // Save progress when answers change
  useEffect(() => {
    if (Object.keys(answeredCards).length > 0) {
      // Convert boolean to number for storage
      const answers: Record<string, number | null> = {};
      Object.entries(answeredCards).forEach(([key, val]) => {
        answers[key] = val ? 1 : 0;
      });
      saveTaskProgress(day.day, 'foundationCards', {
        answers,
        currentIndex: currentCardIndex,
        showResults: false,
      });
    }
  }, [answeredCards, currentCardIndex, day.day, saveTaskProgress]);
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
      <StepLayout
        icon={Layers}
        iconGradient="from-violet-400 to-violet-500"
        title="Learn the Concepts"
        subtitle="Loading your learning materials..."
      >
        <ExerciseLoadingScreen
          type="task"
          skillName={session.skillName}
          dayNumber={day.day}
        />
      </StepLayout>
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
            {/* Vocabulary Card (for language learning) */}
            {isVocabularyCard(currentCard) && currentCard.vocabulary && targetLanguage ? (
              <VocabularyCard
                vocabulary={currentCard.vocabulary}
                language={targetLanguage}
                onMastered={() => handleAnswer(currentCard.id, true)}
              />
            ) : (
              /* Standard Foundation Card */
              <Card className="overflow-hidden border-0 shadow-lg">
                {/* Concept header - glassmorphism style */}
                <div className="relative">
                  {/* Decorative background blur circles */}
                  <div className="absolute -top-8 -right-8 w-24 h-24 bg-gradient-to-br from-indigo-200/40 to-purple-200/40 rounded-full blur-2xl" />
                  <div className="absolute -top-4 -left-4 w-16 h-16 bg-gradient-to-br from-blue-200/30 to-cyan-200/30 rounded-full blur-xl" />

                  <div className="relative p-6 pb-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <h2 className="text-xl font-bold text-gray-900 leading-tight">
                          {currentCard.concept}
                        </h2>
                      </div>
                      {/* Audio button for language learning - show when language learning or targetLanguage set */}
                      {(isLanguageLearning || targetLanguage || hasAudioText(currentCard)) && (
                        <button
                          onClick={playCardAudio}
                          className={clsx(
                            'p-3 rounded-full transition-all flex-shrink-0',
                            isSpeaking
                              ? 'bg-purple-100 text-purple-600 scale-110'
                              : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                          )}
                          title="Hear pronunciation"
                        >
                          <Volume2 className={clsx('w-5 h-5', isSpeaking && 'animate-pulse')} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Explanation - split into key insight + collapsible details */}
                <ExplanationContent explanation={currentCard.explanation} cardId={currentCard.id} />

                {/* Real World Context - Why This Matters */}
                {currentCard.realWorldContext && (
                  <div className="mx-6 mb-4 p-3 rounded-lg bg-gradient-to-r from-brand-50 to-focus-50 border border-brand-100">
                    <div className="flex items-start gap-2">
                      <span className="text-brand-500 flex-shrink-0">🎯</span>
                      <div className="space-y-2">
                        {currentCard.realWorldContext.split(/\n\n+/).map((paragraph, idx) => (
                          <p key={idx} className="text-sm text-brand-800 font-medium">
                            {paragraph.trim()}
                          </p>
                        ))}
                      </div>
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

                {/* Case Study (if present - for decision-making concepts) */}
                {'caseStudy' in currentCard && currentCard.caseStudy && (
                  <div className="p-6 pt-0">
                    <CaseStudyComponent
                      caseStudy={currentCard.caseStudy}
                      onAnswer={(correct) => handleAnswer(currentCard.id, correct)}
                      answered={answeredCards[currentCard.id] !== undefined}
                    />
                  </div>
                )}

                {/* Micro Question (if no case study, or always if card has both) */}
                {'caseStudy' in currentCard && currentCard.caseStudy ? null : (
                  <div className="p-6 pt-0">
                    <MicroQuestionComponent
                      question={currentCard.microQuestion}
                      onAnswer={(correct) => handleAnswer(currentCard.id, correct)}
                      answered={answeredCards[currentCard.id] !== undefined}
                      wasCorrect={answeredCards[currentCard.id]}
                    />
                  </div>
                )}
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={handlePrevCard}
          disabled={currentCardIndex === 0}
          leftIcon={<ChevronLeft className="w-5 h-5" />}
        >
          Previous
        </Button>

        <span className="hidden sm:block text-xs text-gray-400">
          Swipe or use buttons
        </span>

        <button
          onClick={handleNextCard}
          disabled={currentCardIndex === cards.length - 1 && !allAnswered}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all
            ${currentCardIndex === cards.length - 1 && !allAnswered
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : currentCardIndex === cards.length - 1 && allAnswered
                ? 'bg-brand-600 text-white shadow-md hover:bg-brand-700 active:scale-[0.98]'
                : 'bg-gray-700 text-white shadow-md hover:bg-gray-800 active:scale-[0.98]'
            }`}
        >
          {currentCardIndex === cards.length - 1 ? 'Continue' : 'Next'}
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

// Explanation content with collapsible details
function ExplanationContent({ explanation, cardId }: { explanation: string; cardId: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Split by paragraphs (double newline) for logical grouping by theme
  // Fall back to single paragraph if no breaks
  const paragraphs = explanation
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const keyInsight = paragraphs[0] || '';
  const details = paragraphs.slice(1);

  return (
    <div className="px-6 pb-4 space-y-3">
      {/* Key Insight - always visible */}
      <div className="p-4 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl border border-violet-100">
        <p className="text-gray-800 font-medium leading-relaxed">
          {keyInsight}
        </p>
      </div>

      {/* Collapsible details - shown as paragraphs grouped by theme */}
      {details.length > 0 && (
        <>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700 font-medium transition-colors"
          >
            <ChevronDown
              className={clsx(
                'w-4 h-4 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
            />
            {isExpanded ? 'Hide details' : 'Show more'}
          </button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 pt-1">
                  {details.map((paragraph, idx) => (
                    <p key={idx} className="text-sm text-gray-600 leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

// Sub-component for micro questions
interface MicroQuestionProps {
  question: MicroQuestion;
  onAnswer: (correct: boolean) => void;
  answered: boolean;
  wasCorrect?: boolean;
}

function MicroQuestionComponent({ question, onAnswer, answered, wasCorrect }: MicroQuestionProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

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

// Case study component for decision-making cards
interface CaseStudyComponentProps {
  caseStudy: EmbeddedCaseStudy;
  onAnswer: (correct: boolean) => void;
  answered: boolean;
}

function CaseStudyComponent({ caseStudy, onAnswer, answered }: CaseStudyComponentProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleSelect = (index: number) => {
    if (answered || showResult) return;
    setSelectedIndex(index);
    setShowResult(true);

    // Consider it "correct" if they selected the best choice
    const isCorrect = index === caseStudy.bestChoice;
    onAnswer(isCorrect);
  };

  // Normalize options to handle both string[] and {label, consequence}[] formats
  const normalizedOptions = caseStudy.options.map((option) => {
    if (typeof option === 'string') {
      return { label: option, consequence: '' };
    }
    return option;
  });

  return (
    <div className="border-t border-gray-100 pt-4">
      {/* Scenario */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 mb-4">
        <p className="text-sm font-medium text-purple-600 mb-2">Case Study</p>
        <p className="text-gray-800">{caseStudy.scenario}</p>
      </div>

      {/* Question */}
      <p className="text-gray-800 font-medium mb-3">{caseStudy.question}</p>

      {/* Options */}
      <div className="space-y-2">
        {normalizedOptions.map((option, index) => {
          const isSelected = selectedIndex === index;
          const isBestChoice = index === caseStudy.bestChoice;

          return (
            <button
              key={index}
              onClick={() => handleSelect(index)}
              disabled={showResult}
              className={clsx(
                'w-full text-left p-3 rounded-lg border transition-all',
                !showResult && 'hover:bg-gray-50 cursor-pointer',
                showResult && isSelected && isBestChoice && 'bg-green-50 border-green-300',
                showResult && isSelected && !isBestChoice && 'bg-amber-50 border-amber-300',
                showResult && !isSelected && isBestChoice && 'bg-green-50 border-green-200 opacity-60',
                showResult && !isSelected && !isBestChoice && 'opacity-40',
                !showResult && 'border-gray-200'
              )}
            >
              <div className="flex items-start gap-2">
                <span className={clsx(
                  'w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0',
                  showResult && isBestChoice ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                )}>
                  {String.fromCharCode(65 + index)}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{option.label}</p>
                  {showResult && option.consequence && (
                    <p className={clsx(
                      'text-sm mt-1',
                      isBestChoice ? 'text-green-700' : 'text-amber-700'
                    )}>
                      {option.consequence}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Best choice explanation */}
      {showResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 bg-green-50 rounded-lg"
        >
          <p className="text-sm font-medium text-green-800">Best approach:</p>
          <p className="text-sm text-green-700 mt-1">{caseStudy.explanation}</p>
        </motion.div>
      )}
    </div>
  );
}
