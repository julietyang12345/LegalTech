import { clsx } from 'clsx';
import { Flame, Trophy, Zap } from 'lucide-react';

interface StreakBadgeProps {
  count: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
}

export function StreakBadge({
  count,
  showLabel = true,
  size = 'md',
  animated = false,
  className,
}: StreakBadgeProps) {
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1.5',
        'bg-gradient-to-r from-alert-500 to-orange-500',
        'text-white font-semibold rounded-full',
        sizes[size],
        animated && 'animate-pulse-soft',
        className
      )}
    >
      <Flame className={iconSizes[size]} />
      <span>{count}</span>
      {showLabel && <span className="hidden sm:inline">day streak</span>}
    </div>
  );
}

interface MilestoneBadgeProps {
  type: 'streak' | 'projects' | 'days';
  value: number;
  label: string;
  className?: string;
}

export function MilestoneBadge({ type, value, label, className }: MilestoneBadgeProps) {
  const icons = {
    streak: Flame,
    projects: Trophy,
    days: Zap,
  };

  const colors = {
    streak: 'from-alert-500 to-orange-500',
    projects: 'from-purple-500 to-pink-500',
    days: 'from-blue-500 to-cyan-500',
  };

  const Icon = icons[type];

  return (
    <div
      className={clsx(
        'flex flex-col items-center gap-1 p-4 rounded-xl',
        'bg-gradient-to-br',
        colors[type],
        'text-white',
        className
      )}
    >
      <Icon className="w-6 h-6" />
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs opacity-90">{label}</span>
    </div>
  );
}
