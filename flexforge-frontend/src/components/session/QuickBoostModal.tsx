import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lightbulb, CheckCircle, XCircle, Loader2, Sparkles } from 'lucide-react';
import { Button, Card } from '@/components/common';
import type { ConceptBoost } from '@/types';

interface QuickBoostModalProps {
  isOpen: boolean;
  onClose: () => void;
  boost: ConceptBoost | null;
  isLoading: boolean;
  onComplete: () => void;
}

export function QuickBoostModal({
  isOpen,
  onClose,
  boost,
  isLoading,
  onComplete,
}: QuickBoostModalProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleAnswer = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
    setShowResult(true);
  };

  const isCorrect = selectedAnswer === boost?.quickCheck.correctIndex;

  const handleComplete = () => {
    setSelectedAnswer(null);
    setShowResult(false);
    onComplete();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <Lightbulb className="w-4 h-4 text-amber-600" />
              </div>
              <h2 className="font-semibold text-gray-900">Quick Boost</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin mb-4" />
                <p className="text-gray-600">Generating a fresh explanation...</p>
                <p className="text-sm text-gray-400 mt-1">This takes just a few seconds</p>
              </div>
            ) : boost ? (
              <>
                {/* Concept title */}
                <div className="text-center">
                  <span className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-sm font-medium">
                    <Sparkles className="w-4 h-4" />
                    {boost.concept}
                  </span>
                </div>

                {/* New explanation */}
                <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
                  <div className="p-4">
                    <h3 className="font-medium text-gray-900 mb-2">Let's try a different angle:</h3>
                    <p className="text-gray-700">{boost.explanation}</p>
                  </div>
                </Card>

                {/* Analogy */}
                {boost.analogy && (
                  <Card>
                    <div className="p-4">
                      <h3 className="font-medium text-gray-900 mb-2">Think of it like this:</h3>
                      <p className="text-gray-600 italic">"{boost.analogy}"</p>
                    </div>
                  </Card>
                )}

                {/* Code example */}
                {boost.codeExample && (
                  <Card>
                    <div className="p-4">
                      <h3 className="font-medium text-gray-900 mb-2">Quick example:</h3>
                      <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg text-sm overflow-x-auto">
                        <code>{boost.codeExample}</code>
                      </pre>
                    </div>
                  </Card>
                )}

                {/* Quick check question */}
                <Card className="border-2 border-brand-100">
                  <div className="p-4">
                    <h3 className="font-medium text-gray-900 mb-3">Quick check:</h3>
                    <p className="text-gray-700 mb-4">{boost.quickCheck.question}</p>

                    <div className="space-y-2">
                      {boost.quickCheck.options.map((option, index) => {
                        const isSelected = selectedAnswer === index;
                        const isCorrectOption = index === boost.quickCheck.correctIndex;

                        let optionClass = 'border-gray-200 hover:border-brand-300 hover:bg-brand-50';
                        if (showResult) {
                          if (isCorrectOption) {
                            optionClass = 'border-green-500 bg-green-50';
                          } else if (isSelected && !isCorrectOption) {
                            optionClass = 'border-red-500 bg-red-50';
                          } else {
                            optionClass = 'border-gray-200 opacity-50';
                          }
                        } else if (isSelected) {
                          optionClass = 'border-brand-500 bg-brand-50';
                        }

                        return (
                          <button
                            key={index}
                            onClick={() => handleAnswer(index)}
                            disabled={showResult}
                            className={`w-full text-left p-3 rounded-lg border-2 transition-all ${optionClass}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-gray-700">{option}</span>
                              {showResult && isCorrectOption && (
                                <CheckCircle className="w-5 h-5 text-green-500" />
                              )}
                              {showResult && isSelected && !isCorrectOption && (
                                <XCircle className="w-5 h-5 text-red-500" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Result feedback */}
                    {showResult && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4"
                      >
                        <Card className={isCorrect ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}>
                          <div className="p-3">
                            <p className={`font-medium ${isCorrect ? 'text-green-700' : 'text-amber-700'}`}>
                              {isCorrect ? '🎉 Got it!' : '💡 Almost!'}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {boost.quickCheck.explanation}
                            </p>
                          </div>
                        </Card>
                      </motion.div>
                    )}
                  </div>
                </Card>
              </>
            ) : null}
          </div>

          {/* Footer */}
          {!isLoading && boost && showResult && (
            <div className="p-4 border-t border-gray-100">
              <Button
                onClick={handleComplete}
                className="w-full"
              >
                {isCorrect ? 'Great! Continue' : 'Got it! Continue'}
              </Button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
