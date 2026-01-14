import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, ArrowRight, CheckCircle2, ListChecks, Lightbulb, ChevronDown, ChevronUp, Target, BookOpen } from 'lucide-react';
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

// Check if curriculum is project-based (has boss projects)
const isProjectBasedCurriculum = (session: Session): boolean => {
  return session.curriculum.metadata?.isProjectBased !== false &&
    session.curriculum.bossProjects?.length > 0;
};

// Coding languages that support live preview
const CODING_LANGUAGES = ['javascript', 'js', 'typescript', 'ts', 'html', 'css', 'html/css', 'web', 'python', 'react', 'vue', 'node'];

// Map language to CodeSandbox template
function getTemplateForLanguage(language: string): 'vanilla' | 'react' | 'vue' | 'node' | 'python' {
  const lang = language.toLowerCase();
  if (lang.includes('react')) return 'react';
  if (lang.includes('vue')) return 'vue';
  if (lang.includes('node') || lang === 'nodejs') return 'node';
  if (lang === 'python' || lang === 'py') return 'python';
  return 'vanilla';
}

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

export function BossMilestoneStep({ day, session, onComplete }: BossMilestoneStepProps) {
  const [code, setCode] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const { addSystemMessage } = useCompanionStore();

  const isProjectBased = isProjectBasedCurriculum(session);
  const practiceProject = day.deferredContent?.practiceProject;
  const language = session.curriculum.metadata?.suggestedLanguage || 'javascript';
  const isCodingProject = CODING_LANGUAGES.some(lang =>
    language.toLowerCase().includes(lang)
  );

  // For practice-based curricula, render simplified practice project UI
  if (!isProjectBased) {
    return (
      <PracticeProjectStep
        day={day}
        session={session}
        practiceProject={practiceProject}
        language={language}
        isCodingProject={isCodingProject}
        code={code}
        setCode={setCode}
        isSubmitted={isSubmitted}
        setIsSubmitted={setIsSubmitted}
        showHints={showHints}
        setShowHints={setShowHints}
        showSolution={showSolution}
        setShowSolution={setShowSolution}
        onComplete={onComplete}
        addSystemMessage={addSystemMessage}
      />
    );
  }

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

  // Milestone data comes pre-merged from sessionStore into day.bossMilestone
  const milestone = day.bossMilestone;

  // Fallback task description from skeleton preview (if milestone not loaded yet)
  const taskPreview = day.bossMilestonePreview || day.skeleton?.task1Preview;

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

  // Get hints from milestone (new structure) or fall back to boss project hints
  const milestoneHints = milestone?.hints || [];
  const hintsData = milestoneHints.length > 0
    ? milestoneHints
    : (activeBoss?.hints || activeBoss?.pro?.hints || (activeBoss?.free?.hint1 ? [activeBoss.free.hint1] : []));
  const hints = (hintsData as Array<string | { hint?: string; level?: number }>).map(
    (h): string => (typeof h === 'string' ? h : h.hint || String(h))
  );

  // Get starter code from milestone (new structure) or fall back to boss project
  const starterCode = milestone?.starterCode || activeBoss?.starterCode || activeBoss?.files?.starter || `// ${milestone?.microTask || 'Start coding here...'}\n\n`;

  // Get solution from milestone
  const solution = milestone?.solution;
  const solutionAnnotations = milestone?.solutionAnnotations || [];

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
      subtitle="A little each day = most is done before Boss Day!"
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

      {/* Today's specific task */}
      <Card className="border-2 border-purple-200">
        <div className="p-6">
          <div className="mb-4">
            <h3 className="font-bold text-lg text-gray-900 mb-1">
              {milestone?.title || `Day ${day.day} Task`}
            </h3>
            {milestone?.description && (
              <p className="text-gray-600">{milestone.description}</p>
            )}
          </div>

          {/* Main task - prominent */}
          {(milestone?.microTask || taskPreview) && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg mb-4">
              <p className="text-purple-800 font-medium">
                {milestone?.microTask || taskPreview}
              </p>
            </div>
          )}

          {/* Fallback if no task data at all */}
          {!milestone?.microTask && !taskPreview && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg mb-4">
              <p className="text-gray-600">
                Build your contribution to "{activeBoss?.title}" today.
              </p>
            </div>
          )}

          {/* Expected output */}
          {milestone?.expectedOutput && (
            <div className="p-3 bg-green-50 border border-green-100 rounded-lg mb-4">
              <p className="text-sm text-green-700">
                <span className="font-medium">Expected:</span> {milestone.expectedOutput}
              </p>
            </div>
          )}

          {/* Validation instructions */}
          {milestone?.validationInstructions && (
            <div className="p-3 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-600">
                <span className="font-medium">To verify:</span> {milestone.validationInstructions}
              </p>
            </div>
          )}
        </div>
      </Card>


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
          template={getTemplateForLanguage(language)}
          dependencies={activeBoss?.dependencies as Record<string, string> | undefined}
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

      {/* Solution (subtle link below save button) */}
      {solution && (
        <div className="text-center">
          <button
            onClick={() => setShowSolution(!showSolution)}
            className="text-xs text-gray-400 hover:text-gray-500 transition-colors inline-flex items-center gap-1"
          >
            {showSolution ? (
              <>Hide solution <ChevronUp className="w-3 h-3" /></>
            ) : (
              <>{isSubmitted ? 'Compare with solution' : 'Stuck? View solution'} <ChevronDown className="w-3 h-3" /></>
            )}
          </button>
          {showSolution && (
            <Card className="mt-3 text-left">
              <div className="p-4">
                <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm font-mono">
                  {solution}
                </pre>
                {solutionAnnotations.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium text-gray-700">Key points:</p>
                    <ul className="space-y-1">
                      {solutionAnnotations.map((annotation: string, index: number) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          {annotation}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </StepLayout>
  );
}

// Practice Project Step - for practice-based curricula (KNOWLEDGE, PHYSICAL, or understand_concept goal)
type CompanionMood = 'welcoming' | 'encouraging' | 'celebratory' | 'supportive' | 'focused';

interface PracticeProjectStepProps {
  day: CurriculumDay;
  session: Session;
  practiceProject: any;
  language: string;
  isCodingProject: boolean;
  code: string;
  setCode: (code: string) => void;
  isSubmitted: boolean;
  setIsSubmitted: (submitted: boolean) => void;
  showHints: boolean;
  setShowHints: (show: boolean) => void;
  showSolution: boolean;
  setShowSolution: (show: boolean) => void;
  onComplete: () => void;
  addSystemMessage: (content: string, mood?: CompanionMood) => void;
}

function PracticeProjectStep({
  day,
  session,
  practiceProject,
  language,
  isCodingProject,
  code,
  setCode,
  isSubmitted,
  setIsSubmitted,
  showHints,
  setShowHints,
  showSolution,
  setShowSolution,
  onComplete,
  addSystemMessage,
}: PracticeProjectStepProps) {
  const handleSubmit = () => {
    setIsSubmitted(true);
    addSystemMessage(
      `Great work on today's practice! You've reinforced the concepts from Day ${day.day}. 🎯`,
      'encouraging'
    );
  };

  const hints = practiceProject?.hints || [];
  const solution = practiceProject?.solution;
  const requirements = practiceProject?.requirements || [];

  return (
    <StepLayout
      icon={BookOpen}
      iconGradient="from-blue-400 to-cyan-500"
      title="Practice Project 📝"
      subtitle="Apply what you learned today"
    >
      {/* Practice project info */}
      <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                {practiceProject?.title || `Day ${day.day} Practice`}
              </h3>
              <p className="text-sm text-gray-500">
                {practiceProject?.estimatedMinutes ? `${practiceProject.estimatedMinutes} min` : 'Self-paced'}
              </p>
            </div>
          </div>

          {practiceProject?.description && (
            <p className="text-gray-600 mb-4">{practiceProject.description}</p>
          )}
        </div>
      </Card>

      {/* Core challenge */}
      {practiceProject?.coreChallenge && (
        <Card>
          <div className="p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Your Challenge</h3>
                <p className="text-gray-600 mt-1">{practiceProject.coreChallenge}</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Requirements */}
      {requirements.length > 0 && (
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <ListChecks className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Requirements</h3>
            </div>
            <ul className="space-y-2">
              {requirements.map((req: string, index: number) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <span className="text-gray-700">{req}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* Hints */}
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
                {hints.map((hint: string, index: number) => (
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

      {/* Solution */}
      {solution && (
        <div className="text-center">
          <button
            onClick={() => setShowSolution(!showSolution)}
            className="text-xs text-gray-400 hover:text-gray-500 transition-colors inline-flex items-center gap-1"
          >
            {showSolution ? (
              <>Hide solution <ChevronUp className="w-3 h-3" /></>
            ) : (
              <>{isSubmitted ? 'Compare with solution' : 'Stuck? View solution'} <ChevronDown className="w-3 h-3" /></>
            )}
          </button>
          {showSolution && (
            <Card className="mt-3 text-left">
              <div className="p-4">
                <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm font-mono">
                  {solution}
                </pre>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Code area or text area */}
      {isCodingProject ? (
        <CodeSandbox
          code={code || practiceProject?.starterCode || '// Start practicing here...\n'}
          language={language}
          onCodeChange={setCode}
          title={`Day ${day.day} Practice`}
          template={getTemplateForLanguage(language)}
        />
      ) : (
        <Card>
          <div className="p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your work
            </label>
            <textarea
              placeholder="Write your answers or practice notes here..."
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full min-h-[150px] p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            />
          </div>
        </Card>
      )}

      {/* Submit button */}
      {!isSubmitted ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Button
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            disabled={code.length < 5}
            className="w-full"
            leftIcon={<CheckCircle2 className="w-5 h-5" />}
          >
            Complete Practice
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
              <h3 className="font-semibold text-green-800">Practice Complete!</h3>
              <p className="text-sm text-green-600">
                Great job reinforcing today's concepts! 🎉
              </p>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Motivation */}
      <div className="text-center text-sm text-gray-500">
        💡 Practice makes progress! Each exercise reinforces what you've learned.
      </div>
    </StepLayout>
  );
}
