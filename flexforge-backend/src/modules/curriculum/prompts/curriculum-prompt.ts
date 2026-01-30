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
    task1: ['quiz', 'outputPrediction', 'fillBlank'],
    intensive: ['aiCodeReview', 'fillBlank'], // Default: review AI-generated code for issues
    intensiveAdvanced: ['codeCompletion'], // Advanced: write code from scratch (opt-in)
  },
  [SkillType.PHYSICAL]: {
    task1: ['quiz', 'reorder', 'matching'],
    intensive: ['formCheck', 'safetyCheck', 'reorder'],
  },
  [SkillType.KNOWLEDGE]: {
    // AI chooses: quiz + matching + fillBlank (factual) OR quiz + fillBlank + openEnded (soft skills/leadership)
    task1: ['quiz', 'matching', 'fillBlank', 'openEnded'],
    intensive: ['fillBlank', 'reorder', 'quiz', 'openEnded'], // openEnded for soft skills scenarios
  },
  [SkillType.DESIGN]: {
    task1: ['quiz', 'designCritique', 'matching'],
    intensive: ['designCritique', 'quiz', 'matching'],
  },
  [SkillType.AI_AGENT]: {
    task1: ['quiz', 'fillBlank', 'outputPrediction'],
    intensive: ['aiCodeReview', 'fillBlank', 'quiz'], // Default: review AI-generated code
    intensiveAdvanced: ['codeCompletion'], // Advanced: write code from scratch (opt-in)
  },
};

