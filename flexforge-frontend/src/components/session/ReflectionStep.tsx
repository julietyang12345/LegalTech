import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Sparkles, Lock, ChevronDown } from 'lucide-react';
import { Card, Button, ConfidenceSlider, QuickPick, SentenceComplete, AnimatedReveal } from '@/components/common';
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
          <AnimatedReveal show={showClickedDetails && !!whatClicked && whatClicked !== 'nothing'} className="mt-4">
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
          </AnimatedReveal>
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
          <AnimatedReveal show={showFoggyDetails && !!whatsFoggy} className="mt-4">
            <input
              type="text"
              value={foggyDetails}
              onChange={(e) => setFoggyDetails(e.target.value)}
              placeholder="Any specific part? (optional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                        focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </AnimatedReveal>
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
          <AnimatedReveal show={!!warmupPlan} className="mt-4">
            <input
              type="text"
              value={warmupCustom}
              onChange={(e) => setWarmupCustom(e.target.value)}
              placeholder="Customize your plan (optional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm
                        focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </AnimatedReveal>
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
