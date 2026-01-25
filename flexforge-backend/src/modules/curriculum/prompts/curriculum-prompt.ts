import { SkillLevel } from '../../../database/entities/session.entity';
import { SkillType, SkillComplexity } from '../services/skill-detector.service';
import { OutputType } from '../types/learner-prefs.interface';

// Learner preferences from onboarding (optional - may not exist for users who skipped onboarding)
export interface LearnerPrefsForPrompt {
  selectedDirection?: string;      // The direction they picked (more specific than skillName)
  selectedDirectionOutcome?: string; // "You'll be able to..." - specific deliverable
  directionKeywords?: string[];    // Keywords for the selected direction
  selectedLanguage?: string;       // User's chosen language (overrides auto-detection)
  outputType?: OutputType;
  usageContext?: 'work' | 'personal' | 'interview' | 'school';
  contentDepth?: 'fast' | 'medium' | 'deep';
  improvementAreas?: string[];           // User-specified areas to emphasize (e.g., "conflict resolution", "async/await")
}

export interface CurriculumPromptParams {
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
// CONTENT LAYER & STRATEGY TYPES (AI-decided per day)
// ============================================

// Content layer: What type of learning is this day?
export type ContentLayer = 'foundation' | 'language_core' | 'framework' | 'tool' | 'project';

// Video strategy: Should we search for video? (AI decides based on topic)
export type VideoStrategy = 'skip' | 'optional' | 'helpful' | 'recommended';

// Transferability: Does this skill transfer to other contexts?
export type Transferability = 'high' | 'medium' | 'low';

// Content source: Where to get the content
export type ContentSource = 'university' | 'youtube' | 'text' | 'docs';

// ============================================
// SECTION REGISTRY (Unified Section-Based Task System)
// ============================================

// Section types available for each skill category
export type UniversalSectionType = 'quiz' | 'matching' | 'fillBlank' | 'openEnded';
export type SequenceSectionType = 'reorder';  // Only for skills where ordering matters (language, physical, some knowledge)
export type LanguageSectionType = 'toneSelect' | 'translation' | 'typing';
export type CodeSectionType = 'codeCompletion' | 'debugging' | 'outputPrediction';
export type PhysicalSectionType = 'formCheck' | 'safetyCheck';
export type DesignSectionType = 'designCritique';

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
export const SECTION_REGISTRY: Record<SkillType, {
  task1: SectionType[];      // Concept reinforcement sections (always included)
  intensive: SectionType[];  // Deep practice sections (only when NOT project-based)
}> = {
  [SkillType.CODE]: {
    task1: ['quiz', 'outputPrediction', 'fillBlank'],
    intensive: ['codeCompletion', 'debugging', 'fillBlank'],    // Only used when NOT project-based
  },
  [SkillType.PHYSICAL]: {
    task1: ['quiz', 'reorder', 'matching'],
    intensive: ['formCheck', 'safetyCheck', 'reorder'],
  },
  [SkillType.KNOWLEDGE]: {
    // AI chooses: quiz + matching + fillBlank (factual) OR quiz + fillBlank + openEnded (soft skills/leadership)
    task1: ['quiz', 'matching', 'fillBlank', 'openEnded'],
    intensive: ['fillBlank', 'reorder', 'quiz', 'openEnded'],  // openEnded for soft skills scenarios
  },
  [SkillType.DESIGN]: {
    task1: ['quiz', 'designCritique', 'matching'],
    intensive: ['designCritique', 'quiz', 'matching'],
  },
  [SkillType.AI_AGENT]: {
    task1: ['quiz', 'fillBlank', 'outputPrediction'],
    intensive: ['codeCompletion', 'fillBlank', 'quiz'],         // Only used when NOT project-based
  },
};

// Language learning extends KNOWLEDGE with language-specific sections
export const LANGUAGE_SECTION_REGISTRY = {
  task1: ['quiz', 'matching', 'toneSelect'] as SectionType[],  // toneSelect only for tonal languages
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
    customSections?: { task1: SectionType[]; intensive: SectionType[] } | null;
  } = {}
): { task1: SectionType[]; intensive: SectionType[]; skipIntensive: boolean } {
  const { isLanguageLearning = false, hasTones = false, isProjectBased = false, customSections } = options;

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
        : LANGUAGE_SECTION_REGISTRY.task1.filter(s => s !== 'toneSelect'),
      intensive: LANGUAGE_SECTION_REGISTRY.intensive,
      skipIntensive: false,
    };
  }

  const registry = SECTION_REGISTRY[skillType] || SECTION_REGISTRY[SkillType.KNOWLEDGE];

  return {
    task1: registry.task1,
    intensive: registry.intensive,
    skipIntensive: isProjectBased,  // Project-based: bossMilestone handles hands-on, skip intensive
  };
}

