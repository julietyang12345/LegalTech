import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Clock,
  Calendar,
  AlertTriangle,
  Search,
  BookOpen,
  CheckCircle,
  Brain,
  RotateCcw,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import { Button, Card, GeneratingScreen, QuotaExceededModal } from '@/components/common';
import { SkillLevel } from '@/types';
import { onboardingService } from '@/services/onboardingService';

// Loading steps for curriculum generation (~50-60 seconds, +20s for >7 days)
const getGenerationLoadingSteps = (days: number) => [
  { icon: Search, text: 'Analyzing your skill...', duration: 5000 },
  { icon: Brain, text: 'Designing learning path...', duration: 8000 },
  { icon: BookOpen, text: 'Building curriculum...', duration: days > 7 ? 60000 : 40000 },
  { icon: CheckCircle, text: 'Finalizing your plan...', duration: 5000 },
];

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
      description: 'New to this',
    },
    {
      value: SkillLevel.INTERMEDIATE,
      emoji: '🌿',
      label: 'Intermediate',
      description: 'Know basics',
    },
    {
      value: SkillLevel.ADVANCED,
      emoji: '🌳',
      label: 'Advanced',
      description: 'Master it',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {levels.map((level) => (
        <button
          key={level.value}
          type="button"
          onClick={() => onChange(level.value)}
          className={clsx(
            'p-3 sm:p-4 rounded-xl transition-all',
            'flex flex-col items-center justify-center text-center min-h-[88px]',
            value === level.value
              ? 'border-[3px] border-brand-500 bg-brand-50 shadow-sm'
              : 'border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          )}
        >
          <span className="text-2xl sm:text-3xl mb-1">{level.emoji}</span>
          <span className={clsx(
            'font-medium text-xs sm:text-sm leading-tight',
            value === level.value ? 'text-brand-700' : 'text-gray-900'
          )}>
            {level.label}
          </span>
          <span className="text-[10px] sm:text-xs text-gray-500 leading-tight mt-0.5">
            {level.description}
          </span>
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
    { days: 3, label: '3', sublabel: 'days', description: 'Quick' },
    { days: 5, label: '5', sublabel: 'days', description: 'Solid' },
    { days: 7, label: '7', sublabel: 'days', description: 'Best', recommended: true },
    { days: 14, label: '14', sublabel: 'days', description: 'Deep' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {options.map((option) => (
        <button
          key={option.days}
          type="button"
          onClick={() => onChange(option.days)}
          className={clsx(
            'p-3 rounded-xl transition-all text-center',
            'flex flex-col items-center justify-center min-h-[72px]',
            value === option.days
              ? 'border-[3px] border-brand-500 bg-brand-50 shadow-sm'
              : 'border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50',
            option.recommended && value !== option.days && 'ring-2 ring-focus-200'
          )}
        >
          <span className={clsx(
            'font-bold text-lg sm:text-xl leading-none',
            value === option.days ? 'text-brand-700' : 'text-gray-900'
          )}>
            {option.label}
          </span>
          <span className="text-[10px] text-gray-400 leading-tight">{option.sublabel}</span>
          <span className={clsx(
            'text-[10px] mt-1 leading-tight',
            value === option.days ? 'text-brand-600' : 'text-gray-500'
          )}>
            {option.description}
          </span>
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
    { hours: 0.5, label: '30m', recommended: false },
    { hours: 0.75, label: '45m', recommended: false },
    { hours: 1, label: '1h', recommended: true },
    { hours: 1.5, label: '1.5h', recommended: true },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {options.map((option) => (
        <button
          key={option.hours}
          type="button"
          onClick={() => onChange(option.hours)}
          className={clsx(
            'py-3 px-2 rounded-xl transition-all text-center',
            'flex flex-col items-center justify-center min-h-[60px]',
            value === option.hours
              ? 'border-[3px] border-brand-500 bg-brand-50 shadow-sm'
              : 'border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          )}
        >
          <span className={clsx(
            'font-semibold text-sm sm:text-base',
            value === option.hours ? 'text-brand-700' : 'text-gray-700'
          )}>
            {option.label}
          </span>
          {option.recommended && (
            <span className="text-[10px] text-gray-400 font-normal mt-0.5">Best</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function StartPage() {
  const navigate = useNavigate();
  const { createSession, isLoading, error, clearError } = useSessionStore();
  const { addSystemMessage } = useCompanionStore();
  const { user } = useAuthStore();

  const [skillName, setSkillName] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [hoursPerDay, setHoursPerDay] = useState(1);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>(SkillLevel.BEGINNER);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaErrorMessage, setQuotaErrorMessage] = useState<string | undefined>();

  // Reset and go back to onboarding
  const handleReset = async () => {
    try {
      await onboardingService.reset();
      navigate('/onboarding');
    } catch (error) {
      console.error('Failed to reset onboarding:', error);
      // Still navigate even if reset fails
      navigate('/onboarding');
    }
  };

  // Pre-fill from onboarding preferences
  useEffect(() => {
    const prefs = user?.preferences?.learner;
    if (prefs?.selectedDirection && !skillName) {
      setSkillName(prefs.selectedDirection);
    }
    // Map familiarity to skill level
    if (prefs?.familiarity && !skillName) {
      const familiarityMap: Record<string, SkillLevel> = {
        new: SkillLevel.BEGINNER,
        know_basics: SkillLevel.INTERMEDIATE,
        skilled: SkillLevel.ADVANCED,
      };
      if (familiarityMap[prefs.familiarity]) {
        setSkillLevel(familiarityMap[prefs.familiarity]);
      }
    }
    // Map session length to hours per day
    if (prefs?.sessionLength && !skillName) {
      const sessionMap: Record<string, number> = {
        short: 0.5,   // <30 min → 0.5 hours
        medium: 1,    // 30-60 min → 1 hour
        long: 1.5,    // >1 hour → 1.5 hours
      };
      if (sessionMap[prefs.sessionLength]) {
        setHoursPerDay(sessionMap[prefs.sessionLength]);
      }
    }
  }, [user]);

  // Helper to check if error is a quota error
  const isQuotaError = (error: any): boolean => {
    const status = error?.response?.status;
    const message = error?.response?.data?.message?.toLowerCase() || '';
    return status === 403 && (
      message.includes('quota') ||
      message.includes('exceeded') ||
      message.includes('limit') ||
      message.includes('upgrade')
    );
  };

  // Create session and show curriculum overview
  const handleStartLearning = async (e: React.FormEvent) => {
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

      addSystemMessage(
        `🎉 Your ${skillName} curriculum is ready! Here's your learning plan.`,
        'celebratory'
      );

      // Navigate to plan page to show curriculum overview
      navigate('/plan');
    } catch (err: any) {
      setIsGenerating(false);
      if (isQuotaError(err)) {
        setQuotaErrorMessage(err.response?.data?.message);
        setShowQuotaModal(true);
      }
      if (err.response?.data?.warnings) {
        setWarnings(err.response.data.warnings);
      }
    }
  };

  // Show loading screen while generating
  if (isGenerating) {
    return (
      <GeneratingScreen
        steps={getGenerationLoadingSteps(durationDays)}
        title="Creating your curriculum"
        subtitle={`Building a personalized ${skillName} learning path...`}
        timeEstimate={durationDays > 7 ? "This takes about 70-80 seconds" : "This takes about 50-60 seconds"}
      />
    );
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
          <form onSubmit={handleStartLearning} className="space-y-8">
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
              rightIcon={<Sparkles className="w-5 h-5" />}
            >
              Build My Learning Path
            </Button>

            {/* Start Over */}
            <div className="pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleReset}
                className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1.5 mx-auto transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Start over from the beginning
              </button>
            </div>
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

      {/* Quota Exceeded Modal */}
      <QuotaExceededModal
        isOpen={showQuotaModal}
        onClose={() => setShowQuotaModal(false)}
        message={quotaErrorMessage}
      />
    </div>
  );
}
