import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, RotateCcw, Loader2 } from 'lucide-react';
import { Card } from '@/components/common';
import { StepLayout } from './StepLayout';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import type { CurriculumDay, Session } from '@/types';

interface PrePromptStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

export function PrePromptStep({ day }: PrePromptStepProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const { loadDayCoreContent, setCurrentStep } = useSessionStore();
  const { addSystemMessage } = useCompanionStore();

  const handleRegenerateDay = async () => {
    setIsRegenerating(true);
    try {
      await loadDayCoreContent(day.day);
      setCurrentStep('prePrompt');
      addSystemMessage(
        '✨ Fresh content generated! Ready to learn something new.',
        'encouraging'
      );
    } catch (err) {
      console.error('Failed to regenerate day:', err);
      addSystemMessage(
        'Failed to regenerate content. Please try again.',
        'supportive'
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <StepLayout
      icon={Lightbulb}
      iconGradient="from-brand-400 to-brand-500"
      title="Get Ready 🧠"
      subtitle="Take 30 seconds to prime your brain"
    >
      {/* Pre-prompt content */}
      <Card className="bg-gradient-to-br from-brand-50 to-white border border-brand-100">
        <div className="p-6">
          <p className="text-lg text-gray-800 leading-relaxed mb-6">
            {day.prePrompt?.text || `Today you'll learn something new about ${day.title}`}
          </p>

          {/* Prime questions */}
          {day.prePrompt?.primeQuestions && day.prePrompt.primeQuestions.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-gray-700">Think about:</h3>
              {day.prePrompt.primeQuestions.map((question, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.2 }}
                  className="flex items-start gap-3 p-3 bg-white rounded-lg border border-brand-100"
                >
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100
                                 flex items-center justify-center text-sm font-medium text-brand-600">
                    {index + 1}
                  </span>
                  <p className="text-gray-700">{question}</p>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Tip */}
      <div className="text-center text-sm text-gray-500">
        💡 Don't worry about knowing the answers yet - just let your brain start connecting!
      </div>

      {/* Regenerate Day Content */}
      <div className="pt-4 border-t border-gray-100">
        <button
          onClick={handleRegenerateDay}
          disabled={isRegenerating}
          className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1.5 mx-auto
                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRegenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RotateCcw className="w-4 h-4" />
          )}
          {isRegenerating ? 'Regenerating content...' : "Not satisfied? Regenerate today's content"}
        </button>
      </div>
    </StepLayout>
  );
}
