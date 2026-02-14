import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../common/Button";
import { Sparkles, ArrowRight, BookOpen, Loader2 } from "lucide-react";
import { onboardingService } from "@/services/onboardingService";
import { useAuthStore } from "@/stores/authStore";
import { useSessionStore } from "@/stores/sessionStore";

interface GoalInputStepProps {
  onSubmit: (goal: string) => void;
  isLoading?: boolean;
  initialValue?: string;
}

export function GoalInputStep({ onSubmit, isLoading, initialValue }: GoalInputStepProps) {
  const [goal, setGoal] = useState(initialValue || "");
  const [isSkipping, setIsSkipping] = useState(false);
  const [isCheckingSessions, setIsCheckingSessions] = useState(true);
  const navigate = useNavigate();
  const { refreshUser } = useAuthStore();
  const { sessions, fetchSessions } = useSessionStore();

  // Fetch sessions on mount to check if user has previous courses
  useEffect(() => {
    const checkSessions = async () => {
      setIsCheckingSessions(true);
      try {
        await fetchSessions();
      } catch {
        // Silently fail - user just won't see previous sessions option
      } finally {
        setIsCheckingSessions(false);
      }
    };
    checkSessions();
  }, [fetchSessions]);

  const hasPreviousSessions = sessions.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (goal.trim()) {
      onSubmit(goal.trim());
    }
  };

  const handleContinuePrevious = async () => {
    setIsSkipping(true);
    try {
      await onboardingService.skipOnboarding();
      await refreshUser();
      navigate('/vault');
    } catch (err) {
      console.error('Failed to skip onboarding:', err);
      setIsSkipping(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-full mb-4">
          <Sparkles className="w-8 h-8 text-brand-600" />
        </div>

        <h1 className="text-2xl font-bold text-content mb-2">
          What do you want to learn or build?
        </h1>
        <p className="text-content-tertiary text-base">
          Don't know what to ask yet? Just type any questions or confusion you have — we'll go from there.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="I want to..."
            className="w-full px-4 py-4 text-lg border border-border rounded-xl
                       focus:ring-2 focus:ring-brand-500 focus:border-brand-500
                       placeholder:text-content-tertiary resize-none"
            rows={3}
            autoFocus
          />
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          isLoading={isLoading}
          disabled={!goal.trim() || isLoading}
          rightIcon={<ArrowRight className="w-5 h-5" />}
        >
          {isLoading ? "Finding directions..." : "Find my learning path"}
        </Button>
      </form>

      {/* Previous Sessions link - show if user has previous sessions or still checking */}
      <div className="mt-8 text-center">
        {isCheckingSessions ? (
          <span className="inline-flex items-center gap-2 text-sm text-content-tertiary">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking for previous courses...
          </span>
        ) : hasPreviousSessions ? (
          <button
            type="button"
            onClick={handleContinuePrevious}
            disabled={isSkipping}
            className="inline-flex items-center gap-2 text-sm text-content-tertiary hover:text-content-secondary transition-colors disabled:opacity-50"
          >
            {isSkipping ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <BookOpen className="w-4 h-4" />
            )}
            {isSkipping ? 'Loading...' : 'Continue a previous session'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
