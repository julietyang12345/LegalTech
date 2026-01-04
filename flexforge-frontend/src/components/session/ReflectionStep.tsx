import { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Sparkles, Lock } from 'lucide-react';
import { Card, Button, TextArea, ConfidenceSlider } from '@/components/common';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { QuotaTier } from '@/types';
import type { CurriculumDay, Session } from '@/types';

interface ReflectionStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

export function ReflectionStep({ day, session }: ReflectionStepProps) {
  const [confidence, setConfidence] = useState<number | null>(null);
  const [whatClicked, setWhatClicked] = useState('');
  const [whatsFoggy, setWhatsFoggy] = useState('');
  const [oneSentence, setOneSentence] = useState('');
  const [warmupPlan, setWarmupPlan] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  const { hasTierAccess } = useAuthStore();
  const { updateTaskProgress } = useSessionStore();
  const canGetAIAnalysis = hasTierAccess(QuotaTier.PRO);

  const reflectionQuestions = day.reflection?.questions || [
    { id: 1, question: 'Confidence level (1-5)?' },
    { id: 2, question: 'What clicked today?' },
    { id: 3, question: "What's still foggy?" },
    { id: 4, question: 'Explain today in 1 sentence' },
    { id: 5, question: "Tomorrow's 5-min warm-up plan?" },
  ];

  const handleAIAnalysis = async () => {
    if (!canGetAIAnalysis) return;
    
    setIsAnalyzing(true);
    // Simulate AI analysis
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setAiAnalysis(
      confidence && confidence >= 4
        ? "🎯 Great confidence! Based on your responses, you've got a solid grasp of today's concepts. Tomorrow, try explaining this to someone else to really cement it!"
        : confidence && confidence < 3
        ? "💪 It's okay to feel uncertain - that's part of learning! Focus your tomorrow's warm-up on the foggy areas you mentioned. Consider re-watching the video section on this topic."
        : "👍 Good self-awareness! Your reflection shows you're thinking deeply about the material. Keep building on what clicked!"
    );
    setIsAnalyzing(false);
  };

  const handleSaveReflection = async () => {
    if (!confidence) return;

    try {
      await updateTaskProgress(`day${day.day}-reflection`, {
        completed: true,
        confidenceScore: confidence,
      });
    } catch (error) {
      console.error('Failed to save reflection:', error);
    }
  };

  // Calculate if all fields are filled
  const isComplete = confidence !== null && 
    whatClicked.length > 0 && 
    whatsFoggy.length > 0 && 
    oneSentence.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full 
                       bg-gradient-to-br from-indigo-400 to-indigo-500 mb-4">
          <BookOpen className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Daily Reflection 📝
        </h1>
        <p className="text-gray-600">
          Metacognition = better learning (it's science!)
        </p>
      </div>

      {/* Confidence slider */}
      <Card>
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">
            How confident do you feel about today's material?
          </h3>
          <ConfidenceSlider
            value={confidence}
            onChange={setConfidence}
          />
        </div>
      </Card>

      {/* What clicked */}
      <Card>
        <div className="p-6">
          <TextArea
            label="What clicked today? 💡"
            placeholder="The thing that made the most sense was..."
            value={whatClicked}
            onChange={(e) => setWhatClicked(e.target.value)}
            hint="Even small wins count!"
            className="min-h-[80px]"
          />
        </div>
      </Card>

      {/* What's foggy */}
      <Card>
        <div className="p-6">
          <TextArea
            label="What's still foggy? 🌫️"
            placeholder="I'm still unsure about..."
            value={whatsFoggy}
            onChange={(e) => setWhatsFoggy(e.target.value)}
            hint="Be honest - this helps us adapt your learning!"
            className="min-h-[80px]"
          />
        </div>
      </Card>

      {/* One sentence summary */}
      <Card>
        <div className="p-6">
          <TextArea
            label="Explain today in one sentence ✍️"
            placeholder="Today I learned that..."
            value={oneSentence}
            onChange={(e) => setOneSentence(e.target.value)}
            hint="Teaching = learning. Pretend you're explaining to a friend."
            maxLength={200}
            showCount
            className="min-h-[60px]"
          />
        </div>
      </Card>

      {/* Tomorrow's warm-up */}
      <Card>
        <div className="p-6">
          <TextArea
            label="Tomorrow's 5-minute warm-up plan 🌅"
            placeholder="To prepare for tomorrow, I'll quickly..."
            value={warmupPlan}
            onChange={(e) => setWarmupPlan(e.target.value)}
            hint="Planning ahead makes starting easier!"
            className="min-h-[60px]"
          />
        </div>
      </Card>

      {/* AI Analysis (PRO feature) */}
      <div className="space-y-3">
        {canGetAIAnalysis ? (
          <>
            <Button
              variant="secondary"
              onClick={handleAIAnalysis}
              isLoading={isAnalyzing}
              disabled={!isComplete}
              leftIcon={<Sparkles className="w-4 h-4" />}
              className="w-full"
            >
              Get AI Analysis & Study Plan
            </Button>

            {aiAnalysis && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="bg-indigo-50 border border-indigo-200">
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                      <div>
                        <h4 className="font-medium text-indigo-800 mb-2">AI Analysis</h4>
                        <p className="text-indigo-700">{aiAnalysis}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400 p-4">
            <Lock className="w-4 h-4" />
            <span>AI Analysis & Study Plan (PRO feature)</span>
          </div>
        )}
      </div>

      {/* Auto-adjust notice */}
      {confidence !== null && confidence < 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Card className="bg-amber-50 border border-amber-200">
            <div className="p-4 text-center">
              <p className="text-sm text-amber-700">
                🎯 <strong>Note:</strong> Based on your confidence, we may add extra practice 
                to tomorrow's session to reinforce today's concepts.
              </p>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Summary */}
      <div className="text-center text-sm text-gray-500 p-4 bg-gray-50 rounded-lg">
        <p>
          🧠 Research shows that students who reflect on their learning retain 
          <strong> 23% more</strong> than those who don't.
        </p>
      </div>
    </div>
  );
}
