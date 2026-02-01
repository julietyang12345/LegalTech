import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { HelpCircle, Code2, Lightbulb, Volume2, Bookmark, Share2 } from 'lucide-react';
import { Card, Button, MultipleChoiceQuestion } from '@/components/common';
import { StepLayout } from './StepLayout';
import { TaskResultsScreen, TaskProgress, TaskNavigation } from './TaskShared';
import { useSessionStore } from '@/stores/sessionStore';
import { useBrowserTTS } from '@/hooks/useBrowserTTS';
import { clsx } from 'clsx';
import type { CurriculumDay, Session, QuizTask, FillBlankTask, FillBlankItem, TargetLanguage } from '@/types';

// ============================================
// QuizTaskStep - Multiple choice quiz
// ============================================

interface QuizTaskStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
  onBookmarkQuestion?: (questionData: { question: string; options?: string[]; correctAnswer?: string }) => void;
  onShareQuestion?: (questionData: { question: string; options?: string[]; correctAnswer?: string }) => void;
}

export function QuizTaskStep({ day, session, onComplete, onBookmarkQuestion, onShareQuestion }: QuizTaskStepProps) {
  const quiz = day.task1 as QuizTask;
  // Use consistent index-based IDs to ensure saved progress matches
  const questions = (quiz?.questions || []).map((q, index) => ({
    ...q,
    id: `q${index + 1}`,
  }));

  const { saveTaskProgress, getTaskProgress, clearTaskProgress } = useSessionStore();

  // Get target language for audio questions
  const targetLanguage = session.curriculum?.metadata?.targetLanguage as TargetLanguage | undefined;
  const { speak, isSpeaking } = useBrowserTTS(targetLanguage || 'other');

  // Load saved progress on mount
  const savedProgress = getTaskProgress(day.day, 'task1');

  const [currentIndex, setCurrentIndex] = useState(savedProgress?.currentIndex ?? 0);
  const [answers, setAnswers] = useState<Record<string, number | null>>(savedProgress?.answers ?? {});
  const [showResults, setShowResults] = useState(savedProgress?.showResults ?? false);
  const [audioPlayed, setAudioPlayed] = useState<Record<string, boolean>>({});

  // Save progress whenever it changes
  useEffect(() => {
    saveTaskProgress(day.day, 'task1', { answers, currentIndex, showResults });
  }, [answers, currentIndex, showResults, day.day, saveTaskProgress]);

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const allAnswered = Object.keys(answers).length >= totalQuestions;

  // Calculate score
  const correctCount = questions.reduce((count, q) => {
    return answers[q.id] === q.correctIndex ? count + 1 : count;
  }, 0);
  const score = totalQuestions > 0 ? correctCount / totalQuestions : 0;
  const passed = score >= (quiz?.passingScore || 0.7);

  const handleAnswer = (questionId: string, selectedIndex: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: selectedIndex }));
  };

  // Play audio for listening questions
  const playQuestionAudio = (questionId: string, audioText?: string, audioUrl?: string) => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play();
    } else if (audioText) {
      speak(audioText);
    }
    setAudioPlayed(prev => ({ ...prev, [questionId]: true }));
  };

  // Check if current question is a listening question
  const currentHasAudio = currentQuestion?.audioText || currentQuestion?.audioUrl;

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(prev => prev + 1);
    } else if (allAnswered) {
      setShowResults(true);
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setCurrentIndex(0);
    setShowResults(false);
    clearTaskProgress(day.day, 'task1');
  };

  if (!quiz || questions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No quiz questions available.</p>
      </div>
    );
  }

  // Results screen
  if (showResults) {
    return (
      <TaskResultsScreen
        score={score}
        passed={passed}
        passingScore={quiz.passingScore || 0.7}
        correctCount={correctCount}
        totalCount={totalQuestions}
        itemLabel="questions"
        passedMessage="You've demonstrated good understanding of the concepts!"
        onRetry={handleRetry}
        onComplete={onComplete}
      >
        {/* Question summary */}
        <div className="text-left space-y-2 mb-6">
          {questions.map((q, i) => {
            const isCorrect = answers[q.id] === q.correctIndex;
            return (
              <div key={q.id} className={clsx(
                'flex items-center gap-2 p-2 rounded',
                isCorrect ? 'bg-green-50' : 'bg-red-50'
              )}>
                <span className={isCorrect ? 'text-green-500' : 'text-red-500'}>
                  {isCorrect ? '✓' : '✗'}
                </span>
                <span className="text-sm text-gray-700 truncate">
                  Q{i + 1}: {q.question.substring(0, 50)}...
                </span>
              </div>
            );
          })}
        </div>
      </TaskResultsScreen>
    );
  }

  // Progress items with status
  const progressItems = questions.map(q => {
    let status: 'pending' | 'correct' | 'incorrect' = 'pending';
    if (answers[q.id] !== undefined) {
      status = answers[q.id] === q.correctIndex ? 'correct' : 'incorrect';
    }
    return { id: q.id, status };
  });

  return (
    <StepLayout
      icon={HelpCircle}
      iconGradient="from-blue-400 to-blue-500"
      title={quiz.title || "Knowledge Check"}
      subtitle={quiz.description || "Test your understanding"}
    >
      <TaskProgress
        currentIndex={currentIndex}
        totalItems={totalQuestions}
        items={progressItems}
        onNavigate={setCurrentIndex}
        color="blue"
        label="Question"
      />

      {/* Audio player for listening questions */}
      {currentHasAudio && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <Card className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Volume2 className={clsx(
                    'w-5 h-5 text-purple-600',
                    isSpeaking && 'animate-pulse'
                  )} />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Listening Question</p>
                  <p className="text-sm text-gray-500">
                    {audioPlayed[currentQuestion.id] ? 'Tap to hear again' : 'Tap to listen'}
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={() => playQuestionAudio(
                  currentQuestion.id,
                  currentQuestion.audioText,
                  currentQuestion.audioUrl
                )}
                disabled={isSpeaking}
                className="flex items-center gap-2"
              >
                <Volume2 className="w-4 h-4" />
                {isSpeaking ? 'Playing...' : 'Play'}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Bookmark button for current question */}
      {(onShareQuestion || onBookmarkQuestion) && (
        <div className="flex justify-end gap-2 mb-2">
          {onShareQuestion && (
            <button
              onClick={() => onShareQuestion({
                question: currentQuestion.question,
                options: currentQuestion.options,
                correctAnswer: currentQuestion.options?.[currentQuestion.correctIndex ?? 0],
              })}
              className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 text-sm"
              title="Share to community"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}
          {onBookmarkQuestion && (
            <button
              onClick={() => onBookmarkQuestion({
                question: currentQuestion.question,
                options: currentQuestion.options,
                correctAnswer: currentQuestion.options?.[currentQuestion.correctIndex ?? 0],
              })}
              className="p-2 text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded-lg transition-colors flex items-center gap-1.5 text-sm"
              title="Bookmark this question"
            >
              <Bookmark className="w-4 h-4" />
              <span className="hidden sm:inline">Bookmark</span>
            </button>
          )}
        </div>
      )}

      <MultipleChoiceQuestion
        question={currentQuestion.question}
        options={currentQuestion.options || []}
        correctIndex={currentQuestion.correctIndex ?? 0}
        explanation={currentQuestion.explanation}
        selectedIndex={answers[currentQuestion.id] ?? null}
        onSelect={(index) => handleAnswer(currentQuestion.id, index)}
        showResult={answers[currentQuestion.id] !== undefined}
        questionNumber={currentIndex + 1}
      />

      <TaskNavigation
        onPrev={() => setCurrentIndex(prev => prev - 1)}
        onNext={handleNext}
        canGoPrev={currentIndex > 0}
        canGoNext={answers[currentQuestion.id] !== undefined}
        isLastItem={currentIndex === totalQuestions - 1}
        allCompleted={allAnswered}
      />

      {/* Clear current answer */}
      {answers[currentQuestion.id] !== undefined && (
        <div className="flex justify-center">
          <button
            onClick={() => setAnswers(prev => {
              const updated = { ...prev };
              delete updated[currentQuestion.id];
              return updated;
            })}
            className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}
    </StepLayout>
  );
}

// ============================================
// FillBlankTaskStep - Fill in the blanks
// ============================================

interface FillBlankTaskStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

const BLANK_MARKER = '___BLANK___';

export function FillBlankTaskStep({ day, onComplete }: FillBlankTaskStepProps) {
  const task = day.task1 as FillBlankTask;
  const items = task?.items || [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInputs, setUserInputs] = useState<Record<string, Record<string, string>>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [showResults, setShowResults] = useState(false);
  const [showHint, setShowHint] = useState<Record<string, boolean>>({});

  const currentItem = items[currentIndex];
  const totalItems = items.length;

  // Check if answer is correct (case-insensitive, trimmed)
  const isCorrect = (itemId: string, blankId: string, value: string): boolean => {
    const item = items.find(i => i.id === itemId);
    const blank = item?.blanks.find(b => b.id === blankId);
    if (!blank) return false;
    return blank.correctAnswers.some(ans => ans.toLowerCase() === value.trim().toLowerCase());
  };

  // Calculate overall score
  const calculateScore = () => {
    let correct = 0, total = 0;
    items.forEach(item => {
      item.blanks.forEach(blank => {
        total++;
        if (isCorrect(item.id, blank.id, userInputs[item.id]?.[blank.id] || '')) correct++;
      });
    });
    return total > 0 ? correct / total : 0;
  };

  const allItemsSubmitted = items.every(item => submitted[item.id]);
  const score = calculateScore();
  const passed = score >= (task?.passingScore || 0.7);
  const totalBlanks = items.reduce((sum, i) => sum + i.blanks.length, 0);
  const correctCount = Math.round(score * totalBlanks);

  const handleInputChange = (itemId: string, blankId: string, value: string) => {
    setUserInputs(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), [blankId]: value },
    }));
  };

  const handleSubmitItem = () => setSubmitted(prev => ({ ...prev, [currentItem.id]: true }));

  const handleNext = () => {
    if (currentIndex < totalItems - 1) setCurrentIndex(prev => prev + 1);
    else if (allItemsSubmitted) setShowResults(true);
  };

  const handleRetry = () => {
    setUserInputs({});
    setSubmitted({});
    setShowHint({});
    setCurrentIndex(0);
    setShowResults(false);
  };

  // Render code template with input fields
  const renderCodeWithBlanks = (item: FillBlankItem) => {
    const parts = item.codeTemplate.split(BLANK_MARKER);
    const isSubmitted = submitted[item.id];

    return (
      <pre className="bg-gray-900 p-4 rounded-lg text-sm overflow-x-auto">
        <code className="text-gray-100">
          {parts.map((part, index) => (
            <span key={index}>
              {part}
              {index < item.blanks.length && (
                <span className="inline-block">
                  <input
                    type="text"
                    value={userInputs[item.id]?.[item.blanks[index].id] || ''}
                    onChange={(e) => handleInputChange(item.id, item.blanks[index].id, e.target.value)}
                    disabled={isSubmitted}
                    placeholder="..."
                    className={clsx(
                      'w-24 px-2 py-0.5 mx-1 rounded text-center font-mono text-sm',
                      'focus:outline-none focus:ring-2 focus:ring-blue-400',
                      !isSubmitted && 'bg-gray-700 text-white border border-gray-600',
                      isSubmitted && isCorrect(item.id, item.blanks[index].id, userInputs[item.id]?.[item.blanks[index].id] || '') && 'bg-green-600 text-white border-green-500',
                      isSubmitted && !isCorrect(item.id, item.blanks[index].id, userInputs[item.id]?.[item.blanks[index].id] || '') && 'bg-red-600 text-white border-red-500'
                    )}
                  />
                  {!isSubmitted && item.blanks[index].hint && (
                    <button
                      onClick={() => setShowHint(prev => ({ ...prev, [item.blanks[index].id]: !prev[item.blanks[index].id] }))}
                      className="ml-1 text-gray-400 hover:text-yellow-400"
                    >
                      <Lightbulb className="w-4 h-4 inline" />
                    </button>
                  )}
                  {showHint[item.blanks[index].id] && item.blanks[index].hint && (
                    <span className="ml-2 text-yellow-400 text-xs italic">{item.blanks[index].hint}</span>
                  )}
                  {isSubmitted && !isCorrect(item.id, item.blanks[index].id, userInputs[item.id]?.[item.blanks[index].id] || '') && (
                    <span className="ml-2 text-green-400 text-xs">→ {item.blanks[index].correctAnswers[0]}</span>
                  )}
                </span>
              )}
            </span>
          ))}
        </code>
      </pre>
    );
  };

  if (!task || items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No fill-in-the-blank items available.</p>
      </div>
    );
  }

  // Results screen
  if (showResults) {
    return (
      <TaskResultsScreen
        score={score}
        passed={passed}
        passingScore={task.passingScore || 0.7}
        correctCount={correctCount}
        totalCount={totalBlanks}
        itemLabel="blanks"
        passedMessage="You're getting the hang of the syntax!"
        onRetry={handleRetry}
        onComplete={onComplete}
      />
    );
  }

  const progressItems = items.map(item => ({
    id: item.id,
    status: (submitted[item.id] ? 'submitted' : 'pending') as 'submitted' | 'pending',
  }));

  const canSubmit = currentItem.blanks.every(b => userInputs[currentItem.id]?.[b.id]?.trim());

  return (
    <StepLayout
      icon={Code2}
      iconGradient="from-purple-400 to-purple-500"
      title={task.title || "Complete the Code"}
      subtitle={task.description || "Fill in the blanks"}
    >
      <TaskProgress
        currentIndex={currentIndex}
        totalItems={totalItems}
        items={progressItems}
        onNavigate={setCurrentIndex}
        color="purple"
        label="Item"
      />

      <Card className="overflow-hidden mb-4">
        {renderCodeWithBlanks(currentItem)}
      </Card>

      {submitted[currentItem.id] && currentItem.explanation && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-blue-50 rounded-lg text-sm text-blue-800 mb-4"
        >
          <p className="font-medium mb-1">Explanation</p>
          <p>{currentItem.explanation}</p>
        </motion.div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <Button variant="ghost" onClick={() => setCurrentIndex(prev => prev - 1)} disabled={currentIndex === 0}>
          Previous
        </Button>

        <div className="flex gap-2">
          {!submitted[currentItem.id] ? (
            <Button variant="secondary" onClick={handleSubmitItem} disabled={!canSubmit}>
              Check Answer
            </Button>
          ) : (
            <Button onClick={handleNext}>
              {currentIndex === totalItems - 1
                ? (allItemsSubmitted ? 'See Results' : 'Complete All Items')
                : 'Next →'}
            </Button>
          )}
        </div>
      </div>
    </StepLayout>
  );
}
