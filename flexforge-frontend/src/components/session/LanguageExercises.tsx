import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Volume2, ArrowRight, Shuffle, RotateCcw, Lightbulb, Sparkles, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { useBrowserTTS } from '@/hooks/useBrowserTTS';
import { useAuthStore } from '@/stores/authStore';
import { progressService } from '@/services/progressService';
import type {
  QuizSection,
  MatchingSection,
  ToneSelectSection,
  LanguageFillBlankSection,
  TranslationSection,
  ReorderSection,
  TypingSection,
  OpenEndedSection,
  TargetLanguage,
  OpenEndedResult,
  NewKnowledgeItem,
} from '@/types';
import { evaluateOpenEndedResponse, QuotaTier } from '@/types';

// Extended result type for open-ended that includes all AI fields
interface OpenEndedFeedbackResult {
  passed: boolean;
  feedback: string;
  score?: number;
  evaluationType?: 'basic' | 'ai';
  aiStrengths?: string[];
  aiImprovements?: string[];
  dimensionResults?: {
    dimensionId: string;
    label: string;
    found: boolean;
    hint?: string;
    aiScore?: number;
    aiFeedback?: string;
  }[];
}

// ============================================
// Shared Components
// ============================================

// Display new knowledge/vocabulary before exercises
interface NewKnowledgeBoxProps {
  items?: NewKnowledgeItem[];
}

