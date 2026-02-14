import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Button } from '../common/Button';
import { ArrowRight, Check, Rocket, BookOpen, Loader2, Code2, Eye } from 'lucide-react';
import { onboardingService } from '@/services/onboardingService';
import type { LearnerPrefs } from '@/types';

type ContentDepth = LearnerPrefs['contentDepth'];
type ToolPreference = 'any' | 'preferGeneric' | 'genericOnly';

interface FeelingStepProps {
  selectedDirection: string;
  onSelect: (depth: ContentDepth, familiarity: string, sessionLength: string, learningStyle: LearningStyle, toolPreference: ToolPreference, outputType: OutputType, codeWritingEnabled: boolean) => void;
  isLoading?: boolean;
}

type Familiarity = 'new' | 'know_basics' | 'skilled';
type SessionLength = 'short' | 'medium' | 'long';
export type OutputType =
  | 'apply_skill'
  | 'ship_project'
  | 'understand_concept'
  | 'get_hired'
  | 'teach_others'
  | 'compete';
export type LearningStyle = 'projects' | 'practice';

interface Option<T> {
  value: T;
  label: string;
  sublabel: string;
}

export function FeelingStep({ selectedDirection, onSelect, isLoading }: FeelingStepProps) {
  // AI-based skill classification (uses Haiku for cost efficiency)
  const [isClassifying, setIsClassifying] = useState(true);
  const [supportsProjectBased, setSupportsProjectBased] = useState(false);

  const [familiarity, setFamiliarity] = useState<Familiarity | null>(null);
  const [sessionLength, setSessionLength] = useState<SessionLength | null>(null);
  const [outputType, setOutputType] = useState<OutputType | null>(null);
  const [learningStyle, setLearningStyle] = useState<LearningStyle | null>(null);
  const [toolPreference, setToolPreference] = useState<ToolPreference | null>(null);
  const [codeWritingEnabled, setCodeWritingEnabled] = useState(false);

  // Classify skill on mount to determine if project-based learning is available
  useEffect(() => {
    const classifySkill = async () => {
      try {
        const result = await onboardingService.classifySkill(selectedDirection);
        setSupportsProjectBased(result.supportsProjectBased);
        // Default to practice for non-code skills
        if (!result.supportsProjectBased) {
          setLearningStyle('practice');
        }
      } catch (error) {
        console.error('Failed to classify skill:', error);
        // Default to practice on error
        setLearningStyle('practice');
      } finally {
        setIsClassifying(false);
      }
    };

    classifySkill();
  }, [selectedDirection]);

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
    { value: 'get_hired', label: 'Get hired', sublabel: 'Job & interview ready' },
    { value: 'teach_others', label: 'Teach others', sublabel: 'Explain clearly' },
    { value: 'compete', label: 'Compete', sublabel: 'Beat the competition' },
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
      case 'get_hired': return 'medium';
      case 'teach_others': return 'deep';
      case 'compete': return 'deep';
    }
  };

  const handleContinue = () => {
    if (familiarity && sessionLength && outputType && learningStyle && toolPreference) {
      onSelect(mapOutputToDepth(outputType), familiarity, sessionLength, learningStyle, toolPreference, outputType, codeWritingEnabled);
    }
  };

  // For non-programming, learningStyle is already set to 'practice', so just check the rest
  const allSelected = familiarity && sessionLength && outputType && learningStyle && toolPreference;

  // Show loading while classifying skill
  if (isClassifying) {
    return (
      <div className="max-w-xl mx-auto flex flex-col items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin mb-4" />
        <p className="text-content-tertiary text-sm">Analyzing your learning path...</p>
      </div>
    );
  }

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

        {/* Q3: Output type - What's your goal? */}
        <div>
          <h3 className="text-sm font-medium text-content-secondary mb-3">What do you want from this?</h3>

          {/* Learn & Understand - prominent single option */}
          <div className="flex justify-center mb-3">
            <button
              onClick={() => setOutputType('understand_concept')}
              className={clsx(
                'relative px-6 py-3 rounded-xl border-2 text-center transition-all',
                'hover:border-brand-300',
                outputType === 'understand_concept'
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-border bg-surface'
              )}
            >
              {outputType === 'understand_concept' && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-brand-500 rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              <div className="text-sm font-medium text-content mb-0.5">
                Learn & Understand
              </div>
              <div className="text-xs text-content-tertiary">Know the why behind it</div>
            </button>
          </div>

          {/* Other output types */}
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
                    : 'border-border bg-surface'
                )}
              >
                {outputType === option.value && (
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

        {/* Q4: Tool preference */}
        <QuestionBlock
          question="What kind of tools work for you?"
          options={toolPreferenceOptions}
          selected={toolPreference}
          onSelect={setToolPreference}
        />

        {/* Q5: Learning style - Projects vs Practice (only for programming-related skills) */}
        {supportsProjectBased && (
          <div>
            <h3 className="text-sm font-medium text-content-secondary mb-3">How do you want to learn?</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Practice - default/recommended option on the left */}
              <button
                onClick={() => setLearningStyle('practice')}
                className={clsx(
                  'relative p-4 rounded-xl border-2 text-left transition-all',
                  'hover:border-brand-300',
                  learningStyle === 'practice'
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-border bg-surface'
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
                <div className="text-sm font-semibold text-content mb-1">
                  Practice & Exercises
                </div>
                <div className="text-xs text-content-tertiary">
                  Daily practice, exercises, and hands-on activities. Great for mastering concepts.
                </div>
              </button>

              {/* Project-based - for specific goal-oriented learners */}
              <button
                onClick={() => setLearningStyle('projects')}
                className={clsx(
                  'relative p-4 rounded-xl border-2 text-left transition-all',
                  'hover:border-border',
                  learningStyle === 'projects'
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-border bg-surface'
                )}
              >
                {learningStyle === 'projects' && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className="w-10 h-10 rounded-lg bg-surface-tertiary flex items-center justify-center mb-3">
                  <Rocket className="w-5 h-5 text-content-tertiary" />
                </div>
                <div className="text-sm font-semibold text-content mb-1">
                  I know what to build
                </div>
                <div className="text-xs text-content-tertiary">
                  Already have a specific project in mind? End the course with it complete.
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Advanced Mode Toggle - only for practice mode on code skills */}
        {supportsProjectBased && learningStyle === 'practice' && (
          <div className="mt-4 p-4 bg-surface-secondary rounded-xl border border-border">
            <div className="flex items-start gap-3">
              <button
                onClick={() => setCodeWritingEnabled(!codeWritingEnabled)}
                className={clsx(
                  'mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all',
                  codeWritingEnabled
                    ? 'bg-brand-500 border-brand-500'
                    : 'bg-surface border-border hover:border-border'
                )}
              >
                {codeWritingEnabled && <Check className="w-3 h-3 text-white" />}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Code2 className="w-4 h-4 text-content-secondary" />
                  <span className="text-sm font-medium text-content">
                    Include code writing exercises
                  </span>
                  <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                    Advanced
                  </span>
                </div>
                <p className="text-xs text-content-tertiary">
                  {codeWritingEnabled ? (
                    <>
                      Write code from scratch + review AI-generated code
                      <span className="block mt-1 text-amber-600">
                        Note: This increases course length and difficulty
                      </span>
                    </>
                  ) : (
                    <>

                      <span className="block mt-1 text-content-tertiary">
                        Enabling this requires more time and effort every day
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
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
