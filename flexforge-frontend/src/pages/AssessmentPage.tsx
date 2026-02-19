import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Send,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/common';
import { sessionService } from '@/services/sessionService';
import { useAuthStore } from '@/stores/authStore';
import type { AssessmentScenario } from '@/types';

type AssessmentStep = 'loading' | 'scenario' | 'analyzing' | 'skip_input';

export function AssessmentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();

  const prefs = user?.preferences?.learner;
  const skillName = prefs?.selectedDirection || '';
  const goalType = prefs?.goalType;

  // Re-test: previousGaps passed via location state
  const state = location.state as {
    previousGaps?: Array<{ category: string; description: string }>;
    assessmentRound?: number;
  } | null;
  const previousGaps = state?.previousGaps;
  const assessmentRound = state?.assessmentRound || 1;

  const [step, setStep] = useState<AssessmentStep>('loading');
  const [scenario, setScenario] = useState<AssessmentScenario | null>(null);
  const [userResponse, setUserResponse] = useState('');
  const [showSkipInput, setShowSkipInput] = useState(false);
  const [skipGoal, setSkipGoal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);

  // Generate assessment scenario on mount
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    if (!skillName) {
      navigate('/onboarding');
      return;
    }

    const loadScenario = async () => {
      try {
        const result = await sessionService.generateAssessment({
          skillName,
          goalType,
          skillLevel: prefs?.familiarity,
          previousGaps,
        });
        setScenario(result);
        setStep('scenario');
      } catch (err: any) {
        console.error('Failed to generate assessment:', err);
        setError('Failed to generate assessment. Redirecting...');
        setTimeout(() => navigate('/confirm'), 2000);
      }
    };

    loadScenario();
  }, [skillName, goalType, prefs?.familiarity, previousGaps, navigate]);

  // Submit response for gap analysis
  const handleSubmit = async () => {
    if (!userResponse.trim() || !scenario) return;

    setStep('analyzing');
    try {
      const result = await sessionService.analyzeGaps({
        skillName,
        scenario: scenario.scenario,
        userResponse: userResponse.trim(),
        goalType,
        assessmentRound,
      });

      navigate('/gap-results', {
        state: { gapProfile: result.gapProfile, skillName },
        replace: true,
      });
    } catch (err: any) {
      console.error('Failed to analyze gaps:', err);
      setError('Analysis failed. Please try again.');
      setStep('scenario');
    }
  };

  // Skip assessment → go directly to curriculum generation
  const handleSkip = () => {
    navigate('/confirm', { replace: true });
  };

  // Skip with custom goal text
  const handleSkipWithGoal = () => {
    if (!skipGoal.trim()) {
      handleSkip();
      return;
    }
    // Store in sessionStorage for ConfirmationPage to pick up
    sessionStorage.setItem('customGoalOverride', skipGoal.trim());
    navigate('/confirm', { replace: true });
  };

  return (
    <div className="min-h-screen bg-surface-primary flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <AnimatePresence mode="wait">
          {/* Loading state */}
          {step === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-6"
            >
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brand-400 to-purple-600 flex items-center justify-center">
                <Brain className="w-8 h-8 text-white animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-content-primary">
                  Preparing your assessment
                </h1>
                <p className="text-content-secondary mt-2">
                  Generating a scenario to understand what you already know about{' '}
                  <span className="font-medium text-content-primary">{skillName}</span>...
                </p>
              </div>
              <Loader2 className="w-6 h-6 mx-auto text-brand-500 animate-spin" />

              {error && (
                <p className="text-red-500 text-sm">{error}</p>
              )}
            </motion.div>
          )}

          {/* Scenario display + response */}
          {step === 'scenario' && scenario && (
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
                <h1 className="text-2xl font-bold text-content-primary">
                  {previousGaps ? 'Re-assessment' : 'Quick Assessment'}
                </h1>
                <p className="text-content-secondary text-sm">
                  {previousGaps
                    ? 'Let\'s see how your understanding has improved'
                    : 'Tell us what you know — we\'ll find the gaps and fill them'}
                </p>
              </div>

              {/* Scenario card */}
              <div className="bg-surface-secondary rounded-2xl p-6 border border-border-primary space-y-4">
                <div className="flex items-center gap-2 text-sm text-content-tertiary">
                  <Sparkles className="w-4 h-4 text-brand-500" />
                  <span>Scenario</span>
                </div>
                <p className="text-content-primary leading-relaxed text-[15px]">
                  {scenario.scenario}
                </p>
                <p className="text-content-secondary text-sm italic">
                  {scenario.instructions}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-content-tertiary">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Suggested time: ~{scenario.timeEstimateMinutes} minutes</span>
                </div>
              </div>

              {/* Response textarea */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-content-primary">
                  Your response
                </label>
                <textarea
                  value={userResponse}
                  onChange={(e) => setUserResponse(e.target.value)}
                  placeholder="Explain your approach, what you'd consider, and why..."
                  className="w-full min-h-[200px] px-4 py-3 rounded-xl bg-surface-secondary border border-border-primary text-content-primary placeholder-content-tertiary focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y text-[15px] leading-relaxed"
                />
                <p className="text-xs text-content-tertiary">
                  {userResponse.length > 0
                    ? `${userResponse.split(/\s+/).filter(Boolean).length} words`
                    : 'Write as much or as little as you want — what you leave out matters too'}
                </p>
              </div>

              {/* Submit */}
              <Button
                variant="primary"
                size="lg"
                onClick={handleSubmit}
                disabled={!userResponse.trim()}
                rightIcon={<Send className="w-4 h-4" />}
                className="w-full"
              >
                Analyze my response
              </Button>

              {error && (
                <p className="text-red-500 text-sm text-center">{error}</p>
              )}

              {/* Skip option — subtle */}
              <div className="text-center pt-2">
                <button
                  onClick={() => setShowSkipInput(!showSkipInput)}
                  className="text-xs text-content-tertiary hover:text-content-secondary transition-colors inline-flex items-center gap-1"
                >
                  I already know what I want to learn
                  {showSkipInput ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>

                <AnimatePresence>
                  {showSkipInput && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 space-y-3 overflow-hidden"
                    >
                      <input
                        type="text"
                        value={skipGoal}
                        onChange={(e) => setSkipGoal(e.target.value)}
                        placeholder="What do you want to learn? (optional)"
                        className="w-full px-4 py-2.5 rounded-xl bg-surface-secondary border border-border-primary text-content-primary placeholder-content-tertiary text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                      />
                      <button
                        onClick={handleSkipWithGoal}
                        className="text-sm text-brand-500 hover:text-brand-600 font-medium inline-flex items-center gap-1 transition-colors"
                      >
                        Skip to curriculum
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* Analyzing state */}
          {step === 'analyzing' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-6"
            >
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-400 to-brand-600 flex items-center justify-center">
                <Brain className="w-8 h-8 text-white animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-content-primary">
                  Analyzing your response
                </h1>
                <p className="text-content-secondary mt-2">
                  Looking at what you covered — and what you didn't...
                </p>
              </div>
              <Loader2 className="w-6 h-6 mx-auto text-brand-500 animate-spin" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