// Language learning extends KNOWLEDGE with language-specific sections
export const LANGUAGE_SECTION_REGISTRY = {
  task1: ['quiz', 'matching', 'toneSelect'] as SectionType[], // toneSelect only for tonal languages
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
// New flow: Video → FoundationCards → Quiz/FillBlank → BossMilestone → Reflection
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
        'SKILL LEVEL: ADVANCED - User is experienced. Focus on advanced techniques, edge cases, optimization. Challenge them.',
    };
    parts.push(familiarityGuidance[prefs.familiarity] || '');
  }

  // Session length affects content density and quantity
  if (prefs.sessionLength) {
    const sessionLengthGuidance: Record<string, string> = {
      short: `SESSION LENGTH: SHORT (<30 min/day)
- Generate MINIMAL content: 4-5 foundation cards max
- Keep explanations brief (150-200 words per card)
- Only 6-8 quiz questions total
- User needs quick wins, not comprehensive coverage`,
      medium: `SESSION LENGTH: MEDIUM (30-60 min/day)
- Generate STANDARD content: 6-7 foundation cards
- Normal explanations (200-300 words per card)
- 8-10 quiz questions total
- Include all core sections`,
      long: `SESSION LENGTH: LONG (>1 hour/day)
- Generate MORE content: 8-10 foundation cards
- Detailed explanations (300-400 words per card)
- 12-15 quiz questions total
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
 * Get skill level guidance for content quantity and complexity
 * BEGINNER: 1x content, foundational concepts, straightforward questions
 * INTERMEDIATE: 1.2x content, intermediate concepts, moderate difficulty
 * ADVANCED: 1.5x content, advanced concepts, challenging questions
 */
function getSkillLevelGuidance(skillLevel: SkillLevel): {
  foundationCardCount: string;
  quizQuestionCount: string;
  complexityGuidance: string;
  contentMultiplier: number;
} {
  switch (skillLevel) {
    case SkillLevel.INTERMEDIATE:
      return {
        foundationCardCount: '6-7',
        quizQuestionCount: '10-12',
        complexityGuidance: `INTERMEDIATE LEVEL COMPLEXITY:
- Concepts: Include nuanced situations, common pitfalls, and "why this works" explanations
- Questions: Require applying knowledge to scenarios, not just recall. Include "which approach fits better" and "what would happen if" questions
- Examples: Use realistic scenarios that combine 2-3 concepts together
- Depth: Cover when and why to use techniques, not just what they are. Address common mistakes`,
        contentMultiplier: 1.2,
      };
    case SkillLevel.ADVANCED:
      return {
        foundationCardCount: '7-9',
        quizQuestionCount: '12-15',
        complexityGuidance: `ADVANCED LEVEL COMPLEXITY:
- Concepts: Focus on sophisticated techniques, subtle distinctions, and expert-level insights
- Questions: Require analysis, evaluating trade-offs, handling ambiguous situations, and explaining reasoning
- Examples: Use complex real-world scenarios with multiple valid approaches and nuanced considerations
- Depth: Cover advanced strategies, when to break conventional rules, and how experts think about the topic`,
        contentMultiplier: 1.5,
      };
    case SkillLevel.BEGINNER:
    default:
      return {
        foundationCardCount: '5-6',
        quizQuestionCount: '8-10',
        complexityGuidance: `BEGINNER LEVEL COMPLEXITY:
- Concepts: Focus on core fundamentals with clear "what" and "how" explanations
- Questions: Test understanding of basics with clear right/wrong answers. Avoid trick questions
- Examples: Use simple, focused examples that demonstrate one concept at a time
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

// Cacheable version of language learning prompt
function buildCacheableLanguageLearningPrompt(params: DayDetailParams): {
  staticPart: string;
  dynamicPart: string;
  userPrompt: string;
} {
  const lang = params.targetLanguage || 'other';
  const langFeatures = getLanguageFeatures(lang);
  const profLevel = params.proficiencyLevel || 'beginner';
  const langHasTones = hasTones(lang);
  const langHasGender = hasGender(lang);
  const levelGuidance = getSkillLevelGuidance(params.skillLevel);

  const staticPart = `Generate VOCABULARY-BASED learning content for language learning.
This is LANGUAGE LEARNING - generate vocabulary cards, NOT code.

VOCABULARY CARD FORMAT (use "languageFoundationCards" array):
{
  "id": "day1-vocab-1",
  "concept": "Word/phrase in English",
  "visual": "relevant emoji",
  "explanation": "Usage context and tips",
  "vocabulary": {
    "term": "word in target language",
    "definition": "English meaning",
    "romanization": "pronunciation guide (pinyin/romaji/etc)",${
      langHasTones
        ? `
    "tone": "number or [numbers] for tonal languages",`
        : ''
    }${
      langHasGender
        ? `
    "gender": "masculine | feminine | neuter",`
        : ''
    }
    "partOfSpeech": "noun/verb/adj/phrase",
    "proficiencyLevel": "HSK1/N5/A1/etc",
    "examples": [{"sentence": "example in target language", "romanization": "if applicable", "translation": "English"}]
  },
  "microQuestion": {"question": "Quick check", "type": "gotit"},
  "order": 1
}

LISTENING QUESTIONS (for quiz in task1):
Include audioText for questions that should be spoken:
{"question": "What does this mean?", "audioText": "text to speak", "options": [...], "correctIndex": 0, "explanation": "..."}

TASK1 - QUICK PRACTICE (3-4 types, 8-10 questions total):
1. "quiz" - MCQ: hear/see word, pick meaning (include audioText for listening, at least 2 questions)
2. "matching" - Match words to definitions (4-6 pairs)
3. "toneSelect" - For tonal languages: hear word, select correct tone${langHasTones ? ' (REQUIRED)' : ' (skip if not tonal)'}

PRACTICE PROJECT - INTENSIVE PRACTICE (deferred, 3-4 types):
1. "fillBlank" - Complete sentence with correct word
2. "translation" - Translate between languages (both directions)
3. "reorder" - Arrange scrambled words into correct sentence
4. "typing" - Type the word/phrase you see or hear

STRUCTURE (all fields required):
- prePrompt: {text, primeQuestions[], yesterdayRecap}
- video: null (no video for language learning - use TTS and practice instead)
- videoStrategy: "skip"
- contentLayer: "language_core"
- languageFoundationCards: ${levelGuidance.foundationCardCount} vocabulary cards (REQUIRED)
- task1: Quick practice with 3-4 question types mixed, ${levelGuidance.quizQuestionCount} questions total
- reflection: {questions[]}

${levelGuidance.complexityGuidance}

CONTENT RULES:
- task1: ONLY use vocabulary from today's languageFoundationCards. No new words.

Output valid JSON only.`;

  // Dynamic part - day-specific
  const dynamicPart = `Day ${params.dayNumber} of "${params.skillName}"
Title: ${params.dayTitle}
Target Language: ${lang}
Proficiency: ${profLevel}
Features: ${langFeatures}
${params.previousDayTitle ? `Previous: ${params.previousDayTitle}` : ''}
${langHasTones ? 'Include tone numbers in vocabulary.' : ''}
${langHasGender ? 'Include gender (masculine/feminine/neuter) in vocabulary.' : ''}`;

  const skillsStr = getSkillsString(params.skeleton, params.dayObjectives);
  const dayNumber = params.dayNumber;

  // Use explicit JSON template to guide AI
  const userPrompt = `Generate vocabulary learning content for Day ${dayNumber}: "${params.dayTitle}"
Topics: ${skillsStr}
Language: ${lang}
Level: ${profLevel}

Output this JSON structure:
{
  "prePrompt": {
    "text": "Welcome message about today's vocabulary",
    "primeQuestions": ["Question 1?", "Question 2?"],
    "yesterdayRecap": "${params.previousDayTitle ? 'Yesterday we learned: ' + params.previousDayTitle : 'Welcome to your first lesson!'}"
  },
  "videoStrategy": "skip",
    "contentLayer": "language_core",
  "languageFoundationCards": [
    {
      "id": "day${dayNumber}-vocab-1",
      "concept": "Word/phrase in English",
      "visual": "relevant emoji",
      "explanation": "When and how to use this word/phrase",
      "vocabulary": {
        "term": "word in ${lang}",
        "definition": "English meaning",
        "romanization": "pronunciation guide (pinyin/romaji/etc)",${
          langHasTones
            ? `
        "tone": 1,`
            : ''
        }${
          langHasGender
            ? `
        "gender": "masculine",`
            : ''
        }
        "partOfSpeech": "noun/verb/adj",
        "proficiencyLevel": "${profLevel}",
        "examples": [{"sentence": "Example in ${lang}", "romanization": "pronunciation", "translation": "English"}]
      },
      "microQuestion": {"question": "Got it?", "type": "gotit"},
      "order": 1
    }
  ],
  "task1": {
    "id": "day${dayNumber}-task1",
    "title": "Quick Practice",
    "description": "Test your understanding with mixed exercises",
    "estimatedMinutes": 5,
    "format": "mixed",
    "passingScore": 0.7,
    "sections": [
      {
        "type": "quiz",
        "title": "Listening & Recognition",
        "questions": [
          {"id": "q1", "question": "What does this mean?", "audioText": "word in ${lang}", "options": ["meaning1", "meaning2", "meaning3", "meaning4"], "correctIndex": 0, "explanation": "Explanation"},
          {"id": "q2", "question": "Select the correct meaning", "options": ["A", "B", "C", "D"], "correctIndex": 1, "explanation": "Explanation"}
        ]
      },
      {
        "type": "matching",
        "title": "Match Words to Meanings",
        "pairs": [
          {"term": "word1 in ${lang}", "definition": "English meaning 1"},
          {"term": "word2 in ${lang}", "definition": "English meaning 2"},
          {"term": "word3 in ${lang}", "definition": "English meaning 3"},
          {"term": "word4 in ${lang}", "definition": "English meaning 4"}
        ]
      }${
        langHasTones
          ? `,
      {
        "type": "toneSelect",
        "title": "Tone Recognition",
        "questions": [
          {"id": "t1", "audioText": "word", "prompt": "Select the correct tone", "options": ["mā (1st)", "má (2nd)", "mǎ (3rd)", "mà (4th)"], "correctIndex": 0, "explanation": "This is first tone (flat)"}
        ]
      }`
          : ''
      }
    ]
  },
  "reflection": {
    "questions": [
      {"id": "confidence", "question": "Rate your confidence with today's vocabulary (1-5)", "type": "scale"},
      {"id": "clicked", "question": "Which word stuck with you the most?", "type": "text"},
      {"id": "foggy", "question": "Which word is still unclear?", "type": "text"}
    ]
  }
}

REQUIREMENTS:
- Generate ${levelGuidance.foundationCardCount} vocabulary cards in languageFoundationCards
- task1.sections must include: quiz (${Math.round(4 * levelGuidance.contentMultiplier)}-${Math.round(5 * levelGuidance.contentMultiplier)} questions, 2+ with audioText), matching (${Math.round(5 * levelGuidance.contentMultiplier)}-${Math.round(7 * levelGuidance.contentMultiplier)} pairs)${langHasTones ? `, toneSelect (${Math.round(3 * levelGuidance.contentMultiplier)} questions)` : ''}
- All vocabulary must be appropriate for ${profLevel} level`;

  return { staticPart, dynamicPart, userPrompt };
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
  // Use language learning deferred prompt if applicable
  // Only check isLanguageLearning - targetLanguage defaults to 'other' inside the function
  if (params.isLanguageLearning) {
    return buildLanguageLearningDeferredPrompt(params, ctx);
  }

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

  // Get skill-type-specific task1 template (2 section types per skill)
  const task1Template = getTask1SectionTemplate(skillType);

  // Build unified context instructions if context is provided
  const contextInstructions = ctx ? buildFullContextInstructions(ctx) : '';

  const systemPrompt = `Generate DEFERRED content for Day ${dayNumber}: "${params.skillName}"
Type: ${params.skillType} | Level: ${params.skillLevel}${params.suggestedLanguage ? ` | Lang: ${params.suggestedLanguage}` : ''}
Topics: ${skillsStr}
${levelGuidance.complexityGuidance}
${contextInstructions}
TASK1: 4-6 questions testing today's foundationCards ONLY (no new knowledge)
- Level 1 "Differentiation" (2-3 Qs): "X or Y?", compare/contrast, edge cases
- Level 2 "Application" (2-3 Qs): "which approach fits?", "why would B fail?"
${ctx?.generatedContent?.foundationCardConcepts?.length ? `- Reference these concepts: ${ctx.generatedContent.foundationCardConcepts.join(', ')}` : ''}

BOSS MILESTONE (${newCodeLines} new lines):
- starterCode: ${starterCodeLines} lines REAL RUNNABLE code with TODOs marking where user adds code
- solution: ${solutionCodeLines} lines COMPLETE WORKING code - NO placeholders like "// COMPLETE working solution"
- solutionAnnotations: 2-4 strings explaining key lines
- hints: 3 progressive (conceptual → specific → detailed)
- setupInstructions:
  - REQUIRED: Tell user which file(s) to create and where to paste code
  - files: List each file path with description (e.g., "pages/index.js", "pages/api/hello.js")
  - steps: Clear setup instructions (e.g., "Create pages/api/hello.js and paste the API code")
  - runCommand: How to run the code (e.g., "node index.js", "npm start", "npm run dev")
- DO NOT use placeholder text - generate ACTUAL code
- Validation: user runs code, sees expectedOutput
${ctx?.continuity?.bossProjectTarget ? `- Boss Project: "${ctx.continuity.bossProjectTarget}" - conceptConnection should reference a foundationCard concept` : ''}

Output valid JSON.`;

  const userPrompt = `{
  "day": ${dayNumber},
  "task1": {
    "id": "day${dayNumber}-task1",
    "title": "Practice",
    "estimatedMinutes": 8,
    "format": "sections",
    "passingScore": 0.7,
    "sections": ${task1Template}
  },
  "bossMilestone": {
    "day": ${dayNumber},
    "title": "Day ${dayNumber} Contribution",
    "description": "Build a piece of your boss project",
    "microTask": "REQUIRED: Specific task description (${newCodeLines} lines of code)",
    "dayContribution": "How this helps the final project",
    "conceptConnection": "Which foundationCard concept this applies",
    "estimatedMinutes": 10,
    "starterCode": "REQUIRED: ${starterCodeLines} lines ACTUAL starter code with TODOs marking where user adds code.${dayNumber === 1 ? ' Start fresh.' : ' Build on previous days.'}",
    "expectedOutput": "What user should see when they run the code",
    "hints": [
      {"level": 1, "hint": "REQUIRED: Gentle conceptual hint"},
      {"level": 2, "hint": "REQUIRED: More specific approach"},
      {"level": 3, "hint": "REQUIRED: Detailed guidance"}
    ],
    "solution": "REQUIRED: ${solutionCodeLines} lines COMPLETE working ${params.suggestedLanguage || 'code'}. Must be real, runnable code.",
    "solutionAnnotations": ["REQUIRED: 2-4 explanations of key lines in the solution"],
    "validationType": "run",
    "validationInstructions": "Run the code and verify the output",
    "setupInstructions": {
      "files": [{"path": "REQUIRED: e.g. 'index.js' or 'pages/index.js'", "description": "What this file contains"}],
      "steps": ["REQUIRED: Step-by-step setup (e.g., 'Paste code into index.js')"],
      "runCommand": "e.g. 'node index.js' or 'npm start'"
    }
  },
  "reflection": {
    "questions": [
      {"id": "confidence", "question": "Rate your confidence (1-5)?", "type": "scale"},
      {"id": "clicked", "question": "What clicked today?", "type": "text"},
      {"id": "foggy", "question": "What's still unclear?", "type": "text"}
    ]
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
Introduce 2-4 NEW related concepts not covered in foundation cards.
Use DIFFERENT scenarios than task1 (new contexts, different domains).`;

  switch (skillType) {
    case SkillType.CODE:
      // Default: AI code review (review AI-generated code for issues)
      // Advanced: + code completion (write code from scratch)
      if (codeWritingEnabled) {
        return `SECTION TYPES TO INCLUDE:
1. aiCodeReview - Review AI-generated code, identify bugs/security issues/assumptions/hallucinations (3-4 items)
   Each item: code (AI-generated), context (what it should do), issues (array of {type, location, severity, explanation})
   Issue types: bug, security, assumption, scalability, hallucination, edge-case
2. fillBlank - Complete code with NEW syntax/methods related to today's topic (3-4 items)
3. codeCompletion - Complete partial code introducing NEW patterns/methods (3-4 items)
${newKnowledgeNote}`;
      }
      return `SECTION TYPES TO INCLUDE:
1. aiCodeReview - Review AI-generated code, identify bugs/security issues/assumptions/hallucinations (3-4 items)
   Each item: code (AI-generated), context (what it should do), issues (array of {type, location, severity, explanation})
   Issue types: bug, security, assumption, scalability, hallucination, edge-case
2. fillBlank - Complete code with NEW syntax/methods related to today's topic (3-4 items)
${newKnowledgeNote}`;

    case SkillType.PHYSICAL:
      return `SECTION TYPES TO INCLUDE:
1. formCheck - Verify form including ADVANCED variations and NEW techniques (4-5 items)
2. safetyCheck - Safety questions including NEW scenarios and equipment (3-4 items)
3. reorder - Order steps for NEW movement combinations (3-4 items)
${newKnowledgeNote}`;

    case SkillType.KNOWLEDGE:
      return `SECTION TYPES TO INCLUDE (AI chooses based on topic):
For FACTUAL topics:
1. fillBlank - Statements introducing RELATED facts/concepts (4-5 items)
2. reorder - Sequences from DIFFERENT contexts (3-4 items)
3. quiz - Questions requiring synthesis of NEW information (4-5 questions)

For SOFT SKILLS/LEADERSHIP:
1. fillBlank - Statements with NEW frameworks/models (3-4 items)
2. quiz - Complex scenarios with NEW variables (3-4 questions)
3. openEnded - Challenging scenarios in NEW domains (2-3 items)
${newKnowledgeNote}`;

    case SkillType.DESIGN:
      return `SECTION TYPES TO INCLUDE:
1. designCritique - Evaluate designs using NEW principles/heuristics (3-4 items)
2. quiz - Questions on ADVANCED principles not covered in task1 (3-4 questions)
3. matching - Match NEW design concepts and terminology (4-5 pairs)
${newKnowledgeNote}`;

    case SkillType.AI_AGENT:
      // Default: AI code review (review AI-generated code for issues)
      // Advanced: + code completion (write code from scratch)
      if (codeWritingEnabled) {
        return `SECTION TYPES TO INCLUDE:
1. aiCodeReview - Review AI-generated code, identify bugs/security issues/assumptions/hallucinations (3-4 items)
   Each item: code (AI-generated), context (what it should do), issues (array of {type, location, severity, explanation})
   Issue types: bug, security, assumption, scalability, hallucination, edge-case
2. fillBlank - Statements introducing NEW AI concepts/terminology (3-4 items)
3. codeCompletion - Complete AI/API code with NEW parameters/methods (3-4 items)
${newKnowledgeNote}`;
      }
      return `SECTION TYPES TO INCLUDE:
1. aiCodeReview - Review AI-generated code, identify bugs/security issues/assumptions/hallucinations (3-4 items)
   Each item: code (AI-generated), context (what it should do), issues (array of {type, location, severity, explanation})
   Issue types: bug, security, assumption, scalability, hallucination, edge-case
2. fillBlank - Statements introducing NEW AI concepts/terminology (3-4 items)
${newKnowledgeNote}`;

    default:
      return `SECTION TYPES TO INCLUDE:
1. fillBlank - Statements with NEW related terms (4-5 items)
2. quiz - Questions requiring NEW knowledge synthesis (4-5 questions)
3. matching - Match NEW concepts to definitions (4-5 pairs)
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
  const aiCodeReviewTemplate = `{
        "type": "aiCodeReview",
        "title": "Review AI-Generated Code",
        "instructions": "Review this AI-generated code and identify any issues",
        "items": [
          {
            "id": "acr1",
            "code": "// AI-generated code to review...",
            "context": "This code should handle user authentication",
            "promptUsed": "Write a function to authenticate users",
            "issues": [
              {
                "id": "issue1",
                "type": "security",
                "location": "line 5",
                "severity": "critical",
                "explanation": "Password is not hashed before storage"
              }
            ],
            "correctVersion": "// Corrected code...",
            "hint": "Look at how sensitive data is handled",
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
        "title": "Form Checkpoints",
        "items": [
          {
            "id": "fc1",
            "checkpoint": "Checkpoint name",
            "description": "What to check for",
            "commonMistake": "Common error to avoid"
          }
        ]
      },
      {
        "type": "safetyCheck",
        "title": "Safety Check",
        "items": [
          {
            "id": "sc1",
            "question": "Is this safe practice?",
            "correctAnswer": true,
            "explanation": "Why this is true/false"
          }
        ]
      },
      {
        "type": "reorder",
        "title": "Order the Steps",
        "instructions": "Put these movement steps in correct order",
        "items": [
          {
            "id": "ro1",
            "scrambled": ["step2", "step1", "step3"],
            "correctOrder": ["step1", "step2", "step3"],
            "translation": "Complete movement sequence",
            "hint": "Think about the flow"
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
  const codeWritingEnabled = params.codeWritingEnabled ?? false;
  const sectionInstructions = params.customSections
    ? `INCLUDE THESE SECTION TYPES: ${params.customSections.intensive.join(', ')}\n(${itemsPerSection} items per section, use formats from section registry)`
    : getIntensiveSectionInstructions(skillType, codeWritingEnabled);

  const sectionTemplate = params.customSections
    ? `[/* Generate sections: ${params.customSections.intensive.join(', ')} */]`
    : getIntensiveSectionTemplate(skillType, dayNumber, codeWritingEnabled);

  // Get skill-type-specific task1 template (2 section types per skill)
  const task1Template = getTask1SectionTemplate(skillType);

  // Build unified context instructions if context is provided
  const contextInstructions = ctx ? buildFullContextInstructions(ctx) : '';

  const systemPrompt = `Generate DEFERRED content for Day ${dayNumber}: "${params.skillName}"
Type: ${skillType}${params.customSections ? ' (hybrid)' : ''} | Level: ${params.skillLevel}
Topics: ${skillsStr}
${levelGuidance.complexityGuidance}
${contextInstructions}
TASK1: 4-6 questions testing today's foundationCards ONLY (no new knowledge)
- Level 1 "Differentiation" (2-3 Qs): "X or Y?", compare/contrast, edge cases
- Level 2 "Application" (2-3 Qs): "which approach fits?", "why would B fail?"
${ctx?.generatedContent?.foundationCardConcepts?.length ? `- Reference these concepts: ${ctx.generatedContent.foundationCardConcepts.join(', ')}` : ''}

INTENSIVE PRACTICE:
- miniFoundationCards: ${miniCardCount} cards, NEW concepts not in foundation cards
  Format: {id, concept, explanation: "100-150 words"} - NO microQuestion
- sections: EXACTLY 2, higher difficulty than task1
  For soft skills/decision-making → openEnded; for factual/code → quiz, fillBlank, etc.
  Use BOTH today's + mini card concepts. Different scenarios than task1.
${sectionInstructions}
Items per section: ${itemsPerSection}

OPEN TASK:
- A specific, actionable task to do outside the app
- Must directly apply one of today's foundationCard concepts${ctx?.generatedContent?.foundationCardConcepts?.length ? `: ${ctx.generatedContent.foundationCardConcepts.join(', ')}` : ''}
- No correct answer - user self-reports completion
- Choose task type based on skill:
  * Soft skills (leadership, communication, negotiation): Real interaction tasks
    e.g., "Have a 1-on-1 with a team member", "Practice active listening in your next meeting"
  * Academic skills (math, science, history, concepts): Teaching tasks (Feynman technique)
    e.g., "Explain [concept] to a friend or family member in simple terms"
    This reinforces learning - if you can teach it, you understand it
- Include:
  - title: Short, action-oriented - NO prefix
  - description: 2-3 sentences explaining what to do and why
  - icon: Emoji (💬 chat, 🎯 goal, 🤝 collab, 📝 write, 🔍 observe, 🎤 speak, 👂 listen, 🧑‍🏫 teach)
  - context: Where/when (e.g., "With a friend or family member", "At work", "During dinner")
  - difficulty: "easy" (5-10 min) | "medium" (15-20 min) | "challenging" (30+ min)
  - conceptConnection: Which foundationCard concept this applies
  - tips: 2-3 practical tips for success
  - reflectionPrompts: 2-3 questions for after completion

Output valid JSON.`;

  const userPrompt = `{
  "day": ${dayNumber},
  "task1": {
    "id": "day${dayNumber}-task1",
    "title": "Practice",
    "estimatedMinutes": 8,
    "format": "sections",
    "passingScore": 0.7,
    "sections": ${task1Template}
  },
  "intensivePractice": {
    "id": "day${dayNumber}-intensive",
    "title": "Intensive Practice: ${params.dayTitle}",
    "description": "New concepts and deep practice",
    "estimatedMinutes": 12,
    "miniFoundationCards": [/* ${miniCardCount} cards */
      {"id": "mini1", "concept": "New Concept", "explanation": "100-150 words..."}
    ],
    "sections": ${sectionTemplate}
  },
  "openTask": {
    "id": "day${dayNumber}-opentask",
    "sectionType": "openTask",
    "sectionTitle": "Real-World Challenge",
    "sectionSubtitle": "Take your learning beyond the screen",
    "title": "[Action verb + specific activity]",
    "description": "2-3 sentences: what to do, with whom, and the goal",
    "icon": "🎯",
    "context": "At work / With a friend / During your next meeting",
    "difficulty": "easy|medium|challenging",
    "conceptConnection": "[Reference specific foundationCard concept]",
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
  },
  "reflection": {
    "questions": [
      {"id": "confidence", "question": "Rate your confidence (1-5)?", "type": "scale"},
      {"id": "application", "question": "How will you apply this?", "type": "text"},
      {"id": "questions", "question": "What questions remain?", "type": "text"}
    ]
  }
}`;

  return { systemPrompt, userPrompt };
}

/**
 * Language Learning DEFERRED prompt - intensive practice exercises
 */
function buildLanguageLearningDeferredPrompt(
  params: DayDetailParams,
  ctx?: ContentGenerationContext,
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const lang = params.targetLanguage || 'other';
  const profLevel = params.proficiencyLevel || 'beginner';
  const dayNumber = params.dayNumber;
  const skillsStr = getSkillsString(params.skeleton, params.dayObjectives);
  const levelGuidance = getSkillLevelGuidance(params.skillLevel);

  // Calculate items per section based on skill level
  const fillBlankItems = `${Math.round(5 * levelGuidance.contentMultiplier)}-${Math.round(6 * levelGuidance.contentMultiplier)}`;
  const translationItems = `${Math.round(4 * levelGuidance.contentMultiplier)}-${Math.round(5 * levelGuidance.contentMultiplier)}`;
  const reorderItems = `${Math.round(3 * levelGuidance.contentMultiplier)}-${Math.round(4 * levelGuidance.contentMultiplier)}`;
  const typingItems = `${Math.round(3 * levelGuidance.contentMultiplier)}-${Math.round(4 * levelGuidance.contentMultiplier)}`;

  // Calculate mini foundation card count based on skill level
  const miniCardCount =
    params.skillLevel === SkillLevel.ADVANCED
      ? '4-5'
      : params.skillLevel === SkillLevel.INTERMEDIATE
        ? '3-4'
        : '2-3';

  // Build unified context instructions if context is provided
  const contextInstructions = ctx ? buildFullContextInstructions(ctx) : '';

  const systemPrompt = `Generate DEFERRED content for Day ${dayNumber}: "${params.skillName}"
Language: ${lang} | Proficiency: ${profLevel} | Level: ${params.skillLevel}
Topics: ${skillsStr}
${levelGuidance.complexityGuidance}
${contextInstructions}
TASK1: Quiz/fillBlank testing today's vocabulary ONLY (no new words)
${ctx?.generatedContent?.foundationCardConcepts?.length ? `- Reference these vocabulary words: ${ctx.generatedContent.foundationCardConcepts.join(', ')}` : ''}

INTENSIVE PRACTICE:
- miniFoundationCards: ${miniCardCount} cards, NEW vocabulary not in foundation cards
  Format: {id, concept: "Word/Phrase", explanation: "100-150 words with term, meaning, pronunciation, usage"}
  NO microQuestion - tested in exercises
- sections: EXACTLY 2 from: fillBlank (${fillBlankItems}), translation (${translationItems}), reorder (${reorderItems}), typing (${typingItems})
  Use BOTH today's + mini card vocabulary

Output valid JSON.`;

  const userPrompt = `{
  "day": ${dayNumber},
  "task1": {
    "id": "day${dayNumber}-task1",
    "title": "Vocabulary Check",
    "estimatedMinutes": 6,
    "format": "sections",
    "passingScore": 0.7,
    "sections": [
      {"type": "quiz", "title": "Recognition", "questions": [/* 3-4 Qs */]},
      {"type": "fillBlank", "title": "Usage", "items": [/* 2-3 items */]}
    ]
  },
  "intensivePractice": {
    "id": "day${dayNumber}-intensive",
    "title": "Intensive Practice: ${params.dayTitle}",
    "description": "New vocabulary and deep practice",
    "estimatedMinutes": 12,
    "miniFoundationCards": [/* ${miniCardCount} cards */
      {"id": "mini1", "concept": "New Word in ${lang}", "explanation": "100-150 words with meaning, pronunciation, usage..."}
    ],
    "sections": [/* 2 sections from: fillBlank, translation, reorder, typing */]
  },
  "reflection": {
    "questions": [
      {"id": "confidence", "question": "Rate your vocabulary confidence (1-5)", "type": "scale"},
      {"id": "hardest", "question": "Hardest exercise type?", "type": "choice", "options": ["Fill in blank", "Translation", "Reordering", "Typing"]},
      {"id": "review", "question": "Words needing review?", "type": "text"}
    ]
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
- "starterCode": Generate ACTUAL runnable code with TODO comments marking where user adds code
- "solution": Generate COMPLETE working code that implements ALL requirements
- DO NOT copy the placeholder text - generate REAL code
- The code must be runnable and solve the project requirements

Output valid JSON only.`;

  // Minimal template - AI generates content
  const userPrompt = `Boss Project Day ${params.bossDay}: "${params.bossTitle}"
Combines Days: ${params.combinesDays.join(', ')}
Topics: ${params.dayTitles.join(' → ')}

Generate JSON with:
- overview: {whatYouBuild, whyItMatters, skillsIntegrated[{skill, howUsed}]}
- requirements: [{requirement, fromDay, concept}] - one per day combined
- phases: 3 phases (Setup 15min, Core Build 35min, Polish 25min) with objectives[], deliverable
- starterCode: REAL ${params.suggestedLanguage || 'code'} with TODOs (30-50 lines)
- setupInstructions: {files: [{path: "file path", description: "what it contains"}], steps: ["Step-by-step setup instructions"], runCommand: "optional run command"}
- hints: 4 progressive hints with phase numbers
- solution: COMPLETE working ${params.suggestedLanguage || 'code'} (50-100 lines)
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

CONTENT STRATEGY - decide per day:

contentLayer:
  foundation    = core theoretical concepts (fundamentals, principles, theory)
  language_core = language/domain basics (syntax, vocabulary, fundamentals)
  framework     = patterns and methodologies (best practices, frameworks)
  tool          = tools/platforms (software, equipment, resources)
  project       = building/applying (hands-on practice, real projects)

videoStrategy (ENFORCED BY SKILL TYPE):
  KNOWLEDGE → ALWAYS "skip" (text + interaction is always better for concepts)
  LANGUAGE  → ALWAYS "skip" (handled separately with audio)
  PHYSICAL  → ALWAYS "recommended" (form demonstration requires visual)
  CODE      → AI decides: "recommended" only when visual demo genuinely helps
              (debugging flow, UI walkthrough, architecture animation).
              "skip" for pure logic, algorithms, syntax, APIs.
  DESIGN    → AI decides: "recommended" for tool workflows (Figma, software).
              "skip" for principles, theory.

  Values: skip | optional | helpful | recommended

transferability: high (universal) | medium (similar domains) | low (specific context)

Each day: title, subtitle, skills[], teaser, estimatedMinutes, contentLayer, videoStrategy, transferability

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

FOUNDATION CARDS (5-6) - Include Level 1 Understanding:
- Card 1: INTRO/RECAP connecting to previous day
- Cards 2-5: Core concepts with realWorldContext
- Each card: 200-300 words, answers ONE question, not exhaustive
- Format: "What is X?" → "It solves B, not A"
- microQuestion: Understanding check built into each card
  - "Which statement about X is correct?"
  - "Which example matches this concept?"
  - Types: gotit, understanding (MCQ)

CASE STUDY CARDS (1-2 per day, optional - for decision-making concepts):
For cards about choices, trade-offs, or "when to use X vs Y":
- Add a caseStudy object with:
  - scenario: Real-world situation (2-3 sentences, e.g., "You're building X and encounter Y...")
  - question: "What would you do?" or "Which approach fits?"
  - options: 3-4 choices, each with label (1-5 words) and consequence ("This works, but..." or "This fails because...")
  - bestChoice: Index of optimal choice (0-based)
  - explanation: Why it's best (1-2 sentences)
- NOT every card needs a case study - only for decision-oriented concepts
- User must answer case study before proceeding (gated like microQuestion)

NOTE: task1 is generated in DEFERRED content (loads in background while user reads foundation cards)

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
- Daily flow: Video → Cards → Quiz/FillBlank → Boss Micro-Step → Reflection`
    : `PRACTICE-BASED STRUCTURE:
- Each day is self-contained with standalone practice exercises
- No multi-day projects - focus on mastering daily concepts
- Daily flow: Video → Cards → Quiz/FillBlank → Practice Project → Reflection`;

  // Dynamic part - user-specific context with skill guidance
  const skillGuidance = getSkillTypeGuidance(
    params.skillType,
    params.complexity,
    params.safetyLevel,
  );
  const levelGuidance = getSkillLevelGuidance(params.skillLevel);
  const dynamicPart = `Generate ${params.durationDays}-day curriculum skeleton for "${params.skillName}".
Type: ${params.skillType} | Level: ${params.skillLevel} | ${time.totalMinutes}min/day (${time.mode})
${params.suggestedLanguage ? `Language: ${params.suggestedLanguage}` : ''}

${structureInstructions}
${learnerContext}
${skillGuidance}

${levelGuidance.complexityGuidance}

Per day: day, title, subtitle, skills[], teaser, estimatedMinutes:${time.totalMinutes}, ${isProjectBased ? 'hasBossProject:true, bossMilestonePreview,' : ''} contentLayer, videoStrategy, transferability.`;

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
      "estimatedMinutes": ${time.totalMinutes},${
        isProjectBased
          ? `
      "hasBossProject": true,
      "bossMilestonePreview": "What code they'll add today",`
          : ''
      }
      "contentLayer": "foundation|language_core|framework|tool|project",
      "videoStrategy": "skip|optional|helpful|recommended",
      "transferability": "high|medium|low"
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
 * Uses UNIFIED SECTIONS FORMAT for ALL skill types
 */
export function buildCacheableDayDetailCorePrompt(params: DayDetailParams): {
  staticPart: string;
  dynamicPart: string;
  userPrompt: string;
} {
  // Use dedicated language learning prompt if detected by skill detector
  // Only check isLanguageLearning - targetLanguage defaults to 'other' inside the function
  if (params.isLanguageLearning) {
    return buildCacheableLanguageLearningPrompt(params);
  }

  // Use stored isProjectBased from metadata, fall back to calculation if not provided
  const isProjectBased =
    params.isProjectBased ??
    usesProjectBasedLearning(params.learningStyle);

  // Static part - cacheable
  const staticPart = DAY_DETAIL_STATIC_INSTRUCTIONS;

  // Get default sections for this skill type (AI may override for language learning)
  const sections = getSectionsForSkillType(params.skillType, {
    isProjectBased,
    codeWritingEnabled: params.codeWritingEnabled,
    customSections: params.customSections,
  });
  const sectionTypes = sections.task1.join(' + ');

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
${params.previousDayTitle ? `Previous: ${params.previousDayTitle}` : ''}
Type: ${params.skillType} | Level: ${params.skillLevel} | Sections: ${sectionTypes}
${skillGuidance}

${levelGuidance.complexityGuidance}
CONTENT QUANTITY: ${levelGuidance.foundationCardCount} foundation cards covering the Topics above, ${levelGuidance.quizQuestionCount} quiz/exercise questions total
${personalizationInstructions}${continuityInstructions}`;

  // User prompt for regular (non-language) skills - CORE content only (task1 moved to deferred)
  const userPrompt = `Day ${params.dayNumber}: "${params.dayTitle}" for skill "${params.skillName}"
Skill Type: ${params.skillType} | Level: ${params.skillLevel}
${skillsStr ? `Key topics: ${skillsStr}` : ''}

Generate CORE content as JSON with this structure:
{
  "prePrompt": {
    "text": "Welcome message for today's learning",
    "primeQuestions": ["Question 1?", "Question 2?"],
    "yesterdayRecap": "Brief recap of previous day or welcome for day 1"
  },
  "video": {
    "watchPoints": ["Key point 1", "Key point 2"],
    "searchQuery": "YouTube search query for this topic"
  },
  "foundationCards": [
    {
      "concept": "Main concept title",
      "explanation": "200-300 word explanation answering ONE question",
      "realWorldContext": "Why this matters in practice",
      "microQuestion": {
        "type": "understanding",
        "question": "Which statement is correct?",
        "options": ["Option A", "Option B", "Option C"],
        "correctIndex": 0,
        "explanation": "Why this is correct"
      }
    }
  ]
}

REQUIREMENTS:
- foundationCards: REQUIRED - ${levelGuidance.foundationCardCount} cards covering the key topics
  - Card 1: INTRO/RECAP connecting to previous day
  - Each card: 200-300 words, answers ONE question
  - microQuestion: Understanding check on each card
  - caseStudy (optional, 1-2 cards): For decision-making concepts only
- prePrompt: REQUIRED
- video: REQUIRED (even if just searchQuery)

Output valid JSON only.`;

  return { staticPart, dynamicPart, userPrompt };
}

/**
 * Generate Task1 section template based on skill type
 * Uses 2 section types per skill type for variety while keeping it focused
 */
function getTask1SectionTemplate(skillType: SkillType): string {
  switch (skillType) {
    case SkillType.CODE:
    case SkillType.AI_AGENT:
      return `[
        {"type": "quiz", "level": 1, "title": "Differentiation", "questions": [/* 2-3 compare/contrast Qs */]},
        {"type": "outputPrediction", "level": 2, "title": "Predict the Output", "questions": [/* 2-3 code output Qs */]}
      ]`;

    case SkillType.PHYSICAL:
      return `[
        {"type": "quiz", "level": 1, "title": "Differentiation", "questions": [/* 2-3 form/technique Qs */]},
        {"type": "reorder", "level": 2, "title": "Order the Steps", "items": [/* 2-3 movement sequence items */]}
      ]`;

    case SkillType.DESIGN:
      return `[
        {"type": "quiz", "level": 1, "title": "Differentiation", "questions": [/* 2-3 principle Qs */]},
        {"type": "designCritique", "level": 2, "title": "Apply Design Thinking", "items": [/* 2-3 critique items */]}
      ]`;

    case SkillType.KNOWLEDGE:
    default:
      // For soft skills/leadership, AI can use openEnded instead of fillBlank
      return `[
        {"type": "quiz", "level": 1, "title": "Differentiation", "questions": [/* 2-3 compare/contrast Qs */]},
        {"type": "fillBlank", "level": 2, "title": "Apply the Concepts", "items": [/* 2-3 fill-blank items */]}
      ]`;
    // Note: For soft skills, AI may use openEnded instead of fillBlank
  }
}
