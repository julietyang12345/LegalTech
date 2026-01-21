import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Volume2, ArrowRight, Shuffle, RotateCcw, Lightbulb } from 'lucide-react';
import { clsx } from 'clsx';
import { useBrowserTTS } from '@/hooks/useBrowserTTS';
import type {
  QuizSection,
  MatchingSection,
  ToneSelectSection,
  LanguageFillBlankSection,
  TranslationSection,
  ReorderSection,
  TypingSection,
  MatchingPair,
  QuizQuestion,
  ToneSelectQuestion,
  LanguageFillBlankItem,
  TranslationItem,
  ReorderItem,
  TypingItem,
  TargetLanguage,
} from '@/types';

// ============================================
// Shared Components
// ============================================

interface ExerciseHeaderProps {
  title: string;
  instructions?: string;
  progress: { current: number; total: number };
}

function ExerciseHeader({ title, instructions, progress }: ExerciseHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <span className="text-sm text-gray-500">
          {progress.current} / {progress.total}
        </span>
      </div>
      {instructions && (
        <p className="text-sm text-gray-600">{instructions}</p>
      )}
      <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-brand-500"
          initial={{ width: 0 }}
          animate={{ width: `${(progress.current / progress.total) * 100}%` }}
        />
      </div>
    </div>
  );
}

interface FeedbackToastProps {
  show: boolean;
  correct: boolean;
  message?: string;
}

function FeedbackToast({ show, correct, message }: FeedbackToastProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={clsx(
            'fixed bottom-20 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg flex items-center gap-2',
            correct ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          )}
        >
          {correct ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
          <span>{message || (correct ? 'Correct!' : 'Try again')}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Quiz Section Component
// ============================================

interface QuizSectionProps {
  section: QuizSection;
  targetLanguage?: TargetLanguage;
  onComplete: (score: number, total: number) => void;
}

export function QuizSectionExercise({ section, targetLanguage, onComplete }: QuizSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const { speak, isSupported } = useBrowserTTS(targetLanguage || 'chinese');

  const questions = section.questions;
  const currentQuestion = questions[currentIndex];
  const hasAnswered = currentQuestion?.id in answers;

  const handleAnswer = (optionIndex: number) => {
    if (hasAnswered) return;

    const correct = optionIndex === currentQuestion.correctIndex;
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: optionIndex }));
    setIsCorrect(correct);
    setShowFeedback(true);

    setTimeout(() => {
      setShowFeedback(false);
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        // Calculate score
        const correctCount = Object.entries({ ...answers, [currentQuestion.id]: optionIndex })
          .filter(([id, ans]) => {
            const q = questions.find(q => q.id === id);
            return q && ans === q.correctIndex;
          }).length;
        onComplete(correctCount, questions.length);
      }
    }, 1500);
  };

  const playAudio = useCallback(() => {
    if (currentQuestion?.audioText && isSupported) {
      speak(currentQuestion.audioText);
    }
  }, [currentQuestion?.audioText, isSupported, speak]);

  // Auto-play audio when question changes (delay gives voices time to load)
  useEffect(() => {
    if (currentQuestion?.audioText && isSupported) {
      const timer = setTimeout(playAudio, 500);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, currentQuestion?.audioText, isSupported, playAudio]);

  if (!currentQuestion) return null;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        progress={{ current: currentIndex + 1, total: questions.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        {currentQuestion.audioText && (
          <button
            onClick={playAudio}
            className="mb-4 flex items-center gap-2 text-brand-600 hover:text-brand-700"
          >
            <Volume2 className="w-5 h-5" />
            <span>Play Audio</span>
          </button>
        )}

        <p className="text-lg font-medium mb-4">{currentQuestion.question}</p>

        <div className="space-y-2">
          {currentQuestion.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswer(index)}
              disabled={hasAnswered}
              className={clsx(
                'w-full p-3 text-left rounded-lg border transition-all',
                hasAnswered
                  ? index === currentQuestion.correctIndex
                    ? 'bg-green-100 border-green-500'
                    : index === answers[currentQuestion.id]
                    ? 'bg-red-100 border-red-500'
                    : 'bg-gray-50 border-gray-200'
                  : 'hover:bg-brand-50 hover:border-brand-300 border-gray-200'
              )}
            >
              {option}
            </button>
          ))}
        </div>

        {hasAnswered && currentQuestion.explanation && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800"
          >
            {currentQuestion.explanation}
          </motion.p>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}

// ============================================
// Matching Section Component
// ============================================