// Consolidated time structure with all activities
// New flow: Video → FoundationCards → Quiz/FillBlank → BossMilestone → Reflection
function getTimeStructure(hoursPerDay: number): {
  totalMinutes: number;
  mode: string;
  maxVideo: number;
  task1: number;      // Quiz/FillBlank time (concept reinforcement)
  practice: number;   // Practice project time
  reflect: number;
  structure: string;
} {
  const total = Math.round(hoursPerDay * 60);

  if (total <= 30) {
    return {
      totalMinutes: total, mode: 'Quick',
      maxVideo: 5, task1: 15, practice: 0, reflect: 3,
      structure: 'Video(5m) → Cards(5m) → Quiz(6m) → BossMilestone(9m) → Reflect(3m)'
    };
  } else if (total <= 45) {
    return {
      totalMinutes: total, mode: 'Standard',
      maxVideo: 6, task1: 12, practice: 12, reflect: 4,
      structure: 'Video(6m) → Cards(8m) → Quiz(5m) → BossMilestone(7m) → Practice(12m) → Reflect(4m)'
    };
  } else if (total <= 60) {
    return {
      totalMinutes: total, mode: 'Focused',
      maxVideo: 7, task1: 15, practice: 18, reflect: 5,
      structure: 'Video(7m) → Cards(10m) → Quiz(6m) → BossMilestone(9m) → Practice(18m) → Reflect(5m)'
    };
  }
  // Deep Dive: 90+ min
  return {
    totalMinutes: total, mode: 'DeepDive',
    maxVideo: 10, task1: 15, practice: 25, reflect: 8,
    structure: 'Video(10m) → Cards(15m) → Quiz(6m) → BossMilestone(9m) → Practice(25m) → Reflect(8m)'
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

  // Output type affects curriculum structure
  if (prefs.outputType) {
    const outputGuidance: Record<OutputType, string> = {
      // Code/technical skills
      working_code: 'User wants WORKING CODE as output. Focus on practical implementation, real runnable examples.',
      ship_project: 'User wants to SHIP A PROJECT. Focus on end-to-end implementation, deployment, best practices.',
      fix_bug: 'User wants to FIX BUGS. Focus on debugging techniques, common issues, troubleshooting patterns.',
      // Universal
      understand_concept: 'User wants to UNDERSTAND CONCEPTS. Include more theory, explanations, and mental models.',
      teach_others: 'User wants to TEACH OTHERS. Focus on clear explanations, teaching techniques, common misconceptions.',
      // Knowledge skills
      pass_exam: 'User wants to PASS AN EXAM. Focus on testable knowledge, practice questions, exam strategies.',
      apply_practical: 'User wants to USE KNOWLEDGE PRACTICALLY. Focus on real-world applications, conversational use, practical scenarios.',
      // Physical skills
      perform_skill: 'User wants to PERFORM THE SKILL WELL. Focus on proper technique, practice routines, common mistakes to avoid.',
      compete: 'User wants to COMPETE. Focus on advanced techniques, competitive strategies, performance optimization.',
      master_basics: 'User wants to MASTER THE BASICS. Focus on foundational movements, core techniques, building muscle memory.',
    };
    parts.push(outputGuidance[prefs.outputType] || '');
  }

  // Usage context affects examples and focus
  if (prefs.usageContext) {
    const contextGuidance: Record<string, string> = {
      work: 'FOR WORK: Use professional examples, enterprise patterns, team collaboration scenarios.',
      personal: 'FOR PERSONAL PROJECT: Use hobbyist-friendly examples, fun projects, creative applications.',
      interview: 'FOR INTERVIEW PREP: Include common interview questions, algorithmic thinking, optimization.',
      school: 'FOR LEARNING: Include foundational concepts, academic rigor, theoretical understanding.',
    };
    parts.push(contextGuidance[prefs.usageContext] || '');
  }

  // Content depth affects how much detail to include
  if (prefs.contentDepth) {
    const depthGuidance: Record<string, string> = {
      fast: 'DEPTH: FAST - Minimal theory, quick practical tasks, essential concepts only.',
      medium: 'DEPTH: BALANCED - Core concepts with practical application, standard complexity.',
      deep: 'DEPTH: COMPREHENSIVE - Include edge cases, advanced patterns, thorough explanations.',
    };
    parts.push(depthGuidance[prefs.contentDepth] || '');
  }

  // User-specified improvement areas to emphasize
  if (prefs.improvementAreas?.length) {
    parts.push(`IMPROVEMENT AREAS (user wants to get better at):
${prefs.improvementAreas.map(area => `- ${area}`).join('\n')}
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
 * Determines if learning should be project-based (boss projects) or practice-based (practice projects)
 *
 * Priority (user intent first!):
 * 1. User's goal from questionnaire (outputType) - TAKES PRIORITY:
 *    - ship_project, working_code → project-based (even for KNOWLEDGE skills)
 *    - understand_concept, fix_bug, pass_exam, etc → practice-based
 * 2. Skill type default (if no user preference):
 *    - KNOWLEDGE/PHYSICAL → practice-based
 *    - CODE/AI_AGENT/DESIGN → project-based
 */
export function usesProjectBasedLearning(
  skillType: SkillType,
  outputType?: OutputType
): boolean {
  // User intent takes priority - if they want to ship/build something, it's project-based
  if (outputType) {
    switch (outputType) {
      // These output types indicate project-based learning
      case 'ship_project':
      case 'working_code':
        return true;
      // These output types indicate practice-based learning
      case 'understand_concept':
      case 'fix_bug':
      case 'teach_others':
      case 'pass_exam':
      case 'apply_practical':
      case 'perform_skill':
      case 'compete':
      case 'master_basics':
        return false;
    }
  }

  // KNOWLEDGE and PHYSICAL default to practice-based (unless user specified otherwise above)
  if (skillType === SkillType.KNOWLEDGE || skillType === SkillType.PHYSICAL) {
    return false;
  }

  // Default: CODE/AI_AGENT/DESIGN without preference → project-based
  return true;
}

function getSkillTypeGuidance(skillType: SkillType, complexity: SkillComplexity, safetyLevel?: string): string {
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
  | 'chinese' | 'japanese' | 'korean' | 'arabic' | 'spanish'
  | 'french' | 'german' | 'italian' | 'portuguese' | 'russian'
  | 'hindi' | 'thai' | 'vietnamese' | 'other';

// ============================================
// SHARED HELPERS (Reduce code duplication)
// ============================================

// Language feature constants
const TONAL_LANGUAGES: TargetLanguage[] = ['chinese', 'thai', 'vietnamese'];
const GENDERED_LANGUAGES: TargetLanguage[] = ['spanish', 'french', 'german', 'italian', 'portuguese', 'arabic', 'russian', 'hindi'];

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

// Shared reflection template
function getReflectionTemplate(type: 'project' | 'practice' | 'language' = 'practice'): object {
  const baseQuestions = [
    { id: 'confidence', question: 'Rate your confidence (1-5)?', type: 'scale' },
  ];

  if (type === 'project') {
    return {
      questions: [
        ...baseQuestions,
        { id: 'clicked', question: 'What clicked today?', type: 'text' },
        { id: 'foggy', question: "What's still unclear?", type: 'text' },
      ],
    };
  }

  if (type === 'language') {
    return {
      questions: [
        { id: 'confidence', question: 'Rate your confidence with today\'s vocabulary (1-5)', type: 'scale' },
        { id: 'hardest', question: 'Which exercise type was hardest?', type: 'choice', options: ['Fill in blank', 'Translation', 'Reordering', 'Typing'] },
        { id: 'review', question: 'Which words need more review?', type: 'text' },
      ],
    };
  }

  // practice (intensive)
  return {
    questions: [
      ...baseQuestions,
      { id: 'application', question: 'How will you apply this?', type: 'text' },
      { id: 'questions', question: 'What questions do you still have?', type: 'text' },
    ],
  };
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
  skillLevel: SkillLevel;  // BEGINNER, INTERMEDIATE, ADVANCED
  complexity: SkillComplexity;
  userTier: string;
  hoursPerDay: number;
  suggestedLanguage?: string;
  outputType?: OutputType;
  isProjectBased?: boolean; // Pass directly from metadata - don't re-calculate
  // Reflection data from previous day (for personalized prePrompt)
  previousDayReflection?: {
    confusedConcepts?: string[];
    confidence?: number;
    boostCompleted?: boolean;
    whatsFoggy?: string;  // 'when' | 'how' | 'connection' | 'everything'
  };

  // Language learning specific (when skillType is KNOWLEDGE + human language)
  isLanguageLearning?: boolean;
  targetLanguage?: TargetLanguage;
  proficiencyLevel?: string;  // HSK1, N5, A1, etc.

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
    chinese: 'hasTones: true, hasScript: true (simplified/traditional), hasRomanization: pinyin',
    japanese: 'hasScript: true (hiragana/katakana/kanji), hasRomanization: romaji',
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
    "romanization": "pronunciation guide (pinyin/romaji/etc)",${langHasTones ? `
    "tone": "number or [numbers] for tonal languages",` : ''}${langHasGender ? `
    "gender": "masculine | feminine | neuter",` : ''}
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
- skipTest: {questionSets[[3 MCQs]], passThreshold:3}

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
        "romanization": "pronunciation guide (pinyin/romaji/etc)",${langHasTones ? `
        "tone": 1,` : ''}${langHasGender ? `
        "gender": "masculine",` : ''}
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
      }${langHasTones ? `,
      {
        "type": "toneSelect",
        "title": "Tone Recognition",
        "questions": [
          {"id": "t1", "audioText": "word", "prompt": "Select the correct tone", "options": ["mā (1st)", "má (2nd)", "mǎ (3rd)", "mà (4th)"], "correctIndex": 0, "explanation": "This is first tone (flat)"}
        ]
      }` : ''}
    ]
  },
  "reflection": {
    "questions": [
      {"id": "confidence", "question": "Rate your confidence with today's vocabulary (1-5)", "type": "scale"},
      {"id": "clicked", "question": "Which word stuck with you the most?", "type": "text"},
      {"id": "foggy", "question": "Which word is still unclear?", "type": "text"}
    ]
  },
  "skipTest": {
    "questionSets": [[
      {"question": "Q1?", "options": ["A", "B", "C", "D"], "correctIndex": 0},
      {"question": "Q2?", "options": ["A", "B", "C", "D"], "correctIndex": 1},
      {"question": "Q3?", "options": ["A", "B", "C", "D"], "correctIndex": 2}
    ]],
    "passThreshold": 3
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
 */
export function buildDayDetailDeferredPrompt(params: DayDetailParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  // Use language learning deferred prompt if applicable
  // Only check isLanguageLearning - targetLanguage defaults to 'other' inside the function
  if (params.isLanguageLearning) {
    return buildLanguageLearningDeferredPrompt(params);
  }

  // Check if practice-based (non-project-based)
  const isProjectBased = params.isProjectBased ?? usesProjectBasedLearning(params.skillType, params.outputType);

  // For practice-based skills, generate intensive practice sections
  if (!isProjectBased) {
    return buildPracticeBasedDeferredPrompt(params);
  }

  // For project-based skills, generate bossMilestone + reflection
  return buildProjectBasedDeferredPrompt(params);
}

/**
 * Project-based DEFERRED prompt - bossMilestone for project-based skills
 */
function buildProjectBasedDeferredPrompt(params: DayDetailParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const dayNumber = params.dayNumber;
  const skillsStr = getSkillsString(params.skeleton, params.dayObjectives);
  const levelGuidance = getSkillLevelGuidance(params.skillLevel);

  // Scale code complexity based on skill level
  const starterCodeLines = params.skillLevel === SkillLevel.ADVANCED ? '15-35' : params.skillLevel === SkillLevel.INTERMEDIATE ? '12-30' : '10-25';
  const solutionCodeLines = params.skillLevel === SkillLevel.ADVANCED ? '25-60' : params.skillLevel === SkillLevel.INTERMEDIATE ? '20-50' : '15-40';
  const newCodeLines = params.skillLevel === SkillLevel.ADVANCED ? '10-25' : params.skillLevel === SkillLevel.INTERMEDIATE ? '8-20' : '5-15';

  const systemPrompt = `Generate DEFERRED content for Day ${dayNumber} of "${params.skillName}".
Skill Type: ${params.skillType} | Level: ${params.skillLevel}
Today's Topics: ${skillsStr}
${params.suggestedLanguage ? `Language: ${params.suggestedLanguage}` : ''}

${levelGuidance.complexityGuidance}

Generate bossMilestone (daily micro-step toward boss project) + reflection.

BOSS MILESTONE - CRITICAL REQUIREMENTS:
- Daily micro-step building toward boss project (${newCodeLines} lines new code for coding skills)
- starterCode: MUST be ${starterCodeLines} lines of REAL, RUNNABLE code with TODO comments marking where user adds code
- solution: MUST be ${solutionCodeLines} lines of COMPLETE, WORKING code that solves the microTask
- solutionAnnotations: 2-4 strings explaining key lines in the solution
- hints: 3 progressive hints (level 1: conceptual, level 2: specific approach, level 3: detailed guidance)
- setupInstructions: {files: [{path, description}], steps: [], runCommand?: "optional"}
  - REQUIRED: Tell user which file(s) to create and where to paste code
  - files: List each file path with description (e.g., "pages/index.js", "pages/api/hello.js")
  - steps: Clear setup instructions (e.g., "Create pages/api/hello.js and paste the API code")
  - runCommand: How to run the code (e.g., "node index.js", "npm start", "npm run dev")
- DO NOT use placeholder text like "// COMPLETE working solution" - generate ACTUAL code
- Validation: user runs code, sees output

Output valid JSON only.`;

  const userPrompt = `{
  "day": ${dayNumber},
  "bossMilestone": {
    "day": ${dayNumber},
    "title": "Day ${dayNumber} Contribution",
    "description": "Build a piece of your boss project",
    "microTask": "REQUIRED: Specific task description (5-15 lines of code)",
    "dayContribution": "How this helps the final project",
    "conceptConnection": "Which foundationCard concept this applies",
    "estimatedMinutes": 10,
    "starterCode": "REQUIRED: 5-20 lines ACTUAL starter code with TODOs marking where user adds code. ${dayNumber === 1 ? 'Start fresh.' : 'Build on previous days - include relevant code from day ' + (dayNumber - 1) + '.'}",
    "expectedOutput": "What user should see when they run the code",
    "hints": [
      {"level": 1, "hint": "REQUIRED: Gentle conceptual hint"},
      {"level": 2, "hint": "REQUIRED: More specific approach"},
      {"level": 3, "hint": "REQUIRED: Detailed guidance"}
    ],
    "solution": "REQUIRED: 15-40 lines COMPLETE working solution code. Must be real, runnable code.",
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
}

Topics: ${skillsStr}
Generate REAL ${params.suggestedLanguage || 'code'} for starterCode and solution.`;

  return { systemPrompt, userPrompt };
}

/**
 * Get intensive section instructions per skill type
 * Based on SECTION_REGISTRY.intensive
 */
function getIntensiveSectionInstructions(skillType: SkillType): string {
  switch (skillType) {
    case SkillType.CODE:
      return `SECTION TYPES TO INCLUDE:
1. codeCompletion - Complete partial code with working solution (3-4 items)
2. debugging - Find and fix bugs in code (3-4 items)
3. fillBlank - Complete code statements with correct terms (3-4 items)`;

    case SkillType.PHYSICAL:
      return `SECTION TYPES TO INCLUDE:
1. formCheck - Verify proper form/technique checkpoints (4-5 items)
2. safetyCheck - True/false safety questions (3-4 items)
3. reorder - Order the steps of movements/exercises (3-4 items)`;

    case SkillType.KNOWLEDGE:
      return `SECTION TYPES TO INCLUDE (AI chooses based on topic):
For FACTUAL topics (history, science):
1. fillBlank - Complete statements with correct terms (4-5 items)
2. reorder - Order steps/events in correct sequence (3-4 items, only if topic has sequences)
3. quiz - Multiple choice questions testing understanding (4-5 questions)

For SOFT SKILLS/LEADERSHIP topics:
1. fillBlank - Complete statements with correct terms (3-4 items)
2. quiz - Multiple choice questions (3-4 questions)
3. openEnded - Scenario-based reflection questions (2-3 items)`;

    case SkillType.DESIGN:
      return `SECTION TYPES TO INCLUDE:
1. designCritique - Evaluate designs and identify improvements (3-4 items)
2. quiz - Multiple choice questions on design principles (3-4 questions)
3. matching - Match design concepts to definitions (4-5 pairs)`;

    case SkillType.AI_AGENT:
      return `SECTION TYPES TO INCLUDE:
1. codeCompletion - Complete AI/API code with working solution (3-4 items)
2. fillBlank - Complete statements about AI concepts (3-4 items)
3. quiz - Multiple choice questions testing understanding (3-4 questions)`;

    default:
      return `SECTION TYPES TO INCLUDE:
1. fillBlank - Complete statements with correct terms (4-5 items)
2. quiz - Multiple choice questions testing understanding (4-5 questions)
3. matching - Match concepts to definitions (4-5 pairs)`;
  }
}

/**
 * Get intensive section JSON template per skill type
 * Based on SECTION_REGISTRY.intensive
 */
function getIntensiveSectionTemplate(skillType: SkillType, dayNumber: number): string {
  switch (skillType) {
    case SkillType.CODE:
    case SkillType.AI_AGENT:
      return `[
      {
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
      },
      {
        "type": "debugging",
        "title": "Fix the Bug",
        "items": [
          {
            "id": "db1",
            "buggyCode": "// Code with bug...",
            "fixedCode": "// Corrected code...",
            "hint": "Look at...",
            "explanation": "The bug was...",
            "language": "javascript"
          }
        ]
      },
      {
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
      }
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
function buildPracticeBasedDeferredPrompt(params: DayDetailParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const dayNumber = params.dayNumber;
  const skillType = params.skillType;
  const skillsStr = getSkillsString(params.skeleton, params.dayObjectives);
  const levelGuidance = getSkillLevelGuidance(params.skillLevel);

  // Calculate items per section based on skill level (base: 3-4, intermediate: 4-5, advanced: 5-6)
  const itemsPerSection = `${Math.round(3 * levelGuidance.contentMultiplier)}-${Math.round(5 * levelGuidance.contentMultiplier)}`;

  // For custom sections, just list the names (AI knows formats from static instructions)
  // For standard skill types, use the existing functions
  const sectionInstructions = params.customSections
    ? `INCLUDE THESE SECTION TYPES: ${params.customSections.intensive.join(', ')}\n(${itemsPerSection} items per section, use formats from section registry)`
    : getIntensiveSectionInstructions(skillType);

  const sectionTemplate = params.customSections
    ? `[/* Generate sections: ${params.customSections.intensive.join(', ')} */]`
    : getIntensiveSectionTemplate(skillType, dayNumber);

  const systemPrompt = `Generate INTENSIVE PRACTICE content for Day ${dayNumber} of "${params.skillName}".
Skill Type: ${skillType}${params.customSections ? ' (hybrid - using custom sections)' : ''} | Level: ${params.skillLevel}

Today's Topics: ${skillsStr}

${levelGuidance.complexityGuidance}

CONTENT QUANTITY: ${itemsPerSection} items per section (scaled for ${params.skillLevel} level)

CONTENT RULES:
- Primarily use concepts from today's foundation cards
- If introducing ANY new concept not from today's cards, add it to the section's "newKnowledge" array
- Each section should have "newKnowledge" array listing new terms/concepts

Generate practice exercises that reinforce today's concepts.

For each section, include:
"newKnowledge": [{"term": "concept", "meaning": "explanation"}]
List any concepts used that weren't in today's foundation cards.

${sectionInstructions}

Output valid JSON only.`;

  const userPrompt = `{
  "day": ${dayNumber},
  "intensivePractice": {
    "id": "day${dayNumber}-intensive",
    "title": "Intensive Practice: ${params.dayTitle}",
    "description": "Apply and reinforce today's concepts",
    "estimatedMinutes": 10,
    "sections": ${sectionTemplate}
  },
  "reflection": {
    "questions": [
      {"id": "confidence", "question": "Rate your confidence (1-5)?", "type": "scale"},
      {"id": "application", "question": "How will you apply this?", "type": "text"},
      {"id": "questions", "question": "What questions do you still have?", "type": "text"}
    ]
  }
}

Topics: ${skillsStr}`;

  return { systemPrompt, userPrompt };
}

/**
 * Language Learning DEFERRED prompt - intensive practice exercises
 */
function buildLanguageLearningDeferredPrompt(params: DayDetailParams): {
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

  const systemPrompt = `Generate INTENSIVE PRACTICE content for Day ${dayNumber} of "${params.skillName}".

Language: ${lang}
Proficiency: ${profLevel} | Skill Level: ${params.skillLevel}
Today's Topics: ${skillsStr}

${levelGuidance.complexityGuidance}

CONTENT RULES:
- Primarily use vocabulary from today's foundation cards
- If introducing ANY new word not from today's cards, add it to the section's "newKnowledge" array
- Each section MUST have "newKnowledge" array listing new terms with meanings

Generate practice exercises that reinforce today's vocabulary.

SECTION TYPES (each with optional newKnowledge array):
1. fillBlank - Complete sentences (${fillBlankItems} items)
2. translation - Translate between ${lang} and English (${translationItems} items)
3. reorder - Arrange scrambled words (${reorderItems} items)
4. typing - Type the word/phrase (${typingItems} items)

IMPORTANT: For each section, include:
"newKnowledge": [{"term": "word", "meaning": "translation", "pronunciation": "optional"}]
List any words used that weren't in today's foundation cards.

Output valid JSON only.`;

  const userPrompt = `{
  "day": ${dayNumber},
  "intensivePractice": {
    "id": "day${dayNumber}-intensive",
    "title": "Intensive Practice: ${params.dayTitle}",
    "description": "Reinforce today's vocabulary through writing and production",
    "estimatedMinutes": 12,
    "sections": [
      {
        "type": "fillBlank",
        "title": "Complete the Sentence",
        "instructions": "Fill in the blank with the correct word",
        "newKnowledge": [{"term": "new word", "meaning": "translation"}],
        "items": [
          {
            "id": "fb1",
            "sentence": "Sentence with ___BLANK___ in ${lang}",
            "romanization": "pronunciation",
            "translation": "English with ___ blank",
            "blank": {
              "correctAnswers": ["correct", "alternate"],
              "hint": "Hint"
            }
          }
        ]
      },
      {
        "type": "translation",
        "title": "Translation Challenge",
        "instructions": "Translate the following",
        "newKnowledge": [{"term": "new word", "meaning": "translation"}],
        "items": [
          {
            "id": "tr1",
            "direction": "toTarget",
            "prompt": "English to translate",
            "acceptedAnswers": ["${lang} translation"],
            "romanization": "pronunciation",
            "hint": "Hint"
          },
          {
            "id": "tr2",
            "direction": "toEnglish",
            "prompt": "${lang} sentence",
            "romanization": "pronunciation",
            "acceptedAnswers": ["English translation"],
            "hint": "Hint"
          }
        ]
      },
      {
        "type": "reorder",
        "title": "Build the Sentence",
        "instructions": "Arrange words in correct order",
        "items": [
          {
            "id": "ro1",
            "scrambled": ["word2", "word1", "word3"],
            "correctOrder": ["word1", "word2", "word3"],
            "translation": "English meaning",
            "hint": "Grammar hint"
          }
        ]
      },
      {
        "type": "typing",
        "title": "Write What You See",
        "instructions": "Type the word or phrase",
        "items": [
          {
            "id": "ty1",
            "prompt": "Type this",
            "displayText": "${lang} word",
            "acceptedAnswers": ["correct"],
            "romanization": "pronunciation"
          }
        ]
      }
    ]
  },
  "reflection": {
    "questions": [
      {"id": "confidence", "question": "Rate your confidence with today's vocabulary (1-5)", "type": "scale"},
      {"id": "hardest", "question": "Which exercise type was hardest?", "type": "choice", "options": ["Fill in blank", "Translation", "Reordering", "Typing"]},
      {"id": "review", "question": "Which words need more review?", "type": "text"}
    ]
  }
}

Generate ${fillBlankItems} fillBlank, ${translationItems} translation (mix directions), ${reorderItems} reorder, ${typingItems} typing items.
Use vocabulary from: ${skillsStr}`;

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

videoStrategy:
  skip        = text is better (simple definitions, quick facts)
  optional    = video might help (basic concepts, simple patterns)
  helpful     = video aids understanding (visual concepts, demonstrations)
  recommended = video is best (complex topics, tutorials, walkthroughs)

transferability: high (universal) | medium (similar domains) | low (specific context)

Each day: title, subtitle, skills[], teaser, estimatedMinutes, contentLayer, videoStrategy, transferability, skipTest

TOPIC FILTER: Only include what blocks progress toward the goal. MEANS (tools/setup) → minimum to use. ENDS (goal itself) → full depth. No history, theory, or comparisons for things they just use.

SKILL-SPECIFIC ENVIRONMENT GUIDANCE:
- CODE/AI_AGENT: Prefer browser-safe libraries. Provide fixture data for external APIs.
- PHYSICAL: Include safety warnings, warm-up requirements, equipment lists.
- KNOWLEDGE: Use spaced repetition, mnemonics, real-world applications.
- DESIGN: Provide before/after examples, critique frameworks, assessment rubrics.

AVOID (all skills): Content requiring expensive equipment, dangerous activities without safety context, or access to gated/login-required platforms.

skipTest format: {questionSets: [[{question, options[4], correctIndex}]], passThreshold: 2}

Output valid JSON only.`;

/**
 * Static instructions for day detail generation - cacheable
 * Uses UNIFIED SECTIONS FORMAT for ALL skill types
 * Note: Skill type is pre-determined by skill detector, passed via params
 */
const DAY_DETAIL_STATIC_INSTRUCTIONS = `You generate day learning content using the UNIFIED SECTIONS FORMAT.

TASK1 - UNIFIED SECTIONS FORMAT (format: "sections"):
Use sections array with mixed exercise types based on skill type provided.

UNIVERSAL SECTIONS (all skills):
- quiz: {type:"quiz", title, questions[{id, question, options[], correctIndex, explanation}]}
- matching: {type:"matching", title, pairs[{term, definition}]}
- fillBlank: {type:"fillBlank", title, instructions, items[{id, sentence with ___BLANK___, translation, blank:{correctAnswers[], hint?}}]}
- openEnded: {type:"openEnded", title, questions[{id, question, prompt, sampleAnswer, evaluationCriteria[]}]} - for soft skills, leadership, reflection

SEQUENCE SECTIONS (PHYSICAL, ordered KNOWLEDGE only):
- reorder: {type:"reorder", title, instructions, items[{id, scrambled[], correctOrder[], translation, hint?}]}

CODE SECTIONS (CODE, AI_AGENT skills):
- outputPrediction: {type:"outputPrediction", title, questions[{id, code, options[], correctIndex, explanation, language?}]}
- codeCompletion: {type:"codeCompletion", title, items[{id, description, starterCode, solution, hints[], language?}]}
- debugging: {type:"debugging", title, items[{id, buggyCode, fixedCode, hint?, explanation, language?}]}

PHYSICAL SECTIONS (PHYSICAL skills):
- formCheck: {type:"formCheck", title, items[{id, checkpoint, description, commonMistake?}]}
- safetyCheck: {type:"safetyCheck", title, items[{id, question, correctAnswer:boolean, explanation}]}

DESIGN SECTIONS (DESIGN skills):
- designCritique: {type:"designCritique", title, items[{id, description, question, options[], correctIndex, principle, explanation, imageUrl?}]}

SECTION SELECTION BY SKILL TYPE:
- LANGUAGE_LEARNING: quiz + matching + toneSelect(if tonal) - use languageFoundationCards
- CODE: quiz + outputPrediction + fillBlank (for task1)
- PHYSICAL: quiz + reorder + matching (for task1) - reorder for movement sequences
- KNOWLEDGE: AI chooses based on topic:
    - Factual topics (history, science, trivia): quiz + matching + fillBlank
    - Soft skills/leadership (communication, management, teamwork): quiz + fillBlank + openEnded
- DESIGN: quiz + designCritique + matching (for task1)
- AI_AGENT: quiz + fillBlank + outputPrediction (for task1)


FOUNDATION CARDS (5-6):
- Card 1: INTRO/RECAP connecting to previous
- Cards 2-5: Core concepts with realWorldContext
- microQuestion types: gotit, understanding (MCQ)

TASK1: Only test concepts from today's foundationCards. No new knowledge.

SKILL-SPECIFIC EXERCISE GUIDANCE:
- CODE/AI_AGENT: Browser-safe libraries preferred. Provide fixture data for external APIs. Include error handling.
- PHYSICAL: Include safety checks, form cues, common mistakes. Video references where helpful.
- KNOWLEDGE: Use concrete examples, mnemonics, application scenarios. Connect to real-world use cases.
- DESIGN: Use before/after examples, critique exercises, visual references. Include rubrics.

Output valid JSON only.`;

/**
 * Cacheable curriculum prompt - splits static/dynamic for Anthropic prompt caching
 * Use with AiService.callAnthropicWithCache()
 */
export function buildCacheableCurriculumPrompt(params: CurriculumPromptParams): {
  staticPart: string;
  dynamicPart: string;
  userPrompt: string;
} {
  const time = getTimeStructure(params.hoursPerDay);
  const isProjectBased = usesProjectBasedLearning(params.skillType, params.learnerPrefs?.outputType);
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
  const skillGuidance = getSkillTypeGuidance(params.skillType, params.complexity, params.safetyLevel);
  const levelGuidance = getSkillLevelGuidance(params.skillLevel);
  const dynamicPart = `Generate ${params.durationDays}-day curriculum skeleton for "${params.skillName}".
Type: ${params.skillType} | Level: ${params.skillLevel} | ${time.totalMinutes}min/day (${time.mode})
${params.suggestedLanguage ? `Language: ${params.suggestedLanguage}` : ''}

${structureInstructions}
${learnerContext}
${skillGuidance}

${levelGuidance.complexityGuidance}

Per day: day, title, subtitle, skills[], teaser, estimatedMinutes:${time.totalMinutes}, ${isProjectBased ? 'hasBossProject:true, bossMilestonePreview,' : ''} contentLayer, videoStrategy, transferability, skipTest.`;

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
      "estimatedMinutes": ${time.totalMinutes},${isProjectBased ? `
      "hasBossProject": true,
      "bossMilestonePreview": "What code they'll add today",` : ''}
      "contentLayer": "foundation|language_core|framework|tool|project",
      "videoStrategy": "skip|optional|helpful|recommended",
      "transferability": "high|medium|low",
      "skipTest": {
        "description": "Prove mastery to skip this day",
        "questionSets": [[
          {"question": "MCQ testing concept?", "options": ["Wrong", "Wrong", "Correct", "Wrong"], "correctIndex": 2},
          {"question": "Another MCQ?", "options": ["Correct", "Wrong", "Wrong", "Wrong"], "correctIndex": 0},
          {"question": "Third MCQ?", "options": ["Wrong", "Correct", "Wrong", "Wrong"], "correctIndex": 1}
        ]],
        "passThreshold": 2
      }
    }
  ],
  ${bossProjectsSection},
  "metadata": {
    "recommendedTools": [],
    "prerequisites": ${JSON.stringify(params.prerequisiteSkills || [])},
    "safetyLevel": "${params.safetyLevel || 'low'}",
    "isProjectBased": ${isProjectBased}${params.learnerPrefs?.outputType ? `,
    "outputType": "${params.learnerPrefs.outputType}"` : ''},
    "customSections": ${params.customSections ? JSON.stringify(params.customSections) : 'null'}
  }
}

${isProjectBased ? 'hasBossProject=true for ALL days. Include bossMilestonePreview showing what code they\'ll build each day.' : 'Each day should have self-contained learning objectives.'}`;

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

  const time = getTimeStructure(params.hoursPerDay);
  // Use stored isProjectBased from metadata, fall back to calculation if not provided
  const isProjectBased = params.isProjectBased ?? usesProjectBasedLearning(params.skillType, params.outputType);

  // Static part - cacheable
  const staticPart = DAY_DETAIL_STATIC_INSTRUCTIONS;

  // Get default sections for this skill type (AI may override for language learning)
  const sections = getSectionsForSkillType(params.skillType, {
    isProjectBased,
    customSections: params.customSections,
  });
  const sectionTypes = sections.task1.join(' + ');

  // Build improvement areas instruction if provided
  const improvementAreasInstruction = params.improvementAreas?.length
    ? `\nIMPROVEMENT AREAS: ${params.improvementAreas.join(', ')}. Incorporate these into examples and scenarios where relevant.`
    : '';

  // Build less of areas instruction if provided
  const lessOfAreasInstruction = params.lessOfAreas?.length
    ? `\nREDUCE CONTENT FOR: ${params.lessOfAreas.join(', ')}. Minimize examples, scenarios, and explanations involving these areas. Focus on other aspects instead.`
    : '';

  // Build reflection-based personalization instructions
  let reflectionInstruction = '';
  if (params.previousDayReflection) {
    const { whatsFoggy,  confusedConcepts, confidence } = params.previousDayReflection;

    // Handle "what's foggy" - adjust content based on user's confusion type
    if (whatsFoggy) {
      const foggyInstructions: Record<string, string> = {
        'when': 'YESTERDAY FEEDBACK: User was unclear on WHEN to apply concepts. Add clear "use this when..." context to examples. Include real-world scenarios showing appropriate timing and situations.',
        'how': 'YESTERDAY FEEDBACK: User struggled with HOW to apply concepts. Include step-by-step application examples. Show practical implementation with clear before/after demonstrations.',
        'connection': 'YESTERDAY FEEDBACK: User had trouble seeing HOW CONCEPTS CONNECT. Explicitly show relationships between ideas. Use "this builds on..." and "this relates to..." framing.',
        'everything': 'YESTERDAY FEEDBACK: User found everything confusing. Start with a brief 2-3 sentence recap of key points. Use simpler examples and build up gradually.',
      };
      reflectionInstruction += `\n${foggyInstructions[whatsFoggy] || ''}`;
    }


    // Handle confused concepts - add targeted review
    if (confusedConcepts?.length) {
      reflectionInstruction += `\nREVIEW NEEDED: User was confused about [${confusedConcepts.join(', ')}]. If today's content builds on these, include a brief clarifying example.`;
    }

    // Handle low confidence - add encouragement and scaffolding
    if (confidence && confidence < 3) {
      reflectionInstruction += `\nSCAFFOLDING: User had low confidence yesterday (${confidence}/5). Use encouraging framing and break down complex steps.`;
    }
  }

  // Dynamic part - skill name is checked against language detection in static instructions
  const skillGuidance = getSkillTypeGuidance(params.skillType, params.complexity);
  const levelGuidance = getSkillLevelGuidance(params.skillLevel);
  const dynamicPart = `SKILL: "${params.skillName}"
Day ${params.dayNumber}: ${params.dayTitle}
${params.previousDayTitle ? `Previous: ${params.previousDayTitle}` : ''}
Type: ${params.skillType} | Level: ${params.skillLevel} | Sections: ${sectionTypes}
${skillGuidance}

${levelGuidance.complexityGuidance}
CONTENT QUANTITY: ${levelGuidance.foundationCardCount} foundation cards, ${levelGuidance.quizQuestionCount} quiz/exercise questions total${improvementAreasInstruction}${lessOfAreasInstruction}${reflectionInstruction}`;

  // Build section-specific task1 template based on skill type
  const task1SectionsTemplate = params.customSections
    ? `/* Generate sections: ${params.customSections.task1.join(', ')} */`
    : getSectionTemplateForSkillType(params.skillType, params.dayNumber);

  // User prompt for regular (non-language) skills - CORE content only (no bossMilestone or intensivePractice)
  const userPrompt = `Day ${params.dayNumber}: "${params.dayTitle}" for skill "${params.skillName}"
Skill Type: ${params.skillType} | Level: ${params.skillLevel}

Generate CORE content only:
- foundationCards: [${levelGuidance.foundationCardCount} cards with id, concept, explanation, realWorldContext, microQuestion]
- task1: {id:"day${params.dayNumber}-task1", title:"Practice", estimatedMinutes:${Math.round(time.task1)}, format:"sections", passingScore:0.7, sections with ${levelGuidance.quizQuestionCount} questions total:[${task1SectionsTemplate}]}

ALWAYS INCLUDE:
- prePrompt: {text, primeQuestions[], yesterdayRecap}
- video: {watchPoints[], searchQuery}
- skipTest: {questionSets:[[3 hard MCQs]], passThreshold:3}`;

  return { staticPart, dynamicPart, userPrompt };
}

/**
 * Generate section template snippet for task1 based on skill type
 */
function getSectionTemplateForSkillType(skillType: SkillType, dayNumber: number): string {
  switch (skillType) {
    case SkillType.CODE:
    case SkillType.AI_AGENT:
      return `
        {type:"quiz", title:"Concept Check", questions:[{id:"q1", question:"...", options:["A","B","C","D"], correctIndex:0, explanation:"..."}]},
        {type:"outputPrediction", title:"Predict the Output", questions:[{id:"op1", code:"...", options:["output1","output2","output3","output4"], correctIndex:0, explanation:"..."}]},
        {type:"fillBlank", title:"Complete the Code", instructions:"Fill in the blanks", items:[{id:"fb1", sentence:"code with ___BLANK___", translation:"", blank:{correctAnswers:["answer"], hint:"hint"}}]}
      `;
    case SkillType.PHYSICAL:
      return `
        {type:"quiz", title:"Knowledge Check", questions:[{id:"q1", question:"...", options:["A","B","C","D"], correctIndex:0, explanation:"..."}]},
        {type:"reorder", title:"Order the Steps", instructions:"Put these steps in the correct order", items:[{id:"ro1", scrambled:["step2","step1","step3"], correctOrder:["step1","step2","step3"], translation:"Complete sequence", hint:"Think about the logical flow"}]},
        {type:"matching", title:"Match Terms", pairs:[{term:"Term 1", definition:"Definition 1"}]}
      `;
    case SkillType.DESIGN:
      return `
        {type:"quiz", title:"Design Principles", questions:[{id:"q1", question:"...", options:["A","B","C","D"], correctIndex:0, explanation:"..."}]},
        {type:"designCritique", title:"Design Critique", items:[{id:"dc1", description:"Design scenario", question:"What would improve this?", options:["Option A","Option B","Option C","Option D"], correctIndex:0, principle:"Design Principle", explanation:"..."}]},
        {type:"matching", title:"Match Concepts", pairs:[{term:"Concept 1", definition:"Definition 1"}]}
      `;
    case SkillType.KNOWLEDGE:
    default:
      // AI chooses: factual → quiz+matching+fillBlank, soft skills → quiz+fillBlank+openEnded
      return `
        {type:"quiz", title:"Concept Check", questions:[{id:"q1", question:"...", options:["A","B","C","D"], correctIndex:0, explanation:"..."}]},
        /* FOR FACTUAL TOPICS use: */ {type:"matching", title:"Match Terms", pairs:[{term:"Term 1", definition:"Definition 1"}]},
        {type:"fillBlank", title:"Fill in the Blanks", instructions:"Complete the sentences", items:[{id:"fb1", sentence:"Sentence with ___BLANK___", translation:"", blank:{correctAnswers:["answer"], hint:"hint"}}]}
        /* FOR SOFT SKILLS/LEADERSHIP use openEnded instead of matching: */ {type:"openEnded", title:"Apply Your Learning", questions:[{id:"oe1", question:"Scenario-based question...", prompt:"Describe how you would handle...", sampleAnswer:"A strong response would include...", evaluationCriteria:["Shows understanding", "Applies to real situation", "Demonstrates critical thinking"]}]}
      `;
  }
}
