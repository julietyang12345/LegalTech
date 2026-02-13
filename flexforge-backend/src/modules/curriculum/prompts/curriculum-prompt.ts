import { SkillLevel } from '../../../database/entities/session.entity';
import { SkillType, SkillComplexity } from '../services/skill-detector.service';
import { ContentGenerationContext } from './content-generation-context';
import {
  buildPersonalizationInstructions,
  buildContinuityInstructions,
  buildFullContextInstructions,
} from './shared-instructions';

// Learner preferences from onboarding (optional - may not exist for users who skipped onboarding)
// Internal interface - only used within this file
// Output type for content generation (matches OutputType in learner-prefs.interface.ts)
type OutputType =
  | 'apply_skill'
  | 'ship_project'
  | 'understand_concept'
  | 'pass_exam'
  | 'teach_others'
  | 'compete'
  | 'master_basics';

interface LearnerPrefsForPrompt {
  selectedDirection?: string; // The direction they picked (more specific than skillName)
  selectedDirectionOutcome?: string; // "You'll be able to..." - specific deliverable
  directionKeywords?: string[]; // Keywords for the selected direction
  selectedLanguage?: string; // User's chosen language (overrides auto-detection)
  outputType?: OutputType; // What user wants to achieve (affects content style)
  usageContext?: 'work' | 'personal' | 'interview' | 'school';
  contentDepth?: 'fast' | 'medium' | 'deep';
  // Feeling-based inputs (easier for users than explicit skill level/time questions)
  familiarity?: 'new' | 'know_basics' | 'skilled'; // How familiar with topic
  sessionLength?: 'short' | 'medium' | 'long'; // Daily learning time availability
  improvementAreas?: string[]; // User-specified areas to emphasize (e.g., "conflict resolution", "async/await")
  // Explicit learning style choice from onboarding (projects vs practice)
  learningStyle?: 'projects' | 'practice';
}

// Internal interface - only used within this file
interface CurriculumPromptParams {
  skillName: string;
  durationDays: number;
  hoursPerDay: number;
  skillLevel: SkillLevel;
  skillType: SkillType;
  complexity: SkillComplexity;
  userTier: string;
  suggestedLanguage?: string;
  safetyLevel?: 'low' | 'medium' | 'high';
  prerequisiteSkills?: string[];
  // Learner preferences from onboarding
  learnerPrefs?: LearnerPrefsForPrompt;
  // Hybrid skill sections (from skill detector)
  customSections?: {
    task1: string[];
    intensive: string[];
  } | null;
}

// ============================================
// CONTENT LAYER & STRATEGY TYPES (used in AI prompt templates)
// ============================================
// These types document what values the AI should use in responses:
// - ContentLayer: 'foundation' | 'language_core' | 'framework' | 'tool' | 'project'
// - VideoStrategy: 'skip' | 'optional' | 'helpful' | 'recommended'
// - Transferability: 'high' | 'medium' | 'low'
// - ContentSource: 'university' | 'youtube' | 'text' | 'docs'

// ============================================
// SECTION REGISTRY (Unified Section-Based Task System)
// ============================================

// Section types available for each skill category (internal types)
type UniversalSectionType =
  | 'quiz'
  | 'matching'
  | 'fillBlank'
  | 'openEnded';
type SequenceSectionType = 'reorder'; // Only for skills where ordering matters (language, physical, some knowledge)
type LanguageSectionType = 'toneSelect' | 'translation' | 'typing';
type CodeSectionType =
  | 'codeCompletion'
  | 'debugging'
  | 'aiCodeReview' // Review AI-generated code for bugs, security issues, assumptions
  | 'outputPrediction';
type PhysicalSectionType = 'formCheck' | 'safetyCheck';
type DesignSectionType = 'designCritique';

// Exported union type for use in other modules
export type SectionType =
  | UniversalSectionType
  | SequenceSectionType
  | LanguageSectionType
  | CodeSectionType
  | PhysicalSectionType
  | DesignSectionType;

// Section registry: maps skill types to appropriate section combinations
//
// LEARNING FLOW:
// - Project-based (ANY skill): task1 + bossMilestone → NO intensive (bossMilestone IS the hands-on practice)
// - Non-project-based (ANY skill): task1 + intensive → NO bossMilestone (intensive IS the hands-on practice)
//
export const SECTION_REGISTRY: Record<
  SkillType,
  {
    task1: SectionType[]; // Concept reinforcement sections (always included)
    intensive: SectionType[]; // Deep practice sections (only when NOT project-based)
    intensiveAdvanced?: SectionType[]; // Advanced sections (when user enables code writing)
  }
> = {
  [SkillType.CODE]: {
    task1: ['quiz', 'outputPrediction', 'fillBlank'], // quiz=70-85%, AI picks 1 secondary type for 15-30%
    intensive: ['quiz', 'aiCodeReview', 'fillBlank'], // quiz=majority, AI picks up to 2 others (1 each)
    intensiveAdvanced: ['codeCompletion'], // Advanced: write code from scratch (opt-in)
  },
  [SkillType.PHYSICAL]: {
    task1: ['quiz', 'reorder', 'matching'], // quiz=70-85%, AI picks 1 secondary type for 15-30%
    intensive: ['quiz', 'formCheck', 'reorder'], // quiz=majority, AI picks up to 2 others (1 each)
  },
  [SkillType.KNOWLEDGE]: {
    task1: ['quiz', 'matching', 'fillBlank', 'openEnded'], // quiz=70-85%, AI picks 1 secondary type for 15-30%
    intensive: ['quiz', 'fillBlank', 'reorder', 'openEnded'], // quiz=majority, AI picks up to 2 others (1 each)
  },
  [SkillType.DESIGN]: {
    task1: ['quiz', 'designCritique', 'matching'], // quiz=70-85%, AI picks 1 secondary type for 15-30%
    intensive: ['quiz', 'designCritique', 'matching'], // quiz=majority, AI picks up to 2 others (1 each)
  },
  [SkillType.AI_AGENT]: {
    task1: ['quiz', 'fillBlank', 'outputPrediction'], // quiz=70-85%, AI picks 1 secondary type for 15-30%
    intensive: ['quiz', 'aiCodeReview', 'fillBlank'], // quiz=majority, AI picks up to 2 others (1 each)
    intensiveAdvanced: ['codeCompletion'],
  },
};

// Language learning extends KNOWLEDGE with language-specific sections
export const LANGUAGE_SECTION_REGISTRY = {
  task1: ['quiz', 'matching', 'toneSelect'] as SectionType[], // quiz=70-85%, AI picks 1 secondary; toneSelect only for tonal languages
  intensive: ['fillBlank', 'translation', 'reorder', 'typing'] as SectionType[],
};

/**
 * Get appropriate sections for a skill type
 *
 * Logic:
 * - Project-based (ANY skill): task1 (full sections) + bossMilestone + NO intensive
 * - Non-project-based (ANY skill): task1 (full sections) + intensive (no bossMilestone)
 * - Language learning: Uses LANGUAGE_SECTION_REGISTRY (always has intensive, no bossMilestone)
 * - Custom sections: If AI specified customSections for hybrid skills, use those
 */
export function getSectionsForSkillType(
  skillType: SkillType,
  options: {
    isLanguageLearning?: boolean;
    hasTones?: boolean;
    isProjectBased?: boolean;
    codeWritingEnabled?: boolean; // Advanced mode: include codeCompletion exercises
    customSections?: { task1: SectionType[]; intensive: SectionType[] } | null;
  } = {},
): { task1: SectionType[]; intensive: SectionType[]; skipIntensive: boolean } {
  const {
    isLanguageLearning = false,
    hasTones = false,
    isProjectBased = false,
    codeWritingEnabled = false,
    customSections,
  } = options;

  // If AI provided custom sections for hybrid skills, use those
  if (customSections) {
    return {
      task1: customSections.task1,
      intensive: customSections.intensive,
      skipIntensive: isProjectBased,
    };
  }

  // Language learning has its own registry (never project-based)
  if (isLanguageLearning) {
    return {
      task1: hasTones
        ? LANGUAGE_SECTION_REGISTRY.task1
        : LANGUAGE_SECTION_REGISTRY.task1.filter((s) => s !== 'toneSelect'),
      intensive: LANGUAGE_SECTION_REGISTRY.intensive,
      skipIntensive: false,
    };
  }

  const registry =
    SECTION_REGISTRY[skillType] || SECTION_REGISTRY[SkillType.KNOWLEDGE];

  // Combine intensive + intensiveAdvanced when codeWritingEnabled
  let intensiveSections = registry.intensive;
  if (codeWritingEnabled && registry.intensiveAdvanced) {
    intensiveSections = [...registry.intensive, ...registry.intensiveAdvanced];
  }

  return {
    task1: registry.task1,
    intensive: intensiveSections,
    skipIntensive: isProjectBased, // Project-based: bossMilestone handles hands-on, skip intensive
  };
}

// Consolidated time structure with all activities
// New flow: Video → Task1 (Duolingo-style) → BossMilestone → Reflection
function getTimeStructure(hoursPerDay: number): {
  totalMinutes: number;
  mode: string;
  maxVideo: number;
  task1: number; // Quiz/FillBlank time (concept reinforcement)
  practice: number; // Practice project time
  reflect: number;
  structure: string;
} {
  const total = Math.round(hoursPerDay * 60);

  if (total <= 30) {
    return {
      totalMinutes: total,
      mode: 'Quick',
      maxVideo: 5,
      task1: 15,
      practice: 0,
      reflect: 3,
      structure:
        'Video(5m) → Cards(5m) → Quiz(6m) → BossMilestone(9m) → Reflect(3m)',
    };
  } else if (total <= 45) {
    return {
      totalMinutes: total,
      mode: 'Standard',
      maxVideo: 6,
      task1: 12,
      practice: 12,
      reflect: 4,
      structure:
        'Video(6m) → Cards(8m) → Quiz(5m) → BossMilestone(7m) → Practice(12m) → Reflect(4m)',
    };
  } else if (total <= 60) {
    return {
      totalMinutes: total,
      mode: 'Focused',
      maxVideo: 7,
      task1: 15,
      practice: 18,
      reflect: 5,
      structure:
        'Video(7m) → Cards(10m) → Quiz(6m) → BossMilestone(9m) → Practice(18m) → Reflect(5m)',
    };
  }
  // Deep Dive: 90+ min
  return {
    totalMinutes: total,
    mode: 'DeepDive',
    maxVideo: 10,
    task1: 15,
    practice: 25,
    reflect: 8,
    structure:
      'Video(10m) → Cards(15m) → Quiz(6m) → BossMilestone(9m) → Practice(25m) → Reflect(8m)',
  };
}

// Sandbox/environment rules are in CURRICULUM_STATIC_INSTRUCTIONS and DAY_DETAIL_STATIC_INSTRUCTIONS (cached)

