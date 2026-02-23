import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/common';

interface RepsIntakeProps {
  onComplete: (data: { background: string; target: string; struggle: string }) => void;
  isLoading?: boolean;
}

const QUESTIONS = [
  {
    key: 'background' as const,
    label: 'What\'s your background?',
    subtitle: 'Where are you at with programming or your skill area?',
    placeholder: 'e.g. I\'ve been learning JavaScript for 6 months, mostly tutorials and courses...',
  },
  {
    key: 'target' as const,
    label: 'What do you want to be able to do?',
    subtitle: 'What does "good enough" look like for you right now?',
    placeholder: 'e.g. I want to be able to build a full-stack app on my own without getting stuck...',
  },
  {
    key: 'struggle' as const,
    label: 'What keeps tripping you up?',
    subtitle: 'What\'s the gap between where you are and where you want to be?',
    placeholder: 'e.g. I understand concepts in tutorials but can\'t apply them to real projects...',
  },
];

export function RepsIntake({ onComplete, isLoading }: RepsIntakeProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    background: '',
    target: '',
    struggle: '',
  });

  const currentQ = QUESTIONS[step];
  const currentValue = answers[currentQ.key];
  const isLast = step === QUESTIONS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete(answers);
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Progress bar */}
      <div className="flex gap-2 mb-8">
        {QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= step ? 'bg-brand-500' : 'bg-border'
            }`}
          />
        ))}
      </div>

      <motion.div
        key={step}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h2 className="text-2xl font-bold text-content mb-2">
          {currentQ.label}
        </h2>
        <p className="text-content-tertiary mb-6">
          {currentQ.subtitle}
        </p>

        <textarea
          value={currentValue}
          onChange={(e) => setAnswers(prev => ({ ...prev, [currentQ.key]: e.target.value }))}
          placeholder={currentQ.placeholder}
          rows={4}
          autoFocus
          className="w-full px-4 py-4 text-lg border border-border rounded-xl
                     bg-surface text-content
                     focus:ring-2 focus:ring-brand-500 focus:border-brand-500
                     placeholder:text-content-tertiary resize-none"
        />

        <div className="flex items-center justify-between mt-6">
          {step > 0 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="text-sm text-content-tertiary hover:text-content-secondary"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          <Button
            onClick={handleNext}
            disabled={!currentValue.trim() || isLoading}
            isLoading={isLoading && isLast}
            rightIcon={!isLoading ? <ArrowRight className="w-4 h-4" /> : undefined}
          >
            {isLast ? 'Start practicing' : 'Next'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
