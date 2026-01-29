import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, ArrowRight, CheckCircle2, Lightbulb, ChevronDown, ChevronUp, BookOpen, ChevronRight, ChevronLeft, RotateCcw, ExternalLink, Monitor, Copy, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { Card, Button, ProgressBar, ExerciseLoadingScreen } from '@/components/common';
import { StepLayout } from './StepLayout';
import {
  QuizSectionExercise,
  MatchingSectionExercise,
  ToneSelectSectionExercise,
  FillBlankSectionExercise,
  TranslationSectionExercise,
  ReorderSectionExercise,
  TypingSectionExercise,
  OpenEndedSectionExercise,
} from './LanguageExercises';
import {
  CodeCompletionExercise,
  DebuggingExercise,
  OutputPredictionExercise,
} from './CodeExercises';
import {
  FormCheckExercise,
  SafetyCheckExercise,
} from './PhysicalExercises';
import {
  DesignCritiqueExercise,
} from './DesignExercises';
import { useCompanionStore } from '@/stores/companionStore';
import { useSessionStore } from '@/stores/sessionStore';
import type { CurriculumDay, Session, TaskSection, TargetLanguage } from '@/types';

interface BossMilestoneStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

// Check if curriculum is project-based (has boss projects)
const isProjectBasedCurriculum = (session: Session): boolean => {
  return session.curriculum.metadata?.isProjectBased !== false &&
    (session.curriculum.bossProjects?.length ?? 0) > 0;
};

// External tool suggestions based on language
const getExternalToolSuggestions = (language: string): { name: string; url: string; description: string }[] => {
  const lang = language.toLowerCase();

  if (lang.includes('python')) {
    return [
      { name: 'VS Code', url: 'https://code.visualstudio.com/', description: 'Recommended IDE with Python extension' },
      { name: 'PyCharm', url: 'https://www.jetbrains.com/pycharm/', description: 'Professional Python IDE' },
      { name: 'Replit', url: 'https://replit.com/', description: 'Online Python environment' },
    ];
  }

  if (lang.includes('react') || lang.includes('vue') || lang.includes('node')) {
    return [
      { name: 'VS Code', url: 'https://code.visualstudio.com/', description: 'Recommended IDE' },
      { name: 'CodeSandbox', url: 'https://codesandbox.io/', description: 'Online IDE for web projects' },
      { name: 'StackBlitz', url: 'https://stackblitz.com/', description: 'Online IDE for web projects' },
    ];
  }

  // Default for JavaScript, HTML, CSS, etc.
  return [
    { name: 'VS Code', url: 'https://code.visualstudio.com/', description: 'Recommended IDE' },
    { name: 'CodePen', url: 'https://codepen.io/', description: 'Online editor for HTML/CSS/JS' },
    { name: 'JSFiddle', url: 'https://jsfiddle.net/', description: 'Online JavaScript playground' },
  ];
};

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
  const isProjectBased = isProjectBasedCurriculum(session);

  // For practice-based curricula, render intensive practice
  if (!isProjectBased) {
    return (
      <IntensivePracticeStep
        day={day}
        session={session}
        onComplete={onComplete}
      />
    );
  }

  // For project-based curricula, render boss milestone
  return (
    <ProjectMilestoneStep
      day={day}
      session={session}
      onComplete={onComplete}
    />
  );
}

// ============================================
// Intensive Practice Step (for practice-based learning)
// ============================================

interface IntensivePracticeStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

interface SectionResult {
  score: number;
  total: number;
  completed: boolean;
  // Individual answers for persistence (question ID -> answer value)
  answers?: Record<string, number | string | boolean>;
  // Current question index within section
  currentIndex?: number;
}

// Progress data passed to section components
export interface SectionSavedProgress {
  answers: Record<string, number | string | boolean>;
  currentIndex: number;
}