// Generate learner context guidance from onboarding preferences
function getLearnerContextGuidance(prefs?: LearnerPrefsForPrompt): string {
  if (!prefs) return '';

  const parts: string[] = [];

  // Selected direction is the specific path they chose
  if (prefs.selectedDirection) {
    parts.push(`LEARNING DIRECTION: "${prefs.selectedDirection}"`);
  }

  // Outcome is the specific deliverable - what they'll be able to DO
  if (prefs.selectedDirectionOutcome) {
    parts.push(`TARGET OUTCOME: "${prefs.selectedDirectionOutcome}"`);
  }

  // Direction keywords help with search and content focus
  if (prefs.directionKeywords?.length) {
    parts.push(`KEY TOPICS: ${prefs.directionKeywords.join(', ')}`);
  }

  // Usage context affects examples and focus
  if (prefs.usageContext) {
    const contextGuidance: Record<string, string> = {
      work: 'FOR WORK: Use professional examples, enterprise patterns, team collaboration scenarios.',
      personal:
        'FOR PERSONAL PROJECT: Use hobbyist-friendly examples, fun projects, creative applications.',
      interview:
        'FOR INTERVIEW PREP: Include common interview questions, algorithmic thinking, optimization.',
      school:
        'FOR LEARNING: Include foundational concepts, academic rigor, theoretical understanding.',
    };
    parts.push(contextGuidance[prefs.usageContext] || '');
  }

  // Content depth affects how much detail to include
  if (prefs.contentDepth) {
    const depthGuidance: Record<string, string> = {
      fast: 'DEPTH: FAST - Minimal theory, quick practical tasks, essential concepts only.',
      medium:
        'DEPTH: BALANCED - Core concepts with practical application, standard complexity.',
      deep: 'DEPTH: COMPREHENSIVE - Include edge cases, advanced patterns, thorough explanations.',
    };
    parts.push(depthGuidance[prefs.contentDepth] || '');
  }

  // Output type affects content style and task format
  if (prefs.outputType) {
    const outputGuidance: Record<OutputType, string> = {
      apply_skill: `OUTPUT GOAL: USE IT PROFICIENTLY
- Practical examples, real-world application
- Focus on "how to use" over deep theory
- Tasks: "Build this", "Apply this", practical scenarios`,
      ship_project: `OUTPUT GOAL: SHIP SOMETHING REAL
- End-to-end focus, real-world patterns
- Include deployment, testing, best practices
- Tasks: Project milestones, production considerations`,
      understand_concept: `OUTPUT GOAL: DEEP UNDERSTANDING
- Explain "why" not just "how"
- Mental models, underlying principles
- Tasks: "Explain why", conceptual questions`,
      pass_exam: `OUTPUT GOAL: PASS AN EXAM
- Memorizable definitions, formal facts
- Edge cases, common exam traps
- Tasks: MCQ, "what's the output", drills`,
      teach_others: `OUTPUT GOAL: TEACH OTHERS
- Analogies, intuitive explanations
- Address common misconceptions
- Tasks: "Explain to a beginner", teaching scenarios`,
      compete: `OUTPUT GOAL: COMPETE WITH OTHERS
- Advanced techniques, optimization
- Competitive strategies, edge over others
- Tasks: Challenging scenarios, performance focus`,
      master_basics: `OUTPUT GOAL: MASTER FUNDAMENTALS
- Core techniques, solid foundation
- Consistency over complexity
- Tasks: Fundamentals drill, build muscle memory`,
    };
    parts.push(outputGuidance[prefs.outputType] || '');
  }

  // Familiarity affects starting point, complexity, and assumed knowledge
  if (prefs.familiarity) {
    const familiarityGuidance: Record<string, string> = {
      new: 'SKILL LEVEL: BEGINNER - Start from absolute basics, explain all terminology, no assumed knowledge. Use simple examples.',
      know_basics:
        'SKILL LEVEL: INTERMEDIATE - User knows fundamentals. Skip basics, focus on practical application and common patterns. Address pain points.',
      skilled:
        'SKILL LEVEL: ADVANCED - User is experienced. Focus on advanced patterns with context connections. Challenge with scaffolding. Build on existing knowledge.',
    };
    parts.push(familiarityGuidance[prefs.familiarity] || '');
  }

  // Session length affects content density and quantity
  if (prefs.sessionLength) {
    const sessionLengthGuidance: Record<string, string> = {
      short: `SESSION LENGTH: SHORT (<30 min/day)
- Generate MINIMAL content: 6-8 task1 questions
- Keep explanations brief (150-200 words per question)
- User needs quick wins, not comprehensive coverage`,
      medium: `SESSION LENGTH: MEDIUM (30-60 min/day)
- Generate STANDARD content: 8-10 task1 questions
- Normal explanations (200-250 words per question)
- Include all core sections`,
      long: `SESSION LENGTH: LONG (>1 hour/day)
- Generate MORE content: 10-12 task1 questions
- Detailed explanations (130-200 words per question)
- Include deeper examples, edge cases, and additional practice
- Add extra challenge questions and scenarios`,
    };
    parts.push(sessionLengthGuidance[prefs.sessionLength] || '');
  }

  // User-specified improvement areas to emphasize
  if (prefs.improvementAreas?.length) {
    parts.push(`IMPROVEMENT AREAS (user wants to get better at):
${prefs.improvementAreas.map((area) => `- ${area}`).join('\n')}
Incorporate these areas into examples, tasks, and explanations where relevant. Don't change core topics, but use these as a lens for examples and practice scenarios.`);
  }

  if (parts.length === 0) return '';

  return `
LEARNER CONTEXT (from onboarding):
${parts.join('\n')}

IMPORTANT: Tailor day titles, examples, and tasks to match the user's specific goal and context above.
If user has a specific project goal, day titles should reference building toward that goal (e.g., "Day 1: Setting Up Your Bot" not "Day 1: Python Basics").
`;
}

function getTierInstructions(userTier: string): string {
  // Only include relevant tier - no need to describe all tiers
  switch (userTier) {
    case 'FREE':
      return `TIER: FREE - Include 1 hint + solution. No AI Tutor.`;
    case 'PRO':
      return `TIER: PRO - Include 3 progressive hints, starter code, step-by-step guides.`;
    case 'PREMIUM':
      return `TIER: PREMIUM - Include adaptive difficulty options (challenge/standard/guided), full hints.`;
    default:
      return '';
  }
}

/**
 * Get skeleton-level guidance for curriculum STRUCTURE based on skill level
 * This affects day topics, progression, content depth, and what concepts to cover
 * Combines structure guidance with content expectations for holistic curriculum design
 */
function getSkeletonLevelGuidance(skillLevel: SkillLevel): string {
  switch (skillLevel) {
    case SkillLevel.INTERMEDIATE:
      return `INTERMEDIATE LEVEL CURRICULUM:

STRUCTURE:
- Brief context bridges instead of full introductions - user knows basics but may have gaps
- Day 1 starts with practical application, with quick refreshers where needed
- Progress faster - combine related topics, cover more ground per day
- Day titles reference practical outcomes (e.g., "Building Scalable APIs" not "Introduction to APIs")
- Include days on common pitfalls, debugging, and troubleshooting

CONTENT APPROACH:
- Define terms in passing, not as the main focus - user knows most terminology
- Focus on patterns, best practices, and real-world scenarios
- Include nuanced situations, edge cases, and common mistakes
- Show 2-3 valid approaches with trade-offs when applicable
- Questions require applying knowledge, not just recall
- Examples should combine 2-3 concepts together`;

    case SkillLevel.ADVANCED:
      return `ADVANCED LEVEL CURRICULUM:

STRUCTURE:
- User knows fundamentals and intermediate patterns - build on that foundation
- Day 1 dives into advanced techniques, with quick references to prerequisites when relevant
- Cover topics rarely found in beginner tutorials
- Day titles reference advanced concepts (e.g., "Memory-Efficient Pipelines" not "Working with Data")
- Include days on architecture decisions, performance tuning, and scaling
- Each day covers more ground - user learns faster

CONTENT APPROACH:
- Quick refreshers where concepts connect, not standalone explanations
- Reference fundamentals when they inform advanced decisions
- Include optimization, trade-offs, and when to choose different approaches
- Present problems with multiple valid solutions and reasoning behind each
- Include analysis and reasoning questions with scaffolding
- Examples show realistic complexity and expert problem-solving approach
- Help user develop judgment, not just follow rules`;

    case SkillLevel.BEGINNER:
    default:
      return `BEGINNER LEVEL CURRICULUM:

STRUCTURE:
- Day 1 covers "What is X and why use it?" - start with fundamentals
- Progress gradually - each day builds on the previous
- Don't skip steps - assume no prior knowledge
- Day titles should be approachable (e.g., "Your First API Call" not "RESTful Architecture")
- Include days for practice and reinforcement

CONTENT APPROACH:
- Clear "what" and "how" explanations for every concept
- Include motivational context (why this matters)
- Simple, focused examples demonstrating one concept at a time
- Questions test understanding with clear right/wrong answers
- Cover essentials first, mention but don't dwell on exceptions`;
  }
}

/**
 * Get skill level guidance for content quantity and complexity
 * BEGINNER: 1x content, foundational concepts, straightforward questions
 * INTERMEDIATE: 1.2x content, intermediate concepts, moderate difficulty
 * ADVANCED: 1.5x content, advanced concepts, challenging questions
 */
function getSkillLevelGuidance(skillLevel: SkillLevel): {
  quizQuestionCount: string;
  complexityGuidance: string;
  contentMultiplier: number;
} {
  switch (skillLevel) {
    case SkillLevel.INTERMEDIATE:
      return {
        quizQuestionCount: '5-8',
        complexityGuidance: `INTERMEDIATE LEVEL COMPLEXITY:
- Concepts: Include nuanced situations and common pitfalls. fewer basic definitions - user already knows terminology
- Motivation: FEWER "why this matters" sections - user is already motivated. Focus on practical application
- Questions: Require applying knowledge to scenarios, not just recall. Include "which approach fits better" questions
- Multiple Solutions: Show 2-3 valid approaches when applicable, with brief pros/cons for each
- Examples: Use realistic scenarios that combine 2-3 concepts together
- Hints: Provide hints only for complex questions (not every question)
- Depth: Cover when and why to use techniques, not just what they are. Address common mistakes`,
        contentMultiplier: 1.2,
      };
    case SkillLevel.ADVANCED:
      return {
        quizQuestionCount: '6-10',
        complexityGuidance: `ADVANCED LEVEL COMPLEXITY:
- Basics: Skip basic definitions but include brief context connections. User knows core concepts but appreciates seeing how they connect to advanced material
- Concepts: Focus on advanced patterns and techniques. Include edge cases as illustrative examples, not the main focus
- Trade-offs: Discuss trade-offs, performance implications, and when to choose different approaches. Help user develop judgment
- Questions: Mix application and analysis. ~55% "which approach fits this production scenario?", ~35% reasoning/trade-off analysis, ~10% recall/confidence-builders. Every analysis question should be grounded in a concrete scenario, not abstract
- Multiple Solutions: Present problems with multiple valid approaches. Explain the thinking behind each, not just the "expert choice"
- Examples: Use realistic scenarios with meaningful complexity. Show how advanced users approach problems step-by-step
- Hints: Provide sophisticated hints that guide thinking without giving answers. Available for all questions, not just hardest ones
- Depth: Cover advanced strategies and nuances. Build on what user knows rather than assuming mastery`,
        contentMultiplier: 1.5,
      };
    case SkillLevel.BEGINNER:
    default:
      return {
        quizQuestionCount: '4-6',
        complexityGuidance: `BEGINNER LEVEL COMPLEXITY:
- Concepts: Focus on core fundamentals with clear "what" and "how" explanations
- Questions: Mix understanding checks with simple application scenarios. ~50% recall ("which is correct?"), ~50% apply ("which approach would you use here?"). Keep scenarios simple with clear right/wrong answers. Avoid trick questions
- Examples: Use simple, focused examples that demonstrate one concept at a time. Include a mini-scenario showing the concept in action
- Depth: Cover the essentials first. Mention but don't dwell on exceptions or advanced cases`,
        contentMultiplier: 1.0,
      };
  }
}

/**
 * Determines if learning should be project-based (boss projects) or practice-based (exercises only)
 *
 * Uses the user's explicit learningStyle choice from onboarding.
 * Defaults to 'practice' if not specified (safer default for new users).
 */
export function usesProjectBasedLearning(
  learningStyle?: 'projects' | 'practice',
): boolean {
  // User's explicit choice - default to practice-based if not specified
  return learningStyle === 'projects';
}

function getSkillTypeGuidance(
  skillType: SkillType,
  complexity: SkillComplexity,
  safetyLevel?: string,
): string {
  switch (skillType) {
    case SkillType.CODE:
      return 'CODE SKILLS: Provide actual working code, runnable examples, real IDE-ready projects. Include starter templates and test cases.';
    case SkillType.PHYSICAL:
      return `PHYSICAL SKILLS (Safety: ${safetyLevel || 'medium'}): Include safety checklists, warm-up requirements, form cues, injury prevention warnings. Video demonstrations CRITICAL. ${safetyLevel === 'high' ? 'REQUIRE supervision disclaimer.' : ''}`;
    case SkillType.KNOWLEDGE:
      return 'KNOWLEDGE SKILLS: Use spaced repetition patterns, mnemonics, practice problems. Connect abstract concepts to real-world applications.';
    case SkillType.DESIGN:
      return 'DESIGN SKILLS: Show before/after examples, design principles with visual references, critique frameworks. Include rubrics for self-assessment.';
    case SkillType.AI_AGENT:
      if (complexity === SkillComplexity.BEGINNER) {
        return 'AI AGENT (Beginner): Focus on prompt engineering, no-code tools only. Web interfaces (ChatGPT, Claude) - NO coding required.';
      } else if (complexity === SkillComplexity.INTERMEDIATE) {
        return 'AI AGENT (Intermediate): Basic Python + API calls from Day 3+. Balance theory with hands-on API integration.';
      }
      return 'AI AGENT (Advanced): This is an overview - recommend 30+ days for true mastery. Cover architecture patterns and production considerations.';
    default:
      return '';
  }
}