interface MatchingSectionProps {
  section: MatchingSection;
  onComplete: (score: number, total: number) => void;
}

export function MatchingSectionExercise({ section, onComplete }: MatchingSectionProps) {
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [shuffledDefinitions, setShuffledDefinitions] = useState<string[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  useEffect(() => {
    // Shuffle definitions on mount
    const defs = section.pairs.map(p => p.definition);
    setShuffledDefinitions(defs.sort(() => Math.random() - 0.5));
  }, [section.pairs]);

  const handleTermClick = (term: string) => {
    if (matches[term]) return; // Already matched
    setSelectedTerm(term);
  };

  const handleDefinitionClick = (definition: string) => {
    if (!selectedTerm) return;
    if (Object.values(matches).includes(definition)) return; // Already used

    const pair = section.pairs.find(p => p.term === selectedTerm);
    const correct = pair?.definition === definition;

    setIsCorrect(correct);
    setShowFeedback(true);

    if (correct) {
      setMatches(prev => ({ ...prev, [selectedTerm]: definition }));
    }

    setTimeout(() => {
      setShowFeedback(false);
      setSelectedTerm(null);

      // Check if complete
      if (correct && Object.keys(matches).length + 1 === section.pairs.length) {
        onComplete(section.pairs.length, section.pairs.length);
      }
    }, 1000);
  };

  const matchedCount = Object.keys(matches).length;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        progress={{ current: matchedCount, total: section.pairs.length }}
      />

      <div className="grid grid-cols-2 gap-4">
        {/* Terms column */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-500 mb-2">Words</p>
          {section.pairs.map(pair => (
            <button
              key={pair.term}
              onClick={() => handleTermClick(pair.term)}
              disabled={!!matches[pair.term]}
              className={clsx(
                'w-full p-3 text-left rounded-lg border transition-all',
                matches[pair.term]
                  ? 'bg-green-100 border-green-500 text-green-800'
                  : selectedTerm === pair.term
                  ? 'bg-brand-100 border-brand-500'
                  : 'hover:bg-gray-50 border-gray-200'
              )}
            >
              {pair.term}
            </button>
          ))}
        </div>

        {/* Definitions column */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-500 mb-2">Meanings</p>
          {shuffledDefinitions.map(def => {
            const isUsed = Object.values(matches).includes(def);
            return (
              <button
                key={def}
                onClick={() => handleDefinitionClick(def)}
                disabled={isUsed || !selectedTerm}
                className={clsx(
                  'w-full p-3 text-left rounded-lg border transition-all',
                  isUsed
                    ? 'bg-green-100 border-green-500 text-green-800'
                    : selectedTerm
                    ? 'hover:bg-brand-50 hover:border-brand-300 border-gray-200'
                    : 'border-gray-200 opacity-60'
                )}
              >
                {def}
              </button>
            );
          })}
        </div>
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}

// ============================================
// Tone Select Section Component
// ============================================

interface ToneSelectSectionProps {
  section: ToneSelectSection;
  targetLanguage?: TargetLanguage;
  onComplete: (score: number, total: number) => void;
}

export function ToneSelectSectionExercise({ section, targetLanguage, onComplete }: ToneSelectSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const { speak, isSupported } = useBrowserTTS(targetLanguage || 'chinese');

  const questions = section.questions;
  const currentQuestion = questions[currentIndex];
  const hasAnswered = currentQuestion?.id in answers;

  const handleAnswer = (optionIndex: number) => {
    if (hasAnswered) return;

    const correct = optionIndex === currentQuestion.correctIndex;
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: optionIndex }));
    setIsCorrect(correct);
    setShowFeedback(true);

    setTimeout(() => {
      setShowFeedback(false);
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        const correctCount = Object.entries({ ...answers, [currentQuestion.id]: optionIndex })
          .filter(([id, ans]) => {
            const q = questions.find(q => q.id === id);
            return q && ans === q.correctIndex;
          }).length;
        onComplete(correctCount, questions.length);
      }
    }, 1500);
  };

  const playAudio = useCallback(() => {
    if (currentQuestion?.audioText && isSupported) {
      speak(currentQuestion.audioText);
    }
  }, [currentQuestion?.audioText, isSupported, speak]);

  // Auto-play audio when question changes (delay gives voices time to load)
  useEffect(() => {
    if (currentQuestion?.audioText && isSupported) {
      const timer = setTimeout(playAudio, 500);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, currentQuestion?.audioText, isSupported, playAudio]);

  if (!currentQuestion) return null;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        progress={{ current: currentIndex + 1, total: questions.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <button
          onClick={playAudio}
          className="mb-4 w-full py-4 flex items-center justify-center gap-2 bg-brand-50 rounded-lg text-brand-600 hover:bg-brand-100 transition-colors"
        >
          <Volume2 className="w-6 h-6" />
          <span className="font-medium">Listen to the word</span>
        </button>

        <p className="text-lg font-medium mb-4 text-center">{currentQuestion.prompt}</p>

        <div className="grid grid-cols-2 gap-2">
          {currentQuestion.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswer(index)}
              disabled={hasAnswered}
              className={clsx(
                'p-4 text-center rounded-lg border transition-all font-medium',
                hasAnswered
                  ? index === currentQuestion.correctIndex
                    ? 'bg-green-100 border-green-500'
                    : index === answers[currentQuestion.id]
                    ? 'bg-red-100 border-red-500'
                    : 'bg-gray-50 border-gray-200'
                  : 'hover:bg-brand-50 hover:border-brand-300 border-gray-200'
              )}
            >
              {option}
            </button>
          ))}
        </div>

        {hasAnswered && currentQuestion.explanation && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800"
          >
            {currentQuestion.explanation}
          </motion.p>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}

