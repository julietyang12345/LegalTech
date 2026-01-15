import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Sparkles, Lock, ChevronDown, Lightbulb } from 'lucide-react';
import { Card, Button, ConfidenceSlider, QuickPick, SentenceComplete, AnimatedReveal } from '@/components/common';
import { StepLayout } from './StepLayout';
import { QuickBoostModal } from './QuickBoostModal';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { sessionService } from '@/services/sessionService';
import { QuotaTier } from '@/types';
import { clsx } from 'clsx';
import type { CurriculumDay, Session, ConceptBoost, FoundationCard } from '@/types';

interface ReflectionStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

export function ReflectionStep({ day, session, onComplete }: ReflectionStepProps) {
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

  // Confused concepts state
  const [confusedConcepts, setConfusedConcepts] = useState<string[]>([]);
  const [showConceptSelector, setShowConceptSelector] = useState(false);

  // Quick Boost state
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [boostLoading, setBoostLoading] = useState(false);
  const [currentBoost, setCurrentBoost] = useState<ConceptBoost | null>(null);
  const [boostCompleted, setBoostCompleted] = useState(false);
  const [boostedConcept, setBoostedConcept] = useState<string | null>(null);

  const { hasTierAccess } = useAuthStore();
  const { updateTaskProgress } = useSessionStore();
  const canGetAIAnalysis = hasTierAccess(QuotaTier.PRO);

  // Get foundation cards for concept selection
  const foundationCards: FoundationCard[] = day.foundationCards || [];

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

  // Toggle concept selection
  const toggleConcept = (concept: string) => {
    setConfusedConcepts((prev) =>
      prev.includes(concept)
        ? prev.filter((c) => c !== concept)
        : [...prev, concept]
    );
  };

  // Show concept selector when user indicates confusion
  const handleFoggySelect = (value: string) => {
    setWhatsFoggy(value);
    setShowFoggyDetails(true);
    if (foundationCards.length > 0 && value !== 'nothing') {
      setShowConceptSelector(true);
    }
  };

  // Generate concept boost
  const handleRequestBoost = async (concept: string) => {
    const card = foundationCards.find((c) => c.concept === concept);
    if (!card) return;

    setBoostLoading(true);
    setShowBoostModal(true);

    try {
      const response = await sessionService.generateConceptBoost(
        session.id,
        day.day,
        concept,
        card.explanation
      );
      setCurrentBoost(response.boost);
    } catch (error) {
      console.error('Failed to generate boost:', error);
    } finally {
      setBoostLoading(false);
    }
  };

  // Handle boost completion
  const handleBoostComplete = () => {
    setBoostCompleted(true);
    setBoostedConcept(confusedConcepts[0] || currentBoost?.concept || null);
    // Remove boosted concept from confused list
    if (currentBoost?.concept) {
      setConfusedConcepts((prev) => prev.filter((c) => c !== currentBoost.concept));
    }
  };

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
      // Save reflection data to backend
      await sessionService.saveReflection(session.id, day.day, {
        confidence: confidence || 3,
        whatClicked: whatClicked || undefined,
        whatsFoggy: whatsFoggy || undefined,
        confusedConcepts: confusedConcepts.length > 0 ? confusedConcepts : undefined,
        lockInSentence: lockInSentence || undefined,
        warmupPlan: warmupPlan || undefined,
        boostCompleted,
        boostConcept: boostedConcept || undefined,
      });

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

  // Show boost offer when user has confusion and hasn't completed a boost yet
  const showBoostOffer =
    !boostCompleted &&
    confusedConcepts.length > 0 &&
    (confidence === null || confidence < 4);

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

      {/* What's foggy - Quick pick with concept selector */}
      <Card>
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">
            What's still confusing? 🌫️
          </h3>
          <QuickPick
            options={foggyOptions}
            selected={whatsFoggy}
            onSelect={handleFoggySelect}
          />

          {/* Concept selector */}
          <AnimatedReveal show={showConceptSelector && foundationCards.length > 0} className="mt-4">
            <p className="text-sm text-gray-600 mb-3">
              Which concepts felt tricky? (Select any that apply)
            </p>
            <div className="space-y-2">
              {foundationCards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => toggleConcept(card.concept)}
                  className={clsx(
                    'w-full text-left p-3 rounded-lg border-2 transition-all',
                    confusedConcepts.includes(card.concept)
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {card.visual && <span className="mr-2">{card.visual}</span>}
                      {card.concept}
                    </span>
                    {confusedConcepts.includes(card.concept) && (
                      <span className="text-amber-600 text-xs font-medium">Selected</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </AnimatedReveal>

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

      {/* Quick Boost offer */}
      <AnimatedReveal show={showBoostOffer}>
        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
          <div className="p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 mb-1">
                  Quick Boost Available
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  We can explain "{confusedConcepts[0]}" from a different angle.
                  Takes about 2 minutes.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleRequestBoost(confusedConcepts[0])}
                    leftIcon={<Sparkles className="w-4 h-4" />}
                  >
                    Yes, help me
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfusedConcepts([])}
                  >
                    Skip for now
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </AnimatedReveal>

      {/* Boost completed notice */}
      {boostCompleted && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-green-50 border-green-200">
            <div className="p-4 text-center">
              <p className="text-sm text-green-700">
                ✓ Quick Boost completed! {boostedConcept && `You reviewed "${boostedConcept}"`}
              </p>
            </div>
          </Card>
        </motion.div>
      )}

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
      {confidence !== null && confidence < 3 && confusedConcepts.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Card className="bg-amber-50 border border-amber-200">
            <div className="p-4 text-center">
              <p className="text-sm text-amber-700">
                🎯 Tomorrow's lesson will include a quick recap of the concepts you found tricky.
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

      {/* Quick Boost Modal */}
      <QuickBoostModal
        isOpen={showBoostModal}
        onClose={() => setShowBoostModal(false)}
        boost={currentBoost}
        isLoading={boostLoading}
        onComplete={handleBoostComplete}
      />
    </StepLayout>
  );
}
