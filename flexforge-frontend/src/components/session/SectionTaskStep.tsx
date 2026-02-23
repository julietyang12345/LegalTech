import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Trophy, RotateCcw, Flame, Star, Zap, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useSessionStore } from '@/stores/sessionStore';
import {
  QuizSectionExercise,
  ToneSelectSectionExercise,
  TranslationSectionExercise,
  TypingSectionExercise,
  OpenEndedSectionExercise,
  RoleplaySectionExercise,
  RewriteSectionExercise,
  type BookmarkQuestionData,
} from './LanguageExercises';
import {
  CodeCompletionExercise,
  DebuggingExercise,
} from './CodeExercises';
import {
  SafetyCheckExercise,
} from './PhysicalExercises';
import type {
  TaskSection,
  CurriculumDay,
  Session,
  TargetLanguage,
  QuizTask,
  MixedTask,
  SectionsTask,
  QuizSection,
} from '@/types';

interface SectionTaskStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
  onBookmarkQuestion?: (questionData: BookmarkQuestionData) => void;
  onShareQuestion?: (questionData: BookmarkQuestionData) => void;
}

interface SectionResult {
  score: number;
  total: number;
  completed: boolean;
}

/**
 * Converts a legacy QuizTask to sections format
 */
function convertQuizToSections(task: QuizTask): TaskSection[] {
  const quizSection: QuizSection = {
    type: 'quiz',
    title: task.title || 'Quiz',
    questions: task.questions.map(q => ({
      ...q,
      // Ensure id exists
      id: q.id || `q-${Math.random().toString(36).slice(2)}`,
    })),
  };
  return [quizSection];
}

/**
 * Gets sections from a task, converting legacy formats if needed
 */
function getTaskSections(task: QuizTask | MixedTask | SectionsTask): TaskSection[] {
  const format = (task as any).format;

  if (format === 'sections' || format === 'mixed') {
    return (task as MixedTask | SectionsTask).sections || [];
  }

  if (format === 'quiz') {
    return convertQuizToSections(task as QuizTask);
  }

  // Fallback: check if sections array exists
  if ('sections' in task && Array.isArray((task as any).sections)) {
    return (task as any).sections;
  }

  // Fallback: check if questions array exists (legacy quiz)
  if ('questions' in task && Array.isArray((task as any).questions)) {
    return convertQuizToSections(task as QuizTask);
  }

  return [];
}

// Floating XP animation component
function FloatingXP({ amount, id }: { amount: number; id: number }) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: 0, y: -60, scale: 1.2 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="absolute top-0 right-4 text-green-500 font-bold text-lg pointer-events-none z-10"
    >
      +{amount} XP
    </motion.div>
  );
}

// Star rating based on percentage
function StarRating({ percentage }: { percentage: number }) {
  const stars = percentage >= 90 ? 3 : percentage >= 70 ? 2 : 1;
  return (
    <div className="flex gap-1 justify-center mb-3">
      {[1, 2, 3].map((s) => (
        <motion.div
          key={s}
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: s <= stars ? 1 : 0.6, rotate: 0 }}
          transition={{ delay: 0.3 + s * 0.15, type: 'spring', stiffness: 200 }}
        >
          <Star
            className={clsx(
              'w-8 h-8',
              s <= stars ? 'text-yellow-400 fill-yellow-400' : 'text-content-tertiary'
            )}
          />
        </motion.div>
      ))}
    </div>
  );
}

