import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Sparkles, Lock, ChevronDown, Check } from 'lucide-react';
import { Card, Button, ConfidenceSlider } from '@/components/common';
import { StepLayout } from './StepLayout';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { QuotaTier } from '@/types';
import { clsx } from 'clsx';
import type { CurriculumDay, Session } from '@/types';

interface ReflectionStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

// Quick-pick option component
interface QuickPickProps {
  options: Array<{ emoji: string; label: string; value: string }>;
  selected: string | null;
  onSelect: (value: string) => void;
  columns?: 2 | 4;
}

function QuickPick({ options, selected, onSelect, columns = 2 }: QuickPickProps) {
  return (
    <div className={clsx(
      'grid gap-2',
      columns === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
    )}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={clsx(
            'p-3 rounded-xl border-2 text-left transition-all flex items-center gap-2',
            selected === option.value
              ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          )}
        >
          <span className="text-xl">{option.emoji}</span>
          <span className={clsx(
            'text-sm font-medium',
            selected === option.value ? 'text-brand-700' : 'text-gray-700'
          )}>
            {option.label}
          </span>
          {selected === option.value && (
            <Check className="w-4 h-4 text-brand-500 ml-auto" />
          )}
        </button>
      ))}
    </div>
  );
}

// Sentence completion component
interface SentenceCompleteProps {
  suggestions: string[];
  value: string;
  onChange: (value: string) => void;
  prefix: string;
}

