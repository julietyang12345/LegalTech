import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  BookOpen,
  Layers,
  Code,
  Trophy,
  Target,
  Lightbulb,
  Volume2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Card } from '@/components/common';
import { VocabularyCard } from './VocabularyCard';
import { clsx } from 'clsx';
import type {
  CurriculumDay,
  FoundationCard,
  LanguageFoundationCard,
  TargetLanguage,
  ReflectionQuestion,
} from '@/types';

export type PreviewStep =
  | 'overview'
  | 'video'
  | 'foundationCards'
  | 'task1'
  | 'bossMilestone'
  | 'openTask'
  | 'reflection';

interface StepContentPreviewProps {
  day: CurriculumDay;
  step: PreviewStep;
  targetLanguage?: TargetLanguage;
  maxHeight?: string;
  compact?: boolean;
}

// Step header with icon
function StepHeader({
  icon: Icon,
  iconColor,
  title,
  subtitle,
}: {
  icon: typeof Play;
  iconColor: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', iconColor)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
}

// Foundation card in preview mode (non-interactive)
function FoundationCardPreview({
  card,
  index,
  isLanguageLearning,
  targetLanguage,
}: {
  card: FoundationCard | LanguageFoundationCard;
  index: number;
  isLanguageLearning?: boolean;
  targetLanguage?: TargetLanguage;
}) {
  const [expanded, setExpanded] = useState(false);

  const isVocabCard = 'vocabulary' in card && card.vocabulary;

  if (isVocabCard && targetLanguage) {
    return (
      <div className="pointer-events-none">
        <VocabularyCard
          vocabulary={(card as LanguageFoundationCard).vocabulary!}
          language={targetLanguage}
          onMastered={() => {}}
        />
      </div>
    );
  }

  return (
    <Card className="overflow-hidden border border-gray-200">
      {/* Card header */}
      <div className="relative">
        <div className="absolute -top-8 -right-8 w-24 h-24 bg-gradient-to-br from-indigo-200/40 to-purple-200/40 rounded-full blur-2xl" />
        <div className="relative p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-violet-600">{index + 1}</span>
            </div>
            <h4 className="font-semibold text-gray-900 flex-1">{card.concept}</h4>
            {isLanguageLearning && (
              <button className="p-2 rounded-full bg-purple-50 text-purple-600">
                <Volume2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="px-4 pb-4">
        <p className={clsx('text-sm text-gray-600', !expanded && 'line-clamp-3')}>
          {card.explanation}
        </p>
        {card.explanation.length > 150 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs text-brand-600 flex items-center gap-1"
          >
            {expanded ? (
              <>
                Show less <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                Show more <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Real World Context */}
      {card.realWorldContext && (
        <div className="mx-4 mb-4 p-3 rounded-lg bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-100">
          <div className="flex items-start gap-2">
            <span className="text-brand-500 flex-shrink-0">🎯</span>
            <p className="text-sm text-brand-800">{card.realWorldContext}</p>
          </div>
        </div>
      )}

      {/* Code Example */}
      {card.codeExample && (
        <div className="mx-4 mb-4 rounded-lg overflow-hidden">
          <div className="bg-gray-800 px-3 py-1.5 text-xs text-gray-400 font-mono">Example</div>
          <pre className="bg-gray-900 p-3 text-xs text-gray-100 overflow-x-auto">
            <code>{card.codeExample}</code>
          </pre>
        </div>
      )}
    </Card>
  );
}

// Main preview component
export function StepContentPreview({
  day,
  step,
  targetLanguage,
  maxHeight = '500px',
  compact = false,
}: StepContentPreviewProps) {
  const isLanguageLearning = !!targetLanguage;

  // Overview
  if (step === 'overview') {
    return (
      <div className={clsx('space-y-4', compact && 'space-y-3')}>
        <StepHeader
          icon={BookOpen}
          iconColor="bg-gradient-to-br from-brand-500 to-purple-500"
          title={day.title}
          subtitle={`Day ${day.day}`}
        />

        {day.objectives && day.objectives.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Objectives</h4>
            <ul className="space-y-1.5">
              {day.objectives.map((obj, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  {obj}
                </li>
              ))}
            </ul>
          </div>
        )}

        {day.estimatedMinutes && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            <span>{day.estimatedMinutes} minutes</span>
          </div>
        )}
      </div>
    );
  }

  // Video
  if (step === 'video') {
    const video = day.video || (day as any).deferredContent?.video;
    if (!video) return <p className="text-gray-500 text-sm">No video available</p>;

    return (
      <div className="space-y-4">
        <StepHeader
          icon={Play}
          iconColor="bg-gradient-to-br from-blue-500 to-cyan-500"
          title={video.title || day.title}
          subtitle="Video Lesson"
        />

        {/* Video placeholder */}
        <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center mx-auto mb-3">
              <Play className="w-8 h-8 text-brand-600 ml-1" />
            </div>
            <p className="text-sm text-gray-600">{video.title || 'Video Lesson'}</p>
          </div>
        </div>

        {(video as any).description && (
          <p className="text-sm text-gray-600">{(video as any).description}</p>
        )}

        {(video as any).keyPoints && (video as any).keyPoints.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Key Points</h4>
            <ul className="space-y-1">
              {(video as any).keyPoints.map((point: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-brand-500">•</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Foundation Cards
  if (step === 'foundationCards') {
    // Check both direct properties and deferredContent
    const cards = (
      day.languageFoundationCards ||
      day.foundationCards ||
      (day as any).deferredContent?.languageFoundationCards ||
      (day as any).deferredContent?.foundationCards ||
      []
    ) as (FoundationCard | LanguageFoundationCard)[];

    if (cards.length === 0) {
      return <p className="text-gray-500 text-sm">No foundation cards available</p>;
    }

    return (
      <div className="space-y-4">
        <StepHeader
          icon={Layers}
          iconColor="bg-gradient-to-br from-violet-500 to-purple-500"
          title="Foundation Cards"
          subtitle={`${cards.length} concept cards`}
        />

        <div
          className="space-y-4 overflow-y-auto pr-2"
          style={{ maxHeight }}
        >
          {cards.map((card, i) => (
            <FoundationCardPreview
              key={card.id}
              card={card}
              index={i}
              isLanguageLearning={isLanguageLearning}
              targetLanguage={targetLanguage}
            />
          ))}
        </div>
      </div>
    );
  }

  // Task1
  if (step === 'task1') {
    // Check both day.task1 and day.deferredContent?.task1
    const task = (day.task1 || (day as any).deferredContent?.task1) as any;
    if (!task) return <p className="text-gray-500 text-sm">No practice task available</p>;

    return (
      <div className="space-y-4">
        <StepHeader
          icon={Code}
          iconColor="bg-gradient-to-br from-blue-500 to-indigo-500"
          title={task.title || 'Practice Task'}
          subtitle="Interactive Practice"
        />

        {task.description && <p className="text-sm text-gray-600">{task.description}</p>}

        {/* Questions preview */}
        {task.questions && task.questions.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700">
              Questions ({task.questions.length})
            </h4>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {task.questions.map((q: any, i: number) => (
                <Card key={i} className="p-4 border border-gray-200">
                  <p className="font-medium text-gray-900 mb-3">
                    {i + 1}. {q.question || q.text}
                  </p>
                  {q.options && (
                    <div className="space-y-2 ml-4">
                      {q.options.map((opt: string, j: number) => (
                        <div
                          key={j}
                          className={clsx(
                            'p-2 rounded-lg text-sm',
                            (q.correctAnswer === opt || q.answer === opt)
                              ? 'bg-green-100 text-green-800 border border-green-200'
                              : 'bg-gray-50 text-gray-600 border border-gray-100'
                          )}
                        >
                          {opt}
                          {(q.correctAnswer === opt || q.answer === opt) && (
                            <CheckCircle2 className="inline w-4 h-4 ml-2 text-green-600" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Sections preview - show actual content */}
        {task.sections && task.sections.length > 0 && (
          <div className="space-y-4">
            {task.sections.map((section: any, sectionIndex: number) => {
              // Get items from either 'questions' or 'items' depending on section type
              const sectionItems = section.questions || section.items || [];
              const itemCount = sectionItems.length;

              return (
              <div key={sectionIndex} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full capitalize">
                    {section.type}
                  </span>
                  {itemCount > 0 && (
                    <span className="text-sm font-medium text-gray-700">
                      {itemCount} {itemCount === 1 ? 'question' : 'questions'}
                    </span>
                  )}
                </div>
                {sectionItems.length > 0 && (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {sectionItems.map((item: any, itemIndex: number) => (
                      <Card key={itemIndex} className="p-4 border border-gray-200">
                        <p className="font-medium text-gray-900 mb-3">
                          {itemIndex + 1}. {item.question || item.text}
                        </p>
                        {item.options && (
                          <div className="space-y-2 ml-4">
                            {item.options.map((opt: string, optIndex: number) => (
                              <div
                                key={optIndex}
                                className={clsx(
                                  'p-2 rounded-lg text-sm',
                                  (item.correctAnswer === opt || item.answer === opt)
                                    ? 'bg-green-100 text-green-800 border border-green-200'
                                    : 'bg-gray-50 text-gray-600 border border-gray-100'
                                )}
                              >
                                {opt}
                                {(item.correctAnswer === opt || item.answer === opt) && (
                                  <CheckCircle2 className="inline w-4 h-4 ml-2 text-green-600" />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {item.explanation && (
                          <div className="mt-3 p-2 bg-blue-50 rounded-lg border border-blue-100">
                            <p className="text-sm text-blue-700">
                              <span className="font-medium">Explanation:</span> {item.explanation}
                            </p>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}

        {/* Code snippet */}
        {(task.code || task.starterCode) && (
          <div className="rounded-lg overflow-hidden">
            <div className="bg-gray-800 px-3 py-1.5 text-xs text-gray-400 font-mono">
              Starter Code
            </div>
            <pre className="bg-gray-900 p-3 text-xs text-gray-100 overflow-x-auto max-h-[200px]">
              <code>{task.code || task.starterCode}</code>
            </pre>
          </div>
        )}
      </div>
    );
  }

  // Boss Milestone
  if (step === 'bossMilestone') {
    const boss = day.bossMilestone || (day as any).deferredContent?.bossMilestone;
    if (!boss) return <p className="text-gray-500 text-sm">No boss milestone available</p>;

    return (
      <div className="space-y-4">
        <StepHeader
          icon={Trophy}
          iconColor="bg-gradient-to-br from-purple-500 to-pink-500"
          title={boss.title}
          subtitle="Boss Milestone"
        />

        <p className="text-sm text-gray-600">{boss.description}</p>

        {boss.microTask && (
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
            <h4 className="text-sm font-medium text-purple-800 mb-2">Today's Task</h4>
            <p className="text-sm text-purple-700">{boss.microTask}</p>
          </div>
        )}

        {boss.dayContribution && (
          <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100">
            <h4 className="text-sm font-medium text-purple-800 mb-1">Goal</h4>
            <p className="text-sm text-purple-700">{boss.dayContribution}</p>
          </div>
        )}

        {boss.starterCode && (
          <div className="rounded-lg overflow-hidden">
            <div className="bg-gray-800 px-3 py-1.5 text-xs text-gray-400 font-mono">
              Starter Code
            </div>
            <pre className="bg-gray-900 p-3 text-xs text-gray-100 overflow-x-auto max-h-[200px]">
              <code>{boss.starterCode}</code>
            </pre>
          </div>
        )}

        {boss.hints && boss.hints.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Hints</h4>
            <div className="space-y-2">
              {boss.hints.slice(0, 3).map((hint: string | { hint: string }, i: number) => (
                <div key={i} className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-sm text-yellow-800">
                  💡 {typeof hint === 'string' ? hint : hint.hint}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Open Task
  if (step === 'openTask') {
    // Check both day.openTask and day.deferredContent?.openTask
    const openTask = (day.openTask || (day as any).deferredContent?.openTask) as any;
    if (!openTask) return <p className="text-gray-500 text-sm">No real-world challenge available</p>;

    return (
      <div className="space-y-4">
        <StepHeader
          icon={Target}
          iconColor="bg-gradient-to-br from-orange-500 to-red-500"
          title={openTask.title || 'Real-World Challenge'}
          subtitle="Apply what you learned"
        />

        {openTask.description && <p className="text-sm text-gray-600">{openTask.description}</p>}

        {openTask.challenge && (
          <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
            <h4 className="text-sm font-medium text-orange-800 mb-2">Challenge</h4>
            <p className="text-sm text-orange-700">{openTask.challenge}</p>
          </div>
        )}

        {openTask.context && (
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Context</h4>
            <p className="text-sm text-gray-600">{openTask.context}</p>
          </div>
        )}

        {openTask.successCriteria && openTask.successCriteria.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Success Criteria</h4>
            <ul className="space-y-1.5">
              {openTask.successCriteria.map((criteria: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  {criteria}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Reflection
  if (step === 'reflection') {
    // Check both day.reflection and day.deferredContent?.reflection
    const reflection = day.reflection || (day as any).deferredContent?.reflection;
    if (!reflection?.questions || reflection.questions.length === 0) {
      return <p className="text-gray-500 text-sm">No reflection questions available</p>;
    }

    return (
      <div className="space-y-4">
        <StepHeader
          icon={Lightbulb}
          iconColor="bg-gradient-to-br from-yellow-500 to-orange-500"
          title="Daily Reflection"
          subtitle={`${reflection.questions.length} questions`}
        />

        <div className="space-y-3">
          {reflection.questions.map((q: ReflectionQuestion, i: number) => (
            <Card key={q.id || i} className="p-4 bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-yellow-700">{i + 1}</span>
                </div>
                <p className="text-gray-800 font-medium">{q.question}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return <p className="text-gray-500 text-sm">Select a step to preview</p>;
}