// ============================================
// Fill in the Blank Section Component
// ============================================

interface FillBlankSectionProps {
  section: LanguageFillBlankSection;
  onComplete: (score: number, total: number) => void;
}

export function FillBlankSectionExercise({ section, onComplete }: FillBlankSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [inputValue, setInputValue] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const items = section.items;
  const currentItem = items[currentIndex];
  const hasAnswered = currentItem?.id in results;

  const checkAnswer = () => {
    if (!inputValue.trim()) return;

    const correct = currentItem.blank.correctAnswers.some(
      ans => ans.toLowerCase().trim() === inputValue.toLowerCase().trim()
    );

    setAnswers(prev => ({ ...prev, [currentItem.id]: inputValue }));
    setResults(prev => ({ ...prev, [currentItem.id]: correct }));
    setIsCorrect(correct);
    setShowFeedback(true);

    setTimeout(() => {
      setShowFeedback(false);
      if (currentIndex < items.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setInputValue('');
        setShowHint(false);
      } else {
        const correctCount = Object.values({ ...results, [currentItem.id]: correct }).filter(Boolean).length;
        onComplete(correctCount, items.length);
      }
    }, 2000);
  };

  if (!currentItem) return null;

  // Replace ___BLANK___ with input field indicator
  const sentenceParts = currentItem.sentence.split('___BLANK___');

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions={section.instructions}
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="text-lg mb-2">
          {sentenceParts[0]}
          <span className="inline-block mx-1 px-2 py-1 bg-brand-100 rounded border-b-2 border-brand-500 min-w-[80px]">
            {hasAnswered ? answers[currentItem.id] : '______'}
          </span>
          {sentenceParts[1]}
        </div>

        {currentItem.romanization && (
          <p className="text-sm text-gray-500 italic mb-2">{currentItem.romanization}</p>
        )}

        <p className="text-sm text-gray-600 mb-4">{currentItem.translation}</p>

        {!hasAnswered && (
          <>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && checkAnswer()}
                placeholder="Type your answer..."
                className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                autoFocus
              />
              <button
                onClick={checkAnswer}
                disabled={!inputValue.trim()}
                className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                Check
              </button>
            </div>

            {currentItem.blank.hint && (
              <button
                onClick={() => setShowHint(true)}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <Lightbulb className="w-4 h-4" />
                {showHint ? currentItem.blank.hint : 'Show hint'}
              </button>
            )}
          </>
        )}

        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={clsx(
              'p-3 rounded-lg',
              results[currentItem.id] ? 'bg-green-100' : 'bg-red-100'
            )}
          >
            <p className={results[currentItem.id] ? 'text-green-800' : 'text-red-800'}>
              {results[currentItem.id]
                ? 'Correct!'
                : `Correct answer: ${currentItem.blank.correctAnswers[0]}`}
            </p>
          </motion.div>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}

// ============================================
// Translation Section Component
// ============================================

interface TranslationSectionProps {
  section: TranslationSection;
  onComplete: (score: number, total: number) => void;
}