/**
 * DAY HEADER: Common header for day detail prompts
 */
// Supported languages for language learning
export type TargetLanguage =
  | 'chinese'
  | 'japanese'
  | 'korean'
  | 'arabic'
  | 'spanish'
  | 'french'
  | 'german'
  | 'italian'
  | 'portuguese'
  | 'russian'
  | 'hindi'
  | 'thai'
  | 'vietnamese'
  | 'other';

// ============================================
// SHARED HELPERS (Reduce code duplication)
// ============================================

// Language feature constants
const TONAL_LANGUAGES: TargetLanguage[] = ['chinese', 'thai', 'vietnamese'];
const GENDERED_LANGUAGES: TargetLanguage[] = [
  'spanish',
  'french',
  'german',
  'italian',
  'portuguese',
  'arabic',
  'russian',
  'hindi',
];

function hasTones(lang: TargetLanguage): boolean {
  return TONAL_LANGUAGES.includes(lang);
}

function hasGender(lang: TargetLanguage): boolean {
  return GENDERED_LANGUAGES.includes(lang);
}

// ============================================
// SHARED LANGUAGE HELPERS (avoid duplication)
// ============================================

interface LanguageFeatures {
  hasTones: boolean;
  hasGender: boolean;
  lang: string;
}

/**
 * Extract language features (tones, gender) from params - used by multiple prompt builders
 */
function extractLangFeatures(params: {
  isLanguageLearning?: boolean;
  targetLanguage?: string;
}): LanguageFeatures {
  if (!params.isLanguageLearning || !params.targetLanguage) {
    return { hasTones: false, hasGender: false, lang: 'target language' };
  }
  return {
    hasTones: hasTones(params.targetLanguage as TargetLanguage),
    hasGender: hasGender(params.targetLanguage as TargetLanguage),
    lang: params.targetLanguage,
  };
}

/**
 * Build language task1 template - shared between project-based and practice-based prompts
 */
function buildLanguageTask1Template(lang: string, langHasTones: boolean): string {
  return `[
        {
          "type": "quiz",
          "level": 1,
          "title": "Listening & Recognition",
          "questions": [
            {"id": "q1", "question": "What does this mean?", "audioText": "word/phrase in ${lang}", "options": ["meaning1", "meaning2", "meaning3", "meaning4"], "correctIndex": 0, "conceptTitle": "Concept Name", "explanation": "Key insight about this word/grammar.\\n\\nUsage details and examples.\\n\\nWhen to use in conversation.", "realWorldContext": "Common situation where you'd use this"},
            {"id": "q2", "question": "Select the correct translation", "options": ["A", "B", "C", "D"], "correctIndex": 0, "conceptTitle": "Concept Name", "explanation": "Key insight.\\n\\nDetails.\\n\\nContext.", "realWorldContext": "Why this matters"}
          ]
        },
        {
          "type": "matching",
          "level": 2,
          "title": "Match the Vocabulary",
          "pairs": [
            {"term": "word in ${lang}", "definition": "English meaning"},
            {"term": "word in ${lang}", "definition": "English meaning"}
          ],
          "conceptTitle": "Concept Name", "explanation": "Key insight.\\n\\nDetails.", "realWorldContext": "When to use this"
        }${langHasTones ? `,
        {
          "type": "toneSelect",
          "title": "Tone Recognition",
          "questions": [
            {"id": "t1", "audioText": "word in ${lang}", "prompt": "Select the correct tone", "options": ["Tone 1", "Tone 2", "Tone 3", "Tone 4"], "correctIndex": 0, "conceptTitle": "Tone Pattern", "explanation": "Key insight about this tone.\\n\\nHow to produce it.\\n\\nCommon words with this tone.", "realWorldContext": "Why tone matters here"}
          ]
        }` : ''}
      ]`;
}

/**
 * Build language caveats/requirements - shared between project-based and practice-based prompts
 */
function buildLanguageCaveats(params: {
  isLanguageLearning?: boolean;
  targetLanguage?: string;
  proficiencyLevel?: string;
  skillName: string;
}, langFeatures: LanguageFeatures): string {
  if (!params.isLanguageLearning) return '';

  return `
LANGUAGE LEARNING MODE - Target: ${params.targetLanguage || 'specified language'} | Level: ${params.proficiencyLevel || 'beginner'}
Focus on: "${params.skillName}" (generate content matching this topic)

REQUIRED FOR ALL LANGUAGE CONTENT:
- "audioText": Native ${langFeatures.lang} text for TTS pronunciation
- "translation": English meaning for all target language content
- "romanization": Pronunciation guide for non-Latin scripts
- Focus on the SPECIFIC topic (grammar = conjugation/tenses/structure, NOT vocabulary lists)${langFeatures.hasTones ? `
- "tone"/"toneMarkers": Tone numbers for all words (TONAL LANGUAGE)` : ''}${langFeatures.hasGender ? `
- "gender": Grammatical gender where applicable (GENDERED LANGUAGE)` : ''}
`;
}

// Extract skills string from skeleton or dayObjectives
function getSkillsString(skeleton: any, dayObjectives?: string[]): string {
  const skills = skeleton?.skills || dayObjectives || [];
  return Array.isArray(skills) ? skills.join(', ') : String(skills);
}

export interface DayDetailParams {
  skillName: string;
  dayNumber: number;
  dayTitle: string;
  dayObjectives: string[];
  skeleton: any;
  previousDayTitle?: string;
  previousDayConcept?: string;
  skillType: SkillType;
  skillLevel: SkillLevel; // BEGINNER, INTERMEDIATE, ADVANCED
  complexity: SkillComplexity;
  userTier: string;
  hoursPerDay: number;
  suggestedLanguage?: string;
  learningStyle?: 'projects' | 'practice'; // Explicit user choice from onboarding
  isProjectBased?: boolean; // Pass directly from metadata - don't re-calculate
  codeWritingEnabled?: boolean; // Advanced mode: include codeCompletion exercises in intensive
  // Reflection data from previous day (for personalized prePrompt)
  previousDayReflection?: {
    confusedConcepts?: string[];
    confidence?: number;
    boostCompleted?: boolean;
    whatsFoggy?: string; // 'when' | 'how' | 'connection' | 'everything'
  };

  // Language learning specific (when skillType is KNOWLEDGE + human language)
  isLanguageLearning?: boolean;
  targetLanguage?: TargetLanguage;
  proficiencyLevel?: string; // HSK1, N5, A1, etc.

  // User-specified improvement areas (updated mid-sprint)
  improvementAreas?: string[];
  // User-specified areas to reduce content for
  lessOfAreas?: string[];

  // AI-decided custom sections for hybrid skills (from curriculum metadata)
  customSections?: {
    task1: SectionType[];
    intensive: SectionType[];
  } | null;
}

// Language-specific features for prompts
function getLanguageFeatures(lang: TargetLanguage): string {
  const features: Record<TargetLanguage, string> = {
    chinese:
      'hasTones: true, hasScript: true (simplified/traditional), hasRomanization: pinyin',
    japanese:
      'hasScript: true (hiragana/katakana/kanji), hasRomanization: romaji',
    korean: 'hasScript: true (hangul), hasRomanization: romanization',
    arabic: 'hasScript: true, isRTL: true, hasGender: true',
    spanish: 'hasGender: true, hasConjugation: true',
    french: 'hasGender: true, hasConjugation: true',
    german: 'hasGender: true, hasCases: true',
    italian: 'hasGender: true, hasConjugation: true',
    portuguese: 'hasGender: true, hasConjugation: true',
    russian: 'hasScript: true (cyrillic), hasGender: true, hasCases: true',
    hindi: 'hasScript: true (devanagari), hasGender: true',
    thai: 'hasTones: true, hasScript: true',
    vietnamese: 'hasTones: true',
    other: '',
  };
  return features[lang] || '';
}

/**
 * DAY DETAIL DEFERRED PROMPT: Secondary content loaded in background
 * Generates:
 * - Project-based skills: bossMilestone + reflection
 * - Practice-based skills: intensivePractice + reflection
 * Called after core loads, while user watches video
 *
 * Can accept either DayDetailParams (legacy) or ContentGenerationContext (unified).
 * When using ContentGenerationContext, all personalization is passed through consistently.
 */
export function buildDayDetailDeferredPrompt(
  params: DayDetailParams,
  ctx?: ContentGenerationContext,
): {
  systemPrompt: string;
  userPrompt: string;
} {
  // NOTE: Language learning now uses the GENERIC prompts with language caveats
  // instead of a completely separate prompt. This ensures "Italian grammar" gets
  // grammar content (using generic structure) rather than vocabulary-focused content.
  // The isLanguageLearning flag adds language-specific enhancements (audio, pronunciation)
  // but doesn't change the fundamental content structure.

  // Check if practice-based (non-project-based)
  const isProjectBased =
    params.isProjectBased ??
    usesProjectBasedLearning(params.learningStyle);

  // For practice-based skills, generate intensive practice sections
  if (!isProjectBased) {
    return buildPracticeBasedDeferredPrompt(params, ctx);
  }

  // For project-based skills, generate bossMilestone + reflection
  return buildProjectBasedDeferredPrompt(params, ctx);
}

/**
 * Project-based DEFERRED prompt - bossMilestone for project-based skills
 * Now also handles language learning with language caveats while keeping generic structure
 */
