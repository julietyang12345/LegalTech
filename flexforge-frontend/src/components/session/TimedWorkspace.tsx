import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Clock, Play, Pause, Send, Code2, FileText } from 'lucide-react';
import { Card, Button } from '@/components/common';
import { StepLayout } from './StepLayout';
import { useSessionStore } from '@/stores/sessionStore';
import type { CurriculumDay, Session } from '@/types';
import { getTrainingConfig } from '@/config/training-configs';

interface TimedWorkspaceProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

export function TimedWorkspace({ day, session, onComplete }: TimedWorkspaceProps) {
  const trainingConfig = getTrainingConfig(session.goalType);
  const timerMinutes = trainingConfig.defaultTimerMinutes;

  const [timeRemaining, setTimeRemaining] = useState(timerMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [attempt, setAttempt] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { saveTaskProgress } = useSessionStore();

  // Timer logic
  useEffect(() => {
    if (isRunning && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, timeRemaining]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const timeSpentSeconds = timerMinutes * 60 - timeRemaining;
  const progress = timerMinutes > 0 ? (timeRemaining / (timerMinutes * 60)) * 100 : 100;

  const handleStart = () => {
    setHasStarted(true);
    setIsRunning(true);
  };

  const handleTogglePause = () => {
    setIsRunning(prev => !prev);
  };

  const handleSubmit = useCallback(() => {
    setIsRunning(false);
    setIsSubmitted(true);

    // Save attempt data for scoring in reflection step
    saveTaskProgress(day.day, 'timedAttempt', {
      answers: { attempt, timeSpent: timeSpentSeconds } as any,
      currentIndex: 0,
      showResults: true,
    });
  }, [attempt, timeSpentSeconds, day.day, saveTaskProgress]);

  // Get scenario context from task1
  const task1 = day.task1 as any;
  const scenarioTitle = task1?.title || task1?.sections?.[0]?.title || day.title;
  const scenarioDescription = task1?.description || task1?.sections?.[0]?.description || '';

  // Determine if this is a code or text scenario
  const isCodeScenario = session.curriculum?.metadata?.skillType === 'CODE' ||
    session.curriculum?.metadata?.skillType === 'AI_AGENT';

  if (isSubmitted) {
    return (
      <StepLayout
        icon={Send}
        iconGradient="from-green-400 to-green-500"
        title="Submitted!"
        subtitle={`Time spent: ${formatTime(timeSpentSeconds)}`}
      >
        <Card className="bg-gradient-to-br from-green-50 to-white border border-green-100">
          <div className="p-6 text-center">
            <p className="text-lg text-content mb-4">
              Your attempt has been recorded. Continue to get your feedback.
            </p>
            <Button variant="primary" onClick={onComplete}>
              View Feedback
            </Button>
          </div>
        </Card>
      </StepLayout>
    );
  }

  return (
    <StepLayout
      icon={Clock}
      iconGradient="from-orange-400 to-red-500"
      title={trainingConfig.stepLabels?.task1 || 'Timed Attempt'}
      subtitle={hasStarted ? `${formatTime(timeRemaining)} remaining` : `${timerMinutes} minutes to complete`}
    >
      {/* Timer Ring */}
      {hasStarted && (
        <div className="flex justify-center mb-4 sm:mb-6">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24">
            <svg className="w-20 h-20 sm:w-24 sm:h-24 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50" cy="50" r="45"
                stroke="currentColor"
                strokeWidth="6"
                fill="none"
                className="text-surface-tertiary"
              />
              <circle
                cx="50" cy="50" r="45"
                stroke="currentColor"
                strokeWidth="6"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
                className={timeRemaining < 60 ? 'text-red-500' : timeRemaining < 300 ? 'text-orange-500' : 'text-brand-500'}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold ${timeRemaining < 60 ? 'text-red-600' : 'text-content'}`}>
                {formatTime(timeRemaining)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Scenario Brief */}
      <Card className="bg-surface border border-border mb-4">
        <div className="p-4">
          <h3 className="font-semibold text-content mb-2">{scenarioTitle}</h3>
          {scenarioDescription && (
            <p className="text-content-secondary text-sm whitespace-pre-wrap">{scenarioDescription}</p>
          )}
        </div>
      </Card>

      {/* Start button or workspace */}
      {!hasStarted ? (
        <div className="text-center">
          <Button
            variant="primary"
            onClick={handleStart}
            leftIcon={<Play className="w-5 h-5" />}
            className="px-6 sm:px-8 py-3 text-lg"
          >
            Start Timer & Begin
          </Button>
          <p className="text-sm text-content-tertiary mt-3">
            You'll have {timerMinutes} minutes. The timer starts when you click.
          </p>
        </div>
      ) : (
        <>
          {/* Editor */}
          <Card className="border border-border">
            <div className="p-2">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                {isCodeScenario ? (
                  <Code2 className="w-4 h-4 text-content-tertiary" />
                ) : (
                  <FileText className="w-4 h-4 text-content-tertiary" />
                )}
                <span className="text-sm text-content-tertiary">
                  {isCodeScenario ? 'Code Editor' : 'Your Response'}
                </span>
              </div>
              <textarea
                value={attempt}
                onChange={(e) => setAttempt(e.target.value)}
                placeholder={isCodeScenario
                  ? 'Write your solution here...'
                  : 'Type your response here...'
                }
                className="w-full min-h-[200px] sm:min-h-[300px] p-3 sm:p-4 bg-surface text-content font-mono text-sm resize-y border-none outline-none"
                autoFocus
              />
            </div>
          </Card>

          {/* Controls */}
          <div className="flex justify-between items-center gap-3 mt-4">
            <Button
              variant="ghost"
              onClick={handleTogglePause}
              leftIcon={isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            >
              {isRunning ? 'Pause' : 'Resume'}
            </Button>

            <Button
              variant="accent"
              onClick={handleSubmit}
              leftIcon={<Send className="w-4 h-4" />}
              disabled={!attempt.trim()}
            >
              Submit Attempt
            </Button>
          </div>
        </>
      )}
    </StepLayout>
  );
}
