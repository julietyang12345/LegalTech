import { useState } from 'react';
import { Button } from '../common/Button';
import { Sparkles, ArrowRight } from 'lucide-react';

interface GoalInputStepProps {
  onSubmit: (goal: string) => void;
  isLoading?: boolean;
}

export function GoalInputStep({ onSubmit, isLoading }: GoalInputStepProps) {
  const [goal, setGoal] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (goal.trim()) {
      onSubmit(goal.trim());
    }
  };

  const examples = [
    'Build a price tracking bot',
    'Automate my workflows with AI',
    'Create a personal portfolio website',
    'Learn data analysis with Python',
  ];

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-full mb-4">
          <Sparkles className="w-8 h-8 text-brand-600" />
        </div>
        <p className="text-sm text-brand-600 font-medium mb-2">
          You don't need to know exactly what you want
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          What do you want to learn or build?
        </h1>
        <p className="text-gray-500 text-sm">
          Describe it however you want. We'll figure it out together.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="I want to..."
            className="w-full px-4 py-4 text-lg border border-gray-300 rounded-xl
                       focus:ring-2 focus:ring-brand-500 focus:border-brand-500
                       placeholder:text-gray-400 resize-none"
            rows={3}
            autoFocus
          />
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          isLoading={isLoading}
          disabled={!goal.trim() || isLoading}
          rightIcon={<ArrowRight className="w-5 h-5" />}
        >
          {isLoading ? 'Finding directions...' : 'Find my learning path'}
        </Button>
      </form>

      <div className="mt-8">
        <p className="text-sm text-gray-500 mb-3 text-center">Examples:</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {examples.map((example) => (
            <button
              key={example}
              onClick={() => setGoal(example)}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200
                         text-gray-700 rounded-full transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
