import { GoalType, type SessionStep, type TrainingConfig } from '@/types';

const TRAINING_CONFIGS: Record<string, TrainingConfig> = {
  [GoalType.INTERVIEW]: {
    goalType: GoalType.INTERVIEW,
    name: 'Interview Prep',
    subtitle: 'Short, sharp simulations that build real interview confidence.',
    stepFlow: ['prePrompt', 'task1', 'reflection'],
    stepLabels: {
      prePrompt: 'Scenario Brief',
      task1: 'Timed Attempt',
      reflection: 'Feedback & Fix',
    },
    hasTimedAttempt: true,
    scoringType: 'rubric',
    defaultTimerMinutes: 25,
  },
  [GoalType.PROJECT]: {
    goalType: GoalType.PROJECT,
    name: 'Project Lab',
    subtitle: 'Turn real work problems into a learning engine.',
    stepFlow: ['prePrompt', 'task1', 'reflection'],
    stepLabels: {
      prePrompt: "Today's Focus",
      task1: 'Build',
      reflection: 'Apply & Reflect',
    },
    hasTimedAttempt: false,
    scoringType: 'feedback',
    defaultTimerMinutes: 0,
  },
  [GoalType.AI_BUILDER]: {
    goalType: GoalType.AI_BUILDER,
    name: 'AI Builder',
    subtitle: 'Build one small thing that actually works, using AI.',
    stepFlow: ['prePrompt', 'task1', 'reflection'],
    stepLabels: {
      prePrompt: 'Project Scope',
      task1: 'Build with AI',
      reflection: 'Ship & Reflect',
    },
    hasTimedAttempt: false,
    scoringType: 'feedback',
    defaultTimerMinutes: 0,
  },
  [GoalType.LANGUAGE]: {
    goalType: GoalType.LANGUAGE,
    name: 'Speak & Write',
    subtitle: 'Master any language — from basics to professional fluency.',
    stepFlow: ['prePrompt', 'task1', 'reflection'],
    stepLabels: {
      prePrompt: "Today's Lesson",
      task1: 'Exercises',
      reflection: 'Reflect',
    },
    hasTimedAttempt: false,
    scoringType: 'none',
    defaultTimerMinutes: 0,
  },
};

// Default curriculum config (used for standard learning sessions)
const CURRICULUM_CONFIG: TrainingConfig = {
  goalType: GoalType.CURRICULUM,
  name: 'Learn Something New',
  subtitle: 'Structured multi-day learning with video, practice & projects.',
  stepFlow: ['prePrompt', 'video', 'task1', 'bossMilestone', 'openTask', 'reflection'],
  stepLabels: {
    prePrompt: 'Pre-Prompt',
    video: 'Video',
    task1: 'Practice',
    bossMilestone: 'Boss Milestone',
    openTask: 'Open Task',
    reflection: 'Reflection',
  },
  hasTimedAttempt: false,
  scoringType: 'none',
  defaultTimerMinutes: 0,
};

/**
 * Get training config for a goalType.
 * Returns curriculum config for CURRICULUM or undefined goalType.
 */
export function getTrainingConfig(goalType?: GoalType): TrainingConfig {
  if (!goalType || goalType === GoalType.CURRICULUM) return CURRICULUM_CONFIG;
  return TRAINING_CONFIGS[goalType] || CURRICULUM_CONFIG;
}

/**
 * Get step flow for a goalType.
 */
export function getStepFlow(goalType?: GoalType): SessionStep[] {
  return getTrainingConfig(goalType).stepFlow;
}

/**
 * Check if a goalType uses training mode (non-curriculum).
 */
export function isTrainingMode(goalType?: GoalType): boolean {
  return !!goalType && goalType !== GoalType.CURRICULUM;
}

/**
 * Get all training configs for display (e.g., in onboarding).
 */
export function getAllModeConfigs(): TrainingConfig[] {
  return [CURRICULUM_CONFIG, ...Object.values(TRAINING_CONFIGS)];
}
