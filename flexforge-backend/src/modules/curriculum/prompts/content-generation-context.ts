/**
 * Unified Content Generation Context
 *
 * This interface provides a single source of truth for all content generation prompts.
 * All components (foundationCards, task1, bossMilestone, intensivePractice) receive
 * the same personalization and continuity context for consistent learning experiences.
 */

import { SkillLevel } from '../../../database/entities/session.entity';
import { SkillType, SkillComplexity } from '../services/skill-detector.service';
import { SectionType, TargetLanguage } from './curriculum-prompt';

/**
 * Personalization inputs from user reflection and preferences.
 * Shared across ALL prompt builders for consistent content generation.
 */
export interface PersonalizationContext {
  /** User-specified areas to emphasize (e.g., "conflict resolution", "async/await") */
  improvementAreas?: string[];
  /** User-specified areas to reduce content for */
  lessOfAreas?: string[];
  /** Concepts the user was confused about (from previous day reflection) */
  confusedConcepts?: string[];
  /** What aspect was unclear: when to apply, how to apply, connections, or everything */
  whatsFoggy?: 'when' | 'how' | 'connection' | 'everything';
  /** User's self-reported confidence (1-5) from previous day */
  confidence?: number;
  /** Whether user completed the concept boost */
  boostCompleted?: boolean;
}

/**
 * Cross-day continuity context.
 * Helps maintain narrative flow across the curriculum.
 */
export interface ContinuityContext {
  /** Title of the previous day for recap/connection */
  previousDayTitle?: string;
  /** Main concept from previous day */
  previousDayConcept?: string;
  /** Target boss project title (for project-based curricula) */
  bossProjectTarget?: string;
  /** Progress description of boss project from previous days */
  bossProjectProgress?: string;
  /** Previous day's boss milestone solution code (to build on) */
  previousDayCode?: string;
}

/**
 * Content generated during core phase, passed to deferred phase.
 * Ensures deferred content references what the user has already learned.
 */
export interface GeneratedContent {
  /** Concepts from today's foundation cards (for task1, bossMilestone, intensive to reference) */
  foundationCardConcepts: string[];
}

/**
 * Unified context for all content generation prompts.
 * Built once per day generation and passed to all prompt builders.
 */
export interface ContentGenerationContext {
  // ==================== Skill Metadata (immutable) ====================

  /** Name of the skill being learned */
  skillName: string;
  /** Type of skill (CODE, PHYSICAL, KNOWLEDGE, DESIGN, AI_AGENT) */
  skillType: SkillType;
  /** Skill level (BEGINNER, INTERMEDIATE, ADVANCED) */
  skillLevel: SkillLevel;
  /** Complexity assessment from skill detector */
  complexity: SkillComplexity;
  /** Programming/spoken language for the content */
  suggestedLanguage?: string;
  /** Whether this curriculum uses boss projects or practice exercises */
  isProjectBased: boolean;
  /** User tier (FREE, PRO, PREMIUM) */
  userTier: string;
  /** Hours per day for learning */
  hoursPerDay: number;

  // ==================== Day-specific Context ====================

  /** Current day number */
  dayNumber: number;
  /** Day title from skeleton */
  dayTitle: string;
  /** Day objectives/skills from skeleton */
  dayObjectives: string[];
  /** Full skeleton data for the day */
  skeleton: any;

  // ==================== Language Learning Specific ====================

  /** Whether this is a language learning curriculum */
  isLanguageLearning?: boolean;
  /** Target language for language learning */
  targetLanguage?: TargetLanguage;
  /** Proficiency level (HSK1, N5, A1, etc.) */
  proficiencyLevel?: string;

  // ==================== Custom Sections ====================

  /** AI-decided custom sections for hybrid skills */
  customSections?: {
    task1: SectionType[];
    intensive: SectionType[];
  } | null;

  // ==================== Personalization (shared across ALL prompts) ====================

  personalization: PersonalizationContext;

  // ==================== Continuity (cross-day context) ====================

  continuity: ContinuityContext;

  // ==================== Generated Content (populated after core) ====================

  /** Content generated during core phase, passed to deferred phase */
  generatedContent?: GeneratedContent;
}

