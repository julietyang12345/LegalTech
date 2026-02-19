import { GoalType } from '@/types';
import type { GapProfile } from '@/types';

// ============================================
// Score display helpers (shared across assessment UIs)
// ============================================

export function getScoreColor(score: number): string {
  if (score >= 4) return 'bg-focus-500';
  if (score >= 3) return 'bg-amber-500';
  if (score >= 2) return 'bg-orange-500';
  return 'bg-red-500';
}

export function getScoreLabel(score: number): string {
  if (score >= 4.5) return 'Exceptional';
  if (score >= 4) return 'Solid';
  if (score >= 3) return 'Incomplete';
  if (score >= 2) return 'Superficial';
  return 'Missing';
}

// ============================================
// Gap severity styling
// ============================================

export const severityConfig = {
  high: {
    color: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    label: 'High priority',
  },
  medium: {
    color: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    label: 'Medium priority',
  },
  low: {
    color: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    label: 'Minor gap',
  },
} as const;

export type GapSeverity = keyof typeof severityConfig;

// ============================================
// Learning mode → GoalType mapping
// ============================================

export type LearningMode = 'practice' | 'project' | 'ai_builder';

export const goalTypeMap: Record<LearningMode, GoalType> = {
  practice: GoalType.CURRICULUM,
  project: GoalType.PROJECT,
  ai_builder: GoalType.AI_BUILDER,
};

// ============================================
// Persistent assessment storage (localStorage)
// ============================================

const LATEST_ASSESSMENT_KEY = 'flexforge_latest_assessment';

interface StoredAssessment {
  gapProfile: GapProfile;
  skillName: string;
  timestamp: number;
}

export function saveLatestAssessment(gapProfile: GapProfile, skillName: string): void {
  try {
    const data: StoredAssessment = { gapProfile, skillName, timestamp: Date.now() };
    localStorage.setItem(LATEST_ASSESSMENT_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

export function getLatestAssessment(): StoredAssessment | null {
  try {
    const raw = localStorage.getItem(LATEST_ASSESSMENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAssessment;
  } catch {
    return null;
  }
}

export function clearLatestAssessment(): void {
  localStorage.removeItem(LATEST_ASSESSMENT_KEY);
}
