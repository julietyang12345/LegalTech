import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Trophy, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import { ExerciseLoadingScreen } from '@/components/common';
import {
  QuizSectionExercise,
  MatchingSectionExercise,
  ToneSelectSectionExercise,
  FillBlankSectionExercise,
  TranslationSectionExercise,
  ReorderSectionExercise,
  TypingSectionExercise,
  OpenEndedSectionExercise,
  type BookmarkQuestionData,
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
import type {
  TaskSection,
  CurriculumDay,
  Session,
  TargetLanguage,
  QuizTask,
  FillBlankTask,
  MixedTask,
  SectionsTask,
  QuizSection,
  LanguageFillBlankSection,
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
 * Converts a legacy FillBlankTask to sections format
 */
function convertFillBlankToSections(task: FillBlankTask): TaskSection[] {
  const fillBlankSection: LanguageFillBlankSection = {
    type: 'fillBlank',
    title: task.title || 'Fill in the Blanks',
    instructions: task.description || 'Complete the blanks with the correct answers',
    items: task.items.map(item => ({
      id: item.id,
      sentence: item.codeTemplate,
      translation: item.explanation || '',
      blank: {
        correctAnswers: item.blanks[0]?.correctAnswers || [],
        hint: item.blanks[0]?.hint,
      },
    })),
  };
  return [fillBlankSection];
}

/**
 * Gets sections from a task, converting legacy formats if needed
 */
function getTaskSections(task: QuizTask | FillBlankTask | MixedTask | SectionsTask): TaskSection[] {
  const format = (task as any).format;

  if (format === 'sections' || format === 'mixed') {
    return (task as MixedTask | SectionsTask).sections || [];
  }

  if (format === 'quiz') {
    return convertQuizToSections(task as QuizTask);
  }

  if (format === 'fillBlank') {
    return convertFillBlankToSections(task as FillBlankTask);
  }

  // Fallback: check if sections array exists
  if ('sections' in task && Array.isArray((task as any).sections)) {
    return (task as any).sections;
  }

  // Fallback: check if questions array exists (legacy quiz)
  if ('questions' in task && Array.isArray((task as any).questions)) {
    return convertQuizToSections(task as QuizTask);
  }

  // Fallback: check if items array exists (legacy fillBlank)
  if ('items' in task && Array.isArray((task as any).items)) {
    return convertFillBlankToSections(task as FillBlankTask);
  }

  return [];
}

export function SectionTaskStep({ day, session, onComplete, onBookmarkQuestion, onShareQuestion }: SectionTaskStepProps) {
  const task = day.task1 as QuizTask | FillBlankTask | MixedTask | SectionsTask;
  const sections = getTaskSections(task);
  const targetLanguage = session.curriculum?.metadata?.targetLanguage as TargetLanguage | undefined;
  const _skillType = session.curriculum?.skillType;

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [sectionResults, setSectionResults] = useState<Record<number, SectionResult>>({});
  const [showResults, setShowResults] = useState(false);

  const currentSection = sections[currentSectionIndex];
  const passingScore = (task as any)?.passingScore || 0.7;

  const handleSectionComplete = (score: number, total: number) => {
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
    } else {
      setShowResults(true);
    }
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
      case 'matching':
        return (
          <MatchingSectionExercise
            section={section}
            onComplete={handleSectionComplete}
          />
        );
      case 'reorder':
        return (
          <ReorderSectionExercise
            section={section}
            onComplete={handleSectionComplete}
          />
        );
      case 'fillBlank':
        return (
          <FillBlankSectionExercise
            section={section}
            onComplete={handleSectionComplete}
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
      case 'outputPrediction':
        return (
          <OutputPredictionExercise
            section={section}
            onComplete={handleSectionComplete}
          />
        );

      // Physical-specific sections
      case 'formCheck':
        return (
          <FormCheckExercise
            section={section}
            onComplete={handleSectionComplete}
          />
        );
      case 'safetyCheck':
        return (
          <SafetyCheckExercise
            section={section}
            onComplete={handleSectionComplete}
          />
        );

      // Design-specific sections
      case 'designCritique':
        return (
          <DesignCritiqueExercise
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

      default:
        return (
          <div className="text-center py-8 text-gray-500">
            Unknown section type: {(section as any).type}
          </div>
        );
    }
  };

  if (!task || sections.length === 0) {
    return (
      <div className="max-w-lg mx-auto">
        <ExerciseLoadingScreen
          type="task"
          skillName={session.skillName}
          dayNumber={day.day}
        />
      </div>
    );
  }

  // Show results screen
  if (showResults) {
    const { score, total } = getTotalScore();
    const passed = getPassStatus();
    const percentage = Math.round((score / total) * 100);

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg mx-auto"
      >
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
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
                onClick={resetTask}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
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
    <div className="max-w-2xl mx-auto">
      {/* Task header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">{task.title}</h2>
        <p className="text-gray-600">{task.description}</p>
      </div>

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
                  ? 'bg-brand-500'
                  : 'bg-gray-200'
              )}
            />
          );
        })}
      </div>

      {/* Section label */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-gray-500">
          Section {currentSectionIndex + 1} of {sections.length}
        </span>
        <span className="text-sm px-2 py-0.5 bg-gray-100 rounded-full capitalize">
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
        <button
          onClick={handleContinue}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
        >
          {currentSectionIndex < sections.length - 1 ? 'Skip section' : 'Finish'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
