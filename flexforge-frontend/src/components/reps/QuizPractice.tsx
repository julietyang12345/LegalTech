import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  BookOpen,
  Zap,
  ArrowLeft,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/common';
import { RepTimer } from './RepTimer';
import { useRepsStore } from '@/stores/repsStore';
import type { RepQuizQuestion } from '@/types';

export function QuizPractice() {
  const navigate = useNavigate();
  const {
    activeRep,
    quizAnswers,
    quizCurrentIndex,
    answerQuizQuestion,
    nextQuizQuestion,
    prevQuizQuestion,
    isCompleting,
  } = useRepsStore();

  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [confidenceScore, setConfidenceScore] = useState(3);
  const completeQuizRound = useRepsStore((s) => s.completeQuizRound);

  const questions = activeRep?.quizData?.questions;
  if (!questions || questions.length === 0) return null;

  const currentQuestion = questions[quizCurrentIndex];
  const answeredCount = Object.keys(quizAnswers).length;
  const allAnswered = answeredCount === questions.length;
  const selectedIndex = quizAnswers[currentQuestion.id];
  const isAnswered = selectedIndex !== undefined;

  const handleSubmit = async () => {
    setShowConfirmSubmit(false);
    await completeQuizRound(confidenceScore);
  };

  return (
    <div className="min-h-screen bg-surface-secondary flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <button
            onClick={() => navigate('/today')}
            className="flex items-center gap-2 text-content-secondary hover:text-content transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </button>

          <RepTimer estimatedMinutes={10} />

          <div className="text-sm text-content-secondary">
            {answeredCount}/{questions.length}
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="w-full h-1 bg-border">
        <motion.div
          className="h-full bg-brand-500"
          initial={{ width: 0 }}
          animate={{ width: `${((quizCurrentIndex + 1) / questions.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Question header */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-medium text-content-tertiary">
                Question {quizCurrentIndex + 1} of {questions.length}
              </span>
              <span
                className={clsx(
                  'text-xs font-semibold px-2 py-0.5 rounded-full',
                  currentQuestion.level === 'foundational'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                    : 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400',
                )}
              >
                {currentQuestion.level === 'foundational' ? (
                  <span className="inline-flex items-center gap-1"><BookOpen className="w-3 h-3" /> Foundational</span>
                ) : (
                  <span className="inline-flex items-center gap-1"><Zap className="w-3 h-3" /> Applied</span>
                )}
              </span>
            </div>

            {/* Concept title */}
            <div className="mb-3">
              <span className="text-xs font-medium text-brand-600 dark:text-brand-400 uppercase tracking-wide">
                {currentQuestion.conceptTitle}
              </span>
            </div>

            {/* Case study (for applied questions) */}
            {currentQuestion.caseStudy && (
              <div className="mb-4 p-4 rounded-xl bg-surface-tertiary border border-border">
                <p className="text-sm text-content-secondary leading-relaxed italic">
                  {currentQuestion.caseStudy}
                </p>
              </div>
            )}

            {/* Question text */}
            <h2 className="text-lg font-semibold text-content mb-6 leading-relaxed">
              {currentQuestion.question}
            </h2>

            {/* Options */}
            <div className="space-y-3">
              {currentQuestion.options.map((option, idx) => {
                const isSelected = selectedIndex === idx;
                const optionLetter = String.fromCharCode(65 + idx); // A, B, C, D

                return (
                  <button
                    key={idx}
                    onClick={() => answerQuizQuestion(currentQuestion.id, idx)}
                    className={clsx(
                      'w-full text-left p-4 rounded-xl border-2 transition-all',
                      isSelected
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                        : 'border-border hover:border-brand-300 hover:bg-surface-tertiary/50',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={clsx(
                          'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold',
                          isSelected
                            ? 'bg-brand-500 text-white'
                            : 'bg-surface-tertiary text-content-secondary',
                        )}
                      >
                        {optionLetter}
                      </span>
                      <span className={clsx(
                        'text-sm leading-relaxed',
                        isSelected ? 'text-content font-medium' : 'text-content-secondary',
                      )}>
                        {option.text}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={prevQuizQuestion}
            disabled={quizCurrentIndex === 0}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl transition-colors',
              quizCurrentIndex === 0
                ? 'text-content-tertiary cursor-not-allowed'
                : 'text-content-secondary hover:bg-surface-tertiary',
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          {/* Question dots */}
          <div className="flex items-center gap-1.5">
            {questions.map((q, i) => {
              const isCurrentQ = i === quizCurrentIndex;
              const isAnsweredQ = quizAnswers[q.id] !== undefined;
              return (
                <button
                  key={q.id}
                  onClick={() => useRepsStore.setState({ quizCurrentIndex: i })}
                  className={clsx(
                    'w-2.5 h-2.5 rounded-full transition-all',
                    isCurrentQ
                      ? 'bg-brand-500 scale-125'
                      : isAnsweredQ
                        ? 'bg-brand-300 dark:bg-brand-700'
                        : 'bg-border',
                  )}
                />
              );
            })}
          </div>

          {quizCurrentIndex < questions.length - 1 ? (
            <button
              onClick={nextQuizQuestion}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-content-secondary hover:bg-surface-tertiary rounded-xl transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <Button
              onClick={() => setShowConfirmSubmit(true)}
              disabled={!allAnswered}
              size="sm"
            >
              <CheckCircle className="w-4 h-4 mr-1.5" />
              Submit quiz
            </Button>
          )}
        </div>

        {/* Answered counter help text */}
        {!allAnswered && (
          <p className="text-center text-xs text-content-tertiary mt-4">
            Answer all {questions.length} questions to submit ({questions.length - answeredCount} remaining)
          </p>
        )}
      </main>

      {/* Confirm submit modal */}
      {showConfirmSubmit && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowConfirmSubmit(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-surface rounded-2xl shadow-xl z-50 p-6"
          >
            <h3 className="font-semibold text-content text-lg mb-2">
              How confident do you feel?
            </h3>
            <p className="text-sm text-content-tertiary mb-4">
              Rate your confidence before seeing the results.
            </p>

            <div className="flex items-center justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map(score => (
                <button
                  key={score}
                  onClick={() => setConfidenceScore(score)}
                  className={`w-12 h-12 rounded-xl border-2 font-semibold transition-all ${
                    confidenceScore === score
                      ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-900/20'
                      : 'border-border text-content-secondary hover:border-brand-300'
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-content-tertiary mb-6">
              <span>Not confident</span>
              <span>Very confident</span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 py-2.5 text-sm text-content-secondary bg-surface-tertiary rounded-xl hover:bg-border transition-colors"
              >
                Cancel
              </button>
              <Button
                onClick={handleSubmit}
                isLoading={isCompleting}
                className="flex-1"
              >
                Get results
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