function buildProjectBasedDeferredPrompt(
  params: DayDetailParams,
  ctx?: ContentGenerationContext,
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const dayNumber = params.dayNumber;
  const skillType = params.skillType;
  const skillsStr = getSkillsString(params.skeleton, params.dayObjectives);
  const levelGuidance = getSkillLevelGuidance(params.skillLevel);

  // Scale code complexity based on skill level
  const starterCodeLines =
    params.skillLevel === SkillLevel.ADVANCED
      ? '15-35'
      : params.skillLevel === SkillLevel.INTERMEDIATE
        ? '12-30'
        : '10-25';
  const solutionCodeLines =
    params.skillLevel === SkillLevel.ADVANCED
      ? '25-60'
      : params.skillLevel === SkillLevel.INTERMEDIATE
        ? '20-50'
        : '15-40';
  const newCodeLines =
    params.skillLevel === SkillLevel.ADVANCED
      ? '10-25'
      : params.skillLevel === SkillLevel.INTERMEDIATE
        ? '8-20'
        : '5-15';

  // Get language features using shared helper (avoid duplication)
  const langFeatures = extractLangFeatures(params);

  // Build unified context instructions if context is provided
  const contextInstructions = ctx ? buildFullContextInstructions(ctx) : '';

  // Language learning caveats using shared helper
  const languageCaveats = buildLanguageCaveats(params, langFeatures);

  const systemPrompt = `Generate DEFERRED content for Day ${dayNumber}: "${params.skillName}"
Type: ${params.skillType} | Level: ${params.skillLevel}${params.suggestedLanguage ? ` | Lang: ${params.suggestedLanguage}` : ''}
Topics: ${skillsStr}
${levelGuidance.complexityGuidance}
${contextInstructions}${languageCaveats}
BOSS MILESTONE - SOLUTION + CHALLENGE (${newCodeLines} new lines):
You provide a complete AI-generated solution. User chooses their path: write it themselves OR make the AI code run.

⚠️ CUMULATIVE CODE REQUIREMENT (MANDATORY FOR DAY 2+) ⚠️
${dayNumber > 1 ? `
THIS IS DAY ${dayNumber} - YOU MUST EXTEND PREVIOUS CODE, NOT CREATE NEW FILES!
- Your solutionCode output must be the COMPLETE file including Day 1-${dayNumber - 1} code PLUS today's additions
- DO NOT create a new/different file or endpoint
- ADD to the existing code, don't replace it
- Mark new code with: // Day ${dayNumber}: Added ...
` : ''}
CORRECT APPROACH:
- Day 1: Create app/api/product/route.ts with basic endpoint
- Day 2: SAME FILE app/api/product/route.ts with Day 1 code + new features added
- Day 3: SAME FILE with Day 1 + Day 2 code + new features added

WRONG APPROACH (DO NOT DO THIS):
- Day 1: app/api/product-info/route.ts
- Day 2: app/api/price/route.ts  ← WRONG! Different file!
- Day 3: app/api/scraper/route.ts ← WRONG! Another different file!

User must feel they're building ONE growing codebase, not 5 separate mini-projects.

REQUIRED FIELDS:
- solutionCode: ${solutionCodeLines} lines COMPLETE WORKING code (GENERATE THIS FIRST)
  - Real, runnable code that ADDS to the existing project
  - For Day 2+: show what files to add/modify, reference existing code
- starterCode: ${starterCodeLines} lines DERIVED FROM solutionCode above
  - SAME structure: same imports, same class/function names, same file organization
  - Replace implementation bodies with TODO comments describing what to implement
  - Keep signatures, parameters, return types from solution
  - For Day 2+: Include previous days' completed code + new TODOs for today's additions
- solutionExplanation: 1-2 sentences on what this code does
- solutionAnnotations: 3-5 strings explaining key parts

- challengeOptions:
  - writeYourself:
    - description: "Write this code from scratch to prove you understand it"
    - hints: 3 progressive hints if user gets stuck
      - For Day 2+: Reference what user already built (e.g., "You have the GET handler from Day 1, now add POST to the same file")
      - Level 1: Conceptual - what approach, how it connects to existing code
      - Level 2: Specific - key functions/methods to add, which file to modify
      - Level 3: Detailed - almost the answer, show exactly where in existing code to add
  - makeItRun:
    - description: Day 1: "Copy this starter code, complete it and make it run" | Day 2+: "Update your existing code with today's additions"
    - setupSteps: Day 1: Create file, add code, run | Day 2+: Open existing file, ADD new code, run
    - possibleIssues: 2-3 things that might go wrong (missing deps, path issues, etc.)
- validationType: "run"
- validationInstructions: "Run the code and verify it produces the expected output"
- setupInstructions:
  - REQUIRED: Tell user which file(s) to create/modify with FULL PATH from project root
  - files: List each file with FULL PATH and description (e.g., "app/api/users/route.js", "src/components/Card.jsx")
  - steps: Clear setup instructions in order:
    1. Project scaffold if needed (e.g., "npx create-next-app my-app")
    2. cd into project folder (e.g., "cd my-app")
    3. Install packages if needed (e.g., "npm install axios")
    4. File instructions - ALWAYS use FULL PATH from project root:
       - Use "Open [path]" for existing files, "Create [path]" for new files
    5. How to test - ALWAYS include:
       - Run command (e.g., "Run: npm run dev")
       - Expected result (e.g., "You should see JSON response: {users: [...]}")
  - IMPORTANT: If route will be tested in browser, ALWAYS export GET handler. Browser visits = GET request.
  - runCommand: Command AND test method (e.g., "npm run dev → GET http://localhost:<PORT>/api/hello" - use <PORT> placeholder, user will use their configured port)
- API ROUTES - Prevent 405 Method Not Allowed errors:
  - If testing via browser URL → MUST have GET handler (browser sends GET)
  - For POST-only APIs: show curl command in test steps, NOT "open in browser"
- DO NOT use placeholder text - generate ACTUAL code
- AVOID REPETITION in solution code: Extract repeated values into constants, use helper functions for repeated logic
${ctx?.continuity?.bossProjectTarget ? `- Boss Project: "${ctx.continuity.bossProjectTarget}" - conceptConnection should reference a task1 concept` : ''}

Only generate: bossMilestone.

Output valid JSON.`;

  const userPrompt = `{
  "day": ${dayNumber},
  "bossMilestone": {
    "day": ${dayNumber},
    "title": "Day ${dayNumber}: Build Your Piece",
    "description": "Today's contribution to the boss project",
    "microTask": "REQUIRED: What this code accomplishes (${newCodeLines} lines of code)",
    "dayContribution": "How this connects to the final project",
    "conceptConnection": "Which task1 concept this applies",
    "estimatedMinutes": 12,

    "solutionCode": "REQUIRED: ${solutionCodeLines} lines complete working ${params.suggestedLanguage || 'code'}. ${dayNumber > 1 ? `MUST include Day ${dayNumber - 1} code (provided above) PLUS todays additions. One complete file with all previous code + new code.` : 'Must be real, runnable code.'} GENERATE THIS FIRST.",
    "starterCode": "REQUIRED: ${starterCodeLines} lines DERIVED FROM solutionCode. Same structure/imports/class names/function names. Replace bodies with TODO comments.",
    "solutionExplanation": "REQUIRED: 1-2 sentences on what this code does",
    "solutionAnnotations": ["Key line 1 explanation", "Key line 2 explanation", "Key line 3 explanation"],

    "challengeOptions": {
      "writeYourself": {
        "description": "Write this code from scratch to prove you understand it",
        "hints": [
          {"level": 1, "hint": "REQUIRED: Conceptual hint - what approach, how it builds on existing code (Day 2+: reference what they built)"},
          {"level": 2, "hint": "REQUIRED: Specific hint - key functions/methods, which file to modify"},
          {"level": 3, "hint": "REQUIRED: Detailed hint - almost the answer, exactly where to add in existing code"}
        ]
      },
      "makeItRun": {
        "description": "Day 1: Copy and run the code | Day 2+: Add today's code to your existing file",
        "setupSteps": ["REQUIRED: Day 1: Create file | Day 2+: Open your existing file from previous days", "REQUIRED: Day 1: Add solution code | Day 2+: ADD today's new code sections to existing code (keep previous code, add new parts)", "REQUIRED: Run and test (e.g., 'npm run dev')"],
        "possibleIssues": ["Missing dependency issue", "Path or import issue", "Syntax or version issue"]
      }
    },

    "expectedOutput": "What user should see when they run the code",
    "validationType": "run",
    "validationInstructions": "Run the code and verify the output",
    "setupInstructions": {
      "files": [{"path": "REQUIRED: FULL PATH e.g. 'app/api/users/route.js' or 'src/components/Card.jsx'", "description": "What this file contains"}],
      "steps": ["REQUIRED: 1) Scaffold (npx create-...), 2) cd into folder, 3) Install packages if needed, 4) Create/open files with FULL PATHS (e.g., 'Create app/api/users/route.js'), 5) Write and complete the code, 6) Test (e.g., 'Run npm run dev, then open http://localhost:<PORT>/...')"],
      "runCommand": "e.g. 'npm run dev' then 'Open http://localhost:<PORT>/...' (use <PORT> placeholder)"
    }
  }
}`;

  return { systemPrompt, userPrompt };
}

/**
 * Get intensive section instructions per skill type
 * Based on SECTION_REGISTRY.intensive + intensiveAdvanced (when codeWritingEnabled)
 */
function getIntensiveSectionInstructions(
  skillType: SkillType,
  codeWritingEnabled = false,
): string {
  const newKnowledgeNote = `
IMPORTANT - Each section MUST include:
"newKnowledge": [{"term": "new concept", "meaning": "brief explanation"}]
Introduce 2-4 NEW related concepts not covered in task1.
Use DIFFERENT scenarios than task1 (new contexts, different domains).`;

  switch (skillType) {
    case SkillType.CODE:
      // quiz = majority, AI picks up to 2 others (1 item each)
      if (codeWritingEnabled) {
        return `SECTION TYPE RULES: Include quiz (majority) + pick up to 2 other types (1 item each).

AVAILABLE TYPES:
1. quiz (REQUIRED, 4-6 questions) - Questions on NEW coding concepts, patterns, and best practices not covered in task1
2. aiCodeReview (1 item) - Review AI-generated code, identify bugs/security issues/assumptions/hallucinations
   Each item: code (AI-generated with line numbers), context, issues array
   Each issue: {type, location (include code snippet like "line 3: if (x === y)"), severity, options (4 MCQ choices), correctIndex, explanation}
   Issue types: bug, security, assumption, scalability, hallucination, edge-case
   TWO-STEP FLOW: User first selects the problematic line, then chooses WHY from options
3. fillBlank (1 item) - Complete code with NEW syntax/methods related to today's topic
4. codeCompletion (1 item) - Complete partial code introducing NEW patterns/methods
${newKnowledgeNote}`;
      }
      return `SECTION TYPE RULES: Include quiz (majority) + pick up to 2 other types (1 item each).

AVAILABLE TYPES:
1. quiz (REQUIRED, 4-6 questions) - Questions on NEW coding concepts, patterns, and best practices not covered in task1
2. aiCodeReview (1 item) - Review AI-generated code, identify bugs/security issues/assumptions/hallucinations
   Each item: code (AI-generated with line numbers), context, issues array
   Each issue: {type, location (include code snippet like "line 3: if (x === y)"), severity, options (4 MCQ choices), correctIndex, explanation}
   Issue types: bug, security, assumption, scalability, hallucination, edge-case
   TWO-STEP FLOW: User first selects the problematic line, then chooses WHY from options
3. fillBlank (1 item) - Complete code with NEW syntax/methods related to today's topic
${newKnowledgeNote}`;

    case SkillType.PHYSICAL:
      return `SECTION TYPE RULES: Include quiz (majority) + pick up to 2 other types (1 item each).

AVAILABLE TYPES:
1. quiz (REQUIRED, 4-6 questions) - Varied practical questions. Include a MIX of different question types appropriate for this specific skill. Examples:
   - Estimation/calculation (materials, measurements, quantities, time)
   - Troubleshooting scenarios (diagnose problems, identify causes)
   - Tool/material selection (choosing the right equipment)
   - Best practices and techniques
   - Safety and risk assessment
   - Code/permit/regulation knowledge (for construction)
   - Quality inspection criteria
   - Cost/budget considerations
   - Environmental factors (weather, conditions)
   - Maintenance and care
   Choose question types that make sense for THIS skill - not all types apply to every project!
2. formCheck (1 item) - Mixed checklist with BOTH technique checkpoints AND safety items (5-7 checklist items total)
   - Include form/technique checkpoints (posture, grip, alignment, stance, etc.)
   - Include safety checkpoints (protective gear, environment check, weight limits, etc.)
   - Mix them together so users verify EVERYTHING before proceeding
3. reorder (1 item) - Order steps for a NEW movement/task sequence
${newKnowledgeNote}`;

    case SkillType.KNOWLEDGE:
      return `SECTION TYPE RULES: Include quiz (majority) + pick up to 2 other types (1 item each).
AI chooses the best secondary types based on topic:

AVAILABLE TYPES:
1. quiz (REQUIRED, 4-6 questions) - Questions requiring synthesis of NEW information not covered in task1
   For FACTUAL topics: questions testing recall and application of new facts
   For SOFT SKILLS/LEADERSHIP: complex scenarios with NEW variables
2. fillBlank (1 item) - Statements introducing RELATED facts/concepts (factual) or NEW frameworks/models (soft skills)
3. reorder (1 item) - Sequences from DIFFERENT contexts than task1
4. openEnded (1 item) - Challenging scenario in a NEW domain
${newKnowledgeNote}`;

    case SkillType.DESIGN:
      return `SECTION TYPE RULES: Include quiz (majority) + pick up to 2 other types (1 item each).

AVAILABLE TYPES:
1. quiz (REQUIRED, 4-6 questions) - Questions on ADVANCED design principles not covered in task1
2. designCritique (1 item) - Evaluate designs using NEW principles/heuristics (3-4 critique points)
3. matching (1 item) - Match NEW design concepts and terminology (4-5 pairs)
${newKnowledgeNote}`;

    case SkillType.AI_AGENT:
      // quiz = majority, AI picks up to 2 others (1 item each)
      if (codeWritingEnabled) {
        return `SECTION TYPE RULES: Include quiz (majority) + pick up to 2 other types (1 item each).

AVAILABLE TYPES:
1. quiz (REQUIRED, 4-6 questions) - Questions on NEW AI/agent concepts, patterns, and best practices not covered in task1
2. aiCodeReview (1 item) - Review AI-generated code, identify bugs/security issues/assumptions/hallucinations
   Each item: code (AI-generated with line numbers), context, issues array
   Each issue: {type, location (include code snippet like "line 3: response = api.call()"), severity, options (4 MCQ choices), correctIndex, explanation}
   Issue types: bug, security, assumption, scalability, hallucination, edge-case
   TWO-STEP FLOW: User first selects the problematic line, then chooses WHY from options
3. fillBlank (1 item) - Statements introducing NEW AI concepts/terminology
4. codeCompletion (1 item) - Complete AI/API code with NEW parameters/methods
${newKnowledgeNote}`;
      }
      return `SECTION TYPE RULES: Include quiz (majority) + pick up to 2 other types (1 item each).

AVAILABLE TYPES:
1. quiz (REQUIRED, 4-6 questions) - Questions on NEW AI/agent concepts, patterns, and best practices not covered in task1
2. aiCodeReview (1 item) - Review AI-generated code, identify bugs/security issues/assumptions/hallucinations
   Each item: code (AI-generated with line numbers), context, issues array
   Each issue: {type, location (include code snippet like "line 3: response = api.call()"), severity, options (4 MCQ choices), correctIndex, explanation}
   Issue types: bug, security, assumption, scalability, hallucination, edge-case
   TWO-STEP FLOW: User first selects the problematic line, then chooses WHY from options
3. fillBlank (1 item) - Statements introducing NEW AI concepts/terminology
${newKnowledgeNote}`;

    default:
      return `SECTION TYPE RULES: Include quiz (majority) + pick up to 2 other types (1 item each).

AVAILABLE TYPES:
1. quiz (REQUIRED, 4-6 questions) - Questions requiring NEW knowledge synthesis not covered in task1
2. fillBlank (1 item) - Statements with NEW related terms
3. matching (1 item) - Match NEW concepts to definitions
${newKnowledgeNote}`;
  }
}

