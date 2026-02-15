import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { clsx } from 'clsx';
import { Button } from "../common/Button";
import { Sparkles, ArrowRight, BookOpen, Loader2, Briefcase, Cpu, MessageSquare, ChevronDown, Check } from "lucide-react";
import { onboardingService } from "@/services/onboardingService";
import { useAuthStore } from "@/stores/authStore";
import { useSessionStore } from "@/stores/sessionStore";
import { GoalType } from "@/types";
import { getAllModeConfigs, getTrainingConfig } from "@/config/training-configs";

const MODE_ICONS: Record<string, React.ElementType> = {
  [GoalType.CURRICULUM]: BookOpen,
  [GoalType.PROJECT]: Briefcase,
  [GoalType.AI_BUILDER]: Cpu,
  [GoalType.LANGUAGE]: MessageSquare,
};

interface GoalInputStepProps {
  onSubmit: (goal: string) => void;
  isLoading?: boolean;
  initialValue?: string;
  goalType: GoalType;
  onGoalTypeChange: (goalType: GoalType) => void;
}

export function GoalInputStep({ onSubmit, isLoading, initialValue, goalType, onGoalTypeChange }: GoalInputStepProps) {
  const [goal, setGoal] = useState(initialValue || "");
  const [isSkipping, setIsSkipping] = useState(false);
  const [isCheckingSessions, setIsCheckingSessions] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
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

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasPreviousSessions = sessions.length > 0;
  const selectedConfig = getTrainingConfig(goalType);

  const modePrompts = {
    [GoalType.CURRICULUM]: {
      heading: 'What do you want to learn or master?',
      subtitle: 'A topic, skill, or concept — whether you\'re starting fresh or leveling up.',
      placeholder: 'e.g. I want to learn React, or I want to master data structures...',
      button: 'Find my learning path',
    },
    [GoalType.PROJECT]: {
      heading: 'What project do you want to practice or build?',
      subtitle: 'Describe the project or problem. We\'ll break it into guided build steps you can practice.',
      placeholder: 'e.g. A budgeting app, a portfolio website, an automation script...',
      button: 'Plan my project',
    },
    [GoalType.AI_BUILDER]: {
      heading: 'What do you want to practice building with AI?',
      subtitle: 'Describe what you want to create. We\'ll guide you through building it step by step.',
      placeholder: 'e.g. A chatbot for my website, an AI that summarizes articles...',
      button: 'Start building',
    },
    [GoalType.LANGUAGE]: {
      heading: 'What language do you want to learn?',
      subtitle: 'Pick a language and your goal — travel, work, fluency, or just for fun.',
      placeholder: 'e.g. Japanese for travel, Spanish for work conversations...',
      button: 'Start learning',
    },
  };

  const prompts = modePrompts[goalType as keyof typeof modePrompts] || modePrompts[GoalType.CURRICULUM];

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
          {prompts.heading}
        </h1>
        <p className="text-content-tertiary text-base">
          {prompts.subtitle}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Goal type dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={clsx(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left',
              dropdownOpen
                ? 'border-brand-500 ring-2 ring-brand-500/20'
                : 'border-border hover:border-brand-300'
            )}
          >
            {(() => {
              const Icon = MODE_ICONS[selectedConfig.goalType] || BookOpen;
              return (
                <>
                  <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-content">{selectedConfig.name}</div>
                    <div className="text-xs text-content-tertiary truncate">{selectedConfig.subtitle}</div>
                  </div>
                  <ChevronDown className={clsx(
                    'w-4 h-4 text-content-tertiary transition-transform flex-shrink-0',
                    dropdownOpen && 'rotate-180'
                  )} />
                </>
              );
            })()}
          </button>

          {dropdownOpen && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
              {getAllModeConfigs().map((config) => {
                const Icon = MODE_ICONS[config.goalType] || BookOpen;
                const isActive = goalType === config.goalType;
                return (
                  <button
                    key={config.goalType}
                    type="button"
                    onClick={() => {
                      onGoalTypeChange(config.goalType);
                      setDropdownOpen(false);
                    }}
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                      isActive
                        ? 'bg-brand-50'
                        : 'hover:bg-surface-secondary'
                    )}
                  >
                    <div className={clsx(
                      'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                      isActive ? 'bg-brand-100' : 'bg-surface-tertiary'
                    )}>
                      <Icon className={clsx('w-5 h-5', isActive ? 'text-brand-600' : 'text-content-secondary')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={clsx('text-sm font-medium', isActive ? 'text-brand-700' : 'text-content')}>
                        {config.name}
                      </div>
                      <div className="text-xs text-content-tertiary">{config.subtitle}</div>
                    </div>
                    {isActive && (
                      <Check className="w-4 h-4 text-brand-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={prompts.placeholder}
            className="w-full px-4 py-4 text-lg border border-border rounded-xl
                       bg-surface text-content
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
          {isLoading ? "Finding directions..." : prompts.button}
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
