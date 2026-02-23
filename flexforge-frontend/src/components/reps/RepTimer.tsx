import { useEffect, useRef } from 'react';
import { Pause, Play } from 'lucide-react';
import { useRepsStore } from '@/stores/repsStore';

interface RepTimerProps {
  estimatedMinutes: number;
}

export function RepTimer({ estimatedMinutes }: RepTimerProps) {
  const { timerSeconds, timerRunning, tickTimer, setTimerRunning } = useRepsStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => {
        tickTimer();
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerRunning, tickTimer]);

  // Auto-start timer
  useEffect(() => {
    setTimerRunning(true);
    return () => setTimerRunning(false);
  }, [setTimerRunning]);

  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  const estimatedSeconds = estimatedMinutes * 60;
  const progress = Math.min(timerSeconds / estimatedSeconds, 1);

  // Color: green → yellow → red as time progresses
  const getColor = () => {
    if (progress < 0.5) return 'text-green-500';
    if (progress < 0.8) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setTimerRunning(!timerRunning)}
        className="p-2 rounded-lg hover:bg-surface-tertiary transition-colors"
      >
        {timerRunning ? (
          <Pause className="w-4 h-4 text-content-secondary" />
        ) : (
          <Play className="w-4 h-4 text-content-secondary" />
        )}
      </button>

      <div className="text-center">
        <span className={`text-lg font-mono font-semibold ${getColor()}`}>
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </span>
        <span className="text-xs text-content-tertiary ml-2">
          / {estimatedMinutes}min
        </span>
      </div>

      {/* Progress ring */}
      <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
        <circle
          cx="18" cy="18" r="15"
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth="3"
        />
        <circle
          cx="18" cy="18" r="15"
          fill="none"
          stroke="currentColor"
          className={getColor()}
          strokeWidth="3"
          strokeDasharray={`${progress * 94.25} 94.25`}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
