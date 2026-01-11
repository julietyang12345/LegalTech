import { useState } from 'react';
import { Button } from '../common/Button';
import { DirectionCard } from './DirectionCard';
import { ArrowRight, RefreshCw, HelpCircle } from 'lucide-react';
import type { LearningDirection } from '@/types';

interface DirectionsStepProps {
  directions: LearningDirection[];
  interpretedGoal: string;
  onSelect: (direction: LearningDirection) => void;
  onRefine: () => void;
  isLoading?: boolean;
}

export function DirectionsStep({
  directions,
  interpretedGoal,
  onSelect,
  onRefine,
  isLoading,
}: DirectionsStepProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showExplanations, setShowExplanations] = useState(false);

  const selectedDirection = directions.find((d) => d.id === selectedId);

  const handleContinue = () => {
    if (selectedDirection) {
      onSelect(selectedDirection);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Interpreted goal */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <p className="text-sm text-gray-600">
          <span className="font-medium">Here's what I understood:</span>{' '}
          <span className="text-gray-900">{interpretedGoal}</span>
        </p>
      </div>

      {/* Question */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Is this what you had in mind?
        </h2>
        <p className="text-gray-600">
          Pick the direction that best matches your learning goal
        </p>
      </div>

      {/* Direction cards */}
      <div className="space-y-3 mb-6">
        {directions.map((direction) => (
          <DirectionCard
            key={direction.id}
            direction={direction}
            isSelected={selectedId === direction.id}
            onClick={() => setSelectedId(direction.id)}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="space-y-3">
        <Button
          size="lg"
          className="w-full"
          disabled={!selectedDirection || isLoading}
          onClick={handleContinue}
          rightIcon={<ArrowRight className="w-5 h-5" />}
        >
          Yes, this is it
        </Button>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onRefine}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Not quite
          </Button>
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => setShowExplanations(!showExplanations)}
            leftIcon={<HelpCircle className="w-4 h-4" />}
          >
            {showExplanations ? 'Hide details' : 'What do these mean?'}
          </Button>
        </div>
      </div>

      {/* Explanations panel */}
      {showExplanations && (
        <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <h3 className="font-semibold text-blue-900 mb-3">Understanding the directions</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-xs">
                Concept
              </span>
              <p className="text-blue-800">
                Teaches principles that work across tools. Great for building transferable
                understanding.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs">
                Tool-specific
              </span>
              <p className="text-blue-800">
                Focuses on a specific tool or platform. Choose this if you know exactly
                what you'll use.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs text-blue-600">Time estimates</span>
              <p className="text-blue-800">
                How long it takes to learn the basics. Actual sessions adapt to your pace.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
