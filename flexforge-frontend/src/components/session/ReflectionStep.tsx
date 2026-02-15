import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Sparkles, Lightbulb, Target, Plus, X, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, Button, ConfidenceSlider, QuickPick, AnimatedReveal } from '@/components/common';
import { StepLayout } from './StepLayout';
import { QuickBoostModal } from './QuickBoostModal';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { sessionService } from '@/services/sessionService';
import { GoalType, QuotaTier } from '@/types';
import { clsx } from 'clsx';
import type { CurriculumDay, Session, ConceptBoost, ScoringResult } from '@/types';
import { extractConceptsFromTask1 } from '@/utils/extractConceptsFromTask1';
import { getTrainingConfig, isTrainingMode } from '@/config/training-configs';

interface ReflectionStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

export function ReflectionStep({ day, session, onComplete }: ReflectionStepProps) {
  const { hasTierAccess } = useAuthStore();
  const { updateTaskProgress, updateSession, saveTaskProgress, getTaskProgress } = useSessionStore();
  const canGetAIAnalysis = hasTierAccess(QuotaTier.PRO);

  // Load saved progress
  const savedProgress = getTaskProgress(day.day, 'reflection');

  // State for each reflection section - initialize from saved progress
  const [confidence, setConfidence] = useState<number | null>(
    savedProgress?.answers?.confidence as number | null ?? null
  );
  const [whatClicked, setWhatClicked] = useState<string | null>(
    savedProgress?.answers?.whatClicked as string | null ?? null
  );
  const [_whatClickedDetails, _setWhatClickedDetails] = useState('');
  const [_showClickedDetails, _setShowClickedDetails] = useState(false);

  const [whatsFoggy, setWhatsFoggy] = useState<string | null>(
    savedProgress?.answers?.whatsFoggy as string | null ?? null
  );
  const [foggyDetails, setFoggyDetails] = useState('');
  const [showFoggyDetails, setShowFoggyDetails] = useState(
    !!(savedProgress?.answers?.whatsFoggy)
  );

  const [_lockInSentence, _setLockInSentence] = useState('');

  const [warmupPlan, setWarmupPlan] = useState<string | null>(
    savedProgress?.answers?.warmupPlan as string | null ?? null
  );
  const [warmupCustom, setWarmupCustom] = useState('');

  const [_isAnalyzing, _setIsAnalyzing] = useState(false);
  const [_aiAnalysis, _setAiAnalysis] = useState<string | null>(null);

  // Confused concepts state
  const [confusedConcepts, setConfusedConcepts] = useState<string[]>(
    (savedProgress?.answers?.confusedConcepts as unknown as string[]) || []
  );
  const [showConceptSelector, setShowConceptSelector] = useState(
    !!((savedProgress?.answers?.confusedConcepts as unknown as string[])?.length)
  );

  // Quick Boost state
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [boostLoading, setBoostLoading] = useState(false);
  const [currentBoost, setCurrentBoost] = useState<ConceptBoost | null>(null);
  const [boostCompleted, setBoostCompleted] = useState(false);
  const [boostedConcept, setBoostedConcept] = useState<string | null>(null);

  // Improvement areas state (for shaping future days)
  const [moreOfInput, setMoreOfInput] = useState('');
  const [lessOfInput, setLessOfInput] = useState('');
  const [moreOfAreas, setMoreOfAreas] = useState<string[]>(session.improvementAreas || []);
  const [lessOfAreas, setLessOfAreas] = useState<string[]>([]);

  // Save progress when state changes
  useEffect(() => {
    saveTaskProgress(day.day, 'reflection', {
      answers: {
        confidence: confidence as unknown as number | null,
        whatClicked: whatClicked as unknown as number | null,
        whatsFoggy: whatsFoggy as unknown as number | null,
        warmupPlan: warmupPlan as unknown as number | null,
        confusedConcepts: confusedConcepts as unknown as number | null,
      },
      currentIndex: 0,
      showResults: false,
    });
  }, [confidence, whatClicked, whatsFoggy, warmupPlan, confusedConcepts, day.day, saveTaskProgress]);

  // Get concepts from task1 sections for concept selection (or fallback to foundationCards)
  const conceptNames = extractConceptsFromTask1(day.task1, day);

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
  const _sentenceSuggestions = [
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
    if (conceptNames.length > 0 && value !== 'nothing') {
      setShowConceptSelector(true);
    }
  };

  // Generate concept boost
  const handleRequestBoost = async (concept: string) => {
    setBoostLoading(true);
    setShowBoostModal(true);

    try {
      const response = await sessionService.generateConceptBoost(
        session.id,
        day.day,
        concept,
        '' // Explanation context not available from task1 concept names
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

  // Improvement areas handlers
  const handleAddMoreOf = () => {
    const trimmed = moreOfInput.trim();
    if (trimmed && !moreOfAreas.includes(trimmed)) {
      setMoreOfAreas([...moreOfAreas, trimmed]);
      setMoreOfInput('');
    }
  };

  const handleAddLessOf = () => {
    const trimmed = lessOfInput.trim();
    if (trimmed && !lessOfAreas.includes(trimmed)) {
      setLessOfAreas([...lessOfAreas, trimmed]);
      setLessOfInput('');
    }
  };

  const handleRemoveMoreOf = (area: string) => {
    setMoreOfAreas(moreOfAreas.filter(a => a !== area));
  };

  const handleRemoveLessOf = (area: string) => {
    setLessOfAreas(lessOfAreas.filter(a => a !== area));
  };

  const _handleAIAnalysis = async () => {
    if (!canGetAIAnalysis) return;

    _setIsAnalyzing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));

    _setAiAnalysis(
      confidence && confidence >= 4
        ? "🎯 Great confidence! You've got a solid grasp of today's concepts. Tomorrow, try explaining this to someone else to cement it!"
        : confidence && confidence < 3
        ? "💪 It's okay to feel uncertain - that's part of learning! Focus your warm-up on the foggy areas. Consider re-watching the video section."
        : "👍 Good self-awareness! Your reflection shows you're thinking deeply. Keep building on what clicked!"
    );
    _setIsAnalyzing(false);
  };

  const handleComplete = async () => {
    try {
      // Save reflection data to backend
      await sessionService.saveReflection(session.id, day.day, {
        confidence: confidence || 3,
        whatClicked: whatClicked || undefined,
        whatsFoggy: whatsFoggy || undefined,
        confusedConcepts: confusedConcepts.length > 0 ? confusedConcepts : undefined,
        lockInSentence: _lockInSentence || undefined,
        warmupPlan: warmupPlan || undefined,
        boostCompleted,
        boostConcept: boostedConcept || undefined,
      });

      // Save improvement areas to session if changed
      const improvementAreasChanged = JSON.stringify(moreOfAreas) !== JSON.stringify(session.improvementAreas || []);

      if (improvementAreasChanged) {
        await updateSession(session.id, {
          improvementAreas: moreOfAreas,
        });
      }

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

  // Minimum completion: answer what's foggy, what clicked, or shape future days
  const canComplete = whatsFoggy !== null || whatClicked !== null || moreOfAreas.length > 0 || lessOfAreas.length > 0;

  // Show boost offer when user has confusion and hasn't completed a boost yet
  const showBoostOffer =
    !boostCompleted &&
    confusedConcepts.length > 0 &&
    (confidence === null || confidence < 4);

  // Training mode config
  const trainingConfig = getTrainingConfig(session.goalType);
  const isTraining = isTrainingMode(session.goalType);
  const scoringType = trainingConfig.scoringType;

  // Training mode labels
  const clickedLabel = session.goalType === GoalType.LANGUAGE
    ? 'What phrase felt most natural? 🗣️'
    : session.goalType === GoalType.PROJECT || session.goalType === GoalType.AI_BUILDER
    ? 'What did you build/apply? 🔧'
    : 'What clicked today? 💡';

  const foggyLabel = session.goalType === GoalType.LANGUAGE
    ? 'What would you say differently? 🤔'
    : session.goalType === GoalType.PROJECT || session.goalType === GoalType.AI_BUILDER
    ? 'What blocked you? 🧱'
    : "What's still confusing? 🌫️";

  const reflectionTitle = isTraining
    ? trainingConfig.stepLabels?.reflection || 'Reflect'
    : 'Quick Reflection';

  // Scoring state for interview/project/AI Builder modes
  const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null);
  const [isScoringLoading, setIsScoringLoading] = useState(false);

  // Fetch scoring results for modes that support it
  useEffect(() => {
    if (scoringType === 'none' || !session.goalType) return;

    // Check if attempt data exists (from TimedWorkspace or task completion)
    const attemptProgress = getTaskProgress(day.day, 'timedAttempt');
    const attempt = attemptProgress?.answers?.attempt as string | undefined;
    const timeSpent = Number(attemptProgress?.answers?.timeSpent) || 0;

    if (!attempt || scoringResult) return;

    // Start scoring via POST with SSE streaming
    setIsScoringLoading(true);
    fetch(`/api/v1/sessions/${session.id}/days/${day.day}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ attempt, timeSpent: timeSpent || 0 }),
    }).then(async (response) => {
      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.dimensions || data.weaknesses || data.feedback) {
                setScoringResult(data);
                setIsScoringLoading(false);
              }
            } catch {}
          }
        }
      }
      setIsScoringLoading(false);
    }).catch(() => setIsScoringLoading(false));
  }, [scoringType, session.goalType, session.id, day.day]);

  return (
    <StepLayout
      icon={BookOpen}
      iconGradient="from-indigo-400 to-indigo-500"
      title={reflectionTitle}
      subtitle="Help future you by locking in what matters"
    >
      {/* Scoring/Feedback section for training modes */}
      {scoringType !== 'none' && (
        <Card className={clsx('border-2', scoringType === 'rubric' ? 'border-brand-200' : 'border-amber-200')}>
          <div className="p-6">
            <h3 className="font-semibold text-content mb-4">
              {scoringType === 'rubric' ? 'Performance Feedback 📊' : 'Build Feedback 🔍'}
            </h3>
            {isScoringLoading ? (
              <div className="flex items-center gap-3 text-content-secondary">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Sparkles className={clsx('w-5 h-5', scoringType === 'rubric' ? 'text-brand-500' : 'text-amber-500')} />
                </motion.div>
                <span>{scoringType === 'rubric' ? 'Analyzing your attempt...' : 'Reviewing your work...'}</span>
              </div>
            ) : scoringResult ? (
              <div className="space-y-4">
                {/* Dimension scores (rubric only) */}
                {scoringResult.dimensions && scoringResult.dimensions.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {scoringResult.dimensions.map((dim, i) => (
                      <div key={i} className="bg-surface-secondary rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-content">{dim.name}</span>
                          <span className={clsx('text-lg font-bold', {
                            'text-green-600': dim.score >= 4,
                            'text-amber-600': dim.score === 3,
                            'text-red-500': dim.score <= 2,
                          })}>{dim.score}/5</span>
                        </div>
                        <p className="text-xs text-content-tertiary">{dim.feedback}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Strengths */}
                {scoringResult.strengths && scoringResult.strengths.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-green-600 mb-2">
                      {scoringType === 'rubric' ? 'Strengths' : 'What went well'}
                    </h4>
                    <ul className="space-y-1">
                      {scoringResult.strengths.map((s, i) => (
                        <li key={i} className="text-sm text-content-secondary flex items-start gap-2">
                          <span className="text-green-500 mt-0.5">✓</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Gaps (rubric) / Weaknesses (feedback) */}
                {((scoringResult.gaps && scoringResult.gaps.length > 0) ||
                  (scoringResult.weaknesses && scoringResult.weaknesses.length > 0)) && (
                  <div>
                    <h4 className={clsx('text-sm font-medium mb-2', scoringType === 'rubric' ? 'text-red-500' : 'text-amber-600')}>
                      {scoringType === 'rubric' ? 'Areas to improve' : 'What to improve'}
                    </h4>
                    <ul className="space-y-1">
                      {(scoringResult.gaps || scoringResult.weaknesses || []).map((item, i) => (
                        <li key={i} className="text-sm text-content-secondary flex items-start gap-2">
                          <span className={clsx('mt-0.5', scoringType === 'rubric' ? 'text-red-400' : 'text-amber-500')}>→</span> {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Micro-fixes (rubric) / Suggestions (feedback) */}
                {((scoringResult.microFixes && scoringResult.microFixes.length > 0) ||
                  (scoringResult.suggestions && scoringResult.suggestions.length > 0)) && (
                  <div className={clsx('rounded-lg p-3 border', scoringType === 'rubric' ? 'bg-brand-50 border-brand-100' : 'bg-blue-50 border-blue-100')}>
                    <h4 className={clsx('text-sm font-medium mb-2', scoringType === 'rubric' ? 'text-brand-700' : 'text-blue-700')}>
                      {scoringType === 'rubric' ? 'Quick Fixes' : 'Suggestions'}
                    </h4>
                    <ul className="space-y-1">
                      {(scoringResult.microFixes || scoringResult.suggestions || []).map((item, i) => (
                        <li key={i} className={clsx('text-sm', scoringType === 'rubric' ? 'text-brand-600' : 'text-blue-600')}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Overall feedback */}
                {scoringResult.feedback && (
                  <p className="text-sm text-content-secondary italic border-t border-border pt-3">
                    {scoringResult.feedback}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-content-tertiary">
                {scoringType === 'rubric'
                  ? 'Complete the timed attempt to receive scoring feedback.'
                  : 'Feedback will appear here after you complete the task.'}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* What clicked - Quick pick */}
      <Card>
        <div className="p-6">
          <h3 className="font-medium text-content mb-4">
            {clickedLabel}
          </h3>
          <QuickPick
            options={clickedOptions}
            selected={whatClicked}
            onSelect={setWhatClicked}
          />
        </div>
      </Card>

      {/* What's foggy - Quick pick with concept selector */}
      <Card>
        <div className="p-6">
          <h3 className="font-medium text-content mb-4">
            {foggyLabel}
          </h3>
          <QuickPick
            options={foggyOptions}
            selected={whatsFoggy}
            onSelect={handleFoggySelect}
          />

          {/* Concept selector */}
          <AnimatedReveal show={showConceptSelector && conceptNames.length > 0} className="mt-4">
            <p className="text-sm text-content-secondary mb-3">
              Which concepts felt tricky? (Select any that apply)
            </p>
            <div className="space-y-2">
              {conceptNames.map((concept) => (
                <button
                  key={concept}
                  onClick={() => toggleConcept(concept)}
                  className={clsx(
                    'w-full text-left p-3 rounded-lg border-2 transition-all',
                    confusedConcepts.includes(concept)
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-border hover:border-content-tertiary'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-content-secondary">
                      {concept}
                    </span>
                    {confusedConcepts.includes(concept) && (
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
              className="w-full px-3 py-2 border border-border rounded-lg text-sm
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
                <h3 className="font-medium text-content mb-1">
                  Quick Boost Available
                </h3>
                <p className="text-sm text-content-secondary mb-4">
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

      {/* Shape Future Days - Improvement Areas */}
      <Card className="bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 border-purple-200">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Target className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-content">Shape Future Days</h3>
              <p className="text-sm text-content-secondary">Adjust what upcoming lessons emphasize</p>
            </div>
          </div>

          {/* More of this */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-content-secondary">I want more of...</span>
            </div>
            <p className="text-xs text-content-tertiary mb-2">Topics or skills to emphasize in examples and practice</p>

            {moreOfAreas.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {moreOfAreas.map((area) => (
                  <span
                    key={area}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-sm"
                  >
                    {area}
                    <button
                      onClick={() => handleRemoveMoreOf(area)}
                      className="hover:bg-green-200 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={moreOfInput}
                onChange={(e) => setMoreOfInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMoreOf())}
                placeholder="e.g., real-world examples, hands-on practice..."
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-surface
                          focus:border-purple-400 focus:ring-2 focus:ring-purple-100 focus:outline-none"
              />
              <button
                onClick={handleAddMoreOf}
                disabled={!moreOfInput.trim()}
                className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200
                          disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Less of this */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium text-content-secondary">I want less of...</span>
            </div>
            <p className="text-xs text-content-tertiary mb-2">Topics you're already comfortable with or want to skip</p>

            {lessOfAreas.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {lessOfAreas.map((area) => (
                  <span
                    key={area}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-100 text-orange-700 rounded-full text-sm"
                  >
                    {area}
                    <button
                      onClick={() => handleRemoveLessOf(area)}
                      className="hover:bg-orange-200 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={lessOfInput}
                onChange={(e) => setLessOfInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLessOf())}
                placeholder="e.g., basic theory, tool setup..."
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-surface
                          focus:border-purple-400 focus:ring-2 focus:ring-purple-100 focus:outline-none"
              />
              <button
                onClick={handleAddLessOf}
                disabled={!lessOfInput.trim()}
                className="px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200
                          disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Hint */}
          {(moreOfAreas.length > 0 || lessOfAreas.length > 0) && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-purple-600 mt-4 text-center"
            >
              These preferences will shape Days {day.day + 1}+ content
            </motion.p>
          )}
        </div>
      </Card>

      {/* Tomorrow's warm-up - Quick pick */}
      <Card>
        <div className="p-6">
          <h3 className="font-medium text-content mb-4">
            Tomorrow's 5-min warm-up 🌅
          </h3>
          <p className="text-sm text-content-tertiary mb-4">
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
              className="w-full px-3 py-2 border border-border rounded-lg text-sm
                        focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </AnimatedReveal>
        </div>
      </Card>

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
      <p className="text-center text-xs text-content-tertiary">
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
