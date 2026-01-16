import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, RotateCcw, AlertTriangle, X } from 'lucide-react';
import { Card, Button } from '@/components/common';
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
  const { regenerateDayContent } = useSessionStore();
  const { addSystemMessage } = useCompanionStore();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleRegenerateDay = async () => {
    setIsRegenerating(true);
    setShowConfirmModal(false);
    try {
      // This sets isRegenerating: true in the store, triggering full loading screen in SessionPage
      await regenerateDayContent(day.day);
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
          onClick={() => setShowConfirmModal(true)}
          disabled={isRegenerating}
          className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1.5 mx-auto transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          Not satisfied? Regenerate today's content
        </button>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowConfirmModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <h2 className="font-semibold text-gray-900">Regenerate Content?</h2>
                </div>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-gray-700 mb-4">
                  Are you sure you want to regenerate today's content? This will:
                </p>
                <ul className="space-y-2 text-sm text-gray-600 mb-6">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    Clear all quiz and task progress
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    Reset your step completion
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    Generate completely new learning content
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    Clear any practice project submissions
                  </li>
                </ul>
                <p className="text-sm text-gray-500">
                  This action cannot be undone.
                </p>
              </div>

              {/* Footer */}
              <div className="flex gap-3 p-4 border-t border-gray-100">
                <Button
                  variant="secondary"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRegenerateDay}
                  className="flex-1 bg-amber-500 hover:bg-amber-600"
                >
                  Yes, Regenerate
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </StepLayout>
  );
}
