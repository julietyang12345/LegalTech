import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Clock,
  HelpCircle,
  Star,
  ArrowRight,
  BookOpen,
  RefreshCw,
  TrendingUp,
  Target,
  Lightbulb,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/common';
import type { Rep, RepFeedback as RepFeedbackType, RepSkillEvaluation } from '@/types';

interface RepFeedbackProps {
  rep: Rep;
  onDoAnother: () => void;
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const getColor = () => {
    if (score >= 4) return 'bg-green-500';
    if (score >= 3) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-content-secondary w-40 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-surface-tertiary rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(score / 5) * 100}%` }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className={clsx('h-full rounded-full', getColor())}
        />
      </div>
      <span className="text-sm font-medium text-content w-8 text-right">{score}/5</span>
    </div>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-surface-tertiary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-brand-500" />
          <span className="font-medium text-content">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-content-tertiary" />
        ) : (
          <ChevronDown className="w-4 h-4 text-content-tertiary" />
        )}
      </button>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-4 pb-4 border-t border-border"
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}

function SkillDimensionCard({ evaluation }: { evaluation: RepSkillEvaluation }) {
  const [expanded, setExpanded] = useState(false);

  const getScoreColor = () => {
    if (evaluation.score >= 4) return 'text-green-600 bg-green-50 dark:bg-green-900/20';
    if (evaluation.score >= 3) return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20';
    return 'text-red-600 bg-red-50 dark:bg-red-900/20';
  };

  return (
    <div
      className="p-3 rounded-lg border border-border cursor-pointer hover:bg-surface-tertiary/30 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-content capitalize">
          {evaluation.dimension.replace(/([A-Z])/g, ' $1').trim()}
        </span>
        <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full', getScoreColor())}>
          {evaluation.score}/5
        </span>
      </div>
      <ScoreBar score={evaluation.score} label="" />

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-3 space-y-2 overflow-hidden"
        >
          {evaluation.evidence && (
            <div className="text-xs">
              <span className="font-medium text-content-secondary">Evidence: </span>
              <span className="text-content-tertiary italic">"{evaluation.evidence}"</span>
            </div>
          )}
          {evaluation.gap && (
            <div className="text-xs">
              <span className="font-medium text-content-secondary">Gap: </span>
              <span className="text-content-tertiary">{evaluation.gap}</span>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

export function RepFeedback({ rep, onDoAnother }: RepFeedbackProps) {
  const navigate = useNavigate();
  const feedback = rep.feedback;

  if (!feedback) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p className="text-content-tertiary">No feedback available.</p>
      </div>
    );
  }

  const completedCount = rep.scenario.tasks.filter((_, i) =>
    rep.hintsRevealed.some(h => h.taskIndex === i) || true
  ).length;
  const timeMinutes = Math.round(rep.timeSpentSeconds / 60);

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-full mb-4">
          <CheckCircle className="w-8 h-8 text-brand-600" />
        </div>
        <h1 className="text-2xl font-bold text-content mb-2">
          Rep Complete!
        </h1>
        <p className="text-content-tertiary">
          {rep.scenario.title}
        </p>

        {/* Quick stats */}
        <div className="flex items-center justify-center gap-6 mt-4">
          <div className="flex items-center gap-1.5 text-sm text-content-secondary">
            <Clock className="w-4 h-4" />
            {timeMinutes} min
          </div>
          <div className="flex items-center gap-1.5 text-sm text-content-secondary">
            <HelpCircle className="w-4 h-4" />
            {rep.hintsUsed} hints
          </div>
          {rep.confidenceScore && (
            <div className="flex items-center gap-1.5 text-sm text-content-secondary">
              <Star className="w-4 h-4" />
              {rep.confidenceScore}/5 confidence
            </div>
          )}
        </div>
      </motion.div>

      {/* Feedback sections */}
      <div className="space-y-4">
        {/* 1. Execution Summary */}
        <CollapsibleSection title="Execution Summary" icon={Target} defaultOpen>
          <div className="space-y-3 pt-3">
            <div>
              <h4 className="text-xs font-medium text-content-secondary uppercase mb-1">Completion</h4>
              <p className="text-sm text-content">{feedback.execution.completionAnalysis}</p>
            </div>
            <div>
              <h4 className="text-xs font-medium text-content-secondary uppercase mb-1">Time Efficiency</h4>
              <p className="text-sm text-content">{feedback.execution.timeEfficiency}</p>
            </div>
            <div>
              <h4 className="text-xs font-medium text-content-secondary uppercase mb-1">Hint Dependency</h4>
              <p className="text-sm text-content">{feedback.execution.hintDependency}</p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Example Answer (deliverable reps only) */}
        {rep.scenario.template && feedback.exampleAnswer && (
          <CollapsibleSection title="Here's what a strong answer looks like" icon={Lightbulb} defaultOpen>
            <div className="pt-3">
              <pre className="p-4 text-sm text-content-secondary whitespace-pre-wrap leading-relaxed font-mono rounded-lg bg-surface-tertiary border border-border overflow-x-auto">
                {feedback.exampleAnswer}
              </pre>
            </div>
          </CollapsibleSection>
        )}

        {/* 2. Skill Breakdown */}
        <CollapsibleSection title="Skill Breakdown" icon={TrendingUp} defaultOpen>
          <div className="space-y-3 pt-3">
            {feedback.skillEvaluation.map((evaluation, i) => (
              <SkillDimensionCard key={i} evaluation={evaluation} />
            ))}
          </div>
        </CollapsibleSection>

        {/* 3. What To Do Next */}
        <CollapsibleSection title="What To Do Next" icon={Lightbulb}>
          <div className="space-y-4 pt-3">
            {/* Immediate actions */}
            {feedback.improvementPlan.immediateActions.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-content-secondary uppercase mb-2">Try Right Now</h4>
                <ol className="space-y-1.5">
                  {feedback.improvementPlan.immediateActions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-content">
                      <span className="text-brand-500 font-medium mt-0.5">{i + 1}.</span>
                      {action}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Concepts to study */}
            {feedback.improvementPlan.conceptsToStudy.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-content-secondary uppercase mb-2">Concepts to Study</h4>
                <div className="flex flex-wrap gap-2">
                  {feedback.improvementPlan.conceptsToStudy.map((concept, i) => (
                    <button
                      key={i}
                      onClick={() => navigate(`/onboarding?skill=${encodeURIComponent(concept)}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 transition-colors dark:bg-brand-900/20 dark:text-brand-400"
                    >
                      <BookOpen className="w-3 h-3" />
                      {concept}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested next rep */}
            {feedback.improvementPlan.suggestedNextRep && (
              <div className="p-3 rounded-lg bg-surface-tertiary border border-border">
                <h4 className="text-xs font-medium text-content-secondary uppercase mb-1">Suggested Next Rep</h4>
                <p className="text-sm text-content">{feedback.improvementPlan.suggestedNextRep}</p>
              </div>
            )}

            {/* Improvement methods */}
            {feedback.improvementPlan.methodToImprove.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-content-secondary uppercase mb-2">How to Improve</h4>
                <div className="space-y-2">
                  {feedback.improvementPlan.methodToImprove.map((method, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-content capitalize">
                        {method.dimension.replace(/([A-Z])/g, ' $1').trim()}:
                      </span>{' '}
                      <span className="text-content-secondary">{method.method}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resource hints */}
            {feedback.improvementPlan.resourceHints.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-content-secondary uppercase mb-2">What to Search For</h4>
                <ul className="space-y-1">
                  {feedback.improvementPlan.resourceHints.map((hint, i) => (
                    <li key={i} className="text-sm text-content-tertiary">
                      {hint}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* 4. Growth Signal */}
        <CollapsibleSection title="Growth Signal" icon={TrendingUp}>
          <div className="space-y-3 pt-3">
            {feedback.growthSignal.comparedToStart && (
              <div>
                <h4 className="text-xs font-medium text-content-secondary uppercase mb-1">Progress</h4>
                <p className="text-sm text-content">{feedback.growthSignal.comparedToStart}</p>
              </div>
            )}
            {feedback.growthSignal.confidenceCalibration && (
              <div>
                <h4 className="text-xs font-medium text-content-secondary uppercase mb-1">Confidence Calibration</h4>
                <p className="text-sm text-content">{feedback.growthSignal.confidenceCalibration}</p>
              </div>
            )}
            {feedback.growthSignal.encouragement && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-brand-50 to-violet-50 dark:from-brand-900/10 dark:to-violet-900/10 border border-brand-100 dark:border-brand-800">
                <p className="text-sm text-content font-medium">
                  {feedback.growthSignal.encouragement}
                </p>
              </div>
            )}
          </div>
        </CollapsibleSection>
      </div>

      {/* Action buttons */}
      <div className="mt-8 space-y-3">
        <Button
          onClick={onDoAnother}
          size="lg"
          className="w-full"
          rightIcon={<RefreshCw className="w-4 h-4" />}
        >
          Do another rep
        </Button>

        {feedback.suggestedTopics.length > 0 && (
          <button
            onClick={() => navigate(`/onboarding?skill=${encodeURIComponent(feedback.suggestedTopics[0])}`)}
            className="w-full inline-flex items-center justify-center gap-2 text-sm text-content-tertiary hover:text-content-secondary transition-colors py-2"
          >
            <BookOpen className="w-4 h-4" />
            I want to study and learn this topic
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