function NewKnowledgeBox({ items }: NewKnowledgeBoxProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-medium text-amber-700">New in this section:</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => (
          <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded border border-amber-200 text-sm">
            <strong className="text-gray-900">{item.term}</strong>
            <span className="text-gray-500">= {item.meaning}</span>
            {item.pronunciation && <span className="text-gray-400 text-xs">[{item.pronunciation}]</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

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
            'fixed bottom-1/3 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50',
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
// Quiz Section Component (MCQ + Open-Ended)
// ============================================

interface QuizSectionProps {
  section: QuizSection;
  targetLanguage?: TargetLanguage;
  onComplete: (score: number, total: number) => void;
}

export function QuizSectionExercise({ section, targetLanguage, onComplete }: QuizSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  // For MCQ answers (stores option index)
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, number>>({});
  // For open-ended answers (stores text response)
  const [openEndedAnswers, setOpenEndedAnswers] = useState<Record<string, string>>({});
  // For open-ended evaluation results
  const [openEndedResults, setOpenEndedResults] = useState<Record<string, OpenEndedResult>>({});
  // UI states
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [textInput, setTextInput] = useState('');
  // AI evaluation states
  const [isEvaluatingWithAI, setIsEvaluatingWithAI] = useState(false);
  const [aiEvaluationsRemaining, setAiEvaluationsRemaining] = useState<number | null>(null);

  const { speak, isSupported } = useBrowserTTS(targetLanguage || 'chinese');
  const { hasTierAccess } = useAuthStore();
  const isProUser = hasTierAccess(QuotaTier.PRO);

  // Fetch AI evaluation remaining on mount
  useEffect(() => {
    progressService.getAIEvaluationRemaining().then(res => {
      setAiEvaluationsRemaining(res.isPro ? -1 : res.remaining);
    });
  }, []);

  const questions = section.questions;
  const currentQuestion = questions[currentIndex];
  const isOpenEnded = currentQuestion?.responseType === 'openEnded';
  const hasAnswered = isOpenEnded
    ? currentQuestion?.id in openEndedResults
    : currentQuestion?.id in mcqAnswers;

  // Word count for open-ended
  const wordCount = textInput.trim().split(/\s+/).filter(Boolean).length;
  const minWords = currentQuestion?.openEndedConfig?.minWords || 30;

  // Handle MCQ answer
  const handleMcqAnswer = (optionIndex: number) => {
    if (hasAnswered) return;

    const correct = optionIndex === currentQuestion.correctIndex;
    setMcqAnswers(prev => ({ ...prev, [currentQuestion.id]: optionIndex }));
    setIsCorrect(correct);
    setShowFeedback(true);

    setTimeout(() => {
      setShowFeedback(false);
      advanceOrComplete(correct ? 1 : 0);
    }, 1500);
  };

  // Handle open-ended submission - always basic evaluation first
  const handleOpenEndedSubmit = () => {
    if (!currentQuestion.openEndedConfig) return;

    // Do basic keyword-based evaluation
    const basicResult = evaluateOpenEndedResponse(
      textInput,
      currentQuestion.openEndedConfig,
    );

    setOpenEndedAnswers(prev => ({ ...prev, [currentQuestion.id]: textInput }));
    setOpenEndedResults(prev => ({ ...prev, [currentQuestion.id]: basicResult }));
    setIsCorrect(basicResult.passed);
    setShowFeedback(true);

    setTimeout(() => {
      setShowFeedback(false);
    }, 1500);
  };

  // Request AI evaluation (available to all users with limits)
  const handleRequestAIEvaluation = async () => {
    if (!currentQuestion.openEndedConfig) return;
    if (aiEvaluationsRemaining === 0) return;

    setIsEvaluatingWithAI(true);

    try {
      const aiResponse = await progressService.evaluateOpenEndedWithAI({
        questionId: currentQuestion.id,
        question: currentQuestion.question,
        category: currentQuestion.openEndedConfig.category,
        scenario: currentQuestion.openEndedConfig.scenario,
        constraints: currentQuestion.openEndedConfig.constraints,
        response: openEndedAnswers[currentQuestion.id] || textInput,
        evaluationDimensions: currentQuestion.openEndedConfig.evaluationDimensions,
      });

      if (aiResponse.success && aiResponse.result) {
        setOpenEndedResults(prev => ({ ...prev, [currentQuestion.id]: aiResponse.result! }));
        // Update remaining count
        if (aiResponse.remaining !== undefined && aiResponse.remaining >= 0) {
          setAiEvaluationsRemaining(aiResponse.remaining);
        }
      }
    } finally {
      setIsEvaluatingWithAI(false);
    }
  };

  // Continue to next question
  const handleContinue = () => {
    const result = openEndedResults[currentQuestion.id];
    advanceOrComplete(result?.score || 0);
  };

  // Advance to next question or complete the section
  const advanceOrComplete = (questionScore: number) => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setTextInput('');
    } else {
      // Calculate final score
      let totalScore = 0;
      const allAnswers = { ...mcqAnswers };
      const allOpenEndedResults = { ...openEndedResults };

      // Add current question's score
      if (isOpenEnded) {
        totalScore += questionScore;
      } else {
        totalScore += questionScore;
      }

      // Add previous questions' scores
      questions.slice(0, currentIndex).forEach(q => {
        if (q.responseType === 'openEnded') {
          totalScore += allOpenEndedResults[q.id]?.score || 0;
        } else {
          const correct = allAnswers[q.id] === q.correctIndex;
          totalScore += correct ? 1 : 0;
        }
      });

      onComplete(Math.round(totalScore), questions.length);
    }
  };

  const playAudio = useCallback(() => {
    if (currentQuestion?.audioText && isSupported) {
      speak(currentQuestion.audioText);
    }
  }, [currentQuestion?.audioText, isSupported, speak]);

  // Auto-play audio when question changes
  useEffect(() => {
    if (currentQuestion?.audioText && isSupported) {
      const timer = setTimeout(playAudio, 500);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, currentQuestion?.audioText, isSupported, playAudio]);

  // Reset text input when moving to a new question
  useEffect(() => {
    setTextInput('');
  }, [currentIndex]);

  if (!currentQuestion) return null;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        progress={{ current: currentIndex + 1, total: questions.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        {/* Audio button */}
        {currentQuestion.audioText && (
          <button
            onClick={playAudio}
            className="mb-4 flex items-center gap-2 text-brand-600 hover:text-brand-700"
          >
            <Volume2 className="w-5 h-5" />
            <span>Play Audio</span>
          </button>
        )}

        {/* Open-ended badge and scenario */}
        {isOpenEnded && currentQuestion.openEndedConfig && (
          <div className="mb-4">
            <span className="inline-block px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium capitalize mb-2">
              {currentQuestion.openEndedConfig.category}
            </span>
            {currentQuestion.openEndedConfig.scenario && (
              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <p className="text-sm text-gray-700">{currentQuestion.openEndedConfig.scenario}</p>
              </div>
            )}
            {currentQuestion.openEndedConfig.constraints && currentQuestion.openEndedConfig.constraints.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {currentQuestion.openEndedConfig.constraints.map((c, i) => (
                  <span key={i} className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Question text */}
        <p className="text-lg font-medium mb-4">{currentQuestion.question}</p>

        {/* MCQ Options */}
        {!isOpenEnded && currentQuestion.options && (
          <div className="space-y-2">
            {currentQuestion.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleMcqAnswer(index)}
                disabled={hasAnswered}
                className={clsx(
                  'w-full p-3 text-left rounded-lg border transition-all',
                  hasAnswered
                    ? index === currentQuestion.correctIndex
                      ? 'bg-green-100 border-green-500'
                      : index === mcqAnswers[currentQuestion.id]
                      ? 'bg-red-100 border-red-500'
                      : 'bg-gray-50 border-gray-200'
                    : 'hover:bg-brand-50 hover:border-brand-300 border-gray-200'
                )}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {/* Open-ended text area */}
        {isOpenEnded && !hasAnswered && (
          <div className="space-y-3">
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type your response here..."
              className="w-full h-32 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
            <div className={clsx(
              'text-sm',
              wordCount >= minWords ? 'text-green-600' : 'text-gray-500'
            )}>
              {wordCount} / {minWords} words minimum
            </div>

            <button
              onClick={handleOpenEndedSubmit}
              disabled={wordCount < minWords}
              className={clsx(
                'w-full py-3 rounded-lg font-medium transition-colors',
                wordCount >= minWords
                  ? 'bg-brand-500 text-white hover:bg-brand-600'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              )}
            >
              Submit Response
            </button>
          </div>
        )}

        {/* AI Evaluation Loading */}
        {isOpenEnded && isEvaluatingWithAI && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 p-4 rounded-lg bg-purple-50 border border-purple-200"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-purple-600 animate-pulse" />
              <div>
                <p className="font-medium text-purple-800">Analyzing your response...</p>
                <p className="text-sm text-purple-600">Our AI is evaluating your reasoning quality</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Open-ended result display */}
        {isOpenEnded && hasAnswered && openEndedResults[currentQuestion.id] && !isEvaluatingWithAI && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={clsx(
              'mt-4 p-4 rounded-lg',
              openEndedResults[currentQuestion.id].passed ? 'bg-green-50' : 'bg-orange-50'
            )}
          >
            {/* AI evaluation badge */}
            {openEndedResults[currentQuestion.id].evaluationType === 'ai' && (
              <div className="flex items-center gap-1 text-xs text-purple-600 mb-2">
                <Sparkles className="w-3 h-3" />
                AI-Powered Feedback
              </div>
            )}

            <div className="flex items-start gap-2 mb-2">
              {openEndedResults[currentQuestion.id].passed ? (
                <Check className="w-5 h-5 text-green-600 mt-0.5" />
              ) : (
                <Lightbulb className="w-5 h-5 text-orange-600 mt-0.5" />
              )}
              <p className={clsx(
                'font-medium',
                openEndedResults[currentQuestion.id].passed ? 'text-green-800' : 'text-orange-800'
              )}>
                {openEndedResults[currentQuestion.id].aiOverallFeedback || openEndedResults[currentQuestion.id].feedback}
              </p>
            </div>

            {/* AI Strengths (Pro only) */}
            {openEndedResults[currentQuestion.id].aiStrengths && openEndedResults[currentQuestion.id].aiStrengths!.length > 0 && (
              <div className="mt-3 p-2 bg-green-100 rounded">
                <p className="text-xs font-medium text-green-700 mb-1">Strengths:</p>
                <ul className="text-sm text-green-800 space-y-1">
                  {openEndedResults[currentQuestion.id].aiStrengths!.map((s, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <Check className="w-3 h-3 mt-1 flex-shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* AI Improvements (Pro only) */}
            {openEndedResults[currentQuestion.id].aiImprovements && openEndedResults[currentQuestion.id].aiImprovements!.length > 0 && (
              <div className="mt-2 p-2 bg-orange-100 rounded">
                <p className="text-xs font-medium text-orange-700 mb-1">To strengthen your response:</p>
                <ul className="text-sm text-orange-800 space-y-1">
                  {openEndedResults[currentQuestion.id].aiImprovements!.map((s, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <ArrowRight className="w-3 h-3 mt-1 flex-shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Dimension breakdown */}
            <div className="mt-3 space-y-1">
              {openEndedResults[currentQuestion.id].dimensionResults.map(dim => (
                <div key={dim.dimensionId} className="flex items-start gap-2 text-sm">
                  {dim.found ? (
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className={dim.found ? 'text-green-700' : 'text-gray-500'}>
                      {dim.label}
                    </span>
                    {/* AI-specific feedback per dimension (Pro only) */}
                    {dim.aiFeedback && (
                      <p className="text-xs text-gray-500 mt-0.5">{dim.aiFeedback}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex gap-2">
              {/* Get AI Feedback button - show if basic evaluation and has remaining */}
              {openEndedResults[currentQuestion.id].evaluationType === 'basic' && aiEvaluationsRemaining !== 0 && (
                <button
                  onClick={handleRequestAIEvaluation}
                  disabled={isEvaluatingWithAI}
                  className="flex-1 py-2 px-4 rounded-lg font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Get AI Feedback
                  {aiEvaluationsRemaining !== null && aiEvaluationsRemaining >= 0 && (
                    <span className="text-xs opacity-75">({aiEvaluationsRemaining} left today)</span>
                  )}
                </button>
              )}

              {/* No AI remaining message */}
              {openEndedResults[currentQuestion.id].evaluationType === 'basic' && aiEvaluationsRemaining === 0 && (
                <div className="flex-1 py-2 px-4 rounded-lg bg-gray-100 text-gray-500 text-sm text-center">
                  <Lock className="w-4 h-4 inline mr-1" />
                  Daily AI limit reached. Upgrade to Pro for unlimited.
                </div>
              )}

              {/* Continue button */}
              <button
                onClick={handleContinue}
                className="flex-1 py-2 px-4 rounded-lg font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* MCQ explanation */}
        {!isOpenEnded && hasAnswered && currentQuestion.explanation && (
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

      <NewKnowledgeBox items={section.newKnowledge} />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="text-lg mb-2">
          {sentenceParts[0]}
          <span className="inline-block mx-1 px-2 py-1 bg-brand-100 rounded border-b-2 border-brand-500 min-w-[60px] sm:min-w-[80px]">
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

      <NewKnowledgeBox items={section.newKnowledge} />

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

// ============================================
// Open-Ended Section Exercise (Soft Skills/Leadership)
// ============================================

interface OpenEndedSectionProps {
  section: OpenEndedSection;
  onComplete: (score: number, total: number) => void;
}

export function OpenEndedSectionExercise({ section, onComplete }: OpenEndedSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, OpenEndedFeedbackResult>>({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const questions = section.questions;
  const currentQuestion = questions[currentIndex];
  const currentResponse = responses[currentQuestion.id] || '';
  const currentResult = results[currentQuestion.id];

  const handleResponseChange = (value: string) => {
    setResponses(prev => ({ ...prev, [currentQuestion.id]: value }));
  };

  const handleSubmit = async () => {
    if (currentResponse.trim().length < 20) return;

    setIsEvaluating(true);
    try {
      // Convert simple evaluationCriteria to evaluationDimensions format
      const evaluationDimensions = currentQuestion.evaluationCriteria.map((criterion, i) => ({
        id: `dim-${i}`,
        label: criterion,
        hint: `Consider: ${criterion}`,
        required: i === 0, // First criterion is required
      }));

      // Call AI evaluation
      const evalResult = await progressService.evaluateOpenEndedWithAI({
        questionId: currentQuestion.id,
        question: `${currentQuestion.question}\n\n${currentQuestion.prompt}`,
        category: 'general' as const,
        scenario: currentQuestion.sampleAnswer ? `Sample answer for reference: ${currentQuestion.sampleAnswer}` : undefined,
        response: currentResponse,
        evaluationDimensions,
      });

      if (evalResult.success && evalResult.result) {
        const result = evalResult.result;
        setResults(prev => ({
          ...prev,
          [currentQuestion.id]: {
            passed: result.passed,
            feedback: result.feedback || result.aiOverallFeedback || (result.passed ? 'Good response!' : 'Consider expanding your answer.'),
            score: result.score,
            evaluationType: result.evaluationType,
            aiStrengths: result.aiStrengths,
            aiImprovements: result.aiImprovements,
            dimensionResults: result.dimensionResults,
          },
        }));
        setShowFeedback(true);
      } else {
        // Log the error for debugging
        console.error('AI evaluation returned error:', evalResult.error);
        throw new Error(evalResult.error || 'Evaluation failed');
      }
    } catch (error) {
      console.error('AI evaluation failed:', error);
      // Fallback: provide helpful feedback based on criteria
      const wordCount = currentResponse.trim().split(/\s+/).length;
      const passed = wordCount >= 20;
      const criteria = currentQuestion.evaluationCriteria;

      let feedback = '';
      if (passed) {
        feedback = `Your response has been recorded. Consider reviewing these points:\n• ${criteria.slice(0, 2).join('\n• ')}`;
        if (currentQuestion.sampleAnswer) {
          feedback += '\n\nCheck the sample answer below for comparison.';
        }
      } else {
        feedback = `Try to expand your answer (currently ${wordCount} words, aim for 20+). Make sure to address: ${criteria[0]}`;
      }

      setResults(prev => ({
        ...prev,
        [currentQuestion.id]: {
          passed,
          feedback,
          evaluationType: 'basic',
        },
      }));
      setShowFeedback(true);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowFeedback(false);
    } else {
      // Calculate final score
      const passed = Object.values(results).filter(r => r.passed).length;
      onComplete(passed, questions.length);
    }
  };

  const wordCount = currentResponse.trim().split(/\s+/).filter(w => w.length > 0).length;

  return (
    <div className="space-y-6">
      <ExerciseHeader
        title={section.title}
        progress={{ current: currentIndex + 1, total: questions.length }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-4"
        >
          {/* Question/Scenario */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-xl border border-purple-100">
            <p className="text-gray-800 font-medium">{currentQuestion.question}</p>
          </div>

          {/* Prompt */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-gray-600 text-sm italic">{currentQuestion.prompt}</p>
          </div>

          {/* Response textarea */}
          <div className="space-y-2">
            <textarea
              value={currentResponse}
              onChange={(e) => handleResponseChange(e.target.value)}
              placeholder="Type your response here..."
              disabled={!!currentResult}
              className={clsx(
                'w-full p-4 rounded-xl border-2 resize-none transition-all min-h-[150px]',
                currentResult
                  ? currentResult.passed
                    ? 'border-green-300 bg-green-50'
                    : 'border-amber-300 bg-amber-50'
                  : 'border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100'
              )}
              rows={6}
            />
            <div className="flex justify-between text-sm text-gray-500">
              <span>{wordCount} words</span>
              <span className={wordCount >= 20 ? 'text-green-600' : 'text-gray-400'}>
                Min: 20 words
              </span>
            </div>
          </div>

          {/* Evaluation criteria hints */}
          {!currentResult && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm font-medium text-blue-800 mb-2">Your response should:</p>
              <ul className="text-sm text-blue-700 space-y-1">
                {currentQuestion.evaluationCriteria.map((criterion, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    {criterion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Feedback */}
          {showFeedback && currentResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Main feedback card */}
              <div className={clsx(
                'rounded-2xl overflow-hidden border-2',
                currentResult.passed
                  ? 'border-green-200 bg-gradient-to-br from-green-50 to-emerald-50'
                  : 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50'
              )}>
                {/* Header with score */}
                <div className={clsx(
                  'px-4 py-3 flex items-center justify-between',
                  currentResult.passed ? 'bg-green-100/50' : 'bg-amber-100/50'
                )}>
                  <div className="flex items-center gap-2">
                    {currentResult.passed ? (
                      <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center">
                        <Lightbulb className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <span className={clsx(
                      'font-semibold',
                      currentResult.passed ? 'text-green-800' : 'text-amber-800'
                    )}>
                      {currentResult.passed ? 'Great Response!' : 'Good Effort!'}
                    </span>
                  </div>

                  {/* Score badge */}
                  {currentResult.score !== undefined && (
                    <div className={clsx(
                      'px-3 py-1 rounded-full text-sm font-medium',
                      currentResult.passed ? 'bg-green-200 text-green-800' : 'bg-amber-200 text-amber-800'
                    )}>
                      {Math.round(currentResult.score * 100)}%
                    </div>
                  )}

                  {/* AI badge */}
                  {currentResult.evaluationType === 'ai' && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 rounded-full">
                      <Sparkles className="w-3 h-3 text-purple-600" />
                      <span className="text-xs font-medium text-purple-700">AI Feedback</span>
                    </div>
                  )}
                </div>

                {/* Main feedback content */}
                <div className="p-4">
                  <p className={clsx(
                    'text-sm leading-relaxed',
                    currentResult.passed ? 'text-green-800' : 'text-amber-800'
                  )}>
                    {currentResult.feedback}
                  </p>
                </div>
              </div>

              {/* Strengths section */}
              {currentResult.aiStrengths && currentResult.aiStrengths.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white rounded-xl border border-green-200 p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <span className="font-medium text-green-800">What you did well</span>
                  </div>
                  <ul className="space-y-2">
                    {currentResult.aiStrengths.map((strength, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-green-500 mt-0.5">+</span>
                        {strength}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}

              {/* Improvements section */}
              {currentResult.aiImprovements && currentResult.aiImprovements.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white rounded-xl border border-blue-200 p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="font-medium text-blue-800">To strengthen your response</span>
                  </div>
                  <ul className="space-y-2">
                    {currentResult.aiImprovements.map((improvement, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-blue-500 mt-0.5">→</span>
                        {improvement}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}

              {/* Dimension results */}
              {currentResult.dimensionResults && currentResult.dimensionResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-medium text-gray-800">Evaluation Criteria</span>
                  </div>
                  <div className="space-y-2">
                    {currentResult.dimensionResults.map((dim) => (
                      <div key={dim.dimensionId} className="flex items-center gap-3">
                        <div className={clsx(
                          'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                          dim.found ? 'bg-green-100' : 'bg-gray-100'
                        )}>
                          {dim.found ? (
                            <Check className="w-3 h-3 text-green-600" />
                          ) : (
                            <X className="w-3 h-3 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={clsx(
                              'text-sm',
                              dim.found ? 'text-gray-800' : 'text-gray-500'
                            )}>
                              {dim.label}
                            </span>
                            {dim.aiScore !== undefined && (
                              <span className={clsx(
                                'text-xs px-1.5 py-0.5 rounded',
                                dim.aiScore >= 0.7 ? 'bg-green-100 text-green-700' :
                                dim.aiScore >= 0.4 ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-500'
                              )}>
                                {Math.round(dim.aiScore * 100)}%
                              </span>
                            )}
                          </div>
                          {dim.aiFeedback && (
                            <p className="text-xs text-gray-500 mt-0.5">{dim.aiFeedback}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Sample answer */}
              {currentQuestion.sampleAnswer && (
                <motion.details
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  <summary className="px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    View sample answer
                  </summary>
                  <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {currentQuestion.sampleAnswer}
                    </p>
                  </div>
                </motion.details>
              )}
            </motion.div>
          )}

          {/* Submit / Next button */}
          <div className="flex justify-end">
            {!currentResult ? (
              <button
                onClick={handleSubmit}
                disabled={wordCount < 20 || isEvaluating}
                className={clsx(
                  'px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2',
                  wordCount >= 20 && !isEvaluating
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                )}
              >
                {isEvaluating ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                    />
                    Evaluating...
                  </>
                ) : (
                  'Submit'
                )}
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-6 py-3 rounded-xl font-medium bg-purple-600 text-white hover:bg-purple-700 transition-all flex items-center gap-2"
              >
                {currentIndex < questions.length - 1 ? 'Next Question' : 'Complete'}
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
