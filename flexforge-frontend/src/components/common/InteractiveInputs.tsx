import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from './Button';
import { Card } from './Card';

// ============================================
// AnimatedReveal - Simple show/hide animation wrapper
// ============================================

interface AnimatedRevealProps {
  show: boolean;
  children: React.ReactNode;
  className?: string;
}

export function AnimatedReveal({ show, children, className }: AnimatedRevealProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================
// RevealableContent - Button + Card reveal wrapper
// ============================================

interface RevealableContentProps {
  children: React.ReactNode;
  buttonLabels?: { show: string; hide: string };
  disabled?: boolean;
  disabledReason?: string;
  cardClassName?: string;
  variant?: 'focus' | 'amber' | 'green' | 'gray';
  defaultVisible?: boolean;
  onToggle?: (visible: boolean) => void;
}

const variantStyles = {
  focus: 'bg-focus-50 border-focus-200',
  amber: 'bg-amber-50 border-amber-200',
  green: 'bg-green-50 border-green-200',
  gray: 'bg-gray-50 border-gray-200',
};

export function RevealableContent({
  children,
  buttonLabels = { show: 'Show Answer', hide: 'Hide Answer' },
  disabled = false,
  disabledReason,
  cardClassName,
  variant = 'focus',
  defaultVisible = false,
  onToggle,
}: RevealableContentProps) {
  const [isVisible, setIsVisible] = useState(defaultVisible);

  const handleToggle = () => {
    const newValue = !isVisible;
    setIsVisible(newValue);
    onToggle?.(newValue);
  };

  return (
    <div className="space-y-3">
      <Button
        variant={isVisible ? 'secondary' : 'primary'}
        size="sm"
        onClick={handleToggle}
        disabled={disabled}
        leftIcon={isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      >
        {isVisible ? buttonLabels.hide : buttonLabels.show}
      </Button>

      {disabled && disabledReason && (
        <p className="text-xs text-gray-400">{disabledReason}</p>
      )}

      <AnimatedReveal show={isVisible}>
        <Card className={clsx('border', variantStyles[variant], cardClassName)}>
          <div className="p-4">
            {children}
          </div>
        </Card>
      </AnimatedReveal>
    </div>
  );
}

// ============================================
// QuickPick - Grid selection with emoji + label
// ============================================

export interface QuickPickOption {
  emoji: string;
  label: string;
  value: string;
}

interface QuickPickProps {
  options: QuickPickOption[];
  selected: string | null;
  onSelect: (value: string) => void;
  columns?: 2 | 4;
}

export function QuickPick({ options, selected, onSelect, columns = 2 }: QuickPickProps) {
  return (
    <div className={clsx(
      'grid gap-2',
      columns === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
    )}>
      {options.map((option) => {
        const isSelected = selected === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={clsx(
              'p-3 rounded-xl transition-all',
              'flex flex-col items-center justify-center text-center',
              'min-h-[80px] h-full',
              isSelected
                ? 'border-[3px] border-brand-500 bg-brand-50 shadow-sm'
                : 'border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            {/* Content wrapper - ensures vertical centering */}
            <div className="flex flex-col items-center justify-center flex-1 w-full">
              {/* Emoji */}
              <span className="text-2xl mb-1.5">{option.emoji}</span>

              {/* Label - wraps and centers */}
              <span className={clsx(
                'text-xs font-medium leading-tight text-center w-full',
                isSelected ? 'text-brand-700' : 'text-gray-600'
              )}>
                {option.label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============================================
// SentenceComplete - Suggestions + custom input
// ============================================

interface SentenceCompleteProps {
  suggestions: string[];
  value: string;
  onChange: (value: string) => void;
  prefix: string;
}

export function SentenceComplete({ suggestions, value, onChange, prefix }: SentenceCompleteProps) {
  const [showCustom, setShowCustom] = useState(false);
  const isCustom = !!value && !suggestions.includes(value);

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600 mb-3">{prefix}</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => {
              onChange(suggestion);
              setShowCustom(false);
            }}
            className={clsx(
              'px-3 py-2 rounded-lg text-sm transition-all',
              value === suggestion
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {suggestion}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(true)}
          className={clsx(
            'px-3 py-2 rounded-lg text-sm transition-all',
            isCustom
              ? 'bg-brand-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          Custom...
        </button>
      </div>

      <AnimatedReveal show={showCustom || isCustom}>
        <input
          type="text"
          value={isCustom ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your own..."
          className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm
                    focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          autoFocus
        />
      </AnimatedReveal>
    </div>
  );
}
