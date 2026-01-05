import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { Card } from '@/components/common';
import type { CurriculumDay, Session } from '@/types';

interface PrePromptStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

export function PrePromptStep({ day }: PrePromptStepProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full 
                       bg-gradient-to-br from-brand-400 to-brand-500 mb-4">
          <Lightbulb className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Get Ready 🧠
        </h1>
        <p className="text-gray-600">
          Take 30 seconds to prime your brain
        </p>
      </div>

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

    </div>
  );
}
