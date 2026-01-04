import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, ArrowRight, CheckCircle2, Code2 } from 'lucide-react';
import { Card, Button, TextArea, ProgressBar } from '@/components/common';
import { useCompanionStore } from '@/stores/companionStore';
import type { CurriculumDay, Session } from '@/types';

interface BossMilestoneStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

export function BossMilestoneStep({ day, session }: BossMilestoneStepProps) {
  const [code, setCode] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { addSystemMessage } = useCompanionStore();

  const milestone = day.bossMilestone;
  
  // Find the next boss project
  const nextBoss = session.curriculum.bossProjects.find(
    b => b.day > day.day
  ) || session.curriculum.bossProjects[session.curriculum.bossProjects.length - 1];
  
  const daysUntilBoss = nextBoss ? nextBoss.day - day.day : 0;
  const progressPercent = nextBoss 
    ? ((day.day - (nextBoss.day - nextBoss.combinesDays.length)) / nextBoss.combinesDays.length) * 100
    : 50;

  const handleSubmit = () => {
    setIsSubmitted(true);
    addSystemMessage(
      `🎯 Boss milestone saved! You're ${daysUntilBoss} day${daysUntilBoss !== 1 ? 's' : ''} away from completing "${nextBoss?.title}"!`,
      'encouraging'
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full 
                       bg-gradient-to-br from-purple-400 to-pink-500 mb-4">
          <Trophy className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Boss Milestone 🏆
        </h1>
        <p className="text-gray-600">
          Build a piece of your portfolio project today
        </p>
      </div>

      {/* Progress toward boss project */}
      <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
                <Trophy className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{nextBoss?.title || 'Boss Project'}</h3>
                <p className="text-sm text-gray-500">
                  {daysUntilBoss > 0 ? `${daysUntilBoss} day${daysUntilBoss !== 1 ? 's' : ''} away` : 'Due today!'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-purple-600">
                {Math.round(progressPercent)}%
              </span>
              <p className="text-xs text-gray-500">complete</p>
            </div>
          </div>

          <ProgressBar
            value={progressPercent}
            max={100}
            color="brand"
            animated
          />

          {/* Day progress visualization */}
          <div className="flex items-center justify-between mt-4">
            {nextBoss?.combinesDays.map((d, index) => {
              const isComplete = d < day.day;
              const isCurrent = d === day.day;
              
              return (
                <div key={d} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    isComplete ? 'bg-purple-500 text-white' :
                    isCurrent ? 'bg-purple-200 text-purple-700 ring-2 ring-purple-500' :
                    'bg-gray-200 text-gray-500'
                  }`}>
                    {isComplete ? <CheckCircle2 className="w-4 h-4" /> : d}
                  </div>
                  {index < nextBoss.combinesDays.length - 1 && (
                    <ArrowRight className={`w-4 h-4 mx-1 ${
                      isComplete ? 'text-purple-400' : 'text-gray-300'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Today's milestone */}
      <Card>
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Today's Contribution</h3>
              <p className="text-sm text-gray-500">
                {milestone?.description || 'Build a component for your boss project'}
              </p>
            </div>
          </div>

          {milestone?.microTask && (
            <div className="p-4 bg-purple-50 rounded-lg mb-4">
              <p className="font-medium text-purple-800 mb-2">Your task:</p>
              <p className="text-purple-700">{milestone.microTask}</p>
            </div>
          )}

          {milestone?.dayContribution && (
            <div className="p-3 bg-gray-100 rounded-lg mb-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium">How this helps:</span> {milestone.dayContribution}
              </p>
            </div>
          )}

          {/* Code input */}
          <TextArea
            label="Your code"
            placeholder="// Write the milestone code here..."
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="min-h-[150px] font-mono text-sm"
          />
        </div>
      </Card>

      {/* Submit button */}
      {!isSubmitted ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Button
            variant="accent"
            size="lg"
            onClick={handleSubmit}
            disabled={code.length < 10}
            className="w-full"
            leftIcon={<Trophy className="w-5 h-5" />}
          >
            Save Milestone
          </Button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="bg-green-50 border border-green-200">
            <div className="p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <h3 className="font-semibold text-green-800">Milestone Saved!</h3>
              <p className="text-sm text-green-600">
                This code is now part of your "{nextBoss?.title}" project 🎉
              </p>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Motivation */}
      <div className="text-center text-sm text-gray-500">
        💡 By doing a little each day, you'll have 80% of your project done before Boss Day!
      </div>
    </div>
  );
}
