import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Briefcase, Cpu, MessageSquare, GraduationCap } from 'lucide-react';
import { GoalType } from '@/types';
import { getAllModeConfigs } from '@/config/training-configs';

interface ModeSelectStepProps {
  onSelect: (goalType: GoalType) => void;
}

const MODE_ICONS: Record<string, React.ElementType> = {
  [GoalType.CURRICULUM]: BookOpen,
  [GoalType.PROJECT]: Briefcase,
  [GoalType.AI_BUILDER]: Cpu,
  [GoalType.INTERVIEW]: GraduationCap,
  [GoalType.LANGUAGE]: MessageSquare,
};

const MODE_COLORS: Record<string, string> = {
  [GoalType.CURRICULUM]: 'from-brand-500 to-brand-600',
  [GoalType.PROJECT]: 'from-amber-500 to-orange-600',
  [GoalType.AI_BUILDER]: 'from-purple-500 to-purple-600',
  [GoalType.INTERVIEW]: 'from-green-500 to-emerald-600',
  [GoalType.LANGUAGE]: 'from-blue-500 to-blue-600',
};

const MODE_BORDER_COLORS: Record<string, string> = {
  [GoalType.CURRICULUM]: 'border-brand-200 hover:border-brand-400',
  [GoalType.PROJECT]: 'border-amber-200 hover:border-amber-400',
  [GoalType.AI_BUILDER]: 'border-purple-200 hover:border-purple-400',
  [GoalType.INTERVIEW]: 'border-green-200 hover:border-green-400',
  [GoalType.LANGUAGE]: 'border-blue-200 hover:border-blue-400',
};

export function ModeSelectStep({ onSelect }: ModeSelectStepProps) {
  const [selected, setSelected] = useState<GoalType | null>(null);
  const configs = getAllModeConfigs();

  const handleSelect = (goalType: GoalType) => {
    setSelected(goalType);
    // Brief delay for visual feedback before advancing
    setTimeout(() => onSelect(goalType), 300);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-content mb-2">
          How do you want to learn?
        </h2>
        <p className="text-content-secondary">
          Pick a mode. You can always switch later.
        </p>
      </div>

      <div className="space-y-3">
        {configs.map((config, index) => {
          const Icon = MODE_ICONS[config.goalType] || BookOpen;
          const gradient = MODE_COLORS[config.goalType] || 'from-gray-500 to-gray-600';
          const borderColor = MODE_BORDER_COLORS[config.goalType] || 'border-gray-200 hover:border-gray-400';
          const isSelected = selected === config.goalType;

          return (
            <motion.button
              key={config.goalType}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              onClick={() => handleSelect(config.goalType)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200
                ${isSelected
                  ? 'border-brand-500 bg-brand-50 shadow-md scale-[1.02]'
                  : `bg-surface ${borderColor} hover:shadow-sm`
                }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-content text-lg">{config.name}</h3>
                  <p className="text-sm text-content-secondary line-clamp-1">{config.subtitle}</p>
                </div>
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
