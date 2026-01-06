import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Eye, EyeOff, CheckCircle2, Sparkles, Lock } from 'lucide-react';
import { Card, Button, TextArea } from '@/components/common';
import { useAuthStore } from '@/stores/authStore';
import { QuotaTier } from '@/types';
import type { CurriculumDay, Session } from '@/types';

interface ActiveRecallStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

export function ActiveRecallStep({ day }: ActiveRecallStepProps) {
  const [userExplanation, setUserExplanation] = useState('');
  const [showKeyPoints, setShowKeyPoints] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const { hasTierAccess } = useAuthStore();
  const canGetAIReview = hasTierAccess(QuotaTier.PRO);

  const activeRecall = day.activeRecall;
  const instruction = activeRecall?.part1?.instruction || 'Explain what you just learned in your own words (3 sentences)';

  // Use AI video summary if available, fallback to Claude's keyPointsToInclude
  const videoSummary = day.video?.summary;
  const keyPoints = activeRecall?.part1?.keyPointsToInclude || [];

  const handleAIReview = async () => {
    setIsReviewing(true);
    // Simulate AI review
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsReviewing(false);
    setShowKeyPoints(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full 
                       bg-gradient-to-br from-purple-400 to-purple-500 mb-4">
          <Brain className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Active Recall 🧠
        </h1>
        <p className="text-gray-600">
          Write before you peek - this is how learning sticks!
        </p>
      </div>

      {/* Instruction */}
      <Card className="bg-purple-50 border border-purple-100">
        <div className="p-4">
          <p className="text-purple-800 font-medium">{instruction}</p>
        </div>
      </Card>

      {/* User's explanation */}
      <Card>
        <div className="p-6">
          <TextArea
            label="Your explanation"
            placeholder="In my own words, I learned that..."
            value={userExplanation}
            onChange={(e) => setUserExplanation(e.target.value)}
            maxLength={500}
            showCount
            className="min-h-[150px]"
          />

          {/* Actions */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500">
              ✨ Write first, then reveal key points
            </p>

            <div className="flex gap-2">
              {/* AI Review (PRO) */}
              {canGetAIReview ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAIReview}
                  isLoading={isReviewing}
                  disabled={userExplanation.length < 50}
                  leftIcon={<Sparkles className="w-4 h-4" />}
                >
                  AI Review
                </Button>
              ) : (
                <div className="flex items-center gap-1 text-sm text-gray-400">
                  <Lock className="w-3 h-3" />
                  AI Review (PRO)
                </div>
              )}

              {/* Show answer */}
              <Button
                variant={showKeyPoints ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => setShowKeyPoints(!showKeyPoints)}
                disabled={userExplanation.length < 50}
                leftIcon={showKeyPoints ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              >
                {showKeyPoints ? 'Hide Answer' : 'Check My Understanding'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Key points reveal */}
      <AnimatePresence>
        {showKeyPoints && (videoSummary || keyPoints.length > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="bg-focus-50 border border-focus-200">
              <div className="p-6">
                <h3 className="font-semibold text-focus-800 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  {videoSummary ? 'Video Summary' : 'Key points to include:'}
                </h3>

                {/* AI Video Summary (preferred) */}
                {videoSummary ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-focus-800 leading-relaxed"
                  >
                    {videoSummary}
                  </motion.p>
                ) : (
                  /* Fallback to key points list */
                  <ul className="space-y-3">
                    {keyPoints.map((point, index) => (
                      <motion.li
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-start gap-3"
                      >
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-focus-200
                                       flex items-center justify-center text-sm font-medium text-focus-700">
                          {index + 1}
                        </span>
                        <p className="text-focus-800">{point}</p>
                      </motion.li>
                    ))}
                  </ul>
                )}

                {/* Self-check */}
                <div className="mt-6 p-4 bg-white rounded-lg">
                  <p className="text-sm text-gray-600">
                    <strong>Self-check:</strong> Did your explanation cover these points?
                    It's okay if you missed some - that's what we're here to learn!
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Encouragement */}
      {userExplanation.length >= 50 && !showKeyPoints && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sm text-gray-500"
        >
          💪 Great effort! Now reveal the key points to compare.
        </motion.div>
      )}
    </div>
  );
}