export function TranslationSectionExercise({ section, onComplete }: TranslationSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [inputValue, setInputValue] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const items = section.items;
  const currentItem = items[currentIndex];
  const hasAnswered = currentItem?.id in results;

  const checkAnswer = () => {
    if (!inputValue.trim()) return;

    const correct = currentItem.acceptedAnswers.some(
      ans => ans.toLowerCase().trim() === inputValue.toLowerCase().trim()
    );

    setAnswers(prev => ({ ...prev, [currentItem.id]: inputValue }));
    setResults(prev => ({ ...prev, [currentItem.id]: correct }));
    setIsCorrect(correct);
    setShowFeedback(true);

    setTimeout(() => {
      setShowFeedback(false);
      if (currentIndex < items.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setInputValue('');
        setShowHint(false);
      } else {
        const correctCount = Object.values({ ...results, [currentItem.id]: correct }).filter(Boolean).length;
        onComplete(correctCount, items.length);
      }
    }, 2000);
  };

  if (!currentItem) return null;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions={section.instructions}
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="mb-4">
          <span className={clsx(
            'inline-block px-2 py-1 rounded text-xs font-medium mb-2',
            currentItem.direction === 'toTarget' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
          )}>
            {currentItem.direction === 'toTarget' ? 'Translate to target language' : 'Translate to English'}
          </span>
          <p className="text-lg font-medium">{currentItem.prompt}</p>
          {currentItem.romanization && (
            <p className="text-sm text-gray-500 italic">{currentItem.romanization}</p>
          )}
        </div>

        {!hasAnswered && (
          <>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && checkAnswer()}
                placeholder="Type your translation..."
                className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                autoFocus
              />
              <button
                onClick={checkAnswer}
                disabled={!inputValue.trim()}
                className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                Check
              </button>
            </div>

            {currentItem.hint && (
              <button
                onClick={() => setShowHint(true)}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <Lightbulb className="w-4 h-4" />
                {showHint ? currentItem.hint : 'Show hint'}
              </button>
            )}
          </>
        )}

        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={clsx(
              'p-3 rounded-lg',
              results[currentItem.id] ? 'bg-green-100' : 'bg-red-100'
            )}
          >
            <p className={results[currentItem.id] ? 'text-green-800' : 'text-red-800'}>
              {results[currentItem.id]
                ? 'Correct!'
                : `Accepted answers: ${currentItem.acceptedAnswers.join(' / ')}`}
            </p>
          </motion.div>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}

// ============================================
// Reorder Section Component
// ============================================

interface ReorderSectionProps {
  section: ReorderSection;
  onComplete: (score: number, total: number) => void;
}

