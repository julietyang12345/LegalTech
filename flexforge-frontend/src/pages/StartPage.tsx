import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Clock,
  Calendar,
  AlertTriangle,
  Loader2,
  Search,
  BookOpen,
  CheckCircle,
  Brain,
  Trophy,
  Play,
  RefreshCw,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import { Button, Card, GeneratingScreen, QuotaExceededModal } from '@/components/common';
import { SkillLevel } from '@/types';
import { sessionService, PreviewResponse } from '@/services/sessionService';

// Loading steps for PREVIEW generation (~20-25 seconds)
const PREVIEW_LOADING_STEPS = [
  { icon: Search, text: 'Analyzing your skill...', duration: 5000 },
  { icon: Brain, text: 'Designing learning path...', duration: 7500 },
  { icon: BookOpen, text: 'Planning curriculum...', duration: 6500 },
  { icon: CheckCircle, text: 'Creating your preview...', duration: 4000 },
];

// Preview Screen Component - shows curriculum timeline before user commits
function PreviewScreen({
  preview,
  skillName,
  onStartLearning,
  onRegenerate,
  isStarting,
}: {
  preview: PreviewResponse['preview'];
  skillName: string;
  onStartLearning: () => void;
  onRegenerate: () => void;
  isStarting: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-brand-50 to-gray-50 py-12 px-4"
    >
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full
                         bg-gradient-to-br from-brand-400 to-brand-500 mb-4">
            <span className="text-3xl">🦊</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {preview.title}
          </h1>
          <p className="text-gray-600 max-w-lg mx-auto">
            {preview.description}
          </p>
        </motion.div>

        {/* Final Project Card */}
        <Card className="p-5 mb-6 bg-gradient-to-r from-brand-50 to-focus-50 border-brand-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
              <Trophy className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Final Project</h3>
              <p className="text-sm text-gray-600">{preview.finalProject}</p>
            </div>
          </div>
        </Card>

        {/* Timeline */}
        <Card className="p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-500" />
            Your {preview.days.length}-Day Learning Path
          </h3>

          <div className="space-y-3">
            {preview.days.map((day, index) => (
              <motion.div
                key={day.day}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={clsx(
                  'p-4 rounded-xl border-2 transition-all',
                  day.hasBossProject
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-gray-100 bg-white hover:border-gray-200'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={clsx(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                    day.hasBossProject
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-brand-100 text-brand-700'
                  )}>
                    {day.day}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-gray-900">{day.title}</h4>
                      {day.hasBossProject && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                          Boss Project
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{day.subtitle}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {day.skills.slice(0, 3).map((skill, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-brand-600 mt-2 font-medium">{day.teaser}</p>
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    {day.estimatedMinutes}m
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={onRegenerate}
            disabled={isStarting}
            leftIcon={<RefreshCw className="w-4 h-4" />}
            className="flex-shrink-0"
          >
            Generate New
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={onStartLearning}
            disabled={isStarting}
            rightIcon={isStarting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
          >
            {isStarting ? 'Starting...' : 'Start Learning'}
          </Button>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Day 1 content will be generated when you start your first lesson
        </p>
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

type PagePhase = 'form' | 'generating-preview' | 'preview';

export function StartPage() {
  const navigate = useNavigate();
  const { createSession, isLoading, error, clearError } = useSessionStore();
  const { addSystemMessage } = useCompanionStore();

  const [skillName, setSkillName] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [hoursPerDay, setHoursPerDay] = useState(1);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>(SkillLevel.BEGINNER);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [phase, setPhase] = useState<PagePhase>('form');
  const [previewData, setPreviewData] = useState<PreviewResponse['preview'] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaErrorMessage, setQuotaErrorMessage] = useState<string | undefined>();

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

  // Phase 1: Generate preview (skeleton only)
  const handleGeneratePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim()) return;

    clearError();
    setWarnings([]);
    setPreviewError(null);
    setPhase('generating-preview');

    try {
      const response = await sessionService.generatePreview({
        skillName,
        durationDays,
        hoursPerDay,
        skillLevel,
      });

      setPreviewData(response.preview);
      if (response.warnings) {
        setWarnings(response.warnings);
      }
      setPhase('preview');
    } catch (err: any) {
      setPhase('form');
      if (isQuotaError(err)) {
        setQuotaErrorMessage(err.response?.data?.message);
        setShowQuotaModal(true);
      } else {
        setPreviewError(err.response?.data?.message || err.message || 'Failed to generate preview');
      }
      if (err.response?.data?.warnings) {
        setWarnings(err.response.data.warnings);
      }
    }
  };

  // Phase 2: Create full session after user confirms preview (instant - uses preview curriculum)
  const handleStartLearning = async () => {
    try {
      await createSession({
        skillName,
        durationDays,
        hoursPerDay,
        skillLevel,
        previewCurriculum: previewData, // Pass preview to avoid regeneration
      });

      addSystemMessage(
        `🎉 Your ${skillName} curriculum is ready! Let's start learning!`,
        'celebratory'
      );

      navigate('/today');
    } catch (err: any) {
      if (isQuotaError(err)) {
        setQuotaErrorMessage(err.response?.data?.message);
        setShowQuotaModal(true);
      } else {
        setPreviewError(err.response?.data?.message || err.message || 'Failed to start session');
      }
    }
  };

  // Regenerate: go back to form
  const handleRegenerate = () => {
    setPreviewData(null);
    setPhase('form');
  };

  // Show preview loading screen
  if (phase === 'generating-preview') {
    return (
      <GeneratingScreen
        steps={PREVIEW_LOADING_STEPS}
        title="Generating your preview"
        subtitle="Creating a learning path outline..."
        timeEstimate="This takes about 10-15 seconds"
      />
    );
  }


  // Show preview screen
  if (phase === 'preview' && previewData) {
    return (
      <PreviewScreen
        preview={previewData}
        skillName={skillName}
        onStartLearning={handleStartLearning}
        onRegenerate={handleRegenerate}
        isStarting={isLoading}
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
          <form onSubmit={handleGeneratePreview} className="space-y-8">
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
              {(error || previewError) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 bg-red-50 border border-red-200 rounded-lg"
                >
                  <p className="text-red-700 text-sm">{error || previewError}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <Button
              type="submit"
              size="xl"
              className="w-full"
              disabled={!skillName.trim() || phase !== 'form'}
              rightIcon={<Sparkles className="w-5 h-5" />}
            >
              Preview Curriculum
            </Button>

            {/* Info */}
            <p className="text-center text-sm text-gray-500">
              See your learning path in ~10 seconds, then decide to start
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

      {/* Quota Exceeded Modal */}
      <QuotaExceededModal
        isOpen={showQuotaModal}
        onClose={() => setShowQuotaModal(false)}
        message={quotaErrorMessage}
      />
    </div>
  );
}
