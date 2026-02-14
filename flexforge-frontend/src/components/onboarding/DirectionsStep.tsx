import { useState } from 'react';
import { Button } from '../common/Button';
import { DirectionCard } from './DirectionCard';
import { ArrowRight, RefreshCw } from 'lucide-react';
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

  const selectedDirection = directions.find((d) => d.id === selectedId);

  const handleContinue = () => {
    if (selectedDirection) {
      onSelect(selectedDirection);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Interpreted goal */}
      <div className="bg-surface-secondary rounded-xl p-4 mb-6">
        <p className="text-sm text-content-secondary">
          <span className="font-medium">Here's what I understood:</span>{' '}
          <span className="text-content">{interpretedGoal}</span>
        </p>
      </div>

      {/* Question */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-content mb-2">
          Is this what you had in mind?
        </h2>
        <p className="text-content-secondary">
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

        <Button
          variant="secondary"
          className="w-full"
          onClick={onRefine}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Not quite
        </Button>
      </div>
    </div>
  );
}
