import { useState } from 'react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { Button } from '../common/Button';
import { ArrowRight, Check, Target } from 'lucide-react';
import type { Aspiration, SkillType } from '@/types';
import { getAspirationsForSkillType } from '@/types';

interface AspirationStepProps {
  skillType?: SkillType;
  onSelect: (aspiration: Aspiration) => void;
  isLoading?: boolean;
}

export function AspirationStep({ skillType, onSelect, isLoading }: AspirationStepProps) {
  const [selected, setSelected] = useState<Aspiration | null>(null);

  const aspirations = getAspirationsForSkillType(skillType);

  const handleContinue = () => {
    if (selected) {
      onSelect(selected);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-50 rounded-full mb-4">
          <Target className="w-6 h-6 text-brand-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          Who do you want to become?
        </h2>
        <p className="text-gray-600">
          We'll show you the proof as you get there.
        </p>
      </div>

      {/* Aspiration cards */}
      <div className="space-y-3 mb-8">
        {aspirations.map((aspiration, index) => (
          <motion.button
            key={aspiration.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => setSelected(aspiration)}
            className={clsx(
              'w-full relative p-5 rounded-xl border-2 text-left transition-all',
              'hover:border-brand-300 hover:shadow-sm',
              selected?.id === aspiration.id
                ? 'border-brand-500 bg-brand-50/50'
                : 'border-gray-200 bg-white'
            )}
          >
            {/* Selection indicator */}
            {selected?.id === aspiration.id && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-4 right-4 w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center"
              >
                <Check className="w-4 h-4 text-white" />
              </motion.div>
            )}

            {/* Aspiration name */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-semibold text-gray-900">
                {aspiration.name}
              </span>
            </div>

            {/* Statement */}
            <p className="text-gray-600 text-sm leading-relaxed">
              "{aspiration.statement}"
            </p>
          </motion.button>
        ))}
      </div>

      {/* Continue button */}
      <Button
        size="lg"
        className="w-full"
        disabled={!selected || isLoading}
        onClick={handleContinue}
        isLoading={isLoading}
        rightIcon={<ArrowRight className="w-5 h-5" />}
      >
        This is what I'm working toward
      </Button>

      {/* Reassurance */}
      <p className="text-center text-xs text-gray-400 mt-4">
        As you progress, we'll show you concrete proof of who you're becoming.
      </p>
    </div>
  );
}
