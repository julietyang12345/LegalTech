import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { Card } from '@/components/common';
import { clsx } from 'clsx';
import type { CurriculumDay, Session, ConceptQuestion } from '@/types';

interface ConceptCheckStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

const LEVEL_INFO = {
  1: { label: 'What is it?', color: 'green', emoji: '🌱' },
  2: { label: 'When to use it?', color: 'blue', emoji: '🎯' },
  3: { label: 'Why does it work?', color: 'purple', emoji: '🧠' },
};

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export function ConceptCheckStep({ day }: ConceptCheckStepProps) {
  const [expandedLevel, setExpandedLevel] = useState<number | null>(1);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number | null>>({});
  const [showExplanations, setShowExplanations] = useState<Record<string, boolean>>({});

  const questions = day.conceptCheck?.questions || [];

  const handleSelectOption = (questionId: string, optionIndex: number, correctIndex: number) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [questionId]: optionIndex
    }));
    // Show explanation after answer
    setShowExplanations(prev => ({
      ...prev,
      [questionId]: true
    }));
  };

  const isAnswerCorrect = (questionId: string, correctIndex: number) => {
    return selectedAnswers[questionId] === correctIndex;
  };

  const questionsByLevel = questions.reduce((acc, q, index) => {
    const level = q.level || 1;
    if (!acc[level]) acc[level] = [];
    acc[level].push({ ...q, id: `q-${index}` });
    return acc;
  }, {} as Record<number, (ConceptQuestion & { id: string })[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full
                       bg-gradient-to-br from-emerald-400 to-emerald-500 mb-4">
          <CheckSquare className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Concept Check ✓
        </h1>
        <p className="text-gray-600">
          3 levels of understanding - select the best answer
        </p>
      </div>

      {/* Level accordion */}
      <div className="space-y-3">
        {[1, 2, 3].map((level) => {
          const info = LEVEL_INFO[level as keyof typeof LEVEL_INFO];
          const levelQuestions = questionsByLevel[level] || [];
          const isExpanded = expandedLevel === level;
          const answeredCount = levelQuestions.filter(q => selectedAnswers[q.id] !== undefined).length;
          const correctCount = levelQuestions.filter(q =>
            selectedAnswers[q.id] !== undefined && isAnswerCorrect(q.id, q.correctIndex)
          ).length;
          const allAnswered = answeredCount === levelQuestions.length && levelQuestions.length > 0;

          return (
            <Card key={level} className={clsx(
              'transition-all duration-200',
              isExpanded && 'ring-2 ring-brand-500'
            )}>
              {/* Level header */}
              <button
                onClick={() => setExpandedLevel(isExpanded ? null : level)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{info.emoji}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Level {level}: {info.label}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {levelQuestions.length} question{levelQuestions.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {allAnswered && (
                    <span className={clsx(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      correctCount === levelQuestions.length
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    )}>
                      {correctCount}/{levelQuestions.length} correct
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Questions */}
              <AnimatePresence>
                {isExpanded && levelQuestions.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-4">
                      {levelQuestions.map((q, index) => {
                        const hasAnswered = selectedAnswers[q.id] !== undefined;
                        const isCorrect = hasAnswered && isAnswerCorrect(q.id, q.correctIndex);

                        return (
                          <div
                            key={q.id}
                            className={clsx(
                              'p-4 rounded-lg border',
                              isCorrect && 'bg-green-50 border-green-200',
                              hasAnswered && !isCorrect && 'bg-amber-50 border-amber-200',
                              !hasAnswered && 'bg-gray-50 border-gray-200'
                            )}
                          >
                            <p className="font-medium text-gray-900 mb-4">
                              {index + 1}. {q.question}
                            </p>

                            {/* Multiple choice options */}
                            <div className="space-y-2">
                              {q.options?.map((option, optionIndex) => {
                                const isSelected = selectedAnswers[q.id] === optionIndex;
                                const isCorrectOption = optionIndex === q.correctIndex;
                                const showResult = hasAnswered;

                                return (
                                  <button
                                    key={optionIndex}
                                    onClick={() => !hasAnswered && handleSelectOption(q.id, optionIndex, q.correctIndex)}
                                    disabled={hasAnswered}
                                    className={clsx(
                                      'w-full p-3 rounded-lg border text-left flex items-start gap-3 transition-all',
                                      !hasAnswered && 'hover:border-brand-300 hover:bg-brand-50 cursor-pointer',
                                      hasAnswered && 'cursor-default',
                                      // Before answering
                                      !showResult && 'bg-white border-gray-200',
                                      // After answering - correct option
                                      showResult && isCorrectOption && 'bg-green-100 border-green-400',
                                      // After answering - selected wrong option
                                      showResult && isSelected && !isCorrectOption && 'bg-red-100 border-red-400',
                                      // After answering - other unselected options
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
                                        OPTION_LABELS[optionIndex]
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

                            {/* Explanation after answering */}
                            {showExplanations[q.id] && q.explanation && (
                              <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={clsx(
                                  'mt-4 p-3 rounded-lg text-sm',
                                  isCorrect ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                                )}
                              >
                                <p className="font-medium mb-1">
                                  {isCorrect ? '✓ Correct!' : '✗ Not quite'}
                                </p>
                                <p>{q.explanation}</p>
                              </motion.div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
      </div>

      {/* Progress summary */}
      {Object.keys(selectedAnswers).length > 0 && (
        <div className="text-center text-sm text-gray-500">
          {questions.filter(q =>
            selectedAnswers[`q-${questions.indexOf(q)}`] === q.correctIndex
          ).length} of {questions.length} correct
        </div>
      )}
    </div>
  );
}
