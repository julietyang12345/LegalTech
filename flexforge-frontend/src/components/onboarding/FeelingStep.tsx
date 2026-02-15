import { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../common/Button';
import { ArrowRight, Check } from 'lucide-react';
import { GoalType } from '@/types';
import type { LearnerPrefs } from '@/types';

type ContentDepth = LearnerPrefs['contentDepth'];
type ToolPreference = 'any' | 'preferGeneric' | 'genericOnly';

interface FeelingStepProps {
  selectedDirection: string;
  goalType?: GoalType;
  onSelect: (depth: ContentDepth, familiarity: string, sessionLength: string, learningStyle: LearningStyle, toolPreference: ToolPreference, outputType: OutputType, codeWritingEnabled: boolean) => void;
  isLoading?: boolean;
}

/** Auto-derived outputType, learningStyle, and codeWritingEnabled per goal type */
function getDefaultsForMode(goalType: GoalType): { outputType: OutputType; learningStyle: LearningStyle; codeWritingEnabled: boolean } {
  switch (goalType) {
    case GoalType.INTERVIEW:
      return { outputType: 'get_hired', learningStyle: 'practice', codeWritingEnabled: false };
    case GoalType.PROJECT:
    case GoalType.AI_BUILDER:
      return { outputType: 'ship_project', learningStyle: 'projects', codeWritingEnabled: false };
    case GoalType.LANGUAGE:
      return { outputType: 'learn_and_apply', learningStyle: 'practice', codeWritingEnabled: false };
    case GoalType.CURRICULUM:
    default:
      return { outputType: 'learn_and_apply', learningStyle: 'practice', codeWritingEnabled: false };
  }
}

type Familiarity = 'new' | 'know_basics' | 'skilled';
type SessionLength = 'short' | 'medium' | 'long';
export type OutputType =
  | 'learn_and_apply'
  | 'ship_project'
  | 'get_hired';
export type LearningStyle = 'projects' | 'practice';

interface Option<T> {
  value: T;
  label: string;
  sublabel: string;
}

export function FeelingStep({ selectedDirection, goalType, onSelect, isLoading }: FeelingStepProps) {
  const modeDefaults = getDefaultsForMode(goalType ?? GoalType.CURRICULUM);

  const [familiarity, setFamiliarity] = useState<Familiarity | null>(null);
  const [sessionLength, setSessionLength] = useState<SessionLength | null>(null);
  const [outputType] = useState<OutputType>(modeDefaults.outputType);
  const [learningStyle] = useState<LearningStyle>(modeDefaults.learningStyle);
  const [codeWritingEnabled] = useState(modeDefaults.codeWritingEnabled);

  const familiarityOptions: Option<Familiarity>[] = [
    { value: 'new', label: 'Completely new', sublabel: "Haven't touched this" },
    { value: 'know_basics', label: 'Know the basics', sublabel: 'Done it a few times' },
    { value: 'skilled', label: 'Skilled', sublabel: 'Want to go deeper' },
  ];

  const sessionLengthOptions: Option<SessionLength>[] = [
    { value: 'short', label: 'Short sessions', sublabel: 'Less than 30 min/day' },
    { value: 'medium', label: 'Medium sessions', sublabel: '30-60 min/day' },
    { value: 'long', label: 'Long sessions', sublabel: 'More than 1 hour/day' },
  ];

  // Map output type to content depth for the backend
  const mapOutputToDepth = (output: OutputType): ContentDepth => {
    switch (output) {
      case 'learn_and_apply': return 'medium';
      case 'ship_project': return 'medium';
      case 'get_hired': return 'medium';
    }
  };

  const handleContinue = () => {
    if (familiarity && sessionLength) {
      onSelect(mapOutputToDepth(outputType), familiarity, sessionLength, learningStyle, 'preferGeneric', outputType, codeWritingEnabled);
    }
  };

  const allSelected = familiarity && sessionLength;

  return (
    <div className="max-w-xl mx-auto">
      {/* Header - reassuring message */}
      <div className="text-center mb-8">
        <p className="text-sm text-brand-600 font-medium mb-2">
          We'll figure this out together
        </p>
        <h2 className="text-xl font-bold text-content mb-2">
          Just a few quick questions
        </h2>
        <p className="text-content-tertiary text-sm">
          No right or wrong answers. We'll adjust as you learn.
        </p>
      </div>

      {/* Direction reminder */}
      <div className="bg-surface-secondary rounded-lg px-4 py-3 mb-8 text-sm">
        <span className="text-content-tertiary">Learning:</span>{' '}
        <span className="text-content font-medium">{selectedDirection}</span>
      </div>

      {/* Questions */}
      <div className="space-y-8">
        {/* Q1: Familiarity */}
        <QuestionBlock
          question="How familiar is this to you?"
          options={familiarityOptions}
          selected={familiarity}
          onSelect={setFamiliarity}
        />

        {/* Q2: Session length */}
        <QuestionBlock
          question="How long can you learn each day?"
          options={sessionLengthOptions}
          selected={sessionLength}
          onSelect={setSessionLength}
        />

      </div>

      {/* Continue button */}
      <div className="mt-10">
        <Button
          size="lg"
          className="w-full"
          disabled={!allSelected || isLoading}
          onClick={handleContinue}
          isLoading={isLoading}
          rightIcon={<ArrowRight className="w-5 h-5" />}
        >
          {isLoading ? 'Setting up...' : 'Start learning'}
        </Button>
      </div>

      {/* Reassurance */}
      <p className="text-center text-xs text-content-tertiary mt-4">
        These preferences adapt as you go. No pressure to get it "right".
      </p>
    </div>
  );
}

function QuestionBlock<T extends string>({
  question,
  options,
  selected,
  onSelect,
}: {
  question: string;
  options: Option<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-content-secondary mb-3">{question}</h3>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={clsx(
              'relative p-3 rounded-xl border-2 text-left transition-all',
              'hover:border-brand-300',
              selected === option.value
                ? 'border-brand-500 bg-brand-50'
                : 'border-border bg-surface'
            )}
          >
            {selected === option.value && (
              <div className="absolute top-2 right-2 w-4 h-4 bg-brand-500 rounded-full flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            )}
            <div className="text-sm font-medium text-content mb-0.5">
              {option.label}
            </div>
            <div className="text-xs text-content-tertiary">{option.sublabel}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
