import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Dumbbell } from 'lucide-react';
import { useRepsStore } from '@/stores/repsStore';
import { RepsIntake, ScenarioSelect, RepPractice, RepFeedback } from '@/components/reps';
import { Button } from '@/components/common';

export function RepsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    phase,
    needsIntake,
    scenarios,
    activeRep,
    isGenerating,
    isCompleting,
    error,
    checkIntake,
    saveIntake,
    generateScenarios,
    selectScenario,
    completeRep,
    resetFlow,
    clearError,
  } = useRepsStore();

  const [confidenceScore, setConfidenceScore] = useState<number>(3);
  const [showConfirmComplete, setShowConfirmComplete] = useState(false);

  // Initialize on mount
  useEffect(() => {
    const topic = searchParams.get('topic');
    const skill = searchParams.get('skill');
    const fresh = searchParams.get('fresh') === 'true';

    // If fresh=true, always reset and show intake form
    if (fresh) {
      resetFlow();
      useRepsStore.setState({ needsIntake: true, phase: 'intake' });
      return;
    }

    // If resuming an active rep, go straight to practice
    if (activeRep && !activeRep.completed && phase === 'practice') {
      return;
    }

    // If we have feedback, show it
    if (activeRep?.completed && phase === 'feedback') {
      return;
    }

    // Fresh start
    checkIntake().then(() => {
      const state = useRepsStore.getState();
      if (!state.needsIntake) {
        generateScenarios({
          skillName: skill || undefined,
          topic: topic || undefined,
        });
      }
    });

    return () => {
      // Don't reset if in practice - allow resume
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIntakeComplete = async (data: { background: string; target: string; struggle: string }) => {
    await saveIntake(data);
    const topic = searchParams.get('topic');
    const skill = searchParams.get('skill');
    generateScenarios({
      skillName: skill || undefined,
      topic: topic || undefined,
    });
  };

  const handleCompleteRep = () => {
    setShowConfirmComplete(true);
  };

  const handleConfirmComplete = async () => {
    setShowConfirmComplete(false);
    await completeRep(confidenceScore);
  };

  const handleDoAnother = () => {
    resetFlow();
    generateScenarios();
  };

  const handleSwitchToStudy = (skill: string) => {
    navigate(`/onboarding?skill=${encodeURIComponent(skill)}`);
  };

  return (
    <div className="min-h-screen bg-surface-secondary flex flex-col">
      {/* Top bar (only show when not in practice) */}
      {phase !== 'practice' && (
        <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
            <button
              onClick={() => navigate('/today')}
              className="flex items-center gap-2 text-content-secondary hover:text-content transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back</span>
            </button>
            <div className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-brand-500" />
              <span className="font-semibold text-content">Reps</span>
            </div>
            <div className="w-16" /> {/* Spacer for centering */}
          </div>
        </header>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-3 dark:bg-red-900/20 dark:border-red-800">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            <button onClick={clearError} className="text-sm text-red-500 hover:text-red-700">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1">
        {/* Intake */}
        {phase === 'intake' && needsIntake && (
          <div className="py-12 px-4">
            <RepsIntake onComplete={handleIntakeComplete} />
          </div>
        )}

        {/* Loading */}
        {(phase === 'loading' || isGenerating) && (
          <div className="flex-1 flex items-center justify-center py-24">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <Loader2 className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-4" />
              <p className="text-content-secondary font-medium">
                Generating practice scenarios...
              </p>
              <p className="text-sm text-content-tertiary mt-1">
                Tailored to your background and goals
              </p>
            </motion.div>
          </div>
        )}

        {/* Scenario selection */}
        {phase === 'scenarios' && scenarios.length > 0 && !isGenerating && (
          <div className="py-12 px-4">
            <ScenarioSelect
              scenarios={scenarios}
              onSelect={selectScenario}
              onRegenerate={() => generateScenarios()}
              isRegenerating={isGenerating}
            />
          </div>
        )}

        {/* Practice */}
        {phase === 'practice' && activeRep && (
          <RepPractice
            scenario={activeRep.scenario}
            onComplete={handleCompleteRep}
            onSwitchToStudy={handleSwitchToStudy}
          />
        )}

        {/* Completing (generating feedback) */}
        {phase === 'completing' && (
          <div className="flex-1 flex items-center justify-center py-24">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <Loader2 className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-4" />
              <p className="text-content-secondary font-medium">
                Analyzing your work...
              </p>
              <p className="text-sm text-content-tertiary mt-1">
                Generating detailed feedback
              </p>
            </motion.div>
          </div>
        )}

        {/* Feedback */}
        {phase === 'feedback' && activeRep?.completed && (
          <RepFeedback
            rep={activeRep}
            onDoAnother={handleDoAnother}
          />
        )}
      </main>

      {/* Confidence modal */}
      {showConfirmComplete && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowConfirmComplete(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-surface rounded-2xl shadow-xl z-50 p-6"
          >
            <h3 className="font-semibold text-content text-lg mb-2">
              How confident do you feel?
            </h3>
            <p className="text-sm text-content-tertiary mb-4">
              Rate your confidence on the tasks you completed. This helps calibrate your feedback.
            </p>

            <div className="flex items-center justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map(score => (
                <button
                  key={score}
                  onClick={() => setConfidenceScore(score)}
                  className={`w-12 h-12 rounded-xl border-2 font-semibold transition-all ${
                    confidenceScore === score
                      ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-900/20'
                      : 'border-border text-content-secondary hover:border-brand-300'
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-content-tertiary mb-6">
              <span>Not confident</span>
              <span>Very confident</span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmComplete(false)}
                className="flex-1 py-2.5 text-sm text-content-secondary bg-surface-tertiary rounded-xl hover:bg-border transition-colors"
              >
                Cancel
              </button>
              <Button
                onClick={handleConfirmComplete}
                isLoading={isCompleting}
                className="flex-1"
              >
                Get feedback
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
