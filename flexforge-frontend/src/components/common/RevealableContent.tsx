import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';
import { clsx } from 'clsx';

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

      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className={clsx('border', variantStyles[variant], cardClassName)}>
              <div className="p-4">
                {children}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
