import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Volume2, ArrowRight, ChevronLeft, RotateCcw, Lightbulb, Sparkles, Lock, Bookmark, Share2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useBrowserTTS } from '@/hooks/useBrowserTTS';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
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

/**
 * Hook to check if streaming is still in progress.
 * Used by exercise components to prevent completing a section
 * while more questions may still be streaming in.
 */
function useIsStreaming() {
  return useSessionStore((s) => !s.isStreamingComplete);
}

// Skeleton shown while a question is still streaming in
function QuestionStreamingSkeleton({ title, current, total }: { title?: string; current: number; total: number }) {
  return (
    <div className="space-y-4">
      {title && <ExerciseHeader title={title} progress={{ current, total }} />}
      <div className="bg-surface rounded-lg p-6 shadow-sm border animate-pulse">
        <div className="h-5 bg-surface-tertiary rounded w-3/4 mb-4" />
        <div className="space-y-2">
          <div className="h-12 bg-surface-tertiary rounded-lg" />
          <div className="h-12 bg-surface-tertiary rounded-lg" />
          <div className="h-12 bg-surface-tertiary rounded-lg" />
        </div>
      </div>
    </div>
  );
}

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
          <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-surface rounded border border-amber-200 text-sm">
            <strong className="text-content">{item.term}</strong>
            <span className="text-content-tertiary">= {item.meaning}</span>
            {item.pronunciation && <span className="text-content-tertiary text-xs">[{item.pronunciation}]</span>}
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
        <h3 className="text-lg font-semibold text-content">{title}</h3>
        <span className="text-sm text-content-tertiary">
          {progress.current} / {progress.total}
        </span>
      </div>
      {instructions && (
        <p className="text-sm text-content-secondary">{instructions}</p>
      )}
      <div className="mt-2 h-1 bg-surface-tertiary rounded-full overflow-hidden">
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
            'fixed bottom-1/3 left-1/2 transform -translate-x-1/2 px-4 sm:px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 max-w-[90vw] text-center',
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
// Progress persistence types
// ============================================
export interface SectionSavedProgress {
  answers: Record<string, number | string | boolean>;
  currentIndex: number;
}

// ============================================
// Quiz Section Component (MCQ + Open-Ended)
// ============================================

// Bookmark question data
export interface BookmarkQuestionData {
  question: string;
  options?: string[];
  correctAnswer?: string;
}

interface QuizSectionProps {
  section: QuizSection;
  targetLanguage?: TargetLanguage;
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
  onBookmarkQuestion?: (questionData: BookmarkQuestionData) => void;
  onShareQuestion?: (questionData: BookmarkQuestionData) => void;
}

