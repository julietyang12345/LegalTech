import { useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Brain,
  Send,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle,
  Shield,
  TrendingUp,
  Lightbulb,
  ArrowRight,
  ArrowLeft,
  Search,
  BookOpen,
} from 'lucide-react';
import {
  GoalInputStep,
  DirectionCard,
  DirectionsStep,
  RefinementPanel,
  FeelingStep,
} from '@/components/onboarding';
import { Button, GeneratingScreen } from '@/components/common';
import { onboardingService } from '@/services/onboardingService';
import { sessionService } from '@/services/sessionService';
import { analyticsService } from '@/services/analyticsService';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import { GoalType, SkillLevel } from '@/types';
import type {
  LearningDirection,
  RefinementContext,
  LearnerPrefs,
  CompleteOnboardingDto,
  CreateSessionDto,
  AssessmentScenario,
  GapProfile,
} from '@/types';
import {
  saveLatestAssessment,
  severityConfig,
  getScoreColor,
  getScoreLabel,
} from '@/utils/assessmentUtils';

// Onboarding state machine — dual branch
type OnboardingStep =
  | 'goal_input'          // Both branches start here
  | 'assessing'           // Branch A: loading scenario
  | 'assess_scenario'     // Branch A: scenario + response textarea
  | 'analyzing'           // Branch A: analyzing gaps
  | 'gap_results'         // Branch A: results + mode selection
  | 'generating'          // Branch B: loading directions
  | 'directions'          // Branch B: pick direction
  | 'refinement'          // Branch B: refine directions
  | 'depth'               // Branch B: familiarity + session length
  | 'completing';         // Both: saving prefs → /confirm

const severityIcons = {
  high: AlertTriangle,
  medium: Target,
  low: Shield,
};

