import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, ChevronRight, BookOpen, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import {
  FillBlankSectionExercise,
  TranslationSectionExercise,
  ReorderSectionExercise,
  TypingSectionExercise,
} from './LanguageExercises';
import type {
  LanguagePracticeProject,
  LanguageFillBlankSection,
  TranslationSection,
  ReorderSection,
  TypingSection,
  CurriculumDay,
  Session,
  TargetLanguage,
} from '@/types';

type IntensivePracticeSection = LanguageFillBlankSection | TranslationSection | ReorderSection | TypingSection;

interface IntensivePracticeStepProps {
  day: CurriculumDay;
  session: Session;
  onComplete: () => void;
}

interface SectionResult {
  score: number;
  total: number;
  completed: boolean;
}

export function IntensivePracticeStep({ day, session, onComplete }: IntensivePracticeStepProps) {
  // Get practice project from deferred content or direct on day
  const practiceProject = (day.deferredContent?.practiceProject || day.practiceProject) as LanguagePracticeProject | undefined;
  const sections = practiceProject?.sections || [];
  const targetLanguage = session.curriculum?.metadata?.targetLanguage as TargetLanguage | undefined;

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [sectionResults, setSectionResults] = useState<Record<number, SectionResult>>({});
  const [showResults, setShowResults] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const currentSection = sections[currentSectionIndex];

  const handleSectionComplete = (score: number, total: number) => {
    setSectionResults(prev => ({
      ...prev,
      [currentSectionIndex]: { score, total, completed: true },
    }));

    setTimeout(() => {
      if (currentSectionIndex < sections.length - 1) {
        setCurrentSectionIndex(prev => prev + 1);
      } else {
        setShowResults(true);
      }
    }, 1500);
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

  const resetPractice = () => {
    setCurrentSectionIndex(0);
    setSectionResults({});
    setShowResults(false);
  };

  const renderSection = (section: IntensivePracticeSection) => {
    switch (section.type) {
      case 'fillBlank':
        return (
          <FillBlankSectionExercise
            section={section}
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
      case 'reorder':
        return (
          <ReorderSectionExercise
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
      default:
        return null;
    }
  };

  // No practice project available
  if (!practiceProject || sections.length === 0) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <BookOpen className="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">No Intensive Practice Available</h2>
        <p className="text-gray-500 mb-6">
          Intensive practice exercises are still being generated or not available for this day.
        </p>
        <button
          onClick={onComplete}
          className="px-6 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
        >
          Continue to Reflection
        </button>
      </div>
    );
  }

  // Introduction screen
  if (!hasStarted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg mx-auto"
      >
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto bg-brand-100 rounded-full flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-brand-600" />
          </div>

          <h2 className="text-2xl font-bold mb-2">{practiceProject.title}</h2>
          <p className="text-gray-600 mb-6">{practiceProject.description}</p>

          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <h3 className="text-sm font-medium text-gray-500 mb-3">What you'll practice:</h3>
            <ul className="space-y-2">
              {sections.map((section, index) => (
                <li key={index} className="flex items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </span>
                  <span>{section.title}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-6">
            <span>Estimated time:</span>
            <span className="font-medium">{practiceProject.estimatedMinutes} minutes</span>
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
              className="flex-1 px-4 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center justify-center gap-2"
            >
              Start Practice
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Results screen
  if (showResults) {
    const { score, total } = getTotalScore();
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg mx-auto"
      >
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
            <Trophy className="w-10 h-10 text-green-600" />
          </div>

          <h2 className="text-2xl font-bold mb-2">Practice Complete!</h2>

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
            <button
              onClick={resetPractice}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Practice Again
            </button>
            <button
              onClick={onComplete}
              className="flex-1 px-4 py-3 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center justify-center gap-2"
            >
              Continue
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Practice in progress
  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">{practiceProject.title}</h2>
        <p className="text-sm text-gray-500">Intensive practice to reinforce today's vocabulary</p>
      </div>

      {/* Section progress indicators */}
      <div className="flex gap-2 mb-6">
        {sections.map((section, index) => {
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
          {currentSection.type === 'fillBlank' ? 'Fill in Blank' : currentSection.type}
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
    </div>
  );
}
