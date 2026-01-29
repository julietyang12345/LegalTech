import { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../common/Button';
import { ArrowRight, Check, Rocket, BookOpen } from 'lucide-react';
import type { LearnerPrefs } from '@/types';

type ContentDepth = LearnerPrefs['contentDepth'];
type ToolPreference = 'any' | 'preferGeneric' | 'genericOnly';

interface FeelingStepProps {
  selectedDirection: string;
  onSelect: (depth: ContentDepth, familiarity: string, sessionLength: string, learningStyle: LearningStyle, toolPreference: ToolPreference, outputType: OutputType) => void;
  isLoading?: boolean;
}

type Familiarity = 'new' | 'know_basics' | 'skilled';
type SessionLength = 'short' | 'medium' | 'long';
export type OutputType =
  | 'apply_skill'
  | 'ship_project'
  | 'understand_concept'
  | 'pass_exam'
  | 'teach_others'
  | 'compete'
  | 'master_basics';
export type LearningStyle = 'projects' | 'practice';

interface Option<T> {
  value: T;
  label: string;
  sublabel: string;
}

export function FeelingStep({ selectedDirection, onSelect, isLoading }: FeelingStepProps) {
  const [familiarity, setFamiliarity] = useState<Familiarity | null>(null);
  const [sessionLength, setSessionLength] = useState<SessionLength | null>(null);
  const [outputType, setOutputType] = useState<OutputType | null>(null);
  const [learningStyle, setLearningStyle] = useState<LearningStyle | null>(null);
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

  const outputTypeOptions: Option<OutputType>[] = [
    { value: 'apply_skill', label: 'Use it well', sublabel: 'Practical proficiency' },
    { value: 'ship_project', label: 'Ship something', sublabel: 'Build end-to-end' },
    { value: 'understand_concept', label: 'Understand deeply', sublabel: 'Know the why' },
    { value: 'pass_exam', label: 'Pass an exam', sublabel: 'Test preparation' },
    { value: 'teach_others', label: 'Teach others', sublabel: 'Explain clearly' },
    { value: 'compete', label: 'Compete', sublabel: 'Beat the competition' },
    { value: 'master_basics', label: 'Master basics', sublabel: 'Solid foundation' },
  ];

  const toolPreferenceOptions: Option<ToolPreference>[] = [
    { value: 'any', label: 'Open to anything', sublabel: 'Paid tools are fine' },
    { value: 'preferGeneric', label: 'Prefer free', sublabel: 'Free when possible' },
    { value: 'genericOnly', label: 'Free only', sublabel: 'Stick to free tools' },
  ];

  // Map output type to content depth for the backend
  const mapOutputToDepth = (output: OutputType): ContentDepth => {
    switch (output) {
      case 'apply_skill': return 'medium';
      case 'ship_project': return 'medium';
      case 'understand_concept': return 'medium';
      case 'pass_exam': return 'medium';
      case 'teach_others': return 'deep';
      case 'compete': return 'deep';
      case 'master_basics': return 'fast';
    }
  };

  const handleContinue = () => {
    if (familiarity && sessionLength && outputType && learningStyle && toolPreference) {
      onSelect(mapOutputToDepth(outputType), familiarity, sessionLength, learningStyle, toolPreference, outputType);
    }
  };

  const allSelected = familiarity && sessionLength && outputType && learningStyle && toolPreference;

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

        {/* Q3: Output type - What's your goal? */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">What do you want from this?</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {outputTypeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setOutputType(option.value)}
                className={clsx(
                  'relative p-3 rounded-xl border-2 text-left transition-all',
                  'hover:border-brand-300',
                  outputType === option.value
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 bg-white'
                )}
              >
                {outputType === option.value && (
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

        {/* Q4: Tool preference */}
        <QuestionBlock
          question="What kind of tools work for you?"
          options={toolPreferenceOptions}
          selected={toolPreference}
          onSelect={setToolPreference}
        />

        {/* Q5: Learning style - Projects vs Practice */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">How do you want to learn?</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setLearningStyle('projects')}
              className={clsx(
                'relative p-4 rounded-xl border-2 text-left transition-all',
                'hover:border-brand-300',
                learningStyle === 'projects'
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-200 bg-white'
              )}
            >
              {learningStyle === 'projects' && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mb-3">
                <Rocket className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-sm font-semibold text-gray-900 mb-1">
                Build a Project
              </div>
              <div className="text-xs text-gray-500">
                Work on one real project across all days. Great for hands-on learners.
              </div>
            </button>

            <button
              onClick={() => setLearningStyle('practice')}
              className={clsx(
                'relative p-4 rounded-xl border-2 text-left transition-all',
                'hover:border-brand-300',
                learningStyle === 'practice'
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-200 bg-white'
              )}
            >
              {learningStyle === 'practice' && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-sm font-semibold text-gray-900 mb-1">
                Practice & Exercises
              </div>
              <div className="text-xs text-gray-500">
                Daily quizzes, exercises, challenges. Great for mastering concepts.
              </div>
            </button>
          </div>
        </div>
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
