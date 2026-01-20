import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Lightbulb, ChevronRight, Eye, EyeOff, Play } from 'lucide-react';
import { clsx } from 'clsx';
import type {
  CodeCompletionSection,
  DebuggingSection,
  OutputPredictionSection,
  CodeCompletionItem,
  DebuggingItem,
  OutputPredictionQuestion,
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

// Simple code block component with basic syntax highlighting appearance
function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
      <code>{code}</code>
    </pre>
  );
}

// ============================================
// Code Completion Exercise
// ============================================

interface CodeCompletionExerciseProps {
  section: CodeCompletionSection;
  onComplete: (score: number, total: number) => void;
}

export function CodeCompletionExercise({ section, onComplete }: CodeCompletionExerciseProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userCode, setUserCode] = useState('');
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [currentHintIndex, setCurrentHintIndex] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  const items = section.items;
  const currentItem = items[currentIndex];
  const hasAnswered = currentItem?.id in results;

  const checkAnswer = () => {
    if (!userCode.trim()) return;

    // Simple check: normalize whitespace and compare
    const normalizeCode = (code: string) =>
      code.replace(/\s+/g, ' ').trim().toLowerCase();

    const correct = normalizeCode(userCode) === normalizeCode(currentItem.solution);

    setResults(prev => ({ ...prev, [currentItem.id]: correct }));
    setIsCorrect(correct);
    setShowFeedback(true);

    setTimeout(() => {
      setShowFeedback(false);
      if (currentIndex < items.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setUserCode('');
        setShowHint(false);
        setCurrentHintIndex(0);
        setShowSolution(false);
      } else {
        const correctCount = Object.values({ ...results, [currentItem.id]: correct }).filter(Boolean).length;
        onComplete(correctCount, items.length);
      }
    }, 2000);
  };

  const showNextHint = () => {
    if (currentHintIndex < currentItem.hints.length - 1) {
      setCurrentHintIndex(prev => prev + 1);
    }
    setShowHint(true);
  };

  if (!currentItem) return null;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions="Complete the code to solve the challenge"
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <p className="text-gray-700 mb-4">{currentItem.description}</p>

        {/* Starter code */}
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-500 mb-2">Starter Code:</p>
          <CodeBlock code={currentItem.starterCode} language={currentItem.language} />
        </div>

        {/* User input */}
        {!hasAnswered && (
          <>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-500 mb-2 block">Your Solution:</label>
              <textarea
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                placeholder="Write your code here..."
                className="w-full h-40 p-3 font-mono text-sm border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-gray-50"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={showNextHint}
                disabled={showHint && currentHintIndex >= currentItem.hints.length - 1}
                className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
              >
                <Lightbulb className="w-4 h-4" />
                {showHint ? `Hint ${currentHintIndex + 1}/${currentItem.hints.length}` : 'Show Hint'}
              </button>

              <button
                onClick={() => setShowSolution(!showSolution)}
                className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
              >
                {showSolution ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showSolution ? 'Hide Solution' : 'Reveal Solution'}
              </button>

              <button
                onClick={checkAnswer}
                disabled={!userCode.trim()}
                className="ml-auto px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Check
              </button>
            </div>

            {showHint && currentItem.hints[currentHintIndex] && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg"
              >
                <p className="text-sm text-amber-800">
                  <strong>Hint {currentHintIndex + 1}:</strong> {currentItem.hints[currentHintIndex]}
                </p>
              </motion.div>
            )}

            {showSolution && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3"
              >
                <p className="text-sm font-medium text-gray-500 mb-2">Solution:</p>
                <CodeBlock code={currentItem.solution} language={currentItem.language} />
              </motion.div>
            )}
          </>
        )}

        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={clsx(
              'p-4 rounded-lg',
              results[currentItem.id] ? 'bg-green-100' : 'bg-orange-100'
            )}
          >
            <p className={clsx(
              'font-medium mb-2',
              results[currentItem.id] ? 'text-green-800' : 'text-orange-800'
            )}>
              {results[currentItem.id] ? 'Correct!' : 'Not quite - here\'s the solution:'}
            </p>
            {!results[currentItem.id] && (
              <CodeBlock code={currentItem.solution} language={currentItem.language} />
            )}
          </motion.div>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}