/**
 * Get intensive section JSON template per skill type
 * Based on SECTION_REGISTRY.intensive + intensiveAdvanced (when codeWritingEnabled)
 */
function getIntensiveSectionTemplate(
  skillType: SkillType,
  _dayNumber: number,
  codeWritingEnabled = false,
): string {
  // AI Code Review template (used for CODE and AI_AGENT)
  // Two-step flow: 1) User selects which line has issue, 2) User chooses why it's problematic
  const aiCodeReviewTemplate = `{
        "type": "aiCodeReview",
        "title": "Review AI-Generated Code",
        "instructions": "Review this AI-generated code and identify any issues",
        "items": [
          {
            "id": "acr1",
            "code": "function login(user, pass) {\\n  const stored = db.getUser(user);\\n  if (stored.password === pass) {\\n    return createToken(user);\\n  }\\n}",
            "context": "This code should handle user authentication",
            "promptUsed": "Write a function to authenticate users",
            "issues": [
              {
                "id": "issue1",
                "type": "security",
                "location": "line 3: if (stored.password === pass)",
                "severity": "critical",
                "options": [
                  "Password is compared in plain text without hashing",
                  "The comparison operator should use !== instead",
                  "The variable name 'pass' is too short",
                  "Missing null check for stored user"
                ],
                "correctIndex": 0,
                "explanation": "Passwords should never be stored or compared in plain text. Use bcrypt.compare() or similar to compare hashed passwords securely."
              }
            ],
            "correctVersion": "// Corrected code with bcrypt...",
            "hint": "Think about how passwords should be stored and compared",
            "language": "javascript"
          }
        ],
        "passingScore": 0.7
      }`;

  const codeCompletionTemplate = `{
        "type": "codeCompletion",
        "title": "Complete the Code",
        "items": [
          {
            "id": "cc1",
            "description": "Task description",
            "starterCode": "// Partial code...",
            "solution": "// Complete solution...",
            "hints": ["Hint 1", "Hint 2"],
            "language": "javascript"
          }
        ]
      }`;

  const fillBlankTemplate = `{
        "type": "fillBlank",
        "title": "Complete the Statement",
        "instructions": "Fill in the correct term",
        "items": [
          {
            "id": "fb1",
            "sentence": "Code with ___BLANK___ to complete",
            "translation": "",
            "blank": {"correctAnswers": ["answer"], "hint": "Hint"}
          }
        ]
      }`;

  switch (skillType) {
    case SkillType.CODE:
    case SkillType.AI_AGENT:
      // Default: aiCodeReview + fillBlank
      // Advanced: + codeCompletion
      if (codeWritingEnabled) {
        return `[
      ${aiCodeReviewTemplate},
      ${fillBlankTemplate},
      ${codeCompletionTemplate}
    ]`;
      }
      return `[
      ${aiCodeReviewTemplate},
      ${fillBlankTemplate}
    ]`;

    case SkillType.PHYSICAL:
      return `[
      {
        "type": "formCheck",
        "title": "Pre-Work Checklist",
        "items": [
          {
            "id": "fc1",
            "checkpoint": "Technique checkpoint (e.g., Grip position, Stance alignment)",
            "description": "What to verify before proceeding",
            "commonMistake": "Common error to avoid"
          },
          {
            "id": "fc2",
            "checkpoint": "Safety checkpoint (e.g., Protective gear on, Area clear)",
            "description": "Safety item to verify",
            "commonMistake": "What can go wrong if skipped"
          }
        ]
      },
      {
        "type": "quiz",
        "title": "Practical Knowledge Check",
        "questions": [
          // Mix different question types based on what's relevant to THIS specific skill:
          {"id": "q1", "question": "Estimation/calculation question...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."},
          {"id": "q2", "question": "Troubleshooting scenario...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."},
          {"id": "q3", "question": "Tool/material selection...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."},
          {"id": "q4", "question": "Best practice or technique...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."}
          // Also consider: safety scenarios, code/permits, quality checks, cost/budget, environmental factors, maintenance, etc.
        ]
      },
      {
        "type": "reorder",
        "title": "Order the Steps",
        "instructions": "Put these steps in correct order",
        "items": [
          {
            "id": "ro1",
            "scrambled": ["step2", "step1", "step3"],
            "correctOrder": ["step1", "step2", "step3"],
            "translation": "Complete task sequence",
            "hint": "Think about dependencies"
          }
        ]
      }
    ]`;

    case SkillType.DESIGN:
      return `[
      {
        "type": "designCritique",
        "title": "Design Critique",
        "items": [
          {
            "id": "dc1",
            "description": "Design scenario",
            "question": "What would improve this design?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correctIndex": 0,
            "principle": "Design Principle",
            "explanation": "Why this is the best choice"
          }
        ]
      },
      {
        "type": "quiz",
        "title": "Design Principles",
        "questions": [
          {
            "id": "q1",
            "question": "Question about design?",
            "options": ["A", "B", "C", "D"],
            "correctIndex": 0,
            "explanation": "Explanation"
          }
        ]
      },
      {
        "type": "matching",
        "title": "Match Design Concepts",
        "pairs": [
          {"id": "m1", "term": "Concept", "definition": "Definition"}
        ]
      }
    ]`;

    case SkillType.KNOWLEDGE:
    default:
      // AI chooses: factual → fillBlank+reorder+quiz, soft skills → fillBlank+quiz+openEnded
      return `[
      {
        "type": "fillBlank",
        "title": "Fill in the Blanks",
        "instructions": "Complete with the correct term",
        "items": [
          {
            "id": "fb1",
            "sentence": "Statement with ___BLANK___ to complete",
            "translation": "",
            "blank": {"correctAnswers": ["answer"], "hint": "Hint"}
          }
        ]
      },
      /* FOR FACTUAL TOPICS use reorder: */
      {
        "type": "reorder",
        "title": "Order the Steps",
        "instructions": "Put these in the correct order",
        "items": [
          {
            "id": "ro1",
            "scrambled": ["step2", "step1", "step3"],
            "correctOrder": ["step1", "step2", "step3"],
            "translation": "Complete sequence",
            "hint": "Think about the logical order"
          }
        ]
      },
      {
        "type": "quiz",
        "title": "Concept Check",
        "questions": [
          {
            "id": "q1",
            "question": "Question about today's topic?",
            "options": ["A", "B", "C", "D"],
            "correctIndex": 0,
            "explanation": "Explanation"
          }
        ]
      }
      /* FOR SOFT SKILLS/LEADERSHIP use openEnded instead of reorder: */
      {
        "type": "openEnded",
        "title": "Apply Your Learning",
        "questions": [
          {
            "id": "oe1",
            "question": "Scenario-based question...",
            "prompt": "Describe how you would handle...",
            "sampleAnswer": "A strong response would include...",
            "evaluationCriteria": ["Shows understanding", "Applies to real situation", "Demonstrates critical thinking"]
          }
        ]
      }
    ]`;
  }
}

/**
 * Practice-based DEFERRED prompt - intensive practice for non-project-based skills
 * Uses skill-specific section types from SECTION_REGISTRY.intensive or custom sections
 * Now also handles language learning with language caveats (audio, pronunciation) while
 * keeping the generic content structure (grammar, concepts, etc. based on skill name)
 */