export function SectionTaskStep({ day, session, onComplete, onBookmarkQuestion, onShareQuestion }: SectionTaskStepProps) {
  const task = day.task1 as QuizTask | MixedTask | SectionsTask | undefined;
  const sections = task ? getTaskSections(task) : [];
  const targetLanguage = session.curriculum?.metadata?.targetLanguage as TargetLanguage | undefined;
  const _skillType = session.curriculum?.skillType;
  const isStreamingComplete = useSessionStore((s) => s.isStreamingComplete);

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [sectionResults, setSectionResults] = useState<Record<number, SectionResult>>({});
  const [showResults, setShowResults] = useState(false);

  // Gamification state
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [floatingXPs, setFloatingXPs] = useState<Array<{ id: number; amount: number }>>([]);
  const xpIdRef = useRef(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);

  // Total questions across all sections (guard against undefined sections during streaming)
  const totalQuestions = sections.reduce((sum, section) => {
    if (!section) return sum;
    const items = (section as any).questions || (section as any).items || [];
    return sum + (items.length || 0);
  }, 0);

  const currentSection = sections[currentSectionIndex];
  const passingScore = (task as any)?.passingScore || 0.7;

  const handleSectionComplete = (score: number, total: number) => {
    // Update gamification: track answers from this section
    const sectionCorrect = score;
    const sectionTotal = total;

    // Update streak and XP for each correct answer in this section
    let newStreak = streak;
    let newXp = xp;
    let newAnswered = questionsAnswered;

    for (let i = 0; i < sectionTotal; i++) {
      newAnswered++;
      if (i < sectionCorrect) {
        newStreak++;
        newXp += 10;
        // Streak milestone bonuses
        if (newStreak === 3 || newStreak === 5 || newStreak === 10) {
          newXp += 5;
        }
      } else {
        newStreak = 0;
      }
    }

    setStreak(newStreak);
    setMaxStreak(Math.max(maxStreak, newStreak));
    setXp(newXp);
    setQuestionsAnswered(newAnswered);

    // Show floating XP for section score
    if (sectionCorrect > 0) {
      const xpGained = sectionCorrect * 10;
      const id = ++xpIdRef.current;
      setFloatingXPs(prev => [...prev, { id, amount: xpGained }]);
      setTimeout(() => {
        setFloatingXPs(prev => prev.filter(f => f.id !== id));
      }, 1000);
    }

    setSectionResults(prev => ({
      ...prev,
      [currentSectionIndex]: { score, total, completed: true },
    }));
    // Auto-advance after recording score
    handleContinue();
  };

  const handleContinue = () => {
    if (currentSectionIndex < sections.length - 1) {
      setCurrentSectionIndex(prev => prev + 1);
    } else if (isStreamingComplete) {
      setShowResults(true);
    }
    // If streaming isn't complete and we're on the last section, do nothing - wait for more sections
  };

  const getTotalScore = () => {
    let totalScore = 0;
    let totalQuestions = 0;
    Object.values(sectionResults).forEach(result => {
      totalScore += result.score;
      totalQuestions += result.total;
    });
    return { score: totalScore, total: totalQuestions };
  };

  const getPassStatus = () => {
    const { score, total } = getTotalScore();
    const percentage = total > 0 ? score / total : 0;
    return percentage >= passingScore;
  };

  const resetTask = () => {
    setCurrentSectionIndex(0);
    setSectionResults({});
    setShowResults(false);
    setStreak(0);
    setMaxStreak(0);
    setXp(0);
    setQuestionsAnswered(0);
  };

  const renderSection = (section: TaskSection) => {
    switch (section.type) {
      // Universal sections
      case 'quiz':
        return (
          <QuizSectionExercise
            section={section}
            targetLanguage={targetLanguage}
            onComplete={handleSectionComplete}
            onBookmarkQuestion={onBookmarkQuestion}
            onShareQuestion={onShareQuestion}
          />
        );
      // Language-specific sections
      case 'toneSelect':
        return (
          <ToneSelectSectionExercise
            section={section}
            targetLanguage={targetLanguage}
            onComplete={handleSectionComplete}
          />
        );
      case 'translation':
        return (
          <TranslationSectionExercise
            section={section}
            onComplete={handleSectionComplete}
          />
        );
      case 'typing':
        return (
          <TypingSectionExercise
            section={section}
            targetLanguage={targetLanguage}
            onComplete={handleSectionComplete}
          />
        );

      // Code-specific sections
      case 'codeCompletion':
        return (
          <CodeCompletionExercise
            section={section}
            onComplete={handleSectionComplete}
          />
        );
      case 'debugging':
        return (
          <DebuggingExercise
            section={section}
            onComplete={handleSectionComplete}
          />
        );
      // Physical-specific sections
      case 'safetyCheck':
        return (
          <SafetyCheckExercise
            section={section}
            onComplete={handleSectionComplete}
          />
        );

      // Open-ended sections (soft skills/leadership)
      case 'openEnded':
        return (
          <OpenEndedSectionExercise
            section={section}
            onComplete={handleSectionComplete}
          />
        );

      // Language training sections (roleplay + rewrite)
      case 'roleplay':
        return (
          <RoleplaySectionExercise
            section={section}
            onComplete={handleSectionComplete}
          />
        );
      case 'rewrite':
        return (
          <RewriteSectionExercise
            section={section}
            onComplete={handleSectionComplete}
          />
        );

      default:
        return (
          <div className="text-center py-8 text-content-tertiary">
            Unknown section type: {(section as any).type}
          </div>
        );
    }
  };

  if (!task || sections.length === 0 || !currentSection) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <div className="h-7 bg-surface-tertiary rounded w-1/3 animate-pulse mb-2" />
          <div className="h-4 bg-surface-tertiary rounded w-2/3 animate-pulse" />
        </div>
        <div className="h-2 bg-surface-tertiary rounded-full mb-4" />
        <div className="bg-surface rounded-xl shadow-lg p-6">
          <div className="space-y-4 animate-pulse">
            <div className="h-5 bg-surface-tertiary rounded w-3/4" />
            <div className="space-y-2">
              <div className="h-12 bg-surface-tertiary rounded-lg" />
              <div className="h-12 bg-surface-tertiary rounded-lg" />
              <div className="h-12 bg-surface-tertiary rounded-lg" />
              <div className="h-12 bg-surface-tertiary rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state when current section is done but more sections are streaming in
  const currentSectionDone = sectionResults[currentSectionIndex]?.completed;
  const waitingForMore = !isStreamingComplete && currentSectionIndex >= sections.length - 1 && currentSectionDone;

  if (waitingForMore) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-content">{task.title}</h2>
          <p className="text-content-secondary text-sm">{task.description}</p>
        </div>
        <div className="bg-surface rounded-xl shadow-lg p-8">
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            <p className="text-content-secondary font-medium">Loading next exercise...</p>
            <p className="text-content-tertiary text-sm">Section {sections.length + 1} is being prepared</p>
          </div>
        </div>
      </div>
    );
  }

  // Show results screen
  if (showResults) {
    const { score, total } = getTotalScore();
    const passed = getPassStatus();
    const percentage = Math.round((score / total) * 100);
    const encouragement = percentage >= 90
      ? 'Outstanding! You nailed it!'
      : percentage >= 70
      ? 'Great job! Keep it up!'
      : percentage >= 50
      ? 'Good effort! Review the explanations to strengthen your understanding.'
      : 'Keep practicing! Read through the concept explanations to build your knowledge.';

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg mx-auto"
      >
        <div className="bg-surface rounded-xl shadow-lg p-8 text-center">
          {/* Animated trophy */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
            className={clsx(
              'w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-2',
              passed ? 'bg-green-100' : 'bg-orange-100'
            )}
          >
            {passed ? (
              <Trophy className="w-10 h-10 text-green-600" />
            ) : (
              <RotateCcw className="w-10 h-10 text-orange-600" />
            )}
          </motion.div>

          {/* Star rating */}
          <StarRating percentage={percentage} />

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-2xl font-bold mb-1"
          >
            {passed ? 'Practice Complete!' : 'Keep Practicing!'}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-content-tertiary text-sm mb-4"
          >
            {encouragement}
          </motion.p>

          {/* XP and streak stats */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex justify-center gap-6 mb-6"
          >
            <div className="flex items-center gap-1.5">
              <Zap className="w-5 h-5 text-green-500" />
              <span className="text-lg font-bold text-green-600">{xp}</span>
              <span className="text-sm text-content-tertiary">XP</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Flame className="w-5 h-5 text-orange-500" />
              <span className="text-lg font-bold text-orange-600">{maxStreak}</span>
              <span className="text-sm text-content-tertiary">best streak</span>
            </div>
            <div className="text-center">
              <span className="text-lg font-bold text-content">{percentage}%</span>
              <span className="text-sm text-content-tertiary ml-1">score</span>
            </div>
          </motion.div>

          {/* Section breakdown */}
          <div className="bg-surface-secondary rounded-lg p-4 mb-6 text-left">
            <h3 className="text-sm font-medium text-content-tertiary mb-3">Section Breakdown</h3>
            <div className="space-y-2">
              {sections.filter(Boolean).map((section, index) => {
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
                onClick={resetTask}
                className="flex-1 px-4 py-3 border border-border rounded-lg hover:bg-surface-secondary transition-colors"
              >
                Try Again
              </button>
            )}
            <button
              onClick={onComplete}
              className="flex-1 px-4 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center justify-center gap-2"
            >
              {passed ? 'Continue' : 'Continue Anyway'}
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto relative">
      {/* Floating XP animations */}
      <AnimatePresence>
        {floatingXPs.map(f => (
          <FloatingXP key={f.id} id={f.id} amount={f.amount} />
        ))}
      </AnimatePresence>

      {/* Task header with gamification bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-content">{task.title}</h2>
          <div className="flex items-center gap-3">
            {/* XP counter */}
            <div className="flex items-center gap-1">
              <Zap className="w-4 h-4 text-green-500" />
              <span className="text-sm font-bold text-green-600">{xp}</span>
            </div>
            {/* Streak counter */}
            {streak > 0 && (
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1"
              >
                <Flame className={clsx('w-4 h-4', streak >= 5 ? 'text-orange-500' : 'text-orange-400')} />
                <span className={clsx('text-sm font-bold', streak >= 5 ? 'text-orange-600' : 'text-orange-500')}>
                  {streak}
                </span>
              </motion.div>
            )}
          </div>
        </div>
        <p className="text-content-secondary text-sm">{task.description}</p>
      </div>

      {/* Green progress bar (overall across all sections) */}
      <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden mb-4">
        <motion.div
          className="h-full bg-green-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${totalQuestions > 0 ? (questionsAnswered / totalQuestions) * 100 : 0}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Section progress indicators */}
      <div className="flex gap-2 mb-4">
        {sections.map((_, index) => {
          const result = sectionResults[index];
          const isActive = index === currentSectionIndex;
          const isCompleted = result?.completed;

          return (
            <div
              key={index}
              className={clsx(
                'flex-1 h-1.5 rounded-full transition-all',
                isCompleted
                  ? 'bg-green-500'
                  : isActive
                  ? 'bg-brand-500'
                  : 'bg-surface-tertiary'
              )}
            />
          );
        })}
      </div>

      {/* Section label */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-content-tertiary">
          Section {currentSectionIndex + 1} of {sections.length}
        </span>
        <span className="text-sm px-2 py-0.5 bg-surface-tertiary rounded-full capitalize">
          {currentSection.type}
        </span>
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

      {/* Subtle continue button - always visible */}
      <div className="mt-6 flex justify-end">
        {!isStreamingComplete && currentSectionIndex >= sections.length - 1 ? (
          <div className="flex items-center gap-2 text-content-tertiary text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading more exercises...</span>
          </div>
        ) : (
          <button
            onClick={handleContinue}
            className="text-sm text-content-tertiary hover:text-content-secondary transition-colors flex items-center gap-1"
          >
            {currentSectionIndex < sections.length - 1 ? 'Skip section' : 'Finish'}
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