function SentenceComplete({ suggestions, value, onChange, prefix }: SentenceCompleteProps) {
  const [showCustom, setShowCustom] = useState(false);
  const isCustom = value && !suggestions.includes(value);

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600 mb-3">{prefix}</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => {
              onChange(suggestion);
              setShowCustom(false);
            }}
            className={clsx(
              'px-3 py-2 rounded-lg text-sm transition-all',
              value === suggestion
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {suggestion}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(true)}
          className={clsx(
            'px-3 py-2 rounded-lg text-sm transition-all',
            isCustom
              ? 'bg-brand-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          ✏️ Custom...
        </button>
      </div>

      <AnimatePresence>
        {(showCustom || isCustom) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <input
              type="text"
              value={isCustom ? value : ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Type your own..."
              className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm
                        focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              autoFocus
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ReflectionStep({ day, onComplete }: ReflectionStepProps) {
  // State for each reflection section
  const [confidence, setConfidence] = useState<number | null>(null);
  const [whatClicked, setWhatClicked] = useState<string | null>(null);
  const [whatClickedDetails, setWhatClickedDetails] = useState('');
  const [showClickedDetails, setShowClickedDetails] = useState(false);

  const [whatsFoggy, setWhatsFoggy] = useState<string | null>(null);
  const [foggyDetails, setFoggyDetails] = useState('');
  const [showFoggyDetails, setShowFoggyDetails] = useState(false);

  const [lockInSentence, setLockInSentence] = useState('');

  const [warmupPlan, setWarmupPlan] = useState<string | null>(null);
  const [warmupCustom, setWarmupCustom] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  const { hasTierAccess } = useAuthStore();
  const { updateTaskProgress } = useSessionStore();
  const canGetAIAnalysis = hasTierAccess(QuotaTier.PRO);

  // Quick-pick options
  const clickedOptions = [
    { emoji: '🔵', label: 'The main concept', value: 'concept' },
    { emoji: '🟢', label: 'How to apply it', value: 'application' },
    { emoji: '🟡', label: 'Why it works', value: 'understanding' },
    { emoji: '🔴', label: 'Nothing yet', value: 'nothing' },
  ];

  const foggyOptions = [
    { emoji: '🤔', label: 'When to use it', value: 'when' },
    { emoji: '⚙️', label: 'How it works', value: 'how' },
    { emoji: '🧩', label: 'How parts connect', value: 'connection' },
    { emoji: '😵', label: 'Everything', value: 'everything' },
  ];

  const warmupOptions = [
    { emoji: '▶️', label: "Replay today's example", value: 'replay' },
    { emoji: '✍️', label: "Edit yesterday's code", value: 'edit' },
    { emoji: '🧠', label: 'Review key idea', value: 'review' },
    { emoji: '🚀', label: 'Jump into next lesson', value: 'jump' },
  ];

  // Dynamic sentence suggestions based on day content
  const sentenceSuggestions = [
    `${day.objectives?.[0] || 'This concept'} helps me...`,
    `The key pattern is...`,
    `I can use this when...`,
    `This connects to yesterday by...`,
  ];

  const handleAIAnalysis = async () => {
    if (!canGetAIAnalysis) return;

    setIsAnalyzing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));

    setAiAnalysis(
      confidence && confidence >= 4
        ? "🎯 Great confidence! You've got a solid grasp of today's concepts. Tomorrow, try explaining this to someone else to cement it!"
        : confidence && confidence < 3
        ? "💪 It's okay to feel uncertain - that's part of learning! Focus your warm-up on the foggy areas. Consider re-watching the video section."
        : "👍 Good self-awareness! Your reflection shows you're thinking deeply. Keep building on what clicked!"
    );
    setIsAnalyzing(false);
  };

  const handleComplete = async () => {
    try {
      await updateTaskProgress(`day${day.day}-reflection`, {
        completed: true,
        confidenceScore: confidence || 3,
      });
      onComplete();
    } catch (error) {
      console.error('Failed to save reflection:', error);
      onComplete(); // Still proceed
    }
  };

  // Minimum completion: confidence + one of the quick picks
  const canComplete = confidence !== null && (whatClicked !== null || warmupPlan !== null);

  return (
    <StepLayout
      icon={BookOpen}
      iconGradient="from-indigo-400 to-indigo-500"
      title="Quick Reflection"
      subtitle="Help future you by locking in what matters"
    >
      {/* Confidence slider */}
      <Card>
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">
            How confident do you feel? 🎯
          </h3>
          <ConfidenceSlider
            value={confidence}
            onChange={setConfidence}
          />
        </div>
      </Card>

      {/* What clicked - Quick pick */}
      <Card>
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">
            What clicked today? 💡
          </h3>
          <QuickPick
            options={clickedOptions}
            selected={whatClicked}
            onSelect={(v) => {
              setWhatClicked(v);
              if (v !== 'nothing') setShowClickedDetails(true);
            }}
          />

          {/* Optional expand */}
          <AnimatePresence>
            {showClickedDetails && whatClicked && whatClicked !== 'nothing' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4"
              >
                <button
                  onClick={() => setShowClickedDetails(!showClickedDetails)}
                  className="text-sm text-gray-500 flex items-center gap-1 mb-2"
                >
                  <ChevronDown className={clsx(
                    'w-4 h-4 transition-transform',
                    whatClickedDetails && 'rotate-180'
                  )} />
                  Add details (optional)
                </button>
                <input
                  type="text"
                  value={whatClickedDetails}
                  onChange={(e) => setWhatClickedDetails(e.target.value)}
                  placeholder="What specifically made sense?"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                            focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>

      {/* What's foggy - Quick pick */}
      <Card>
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">
            What's still confusing? 🌫️
          </h3>
          <QuickPick
            options={foggyOptions}
            selected={whatsFoggy}
            onSelect={(v) => {
              setWhatsFoggy(v);
              setShowFoggyDetails(true);
            }}
          />

          {/* Optional details */}
          <AnimatePresence>
            {showFoggyDetails && whatsFoggy && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4"
              >
                <input
                  type="text"
                  value={foggyDetails}
                  onChange={(e) => setFoggyDetails(e.target.value)}
                  placeholder="Any specific part? (optional)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                            focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>

      {/* Lock it in - Sentence completion */}
      <Card>
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-2">
            🧠 Lock it in
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            What's the key idea you don't want to forget?
          </p>
          <SentenceComplete
            prefix="Today I learned that..."
            suggestions={sentenceSuggestions}
            value={lockInSentence}
            onChange={setLockInSentence}
          />
        </div>
      </Card>

      {/* Tomorrow's warm-up - Quick pick */}
      <Card>
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">
            Tomorrow's 5-min warm-up 🌅
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Set yourself up for an easy start
          </p>
          <QuickPick
            options={warmupOptions}
            selected={warmupPlan}
            onSelect={setWarmupPlan}
          />

          {/* Optional customize */}
          <AnimatePresence>
            {warmupPlan && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4"
              >
                <input
                  type="text"
                  value={warmupCustom}
                  onChange={(e) => setWarmupCustom(e.target.value)}
                  placeholder="Customize your plan (optional)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                            focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>

      {/* AI Analysis (PRO feature) */}
      <div className="space-y-3">
        {canGetAIAnalysis ? (
          <>
            <Button
              variant="secondary"
              onClick={handleAIAnalysis}
              isLoading={isAnalyzing}
              disabled={!canComplete}
              leftIcon={<Sparkles className="w-4 h-4" />}
              className="w-full"
            >
              Get AI Insights
            </Button>

            {aiAnalysis && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="bg-indigo-50 border border-indigo-200">
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                      <p className="text-indigo-700">{aiAnalysis}</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400 p-4">
            <Lock className="w-4 h-4" />
            <span>AI Insights (PRO feature)</span>
          </div>
        )}
      </div>

      {/* Auto-adjust notice */}
      {confidence !== null && confidence < 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Card className="bg-amber-50 border border-amber-200">
            <div className="p-4 text-center">
              <p className="text-sm text-amber-700">
                🎯 We'll add extra practice tomorrow to reinforce today's concepts.
              </p>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Complete button */}
      <div className="pt-4">
        <Button
          size="lg"
          className="w-full"
          onClick={handleComplete}
          disabled={!canComplete}
        >
          {canComplete ? 'Complete Day 🎉' : 'Answer a few questions first'}
        </Button>
      </div>

      {/* Micro footer */}
      <p className="text-center text-xs text-gray-400">
        Quick reflections → 23% better retention
      </p>
    </StepLayout>
  );
}