function buildPracticeBasedDeferredPrompt(
  params: DayDetailParams,
  ctx?: ContentGenerationContext,
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const dayNumber = params.dayNumber;
  const skillType = params.skillType;
  const skillsStr = getSkillsString(params.skeleton, params.dayObjectives);
  const levelGuidance = getSkillLevelGuidance(params.skillLevel);

  // Calculate items per section based on skill level (base: 3-4, intermediate: 4-5, advanced: 5-6)
  const itemsPerSection = `${Math.round(3 * levelGuidance.contentMultiplier)}-${Math.round(5 * levelGuidance.contentMultiplier)}`;

  // Calculate mini foundation card count based on skill level
  const miniCardCount =
    params.skillLevel === SkillLevel.ADVANCED
      ? '4-5'
      : params.skillLevel === SkillLevel.INTERMEDIATE
        ? '3-4'
        : '2-3';

  // For custom sections, just list the names (AI knows formats from static instructions)
  // For standard skill types, use the existing functions
  // For language learning, use language-specific sections
  const codeWritingEnabled = params.codeWritingEnabled ?? false;

  // Get language features using shared helper (avoid duplication)
  const langFeatures = extractLangFeatures(params);

  // Calculated item counts for language learning sections
  const fillBlankItems = `${Math.round(5 * levelGuidance.contentMultiplier)}-${Math.round(6 * levelGuidance.contentMultiplier)}`;
  const translationItems = `${Math.round(4 * levelGuidance.contentMultiplier)}-${Math.round(5 * levelGuidance.contentMultiplier)}`;
  const reorderItems = `${Math.round(3 * levelGuidance.contentMultiplier)}-${Math.round(4 * levelGuidance.contentMultiplier)}`;
  const typingItems = `${Math.round(3 * levelGuidance.contentMultiplier)}-${Math.round(4 * levelGuidance.contentMultiplier)}`;

  // Language learning section instructions with specific item counts
  // MUST match frontend interfaces: TranslationItem, LanguageFillBlankItem, ReorderItem, TypingItem
  const languageSectionInstructions = params.isLanguageLearning
    ? `LANGUAGE INTENSIVE SECTIONS (pick EXACTLY 2):
1. fillBlank (${fillBlankItems} items) - Complete sentences with correct words/forms
   Format: {id, sentence: "...___BLANK___...", romanization?: "pronunciation", translation: "English meaning", blank: {correctAnswers: [], hint?}}
2. translation (${translationItems} items) - Translate between languages (both directions)
   Format: {id, direction: "toTarget"|"toEnglish", prompt: "text to translate", romanization?: "for toEnglish", acceptedAnswers: [], hint?}
3. reorder (${reorderItems} items) - Arrange scrambled words into correct sentence
   Format: {id, scrambled: [], correctOrder: [], translation: "English meaning", hint?}
4. typing (${typingItems} items) - Type what you see or hear
   Format: {id, prompt: "instruction", displayText?: "text to show", audioText?: "for TTS", acceptedAnswers: [], romanization?}${langFeatures.hasTones ? `
5. toneSelect (3-4 items) - Hear word/phrase, select correct tone
   Format: {id, audioText, prompt, options[], correctIndex, explanation}` : ''}

IMPORTANT: Use "audioText" for TTS pronunciation in typing items.${langFeatures.hasTones ? ' Include tone markers.' : ''}${langFeatures.hasGender ? ' Include gender where applicable.' : ''}`
    : '';

  const sectionInstructions = params.customSections
    ? `INCLUDE THESE SECTION TYPES: ${params.customSections.intensive.join(', ')}\n(${itemsPerSection} items per section, use formats from section registry)`
    : params.isLanguageLearning
      ? languageSectionInstructions
      : getIntensiveSectionInstructions(skillType, codeWritingEnabled);

  // Language-specific section template with detailed examples
  // MUST match frontend interfaces: TranslationItem, LanguageFillBlankItem, ReorderItem, TypingItem
  const lang = langFeatures.lang;
  const languageSectionTemplate = `[
      {
        "type": "fillBlank",
        "title": "Complete the Sentence",
        "instructions": "Fill in the correct word or form",
        "items": [
          {
            "id": "fb1",
            "sentence": "Sentence in ${lang} with ___BLANK___ to complete",
            "romanization": "pronunciation of full sentence",
            "translation": "English translation of the sentence",
            "blank": {"correctAnswers": ["correct answer", "alternate spelling"], "hint": "Hint about grammar/form"}
          }
        ]
      },
      {
        "type": "translation",
        "title": "Translation Practice",
        "instructions": "Translate between languages",
        "items": [
          {
            "id": "tr1",
            "direction": "toTarget",
            "prompt": "English text to translate to ${lang}",
            "acceptedAnswers": ["primary answer in ${lang}", "alternate acceptable answer"],
            "hint": "Grammar or vocabulary hint"
          },
          {
            "id": "tr2",
            "direction": "toEnglish",
            "prompt": "Text in ${lang} to translate to English",
            "romanization": "pronunciation guide",
            "acceptedAnswers": ["primary English translation", "alternate translation"],
            "hint": "Context hint"
          }
        ]
      },
      {
        "type": "reorder",
        "title": "Word Order Practice",
        "instructions": "Arrange the words in the correct order",
        "items": [
          {
            "id": "ro1",
            "scrambled": ["word3", "word1", "word2"],
            "correctOrder": ["word1", "word2", "word3"],
            "translation": "English meaning of the sentence",
            "hint": "Think about ${lang} sentence structure"
          }
        ]
      },
      {
        "type": "typing",
        "title": "Typing Practice",
        "instructions": "Type what you see or hear",
        "items": [
          {
            "id": "ty1",
            "prompt": "Type the following in ${lang}",
            "displayText": "Text to display for visual typing",
            "audioText": "Text in ${lang} for TTS pronunciation",
            "acceptedAnswers": ["exact answer", "acceptable variation"],
            "romanization": "pronunciation guide"
          }
        ]
      }
    ]`;

  const sectionTemplate = params.customSections
    ? `[/* Generate sections: ${params.customSections.intensive.join(', ')} */]`
    : params.isLanguageLearning
      ? languageSectionTemplate
      : getIntensiveSectionTemplate(skillType, dayNumber, codeWritingEnabled);

  // Build unified context instructions if context is provided
  const contextInstructions = ctx ? buildFullContextInstructions(ctx) : '';

  // Language learning caveats using shared helper + practice-specific mini foundation card format
  const baseCaveats = buildLanguageCaveats(params, langFeatures);
  const miniFoundationCardFormat = params.isLanguageLearning
    ? `
MINI FOUNDATION CARDS FORMAT (for intensive practice):
{
  "id": "mini1",
  "concept": "New word/phrase/pattern in English",
  "explanation": "100-150 words covering: meaning, pronunciation, usage context, example sentences in ${langFeatures.lang} with translations",
  "audioText": "Key word/phrase for TTS",
  "romanization": "pronunciation guide"${langFeatures.hasTones ? ',\n  "tone": "tone number(s)"' : ''}${langFeatures.hasGender ? ',\n  "gender": "grammatical gender"' : ''}
}
`
    : '';
  const languageCaveats = baseCaveats + miniFoundationCardFormat;

  const systemPrompt = `Generate DEFERRED content for Day ${dayNumber}: "${params.skillName}"
Type: ${skillType}${params.customSections ? ' (hybrid)' : ''} | Level: ${params.skillLevel}
Topics: ${skillsStr}
${levelGuidance.complexityGuidance}
${contextInstructions}${languageCaveats}
INTENSIVE PRACTICE:
- miniFoundationCards: ${miniCardCount} cards, NEW concepts not covered in task1
  Format: {id, concept, explanation: "100-150 words"} - NO microQuestion
- sections: EXACTLY 2, higher difficulty than task1
  For soft skills/decision-making → openEnded; for factual/code → quiz, fillBlank, etc.
  Use BOTH today's + mini card concepts. Different scenarios than task1.
${sectionInstructions}
Items per section: ${itemsPerSection}

NOTE: Do NOT generate openTask or reflection - these are handled separately by a lightweight model (Haiku).
Only generate: intensivePractice.

Output valid JSON.`;

  // Language-specific miniFoundationCards template
  const languageMiniCardsTemplate = `[/* ${miniCardCount} NEW words/phrases/patterns */
      {
        "id": "mini1",
        "concept": "New word/phrase in English",
        "explanation": "100-150 words: meaning, pronunciation (${lang}), usage context, 2-3 example sentences with translations",
        "audioText": "Word/phrase in ${lang} for TTS",
        "romanization": "pronunciation guide"${langFeatures.hasTones ? ',\n        "tone": "tone number(s)"' : ''}${langFeatures.hasGender ? ',\n        "gender": "masculine/feminine/neuter"' : ''}
      }
    ]`;

  const genericMiniCardsTemplate = `[/* ${miniCardCount} cards */
      {"id": "mini1", "concept": "New Concept", "explanation": "100-150 words..."}
    ]`;

  const userPrompt = `{
  "day": ${dayNumber},
  "intensivePractice": {
    "id": "day${dayNumber}-intensive",
    "title": "Intensive Practice: ${params.dayTitle}",
    "description": "${params.isLanguageLearning ? 'New ' + lang + ' content and deep practice' : 'New concepts and deep practice'}",
    "estimatedMinutes": 12,
    "miniFoundationCards": ${params.isLanguageLearning ? languageMiniCardsTemplate : genericMiniCardsTemplate},
    "sections": ${sectionTemplate}
  }
}`;

  return { systemPrompt, userPrompt };
}

/**
 * BOSS PROJECT PROMPT: Generates full boss project content
 */
export interface BossDetailParams {
  skillName: string;
  bossTitle: string;
  bossDescription: string;
  bossDay: number;
  combinesDays: number[];
  dayTitles: string[];
  userTier: string;
  suggestedLanguage?: string;
}

export function buildBossDetailPrompt(params: BossDetailParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `Generate comprehensive BOSS PROJECT for "${params.skillName}".

PROJECT: ${params.bossTitle}
DAY: ${params.bossDay}
COMBINES: Days ${params.combinesDays.join(', ')}
TOPICS: ${params.dayTitles.join(' → ')}
TIER: ${params.userTier}
${params.suggestedLanguage ? `LANGUAGE: ${params.suggestedLanguage}` : ''}

${getTierInstructions(params.userTier)}

Boss projects are 60-90 minute capstone challenges integrating ALL previous concepts.
Challenging but achievable.

CRITICAL - CODE GENERATION REQUIREMENTS:
1. FIRST generate "solution": COMPLETE working code that implements ALL requirements (50-100 lines)
2. THEN derive "starterCode" FROM the solution:
   - SAME file structure, class names, function names as solution
   - SAME imports and setup code
   - Replace function bodies with TODO comments describing what to implement
   - Keep type signatures, parameters, return types intact

EXAMPLE - If solution is:
\`\`\`
class PriceTracker:
    def __init__(self):
        self.db = sqlite3.connect('prices.db')

    def fetch_price(self, url):
        response = requests.get(url, headers=self.headers)
        soup = BeautifulSoup(response.content, 'html.parser')
        return soup.select_one('.price').text
\`\`\`

Then starterCode MUST be:
\`\`\`
class PriceTracker:
    def __init__(self):
        # TODO: Initialize database connection
        pass

    def fetch_price(self, url):
        # TODO: Fetch URL with proper headers
        # TODO: Parse HTML and extract price
        pass
\`\`\`

DO NOT generate starterCode with different structure (e.g., functions when solution uses classes)

CODE QUALITY - Avoid repetition in solution:
- Extract repeated values into CONSTANTS at the top (e.g., HEADERS, SELECTORS, CONFIG)
- Use helper functions for repeated logic
- Keep solution clean and DRY (Don't Repeat Yourself)

Output valid JSON only.`;

  // Minimal template - AI generates content
  const userPrompt = `Boss Project Day ${params.bossDay}: "${params.bossTitle}"
Combines Days: ${params.combinesDays.join(', ')}
Topics: ${params.dayTitles.join(' → ')}

Generate JSON with:
- overview: {whatYouBuild, whyItMatters, skillsIntegrated[{skill, howUsed}]}
- requirements: [{requirement, fromDay, concept}] - one per day combined
- phases: 3 phases (Setup 15min, Core Build 35min, Polish 25min) with objectives[], deliverable
- solution: COMPLETE working ${params.suggestedLanguage || 'code'} (50-100 lines) - GENERATE THIS FIRST
- starterCode: DERIVED FROM solution above - same structure/classes/functions, bodies replaced with TODOs (30-50 lines)
- setupInstructions: {files: [{path: "FULL PATH e.g. app/api/route.js", description: "what it contains"}], steps: ["1) Scaffold, 2) cd into folder, 3) Install packages, 4) File steps with FULL PATHS, 5) Test: run command + URL + expected result"], runCommand: "npm run dev → http://localhost:<PORT>/..." (use <PORT> placeholder for user's port)}
- hints: 4 progressive hints with phase numbers
- solutionWalkthrough: [{step, description, code}]
- evaluation: {criteria[{criterion, points, checks[]}], passingScore:70}
- commonMistakes: [{mistake, fix}]
- extensionIdeas: []`;

  return { systemPrompt, userPrompt };
}

// ============================================
// CACHEABLE PROMPT BUILDERS (Token Optimization)
// ============================================

/**
 * Static instructions that can be cached across all curriculum generations
 * These don't change based on user input - cache for 5 min
 */
const CURRICULUM_STATIC_INSTRUCTIONS = `You generate curriculum skeletons.
Skill type and sections are pre-determined - focus on curriculum structure and content.

Each day: day, title, subtitle, skills[], teaser, estimatedMinutes.
Each day MUST cover different topics — no overlap between days. Day N+1 builds on Day N.

TOPIC FILTER: Only include what blocks progress toward the goal. MEANS (tools/setup) → minimum to use. ENDS (goal itself) → full depth. No history, theory, or comparisons for things they just use.

SKILL-SPECIFIC ENVIRONMENT GUIDANCE:
- CODE/AI_AGENT: Prefer browser-safe libraries. Provide fixture data for external APIs.
- PHYSICAL: Include safety warnings, warm-up requirements, equipment lists.
- KNOWLEDGE: Use spaced repetition, mnemonics, real-world applications.
- DESIGN: Provide before/after examples, critique frameworks, assessment rubrics.

AVOID (all skills): Content requiring expensive equipment, dangerous activities without safety context, or access to gated/login-required platforms.

Output valid JSON only.`;

/**
 * Static instructions for day detail generation - cacheable
 * Uses UNIFIED SECTIONS FORMAT for ALL skill types
 * Note: Skill type is pre-determined by skill detector, passed via params
 */
