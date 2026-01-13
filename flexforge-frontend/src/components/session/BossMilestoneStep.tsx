import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, ArrowRight, CheckCircle2, Code2, ListChecks, Lightbulb, ChevronDown, ChevronUp, Clock, Target } from 'lucide-react';
import { Card, Button, ProgressBar } from '@/components/common';
import { StepLayout } from './StepLayout';
import { CodeSandbox } from './CodeSandbox';
import { useCompanionStore } from '@/stores/companionStore';
import type { CurriculumDay, Session } from '@/types';

interface BossMilestoneStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

// Coding languages that support live preview
const CODING_LANGUAGES = ['javascript', 'js', 'typescript', 'ts', 'html', 'css', 'html/css', 'web', 'python', 'react', 'vue', 'node'];

// Track saved milestones in localStorage
const getMilestoneKey = (sessionId: string, bossDay: number) =>
  `boss-milestone-${sessionId}-${bossDay}`;

const getSavedMilestones = (sessionId: string, bossDay: number): number[] => {
  try {
    const saved = localStorage.getItem(getMilestoneKey(sessionId, bossDay));
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

const saveMilestoneDay = (sessionId: string, bossDay: number, dayNumber: number) => {
  const saved = getSavedMilestones(sessionId, bossDay);
  if (!saved.includes(dayNumber)) {
    saved.push(dayNumber);
    localStorage.setItem(getMilestoneKey(sessionId, bossDay), JSON.stringify(saved));
  }
  return saved;
};

export function BossMilestoneStep({ day, session }: BossMilestoneStepProps) {
  const [code, setCode] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const { addSystemMessage } = useCompanionStore();

  const milestone = day.bossMilestone;
  const language = session.curriculum.metadata?.suggestedLanguage || 'javascript';
  const isCodingProject = CODING_LANGUAGES.some(lang =>
    language.toLowerCase().includes(lang)
  );

  // Find the current boss project (the one this day belongs to)
  const currentBoss = session.curriculum.bossProjects.find(
    b => b.combinesDays?.includes(day.day)
  );

  // Find the next boss project
  const nextBoss = session.curriculum.bossProjects.find(
    b => b.day > day.day
  ) || session.curriculum.bossProjects[session.curriculum.bossProjects.length - 1];

  // Use currentBoss if available, otherwise nextBoss
  const activeBoss = currentBoss || nextBoss;

  const daysUntilBoss = activeBoss ? activeBoss.day - day.day : 0;

  // Get saved milestones from localStorage
  const savedMilestones = activeBoss
    ? getSavedMilestones(session.id, activeBoss.day)
    : [];

  // Check if current day was already saved
  const currentDayAlreadySaved = savedMilestones.includes(day.day);

  // Calculate progress based on SAVED milestones only (not curriculum days)
  const calculateProgress = () => {
    if (!activeBoss?.combinesDays?.length) return 0;

    const totalDays = activeBoss.combinesDays.length;
    const savedCount = savedMilestones.length;

    // Progress = saved milestones / total days
    return Math.min(100, Math.round((savedCount / totalDays) * 100));
  };

  const progressPercent = calculateProgress();

  // Get requirements from boss project (AI generates {requirement, fromDay, concept} objects)
  const requirementsData = activeBoss?.requirements || activeBoss?.free?.requirements || [];
  const requirements = (requirementsData as Array<string | { requirement?: string }>).map(
    (r): string => (typeof r === 'string' ? r : r.requirement || String(r))
  );

  // Get hints from boss project (AI generates {level, hint, phase} objects)
  const hintsData = activeBoss?.hints || activeBoss?.pro?.hints || (activeBoss?.free?.hint1 ? [activeBoss.free.hint1] : []);
  const hints = (hintsData as Array<string | { hint?: string }>).map(
    (h): string => (typeof h === 'string' ? h : h.hint || String(h))
  );

  // Get phases for step-by-step guidance
  const phases = activeBoss?.phases || [];

  // Get starter code from boss project
  const starterCode = activeBoss?.starterCode || activeBoss?.files?.starter || milestone?.starterCode || `// ${milestone?.microTask || 'Start coding here...'}\n\n`;

  const handleSubmit = () => {
    // Save this day's milestone to localStorage
    if (activeBoss) {
      saveMilestoneDay(session.id, activeBoss.day, day.day);
    }

    setIsSubmitted(true);

    const newSavedCount = savedMilestones.length + 1;
    const totalDays = activeBoss?.combinesDays?.length || 1;
    const newProgress = Math.round((newSavedCount / totalDays) * 100);

    addSystemMessage(
      newProgress >= 100
        ? `🎉 Amazing! You've completed all milestones for "${activeBoss?.title}"! Boss project ready!`
        : `🎯 Milestone saved! Progress: ${newProgress}%. ${daysUntilBoss > 0 ? `${daysUntilBoss} day${daysUntilBoss !== 1 ? 's' : ''} until boss day!` : 'Boss day is today!'}`,
      'encouraging'
    );
  };

  return (
    <StepLayout
      icon={Trophy}
      iconGradient="from-purple-400 to-pink-500"
      title="Boss Milestone 🏆"
      subtitle="Build a piece of your portfolio project today"
    >
      {/* Progress toward boss project */}
      <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
                <Trophy className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{activeBoss?.title || 'Boss Project'}</h3>
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

          {/* Day progress visualization - based on saved milestones */}
          <div className="flex items-center justify-between mt-4">
            {activeBoss?.combinesDays?.map((d, index) => {
              const isSaved = savedMilestones.includes(d) || (isSubmitted && d === day.day);
              const isCurrent = d === day.day;

              return (
                <div key={d} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    isSaved ? 'bg-purple-500 text-white' :
                    isCurrent ? 'bg-purple-200 text-purple-700 ring-2 ring-purple-500' :
                    'bg-gray-200 text-gray-500'
                  }`}>
                    {isSaved ? <CheckCircle2 className="w-4 h-4" /> : d}
                  </div>
                  {index < (activeBoss?.combinesDays?.length ?? 0) - 1 && (
                    <ArrowRight className={`w-4 h-4 mx-1 ${
                      isSaved ? 'text-purple-400' : 'text-gray-300'
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
        </div>
      </Card>

      {/* Requirements */}
      {requirements.length > 0 && (
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <ListChecks className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900">Requirements</h3>
            </div>
            <ul className="space-y-2">
              {requirements.map((req, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-600 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <span className="text-gray-700">{req}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* Step-by-step Phases */}
      {phases.length > 0 && (
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Step-by-Step Guide</h3>
            </div>
            <div className="space-y-4">
              {phases.map((phase: any, index: number) => (
                <div key={index} className="relative">
                  {/* Timeline connector */}
                  {index < phases.length - 1 && (
                    <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-blue-200" />
                  )}
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0 text-sm font-medium z-10">
                      {phase.phase || index + 1}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900">{phase.title}</h4>
                        <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          <Clock className="w-3 h-3" />
                          {phase.minutes} min
                        </span>
                      </div>
                      {phase.objectives && phase.objectives.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {phase.objectives.map((obj: string, objIndex: number) => (
                            <li key={objIndex} className="flex items-start gap-2 text-sm text-gray-600">
                              <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                              {obj}
                            </li>
                          ))}
                        </ul>
                      )}
                      {phase.deliverable && (
                        <p className="mt-2 text-sm text-blue-700 bg-blue-50 px-3 py-1.5 rounded">
                          <span className="font-medium">Deliverable:</span> {phase.deliverable}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Hints (collapsible) */}
      {hints.length > 0 && (
        <Card>
          <button
            onClick={() => setShowHints(!showHints)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              <span className="font-medium text-gray-900">Need help? View hints</span>
            </div>
            {showHints ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {showHints && (
            <div className="px-4 pb-4 border-t border-gray-100 pt-4">
              <ul className="space-y-3">
                {hints.map((hint, index) => (
                  <li key={index} className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                    <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span className="text-amber-800 text-sm">{hint}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Code Sandbox for coding projects */}
      {isCodingProject ? (
        <CodeSandbox
          code={code || starterCode}
          language={language}
          onCodeChange={setCode}
          title={`${activeBoss?.title || 'Boss Project'} - Day ${day.day}`}
        />
      ) : (
        <Card>
          <div className="p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your work
            </label>
            <textarea
              placeholder="Describe your progress or paste your work here..."
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full min-h-[150px] p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
            />
          </div>
        </Card>
      )}

      {/* Submit button */}
      {!isSubmitted && !currentDayAlreadySaved ? (
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
              <h3 className="font-semibold text-green-800">
                {currentDayAlreadySaved && !isSubmitted ? 'Milestone Already Saved!' : 'Milestone Saved!'}
              </h3>
              <p className="text-sm text-green-600">
                This code is now part of your "{activeBoss?.title}" project 🎉
              </p>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Motivation */}
      <div className="text-center text-sm text-gray-500">
        💡 By doing a little each day, you'll have 80% of your project done before Boss Day!
      </div>
    </StepLayout>
  );
}
