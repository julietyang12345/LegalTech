import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle,
  Target,
  Zap,
  Hammer,
  Bot,
  ArrowRight,
  Shield,
  TrendingUp,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/common';
import type { GapProfile } from '@/types';
import {
  severityConfig,
  getScoreColor,
  getScoreLabel,
  goalTypeMap,
  getLatestAssessment,
  type LearningMode,
} from '@/utils/assessmentUtils';

const severityIcons = {
  high: AlertTriangle,
  medium: Target,
  low: Shield,
};

export function GapResultsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as { gapProfile?: GapProfile; skillName?: string } | null;

  // Try location.state first (in-flow), fall back to localStorage (standalone)
  const stored = !state?.gapProfile ? getLatestAssessment() : null;
  const gapProfile = state?.gapProfile || stored?.gapProfile;
  const skillName = state?.skillName || stored?.skillName;
  const isStandalone = !state?.gapProfile && !!stored;

  const [selectedMode, setSelectedMode] = useState<LearningMode>('practice');
  const [useAiBuilder, setUseAiBuilder] = useState(false);

  // Redirect if no gap data at all
  if (!gapProfile || !skillName) {
    navigate('/assess', { replace: true });
    return null;
  }

  const highGaps = gapProfile.gaps.filter((g) => g.severity === 'high');
  const mediumGaps = gapProfile.gaps.filter((g) => g.severity === 'medium');
  const lowGaps = gapProfile.gaps.filter((g) => g.severity === 'low');
  const sortedGaps = [...highGaps, ...mediumGaps, ...lowGaps];

  const dimensions = gapProfile.dimensions || [];
  const overallScore = gapProfile.overallScore || 0;
  const microLessonPoints = gapProfile.microLessonPoints || [];

  const levelEmoji: Record<string, string> = {
    beginner: '🌱',
    intermediate: '🌿',
    advanced: '🌳',
  };

  const handleStart = () => {
    const mode = useAiBuilder ? 'ai_builder' : selectedMode;

    // Store gap data for the confirmation page
    sessionStorage.setItem('gapProfile', JSON.stringify(gapProfile));
    sessionStorage.setItem('gapGoalType', goalTypeMap[mode]);
    sessionStorage.setItem('gapMicroLessonMode', 'true');

    navigate('/confirm', { replace: true });
  };

  return (
    <div className="min-h-screen bg-surface-primary px-4 py-8">
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
          <h1 className="text-2xl font-bold text-content-primary">
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
          className="bg-surface-secondary rounded-2xl p-5 border border-border-primary flex items-center gap-6"
        >
          {/* Score circle */}
          <div className="flex-shrink-0 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl ${getScoreColor(overallScore)}`}>
              {overallScore.toFixed(1)}
            </div>
            <p className="text-[10px] text-content-tertiary mt-1">out of 5</p>
          </div>
          {/* Level */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{levelEmoji[gapProfile.detectedLevel] || '🌱'}</span>
              <p className="text-lg font-semibold text-content-primary capitalize">
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
            <h2 className="text-sm font-semibold text-content-primary flex items-center gap-2">
              <Target className="w-4 h-4 text-brand-500" />
              Dimension Scores
            </h2>
            <div className="bg-surface-secondary rounded-2xl border border-border-primary divide-y divide-border-primary overflow-hidden">
              {dimensions.map((dim, i) => (
                <motion.div
                  key={dim.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.04 }}
                  className="px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-content-primary capitalize">
                      {dim.name.replace(/_/g, ' ')}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        dim.score >= 4 ? 'bg-focus-100 text-focus-700 dark:bg-focus-900/30 dark:text-focus-300'
                        : dim.score >= 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      }`}>
                        {dim.score}/5 · {getScoreLabel(dim.score)}
                      </span>
                    </div>
                  </div>
                  {/* Score bar */}
                  <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden mb-1.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(dim.score / 5) * 100}%` }}
                      transition={{ delay: 0.4 + i * 0.05, duration: 0.5 }}
                      className={`h-full rounded-full ${getScoreColor(dim.score)}`}
                    />
                  </div>
                  {/* Gap + example (if score < 4) */}
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
            <h2 className="text-sm font-semibold text-content-primary flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              Quick Tips for Your Weakest Areas
            </h2>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 space-y-3">
              {microLessonPoints.map((tip, i) => (
                <div key={i} className="flex gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-content-primary leading-relaxed">{tip}</p>
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
            <h2 className="text-sm font-semibold text-content-primary flex items-center gap-2">
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
            <h2 className="text-sm font-semibold text-content-primary flex items-center gap-2">
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
                          <p className="text-sm font-medium text-content-primary capitalize">
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

        {/* Mode selection */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="space-y-3"
        >
          <h2 className="text-sm font-semibold text-content-primary">
            How do you want to learn?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModeCard
              icon={Zap}
              title="Practice Mode"
              description="Short drills targeting each gap"
              selected={selectedMode === 'practice' && !useAiBuilder}
              onClick={() => {
                setSelectedMode('practice');
                setUseAiBuilder(false);
              }}
            />
            <ModeCard
              icon={Hammer}
              title="Project Mode"
              description="Build a small project covering these gaps"
              selected={selectedMode === 'project' && !useAiBuilder}
              onClick={() => {
                setSelectedMode('project');
                setUseAiBuilder(false);
              }}
            />
          </div>

          {/* AI Builder sub-option */}
          {selectedMode === 'project' && (
            <motion.label
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-center gap-2.5 pl-4 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={useAiBuilder}
                onChange={(e) => setUseAiBuilder(e.target.checked)}
                className="w-4 h-4 rounded border-border-primary text-brand-500 focus:ring-brand-500/30"
              />
              <div className="flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-content-tertiary" />
                <span className="text-sm text-content-secondary">
                  Build it yourself with AI tools
                </span>
              </div>
            </motion.label>
          )}
        </motion.div>

        {/* Start button */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <Button
            variant="primary"
            size="lg"
            onClick={handleStart}
            rightIcon={<ArrowRight className="w-4 h-4" />}
            className="w-full"
          >
            Start targeted lessons ({Math.max(3, Math.min(5, highGaps.length + mediumGaps.length))} days)
          </Button>
          <p className="text-xs text-content-tertiary text-center mt-2">
            Short, focused lessons — then we'll re-test to check your progress
          </p>

          {/* Standalone mode: extra nav options */}
          {isStandalone && (
            <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-border-primary">
              <button
                onClick={() => navigate('/assess')}
                className="text-sm text-content-tertiary hover:text-content-secondary transition-colors"
              >
                Retake assessment
              </button>
              <span className="text-content-tertiary">·</span>
              <button
                onClick={() => navigate('/today')}
                className="text-sm text-content-tertiary hover:text-content-secondary transition-colors"
              >
                Back to dashboard
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

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
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/20'
          : 'border-border-primary bg-surface-secondary hover:border-border-secondary'
      }`}
    >
      <Icon className={`w-5 h-5 mb-2 ${selected ? 'text-brand-500' : 'text-content-tertiary'}`} />
      <p className={`text-sm font-medium ${selected ? 'text-brand-600 dark:text-brand-400' : 'text-content-primary'}`}>
        {title}
      </p>
      <p className="text-xs text-content-secondary mt-0.5">{description}</p>
    </button>
  );
}