const DAY_DETAIL_STATIC_INSTRUCTIONS = `You generate day learning content using PROGRESSIVE LEARNING LEVELS.

TASK1 — THE CORE LEARNING ACTIVITY (Duolingo-style: question first, teach through feedback):
- Users learn by answering questions, then reading rich explanations after answering
- Each question's "explanation" field IS the primary teaching content (replaces passive reading)
- Think of it as: test → reveal concept explanation → "aha!" moment
- Each question teaches ONE concept — focused and clear, not exhaustive
- Format: "What is X?" → "It solves B, not A" — answers one question well

QUESTION FLOW:
- Question 1: INTRO/RECAP — connect to previous day's concepts. If Day 1, introduce the topic foundation
- Questions 2+: Core concepts covering today's topics

EXPLANATION STRUCTURE (130-200 words per question):
- Paragraph 1: Key insight / main point (bold/prominent in UI)
- Paragraph 2+: Supporting details, examples, nuances, code snippets if applicable
- Separate paragraphs with \\n\\n (double newline)
- Group by theme/logic, NOT by sentence. Each paragraph should be a complete thought
- If applicable: include code examples inline using backticks

REQUIRED FIELDS per question:
- "conceptTitle": Short concept name (e.g., "REST API Basics", "Present Tense Conjugation")
- "explanation": 130-200 words of teaching content (structured as above)
- "realWorldContext": 1 sentence — when/where this concept matters in practice

SECTION RATIO: 70-85% quiz questions, 15-30% ONE secondary section type
- Quiz section is ALWAYS the main section with most questions
- Pick 1 secondary section type from the available types listed in "Sections:" (e.g., matching, outputPrediction, fillBlank, etc.)
- Choose the secondary type that best fits today's topic content

QUESTION LEVELS:
- Level 1 "Differentiation" (1-2 Qs): compare/contrast, "X or Y?" — confirm basics
- Level 2 "Application" (remaining Qs): scenario-based, "which approach?", "why would B fail?"
- Prefer application-style questions — pure recall should be the minority

CASE STUDY QUESTIONS (2-3 per day — for trade-off/decision concepts):
For questions about choices, trade-offs, or "when to use X vs Y":
The case study IS the question — the scenario provides context, user picks an approach, consequences reveal after.
- Add a "caseStudy" object to the question with:
  - scenario: Real-world situation shown ABOVE the question (2-3 sentences)
  - question: Replaces the regular question text — "What would you do?" or "Which approach fits?"
  - options: 3-4 choices matching the MCQ options array, each with:
    - label: 1-5 words naming the approach (MUST match the MCQ "options" array values)
    - consequence: What happens if chosen — revealed AFTER answering ("This works, but..." or "This fails because...")
  - bestChoice: Index of optimal choice (0-based, MUST match "correctIndex")
  - explanation: Why it's best (1-2 sentences, shown inline after answering)
- The MCQ "options" array and caseStudy "options[].label" MUST be identical
- The "correctIndex" and caseStudy "bestChoice" MUST be identical

INTENSIVE PRACTICE (deferred content) - NEW CONCEPTS ALLOWED:
- Introduces NEW related concepts (must add to newKnowledge array)
- More varied scenarios and domains
- Cross-domain transfer exercises
- Higher difficulty, more distractors
- Types: codeCompletion, debugging, fillBlank, openEnded, etc.

Output valid JSON only.`;

/**
 * Cacheable curriculum prompt - splits static/dynamic for Anthropic prompt caching
 * Use with AiService.callAnthropicWithCache()
 */
export function buildCacheableCurriculumPrompt(
  params: CurriculumPromptParams,
): {
  staticPart: string;
  dynamicPart: string;
  userPrompt: string;
} {
  const time = getTimeStructure(params.hoursPerDay);
  const isProjectBased = usesProjectBasedLearning(params.learnerPrefs?.learningStyle);
  const learnerContext = getLearnerContextGuidance(params.learnerPrefs);
  const allDays = Array.from({ length: params.durationDays }, (_, i) => i + 1);

  // Static part - cacheable across all users
  const staticPart = CURRICULUM_STATIC_INSTRUCTIONS;

  // Project vs Practice based instructions
  const structureInstructions = isProjectBased
    ? `PROJECT-BASED STRUCTURE:
- ONE boss project spans the ENTIRE ${params.durationDays}-day session
- EVERY day includes bossMilestonePreview (what code they'll build that day)
- Final day (Day ${params.durationDays}) is "Boss Day" - complete project assembly
- Daily flow: Video → Quiz/Tasks → Boss Micro-Step → Reflection`
    : `PRACTICE-BASED STRUCTURE:
- Each day is self-contained with standalone practice exercises
- No multi-day projects - focus on mastering daily concepts
- Daily flow: Video → Quiz/Tasks → Practice Project → Reflection`;

  // Dynamic part - user-specific context with skill guidance
  const skillGuidance = getSkillTypeGuidance(
    params.skillType,
    params.complexity,
    params.safetyLevel,
  );
  const skeletonLevelGuidance = getSkeletonLevelGuidance(params.skillLevel);
  const dynamicPart = `Generate ${params.durationDays}-day curriculum skeleton for "${params.skillName}".
Type: ${params.skillType} | Level: ${params.skillLevel} | ${time.totalMinutes}min/day (${time.mode})
${params.suggestedLanguage ? `Language: ${params.suggestedLanguage}` : ''}

${structureInstructions}
${learnerContext}
${skillGuidance}

${skeletonLevelGuidance}

Per day: day, title, subtitle, skills[], teaser, estimatedMinutes:${time.totalMinutes}${isProjectBased ? ', hasBossProject:true, bossMilestonePreview' : ''}.`;

  // User prompt with day template
  const bossProjectsSection = isProjectBased
    ? `"bossProjects": [{
    "day": ${params.durationDays},
    "title": "Boss Project: [Name]",
    "description": "Complete project built across all ${params.durationDays} days",
    "combinesDays": [${allDays.join(', ')}],
    "estimatedMinutes": 75,
    "teaser": "Final assembly and polish"
  }]`
    : `"bossProjects": []`;

  const userPrompt = `Generate ALL ${params.durationDays} days with this structure:
{
  "title": "Curriculum title",
  "description": "What student will master",
  "finalProject": "${isProjectBased ? 'Capstone project built across all days' : 'Mastery of all daily concepts'}",
  "skillType": "${params.skillType}",
  "days": [
    {
      "day": 1,
      "title": "Day 1: [Topic]",
      "subtitle": "Tagline",
      "skills": ["Skill 1", "Skill 2"],
      "teaser": "What they'll learn",
      "estimatedMinutes": ${time.totalMinutes}${
        isProjectBased
          ? `,
      "hasBossProject": true,
      "bossMilestonePreview": "What code they'll add today"`
          : ''
      }
    }
  ],
  ${bossProjectsSection},
  "metadata": {
    "recommendedTools": [],
    "prerequisites": ${JSON.stringify(params.prerequisiteSkills || [])},
    "safetyLevel": "${params.safetyLevel || 'low'}",
    "isProjectBased": ${isProjectBased},
    "customSections": ${params.customSections ? JSON.stringify(params.customSections) : 'null'}
  }
}

${isProjectBased ? "hasBossProject=true for ALL days. Include bossMilestonePreview showing what code they'll build each day." : 'Each day should have self-contained learning objectives.'}`;

  return { staticPart, dynamicPart, userPrompt };
}

/**
 * Cacheable day detail core prompt
 * Uses UNIFIED SECTIONS FORMAT for ALL skill types (including language learning)
 */
export function buildCacheableDayDetailCorePrompt(params: DayDetailParams): {
  staticPart: string;
  dynamicPart: string;
  userPrompt: string;
} {
  // Use stored isProjectBased from metadata, fall back to calculation if not provided
  const isProjectBased =
    params.isProjectBased ??
    usesProjectBasedLearning(params.learningStyle);

  // Static part - cacheable
  const staticPart = DAY_DETAIL_STATIC_INSTRUCTIONS;

  // Get sections - use language registry if language learning
  const langHasTones = params.isLanguageLearning && params.targetLanguage
    ? hasTones(params.targetLanguage)
    : false;
  const sections = getSectionsForSkillType(params.skillType, {
    isLanguageLearning: params.isLanguageLearning,
    hasTones: langHasTones,
    isProjectBased,
    codeWritingEnabled: params.codeWritingEnabled,
    customSections: params.customSections,
  });
  const sectionTypes = sections.task1.join(' + ');

  // Language learning specific instructions
  const langHasGender = params.isLanguageLearning && params.targetLanguage
    ? hasGender(params.targetLanguage)
    : false;
  const langFeatures = params.isLanguageLearning && params.targetLanguage
    ? getLanguageFeatures(params.targetLanguage)
    : '';

  const languageInstructions = params.isLanguageLearning
    ? `\nLANGUAGE LEARNING: Target language is ${params.targetLanguage || 'specified'}. Level: ${params.proficiencyLevel || 'beginner'}.
Features: ${langFeatures}
- contentLayer: "language_core"
- Video strategy: skip (use audio/TTS instead)
- Include target language text with pronunciation/romanization in explanations
- Include "audioText" field in quiz questions for listening practice (TTS will speak it)
- Include commonMistakes in explanations where relevant
- Task1 explanations should teach vocabulary/grammar concepts (word meanings, conjugation rules, usage patterns)
${langHasTones ? '- TONAL LANGUAGE: Include tone numbers/markers. Add toneSelect section in task1.' : ''}${langHasGender ? '\n- GENDERED LANGUAGE: Include grammatical gender (masculine/feminine/neuter) where applicable.' : ''}`
    : '';

  // Build personalization instructions using shared builder
  // Create a temporary context for the shared instruction builder
  const tempContext: ContentGenerationContext = {
    skillName: params.skillName,
    skillType: params.skillType,
    skillLevel: params.skillLevel,
    complexity: params.complexity,
    suggestedLanguage: params.suggestedLanguage,
    isProjectBased,
    userTier: params.userTier,
    hoursPerDay: params.hoursPerDay,
    dayNumber: params.dayNumber,
    dayTitle: params.dayTitle,
    dayObjectives: params.dayObjectives,
    skeleton: params.skeleton,
    isLanguageLearning: params.isLanguageLearning,
    targetLanguage: params.targetLanguage,
    proficiencyLevel: params.proficiencyLevel,
    customSections: params.customSections,
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
    continuity: {
      previousDayTitle: params.previousDayTitle,
      previousDayConcept: params.previousDayConcept,
    },
  };

  const personalizationInstructions =
    buildPersonalizationInstructions(tempContext);
  const continuityInstructions = buildContinuityInstructions(tempContext);

  // Dynamic part - skill name is checked against language detection in static instructions
  const skillGuidance = getSkillTypeGuidance(
    params.skillType,
    params.complexity,
  );
  const levelGuidance = getSkillLevelGuidance(params.skillLevel);
  const skillsStr = getSkillsString(params.skeleton, params.dayObjectives);
  const dynamicPart = `SKILL: "${params.skillName}"
Day ${params.dayNumber}: ${params.dayTitle}
${skillsStr ? `Topics: ${skillsStr}` : ''}
${params.previousDayTitle ? `Previous day: ${params.previousDayTitle}` : 'This is Day 1 — introduce the topic foundation'}
Type: ${params.skillType} | Level: ${params.skillLevel} | Sections: ${sectionTypes}
${skillGuidance}${languageInstructions}

${levelGuidance.complexityGuidance}

TASK1: Generate ${levelGuidance.quizQuestionCount} questions total. 70-85% in quiz section, 15-30% in secondary section.
${personalizationInstructions}${continuityInstructions}`;

  // User prompt - CORE content: prePrompt + video + task1 (the main learning activity)
  const videoSection = params.isLanguageLearning
    ? `"video": null,
  "videoStrategy": "skip",
  "contentLayer": "language_core"`
    : `"video": {
    "watchPoints": ["Key point 1", "Key point 2"],
    "searchQuery": "YouTube search query for this topic"
  }`;

  const videoRequirement = params.isLanguageLearning
    ? '- video: null (language learning uses audio/TTS instead)\n- contentLayer: "language_core"'
    : '- video: REQUIRED (even if just searchQuery)';

  // Get task1 template based on skill type
  const task1Template = params.isLanguageLearning
    ? buildLanguageTask1Template(
        params.targetLanguage || 'target language',
        langHasTones,
      )
    : getTask1SectionTemplate(params.skillType);

  const userPrompt = `Day ${params.dayNumber}: "${params.dayTitle}" for skill "${params.skillName}"
Skill Type: ${params.skillType} | Level: ${params.skillLevel}
${skillsStr ? `Key topics: ${skillsStr}` : ''}

Generate CORE content as JSON with this structure:
{
  ${videoSection},
  "task1": {
    "id": "day${params.dayNumber}-task1",
    "title": "${params.isLanguageLearning ? 'Practice' : 'Practice'}",
    "estimatedMinutes": 10,
    "format": "sections",
    "passingScore": 0.7,
    "sections": ${task1Template}
  }
}

REQUIREMENTS:
${videoRequirement}
- task1: REQUIRED - ${levelGuidance.quizQuestionCount} questions total (70-85% quiz, 15-30% secondary section)
  - EVERY question must have "conceptTitle" and "explanation" (130-200 words, teaching content)
  - EVERY question must have "realWorldContext" (1 sentence)
  - explanation: Split into 2-3 paragraphs with \\n\\n (key insight → details/examples)
  - 2-3 questions should include "caseStudy" for trade-off/decision concepts
  - Question 1 should be an INTRO/RECAP connecting to previous content
  - matching section: generate 3-4 pairs with "pairs" array (NOT "questions" or "items")

Output valid JSON only.`;

  return { staticPart, dynamicPart, userPrompt };
}

