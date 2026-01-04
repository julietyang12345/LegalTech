import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { Card, Button } from '@/components/common';
import { clsx } from 'clsx';
import type { CurriculumDay, Session } from '@/types';

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

export function ConceptCheckStep({ day }: ConceptCheckStepProps) {
  const [expandedLevel, setExpandedLevel] = useState<number | null>(1);
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<string, 'correct' | 'incorrect' | null>>({});
  const [showAnswers, setShowAnswers] = useState<Record<string, boolean>>({});

  const questions = day.conceptCheck?.questions || [];

  const handleToggleAnswer = (questionId: string) => {
    setShowAnswers(prev => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  const handleSelfCheck = (questionId: string, correct: boolean) => {
    setAnsweredQuestions(prev => ({
      ...prev,
      [questionId]: correct ? 'correct' : 'incorrect'
    }));
  };

  const questionsByLevel = questions.reduce((acc, q, index) => {
    const level = q.level || 1;
    if (!acc[level]) acc[level] = [];
    acc[level].push({ ...q, id: `q-${index}` });
    return acc;
  }, {} as Record<number, any[]>);

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
          3 levels of understanding - answer each honestly
        </p>
      </div>

      {/* Level accordion */}
      <div className="space-y-3">
        {[1, 2, 3].map((level) => {
          const info = LEVEL_INFO[level as keyof typeof LEVEL_INFO];
          const levelQuestions = questionsByLevel[level] || [];
          const isExpanded = expandedLevel === level;
          const allAnswered = levelQuestions.every(q => answeredQuestions[q.id]);
          const allCorrect = levelQuestions.every(q => answeredQuestions[q.id] === 'correct');

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
                      allCorrect ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    )}>
                      {allCorrect ? 'All correct!' : 'Review needed'}
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
                      {levelQuestions.map((q, index) => (
                        <div
                          key={q.id}
                          className={clsx(
                            'p-4 rounded-lg border',
                            answeredQuestions[q.id] === 'correct' && 'bg-green-50 border-green-200',
                            answeredQuestions[q.id] === 'incorrect' && 'bg-amber-50 border-amber-200',
                            !answeredQuestions[q.id] && 'bg-gray-50 border-gray-200'
                          )}
                        >
                          <p className="font-medium text-gray-900 mb-3">
                            {index + 1}. {q.question}
                          </p>

                          {/* Show/hide answer */}
                          {!showAnswers[q.id] ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleAnswer(q.id)}
                            >
                              Think, then reveal answer
                            </Button>
                          ) : (
                            <div className="space-y-3">
                              <div className="p-3 bg-white rounded border border-gray-200">
                                <p className="text-sm text-gray-600 font-medium mb-1">Answer:</p>
                                <p className="text-gray-800">{q.answer}</p>
                              </div>

                              {/* Self-verification */}
                              {!answeredQuestions[q.id] && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-600">Did you get it right?</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSelfCheck(q.id, true)}
                                    leftIcon={<Check className="w-4 h-4 text-green-500" />}
                                  >
                                    Yes
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSelfCheck(q.id, false)}
                                    leftIcon={<X className="w-4 h-4 text-amber-500" />}
                                  >
                                    Not quite
                                  </Button>
                                </div>
                              )}

                              {answeredQuestions[q.id] === 'correct' && (
                                <p className="text-sm text-green-600 font-medium">
                                  ✓ Great job!
                                </p>
                              )}

                              {answeredQuestions[q.id] === 'incorrect' && (
                                <p className="text-sm text-amber-600 font-medium">
                                  📝 Review this concept - it'll come up again!
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
      </div>

      {/* Progress summary */}
      {Object.keys(answeredQuestions).length > 0 && (
        <div className="text-center text-sm text-gray-500">
          {Object.values(answeredQuestions).filter(a => a === 'correct').length} of {questions.length} correct
        </div>
      )}
    </div>
  );
}
