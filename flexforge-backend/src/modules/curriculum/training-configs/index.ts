import { GoalType } from '../../../database/entities/session.entity';
import { TrainingConfig } from './types';
import { projectConfig } from './project.config';
import { aiBuilderConfig } from './ai-builder.config';
import { languageConfig } from './language.config';

export type { TrainingConfig, TrainingSessionStep } from './types';

const TRAINING_CONFIGS: Record<string, TrainingConfig> = {
  [GoalType.PROJECT]: projectConfig,
  [GoalType.AI_BUILDER]: aiBuilderConfig,
  [GoalType.LANGUAGE]: languageConfig,
};

/**
 * Get training config for a goalType.
 * Returns undefined for CURRICULUM (uses default session flow).
 */
export function getTrainingConfig(
  goalType: GoalType,
): TrainingConfig | undefined {
  if (goalType === GoalType.CURRICULUM) return undefined;
  return TRAINING_CONFIGS[goalType];
}

/**
 * Check if a goalType uses a training mode (non-curriculum).
 */
export function isTrainingMode(goalType: GoalType): boolean {
  return goalType !== GoalType.CURRICULUM;
}

/**
 * Get all available training configs.
 */
export function getAllTrainingConfigs(): TrainingConfig[] {
  return Object.values(TRAINING_CONFIGS);
}
