import { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../common/Button';
import { Zap, BookOpen, Microscope, ArrowRight, Check } from 'lucide-react';
import type { LearnerPrefs } from '@/types';

type ContentDepth = LearnerPrefs['contentDepth'];

interface DepthStepProps {
  selectedDirection: string;
  onSelect: (depth: ContentDepth) => void;
  isLoading?: boolean;
}

interface DepthOption {
  value: ContentDepth;
  title: string;
  description: string;
  icon: React.ReactNode;
  details: string[];
}

export function DepthStep({ selectedDirection, onSelect, isLoading }: DepthStepProps) {
  const [selected, setSelected] = useState<ContentDepth | null>(null);

  const options: DepthOption[] = [
    {
      value: 'fast',
      title: 'Just enough to use it',
      description: 'Quick, practical learning',
      icon: <Zap className="w-6 h-6" />,
      details: [
        'Short, focused videos',
        'Minimal theory',
        'Quick tasks to apply immediately',
      ],
    },
    {
      value: 'medium',
      title: 'Understand how it works',
      description: 'Balanced theory + practice',
      icon: <BookOpen className="w-6 h-6" />,
      details: [
        'Moderate video length',
        'Core concepts explained',
        'Hands-on projects',
      ],
    },
    {
      value: 'deep',
      title: 'Go deep + edge cases',
      description: 'Comprehensive learning',
      icon: <Microscope className="w-6 h-6" />,
      details: [
        'In-depth content',
        'More foundation cards',
        'Advanced topics covered',
      ],
    },
  ];

  const handleContinue = () => {
    if (selected) {
      onSelect(selected);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          What level of depth do you want?
        </h2>
        <p className="text-gray-600">
          For: <span className="font-medium text-brand-600">{selectedDirection}</span>
        </p>
      </div>

      {/* Depth options */}
      <div className="space-y-3 mb-8">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => setSelected(option.value)}
            className={clsx(
              'w-full text-left p-5 rounded-xl border-2 transition-all duration-200',
              'hover:shadow-md',
              selected === option.value
                ? 'border-brand-500 bg-brand-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-brand-300'
            )}
          >
            <div className="flex items-start gap-4">
              <div
                className={clsx(
                  'flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center',
                  selected === option.value
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-100 text-gray-600'
                )}
              >
                {option.icon}
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-900">{option.title}</h3>
                  {selected === option.value && (
                    <div className="w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-3">{option.description}</p>

                <ul className="space-y-1">
                  {option.details.map((detail, i) => (
                    <li key={i} className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="w-1 h-1 bg-gray-400 rounded-full" />
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </button>
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
        {isLoading ? 'Setting up...' : 'Start learning'}
      </Button>

      {/* Reassurance */}
      <p className="text-center text-xs text-gray-500 mt-4">
        You can adjust these preferences anytime in settings
      </p>
    </div>
  );
}