function IntensivePracticeStep({ day, session, onComplete }: IntensivePracticeStepProps) {
  const { addSystemMessage } = useCompanionStore();
  const { saveTaskProgress, getTaskProgress } = useSessionStore();
  const targetLanguage = session.curriculum?.metadata?.targetLanguage as TargetLanguage | undefined;

  // Get intensive practice from deferred content (spread directly onto day by sessionStore)
  // Also check nested deferredContent for backward compatibility
  const intensivePractice = day.intensivePractice || day.deferredContent?.intensivePractice;

  const sections = intensivePractice?.sections || [];
  const miniFoundationCards = intensivePractice?.miniFoundationCards || [];

  // Load saved progress
  const savedProgress = getTaskProgress(day.day, 'intensivePractice');

  // Mini cards phase (shown before exercises)
  const [miniCardIndex, setMiniCardIndex] = useState(0);
  const [miniCardsCompleted, setMiniCardsCompleted] = useState(
    Boolean(savedProgress?.answers?.miniCardsCompleted)
  );

  const [currentSectionIndex, setCurrentSectionIndex] = useState(
    savedProgress?.currentIndex ?? 0
  );
  const [sectionResults, setSectionResults] = useState<Record<number, SectionResult>>(
    (savedProgress?.answers as unknown as Record<number, SectionResult>) || {}
  );
  const [showResults, setShowResults] = useState(savedProgress?.showResults ?? false);
  const [hasStarted, setHasStarted] = useState(
    !!(savedProgress?.currentIndex || Object.keys(savedProgress?.answers || {}).length || miniCardsCompleted)
  );

  const currentSection = sections[currentSectionIndex];
  const hasMiniCards = miniFoundationCards.length > 0;

  // Save progress when state changes
  useEffect(() => {
    if (hasStarted) {
      saveTaskProgress(day.day, 'intensivePractice', {
        answers: { ...sectionResults, miniCardsCompleted } as unknown as Record<string, number | null>,
        currentIndex: currentSectionIndex,
        showResults,
      });
    }
  }, [currentSectionIndex, sectionResults, showResults, hasStarted, miniCardsCompleted, day.day, saveTaskProgress]);

  const handleSectionComplete = (score: number, total: number, answers?: Record<string, number | string | boolean>) => {
    setSectionResults(prev => ({
      ...prev,
      [currentSectionIndex]: { score, total, completed: true, answers, currentIndex: 0 },
    }));
    // No auto-advance - user uses Next/Previous buttons
  };

  // Handle real-time progress changes within a section (for persistence during refresh)
  const handleSectionProgressChange = (answers: Record<string, number | string | boolean>, currentIndex: number) => {
    setSectionResults(prev => {
      const existing = prev[currentSectionIndex] || { score: 0, total: 0, completed: false };
      return {
        ...prev,
        [currentSectionIndex]: { ...existing, answers, currentIndex },
      };
    });
  };

  // Get saved progress for current section
  const getCurrentSectionSavedProgress = (): SectionSavedProgress | undefined => {
    const result = sectionResults[currentSectionIndex];
    if (result?.answers) {
      return {
        answers: result.answers,
        currentIndex: result.currentIndex ?? 0,
      };
    }
    return undefined;
  };

  const handleNext = () => {
    if (currentSectionIndex < sections.length - 1) {
      setCurrentSectionIndex(prev => prev + 1);
    } else {
      setShowResults(true);
    }
  };

  const handlePrevious = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(prev => prev - 1);
    }
  };

  const currentSectionCompleted = !!sectionResults[currentSectionIndex]?.completed;

  const getTotalScore = () => {
    let totalScore = 0;
    let totalQuestions = 0;
    Object.values(sectionResults).forEach(result => {
      totalScore += result.score;
      totalQuestions += result.total;
    });
    return { score: totalScore, total: totalQuestions };
  };

  const resetPractice = () => {
    setCurrentSectionIndex(0);
    setSectionResults({});
    setShowResults(false);
  };

  const handleComplete = () => {
    const { score, total } = getTotalScore();
    const percentage = total > 0 ? Math.round((score / total) * 100) : 100;
    addSystemMessage(
      percentage >= 70
        ? `Excellent work! You scored ${percentage}% on intensive practice! 🎯`
        : `Good effort! You scored ${percentage}%. Keep practicing! 💪`,
      percentage >= 70 ? 'celebratory' : 'encouraging'
    );
    onComplete();
  };

  const renderSection = (section: TaskSection) => {
    const savedProgress = getCurrentSectionSavedProgress();

    switch (section.type) {
      case 'quiz':
        return (
          <QuizSectionExercise
            section={section}
            targetLanguage={targetLanguage}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      case 'matching':
        return (
          <MatchingSectionExercise
            section={section}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      case 'toneSelect':
        return (
          <ToneSelectSectionExercise
            section={section}
            targetLanguage={targetLanguage}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      case 'fillBlank':
        return (
          <FillBlankSectionExercise
            section={section}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      case 'translation':
        return (
          <TranslationSectionExercise
            section={section}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      case 'reorder':
        return (
          <ReorderSectionExercise
            section={section}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      case 'typing':
        return (
          <TypingSectionExercise
            section={section}
            targetLanguage={targetLanguage}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      case 'openEnded':
        return (
          <OpenEndedSectionExercise
            section={section}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      // Code-specific sections
      case 'codeCompletion':
        return (
          <CodeCompletionExercise
            section={section}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      case 'debugging':
        return (
          <DebuggingExercise
            section={section}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      case 'outputPrediction':
        return (
          <OutputPredictionExercise
            section={section}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      // Physical-specific sections
      case 'formCheck':
        return (
          <FormCheckExercise
            section={section}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      case 'safetyCheck':
        return (
          <SafetyCheckExercise
            section={section}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      // Design-specific sections
      case 'designCritique':
        return (
          <DesignCritiqueExercise
            section={section}
            onComplete={handleSectionComplete}
            savedProgress={savedProgress}
            onProgressChange={handleSectionProgressChange}
          />
        );
      default:
        return (
          <div className="text-center py-8 text-gray-500">
            Unknown section type: {(section as any).type}
          </div>
        );
    }
  };

  // No intensive practice available - show cool loading screen
  if (!intensivePractice || sections.length === 0) {
    return (
      <StepLayout
        icon={BookOpen}
        iconGradient="from-blue-400 to-cyan-500"
        title="Intensive Practice"
        subtitle="Reinforce today's concepts"
      >
        <div className="max-w-lg mx-auto">
          <ExerciseLoadingScreen
            type="intensive"
            skillName={session.skillName}
            dayNumber={day.day}
          />
          <div className="text-center mt-4">
            <button
              onClick={onComplete}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip for now
            </button>
          </div>
        </div>
      </StepLayout>
    );
  }

  // Introduction screen
  if (!hasStarted) {
    return (
      <StepLayout
        icon={BookOpen}
        iconGradient="from-blue-400 to-cyan-500"
        title="Intensive Practice"
        subtitle="Reinforce today's concepts"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-lg mx-auto"
        >
          <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100">
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                <BookOpen className="w-8 h-8 text-blue-600" />
              </div>

              <h2 className="text-2xl font-bold mb-2">{intensivePractice.title}</h2>
              <p className="text-gray-600 mb-6">{intensivePractice.description}</p>

              <div className="bg-white/80 rounded-lg p-4 mb-6 text-left">
                <h3 className="text-sm font-medium text-gray-500 mb-3">What you'll practice:</h3>
                <ul className="space-y-2">
                  {sections.map((section, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </span>
                      <span>{section.title}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-6">
                <span>Estimated time:</span>
                <span className="font-medium">{intensivePractice.estimatedMinutes} minutes</span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onComplete}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => setHasStarted(true)}
                  className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                  Start Practice
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </Card>
        </motion.div>
      </StepLayout>
    );
  }

  // Results screen
  if (showResults) {
    const { score, total } = getTotalScore();
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const passed = percentage >= 70;

    return (
      <StepLayout
        icon={BookOpen}
        iconGradient="from-blue-400 to-cyan-500"
        title="Intensive Practice"
        subtitle="Results"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-lg mx-auto"
        >
          <Card className="p-8 text-center">
            <div className={clsx(
              'w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4',
              passed ? 'bg-green-100' : 'bg-orange-100'
            )}>
              {passed ? (
                <Trophy className="w-10 h-10 text-green-600" />
              ) : (
                <RotateCcw className="w-10 h-10 text-orange-600" />
              )}
            </div>

            <h2 className="text-2xl font-bold mb-2">
              {passed ? 'Great Job!' : 'Keep Practicing!'}
            </h2>

            <p className="text-gray-600 mb-6">
              You scored {score} out of {total} ({percentage}%)
            </p>

            {/* Section breakdown */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Section Breakdown</h3>
              <div className="space-y-2">
                {sections.map((section, index) => {
                  const result = sectionResults[index];
                  const sectionPct = result ? Math.round((result.score / result.total) * 100) : 0;
                  return (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm">{section.title}</span>
                      <span className={clsx(
                        'text-sm font-medium',
                        sectionPct >= 70 ? 'text-green-600' : 'text-orange-600'
                      )}>
                        {result?.score}/{result?.total} ({sectionPct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3">
              {!passed && (
                <button
                  onClick={resetPractice}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Try Again
                </button>
              )}
              <button
                onClick={handleComplete}
                className="flex-1 px-4 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center justify-center gap-2"
              >
                {passed ? 'Continue' : 'Continue Anyway'}
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </Card>
        </motion.div>
      </StepLayout>
    );
  }

  // Mini Foundation Cards phase (shown before exercises)
  if (hasMiniCards && !miniCardsCompleted) {
    const currentMiniCard = miniFoundationCards[miniCardIndex];

    return (
      <StepLayout
        icon={BookOpen}
        iconGradient="from-purple-400 to-indigo-500"
        title="New Concepts"
        subtitle="Learn these before practicing"
      >
        <div className="max-w-lg mx-auto">
          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-6">
            {miniFoundationCards.map((_, i) => (
              <div
                key={i}
                className={clsx(
                  'w-2.5 h-2.5 rounded-full transition-all',
                  i === miniCardIndex ? 'bg-purple-500 scale-125' : i < miniCardIndex ? 'bg-purple-300' : 'bg-gray-200'
                )}
              />
            ))}
          </div>

          {/* Mini card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={miniCardIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="p-6">
                <div className="text-center mb-4">
                  <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                    New Concept {miniCardIndex + 1} of {miniFoundationCards.length}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
                  {currentMiniCard.concept}
                </h3>

                <p className="text-gray-700 leading-relaxed">
                  {currentMiniCard.explanation}
                </p>
              </Card>
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex justify-between mt-6">
            <button
              onClick={() => setMiniCardIndex(prev => prev - 1)}
              disabled={miniCardIndex === 0}
              className={clsx(
                'px-4 py-2 rounded-lg flex items-center gap-2',
                miniCardIndex === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <ChevronLeft className="w-5 h-5" />
              Previous
            </button>

            {miniCardIndex === miniFoundationCards.length - 1 ? (
              <button
                onClick={() => setMiniCardsCompleted(true)}
                className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2"
              >
                Start Practice
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => setMiniCardIndex(prev => prev + 1)}
                className="px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg flex items-center gap-2"
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </StepLayout>
    );
  }

  // Practice in progress
  return (
    <StepLayout
      icon={BookOpen}
      iconGradient="from-blue-400 to-cyan-500"
      title="Intensive Practice"
      subtitle={intensivePractice.title}
    >
      <div className="max-w-2xl mx-auto">
        {/* Section progress indicators */}
        <div className="flex gap-2 mb-6">
          {sections.map((_, index) => {
            const result = sectionResults[index];
            const isActive = index === currentSectionIndex;
            const isCompleted = result?.completed;

            return (
              <div
                key={index}
                className={clsx(
                  'flex-1 h-2 rounded-full transition-all',
                  isCompleted
                    ? 'bg-green-500'
                    : isActive
                    ? 'bg-blue-500'
                    : 'bg-gray-200'
                )}
              />
            );
          })}
        </div>

        {/* Section label with skip option */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              Section {currentSectionIndex + 1} of {sections.length}
            </span>
            <span className="text-sm px-2 py-0.5 bg-gray-100 rounded-full capitalize">
              {currentSection.type === 'fillBlank' ? 'Fill in Blank' : currentSection.type}
            </span>
          </div>
          {!currentSectionCompleted && (
            <button
              onClick={handleNext}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip section
            </button>
          )}
        </div>

        {/* Current section */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSectionIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderSection(currentSection)}
          </motion.div>
        </AnimatePresence>

        {/* Navigation buttons */}
        <div className="mt-6 flex justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentSectionIndex === 0}
            className={clsx(
              'px-4 py-2 rounded-lg flex items-center gap-2 transition-colors',
              currentSectionIndex === 0
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <ChevronLeft className="w-5 h-5" />
            Previous
          </button>

          <button
            onClick={handleNext}
            className={clsx(
              'px-4 py-2 rounded-lg flex items-center gap-2 transition-colors',
              currentSectionCompleted
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            {currentSectionIndex < sections.length - 1 ? 'Next' : 'Finish'}
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </StepLayout>
  );
}

// ============================================
// Project Milestone Step (for project-based learning)
// ============================================

interface ProjectMilestoneStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

function ProjectMilestoneStep({ day, session, onComplete: _onComplete }: ProjectMilestoneStepProps) {
  const { saveTaskProgress, getTaskProgress } = useSessionStore();
  const { addSystemMessage } = useCompanionStore();

  // Load saved progress for boss milestone
  const savedProgress = getTaskProgress(day.day, 'bossMilestone');

  const [notes, setNotes] = useState(savedProgress?.answers?.notes as unknown as string || '');
  const [isSubmitted, setIsSubmitted] = useState(savedProgress?.showResults ?? false);
  const [showHints, setShowHints] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Save progress when notes change (for engagement tracking)
  useEffect(() => {
    if (notes.length > 0) {
      saveTaskProgress(day.day, 'bossMilestone', {
        answers: { notes } as unknown as Record<string, number | null>,
        currentIndex: 0,
        showResults: isSubmitted,
      });
    }
  }, [notes, isSubmitted, day.day, saveTaskProgress]);

  const language = session.curriculum.metadata?.suggestedLanguage || 'javascript';
  const externalTools = getExternalToolSuggestions(language);

  // Find the current boss project (the one this day belongs to)
  const currentBoss = session.curriculum.bossProjects?.find(
    b => b.combinesDays?.includes(day.day)
  );

  // Find the next boss project
  const nextBoss = session.curriculum.bossProjects?.find(
    b => b.day > day.day
  ) || session.curriculum.bossProjects?.[session.curriculum.bossProjects.length - 1];

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
        ? `Amazing! You've completed all milestones for "${activeBoss?.title}"! Boss project ready!`
        : `Milestone saved! Progress: ${newProgress}%. ${daysUntilBoss > 0 ? `${daysUntilBoss} day${daysUntilBoss !== 1 ? 's' : ''} until boss day!` : 'Boss day is today!'}`,
      'encouraging'
    );
  };

  return (
    <StepLayout
      icon={Trophy}
      iconGradient="from-purple-400 to-pink-500"
      title="Boss Milestone"
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

      {/* External Tools Required Banner */}
      <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Requires External Tools</h3>
              <p className="text-sm text-gray-600">Complete this task in your preferred code editor</p>
            </div>
          </div>

          {/* Suggested Tools */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Suggested tools:</p>
            <div className="flex flex-wrap gap-2">
              {externalTools.map((tool) => (
                <a
                  key={tool.name}
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  {tool.name}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          </div>

          {/* Setup Instructions */}
          {(milestone?.setupInstructions || activeBoss?.setupInstructions) && (
            <div className="p-3 bg-white/80 border border-blue-100 rounded-lg mb-4">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Setup: </span>
                {milestone?.setupInstructions || activeBoss?.setupInstructions}
              </p>
            </div>
          )}

          {/* Starter Code with Copy Button */}
          {starterCode && starterCode.trim() !== '// Start coding here...\n\n' && (
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500">Starter code:</p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(starterCode);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3 h-3 text-green-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy code
                    </>
                  )}
                </button>
              </div>
              <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap max-h-48">
                {starterCode}
              </pre>
            </div>
          )}
        </div>
      </Card>

      {/* Reflection / Notes */}
      <Card>
        <div className="p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your notes & reflection
          </label>
          <p className="text-xs text-gray-500 mb-3">
            What did you learn? Any challenges? Paste code snippets you're proud of.
          </p>
          <textarea
            placeholder="Write your notes here..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full min-h-[120px] p-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
          />
        </div>
      </Card>

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
            disabled={notes.length < 5}
            className="w-full"
            leftIcon={<Trophy className="w-5 h-5" />}
          >
            Mark as Complete
          </Button>
          <p className="text-xs text-center text-gray-400 mt-2">
            Add a quick note about what you accomplished
          </p>
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
                {currentDayAlreadySaved && !isSubmitted ? 'Already Completed!' : 'Milestone Complete!'}
              </h3>
              <p className="text-sm text-green-600">
                Great progress on "{activeBoss?.title}"!
              </p>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Solution (subtle link below save button) */}
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
              {solution ? (
                <>
                  <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">
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
                </>
              ) : (
                <p className="text-gray-500 text-sm">
                  Solution not available for this milestone. Try completing the task on your own, or check the hints above!
                </p>
              )}
            </div>
          </Card>
        )}
      </div>
    </StepLayout>
  );
}
