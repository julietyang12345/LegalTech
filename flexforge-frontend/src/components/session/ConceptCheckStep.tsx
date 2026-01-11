import { useState } from 'react';
import { CheckSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, MultipleChoiceQuestion, AnimatedReveal } from '@/components/common';
import { StepLayout } from './StepLayout';
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
    <StepLayout
      icon={CheckSquare}
      iconGradient="from-emerald-400 to-emerald-500"
      title="Concept Check ✓"
      subtitle="3 levels of understanding - select the best answer"
    >
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
              <AnimatedReveal show={isExpanded && levelQuestions.length > 0} className="overflow-hidden">
                <div className="px-4 pb-4 space-y-4">
                  {levelQuestions.map((q, index) => (
                    <MultipleChoiceQuestion
                      key={q.id}
                      question={q.question}
                      options={q.options || []}
                      correctIndex={q.correctIndex}
                      explanation={q.explanation}
                      selectedIndex={selectedAnswers[q.id] ?? null}
                      onSelect={(optionIndex) => handleSelectOption(q.id, optionIndex, q.correctIndex)}
                      showResult={selectedAnswers[q.id] !== undefined}
                      questionNumber={index + 1}
                    />
                  ))}
                </div>
              </AnimatedReveal>
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
    </StepLayout>
  );
}