const familiarityToSkillLevel: Record<string, SkillLevel> = {
  new: SkillLevel.BEGINNER,
  know_basics: SkillLevel.INTERMEDIATE,
  skilled: SkillLevel.ADVANCED,
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuthStore();
  const { createSession } = useSessionStore();
  const { addSystemMessage } = useCompanionStore();

  // Get pre-filled skill from URL (from showcase page)
  const prefilledSkill = searchParams.get('skill') || '';

  // Track onboarding start time for duration calculation
  const onboardingStartTime = useRef<number>(Date.now());

  // State machine
  const [step, setStep] = useState<OnboardingStep>('goal_input');
  const [branch, setBranch] = useState<'direct' | 'discovery' | null>(null);

  // Shared state
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [goal, setGoal] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Branch B (direct) state
  const [directions, setDirections] = useState<LearningDirection[]>([]);
  const [interpretedGoal, setInterpretedGoal] = useState('');
  const [selectedDirection, setSelectedDirection] = useState<LearningDirection | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>();
  const [refinementContext, setRefinementContext] = useState<RefinementContext | undefined>();

  // Branch A (discovery) state
  const [assessmentSkillName, setAssessmentSkillName] = useState('');
  const [assessmentScenario, setAssessmentScenario] = useState<AssessmentScenario | null>(null);
  const [userResponse, setUserResponse] = useState('');
  const [gapProfile, setGapProfile] = useState<GapProfile | null>(null);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [gapSelectedDirectionId, setGapSelectedDirectionId] = useState<string | null>(null);
  const [gapSelectedLanguage, setGapSelectedLanguage] = useState<string | undefined>();

  // ─── Branch A callbacks ───────────────────────────────────────

  // Primary action → enter discovery branch, use goal text as skill name
  const handleAssess = useCallback(async (goalText: string) => {
    setGoal(goalText);
    setAssessmentSkillName(goalText);
    setBranch('discovery');
    setError(null);
    setStep('assessing');

    try {
      const result = await sessionService.generateAssessment({
        skillName: goalText,
        goalType: goalType ?? undefined,
      });
      setAssessmentScenario(result);
      setStep('assess_scenario');
    } catch (err: any) {
      console.error('Failed to generate assessment:', err);
      setError('Failed to generate assessment. Please try again.');
      setStep('goal_input');
    }
  }, [goalType]);

  // Response submit → analyze gaps
  const handleAssessmentSubmit = useCallback(async () => {
    if (!userResponse.trim() || !assessmentScenario) return;

    setError(null);
    setStep('analyzing');

    try {
      const result = await sessionService.analyzeGaps({
        skillName: assessmentSkillName,
        scenario: assessmentScenario.scenario,
        userResponse: userResponse.trim(),
        goalType: goalType ?? undefined,
      });

      setGapProfile(result.gapProfile);
      saveLatestAssessment(result.gapProfile, assessmentSkillName);

      // Fire direction generation in background while user reviews gap results
      setDirectionsLoading(true);
      onboardingService.generateDirections(assessmentSkillName, undefined, goalType ?? GoalType.CURRICULUM)
        .then(response => {
          setDirections(response.directions);
          setInterpretedGoal(response.interpretedGoal);
        })
        .catch(err => console.error('Failed to generate directions:', err))
        .finally(() => setDirectionsLoading(false));

      setStep('gap_results');
    } catch (err: any) {
      console.error('Failed to analyze gaps:', err);
      setError('Analysis failed. Please try again.');
      setStep('assess_scenario');
    }
  }, [userResponse, assessmentScenario, assessmentSkillName, goalType]);

  // Gap results → user picks a direction → save prefs + generate micro lesson
  const handleDirectionMicroLesson = useCallback(async (direction: LearningDirection, language?: string) => {
    if (!gapProfile) return;

    setSelectedDirection(direction);
    setError(null);
    setStep('completing');

    const durationSeconds = Math.round((Date.now() - onboardingStartTime.current) / 1000);

    const familiarityMap: Record<string, string> = {
      beginner: 'new',
      intermediate: 'know_basics',
      advanced: 'skilled',
    };
    const familiarity = familiarityMap[gapProfile.detectedLevel] || 'know_basics';

    // Project/AI builder goal types → project-style; otherwise → practice (quiz-focused)
    const isProjectGoal = goalType === GoalType.PROJECT || goalType === GoalType.AI_BUILDER;
    const learningStyle = isProjectGoal ? 'projects' : 'practice';

    try {
      // 1. Save onboarding preferences
      const dto: CompleteOnboardingDto = {
        originalGoal: `Assessment: ${assessmentSkillName}`,
        selectedDirection: direction.title,
        selectedDirectionOutcome: direction.outcome,
        directionKeywords: direction.keywords,
        selectedLanguage: language || direction.languageConfig?.recommended,
        contentDepth: 'medium',
        familiarity,
        sessionLength: 'medium',
        learningStyle,
        codeWritingEnabled: false,
        goalType: goalType ?? GoalType.CURRICULUM,
        durationSeconds,
      };

      await onboardingService.completeOnboarding(dto);
      await refreshUser();

      // 2. Estimate days → cap at 3 for micro lessons
      const { data } = await api.post<{ estimatedDaysNeeded: number }>('/curriculum/estimate-days', {
        skillName: assessmentSkillName,
      });
      const days = Math.min(3, data.estimatedDaysNeeded || 3);

      // 3. Create session with gap data + direction info (generates curriculum)
      const sessionDto: CreateSessionDto = {
        skillName: assessmentSkillName,
        durationDays: days,
        hoursPerDay: 1,
        skillLevel: familiarityToSkillLevel[familiarity],
        gapProfile,
        microLessonMode: true,
        goalType: goalType ?? GoalType.CURRICULUM,
      };

      await createSession(sessionDto);

      addSystemMessage(
        `Your targeted ${direction.title} lessons are ready! Let's close those gaps.`,
        'celebratory'
      );

      navigate('/plan', { replace: true });
    } catch (err: any) {
      console.error('Failed to generate curriculum:', err);
      setError(err.response?.data?.message || 'Failed to generate curriculum. Please try again.');
      setStep('gap_results');
    }
  }, [gapProfile, assessmentSkillName, goalType, navigate, refreshUser, createSession, addSystemMessage]);

  // Escape hatch: back to goal_input
  const handleEscapeToGoalInput = useCallback(() => {
    setBranch(null);
    setAssessmentScenario(null);
    setUserResponse('');
    setGapProfile(null);
    setError(null);
    setStep('goal_input');
  }, []);

  // ─── Branch B callbacks ───────────────────────────────────────

  // Step 1: Submit goal → generate directions
  const handleGoalSubmit = useCallback(async (goalText: string) => {
    setGoal(goalText);
    setBranch('direct');
    setError(null);
    setStep('generating');

    analyticsService.onboardingGoalSubmitted(goalText);

    try {
      const response = await onboardingService.generateDirections(goalText, undefined, goalType ?? GoalType.CURRICULUM);
      setDirections(response.directions);
      setInterpretedGoal(response.interpretedGoal);
      setStep('directions');
    } catch (err: any) {
      console.error('Failed to generate directions:', err);
      setError(err.response?.data?.message || 'Failed to generate directions. Please try again.');
      setStep('goal_input');
    }
  }, [goalType]);

  // Step 2: Select direction → go to depth step
  const handleDirectionSelect = useCallback((direction: LearningDirection, language?: string) => {
    setSelectedDirection(direction);

    analyticsService.onboardingDirectionSelected(
      direction.title,
      direction.skillType || 'unknown'
    );

    if (direction.languageConfig) {
      setSelectedLanguage(language || direction.languageConfig.recommended);
    }

    setStep('depth');
  }, []);

  // Step 2b: Refinement → regenerate directions
  const handleRefinementSubmit = useCallback(async (refinement: RefinementContext) => {
    setRefinementContext(refinement);
    setError(null);
    setStep('generating');

    try {
      const response = await onboardingService.generateDirections(goal, refinement, goalType ?? GoalType.CURRICULUM);
      setDirections(response.directions);
      setInterpretedGoal(response.interpretedGoal);
      setStep('directions');
    } catch (err: any) {
      console.error('Failed to regenerate directions:', err);
      setError(err.response?.data?.message || 'Failed to regenerate directions. Please try again.');
      setStep('refinement');
    }
  }, [goal, goalType]);

  // Step 3: Feelings → complete onboarding (Branch B → /confirm)
  const handleFeelingSelect = useCallback(async (
    depth: LearnerPrefs['contentDepth'],
    familiarity: string,
    sessionLength: string,
    learningStyle: 'projects' | 'practice',
    toolPreference: 'any' | 'preferGeneric' | 'genericOnly',
    outputType: CompleteOnboardingDto['outputType'],
    codeWritingEnabled: boolean
  ) => {
    if (!selectedDirection) return;

    analyticsService.onboardingFeelingSubmitted(familiarity, sessionLength);

    setError(null);
    setStep('completing');

    const durationSeconds = Math.round((Date.now() - onboardingStartTime.current) / 1000);

    try {
      const dto: CompleteOnboardingDto = {
        originalGoal: goal,
        selectedDirection: selectedDirection.title,
        selectedDirectionOutcome: selectedDirection.outcome,
        directionKeywords: selectedDirection.keywords,
        contentDepth: depth,
        platformTolerance: toolPreference,
        selectedLanguage: selectedLanguage,
        outputType,
        usageContext: refinementContext?.usageContext,
        familiarity,
        sessionLength,
        learningStyle,
        codeWritingEnabled,
        goalType: goalType ?? GoalType.CURRICULUM,
        durationSeconds,
      };

      await onboardingService.completeOnboarding(dto);
      await refreshUser();

      navigate('/confirm', { replace: true });
    } catch (err: any) {
      console.error('Failed to complete onboarding:', err);
      setError(err.response?.data?.message || 'Failed to save preferences. Please try again.');
      setStep('depth');
    }
  }, [goal, goalType, selectedDirection, selectedLanguage, refinementContext, navigate, refreshUser]);

  // ─── Progress bar (branch-aware) ─────────────────────────────

  const getProgress = () => {
    if (branch === 'discovery') {
      switch (step) {
        case 'goal_input': return 10;
        case 'assessing': return 30;
        case 'assess_scenario': return 50;
        case 'analyzing': return 70;
        case 'gap_results': return 85;
        case 'completing': return 100;
        default: return 0;
      }
    }
    // Branch B (direct) or no branch yet
    switch (step) {
      case 'goal_input': return 15;
      case 'generating': return 35;
      case 'directions': return 55;
      case 'refinement': return 55;
      case 'depth': return 85;
      case 'completing': return 100;
      default: return 0;
    }
  };

  // ─── Gap results derived data ─────────────────────────────────

  const highGaps = gapProfile?.gaps.filter((g) => g.severity === 'high') || [];
  const mediumGaps = gapProfile?.gaps.filter((g) => g.severity === 'medium') || [];
  const lowGaps = gapProfile?.gaps.filter((g) => g.severity === 'low') || [];
  const sortedGaps = [...highGaps, ...mediumGaps, ...lowGaps];
  const dimensions = gapProfile?.dimensions || [];
  const overallScore = gapProfile?.overallScore || 0;
  const microLessonPoints = gapProfile?.microLessonPoints || [];

  const levelEmoji: Record<string, string> = {
    beginner: '\u{1F331}',
    intermediate: '\u{1F33F}',
    advanced: '\u{1F333}',
  };

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 dark:from-brand-900/20 to-surface-secondary">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-surface-tertiary z-50">
        <motion.div
          className="h-full bg-brand-500"
          initial={{ width: 0 }}
          animate={{ width: `${getProgress()}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Main content */}
      <div className="min-h-screen flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-2xl">
          {/* Error message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
            >
              {error}
            </motion.div>
          )}

          {/* Step content */}
          <AnimatePresence mode="wait">
            {/* ── Both branches: Goal Input ── */}
            {step === 'goal_input' && (
              <StepWrapper key="goal">
                <GoalInputStep
                  onSubmit={handleGoalSubmit}
                  initialValue={prefilledSkill}
                  goalType={goalType}
                  onGoalTypeChange={setGoalType}
                />
              </StepWrapper>
            )}

            {/* ── Branch A: Assessing (loading) ── */}
            {step === 'assessing' && (
              <StepWrapper key="assessing">
                <LoadingState
                  title="Preparing your assessment"
                  subtitle={<>Generating a scenario for <span className="font-medium text-content">{assessmentSkillName}</span></>}
                  steps={[
                    'Understanding the skill area',
                    'Designing a realistic scenario',
                    'Calibrating difficulty',
                  ]}
                />
              </StepWrapper>
            )}

            {/* ── Branch A: Scenario + Response ── */}
            {step === 'assess_scenario' && assessmentScenario && (
              <StepWrapper key="assess_scenario">
                <div className="max-w-xl mx-auto space-y-6">
                  <div className="text-center space-y-2">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-brand-400 to-purple-600 flex items-center justify-center">
                      <Brain className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-content">Quick Assessment</h1>
                    <p className="text-content-secondary text-sm">
                      Tell us what you know — we'll find the gaps and fill them
                    </p>
                  </div>

                  {/* Scenario card */}
                  <div className="bg-surface-secondary rounded-2xl p-6 border border-border space-y-4">
                    <div className="flex items-center gap-2 text-sm text-content-tertiary">
                      <Sparkles className="w-4 h-4 text-brand-500" />
                      <span>Scenario</span>
                    </div>
                    <p className="text-content leading-relaxed text-[15px]">
                      {assessmentScenario.scenario}
                    </p>
                    <p className="text-content-secondary text-sm italic">
                      {assessmentScenario.instructions}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-content-tertiary">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Suggested time: ~{assessmentScenario.timeEstimateMinutes} minutes</span>
                    </div>
                  </div>

                  {/* Response textarea */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-content">
                      Your response
                    </label>
                    <textarea
                      value={userResponse}
                      onChange={(e) => setUserResponse(e.target.value)}
                      placeholder="Explain your approach, what you'd consider, and why..."
                      className="w-full min-h-[200px] px-4 py-3 rounded-xl bg-surface-secondary border border-border text-content placeholder-content-tertiary focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y text-[15px] leading-relaxed"
                    />
                    <p className="text-xs text-content-tertiary">
                      {userResponse.length > 0
                        ? `${userResponse.split(/\s+/).filter(Boolean).length} words`
                        : 'Write as much or as little as you want — what you leave out matters too'}
                    </p>
                  </div>

                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleAssessmentSubmit}
                    disabled={!userResponse.trim()}
                    rightIcon={<Send className="w-4 h-4" />}
                    className="w-full"
                  >
                    Analyze my response
                  </Button>
                </div>
              </StepWrapper>
            )}

            {/* ── Branch A: Analyzing (loading) ── */}
            {step === 'analyzing' && (
              <StepWrapper key="analyzing">
                <LoadingState
                  title="Analyzing your response"
                  subtitle="Looking at what you covered — and what you didn't..."
                  steps={[
                    'Reading your response',
                    'Evaluating structural gaps',
                    'Scoring dimensions',
                  ]}
                />
              </StepWrapper>
            )}

            {/* ── Branch A: Gap Results ── */}
            {step === 'gap_results' && gapProfile && (
              <StepWrapper key="gap_results">
                <div className="max-w-2xl mx-auto space-y-8">
                  {/* Header */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-3"
                  >
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-brand-400 to-purple-600 flex items-center justify-center">
                      <TrendingUp className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-content">
                      Your Assessment Results
                    </h1>
                    <p className="text-content-secondary text-sm">
                      Structural evaluation of your response
                    </p>
                  </motion.div>

                  {/* Overall score + detected level */}
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-surface-secondary rounded-2xl p-5 border border-border flex items-center gap-6"
                  >
                    <div className="flex-shrink-0 text-center">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl ${getScoreColor(overallScore)}`}>
                        {overallScore.toFixed(1)}
                      </div>
                      <p className="text-[10px] text-content-tertiary mt-1">out of 5</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{levelEmoji[gapProfile.detectedLevel] || '\u{1F331}'}</span>
                        <p className="text-lg font-semibold text-content capitalize">
                          {gapProfile.detectedLevel} level
                        </p>
                      </div>
                      <p className="text-sm text-content-secondary mt-0.5">
                        Based on structural analysis of your response
                      </p>
                    </div>
                  </motion.div>

                  {/* Dimension scores */}
                  {dimensions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="space-y-3"
                    >
                      <h2 className="text-sm font-semibold text-content flex items-center gap-2">
                        <Target className="w-4 h-4 text-brand-500" />
                        Dimension Scores
                      </h2>
                      <div className="bg-surface-secondary rounded-2xl border border-border divide-y divide-border overflow-hidden">
                        {dimensions.map((dim, i) => (
                          <motion.div
                            key={dim.name}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.25 + i * 0.04 }}
                            className="px-4 py-3"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm font-medium text-content capitalize">
                                {dim.name.replace(/_/g, ' ')}
                              </span>
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                dim.score >= 4 ? 'bg-focus-100 text-focus-700 dark:bg-focus-900/30 dark:text-focus-300'
                                : dim.score >= 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              }`}>
                                {dim.score}/5 · {getScoreLabel(dim.score)}
                              </span>
                            </div>
                            <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden mb-1.5">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(dim.score / 5) * 100}%` }}
                                transition={{ delay: 0.4 + i * 0.05, duration: 0.5 }}
                                className={`h-full rounded-full ${getScoreColor(dim.score)}`}
                              />
                            </div>
                            {dim.gap && (
                              <div className="mt-2 space-y-1">
                                <p className="text-xs text-content-secondary">
                                  <span className="font-medium text-content-tertiary">Gap:</span> {dim.gap}
                                </p>
                                {dim.example && (
                                  <p className="text-xs text-content-tertiary italic">
                                    <span className="font-medium">Example:</span> {dim.example}
                                  </p>
                                )}
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Micro-lesson points */}
                  {microLessonPoints.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="space-y-3"
                    >
                      <h2 className="text-sm font-semibold text-content flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-500" />
                        Quick Tips for Your Weakest Areas
                      </h2>
                      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 space-y-3">
                        {microLessonPoints.map((tip, i) => (
                          <div key={i} className="flex gap-2.5">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center justify-center mt-0.5">
                              {i + 1}
                            </span>
                            <p className="text-sm text-content leading-relaxed">{tip}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Strengths */}
                  {gapProfile.strengths.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="space-y-3"
                    >
                      <h2 className="text-sm font-semibold text-content flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-focus-500" />
                        What you did well
                      </h2>
                      <div className="space-y-2">
                        {gapProfile.strengths.map((strength, i) => (
                          <div
                            key={i}
                            className="bg-focus-50 dark:bg-focus-950/20 border border-focus-200 dark:border-focus-800 rounded-xl px-4 py-3"
                          >
                            <p className="text-sm font-medium text-focus-700 dark:text-focus-300 capitalize">
                              {strength.category.replace(/_/g, ' ')}
                            </p>
                            <p className="text-sm text-content-secondary mt-0.5">
                              {strength.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Structural gaps */}
                  {sortedGaps.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 }}
                      className="space-y-3"
                    >
                      <h2 className="text-sm font-semibold text-content flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-alert-500" />
                        Structural Gaps ({sortedGaps.length})
                      </h2>
                      <div className="space-y-2">
                        {sortedGaps.map((gap, i) => {
                          const config = severityConfig[gap.severity];
                          const Icon = severityIcons[gap.severity];
                          return (
                            <div
                              key={i}
                              className={`rounded-xl px-4 py-3 border ${config.color}`}
                            >
                              <div className="flex items-start gap-3">
                                <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-70" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-content capitalize">
                                      {gap.category.replace(/_/g, ' ')}
                                    </p>
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${config.badge}`}>
                                      {config.label}
                                    </span>
                                  </div>
                                  <p className="text-sm text-content-secondary mt-0.5">
                                    {gap.description}
                                  </p>
                                  <p className="text-xs text-content-tertiary mt-1 italic">
                                    {gap.evidence}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* Pick your direction */}
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="space-y-4"
                  >
                    <h2 className="text-sm font-semibold text-content flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-brand-500" />
                      Pick your direction
                    </h2>
                    <p className="text-xs text-content-secondary">
                      We'll create a dense 1-3 day micro lesson based on your gaps + chosen direction
                    </p>

                    {directionsLoading ? (
                      <div className="flex items-center justify-center py-8 gap-3">
                        <motion.div
                          className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                        />
                        <span className="text-sm text-content-secondary">Generating directions...</span>
                      </div>
                    ) : directions.length > 0 ? (
                      <div className="space-y-3">
                        {directions.map((direction) => (
                          <DirectionCard
                            key={direction.id}
                            direction={direction}
                            isSelected={gapSelectedDirectionId === direction.id}
                            onClick={() => {
                              setGapSelectedDirectionId(direction.id);
                              if (direction.languageConfig) {
                                setGapSelectedLanguage(
                                  gapSelectedLanguage && gapSelectedDirectionId === direction.id
                                    ? gapSelectedLanguage
                                    : direction.languageConfig.recommended
                                );
                              } else {
                                setGapSelectedLanguage(undefined);
                              }
                            }}
                            {...(gapSelectedDirectionId === direction.id && direction.languageConfig ? {
                              onLanguageChange: setGapSelectedLanguage,
                              selectedLanguage: gapSelectedLanguage,
                            } : {})}
                          />
                        ))}

                        <Button
                          variant="primary"
                          size="lg"
                          className="w-full"
                          disabled={!gapSelectedDirectionId}
                          onClick={() => {
                            const dir = directions.find(d => d.id === gapSelectedDirectionId);
                            if (dir) handleDirectionMicroLesson(dir, gapSelectedLanguage);
                          }}
                          rightIcon={<ArrowRight className="w-4 h-4" />}
                        >
                          Start micro lesson
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-content-tertiary text-center py-4">
                        No directions available. Try going back and starting over.
                      </p>
                    )}
                  </motion.div>

                  {/* Escape hatch */}
                  <div className="text-center pt-2 border-t border-border">
                    <button
                      onClick={handleEscapeToGoalInput}
                      className="text-sm text-content-tertiary hover:text-content-secondary transition-colors inline-flex items-center gap-1.5"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      I actually know what I want to learn
                    </button>
                  </div>
                </div>
              </StepWrapper>
            )}

            {/* ── Branch B: Generating Directions ── */}
            {step === 'generating' && (
              <StepWrapper key="generating">
                <LoadingState
                  title={
                    goalType === GoalType.PROJECT || goalType === GoalType.AI_BUILDER
                      ? 'Finding project ideas...'
                      : 'Analyzing your situation...'
                  }
                  subtitle={
                    goalType === GoalType.PROJECT || goalType === GoalType.AI_BUILDER
                      ? 'Flexi is designing projects for you'
                      : 'Flexi is mapping out your problem'
                  }
                  steps={
                    goalType === GoalType.PROJECT || goalType === GoalType.AI_BUILDER
                      ? [
                          'Understanding your blockers',
                          'Designing project ideas',
                          'Matching skills to projects',
                        ]
                      : [
                          'Understanding your situation',
                          'Identifying the gaps',
                          'Mapping a fix-it plan',
                        ]
                  }
                />
              </StepWrapper>
            )}

            {/* ── Branch B: Directions ── */}
            {step === 'directions' && (
              <StepWrapper key="directions">
                <DirectionsStep
                  directions={directions}
                  interpretedGoal={interpretedGoal}
                  onSelect={handleDirectionSelect}
                  onRefine={() => setStep('refinement')}
                  goalType={goalType ?? undefined}
                />
              </StepWrapper>
            )}

            {/* ── Branch B: Refinement ── */}
            {step === 'refinement' && (
              <StepWrapper key="refinement">
                <RefinementPanel
                  originalGoal={goal}
                  directions={directions}
                  onSubmit={handleRefinementSubmit}
                  onBack={() => setStep('directions')}
                />
              </StepWrapper>
            )}

            {/* ── Branch B: Depth/Familiarity ── */}
            {step === 'depth' && selectedDirection && (
              <StepWrapper key="depth">
                <FeelingStep
                  selectedDirection={selectedDirection.title}
                  goalType={goalType ?? undefined}
                  onSelect={handleFeelingSelect}
                />
              </StepWrapper>
            )}

            {/* ── Both branches: Completing ── */}
            {step === 'completing' && branch === 'discovery' && (
              <StepWrapper key="completing-discovery">
                <GeneratingScreen
                  inline
                  title="Building targeted lessons"
                  subtitle={`Designing micro lesson: ${selectedDirection?.title || assessmentSkillName}...`}
                  timeEstimate="This takes about 30-40 seconds"
                  steps={[
                    { icon: Search, text: 'Analyzing your gaps...', duration: 3000 },
                    { icon: Brain, text: 'Designing targeted lessons...', duration: 6000 },
                    { icon: BookOpen, text: 'Building micro-curriculum...', duration: 25000 },
                    { icon: CheckCircle, text: 'Finalizing your plan...', duration: 3000 },
                  ]}
                />
              </StepWrapper>
            )}
            {step === 'completing' && branch !== 'discovery' && (
              <StepWrapper key="completing">
                <LoadingState
                  title="Setting up your experience..."
                  subtitle="Personalizing your learning journey"
                  variant="green"
                  steps={[
                    'Saving your preferences',
                    'Preparing your dashboard',
                  ]}
                />
              </StepWrapper>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Shared components ──────────────────────────────────────────

function StepWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

function LoadingState({
  title,
  subtitle,
  variant = 'brand',
  steps,
}: {
  title: string;
  subtitle: React.ReactNode;
  variant?: 'brand' | 'green';
  steps?: string[];
}) {
  const colors = variant === 'green'
    ? {
        ring: 'stroke-green-500',
        ringBg: 'stroke-green-100',
        bg: 'bg-green-50',
        icon: 'text-green-600',
        check: 'text-green-500',
        text: 'text-green-600',
      }
    : {
        ring: 'stroke-brand-500',
        ringBg: 'stroke-brand-100',
        bg: 'bg-brand-50',
        icon: 'text-brand-600',
        check: 'text-brand-500',
        text: 'text-brand-600',
      };

  return (
    <div className="text-center py-12">
      <div className="relative inline-flex items-center justify-center mb-8">
        <motion.svg
          className="w-24 h-24"
          viewBox="0 0 100 100"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
        >
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="4"
            className={colors.ringBg}
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            className={colors.ring}
            strokeDasharray="80 200"
          />
        </motion.svg>

        <div className={`absolute w-14 h-14 ${colors.bg} rounded-full flex items-center justify-center`}>
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          >
            <Sparkles className={`w-7 h-7 ${colors.icon}`} />
          </motion.div>
        </div>
      </div>

      <h2 className="text-xl font-semibold text-content mb-2">{title}</h2>
      <p className="text-content-secondary mb-8">{subtitle}</p>

      {steps && steps.length > 0 && (
        <div className="inline-flex flex-col items-start gap-3 text-left">
          {steps.map((s, i) => (
            <motion.div
              key={s}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 1.5, duration: 0.4 }}
              className="flex items-center gap-3"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 1.5 + 0.2, type: 'spring', stiffness: 300 }}
                className={`w-5 h-5 rounded-full ${colors.bg} flex items-center justify-center`}
              >
                <motion.svg
                  className={`w-3 h-3 ${colors.check}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ delay: i * 1.5 + 0.3, duration: 0.3 }}
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </motion.svg>
              </motion.div>
              <span className={`text-sm ${colors.text}`}>{s}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

