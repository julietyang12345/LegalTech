import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, Eye, EyeOff, Lightbulb } from 'lucide-react';
import { Card, Button, TextArea } from '@/components/common';
import type { CurriculumDay, Session } from '@/types';

interface MemoryBridgeStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

export function MemoryBridgeStep({ day, session }: MemoryBridgeStepProps) {
  const [recallAnswer, setRecallAnswer] = useState('');
  const [connectionAnswer, setConnectionAnswer] = useState('');
  const [showYesterdayAnswer, setShowYesterdayAnswer] = useState(false);
  const [showConnectionExample, setShowConnectionExample] = useState(false);

  const memoryBridge = day.activeRecall?.part2;
  const yesterdayQuestion = memoryBridge?.yesterdayQuestion || "What did you learn yesterday?";
  const yesterdayAnswer = memoryBridge?.yesterdayAnswer || "";
  const connectionQuestion = memoryBridge?.connectionQuestion || "How does yesterday's concept connect to today's?";
  const exampleConnection = memoryBridge?.exampleConnection || "";

  // Get previous day info
  const previousDay = session.curriculum.days.find(d => d.day === day.day - 1);
  const previousTopic = previousDay?.title?.split(':')[1]?.trim() || 'yesterday\'s concept';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full 
                       bg-gradient-to-br from-cyan-400 to-cyan-500 mb-4">
          <Link2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Memory Bridge 🌉
        </h1>
        <p className="text-gray-600">
          Connect today's learning to yesterday's
        </p>
      </div>

      {/* Yesterday's recall */}
      <Card>
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-100 
                           flex items-center justify-center text-lg">
              🌫️
            </span>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Yesterday's Fog</h3>
              <p className="text-sm text-gray-600">
                Quick! What do you remember about <span className="font-medium text-cyan-600">{previousTopic}</span>?
              </p>
            </div>
          </div>

          <p className="text-gray-700 mb-4 font-medium">{yesterdayQuestion}</p>

          <TextArea
            placeholder="From memory, I remember..."
            value={recallAnswer}
            onChange={(e) => setRecallAnswer(e.target.value)}
            className="min-h-[80px]"
          />

          {/* Reveal yesterday's answer */}
          <div className="flex justify-end mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowYesterdayAnswer(!showYesterdayAnswer)}
              disabled={recallAnswer.length < 10}
              leftIcon={showYesterdayAnswer ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            >
              {showYesterdayAnswer ? 'Hide' : 'Check'} Answer
            </Button>
          </div>

          <AnimatePresence>
            {showYesterdayAnswer && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 p-4 bg-cyan-50 rounded-lg border border-cyan-200"
              >
                <p className="text-cyan-800">{yesterdayAnswer}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>

      {/* Connection question */}
      <Card>
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 
                           flex items-center justify-center text-lg">
              🔗
            </span>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Make the Connection</h3>
              <p className="text-sm text-gray-600">
                This is the magic - connecting concepts makes them stick!
              </p>
            </div>
          </div>

          <p className="text-gray-700 mb-4 font-medium">{connectionQuestion}</p>

          <TextArea
            placeholder="I think they connect because..."
            value={connectionAnswer}
            onChange={(e) => setConnectionAnswer(e.target.value)}
            className="min-h-[80px]"
          />

          {/* Show example connection */}
          <div className="flex justify-end mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConnectionExample(!showConnectionExample)}
              disabled={connectionAnswer.length < 10}
              leftIcon={<Lightbulb className="w-4 h-4" />}
            >
              {showConnectionExample ? 'Hide' : 'See'} Example
            </Button>
          </div>

          <AnimatePresence>
            {showConnectionExample && exampleConnection && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200"
              >
                <p className="text-sm text-purple-600 font-medium mb-2">Example connection:</p>
                <p className="text-purple-800">{exampleConnection}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>

      {/* Why this matters */}
      <div className="text-center p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600">
          <strong>Why this matters:</strong> Interleaving (mixing topics) improves retention by 200-400% 
          compared to studying one topic at a time!
        </p>
      </div>
    </div>
  );
}
