import { clsx } from 'clsx';

interface ConfidenceSliderProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

const CONFIDENCE_LEVELS = [
  { value: 1, emoji: '😰', label: 'Need help' },
  { value: 2, emoji: '😕', label: 'Shaky' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '💪', label: 'Could teach' },
];

export function ConfidenceSlider({
  value,
  onChange,
  disabled = false,
  className,
}: ConfidenceSliderProps) {
  return (
    <div className={clsx('w-full', className)}>
      <div className="flex gap-2">
        {CONFIDENCE_LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(level.value)}
            className={clsx(
              'flex-1 h-16 rounded-lg border-2 flex flex-col items-center justify-center gap-1',
              'transition-all duration-200',
              disabled && 'opacity-50 cursor-not-allowed',
              value === level.value
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <span className="text-xl">{level.emoji}</span>
            <span className="text-xs font-medium">{level.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface ConfidenceDisplayProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceDisplay({
  value,
  size = 'md',
  showLabel = true,
  className,
}: ConfidenceDisplayProps) {
  const level = CONFIDENCE_LEVELS.find((l) => l.value === value) || CONFIDENCE_LEVELS[2];

  const sizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <span className={sizes[size]}>{level.emoji}</span>
      {showLabel && (
        <span className="text-sm text-gray-600">{level.label}</span>
      )}
    </div>
  );
}