/**
 * Helper to build ContentGenerationContext from curriculum and params.
 * Use this in curriculum.service.ts to ensure consistent context creation.
 */
export function buildContentGenerationContext(
  curriculum: any,
  dayNumber: number,
  params: {
    userTier: string;
    improvementAreas?: string[];
    lessOfAreas?: string[];
    previousDayReflection?: {
      confusedConcepts?: string[];
      confidence?: number;
      boostCompleted?: boolean;
      whatsFoggy?: string;
    };
  },
): ContentGenerationContext {
  const metadata = curriculum.metadata || {};
  const dayOverview = curriculum.days?.find((d: any) => d.day === dayNumber);
  const previousDay = curriculum.days?.find(
    (d: any) => d.day === dayNumber - 1,
  );

  // Get boss project info if project-based
  let bossProjectTarget: string | undefined;
  let bossProjectProgress: string | undefined;

  if (metadata.isProjectBased && curriculum.bossProjects?.length > 0) {
    const bossProject = curriculum.bossProjects[0];
    bossProjectTarget = bossProject.title;

    // Build progress from previous days' bossMilestonePreview
    const previousDays = curriculum.days?.filter(
      (d: any) => d.day < dayNumber && d.bossMilestonePreview,
    );
    if (previousDays?.length > 0) {
      bossProjectProgress = previousDays
        .map((d: any) => `Day ${d.day}: ${d.bossMilestonePreview}`)
        .join('; ');
    }
  }

  // Get previous day's boss milestone code (for cumulative building)
  let previousDayCode: string | undefined;
  if (previousDay?.deferredContent?.bossMilestone?.solutionCode) {
    previousDayCode = previousDay.deferredContent.bossMilestone.solutionCode;
  } else if (previousDay?.bossMilestone?.solutionCode) {
    previousDayCode = previousDay.bossMilestone.solutionCode;
  }

  return {
    // Skill metadata
    skillName: metadata.skillName || curriculum.title || '',
    skillType: metadata.skillType,
    skillLevel: metadata.skillLevel,
    complexity: metadata.complexity,
    suggestedLanguage: metadata.suggestedLanguage,
    isProjectBased: metadata.isProjectBased ?? false,
    userTier: params.userTier,
    hoursPerDay: metadata.hoursPerDay || 1,

    // Day-specific
    dayNumber,
    dayTitle: dayOverview?.title || `Day ${dayNumber}`,
    dayObjectives: dayOverview?.skills || [],
    skeleton: dayOverview,

    // Language learning
    isLanguageLearning: metadata.isLanguageLearning,
    targetLanguage: metadata.targetLanguage,
    proficiencyLevel: metadata.proficiencyLevel,

    // Custom sections
    customSections: metadata.customSections,

    // Personalization
    personalization: {
      improvementAreas: params.improvementAreas,
      lessOfAreas: params.lessOfAreas,
      confusedConcepts: params.previousDayReflection?.confusedConcepts,
      whatsFoggy: params.previousDayReflection?.whatsFoggy as
        | 'when'
        | 'how'
        | 'connection'
        | 'everything'
        | undefined,
      confidence: params.previousDayReflection?.confidence,
      boostCompleted: params.previousDayReflection?.boostCompleted,
    },

    // Continuity
    continuity: {
      previousDayTitle: previousDay?.title,
      previousDayConcept:
        previousDay?.coreContent?.foundationCards?.[0]?.concept,
      bossProjectTarget,
      bossProjectProgress,
      previousDayCode,
    },
  };
}

/**
 * Helper to extract foundation card concepts from core content.
 * Use after AI generates core content to populate generatedContent.
 */
export function extractFoundationCardConcepts(coreContent: any): string[] {
  const cards =
    coreContent?.languageFoundationCards || coreContent?.foundationCards;

  if (!cards || !Array.isArray(cards)) {
    return [];
  }

  return cards
    .map((card: any) => {
      // For vocabulary cards, use term; for regular cards, use concept
      return card.vocabulary?.term || card.concept || '';
    })
    .filter((concept: string) => concept.length > 0);
}
