import { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../common/Button';
import { ArrowRight, Check } from 'lucide-react';
import type { LearnerPrefs } from '@/types';

type ContentDepth = LearnerPrefs['contentDepth'];

interface FeelingStepProps {
  selectedDirection: string;
  onSelect: (depth: ContentDepth, familiarity: string, sessionLength: string, toolPreference: string) => void;
  isLoading?: boolean;
}

type Familiarity = 'new' | 'know_basics' | 'skilled';
type SessionLength = 'short' | 'medium' | 'long';
type GoalType = 'working' | 'understand' | 'teach';
type ToolPreference = 'specific_tools' | 'mixed' | 'concepts_only';

interface Option<T> {
  value: T;
  label: string;
  sublabel: string;
}

export function FeelingStep({ selectedDirection, onSelect, isLoading }: FeelingStepProps) {
  const [familiarity, setFamiliarity] = useState<Familiarity | null>(null);
  const [sessionLength, setSessionLength] = useState<SessionLength | null>(null);
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [toolPreference, setToolPreference] = useState<ToolPreference | null>(null);

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

  const goalOptions: Option<GoalType>[] = [
    { value: 'working', label: 'Make it work', sublabel: 'Get something running' },
    { value: 'understand', label: 'Understand it', sublabel: 'Know how & why' },
    { value: 'teach', label: 'Explain to others', sublabel: 'Deep mastery' },
  ];

  const toolPreferenceOptions: Option<ToolPreference>[] = [
    { value: 'specific_tools', label: 'Specific tools', sublabel: 'Zapier, Make, etc.' },
    { value: 'mixed', label: 'Mix of both', sublabel: 'Tools + concepts' },
    { value: 'concepts_only', label: 'Concepts only', sublabel: 'No specific tools' },
  ];

  // Map goal type to depth for the backend
  const mapGoalToDepth = (goal: GoalType): ContentDepth => {
    switch (goal) {
      case 'working': return 'fast';
      case 'understand': return 'medium';
      case 'teach': return 'deep';
    }
  };

  const handleContinue = () => {
    if (familiarity && sessionLength && goalType && toolPreference) {
      onSelect(mapGoalToDepth(goalType), familiarity, sessionLength, toolPreference);
    }
  };

  const allSelected = familiarity && sessionLength && goalType && toolPreference;

  return (
    <div className="max-w-xl mx-auto">
      {/* Header - reassuring message */}
      <div className="text-center mb-8">
        <p className="text-sm text-brand-600 font-medium mb-2">
          We'll figure this out together
        </p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Just a few quick questions
        </h2>
        <p className="text-gray-500 text-sm">
          No right or wrong answers. We'll adjust as you learn.
        </p>
      </div>

      {/* Direction reminder */}
      <div className="bg-gray-50 rounded-lg px-4 py-3 mb-8 text-sm">
        <span className="text-gray-500">Learning:</span>{' '}
        <span className="text-gray-800 font-medium">{selectedDirection}</span>
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

        {/* Q3: Goal type */}
        <QuestionBlock
          question="What do you want from this?"
          options={goalOptions}
          selected={goalType}
          onSelect={setGoalType}
        />

        {/* Q4: Tool preference */}
        <QuestionBlock
          question="How do you want to learn?"
          options={toolPreferenceOptions}
          selected={toolPreference}
          onSelect={setToolPreference}
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
      <p className="text-center text-xs text-gray-400 mt-4">
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
      <h3 className="text-sm font-medium text-gray-700 mb-3">{question}</h3>
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
                : 'border-gray-200 bg-white'
            )}
          >
            {selected === option.value && (
              <div className="absolute top-2 right-2 w-4 h-4 bg-brand-500 rounded-full flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            )}
            <div className="text-sm font-medium text-gray-900 mb-0.5">
              {option.label}
            </div>
            <div className="text-xs text-gray-500">{option.sublabel}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
