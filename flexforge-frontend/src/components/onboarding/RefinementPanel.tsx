import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { Button } from '../common/Button';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { SkillType, type RefinementContext, type LearningDirection } from '@/types';

interface RefinementPanelProps {
  originalGoal: string;
  directions?: LearningDirection[];
  onSubmit: (refinement: RefinementContext) => void;
  onBack: () => void;
  isLoading?: boolean;
}

type OutputType = NonNullable<RefinementContext['outputType']>;
type UsageContext = NonNullable<RefinementContext['usageContext']>;
type PlatformTolerance = NonNullable<RefinementContext['platformTolerance']>;
type SkillLevel = NonNullable<RefinementContext['skillLevel']>;

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
  const [outputType, setOutputType] = useState<OutputType>();
  const [usageContext, setUsageContext] = useState<UsageContext>();
  const [platformTolerance, setPlatformTolerance] = useState<PlatformTolerance>();
  const [skillLevel, setSkillLevel] = useState<SkillLevel>();
  const [timeMinutes, setTimeMinutes] = useState<number>();
  const [userFeedback, setUserFeedback] = useState<string>('');

  // Determine the dominant skill type from directions
  const dominantSkillType = useMemo((): SkillType => {
    if (directions.length === 0) return SkillType.CODE;

    // Count skill types
    const counts: Record<string, number> = {};
    directions.forEach((d) => {
      const type = d.skillType || SkillType.CODE;
      counts[type] = (counts[type] || 0) + 1;
    });

    // Return the most common one
    let maxCount = 0;
    let dominant: SkillType = SkillType.CODE;
    for (const [type, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        dominant = type as SkillType;
      }
    }
    return dominant;
  }, [directions]);

  // Get output options based on skill type
  const outputOptions = useMemo((): ChipOption<OutputType>[] => {
    switch (dominantSkillType) {
      case SkillType.KNOWLEDGE:
        // Language learning, academic, theory
        return [
          { value: 'understand_concept', label: 'Understand deeply', emoji: '💡' },
          { value: 'pass_exam', label: 'Pass an exam', emoji: '📝' },
          { value: 'apply_practical', label: 'Use practically', emoji: '🎯' },
          { value: 'teach_others', label: 'Teach others', emoji: '👥' },
        ];
      case SkillType.PHYSICAL:
        // Sports, music, dance, crafts
        return [
          { value: 'master_basics', label: 'Master basics', emoji: '🌱' },
          { value: 'perform_skill', label: 'Perform well', emoji: '⭐' },
          { value: 'compete', label: 'Compete', emoji: '🏆' },
          { value: 'teach_others', label: 'Teach others', emoji: '👥' },
        ];
      case SkillType.CODE:
      case SkillType.AI_AGENT:
      case SkillType.DESIGN:
      default:
        // Technical/coding skills
        return [
          { value: 'working_code', label: 'Working code', emoji: '💻' },
          { value: 'understand_concept', label: 'Understand concept', emoji: '💡' },
          { value: 'fix_bug', label: 'Fix a bug', emoji: '🐛' },
          { value: 'ship_project', label: 'Ship a project', emoji: '🚀' },
        ];
    }
  }, [dominantSkillType]);

  const usageOptions: ChipOption<UsageContext>[] = [
    { value: 'work', label: 'At work', emoji: '💼' },
    { value: 'personal', label: 'Personal project', emoji: '🏠' },
    { value: 'interview', label: 'Interview prep', emoji: '🎯' },
    { value: 'school', label: 'School/learning', emoji: '📚' },
  ];

  const platformOptions: ChipOption<PlatformTolerance>[] = [
    { value: 'any', label: 'Any tools fine', emoji: '🔧' },
    { value: 'preferGeneric', label: 'Prefer general', emoji: '🎯' },
    { value: 'genericOnly', label: 'Concepts only', emoji: '💡' },
  ];

  const skillOptions: ChipOption<SkillLevel>[] = [
    { value: 'beginner', label: 'Beginner', emoji: '🌱' },
    { value: 'intermediate', label: 'Intermediate', emoji: '🌿' },
    { value: 'advanced', label: 'Advanced', emoji: '🌳' },
  ];

  const timeOptions: ChipOption<number>[] = [
    { value: 15, label: '15 min', emoji: '⚡' },
    { value: 30, label: '30 min', emoji: '🕐' },
    { value: 60, label: '1 hour', emoji: '📖' },
    { value: 90, label: '1.5 hours', emoji: '🎯' },
  ];

  const handleSubmit = () => {
    const refinement: RefinementContext = {};
    if (outputType) refinement.outputType = outputType;
    if (usageContext) refinement.usageContext = usageContext;
    if (platformTolerance) refinement.platformTolerance = platformTolerance;
    if (skillLevel) refinement.skillLevel = skillLevel;
    if (timeMinutes) refinement.timeMinutes = timeMinutes;
    if (userFeedback.trim()) refinement.userFeedback = userFeedback.trim();
    // Pass previous directions to avoid regenerating them
    if (directions.length > 0) {
      refinement.previousDirections = JSON.stringify({ directions });
    }
    onSubmit(refinement);
  };

  const hasAnySelection =
    outputType || usageContext || platformTolerance || skillLevel || timeMinutes || userFeedback.trim();

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to directions
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Let's refine your goal
        </h2>
        <p className="text-gray-600 text-sm">
          Answer a few quick questions to get better recommendations.
          <br />
          <span className="text-gray-500 italic">All optional - just pick what applies</span>
        </p>
      </div>

      {/* Original goal reminder */}
      <div className="bg-gray-50 rounded-lg p-3 mb-6 text-sm">
        <span className="text-gray-500">Your goal:</span>{' '}
        <span className="text-gray-800">{originalGoal}</span>
      </div>

      {/* Questions */}
      <div className="space-y-6">
        {/* Q1: Output type */}
        <QuestionSection title="What's the output?" emoji="🎯">
          <ChipGroup
            options={outputOptions}
            selected={outputType}
            onSelect={setOutputType}
          />
        </QuestionSection>

        {/* Q2: Usage context */}
        <QuestionSection title="Where will you use it?" emoji="📍">
          <ChipGroup
            options={usageOptions}
            selected={usageContext}
            onSelect={setUsageContext}
          />
        </QuestionSection>

        {/* Q3: Skill level */}
        <QuestionSection title="Your current level?" emoji="📊">
          <ChipGroup
            options={skillOptions}
            selected={skillLevel}
            onSelect={setSkillLevel}
          />
        </QuestionSection>

        {/* Q4: Platform tolerance */}
        <QuestionSection title="Content preference?" emoji="🎬">
          <ChipGroup
            options={platformOptions}
            selected={platformTolerance}
            onSelect={setPlatformTolerance}
          />
        </QuestionSection>

        {/* Q5: Time */}
        <QuestionSection title="Daily learning time?" emoji="⏱️">
          <ChipGroup
            options={timeOptions}
            selected={timeMinutes}
            onSelect={setTimeMinutes}
          />
        </QuestionSection>

        {/* Q6: Free-text feedback */}
        <QuestionSection title="Anything specific you want?" emoji="💬">
          <textarea
            value={userFeedback}
            onChange={(e) => setUserFeedback(e.target.value)}
            placeholder="e.g., 'I want to use Python, not no-code tools' or 'Focus on the email automation part'"
            className="w-full p-3 rounded-lg border border-gray-200 text-sm resize-none
                     focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            rows={3}
          />
          <p className="text-xs text-gray-400 mt-1">
            This helps us find exactly what you're looking for
          </p>
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
          {hasAnySelection ? 'Find better directions' : 'Try again with same info'}
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
      <h3 className="text-sm font-medium text-gray-700 mb-2">
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
            'px-3 py-2 rounded-lg text-sm font-medium transition-all',
            selected === option.value
              ? 'bg-brand-500 text-white shadow-md'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          {option.emoji && <span className="mr-1">{option.emoji}</span>}
          {option.label}
        </button>
      ))}
    </div>
  );
}
