import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Clock,
  Calendar,
  Zap,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Search,
  BookOpen,
  Target,
  CheckCircle,
  Brain,
  Trophy,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import { Button, Card } from '@/components/common';
import { SkillLevel } from '@/types';

// Loading steps configuration (~90 seconds total)
const LOADING_STEPS = [
  { icon: Search, text: 'Analyzing your skill level...', duration: 8000 },
  { icon: Brain, text: 'Researching optimal learning path...', duration: 12000 },
  { icon: BookOpen, text: 'Designing curriculum structure...', duration: 15000 },
  { icon: Sparkles, text: 'Generating daily lessons...', duration: 20000 },
  { icon: Target, text: 'Creating practice exercises...', duration: 15000 },
  { icon: Trophy, text: 'Adding boss projects...', duration: 12000 },
  { icon: CheckCircle, text: 'Finalizing your curriculum...', duration: 8000 },
];

// Generating Screen Component
function GeneratingScreen({ skillName }: { skillName: string }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  useEffect(() => {
    let totalTime = 0;
    const timers: NodeJS.Timeout[] = [];

    LOADING_STEPS.forEach((step, index) => {
      // Start this step
      const startTimer = setTimeout(() => {
        setCurrentStep(index);
      }, totalTime);
      timers.push(startTimer);

      // Complete this step
      totalTime += step.duration;
      const completeTimer = setTimeout(() => {
        setCompletedSteps((prev) => [...prev, index]);
      }, totalTime - 500);
      timers.push(completeTimer);
    });

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-brand-50 to-gray-50 py-12 px-4"
    >
      <div className="max-w-md mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full
                         bg-gradient-to-br from-brand-400 to-brand-500 mb-4 relative">
            <span className="text-4xl">🦊</span>
            <motion.div
              className="absolute inset-0 rounded-full border-4 border-brand-300"
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              style={{ borderTopColor: 'transparent' }}
            />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Creating your curriculum
          </h2>
          <p className="text-gray-600">
            Personalizing <span className="font-medium text-brand-600">{skillName}</span> for you
          </p>
        </motion.div>

        {/* Progress Steps */}
        <Card className="p-6">
          <div className="space-y-4">
            {LOADING_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === index;
              const isCompleted = completedSteps.includes(index);
              const isPending = currentStep < index;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={clsx(
                    'flex items-center gap-3 p-3 rounded-lg transition-colors',
                    isActive && 'bg-brand-50',
                    isCompleted && 'bg-green-50',
                    isPending && 'opacity-50'
                  )}
                >
                  <div
                    className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                      isActive && 'bg-brand-100 text-brand-600',
                      isCompleted && 'bg-green-100 text-green-600',
                      isPending && 'bg-gray-100 text-gray-400'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : isActive ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        <Loader2 className="w-5 h-5" />
                      </motion.div>
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <span
                    className={clsx(
                      'text-sm font-medium',
                      isActive && 'text-brand-700',
                      isCompleted && 'text-green-700',
                      isPending && 'text-gray-400'
                    )}
                  >
                    {step.text}
                  </span>
                </motion.div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-brand-400 to-brand-500"
                initial={{ width: '0%' }}
                animate={{ width: `${((completedSteps.length) / LOADING_STEPS.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">
              This usually takes 1-2 minutes
            </p>
          </div>
        </Card>

        {/* Fun fact */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center text-sm text-gray-500 mt-6"
        >
          Did you know? Active recall improves retention by 50%
        </motion.p>
      </div>
    </motion.div>
  );
}

// Skill level selection cards
function SkillLevelSelector({
  value,
  onChange,
}: {
  value: SkillLevel;
  onChange: (level: SkillLevel) => void;
}) {
  const levels = [
    {
      value: SkillLevel.BEGINNER,
      emoji: '🌱',
      label: 'Beginner',
      description: 'New to this topic',
    },
    {
      value: SkillLevel.INTERMEDIATE,
      emoji: '🌿',
      label: 'Intermediate',
      description: 'Know the basics',
    },
    {
      value: SkillLevel.ADVANCED,
      emoji: '🌳',
      label: 'Advanced',
      description: 'Looking to master',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {levels.map((level) => (
        <button
          key={level.value}
          type="button"
          onClick={() => onChange(level.value)}
          className={clsx(
            'p-4 rounded-xl border-2 text-center transition-all',
            value === level.value
              ? 'border-brand-500 bg-brand-50'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          )}
        >
          <span className="text-2xl mb-2 block">{level.emoji}</span>
          <span className="font-medium text-gray-900 block">{level.label}</span>
          <span className="text-xs text-gray-500">{level.description}</span>
        </button>
      ))}
    </div>
  );
}

// Duration selector
function DurationSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (days: number) => void;
}) {
  const options = [
    { days: 3, label: '3 days', description: 'Quick intro' },
    { days: 5, label: '5 days', description: 'Solid foundation' },
    { days: 7, label: '7 days', description: 'Recommended' },
    { days: 14, label: '14 days', description: 'Deep dive' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {options.map((option) => (
        <button
          key={option.days}
          type="button"
          onClick={() => onChange(option.days)}
          className={clsx(
            'p-4 rounded-xl border-2 text-center transition-all',
            value === option.days
              ? 'border-brand-500 bg-brand-50'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
            option.days === 7 && value !== option.days && 'ring-2 ring-focus-200'
          )}
        >
          <span className="font-bold text-lg text-gray-900 block">{option.label}</span>
          <span className="text-xs text-gray-500">{option.description}</span>
        </button>
      ))}
    </div>
  );
}

// Hours per day selector
function HoursSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (hours: number) => void;
}) {
  const options = [
    { hours: 0.5, label: '30min', recommended: false },
    { hours: 0.75, label: '45min', recommended: false },
    { hours: 1, label: '1h', recommended: true },
    { hours: 1.5, label: '1.5h', recommended: true },
  ];

  return (
    <div className="flex gap-2">
      {options.map((option) => (
        <button
          key={option.hours}
          type="button"
          onClick={() => onChange(option.hours)}
          className={clsx(
            'flex-1 py-3 rounded-lg border-2 font-medium transition-all',
            value === option.hours
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-gray-200 hover:border-gray-300 text-gray-600'
          )}
        >
          <span className="block">{option.label}</span>
          {option.recommended && (
            <span className="text-xs text-gray-400 font-normal">Recommended</span>
          )}
        </button>
      ))}
    </div>
  );
}

// Suggested skills
function SuggestedSkills({ onSelect }: { onSelect: (skill: string) => void }) {
  const suggestions = [
    'Python Basics',
    'Automate tasks with AI',
    'AI-powered productivity workflows',
    'Web Development',
    'Data Analysis',
    'Machine Learning',
    'JavaScript',
    'React',
    'SQL',
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((skill) => (
        <button
          key={skill}
          type="button"
          onClick={() => onSelect(skill)}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-sm transition-colors"
        >
          {skill}
        </button>
      ))}
    </div>
  );
}

export function StartPage() {
  const navigate = useNavigate();
  const { createSession, isLoading, error, clearError } = useSessionStore();
  const { addSystemMessage } = useCompanionStore();

  const [skillName, setSkillName] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [hoursPerDay, setHoursPerDay] = useState(1);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>(SkillLevel.BEGINNER);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim()) return;

    clearError();
    setWarnings([]);
    setIsGenerating(true);

    try {
      await createSession({
        skillName,
        durationDays,
        hoursPerDay,
        skillLevel,
      });

      // Celebrate!
      addSystemMessage(
        `🎉 Your ${skillName} curriculum is ready! Let's start learning!`,
        'celebratory'
      );

      navigate('/today');
    } catch (err: any) {
      setIsGenerating(false);
      if (err.response?.data?.warnings) {
        setWarnings(err.response.data.warnings);
      }
    }
  };

  // Show loading screen when generating
  if (isGenerating) {
    return <GeneratingScreen skillName={skillName} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header with Flexi */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full 
                         bg-gradient-to-br from-brand-400 to-brand-500 mb-4">
            <span className="text-4xl">🦊</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            What would you like to learn?
          </h1>
          <p className="text-gray-600">
            Tell me what skill you want to master, and I'll create a personalized curriculum for you.
          </p>
        </motion.div>

        <Card className="p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Skill name input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                What do you want to learn?
              </label>
              <div className="relative">
                <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-400" />
                <input
                  type="text"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  placeholder="e.g., Build AI agents with Python"
                  required
                  className="w-full pl-12 pr-4 py-4 text-lg border border-gray-300 rounded-xl 
                           focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none
                           transition-colors"
                />
              </div>
              <div className="mt-3">
                <p className="text-sm text-gray-500 mb-2">Popular choices:</p>
                <SuggestedSkills onSelect={setSkillName} />
              </div>
            </div>

            {/* Skill level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                What's your current level?
              </label>
              <SkillLevelSelector value={skillLevel} onChange={setSkillLevel} />
            </div>

            {/* Duration */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Calendar className="w-4 h-4" />
                How many days?
              </label>
              <DurationSelector value={durationDays} onChange={setDurationDays} />
            </div>

            {/* Hours per day */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Clock className="w-4 h-4" />
                Hours per day 
              </label>
              <HoursSelector value={hoursPerDay} onChange={setHoursPerDay} />
            </div>

            {/* Warnings */}
            <AnimatePresence>
              {warnings.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 bg-amber-50 border border-amber-200 rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800 mb-1">Heads up!</p>
                      <ul className="text-sm text-amber-700 space-y-1">
                        {warnings.map((warning, i) => (
                          <li key={i}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 bg-red-50 border border-red-200 rounded-lg"
                >
                  <p className="text-red-700 text-sm">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <Button
              type="submit"
              size="xl"
              className="w-full"
              disabled={!skillName.trim() || isLoading}
              rightIcon={isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
            >
              {isLoading ? 'Creating your curriculum...' : 'Generate My Curriculum'}
            </Button>

            {/* Info */}
            <p className="text-center text-sm text-gray-500">
              Takes about 10-15 seconds. AI will analyze the skill and create your personalized path.
            </p>
          </form>
        </Card>

        {/* Preview of what they'll get */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8"
        >
          <Card className="p-6 bg-gradient-to-br from-gray-50 to-white">
            <h3 className="font-semibold text-gray-900 mb-4">Your curriculum will include:</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: '📹', text: 'Curated video lessons' },
                { icon: '🧠', text: 'Active recall exercises' },
                { icon: '💻', text: 'Coding challenges' },
                { icon: '🏆', text: 'Boss projects' },
                { icon: '🦊', text: 'AI companion support' },
                { icon: '📊', text: 'Progress tracking' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-gray-700">
                  <span>{item.icon}</span>
                  <span className="text-sm">{item.text}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
