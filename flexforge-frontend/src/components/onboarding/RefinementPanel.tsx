import { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../common/Button';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { type RefinementContext, type LearningDirection } from '@/types';

interface RefinementPanelProps {
  originalGoal: string;
  directions?: LearningDirection[];
  onSubmit: (refinement: RefinementContext) => void;
  onBack: () => void;
  isLoading?: boolean;
}

type UsageContext = NonNullable<RefinementContext['usageContext']>;

interface ChipOption<T> {
  value: T;
  label: string;
  emoji?: string;
}

export function RefinementPanel({
  originalGoal,
  directions = [],
  onSubmit,
  onBack,
  isLoading,
}: RefinementPanelProps) {
  const [usageContext, setUsageContext] = useState<UsageContext>();
  const [userFeedback, setUserFeedback] = useState<string>('');

  const usageOptions: ChipOption<UsageContext>[] = [
    { value: 'work', label: 'At work', emoji: '💼' },
    { value: 'personal', label: 'Personal project', emoji: '🏠' },
    { value: 'interview', label: 'Interview prep', emoji: '🎯' },
    { value: 'school', label: 'School/learning', emoji: '📚' },
  ];

  const handleSubmit = () => {
    const refinement: RefinementContext = {};
    if (usageContext) refinement.usageContext = usageContext;
    if (userFeedback.trim()) refinement.userFeedback = userFeedback.trim();
    // Pass previous directions to avoid regenerating them
    if (directions.length > 0) {
      refinement.previousDirections = JSON.stringify({ directions });
    }
    onSubmit(refinement);
  };

  const hasAnyInput = usageContext || userFeedback.trim();

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-content-tertiary hover:text-content-secondary mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to directions
        </button>

        <h2 className="text-xl font-bold text-content mb-2">
          Help us understand better
        </h2>
        <p className="text-content-tertiary text-sm">
          What's missing from the directions above?
        </p>
      </div>

      {/* Original goal reminder */}
      <div className="bg-surface-secondary rounded-lg p-3 mb-6 text-sm">
        <span className="text-content-tertiary">Your goal:</span>{' '}
        <span className="text-content">{originalGoal}</span>
      </div>

      {/* Questions */}
      <div className="space-y-6">
        {/* Q1: Context */}
        <QuestionSection title="What's this for?" emoji="📍">
          <ChipGroup
            options={usageOptions}
            selected={usageContext}
            onSelect={setUsageContext}
          />
        </QuestionSection>

        {/* Q2: Free-text - most important */}
        <QuestionSection title="Tell us more" emoji="💬">
          <textarea
            value={userFeedback}
            onChange={(e) => setUserFeedback(e.target.value)}
            placeholder="What specifically are you looking for? e.g., 'I want to use Python, not no-code' or 'Focus on the automation part'"
            className="w-full p-3 rounded-lg border border-border text-base resize-none
                     focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            rows={3}
            autoFocus
          />
        </QuestionSection>
      </div>

      {/* Submit */}
      <div className="mt-8">
        <Button
          size="lg"
          className="w-full"
          onClick={handleSubmit}
          isLoading={isLoading}
          rightIcon={<ArrowRight className="w-5 h-5" />}
        >
          {hasAnyInput ? 'Find better directions' : 'Try again'}
        </Button>
      </div>
    </div>
  );
}

function QuestionSection({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-content-secondary mb-2">
        {emoji} {title}
      </h3>
      {children}
    </div>
  );
}

function ChipGroup<T extends string | number>({
  options,
  selected,
  onSelect,
}: {
  options: ChipOption<T>[];
  selected: T | undefined;
  onSelect: (value: T | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={String(option.value)}
          onClick={() =>
            onSelect(selected === option.value ? undefined : option.value)
          }
          className={clsx(
            'px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap overflow-hidden',
            selected === option.value
              ? 'bg-brand-500 text-white shadow-md'
              : 'bg-surface-tertiary text-content-secondary hover:bg-surface-tertiary'
          )}
        >
          {option.emoji && <span className="mr-1">{option.emoji}</span>}
          {option.label}
        </button>
      ))}
    </div>
  );
}