/**
 * Generate Task1 section template based on skill type
 * Task1 is now the CORE learning activity (replaces foundation cards)
 * Each question teaches a concept through its rich explanation
 */
function getTask1SectionTemplate(skillType: SkillType): string {
  // Quiz section template (70-85% of questions) — always included as main section
  const quizTemplate = `{"id": "q1", "question": "Compare/contrast question", "options": ["A", "B", "C", "D"], "correctIndex": 0, "conceptTitle": "Concept Name", "explanation": "Key insight paragraph.\\n\\nSupporting details and examples.", "realWorldContext": "Why this matters in practice"}, {"id": "q2", "question": "fallback question text", "options": ["Approach A", "Approach B", "Approach C", "Approach D"], "correctIndex": 1, "conceptTitle": "Decision Concept", "explanation": "Why this approach is best.\\n\\nDetails and trade-offs.", "realWorldContext": "When you face this decision", "caseStudy": {"scenario": "Real-world situation (2-3 sentences)", "question": "What would you do?", "options": [{"label": "Approach A", "consequence": "This fails because..."}, {"label": "Approach B", "consequence": "This works well because..."}, {"label": "Approach C", "consequence": "This works but..."}, {"label": "Approach D", "consequence": "This is overkill because..."}], "bestChoice": 1, "explanation": "Why Approach B is optimal here (1-2 sentences)"}}`;

  // Secondary section templates (15-30%) — AI picks ONE based on topic fit
  // All types shown so AI knows each schema. Pick the one listed in "Sections:".
  const secondaryTemplates: Record<string, string> = {
    matching: `{"type": "matching", "title": "Match the Concepts", "pairs": [{"term": "Concept A", "definition": "What A means"}, {"term": "Concept B", "definition": "What B means"}, {"term": "Concept C", "definition": "What C means"}]}`,
    outputPrediction: `{"type": "outputPrediction", "title": "Predict the Output", "questions": [{"id": "op1", "question": "What does this code output?", "code": "code here", "options": ["A", "B", "C", "D"], "correctIndex": 0, "conceptTitle": "Concept Name", "explanation": "Key insight.\\n\\nDetails.", "realWorldContext": "Why this matters"}]}`,
    fillBlank: `{"type": "fillBlank", "title": "Complete the Statement", "items": [{"id": "fb1", "sentence": "Statement with ___BLANK___", "translation": "", "blank": {"correctAnswers": ["answer"], "hint": "Hint"}, "conceptTitle": "Concept Name", "explanation": "Key insight.\\n\\nDetails.", "realWorldContext": "Why this matters"}]}`,
    reorder: `{"type": "reorder", "title": "Order the Steps", "items": [{"id": "ro1", "scrambled": ["step2", "step1", "step3"], "correctOrder": ["step1", "step2", "step3"], "translation": "Complete sequence", "hint": "Think about dependencies", "conceptTitle": "Concept Name", "explanation": "Key insight.\\n\\nDetails.", "realWorldContext": "Why this matters"}]}`,
    designCritique: `{"type": "designCritique", "title": "Apply Design Thinking", "items": [{"id": "dc1", "description": "Design scenario", "question": "What would improve this?", "options": ["A", "B", "C", "D"], "correctIndex": 0, "principle": "Design Principle", "conceptTitle": "Concept Name", "explanation": "Key insight.\\n\\nDetails.", "realWorldContext": "Why this matters"}]}`,
    openEnded: `{"type": "openEnded", "title": "Think It Through", "questions": [{"id": "oe1", "question": "Scenario question", "responseType": "openEnded", "openEndedConfig": {"category": "analysis", "scenario": "Context", "constraints": ["Constraint 1"], "evaluationDimensions": [{"name": "Relevance", "weight": 1}]}, "conceptTitle": "Concept Name", "explanation": "Key insight.\\n\\nDetails.", "realWorldContext": "Why this matters"}]}`,
  };

  // Get the available secondary types for this skill (exclude 'quiz')
  const registry = SECTION_REGISTRY[skillType] || SECTION_REGISTRY[SkillType.KNOWLEDGE];
  const secondaryTypes = registry.task1.filter(t => t !== 'quiz');

  // Show the first secondary type's template as the example
  const defaultSecondary = secondaryTypes[0] || 'matching';
  const secondaryExample = secondaryTemplates[defaultSecondary] || secondaryTemplates.matching;

  return `[
        {"type": "quiz", "title": "Core Concepts", "questions": [${quizTemplate}]},
        ${secondaryExample}
      ]`;
}

// ============================================
// LIGHTWEIGHT CONTENT PROMPT (Haiku - reflection + openTask)
// ============================================

/**
 * DEFERRED phase lightweight prompt — reflection + openTask (Haiku).
 * Runs in parallel with the Sonnet deferred call.
 */
export function buildDeferredLightweightPrompt(
  params: DayDetailParams,
  ctx?: ContentGenerationContext,
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const dayNumber = params.dayNumber;
  const skillsStr = getSkillsString(params.skeleton, params.dayObjectives);
  const isProjectBased = params.isProjectBased ?? usesProjectBasedLearning(params.learningStyle);

  const conceptsContext = ctx?.generatedContent?.task1Concepts?.length
    ? `Today's concepts: ${ctx.generatedContent.task1Concepts.join(', ')}`
    : '';

  // Language learning detection
  const isLanguageLearning = params.isLanguageLearning ?? false;
  const lang = params.targetLanguage || 'target language';
  const langHasTones = ['Chinese', 'Mandarin', 'Cantonese', 'Vietnamese', 'Thai'].some(
    (l) => lang.toLowerCase().includes(l.toLowerCase()),
  );

  // Build open task instructions for practice-based curricula
  const openTaskInstructions = !isProjectBased
    ? `
OPEN TASK:
- A specific, actionable task to do outside the app
- Must directly apply one of today's task1 concepts${ctx?.generatedContent?.task1Concepts?.length ? `: ${ctx.generatedContent.task1Concepts.join(', ')}` : ''}
- No correct answer - user self-reports completion
- Choose task type based on skill:
  * Soft skills (leadership, communication, negotiation): Real interaction tasks
    e.g., "Have a 1-on-1 with a team member", "Practice active listening in your next meeting"
  * Academic skills (math, science, history, concepts, languages): Low-pressure teaching practice (Feynman technique)
    e.g., "Pretend you're explaining [concept] to a curious friend - write or say your explanation out loud"
    e.g., "Write a simple explanation of [concept] that a 10-year-old could understand"
    This reinforces learning without social pressure - if you can explain it simply, you understand it
- Include:
  - title: Short, action-oriented - NO prefix
  - description: 2-3 sentences explaining what to do and why
  - icon: Emoji (💬 chat, 🎯 goal, 🤝 collab, ✍️ write, 🔍 observe, 🎤 speak, 👂 listen, 🧑‍🏫 teach, 🎙️ record)
  - context: Where/when (e.g., "Alone or with someone", "Out loud to yourself", "Write it down", "Record a voice note")
  - difficulty: "easy" (5-10 min) | "medium" (15-20 min) | "challenging" (30+ min)
  - conceptConnection: Which task1 concept this applies
  - tips: 2-3 practical tips for success
  - reflectionPrompts: 2-3 questions for after completion
`
    : '';

  const systemPrompt = `Generate reflection${!isProjectBased ? ' and open task' : ''} for Day ${dayNumber}: "${params.skillName}"
Skill Type: ${params.skillType} | Level: ${params.skillLevel}
Topics: ${skillsStr}
${conceptsContext}
${openTaskInstructions}
REFLECTION:
- Questions should help user self-assess and identify areas for improvement
- Include confidence scale, what clicked, and what needs review
- Keep it encouraging and forward-looking

Output valid JSON only.`;

  // Language-specific reflection questions
  const languageReflectionQuestions = `[
      {"id": "confidence", "question": "Rate your confidence with today's ${lang} content (1-5)", "type": "scale"},
      {"id": "hardest", "question": "Hardest exercise type?", "type": "choice", "options": ["Fill in blank", "Translation", "Reordering", "Typing"${langHasTones ? ', "Tone recognition"' : ''}]},
      {"id": "clicked", "question": "What clicked for you today?", "type": "text"},
      {"id": "review", "question": "What needs more review?", "type": "text"}
    ]`;

  const genericReflectionQuestions = `[
      {"id": "confidence", "question": "Rate your confidence (1-5)?", "type": "scale"},
      {"id": "application", "question": "How will you apply this?", "type": "text"},
      {"id": "questions", "question": "What questions remain?", "type": "text"}
    ]`;

  // Language-specific open task (practice speaking/writing)
  const languageOpenTaskTemplate = `{
    "id": "day${dayNumber}-opentask",
    "sectionType": "openTask",
    "sectionTitle": "Real-World Practice",
    "sectionSubtitle": "Use ${lang} outside the app",
    "title": "Practice ${lang} in a real conversation or writing",
    "description": "Find an opportunity to use what you learned today. This could be speaking with a language partner, writing a message, or practicing pronunciation out loud.",
    "icon": "🗣️",
    "context": "With a language partner / Speaking aloud / Writing practice",
    "difficulty": "easy",
    "conceptConnection": "Today's ${params.dayTitle} content",
    "estimatedMinutes": 10,
    "tips": [
      "Don't worry about being perfect - focus on using the new patterns",
      "Record yourself to hear your pronunciation",
      "Write down any words you couldn't remember to review later"
    ],
    "completionType": "self-reported",
    "reflectionPrompts": [
      "What did you try to say or write?",
      "What was challenging about using ${lang} in practice?",
      "What would you like to practice more?"
    ]
  }`;

  const genericOpenTaskTemplate = `{
    "id": "day${dayNumber}-opentask",
    "sectionType": "openTask",
    "sectionTitle": "Real-World Challenge",
    "sectionSubtitle": "Take your learning beyond the screen",
    "title": "[Action verb + specific activity]",
    "description": "2-3 sentences: what to do, with whom, and the goal",
    "icon": "🎯",
    "context": "At work / With a friend / During your next meeting",
    "difficulty": "easy|medium|challenging",
    "conceptConnection": "[Reference specific task1 concept]",
    "estimatedMinutes": 15,
    "tips": [
      "Practical tip for success #1",
      "Practical tip for success #2"
    ],
    "completionType": "self-reported",
    "reflectionPrompts": [
      "What did you notice during this interaction?",
      "How did applying [concept] change the outcome?",
      "What would you do differently next time?"
    ]
  }`;

  // Different templates based on whether it's project-based or practice-based
  const openTaskSection = !isProjectBased
    ? `,
  "openTask": ${isLanguageLearning ? languageOpenTaskTemplate : genericOpenTaskTemplate}`
    : '';

  const userPrompt = `{
  "reflection": {
    "questions": ${isLanguageLearning ? languageReflectionQuestions : genericReflectionQuestions}
  }${openTaskSection}
}`;

  return { systemPrompt, userPrompt };
}