export function ReorderSectionExercise({ section, onComplete }: ReorderSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [availableWords, setAvailableWords] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const items = section.items;
  const currentItem = items[currentIndex];
  const hasAnswered = currentItem?.id in results;

  useEffect(() => {
    if (currentItem) {
      setAvailableWords([...currentItem.scrambled]);
      setSelectedWords([]);
      setShowHint(false);
    }
  }, [currentIndex, currentItem]);

  const handleWordClick = (word: string, fromSelected: boolean) => {
    if (hasAnswered) return;

    if (fromSelected) {
      setSelectedWords(prev => prev.filter((w, i) => i !== prev.indexOf(word)));
      setAvailableWords(prev => [...prev, word]);
    } else {
      setAvailableWords(prev => prev.filter((w, i) => i !== prev.indexOf(word)));
      setSelectedWords(prev => [...prev, word]);
    }
  };

  const checkAnswer = () => {
    const correct = JSON.stringify(selectedWords) === JSON.stringify(currentItem.correctOrder);
    setResults(prev => ({ ...prev, [currentItem.id]: correct }));
    setIsCorrect(correct);
    setShowFeedback(true);

    setTimeout(() => {
      setShowFeedback(false);
      if (currentIndex < items.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        const correctCount = Object.values({ ...results, [currentItem.id]: correct }).filter(Boolean).length;
        onComplete(correctCount, items.length);
      }
    }, 2000);
  };

  const resetOrder = () => {
    setAvailableWords([...currentItem.scrambled]);
    setSelectedWords([]);
  };

  if (!currentItem) return null;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions={section.instructions}
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <p className="text-sm text-gray-600 mb-4">
          <span className="font-medium">Meaning:</span> {currentItem.translation}
        </p>

        {/* Selected words area */}
        <div className="min-h-[60px] p-3 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 mb-4">
          {selectedWords.length === 0 ? (
            <p className="text-gray-400 text-center">Click words below to build the sentence</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedWords.map((word, index) => (
                <button
                  key={`selected-${index}`}
                  onClick={() => handleWordClick(word, true)}
                  disabled={hasAnswered}
                  className={clsx(
                    'px-3 py-2 rounded-lg font-medium transition-all',
                    hasAnswered
                      ? results[currentItem.id]
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                      : 'bg-brand-100 text-brand-700 hover:bg-brand-200'
                  )}
                >
                  {word}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Available words */}
        {!hasAnswered && (
          <div className="flex flex-wrap gap-2 mb-4">
            {availableWords.map((word, index) => (
              <button
                key={`available-${index}`}
                onClick={() => handleWordClick(word, false)}
                className="px-3 py-2 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                {word}
              </button>
            ))}
          </div>
        )}

        {!hasAnswered && (
          <div className="flex gap-2">
            <button
              onClick={resetOrder}
              className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-800"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            {currentItem.hint && (
              <button
                onClick={() => setShowHint(true)}
                className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-800"
              >
                <Lightbulb className="w-4 h-4" />
                {showHint ? currentItem.hint : 'Hint'}
              </button>
            )}
            <button
              onClick={checkAnswer}
              disabled={selectedWords.length !== currentItem.correctOrder.length}
              className="ml-auto px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
            >
              Check
            </button>
          </div>
        )}

        {hasAnswered && !results[currentItem.id] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-3 bg-blue-50 rounded-lg"
          >
            <p className="text-sm text-blue-800">
              <span className="font-medium">Correct order:</span> {currentItem.correctOrder.join(' ')}
            </p>
          </motion.div>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}

// ============================================
// Typing Section Component
// ============================================

interface TypingSectionProps {
  section: TypingSection;
  targetLanguage?: TargetLanguage;
  onComplete: (score: number, total: number) => void;
}

export function TypingSectionExercise({ section, targetLanguage, onComplete }: TypingSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const { speak, isSupported } = useBrowserTTS(targetLanguage || 'chinese');

  const items = section.items;
  const currentItem = items[currentIndex];
  const hasAnswered = currentItem?.id in results;

  const playAudio = useCallback(() => {
    if (currentItem?.audioText && isSupported) {
      speak(currentItem.audioText);
    }
  }, [currentItem?.audioText, isSupported, speak]);

  // Auto-play audio when item changes (only for audio-only mode)
  useEffect(() => {
    if (currentItem?.audioText && !currentItem.displayText && isSupported) {
      const timer = setTimeout(playAudio, 500);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, currentItem?.audioText, currentItem?.displayText, isSupported, playAudio]);

  const checkAnswer = () => {
    if (!inputValue.trim()) return;

    const correct = currentItem.acceptedAnswers.some(
      ans => ans.toLowerCase().trim() === inputValue.toLowerCase().trim()
    );

    setResults(prev => ({ ...prev, [currentItem.id]: correct }));
    setIsCorrect(correct);
    setShowFeedback(true);

    setTimeout(() => {
      setShowFeedback(false);
      if (currentIndex < items.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setInputValue('');
      } else {
        const correctCount = Object.values({ ...results, [currentItem.id]: correct }).filter(Boolean).length;
        onComplete(correctCount, items.length);
      }
    }, 2000);
  };

  if (!currentItem) return null;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions={section.instructions}
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <p className="text-sm text-gray-600 mb-4">{currentItem.prompt}</p>

        {currentItem.displayText && (
          <div className="text-center mb-4">
            <p className="text-3xl font-medium mb-1">{currentItem.displayText}</p>
            {currentItem.romanization && (
              <p className="text-sm text-gray-500 italic">{currentItem.romanization}</p>
            )}
          </div>
        )}

        {currentItem.audioText && (
          <button
            onClick={playAudio}
            className="mb-4 w-full py-4 flex items-center justify-center gap-2 bg-brand-50 rounded-lg text-brand-600 hover:bg-brand-100 transition-colors"
          >
            <Volume2 className="w-6 h-6" />
            <span className="font-medium">Play Audio</span>
          </button>
        )}

        {!hasAnswered && (
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && checkAnswer()}
              placeholder="Type what you see or hear..."
              className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-lg"
              autoFocus
            />
            <button
              onClick={checkAnswer}
              disabled={!inputValue.trim()}
              className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
            >
              Check
            </button>
          </div>
        )}

        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={clsx(
              'p-3 rounded-lg',
              results[currentItem.id] ? 'bg-green-100' : 'bg-red-100'
            )}
          >
            <p className={results[currentItem.id] ? 'text-green-800' : 'text-red-800'}>
              {results[currentItem.id]
                ? 'Correct!'
                : `Correct answer: ${currentItem.acceptedAnswers[0]}`}
            </p>
          </motion.div>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}