export function QuizSectionExercise({ section, targetLanguage, onComplete, savedProgress, onProgressChange, onBookmarkQuestion, onShareQuestion }: QuizSectionProps) {
  const isStillStreaming = useIsStreaming();
  // Initialize from saved progress if available
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0);
  // For MCQ answers (stores option index)
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, number>>(() => {
    if (!savedProgress?.answers) return {};
    // Filter to only MCQ answers (numbers)
    const result: Record<string, number> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'number') result[k] = v;
    });
    return result;
  });
  // For open-ended answers (stores text response)
  const [openEndedAnswers, setOpenEndedAnswers] = useState<Record<string, string>>(() => {
    if (!savedProgress?.answers) return {};
    // Filter to only text answers
    const result: Record<string, string> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'string') result[k] = v;
    });
    return result;
  });
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
  const _isProUser = hasTierAccess(QuotaTier.PRO);

  // Fetch AI evaluation remaining on mount
  useEffect(() => {
    progressService.getAIEvaluationRemaining().then(res => {
      setAiEvaluationsRemaining(res.isPro ? -1 : res.remaining);
    });
  }, []);

  const questions = section.questions || [];
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
    }, 1500);
  };

  // Handle MCQ next button
  const handleMcqNext = () => {
    const correct = mcqAnswers[currentQuestion.id] === currentQuestion.correctIndex;
    advanceOrComplete(correct ? 1 : 0);
  };

  // Handle previous question
  const handlePrevQuestion = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setTextInput('');
    }
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

  // Report progress changes for persistence
  useEffect(() => {
    if (onProgressChange && (Object.keys(mcqAnswers).length > 0 || Object.keys(openEndedAnswers).length > 0)) {
      const allAnswers: Record<string, number | string | boolean> = {
        ...mcqAnswers,
        ...openEndedAnswers,
      };
      onProgressChange(allAnswers, currentIndex);
    }
  }, [mcqAnswers, openEndedAnswers, currentIndex, onProgressChange]);

  // When streaming completes and user already answered all questions, auto-complete
  useEffect(() => {
    if (!isStillStreaming && currentIndex >= questions.length && questions.length > 0) {
      let totalScore = 0;
      questions.forEach(q => {
        if (q.responseType === 'openEnded') {
          totalScore += openEndedResults[q.id]?.score || 0;
        } else {
          const correct = mcqAnswers[q.id] === q.correctIndex;
          totalScore += correct ? 1 : 0;
        }
      });
      const finalAnswers: Record<string, number | string | boolean> = {
        ...mcqAnswers,
        ...openEndedAnswers,
      };
      onComplete(Math.round(totalScore), questions.length, finalAnswers);
    }
  }, [isStillStreaming, questions.length]);

  // Advance to next question or complete the section
  const advanceOrComplete = (questionScore: number) => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setTextInput('');
    } else if (isStillStreaming) {
      // More questions may still be streaming in - advance index to show skeleton
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

      // Combine all answers for persistence
      const finalAnswers: Record<string, number | string | boolean> = {
        ...mcqAnswers,
        ...openEndedAnswers,
      };

      onComplete(Math.round(totalScore), questions.length, finalAnswers);
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

  if (!currentQuestion) {
    return <QuestionStreamingSkeleton title={section.title} current={currentIndex + 1} total={Math.max(questions.length, currentIndex + 1)} />;
  }

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        progress={{ current: currentIndex + 1, total: questions.length }}
      />

      <div className="bg-surface rounded-lg p-6 shadow-sm border">
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
              <div className="bg-surface-secondary rounded-lg p-3 mb-3">
                <p className="text-sm text-content-secondary">{currentQuestion.openEndedConfig.scenario}</p>
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

        {/* Case study scenario context (shown BEFORE answering) */}
        {!isOpenEnded && currentQuestion.caseStudy && (
          <div className="mb-4 p-3 bg-purple-50 rounded-xl border border-purple-200">
            <p className="text-sm text-purple-900 leading-relaxed">{currentQuestion.caseStudy.scenario}</p>
          </div>
        )}

        {/* Question text with bookmark and share */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <p className="text-lg font-medium">
            {!isOpenEnded && currentQuestion.caseStudy
              ? currentQuestion.caseStudy.question || currentQuestion.question
              : currentQuestion.question}
          </p>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onShareQuestion && (
              <button
                onClick={() => onShareQuestion({
                  question: currentQuestion.question,
                  options: currentQuestion.options,
                  correctAnswer: currentQuestion.options?.[currentQuestion.correctIndex ?? 0],
                })}
                className="p-1.5 text-content-tertiary hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                title="Share to community"
              >
                <Share2 className="w-5 h-5" />
              </button>
            )}
            {onBookmarkQuestion && (
              <button
                onClick={() => onBookmarkQuestion({
                  question: currentQuestion.question,
                  options: currentQuestion.options,
                  correctAnswer: currentQuestion.options?.[currentQuestion.correctIndex ?? 0],
                })}
                className="p-1.5 text-content-tertiary hover:text-brand-500 hover:bg-brand-50 rounded-lg transition-colors"
                title="Bookmark this question"
              >
                <Bookmark className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* MCQ Options (with case study consequences revealed after answering) */}
        {!isOpenEnded && currentQuestion.options && (
          <div className="space-y-2">
            {currentQuestion.options.map((option, index) => {
              const csOpt = hasAnswered && currentQuestion.caseStudy?.options?.[index];
              const consequence = csOpt
                ? typeof csOpt === 'string' ? '' : csOpt.consequence
                : '';
              const isBestChoice = hasAnswered && currentQuestion.caseStudy && index === currentQuestion.caseStudy.bestChoice;

              return (
                <div key={index}>
                  <button
                    onClick={() => handleMcqAnswer(index)}
                    disabled={hasAnswered}
                    className={clsx(
                      'w-full p-3 text-left rounded-lg border transition-all',
                      hasAnswered
                        ? index === currentQuestion.correctIndex
                          ? 'bg-green-100 border-green-500'
                          : index === mcqAnswers[currentQuestion.id]
                          ? 'bg-red-100 border-red-500'
                          : 'bg-surface-secondary border-border'
                        : 'hover:bg-brand-50 hover:border-brand-300 border-border'
                    )}
                  >
                    {option}
                    {isBestChoice && <span className="ml-2 text-green-600 text-xs font-semibold">Best choice</span>}
                  </button>
                  {/* Consequence revealed after answering */}
                  {hasAnswered && consequence && (
                    <p className={clsx(
                      'ml-4 mt-1 text-xs italic',
                      isBestChoice ? 'text-green-700' : 'text-content-tertiary'
                    )}>
                      → {consequence}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Open-ended text area */}
        {isOpenEnded && !hasAnswered && (
          <div className="space-y-3">
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type your response here..."
              className="w-full h-32 p-3 bg-surface text-content border border-border rounded-lg resize-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-base"
            />
            <div className={clsx(
              'text-sm',
              wordCount >= minWords ? 'text-green-600' : 'text-content-tertiary'
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
                  : 'bg-surface-tertiary text-content-tertiary cursor-not-allowed'
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
                    <X className="w-4 h-4 text-content-tertiary flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className={dim.found ? 'text-green-700' : 'text-content-tertiary'}>
                      {dim.label}
                    </span>
                    {/* AI-specific feedback per dimension (Pro only) */}
                    {dim.aiFeedback && (
                      <p className="text-xs text-content-tertiary mt-0.5">{dim.aiFeedback}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* AI Feedback option */}
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
                <div className="flex-1 py-2 px-4 rounded-lg bg-surface-tertiary text-content-tertiary text-sm text-center">
                  <Lock className="w-4 h-4 inline mr-1" />
                  Daily AI limit reached. Upgrade to Pro for unlimited.
                </div>
              )}
            </div>

            {/* Question navigation */}
            <div className="mt-4 flex justify-between items-center gap-2">
              <button
                onClick={handlePrevQuestion}
                disabled={currentIndex === 0}
                className={clsx(
                  'px-3 sm:px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 text-sm',
                  currentIndex === 0
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-content-secondary hover:bg-surface-tertiary active:bg-surface-tertiary'
                )}
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden xs:inline">Previous</span>
                <span className="xs:hidden">Prev</span>
              </button>
              <button
                onClick={handleContinue}
                className="px-3 sm:px-4 py-2.5 rounded-lg font-medium bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 transition-colors flex items-center justify-center gap-1.5 sm:gap-2 text-sm"
              >
                {currentIndex < questions.length - 1 ? 'Next' : 'Finish'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Rich concept explanation panel (primary learning content) */}
        {!isOpenEnded && hasAnswered && currentQuestion.explanation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="mt-4 rounded-xl border border-blue-200 overflow-hidden"
          >
            {/* Header with concept title */}
            {currentQuestion.conceptTitle && (
              <div className="px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-blue-900 text-sm">{currentQuestion.conceptTitle}</span>
              </div>
            )}

            {/* Explanation body - structured paragraphs */}
            <div className="px-4 py-3 bg-surface space-y-2">
              {currentQuestion.explanation.split('\n\n').map((paragraph: string, pIdx: number) => (
                <p
                  key={pIdx}
                  className={clsx(
                    'text-sm leading-relaxed',
                    pIdx === 0 ? 'font-medium text-content' : 'text-content-secondary'
                  )}
                >
                  {/* Render inline code backticks */}
                  {paragraph.split(/(`[^`]+`)/).map((part: string, partIdx: number) =>
                    part.startsWith('`') && part.endsWith('`') ? (
                      <code key={partIdx} className="px-1.5 py-0.5 bg-surface-tertiary text-indigo-700 rounded text-xs font-mono">
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
            {currentQuestion.realWorldContext && (
              <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-200 flex items-start gap-2">
                <span className="text-amber-500 flex-shrink-0 mt-0.5">🎯</span>
                <p className="text-sm text-amber-800">{currentQuestion.realWorldContext}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Case study verdict (shown inline after answering, separate from explanation panel) */}
        {!isOpenEnded && hasAnswered && currentQuestion.caseStudy?.explanation && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="mt-3 p-3 bg-purple-50 rounded-xl border border-purple-200 flex items-start gap-2"
          >
            <span className="text-purple-500 flex-shrink-0 mt-0.5">⚖️</span>
            <p className="text-sm text-purple-800 font-medium">{currentQuestion.caseStudy.explanation}</p>
          </motion.div>
        )}

        {/* MCQ Question Navigation */}
        {!isOpenEnded && hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 flex justify-between items-center gap-2"
          >
            <button
              onClick={handlePrevQuestion}
              disabled={currentIndex === 0}
              className={clsx(
                'px-3 sm:px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 text-sm',
                currentIndex === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-content-secondary hover:bg-surface-tertiary active:bg-surface-tertiary'
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden xs:inline">Previous</span>
              <span className="xs:hidden">Prev</span>
            </button>
            <button
              onClick={handleMcqNext}
              className="px-3 sm:px-4 py-2.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 active:bg-brand-700 transition-colors flex items-center gap-1.5 sm:gap-2 text-sm"
            >
              {currentIndex < questions.length - 1 ? 'Next' : 'Finish'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
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
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function MatchingSectionExercise({ section, onComplete, savedProgress, onProgressChange }: MatchingSectionProps) {
  const pairs = section.pairs || [];
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  // Initialize matches from saved progress
  const [matches, setMatches] = useState<Record<string, string>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, string> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'string') result[k] = v;
    });
    return result;
  });
  const [shuffledDefinitions, setShuffledDefinitions] = useState<string[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  useEffect(() => {
    // Shuffle definitions on mount
    const defs = pairs.map(p => p.definition);
    setShuffledDefinitions(defs.sort(() => Math.random() - 0.5));
  }, [pairs]);

  if (pairs.length === 0) return null;

  const handleTermClick = (term: string) => {
    if (matches[term]) return; // Already matched
    setSelectedTerm(term);
  };

  const handleDefinitionClick = (definition: string) => {
    if (!selectedTerm) return;
    if (Object.values(matches).includes(definition)) return; // Already used

    const pair = pairs.find(p => p.term === selectedTerm);
    const correct = pair?.definition === definition;

    setIsCorrect(correct);
    setShowFeedback(true);

    if (correct) {
      const newMatches = { ...matches, [selectedTerm]: definition };
      setMatches(newMatches);

      // Report progress
      if (onProgressChange) {
        onProgressChange(newMatches as Record<string, number | string | boolean>, Object.keys(newMatches).length);
      }
    }

    setTimeout(() => {
      setShowFeedback(false);
      setSelectedTerm(null);

      // Check if complete
      if (correct && Object.keys(matches).length + 1 === pairs.length) {
        const finalMatches = { ...matches, [selectedTerm]: definition };
        onComplete(pairs.length, pairs.length, finalMatches as Record<string, number | string | boolean>);
      }
    }, 1000);
  };

  const matchedCount = Object.keys(matches).length;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        progress={{ current: matchedCount, total: pairs.length }}
      />

      <div className="grid grid-cols-2 gap-4">
        {/* Terms column */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-content-tertiary mb-2">Words</p>
          {pairs.map(pair => (
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
                  : 'hover:bg-surface-secondary border-border'
              )}
            >
              {pair.term}
            </button>
          ))}
        </div>

        {/* Definitions column */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-content-tertiary mb-2">Meanings</p>
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
                    ? 'hover:bg-brand-50 hover:border-brand-300 border-border'
                    : 'border-border opacity-60'
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
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function ToneSelectSectionExercise({ section, targetLanguage, onComplete, savedProgress, onProgressChange }: ToneSelectSectionProps) {
  const isStillStreaming = useIsStreaming();
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0);
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, number> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'number') result[k] = v;
    });
    return result;
  });
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const { speak, isSupported } = useBrowserTTS(targetLanguage || 'chinese');

  const questions = section.questions || [];
  const currentQuestion = questions[currentIndex];
  const hasAnswered = currentQuestion?.id in answers;

  const handleAnswer = (optionIndex: number) => {
    if (hasAnswered) return;

    const correct = optionIndex === currentQuestion.correctIndex;
    const newAnswers = { ...answers, [currentQuestion.id]: optionIndex };
    setAnswers(newAnswers);
    setIsCorrect(correct);
    setShowFeedback(true);

    // Report progress
    if (onProgressChange) {
      onProgressChange(newAnswers as Record<string, number | string | boolean>, currentIndex);
    }

    setTimeout(() => {
      setShowFeedback(false);
    }, 1500);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else if (isStillStreaming) {
      setCurrentIndex(prev => prev + 1);
    } else {
      const correctCount = Object.entries(answers)
        .filter(([id, ans]) => {
          const q = questions.find(q => q.id === id);
          return q && ans === q.correctIndex;
        }).length;
      onComplete(correctCount, questions.length, answers as Record<string, number | string | boolean>);
    }
  };

  useEffect(() => {
    if (!isStillStreaming && currentIndex >= questions.length && questions.length > 0) {
      const correctCount = Object.entries(answers)
        .filter(([id, ans]) => {
          const q = questions.find(q => q.id === id);
          return q && ans === q.correctIndex;
        }).length;
      onComplete(correctCount, questions.length, answers as Record<string, number | string | boolean>);
    }
  }, [isStillStreaming, questions.length]);

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

  if (!currentQuestion) {
    return <QuestionStreamingSkeleton title={section.title} current={currentIndex + 1} total={Math.max(questions.length, currentIndex + 1)} />;
  }

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        progress={{ current: currentIndex + 1, total: questions.length }}
      />

      <div className="bg-surface rounded-lg p-6 shadow-sm border">
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
                    : 'bg-surface-secondary border-border'
                  : 'hover:bg-brand-50 hover:border-brand-300 border-border'
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

        {/* Next button */}
        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 flex justify-end"
          >
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center gap-2"
            >
              {currentIndex < questions.length - 1 ? 'Next' : 'Finish'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
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
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function FillBlankSectionExercise({ section, onComplete, savedProgress, onProgressChange }: FillBlankSectionProps) {
  const isStillStreaming = useIsStreaming();
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, string> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'string' && !k.endsWith('_result')) result[k] = v;
    });
    return result;
  });
  const [results, setResults] = useState<Record<string, boolean>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, boolean> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (k.endsWith('_result') && typeof v === 'boolean') {
        result[k.replace('_result', '')] = v;
      }
    });
    return result;
  });
  const [inputValue, setInputValue] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const items = section.items || [];
  const currentItem = items[currentIndex];
  const hasAnswered = currentItem?.id in results;

  const checkAnswer = () => {
    if (!inputValue.trim() || !currentItem?.blank) return;

    const correct = currentItem.blank.correctAnswers?.some(
      ans => ans.toLowerCase().trim() === inputValue.toLowerCase().trim()
    ) ?? false;

    const newAnswers = { ...answers, [currentItem.id]: inputValue };
    const newResults = { ...results, [currentItem.id]: correct };
    setAnswers(newAnswers);
    setResults(newResults);
    setIsCorrect(correct);
    setShowFeedback(true);

    // Report progress
    if (onProgressChange) {
      const progressAnswers: Record<string, number | string | boolean> = { ...newAnswers };
      Object.entries(newResults).forEach(([k, v]) => {
        progressAnswers[`${k}_result`] = v;
      });
      onProgressChange(progressAnswers, currentIndex);
    }

    setTimeout(() => {
      setShowFeedback(false);
    }, 2000);
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setInputValue('');
      setShowHint(false);
    } else if (isStillStreaming) {
      setCurrentIndex(prev => prev + 1);
      setInputValue('');
      setShowHint(false);
    } else {
      const correctCount = Object.values(results).filter(Boolean).length;
      const finalAnswers: Record<string, number | string | boolean> = { ...answers };
      Object.entries(results).forEach(([k, v]) => {
        finalAnswers[`${k}_result`] = v;
      });
      onComplete(correctCount, items.length, finalAnswers);
    }
  };

  useEffect(() => {
    if (!isStillStreaming && currentIndex >= items.length && items.length > 0) {
      const correctCount = Object.values(results).filter(Boolean).length;
      const finalAnswers: Record<string, number | string | boolean> = { ...answers };
      Object.entries(results).forEach(([k, v]) => {
        finalAnswers[`${k}_result`] = v;
      });
      onComplete(correctCount, items.length, finalAnswers);
    }
  }, [isStillStreaming, items.length]);

  const handlePrevQuestion = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setInputValue('');
      setShowHint(false);
    }
  };

  if (!currentItem || !currentItem.blank) return <QuestionStreamingSkeleton title={section.title} current={currentIndex + 1} total={Math.max(items?.length || 0, currentIndex + 1)} />;

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

      <div className="bg-surface rounded-lg p-6 shadow-sm border">
        <div className="text-lg mb-2">
          {sentenceParts[0]}
          <span className="inline-block mx-1 px-2 py-1 bg-brand-100 rounded border-b-2 border-brand-500 min-w-[60px] sm:min-w-[80px]">
            {hasAnswered ? answers[currentItem.id] : '______'}
          </span>
          {sentenceParts[1]}
        </div>

        {currentItem.romanization && (
          <p className="text-sm text-content-tertiary italic mb-2">{currentItem.romanization}</p>
        )}

        <p className="text-sm text-content-secondary mb-4">{currentItem.translation}</p>

        {!hasAnswered && (
          <>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && checkAnswer()}
                placeholder="Type your answer..."
                className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-base"
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

            {currentItem?.blank?.hint && (
              <button
                onClick={() => setShowHint(true)}
                className="flex items-center gap-1 text-sm text-content-tertiary hover:text-content-secondary"
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
                : `Correct answer: ${currentItem?.blank?.correctAnswers?.[0] || 'N/A'}`}
            </p>
          </motion.div>
        )}

        {/* Question navigation */}
        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 flex justify-between items-center gap-2"
          >
            <button
              onClick={handlePrevQuestion}
              disabled={currentIndex === 0}
              className={clsx(
                'px-3 sm:px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 text-sm',
                currentIndex === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-content-secondary hover:bg-surface-tertiary active:bg-surface-tertiary'
              )}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden xs:inline">Previous</span>
              <span className="xs:hidden">Prev</span>
            </button>
            <button
              onClick={handleNext}
              className="px-3 sm:px-4 py-2.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 active:bg-brand-700 transition-colors flex items-center gap-1.5 sm:gap-2 text-sm"
            >
              {currentIndex < items.length - 1 ? 'Next' : 'Finish'}
              <ArrowRight className="w-4 h-4" />
            </button>
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
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function TranslationSectionExercise({ section, onComplete, savedProgress, onProgressChange }: TranslationSectionProps) {
  const isStillStreaming = useIsStreaming();
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, string> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'string' && !k.endsWith('_result')) result[k] = v;
    });
    return result;
  });
  const [results, setResults] = useState<Record<string, boolean>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, boolean> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (k.endsWith('_result') && typeof v === 'boolean') {
        result[k.replace('_result', '')] = v;
      }
    });
    return result;
  });
  const [inputValue, setInputValue] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const items = section.items || [];
  const currentItem = items[currentIndex];
  const hasAnswered = currentItem?.id in results;

  const checkAnswer = () => {
    if (!inputValue.trim()) return;

    const correct = currentItem.acceptedAnswers.some(
      ans => ans.toLowerCase().trim() === inputValue.toLowerCase().trim()
    );

    const newAnswers = { ...answers, [currentItem.id]: inputValue };
    const newResults = { ...results, [currentItem.id]: correct };
    setAnswers(newAnswers);
    setResults(newResults);
    setIsCorrect(correct);
    setShowFeedback(true);

    // Report progress
    if (onProgressChange) {
      const progressAnswers: Record<string, number | string | boolean> = { ...newAnswers };
      Object.entries(newResults).forEach(([k, v]) => {
        progressAnswers[`${k}_result`] = v;
      });
      onProgressChange(progressAnswers, currentIndex);
    }

    setTimeout(() => {
      setShowFeedback(false);
    }, 2000);
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setInputValue('');
      setShowHint(false);
    } else if (isStillStreaming) {
      setCurrentIndex(prev => prev + 1);
      setInputValue('');
      setShowHint(false);
    } else {
      const correctCount = Object.values(results).filter(Boolean).length;
      const finalAnswers: Record<string, number | string | boolean> = { ...answers };
      Object.entries(results).forEach(([k, v]) => {
        finalAnswers[`${k}_result`] = v;
      });
      onComplete(correctCount, items.length, finalAnswers);
    }
  };

  useEffect(() => {
    if (!isStillStreaming && currentIndex >= items.length && items.length > 0) {
      const correctCount = Object.values(results).filter(Boolean).length;
      const finalAnswers: Record<string, number | string | boolean> = { ...answers };
      Object.entries(results).forEach(([k, v]) => {
        finalAnswers[`${k}_result`] = v;
      });
      onComplete(correctCount, items.length, finalAnswers);
    }
  }, [isStillStreaming, items.length]);

  if (!currentItem) return <QuestionStreamingSkeleton title={section.title} current={currentIndex + 1} total={Math.max(items?.length || 0, currentIndex + 1)} />;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions={section.instructions}
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <NewKnowledgeBox items={section.newKnowledge} />

      <div className="bg-surface rounded-lg p-6 shadow-sm border">
        <div className="mb-4">
          <span className={clsx(
            'inline-block px-2 py-1 rounded text-xs font-medium mb-2',
            currentItem.direction === 'toTarget' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
          )}>
            {currentItem.direction === 'toTarget' ? 'Translate to target language' : 'Translate to English'}
          </span>
          <p className="text-lg font-medium">{currentItem.prompt}</p>
          {currentItem.romanization && (
            <p className="text-sm text-content-tertiary italic">{currentItem.romanization}</p>
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
                className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-base"
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
                className="flex items-center gap-1 text-sm text-content-tertiary hover:text-content-secondary"
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

        {/* Next button */}
        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 flex justify-end"
          >
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center gap-2"
            >
              {currentIndex < items.length - 1 ? 'Next' : 'Finish'}
              <ArrowRight className="w-4 h-4" />
            </button>
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
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function ReorderSectionExercise({ section, onComplete, savedProgress, onProgressChange }: ReorderSectionProps) {
  const isStillStreaming = useIsStreaming();
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [availableWords, setAvailableWords] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, boolean>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, boolean> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'boolean') result[k] = v;
    });
    return result;
  });
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const items = section.items || [];
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
    const newResults = { ...results, [currentItem.id]: correct };
    setResults(newResults);
    setIsCorrect(correct);
    setShowFeedback(true);

    // Report progress
    if (onProgressChange) {
      onProgressChange(newResults as Record<string, number | string | boolean>, currentIndex);
    }

    setTimeout(() => {
      setShowFeedback(false);
    }, 2000);
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else if (isStillStreaming) {
      setCurrentIndex(prev => prev + 1);
    } else {
      const correctCount = Object.values(results).filter(Boolean).length;
      onComplete(correctCount, items.length, results as Record<string, number | string | boolean>);
    }
  };

  useEffect(() => {
    if (!isStillStreaming && currentIndex >= items.length && items.length > 0) {
      const correctCount = Object.values(results).filter(Boolean).length;
      onComplete(correctCount, items.length, results as Record<string, number | string | boolean>);
    }
  }, [isStillStreaming, items.length]);

  const resetOrder = () => {
    setAvailableWords([...currentItem.scrambled]);
    setSelectedWords([]);
  };

  if (!currentItem) return <QuestionStreamingSkeleton title={section.title} current={currentIndex + 1} total={Math.max(items?.length || 0, currentIndex + 1)} />;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions={section.instructions}
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <div className="bg-surface rounded-lg p-6 shadow-sm border">
        <p className="text-sm text-content-secondary mb-4">
          <span className="font-medium">Meaning:</span> {currentItem.translation}
        </p>

        {/* Selected words area */}
        <div className="min-h-[60px] p-3 bg-surface-secondary rounded-lg border-2 border-dashed border-border mb-4">
          {selectedWords.length === 0 ? (
            <p className="text-content-tertiary text-center">Click words below to build the sentence</p>
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
                className="px-3 py-2 bg-surface-tertiary rounded-lg font-medium hover:bg-surface-tertiary transition-colors"
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
              className="flex items-center gap-1 px-3 py-2 text-content-secondary hover:text-content"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            {currentItem.hint && (
              <button
                onClick={() => setShowHint(true)}
                className="flex items-center gap-1 px-3 py-2 text-content-secondary hover:text-content"
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

        {/* Next button */}
        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 flex justify-end"
          >
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center gap-2"
            >
              {currentIndex < items.length - 1 ? 'Next' : 'Finish'}
              <ArrowRight className="w-4 h-4" />
            </button>
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
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function TypingSectionExercise({ section, targetLanguage, onComplete, savedProgress, onProgressChange }: TypingSectionProps) {
  const isStillStreaming = useIsStreaming();
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0);
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<Record<string, boolean>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, boolean> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'boolean') result[k] = v;
    });
    return result;
  });
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const { speak, isSupported } = useBrowserTTS(targetLanguage || 'chinese');

  const items = section.items || [];
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

    const newResults = { ...results, [currentItem.id]: correct };
    setResults(newResults);
    setIsCorrect(correct);
    setShowFeedback(true);

    // Report progress
    if (onProgressChange) {
      onProgressChange(newResults as Record<string, number | string | boolean>, currentIndex);
    }

    setTimeout(() => {
      setShowFeedback(false);
    }, 2000);
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setInputValue('');
    } else if (isStillStreaming) {
      setCurrentIndex(prev => prev + 1);
      setInputValue('');
    } else {
      const correctCount = Object.values(results).filter(Boolean).length;
      onComplete(correctCount, items.length, results as Record<string, number | string | boolean>);
    }
  };

  useEffect(() => {
    if (!isStillStreaming && currentIndex >= items.length && items.length > 0) {
      const correctCount = Object.values(results).filter(Boolean).length;
      onComplete(correctCount, items.length, results as Record<string, number | string | boolean>);
    }
  }, [isStillStreaming, items.length]);

  if (!currentItem) return <QuestionStreamingSkeleton title={section.title} current={currentIndex + 1} total={Math.max(items?.length || 0, currentIndex + 1)} />;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions={section.instructions}
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <div className="bg-surface rounded-lg p-6 shadow-sm border">
        <p className="text-sm text-content-secondary mb-4">{currentItem.prompt}</p>

        {currentItem.displayText && (
          <div className="text-center mb-4">
            <p className="text-3xl font-medium mb-1">{currentItem.displayText}</p>
            {currentItem.romanization && (
              <p className="text-sm text-content-tertiary italic">{currentItem.romanization}</p>
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

        {/* Next button */}
        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 flex justify-end"
          >
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center gap-2"
            >
              {currentIndex < items.length - 1 ? 'Next' : 'Finish'}
              <ArrowRight className="w-4 h-4" />
            </button>
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
  onComplete: (score: number, total: number, answers?: Record<string, number | string | boolean>) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (answers: Record<string, number | string | boolean>, currentIndex: number) => void;
}

export function OpenEndedSectionExercise({ section, onComplete, savedProgress, onProgressChange }: OpenEndedSectionProps) {
  const isStillStreaming = useIsStreaming();
  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0);
  const [responses, setResponses] = useState<Record<string, string>>(() => {
    if (!savedProgress?.answers) return {};
    const result: Record<string, string> = {};
    Object.entries(savedProgress.answers).forEach(([k, v]) => {
      if (typeof v === 'string') result[k] = v;
    });
    return result;
  });
  const [results, setResults] = useState<Record<string, OpenEndedFeedbackResult>>({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const questions = section.questions || [];
  const currentQuestion = questions[currentIndex];
  const currentResponse = responses[currentQuestion.id] || '';
  const currentResult = results[currentQuestion.id];

  const handleResponseChange = (value: string) => {
    const newResponses = { ...responses, [currentQuestion.id]: value };
    setResponses(newResponses);
    // Report progress as user types
    if (onProgressChange) {
      onProgressChange(newResponses as Record<string, number | string | boolean>, currentIndex);
    }
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
    } else if (isStillStreaming) {
      setCurrentIndex(currentIndex + 1);
      setShowFeedback(false);
    } else {
      // Calculate final score
      const passed = Object.values(results).filter(r => r.passed).length;
      onComplete(passed, questions.length, responses as Record<string, number | string | boolean>);
    }
  };

  useEffect(() => {
    if (!isStillStreaming && currentIndex >= questions.length && questions.length > 0) {
      const passed = Object.values(results).filter(r => r.passed).length;
      onComplete(passed, questions.length, responses as Record<string, number | string | boolean>);
    }
  }, [isStillStreaming, questions.length]);

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
            <p className="text-content font-medium">{currentQuestion.question}</p>
          </div>

          {/* Prompt */}
          <div className="bg-surface-secondary p-3 rounded-lg">
            <p className="text-content-secondary text-sm italic">{currentQuestion.prompt}</p>
          </div>

          {/* Response textarea */}
          <div className="space-y-2">
            <textarea
              value={currentResponse}
              onChange={(e) => handleResponseChange(e.target.value)}
              placeholder="Type your response here..."
              disabled={!!currentResult}
              className={clsx(
                'w-full p-4 rounded-xl border-2 resize-none transition-all min-h-[150px] text-base bg-surface text-content',
                currentResult
                  ? currentResult.passed
                    ? 'border-green-300 bg-green-50'
                    : 'border-amber-300 bg-amber-50'
                  : 'border-border focus:border-purple-400 focus:ring-2 focus:ring-purple-100'
              )}
              rows={6}
            />
            <div className="flex justify-between text-sm text-content-tertiary">
              <span>{wordCount} words</span>
              <span className={wordCount >= 20 ? 'text-green-600' : 'text-content-tertiary'}>
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
                  className="bg-surface rounded-xl border border-green-200 p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <span className="font-medium text-green-800">What you did well</span>
                  </div>
                  <ul className="space-y-2">
                    {currentResult.aiStrengths.map((strength, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-content-secondary">
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
                  className="bg-surface rounded-xl border border-blue-200 p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="font-medium text-blue-800">To strengthen your response</span>
                  </div>
                  <ul className="space-y-2">
                    {currentResult.aiImprovements.map((improvement, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-content-secondary">
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
                  className="bg-surface rounded-xl border border-border p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-medium text-content">Evaluation Criteria</span>
                  </div>
                  <div className="space-y-2">
                    {currentResult.dimensionResults.map((dim) => (
                      <div key={dim.dimensionId} className="flex items-center gap-3">
                        <div className={clsx(
                          'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                          dim.found ? 'bg-green-100' : 'bg-surface-tertiary'
                        )}>
                          {dim.found ? (
                            <Check className="w-3 h-3 text-green-600" />
                          ) : (
                            <X className="w-3 h-3 text-content-tertiary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={clsx(
                              'text-sm',
                              dim.found ? 'text-content' : 'text-content-tertiary'
                            )}>
                              {dim.label}
                            </span>
                            {dim.aiScore !== undefined && (
                              <span className={clsx(
                                'text-xs px-1.5 py-0.5 rounded',
                                dim.aiScore >= 0.7 ? 'bg-green-100 text-green-700' :
                                dim.aiScore >= 0.4 ? 'bg-amber-100 text-amber-700' :
                                'bg-surface-tertiary text-content-tertiary'
                              )}>
                                {Math.round(dim.aiScore * 100)}%
                              </span>
                            )}
                          </div>
                          {dim.aiFeedback && (
                            <p className="text-xs text-content-tertiary mt-0.5">{dim.aiFeedback}</p>
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
                  className="bg-surface rounded-xl border border-border overflow-hidden"
                >
                  <summary className="px-4 py-3 cursor-pointer hover:bg-surface-secondary transition-colors flex items-center gap-2 text-sm font-medium text-content-secondary">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    View sample answer
                  </summary>
                  <div className="px-4 pb-4 pt-2 border-t border-border-secondary">
                    <p className="text-sm text-content-secondary leading-relaxed">
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
                    : 'bg-surface-tertiary text-content-tertiary cursor-not-allowed'
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

// ============================================
// Roleplay Section Exercise
// ============================================

interface RoleplaySectionProps {
  section: any;
  targetLanguage?: TargetLanguage;
  onComplete: (score: number, total: number) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (progress: SectionSavedProgress) => void;
}

export function RoleplaySectionExercise({ section, targetLanguage, onComplete, savedProgress, onProgressChange }: RoleplaySectionProps) {
  const [currentTurn, setCurrentTurn] = useState(0);
  const [userResponse, setUserResponse] = useState('');
  const [responses, setResponses] = useState<string[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const { speak } = useBrowserTTS(targetLanguage || 'english');

  const situation = section.situation || section.title || 'Roleplay scenario';
  const yourRole = section.yourRole || 'Participant';
  const counterpartRole = section.counterpartRole || 'Partner';
  const targetPhrases = section.targetPhrases || [];
  const sampleResponse = section.sampleResponse || '';
  const turns = section.turns || section.questions || [];

  const handleSpeak = (text: string) => {
    speak(text);
  };

  const handleSubmitTurn = () => {
    if (!userResponse.trim()) return;

    const newResponses = [...responses, userResponse];
    setResponses(newResponses);
    setUserResponse('');

    if (currentTurn >= turns.length - 1 || turns.length === 0) {
      setIsCompleted(true);
      // Score based on target phrase usage
      const phrasesUsed = targetPhrases.filter((phrase: string) =>
        newResponses.some(r => r.toLowerCase().includes(phrase.toLowerCase()))
      ).length;
      const score = targetPhrases.length > 0
        ? Math.round((phrasesUsed / targetPhrases.length) * 100)
        : 100;
      onComplete(score, 100);
    } else {
      setCurrentTurn(prev => prev + 1);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Scenario context */}
      <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-100 rounded-xl p-4 mb-4">
        <h3 className="font-semibold text-content mb-2">Roleplay: {situation}</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-content-secondary">
          <span>You: <strong>{yourRole}</strong></span>
          <span>Partner: <strong>{counterpartRole}</strong></span>
        </div>
        {targetPhrases.length > 0 && (
          <div className="mt-3 text-sm">
            <span className="text-content-tertiary">Try to use: </span>
            {targetPhrases.map((phrase: string, i: number) => (
              <span key={i} className="inline-block bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs mr-1 mb-1">
                {phrase}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Conversation */}
      <div className="space-y-3 mb-4">
        {turns.slice(0, currentTurn + 1).map((turn: any, i: number) => (
          <div key={i}>
            {/* Counterpart message */}
            {turn.prompt && (
              <div className="flex items-start gap-2 mb-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-medium text-purple-600">
                  {counterpartRole[0]}
                </div>
                <div className="bg-surface-secondary rounded-xl rounded-tl-none px-4 py-2 max-w-[80%]">
                  <p className="text-content text-sm">{turn.prompt}</p>
                  <button
                    onClick={() => handleSpeak(turn.audioText || turn.prompt)}
                    className="mt-1 text-purple-500 hover:text-purple-600"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
            {/* User response (if already submitted) */}
            {responses[i] && (
              <div className="flex items-start gap-2 justify-end">
                <div className="bg-brand-50 rounded-xl rounded-tr-none px-4 py-2 max-w-[80%]">
                  <p className="text-content text-sm">{responses[i]}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input area */}
      {!isCompleted ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={userResponse}
            onChange={(e) => setUserResponse(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitTurn()}
            placeholder="Type your response..."
            className="flex-1 min-w-0 px-3 sm:px-4 py-3 rounded-xl border border-border bg-surface text-content focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            autoFocus
          />
          <button
            onClick={handleSubmitTurn}
            disabled={!userResponse.trim()}
            className="flex-shrink-0 px-3 sm:px-4 py-3 rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-all"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
          <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-content font-medium">Roleplay complete!</p>
          {sampleResponse && (
            <div className="mt-3 text-sm text-content-secondary">
              <p className="font-medium text-content-tertiary mb-1">Example strong response:</p>
              <p className="italic">{sampleResponse}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Rewrite Section Exercise
// ============================================

interface RewriteSectionProps {
  section: any;
  onComplete: (score: number, total: number) => void;
  savedProgress?: SectionSavedProgress;
  onProgressChange?: (progress: SectionSavedProgress) => void;
}

export function RewriteSectionExercise({ section, onComplete, savedProgress, onProgressChange }: RewriteSectionProps) {
  const [rewrite, setRewrite] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showSample, setShowSample] = useState(false);

  const context = section.context || section.title || 'Improve this text';
  const weakVersion = section.weakVersion || section.text || '';
  const targetImprovements = section.targetImprovements || [];
  const sampleStrongVersion = section.sampleStrongVersion || '';
  const evaluationCriteria = section.evaluationCriteria || [];

  const handleSubmit = () => {
    if (!rewrite.trim()) return;
    setIsSubmitted(true);

    // Score based on improvements detected
    const improvementsFound = targetImprovements.filter((improvement: string) => {
      const keywords = improvement.toLowerCase().split(/\s+/);
      return keywords.some((kw: string) => rewrite.toLowerCase().includes(kw));
    }).length;

    const score = targetImprovements.length > 0
      ? Math.round((improvementsFound / targetImprovements.length) * 100)
      : 80;

    onComplete(score, 100);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Context */}
      <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-100 rounded-xl p-4 mb-4">
        <h3 className="font-semibold text-content mb-2">Rewrite Challenge</h3>
        <p className="text-sm text-content-secondary">{context}</p>
      </div>

      {/* Weak version */}
      <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-4">
        <p className="text-xs font-medium text-red-500 uppercase tracking-wide mb-2">Original (needs improvement)</p>
        <p className="text-content italic">{weakVersion}</p>
      </div>

      {/* Target improvements as hints */}
      {targetImprovements.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium text-content-secondary mb-2">Focus on improving:</p>
          <div className="flex flex-wrap gap-1.5">
            {targetImprovements.map((improvement: string, i: number) => (
              <span key={i} className="inline-block bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs">
                {improvement}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rewrite input */}
      {!isSubmitted ? (
        <>
          <textarea
            value={rewrite}
            onChange={(e) => setRewrite(e.target.value)}
            placeholder="Write your improved version here..."
            className="w-full min-h-[120px] p-3 sm:p-4 rounded-xl border border-border bg-surface text-content resize-y focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none mb-4"
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={!rewrite.trim()}
            className="w-full px-6 py-3 rounded-xl font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-all"
          >
            Submit Rewrite
          </button>
        </>
      ) : (
        <div className="space-y-4">
          {/* User's rewrite */}
          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <p className="text-xs font-medium text-green-500 uppercase tracking-wide mb-2">Your version</p>
            <p className="text-content">{rewrite}</p>
          </div>

          {/* Sample strong version */}
          {sampleStrongVersion && (
            <div>
              <button
                onClick={() => setShowSample(!showSample)}
                className="text-sm font-medium text-brand-600 hover:text-brand-700 mb-2"
              >
                {showSample ? 'Hide' : 'Show'} example strong version
              </button>
              {showSample && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-xs font-medium text-blue-500 uppercase tracking-wide mb-2">Example strong version</p>
                  <p className="text-content">{sampleStrongVersion}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
