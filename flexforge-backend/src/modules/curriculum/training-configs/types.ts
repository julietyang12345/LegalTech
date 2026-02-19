import { GoalType } from '../../../database/entities/session.entity';

export type TrainingSessionStep =
  | 'prePrompt'
  | 'video'
  | 'task1'
  | 'bossMilestone'
  | 'openTask'
  | 'reflection';

export interface TrainingConfig {
  goalType: GoalType;
  name: string;
  subtitle: string;
  stepFlow: TrainingSessionStep[];
  stepLabels: Record<string, string>;
  scenarioTypes: string[];
  subskills: string[];
  hasTimedAttempt: boolean;
  scoringType: 'rubric' | 'feedback' | 'none';
  defaultTimerMinutes: number;
  promptOverrides: {
    skeleton: string;
    dayCore: string;
  };
}