// ============================================
// Debugging Exercise
// ============================================

interface DebuggingExerciseProps {
  section: DebuggingSection;
  onComplete: (score: number, total: number) => void;
}

export function DebuggingExercise({ section, onComplete }: DebuggingExerciseProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userCode, setUserCode] = useState('');
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const items = section.items;
  const currentItem = items[currentIndex];
  const hasAnswered = currentItem?.id in results;

  // Initialize user code with buggy code
  useState(() => {
    if (currentItem) {
      setUserCode(currentItem.buggyCode);
    }
  });

  const checkAnswer = () => {
    if (!userCode.trim()) return;

    const normalizeCode = (code: string) =>
      code.replace(/\s+/g, ' ').trim().toLowerCase();

    const correct = normalizeCode(userCode) === normalizeCode(currentItem.fixedCode);

    setResults(prev => ({ ...prev, [currentItem.id]: correct }));
    setIsCorrect(correct);
    setShowFeedback(true);

    setTimeout(() => {
      setShowFeedback(false);
      if (currentIndex < items.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setUserCode(items[currentIndex + 1]?.buggyCode || '');
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
        instructions="Find and fix the bug in the code"
        progress={{ current: currentIndex + 1, total: items.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 font-medium">Bug Report:</p>
          <p className="text-sm text-red-700">There's a bug in this code. Find and fix it!</p>
        </div>

        {!hasAnswered && (
          <>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-500 mb-2 block">Fix the code:</label>
              <textarea
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                className="w-full h-40 p-3 font-mono text-sm border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-gray-50"
              />
            </div>

            <div className="flex gap-2">
              {currentItem.hint && (
                <button
                  onClick={() => setShowHint(true)}
                  className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                >
                  <Lightbulb className="w-4 h-4" />
                  {showHint ? currentItem.hint : 'Show Hint'}
                </button>
              )}

              <button
                onClick={checkAnswer}
                disabled={!userCode.trim()}
                className="ml-auto px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                Check Fix
              </button>
            </div>
          </>
        )}

        {hasAnswered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={clsx(
              'p-4 rounded-lg',
              results[currentItem.id] ? 'bg-green-100' : 'bg-orange-100'
            )}
          >
            <p className={clsx(
              'font-medium mb-2',
              results[currentItem.id] ? 'text-green-800' : 'text-orange-800'
            )}>
              {results[currentItem.id] ? 'Bug squashed!' : 'Not quite - here\'s the fix:'}
            </p>
            <p className="text-sm mb-3">{currentItem.explanation}</p>
            {!results[currentItem.id] && (
              <CodeBlock code={currentItem.fixedCode} language={currentItem.language} />
            )}
          </motion.div>
        )}
      </div>

      <FeedbackToast show={showFeedback} correct={isCorrect} />
    </div>
  );
}

// ============================================
// Output Prediction Exercise
// ============================================

interface OutputPredictionExerciseProps {
  section: OutputPredictionSection;
  onComplete: (score: number, total: number) => void;
}

export function OutputPredictionExercise({ section, onComplete }: OutputPredictionExerciseProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

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
    }, 2000);
  };

  if (!currentQuestion) return null;

  return (
    <div className="space-y-4">
      <ExerciseHeader
        title={section.title}
        instructions="Predict what this code will output"
        progress={{ current: currentIndex + 1, total: questions.length }}
      />

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <p className="text-sm font-medium text-gray-500 mb-2">What will this code output?</p>
        <div className="mb-4">
          <CodeBlock code={currentQuestion.code} language={currentQuestion.language} />
        </div>

        <div className="space-y-2">
          {currentQuestion.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswer(index)}
              disabled={hasAnswered}
              className={clsx(
                'w-full p-3 text-left rounded-lg border transition-all font-mono text-sm',
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
