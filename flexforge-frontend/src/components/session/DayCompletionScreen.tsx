import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Confetti from 'react-confetti';
import {
  Trophy, Twitter, Linkedin, Copy, Share2, CheckCircle, Loader2, RotateCcw,
  Brain, Send, Clock, Sparkles, Target, AlertTriangle, TrendingUp,
  Zap, Hammer, ArrowRight, Lightbulb,
} from 'lucide-react';
import { AchievementCard } from './AchievementCard';
import { buildShareText, shareNative, shareToTwitter, shareToLinkedIn, copyShareText } from '@/utils/socialShare';
import { sessionService } from '@/services/sessionService';
import type { Session, CurriculumDay, User, GapProfile, AssessmentScenario } from '@/types';
import {
  severityConfig,
  getScoreColor,
  getScoreLabel,
  goalTypeMap,
  saveLatestAssessment,
  type LearningMode,
} from '@/utils/assessmentUtils';

type ReassessPhase = 'celebration' | 'loadingScenario' | 'scenario' | 'analyzing' | 'results';

interface DayCompletionScreenProps {
  session: Session;
  currentDay: CurriculumDay;
  user: User;
  onContinue: () => Promise<void>;
  onMarkComplete: () => Promise<void>;
  isLoading: boolean;
}

export function DayCompletionScreen({
  session,
  currentDay,
  user,
  onContinue,
  onMarkComplete,
  isLoading,
}: DayCompletionScreenProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [windowSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  }));

  // Reassessment state (only relevant for gap session final day)
  const [reassessPhase, setReassessPhase] = useState<ReassessPhase>('celebration');
  const [scenario, setScenario] = useState<AssessmentScenario | null>(null);
  const [userResponse, setUserResponse] = useState('');
  const [newGapProfile, setNewGapProfile] = useState<GapProfile | null>(null);
  const [selectedMode, setSelectedMode] = useState<LearningMode>('practice');
  const [reassessError, setReassessError] = useState<string | null>(null);
  const [isStartingReassess, setIsStartingReassess] = useState(false);

  const isCourseComplete = currentDay.day >= session.durationDays;
  const isGapSession = session.isGapSession === true;
  const isGapCourseComplete = isCourseComplete && isGapSession;
  const shareText = buildShareText(session, currentDay);

  const handleCopy = async () => {
    const ok = await copyShareText(shareText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Start inline re-assessment
  const startReassessment = async () => {
    setReassessError(null);
    setIsStartingReassess(true);
    try {
      // 1. Load scenario FIRST (so if it fails, day isn't marked complete yet)
      setReassessPhase('loadingScenario');

      const previousGaps = session.gapProfile?.gaps.map(g => ({
        category: g.category,
        description: g.description,
      }));

      const result = await sessionService.generateAssessment({
        skillName: session.skillName,
        goalType: session.goalType,
        skillLevel: session.skillLevel,
        previousGaps,
      });

      setScenario(result);

      // 2. Mark day complete only after scenario loaded successfully
      await onMarkComplete();

      setReassessPhase('scenario');
    } catch (err: any) {
      console.error('Failed to start reassessment:', err);
      setReassessError(err.message || 'Failed to generate assessment');
      setReassessPhase('celebration');
    } finally {
      setIsStartingReassess(false);
    }
  };

  // Submit response for gap analysis
  const submitResponse = async () => {
    if (!userResponse.trim() || !scenario) return;

    setReassessError(null);
    setReassessPhase('analyzing');
    try {
      const assessmentRound = (session.gapProfile?.assessmentRound || 1) + 1;
      const result = await sessionService.analyzeGaps({
        skillName: session.skillName,
        scenario: scenario.scenario,
        userResponse: userResponse.trim(),
        goalType: session.goalType,
        assessmentRound,
      });

      setNewGapProfile(result.gapProfile);
      saveLatestAssessment(result.gapProfile, session.skillName);
      setReassessPhase('results');
    } catch (err: any) {
      console.error('Failed to analyze gaps:', err);
      setReassessError(err.message || 'Analysis failed. Please try again.');
      setReassessPhase('scenario');
    }
  };

  // Navigate to /confirm with gap data for new targeted session
  const handleStartTargetedLessons = () => {
    if (!newGapProfile) return;

    sessionStorage.setItem('gapProfile', JSON.stringify(newGapProfile));
    sessionStorage.setItem('gapGoalType', goalTypeMap[selectedMode]);
    sessionStorage.setItem('gapMicroLessonMode', 'true');

    navigate('/confirm', { replace: true });
  };

  // Computed values for results phase
  const oldScore = session.gapProfile?.overallScore || 0;
  const noGapsRemain = newGapProfile ? newGapProfile.gaps.length === 0 : false;
  const showConfetti = reassessPhase === 'celebration' || (reassessPhase === 'results' && noGapsRemain);
  const containerMaxWidth = reassessPhase === 'celebration' ? 'max-w-md' : 'max-w-2xl';

  const resolvedGaps = newGapProfile
    ? (session.gapProfile?.gaps.filter(
        oldGap => !newGapProfile.gaps.some(ng => ng.category === oldGap.category)
      ) || [])
    : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-b from-gray-900/95 to-gray-800/95"
    >
      {showConfetti && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={noGapsRemain ? 500 : isCourseComplete ? 500 : 300}
          gravity={0.2}
        />
      )}

      <div className="min-h-full flex items-center justify-center">
        <div className={`relative z-10 w-full ${containerMaxWidth} mx-auto px-4 py-10`}>
          <AnimatePresence mode="wait">

            {/* ── Celebration Phase ── */}
            {reassessPhase === 'celebration' && (
              <motion.div
                key="celebration"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center gap-6"
              >
                {/* Trophy */}
                <motion.div
                  initial={{ scale: 0, y: 30 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30"
                >
                  <Trophy className="w-10 h-10 text-white" />
                </motion.div>

                {/* Title */}
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-center"
                >
                  <h1 className="text-2xl font-bold text-white">
                    {isGapCourseComplete
                      ? 'Micro-Lessons Complete!'
                      : isCourseComplete
                        ? 'Course Complete!'
                        : `Day ${currentDay.day} Complete!`}
                  </h1>
                  {isGapCourseComplete ? (
                    <p className="text-purple-300 mt-1">
                      Time to see how much you've improved!
                    </p>
                  ) : isCourseComplete ? (
                    <p className="text-purple-300 mt-1">
                      You finished all {session.durationDays} days. Amazing!
                    </p>
                  ) : null}
                </motion.div>

                {/* Achievement card */}
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.55 }}
                  className="w-full"
                >
                  <AchievementCard session={session} currentDay={currentDay} user={user} />
                </motion.div>

                {/* Share buttons */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="flex items-center gap-3"
                >
                  <ShareButton
                    icon={<Twitter className="w-4 h-4" />}
                    label="Tweet"
                    onClick={() => shareToTwitter(shareText)}
                  />
                  <ShareButton
                    icon={<Linkedin className="w-4 h-4" />}
                    label="LinkedIn"
                    onClick={() => shareToLinkedIn(shareText)}
                  />
                  <ShareButton
                    icon={copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    label={copied ? 'Copied!' : 'Copy'}
                    onClick={handleCopy}
                  />
                  {typeof navigator !== 'undefined' && !!navigator.share && (
                    <ShareButton
                      icon={<Share2 className="w-4 h-4" />}
                      label="Share"
                      onClick={() => shareNative(shareText)}
                    />
                  )}
                </motion.div>

                {/* Error */}
                {reassessError && (
                  <p className="text-red-400 text-sm text-center">{reassessError}</p>
                )}

                {/* Action button */}
                {isGapCourseComplete ? (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.85 }}
                    onClick={startReassessment}
                    disabled={isStartingReassess}
                    className="w-full max-w-xs py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-600 hover:to-purple-700 disabled:opacity-60 transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
                  >
                    {isStartingReassess ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4" />
                        Start Re-test
                      </>
                    )}
                  </motion.button>
                ) : (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.85 }}
                    onClick={onContinue}
                    disabled={isLoading}
                    className="w-full max-w-xs py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-600 hover:to-purple-700 disabled:opacity-60 transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving progress...
                      </>
                    ) : isCourseComplete ? (
                      'View Your Results'
                    ) : (
                      'Continue to Tomorrow'
                    )}
                  </motion.button>
                )}
              </motion.div>
            )}

            {/* ── Loading Scenario Phase ── */}
            {reassessPhase === 'loadingScenario' && (
              <motion.div
                key="loadingScenario"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center gap-6 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-purple-600 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-white animate-pulse" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Preparing your re-assessment
                  </h2>
                  <p className="text-white/60 mt-2">
                    Generating a scenario focused on your gap areas...
                  </p>
                </div>
                <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
              </motion.div>
            )}

            {/* ── Scenario Phase ── */}
            {reassessPhase === 'scenario' && scenario && (
              <motion.div
                key="scenario"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Header */}
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-brand-400 to-purple-600 flex items-center justify-center">
                    <Brain className="w-7 h-7 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">Re-assessment</h2>
                  <p className="text-white/60 text-sm">
                    Let's see how your understanding has improved
                  </p>
                </div>

                {/* Scenario card */}
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-4">
                  <div className="flex items-center gap-2 text-sm text-white/50">
                    <Sparkles className="w-4 h-4 text-brand-400" />
                    <span>Scenario</span>
                  </div>
                  <p className="text-white leading-relaxed text-[15px]">
                    {scenario.scenario}
                  </p>
                  <p className="text-white/60 text-sm italic">
                    {scenario.instructions}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-white/40">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Suggested time: ~{scenario.timeEstimateMinutes} minutes</span>
                  </div>
                </div>

                {/* Response textarea */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-white">
                    Your response
                  </label>
                  <textarea
                    value={userResponse}
                    onChange={(e) => setUserResponse(e.target.value)}
                    placeholder="Explain your approach, what you'd consider, and why..."
                    className="w-full min-h-[200px] px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y text-[15px] leading-relaxed"
                  />
                  <p className="text-xs text-white/40">
                    {userResponse.length > 0
                      ? `${userResponse.split(/\s+/).filter(Boolean).length} words`
                      : 'Write as much or as little as you want — what you leave out matters too'}
                  </p>
                </div>

                {/* Submit */}
                <button
                  onClick={submitResponse}
                  disabled={!userResponse.trim()}
                  className="w-full py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-600 hover:to-purple-700 disabled:opacity-40 transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Analyze my response
                </button>

                {reassessError && (
                  <p className="text-red-400 text-sm text-center">{reassessError}</p>
                )}
              </motion.div>
            )}

            {/* ── Analyzing Phase ── */}
            {reassessPhase === 'analyzing' && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center gap-6 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-400 to-brand-600 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-white animate-pulse" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Analyzing your response
                  </h2>
                  <p className="text-white/60 mt-2">
                    Looking at what you covered — and what you didn't...
                  </p>
                </div>
                <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
              </motion.div>
            )}

            {/* ── Results Phase ── */}
            {reassessPhase === 'results' && newGapProfile && (
              <ResultsPhase
                newGapProfile={newGapProfile}
                oldScore={oldScore}
                resolvedGaps={resolvedGaps}
                noGapsRemain={noGapsRemain}
                selectedMode={selectedMode}
                setSelectedMode={setSelectedMode}
                onStartTargetedLessons={handleStartTargetedLessons}
                onGoToDashboard={() => navigate('/dashboard')}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   Results Phase (extracted for readability)
   ═══════════════════════════════════════════════════ */

function ResultsPhase({
  newGapProfile,
  oldScore,
  resolvedGaps,
  noGapsRemain,
  selectedMode,
  setSelectedMode,
  onStartTargetedLessons,
  onGoToDashboard,
}: {
  newGapProfile: GapProfile;
  oldScore: number;
  resolvedGaps: Array<{ category: string; description: string; severity: string; evidence: string }>;
  noGapsRemain: boolean;
  selectedMode: LearningMode;
  setSelectedMode: (m: LearningMode) => void;
  onStartTargetedLessons: () => void;
  onGoToDashboard: () => void;
}) {
  const newScore = newGapProfile.overallScore;
  const scoreDelta = newScore - oldScore;
  const deltaColor = scoreDelta > 0 ? 'text-green-400' : scoreDelta < 0 ? 'text-red-400' : 'text-white/50';
  const deltaPrefix = scoreDelta > 0 ? '+' : '';

  const dimensions = newGapProfile.dimensions || [];
  const microLessonPoints = newGapProfile.microLessonPoints || [];

  const highGaps = newGapProfile.gaps.filter(g => g.severity === 'high');
  const mediumGaps = newGapProfile.gaps.filter(g => g.severity === 'medium');
  const lowGaps = newGapProfile.gaps.filter(g => g.severity === 'low');
  const sortedGaps = [...highGaps, ...mediumGaps, ...lowGaps];

  return (
    <motion.div
      key="results"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      {/* Header + score comparison */}
      <div className="text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-brand-400 to-purple-600 flex items-center justify-center">
          <TrendingUp className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white">
          {noGapsRemain ? 'All Gaps Resolved!' : 'Your Progress'}
        </h2>

        {/* Score comparison card */}
        <div className="bg-white/5 rounded-2xl p-5 border border-white/10 flex items-center justify-center gap-6">
          {/* Old score */}
          <div className="text-center">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg ${getScoreColor(oldScore)}`}>
              {oldScore.toFixed(1)}
            </div>
            <p className="text-[10px] text-white/40 mt-1">Before</p>
          </div>

          <ArrowRight className="w-5 h-5 text-white/30" />

          {/* New score */}
          <div className="text-center">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg ${getScoreColor(newScore)}`}>
              {newScore.toFixed(1)}
            </div>
            <p className="text-[10px] text-white/40 mt-1">After</p>
          </div>

          {/* Delta */}
          <div className="text-center">
            <p className={`text-xl font-bold ${deltaColor}`}>
              {deltaPrefix}{scoreDelta.toFixed(1)}
            </p>
            <p className="text-[10px] text-white/40 mt-1">Change</p>
          </div>
        </div>

        {/* Resolved gaps count */}
        {resolvedGaps.length > 0 && (
          <div className="flex items-center justify-center gap-2 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-medium">
              {resolvedGaps.length} gap{resolvedGaps.length !== 1 ? 's' : ''} resolved!
            </span>
          </div>
        )}
      </div>

      {/* Dimension scores */}
      {dimensions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-brand-400" />
            Dimension Scores
          </h3>
          <div className="bg-white/5 rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
            {dimensions.map((dim, i) => (
              <motion.div
                key={dim.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.04 }}
                className="px-4 py-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-white capitalize">
                    {dim.name.replace(/_/g, ' ')}
                  </span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    dim.score >= 4
                      ? 'bg-focus-500/20 text-focus-300'
                      : dim.score >= 3
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-red-500/20 text-red-300'
                  }`}>
                    {dim.score}/5 · {getScoreLabel(dim.score)}
                  </span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-1.5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(dim.score / 5) * 100}%` }}
                    transition={{ delay: 0.2 + i * 0.05, duration: 0.5 }}
                    className={`h-full rounded-full ${getScoreColor(dim.score)}`}
                  />
                </div>
                {dim.gap && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-white/50">
                      <span className="font-medium text-white/40">Gap:</span> {dim.gap}
                    </p>
                    {dim.example && (
                      <p className="text-xs text-white/40 italic">
                        <span className="font-medium">Example:</span> {dim.example}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Micro-lesson tips */}
      {microLessonPoints.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            Quick Tips for Your Weakest Areas
          </h3>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-3">
            {microLessonPoints.map((tip, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/30 text-amber-300 text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-white/80 leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths */}
      {newGapProfile.strengths.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-focus-400" />
            What you did well
          </h3>
          <div className="space-y-2">
            {newGapProfile.strengths.map((s, i) => (
              <div key={i} className="bg-focus-500/10 border border-focus-500/20 rounded-xl px-4 py-3">
                <p className="text-sm font-medium text-focus-300 capitalize">
                  {s.category.replace(/_/g, ' ')}
                </p>
                <p className="text-sm text-white/60 mt-0.5">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remaining gaps */}
      {sortedGaps.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Remaining Gaps ({sortedGaps.length})
          </h3>
          <div className="space-y-2">
            {sortedGaps.map((gap, i) => {
              const config = severityConfig[gap.severity];
              return (
                <div key={i} className={`rounded-xl px-4 py-3 border ${config.color}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-white capitalize">
                          {gap.category.replace(/_/g, ' ')}
                        </p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${config.badge}`}>
                          {config.label}
                        </span>
                      </div>
                      <p className="text-sm text-white/60 mt-0.5">{gap.description}</p>
                      <p className="text-xs text-white/40 mt-1 italic">{gap.evidence}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action section */}
      {noGapsRemain ? (
        <div className="space-y-4 text-center">
          <p className="text-white/60 text-sm">
            You've addressed all identified gaps. Great work!
          </p>
          <button
            onClick={onGoToDashboard}
            className="w-full py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-600 hover:to-purple-700 transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white">
            How do you want to learn?
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModeCard
              icon={Zap}
              title="Practice Mode"
              description="Micro-lesson quizzes targeting each gap"
              selected={selectedMode === 'practice'}
              onClick={() => setSelectedMode('practice')}
            />
            <ModeCard
              icon={Hammer}
              title="Project Mode"
              description="Quizzes + a project covering your gaps"
              selected={selectedMode === 'project'}
              onClick={() => setSelectedMode('project')}
            />
          </div>

          <button
            onClick={onStartTargetedLessons}
            className="w-full py-3 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-600 hover:to-purple-700 transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
          >
            Start targeted lessons ({Math.max(3, Math.min(5, highGaps.length + mediumGaps.length))} days)
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-xs text-white/40 text-center">
            Short, focused lessons — then we'll re-test to check your progress
          </p>
        </div>
      )}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   Small reusable components
   ═══════════════════════════════════════════════════ */

function ModeCard({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-xl border-2 transition-all ${
        selected
          ? 'border-brand-500 bg-brand-500/10'
          : 'border-white/10 bg-white/5 hover:border-white/20'
      }`}
    >
      <Icon className={`w-5 h-5 mb-2 ${selected ? 'text-brand-400' : 'text-white/40'}`} />
      <p className={`text-sm font-medium ${selected ? 'text-brand-300' : 'text-white'}`}>
        {title}
      </p>
      <p className="text-xs text-white/50 mt-0.5">{description}</p>
    </button>
  );
}

function ShareButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
