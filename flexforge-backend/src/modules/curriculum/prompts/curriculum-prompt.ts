import { SkillLevel } from '../../../database/entities/session.entity';
import { SkillType, SkillComplexity } from '../services/skill-detector.service';
import { OutputType } from '../types/learner-prefs.interface';

// Learner preferences from onboarding (optional - may not exist for users who skipped onboarding)
export interface LearnerPrefsForPrompt {
  selectedDirection?: string;      // The direction they picked (more specific than skillName)
  selectedDirectionOutcome?: string; // "You'll be able to..." - specific deliverable
  directionKeywords?: string[];    // Keywords for the selected direction
  outputType?: OutputType;
  usageContext?: 'work' | 'personal' | 'interview' | 'school';
  contentDepth?: 'fast' | 'medium' | 'deep';
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

// Compact content strategy guidance for AI (token-optimized)
function getContentStrategyGuidance(): string {
  return `
CONTENT STRATEGY - decide per day:

contentLayer:
  foundation    = core CS concepts (algorithms, data structures, Big O)
  language_core = language syntax/features (Python, JS, TS basics)
  framework     = framework patterns (React, Next.js, Django)
  tool          = tools/platforms (APIs, IDEs, deployment)
  project       = building/integrating (end-to-end implementation)

videoStrategy:
  skip        = text is better (simple syntax only, NOT for algorithms/CS theory)
  optional    = video might help (language basics, simple patterns)
  helpful     = video aids understanding (framework patterns, visualizations)
  recommended = video is best (UI tools, algorithms, Big O, debugging)

contentSource:
  university = MIT/Stanford lectures (algorithms, data structures, CS theory, math)
  youtube    = tutorials (frameworks, tools, projects)
  text       = AI explanations (simple syntax when video=skip)
  docs       = official docs (language features, APIs)

transferability: high (universal) | medium (similar tools) | low (platform-specific)

For foundational CS topics (algorithms, data structures, Big O, recursion, trees, graphs, sorting) - ALWAYS use contentSource=university.
`;
}

// Topic relevance filter to prevent AI bloat/filler content
function getTopicRelevanceGuidance(): string {
  return `
TOPIC FILTER: Only include what blocks progress toward the goal. MEANS (tools/setup) → minimum to use. ENDS (goal itself) → full depth. No history, theory, or comparisons for things they just use.
`;
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

  if (parts.length === 0) return '';

  return `
LEARNER CONTEXT (from onboarding):
${parts.join('\n')}

IMPORTANT: Tailor day titles, examples, and tasks to match the user's specific goal and context above.
If user has a specific project goal, day titles should reference building toward that goal (e.g., "Day 1: Setting Up Your Bot" not "Day 1: Python Basics").
`;
}

// Helper to generate task1 JSON template (quiz or fillBlank)
function getTask1Template(dayNumber: number, skillLevel: string, questionCount: number, estimatedMinutes: number): string {
  const isQuiz = skillLevel === 'BEGINNER';
  const format = isQuiz ? 'quiz' : 'fillBlank';

  const questions = Array.from({ length: questionCount }, (_, i) =>
    `{"id": "q${i + 1}", "question": "", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": ""}`
  ).join(',\n      ');

  const items = Array.from({ length: questionCount }, (_, i) =>
    `{"id": "fb${i + 1}", "codeTemplate": "___BLANK___", "blanks": [{"id": "b1", "correctAnswers": [], "hint": ""}], "explanation": ""}`
  ).join(',\n      ');

  return `"taskFormat": "${format}",
  "task1": {
    "id": "day${dayNumber}-task1",
    "title": "Concept Check",
    "description": "Reinforce today's concepts",
    "estimatedMinutes": ${estimatedMinutes},
    "format": "${format}",
    "passingScore": 0.7,
    ${isQuiz ? `"questions": [\n      ${questions}\n    ]` : `"items": [\n      ${items}\n    ]`}
  }`;
}

// Helper to generate bossMilestone JSON template
function getBossMilestoneTemplate(dayNumber: number, estimatedMinutes: number): string {
  return `"bossMilestone": {
    "day": ${dayNumber},
    "title": "Day ${dayNumber} Contribution",
    "description": "Build a piece of your boss project",
    "microTask": "REQUIRED: Specific task description (5-15 lines of code)",
    "dayContribution": "How this helps the final project",
    "conceptConnection": "Which foundationCard concept this applies",
    "estimatedMinutes": ${estimatedMinutes},
    "starterCode": "REQUIRED: Generate 5-20 lines of ACTUAL starter code with TODOs marking where the user should add code. ${dayNumber === 1 ? 'Start fresh.' : 'Build on previous days - include relevant code from day ' + (dayNumber - 1) + '.'}",
    "expectedOutput": "What user should see when they run the code",
    "hints": [{"level": 1, "hint": "REQUIRED: Gentle conceptual hint"}, {"level": 2, "hint": "REQUIRED: More specific approach"}, {"level": 3, "hint": "REQUIRED: Detailed guidance"}],
    "solution": "REQUIRED: Generate the COMPLETE working solution code (15-40 lines). This must be real, runnable code that solves the microTask.",
    "solutionAnnotations": ["REQUIRED: 2-4 explanations of key lines in the solution"],
    "validationType": "run",
    "validationInstructions": "Run the code and verify the output"
  }`;
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

// Helper to build common day header for all day detail prompts
function getDayHeader(params: {
  dayTitle: string;
  skeleton?: any;
  dayObjectives?: string[];
  previousDayTitle?: string;
  skillType: SkillType;
  hoursPerDay: number;
  suggestedLanguage?: string;
  userTier?: string;
  includeMode?: boolean;
  includePrevious?: boolean;
}): string {
  const time = getTimeStructure(params.hoursPerDay);
  const skills = params.skeleton?.skills?.join(', ') || params.dayObjectives?.join(', ') || '';
  const lines = [
    `DAY: ${params.dayTitle}`,
    `SKILLS: ${skills}`,
  ];
  if (params.includePrevious !== false) {
    lines.push(`PREVIOUS: ${params.previousDayTitle || 'N/A'}`);
  }
  lines.push(`TYPE: ${params.skillType}${params.includeMode ? ` | MODE: ${time.mode} (${time.totalMinutes} min)` : ` | ${time.totalMinutes} min/day`}`);
  if (params.userTier) {
    lines.push(`TIER: ${params.userTier}`);
  }
  if (params.suggestedLanguage) {
    lines.push(`LANGUAGE: ${params.suggestedLanguage}`);
  }
  return lines.join('\n');
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
 * PRIMARY PROMPT: Generates SKELETON for ALL days
 * Day content is generated on-demand via buildDayDetailPrompt
 * Automatically includes learner context when learnerPrefs is provided
 *
 * Project-based skills (CODE, AI_AGENT, DESIGN):
 * - Boss project spans entire session
 * - Every day contributes a micro-step to the boss project
 * - Final day is the "Boss Day" where the complete project is assembled
 *
 * Practice-based skills (KNOWLEDGE, PHYSICAL):
 * - No boss projects, each day has standalone practice projects
 * - Better for language learning, theory, physical skills
 */
export function buildCurriculumPrompt(params: CurriculumPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const time = getTimeStructure(params.hoursPerDay);
  const learnerContext = getLearnerContextGuidance(params.learnerPrefs);
  const isProjectBased = usesProjectBasedLearning(params.skillType, params.learnerPrefs?.outputType);
  const allDays = Array.from({ length: params.durationDays }, (_, i) => i + 1);
  const bossDay = params.durationDays;

  const projectBasedInstructions = `IMPORTANT - PROJECT-BASED STRUCTURE:
- ONE boss project spans the ENTIRE ${params.durationDays}-day session
- EVERY day includes a bossMilestonePreview (what code they'll build that day)
- Final day (Day ${params.durationDays}) is "Boss Day" - complete project assembly
- Daily flow: Video → Cards → Quiz/FillBlank → Boss Micro-Step → Reflection`;

  const practiceBasedInstructions = `IMPORTANT - PRACTICE-BASED STRUCTURE:
- Each day is self-contained with standalone practice exercises
- No multi-day projects - focus on mastering daily concepts
- Daily flow: Video → Cards → Quiz/FillBlank → Practice Project → Reflection`;

  const systemPrompt = `Generate ${params.durationDays}-day curriculum skeleton for "${params.skillName}".
Type: ${params.skillType} | Level: ${params.skillLevel} | ${time.totalMinutes}min/day (${time.mode})
${params.suggestedLanguage ? `Language: ${params.suggestedLanguage}` : ''}

${isProjectBased ? projectBasedInstructions : practiceBasedInstructions}

${learnerContext}
${getSkillTypeGuidance(params.skillType, params.complexity, params.safetyLevel)}

${getContentStrategyGuidance()}

${getTopicRelevanceGuidance()}

Per day: day, title, subtitle, skills[], teaser, estimatedMinutes, ${isProjectBased ? 'hasBossProject (true for all), bossMilestonePreview,' : ''} contentLayer, videoStrategy, transferability, contentSource, skipTest.

Output valid JSON only.`;

  const dayTemplate = isProjectBased ? `{
      "day": 1,
      "title": "Day 1: [Topic]",
      "subtitle": "Tagline",
      "skills": ["Skill 1", "Skill 2"],
      "teaser": "What they'll learn",
      "estimatedMinutes": ${time.totalMinutes},
      "hasBossProject": true,
      "bossMilestonePreview": "What code they'll add to the boss project today",
      "contentLayer": "",
      "videoStrategy": "",
      "transferability": "",
      "contentSource": "",
      "skipTest": {
        "description": "Prove mastery to skip this day",
        "questionSets": [[
          {"question": "MCQ testing concept?", "options": ["Wrong", "Wrong", "Correct", "Wrong"], "correctIndex": 2},
          {"question": "Another MCQ?", "options": ["Correct", "Wrong", "Wrong", "Wrong"], "correctIndex": 0},
          {"question": "Third MCQ?", "options": ["Wrong", "Correct", "Wrong", "Wrong"], "correctIndex": 1}
        ]],
        "passThreshold": 2
      }
    }` : `{
      "day": 1,
      "title": "Day 1: [Topic]",
      "subtitle": "Tagline",
      "skills": ["Skill 1", "Skill 2"],
      "teaser": "What they'll learn",
      "estimatedMinutes": ${time.totalMinutes},
      "contentLayer": "",
      "videoStrategy": "",
      "transferability": "",
      "contentSource": "",
      "skipTest": {
        "description": "Prove mastery to skip this day",
        "questionSets": [[
          {"question": "MCQ testing concept?", "options": ["Wrong", "Wrong", "Correct", "Wrong"], "correctIndex": 2},
          {"question": "Another MCQ?", "options": ["Correct", "Wrong", "Wrong", "Wrong"], "correctIndex": 0},
          {"question": "Third MCQ?", "options": ["Wrong", "Correct", "Wrong", "Wrong"], "correctIndex": 1}
        ]],
        "passThreshold": 2
      }
    }`;

  const bossProjectsSection = isProjectBased ? `"bossProjects": [{
    "day": ${bossDay},
    "title": "Boss Project: [Name]",
    "description": "Complete project built across all ${params.durationDays} days",
    "combinesDays": [${allDays.join(', ')}],
    "estimatedMinutes": 75,
    "teaser": "Final assembly and polish of your working project"
  }],` : `"bossProjects": [],`;

  const userPrompt = `{
  "title": "Curriculum title",
  "description": "What student will master",
  "finalProject": "${isProjectBased ? `Capstone project built across all ${params.durationDays} days` : 'Mastery of all daily concepts and exercises'}",
  "skillType": "${params.skillType}",
  "days": [
    ${dayTemplate}
  ],
  ${bossProjectsSection}
  "metadata": {"recommendedTools": [], "prerequisites": ${JSON.stringify(params.prerequisiteSkills || [])}, "safetyLevel": "${params.safetyLevel || 'low'}", "isProjectBased": ${isProjectBased}${params.learnerPrefs?.outputType ? `, "outputType": "${params.learnerPrefs.outputType}"` : ''}}
}

Generate ALL ${params.durationDays} days. ${isProjectBased ? 'hasBossProject=true for ALL days (each day contributes to the boss project). Include bossMilestonePreview for each day showing what code they\'ll build.' : 'Each day should have self-contained learning objectives.'}`;

  return { systemPrompt, userPrompt };
}

// Alias for backward compatibility (buildPreviewPrompt removed - use buildCurriculumPrompt)
export const buildOverviewPrompt = buildCurriculumPrompt;

/**
 * DAY DETAIL PROMPT: Generates full content for a specific day (Day 2+)
 * Called when student unlocks and starts a new day
 */
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
  };
}

export function buildDayDetailPrompt(params: DayDetailParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const time = getTimeStructure(params.hoursPerDay);
  const dayHeader = getDayHeader({
    dayTitle: params.dayTitle,
    skeleton: params.skeleton,
    dayObjectives: params.dayObjectives,
    previousDayTitle: params.previousDayTitle,
    skillType: params.skillType,
    hoursPerDay: params.hoursPerDay,
    suggestedLanguage: params.suggestedLanguage,
    userTier: params.userTier,
    includeMode: true,
  });

  // Task formats: Quiz or FillBlank for concept reinforcement (code moved to bossMilestone)
  const taskFormatGuidance = `
TASK FORMATS (choose one for task1.format - concept reinforcement only):
- "quiz": passingScore, questions[{question, options[4], correctIndex, explanation}] - 5-8 MCQs
- "fillBlank": passingScore, items[{codeTemplate with ___BLANK___, blanks[{correctAnswers[], hint}], explanation}]
Recommended: ${params.skillLevel === 'BEGINNER' ? '"quiz" for conceptual understanding' : '"fillBlank" for code patterns'}

BOSS MILESTONE (daily coding micro-step):
- bossMilestone builds toward the boss project - small daily contribution (5-15 lines)
- Each day adds working code that connects to today's foundationCards concepts
- Validation: user runs code and sees output (validationType: "run")`;

  const systemPrompt = `Generate COMPLETE learning content for Day ${params.dayNumber} of "${params.skillName}".

${dayHeader}

${getSkillTypeGuidance(params.skillType, params.complexity)}

${getTierInstructions(params.userTier)}

REQUIREMENTS:
1. Connect to previous day's concept (spaced repetition)
2. Generate 6-10 foundationCards (REQUIRED)
3. task1 = quiz OR fillBlank for CONCEPT REINFORCEMENT (not coding)
4. bossMilestone = CODING practice (daily micro-step toward boss project)
   - Starter code builds on previous days (cumulative)
   - Small task (5-15 lines of new code)
   - User validates by running and seeing output
${taskFormatGuidance}

FOUNDATION CARDS (6-10 cards):
${params.dayNumber === 1 ? `Card 1: INTRO - "Today we'll learn [X]..."` : `Card 1: RECAP - "Yesterday: [X]. Today builds on..."`}
Cards 2-7: Core concepts, patterns, gotchas. Each card needs realWorldContext (1 sentence: where/why used).
MicroQuestion types: "gotit" (intro/recap), "understanding" (MCQ for concepts).

Output valid JSON only.`;

  const task1Minutes = Math.round(time.task1 * 0.4);
  const bossMilestoneMinutes = Math.round(time.task1 * 0.6);

  // Minimal template - AI generates all content
  const skills = JSON.stringify(params.skeleton?.skills || params.dayObjectives);
  const taskFormat = params.skillLevel === 'BEGINNER' ? 'quiz' : 'fillBlank';

  const userPrompt = `Day ${params.dayNumber}: "${params.dayTitle}"
Skills: ${skills}
Minutes: ${time.totalMinutes}

Generate JSON with:
- prePrompt: {text, primeQuestions[], yesterdayRecap}
- video: {watchPoints[]}
- foundationCards: 6-10 cards, each with {id, concept, visual, explanation, realWorldContext, microQuestion{question, type}, order}
- task1: {format:"${taskFormat}", passingScore:70, ${taskFormat === 'quiz' ? 'questions[5 MCQs with explanation]' : 'items[5 fillBlank with blanks[], explanation]'}}
- bossMilestone: {title, microTask, starterCode(10-25 lines REAL code), expectedOutput, hints[3 levels], solution(15-40 lines COMPLETE code), solutionAnnotations[], validationType:"run"}
${time.practice > 0 ? `- practiceProject: {title, description, estimatedMinutes:${time.practice}, coreChallenge, requirements[], hints[], solution}` : ''}
- reflection: {questions[confidence(scale), clicked(text), foggy(text), connection(text)]}
- skipTest: {questionSets[[3 hard MCQs]], passThreshold:3}`;

  return { systemPrompt, userPrompt };
}

/**
 * DAY DETAIL CORE PROMPT: Fast essential content only
 * Generates: prePrompt, video, foundationCards (5-6), task1 (quiz/fillBlank), bossMilestone (project-based only), skipTest
 * Called first for quick initial load
 *
 * Project-based skills include bossMilestone (daily coding toward boss project)
 * Practice-based skills skip bossMilestone (use practice projects in deferred instead)
 */
export function buildDayDetailCorePrompt(params: DayDetailParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const time = getTimeStructure(params.hoursPerDay);
  // Use stored isProjectBased from metadata, fall back to calculation if not provided
  const isProjectBased = params.isProjectBased ?? usesProjectBasedLearning(params.skillType, params.outputType);
  const dayHeader = getDayHeader({
    dayTitle: params.dayTitle,
    skeleton: params.skeleton,
    dayObjectives: params.dayObjectives,
    previousDayTitle: params.previousDayTitle,
    skillType: params.skillType,
    hoursPerDay: params.hoursPerDay,
    suggestedLanguage: params.suggestedLanguage,
  });

  const task1Minutes = isProjectBased ? Math.round(time.task1 * 0.4) : time.task1;
  const bossMilestoneMinutes = Math.round(time.task1 * 0.6);

  const coreItems = isProjectBased
    ? 'prePrompt, video info, foundationCards (5-6 cards), task1 (quiz or fillBlank), bossMilestone, skipTest'
    : 'prePrompt, video info, foundationCards (5-6 cards), task1 (quiz or fillBlank), skipTest';

  const bossInstructions = isProjectBased
    ? `- bossMilestone = daily coding micro-step toward boss project
  - starterCode: MUST be real code (10-25 lines) with TODOs marking where user adds code
  - solution: MUST be complete working code (15-40 lines) that solves the microTask
  - hints: 3 progressive hints (conceptual → specific → detailed)
  - solutionAnnotations: 2-4 explanations of key lines
`
    : '';

  // Build personalized prePrompt instructions based on previous day's reflection
  let reflectionContext = '';
  if (params.previousDayReflection?.confusedConcepts?.length) {
    reflectionContext = `
IMPORTANT - Previous Day Reflection:
The student found these concepts confusing yesterday: ${params.previousDayReflection.confusedConcepts.join(', ')}
${params.previousDayReflection.boostCompleted ? 'They completed a quick boost to review.' : ''}
In the prePrompt.yesterdayRecap, briefly reconnect to these concepts and show how today's material builds on or clarifies them.
`;
  }

  const systemPrompt = `Generate CORE learning content for Day ${params.dayNumber} of "${params.skillName}".

${dayHeader}

${getSkillTypeGuidance(params.skillType, params.complexity)}
${reflectionContext}
Generate ONLY: ${coreItems}.
- task1 = concept reinforcement (quiz or fillBlank ONLY, no coding)
${bossInstructions}skipTest: 3 hard MCQs testing day's concepts - user can skip day if they pass.

Output valid JSON only.`;

  const bossMilestoneSection = isProjectBased
    ? `${getBossMilestoneTemplate(params.dayNumber, bossMilestoneMinutes)},`
    : '';

  const userPrompt = `{
  "day": ${params.dayNumber},
  "title": "${params.dayTitle}",
  "subtitle": "${params.skeleton?.subtitle || ''}",
  "skills": ${JSON.stringify(params.skeleton?.skills || params.dayObjectives)},

  "prePrompt": {"text": "Brief intro connecting to previous learning", "primeQuestions": ["Q1?", "Q2?"], "yesterdayRecap": "${params.previousDayTitle ? 'Yesterday: ' + params.previousDayTitle : ''}"},
  "video": {"watchPoints": ["Point 1", "Point 2"]},

  "foundationCards": [
    {"id": "day${params.dayNumber}-card-1", "concept": "", "visual": "", "explanation": "", "realWorldContext": "", "microQuestion": {"question": "", "type": "gotit"}, "order": 1},
    {"id": "day${params.dayNumber}-card-2", "concept": "", "visual": "", "explanation": "", "realWorldContext": "", "codeExample": "", "microQuestion": {"question": "", "type": "understanding", "options": [], "correctIndex": 0, "explanation": ""}, "order": 2}
  ],

  ${getTask1Template(params.dayNumber, params.skillLevel, 3, task1Minutes)},

  ${bossMilestoneSection}

  "skipTest": {
    "questionSets": [[
      {"question": "Hard question 1 testing day's concept?", "options": ["A", "B", "C", "D"], "correctIndex": 0},
      {"question": "Hard question 2 testing day's concept?", "options": ["A", "B", "C", "D"], "correctIndex": 1},
      {"question": "Hard question 3 testing day's concept?", "options": ["A", "B", "C", "D"], "correctIndex": 2}
    ]],
    "passThreshold": 3
  }
}`;

  return { systemPrompt, userPrompt };
}

/**
 * DAY DETAIL DEFERRED PROMPT: Secondary content loaded in background
 * Generates: practiceProject (only for practice-based skills), reflection
 * Called after core loads, while user watches video
 *
 * Practice projects are only generated for practice-based skills (KNOWLEDGE, PHYSICAL)
 * Project-based skills (CODE, AI_AGENT, DESIGN) use boss projects instead
 */
export function buildDayDetailDeferredPrompt(params: DayDetailParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const time = getTimeStructure(params.hoursPerDay);
  const dayHeader = getDayHeader({
    dayTitle: params.dayTitle,
    skeleton: params.skeleton,
    dayObjectives: params.dayObjectives,
    skillType: params.skillType,
    hoursPerDay: params.hoursPerDay,
    suggestedLanguage: params.suggestedLanguage,
    includePrevious: false,
  });

  // Only include practice project for practice-based skills (no boss projects)
  // Use stored isProjectBased from metadata, fall back to calculation if not provided
  const isProjectBased = params.isProjectBased ?? usesProjectBasedLearning(params.skillType, params.outputType);
  const hasPractice = !isProjectBased && time.practice > 0;

  const systemPrompt = `Generate DEFERRED learning content for Day ${params.dayNumber} of "${params.skillName}".

${dayHeader}

Generate ONLY: ${hasPractice ? 'practiceProject, ' : ''}reflection.
${hasPractice ? 'Provide COMPLETE working solutions.' : ''}

Output valid JSON only.`;

  const userPrompt = `{
  "day": ${params.dayNumber},
  ${hasPractice ? `"practiceProject": {
    "id": "day${params.dayNumber}-practice",
    "title": "",
    "description": "",
    "estimatedMinutes": ${time.practice},
    "coreChallenge": "",
    "requirements": [],
    "hints": [],
    "solution": ""
  },` : ''}

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

CONTENT STRATEGY (per day):
contentLayer: foundation|language_core|framework|tool|project
videoStrategy: skip|optional|helpful|recommended
contentSource: university|youtube|text|docs
transferability: high|medium|low

RULES:
- foundation = core CS (algorithms, Big O) → contentSource=university
- skip video only for simple syntax, never for algorithms/theory
- Each day: title, subtitle, skills[], teaser, estimatedMinutes, contentLayer, videoStrategy, transferability, contentSource, skipTest

TOPIC FILTER: Only include what blocks progress. MEANS→minimum. ENDS→full depth.

CODE ENVIRONMENT:
Browser-safe: json, csv, re, math, datetime, collections, itertools, pandas, numpy, beautifulsoup4
Needs local: requests, selenium, playwright, psycopg2, flask, django, fastapi
→ If using local-only modules, provide fixture data as fallback

AVOID: scraping amazon/google/twitter/linkedin, Docker in Days 1-7, live APIs without fixtures
→ Use mock data or SQLite instead

skipTest format: {questionSets: [[{question, options[4], correctIndex}]], passThreshold: 2}

Output valid JSON only.`;

/**
 * Static instructions for day detail generation - cacheable
 */
const DAY_DETAIL_STATIC_INSTRUCTIONS = `You generate day learning content.

TASK FORMATS (task1 - concept reinforcement):
- quiz: {passingScore, questions[{question, options[4], correctIndex, explanation}]} - 5-8 MCQs
- fillBlank: {passingScore, items[{codeTemplate with ___BLANK___, blanks[{correctAnswers[], hint}]}]}

BOSS MILESTONE (for project-based skills) - CRITICAL REQUIREMENTS:
- Daily coding micro-step (5-15 lines new code)
- starterCode: MUST be 10-25 lines of REAL, RUNNABLE code with TODO comments marking where user adds code
- solution: MUST be 15-40 lines of COMPLETE, WORKING code that solves the microTask (NOT a placeholder!)
- solutionAnnotations: 2-4 strings explaining key lines in the solution
- hints: 3 progressive hints (level 1: conceptual, level 2: specific approach, level 3: detailed guidance)
- DO NOT use placeholder text like "// COMPLETE working solution" - generate ACTUAL code
- Validation: user runs code, sees output

FOUNDATION CARDS (5-6):
- Card 1: INTRO/RECAP connecting to previous
- Cards 2-5: Core concepts with realWorldContext
- microQuestion types: gotit, understanding (MCQ)

CODE EXERCISES:
- Browser-safe: json, csv, re, math, pandas, numpy, beautifulsoup4
- Needs local: requests, selenium, flask, django → provide fixture fallback
- Include error handling, use mock data for external APIs
- Add note "For production: use backend/local" when needed

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

  // Static part - cacheable across all users
  const staticPart = CURRICULUM_STATIC_INSTRUCTIONS;

  // Dynamic part - user-specific context
  const dynamicPart = `Generate ${params.durationDays}-day curriculum for "${params.skillName}".
Type: ${params.skillType} | Level: ${params.skillLevel} | ${time.totalMinutes}min/day
${params.suggestedLanguage ? `Lang: ${params.suggestedLanguage}` : ''}
${isProjectBased ? 'PROJECT-BASED: Boss project spans all days. Include hasBossProject:true, bossMilestonePreview per day.' : 'PRACTICE-BASED: Standalone daily exercises.'}
${params.learnerPrefs?.selectedDirectionOutcome ? `Target: "${params.learnerPrefs.selectedDirectionOutcome}"` : ''}
${params.learnerPrefs?.outputType ? `Output: ${params.learnerPrefs.outputType}` : ''}`;

  // Minimal template - AI fills in values, no empty strings
  const dayNums = Array.from({ length: params.durationDays }, (_, i) => i + 1);
  const userPrompt = `Generate ${params.durationDays} days. Each day needs: day, title, subtitle, skills[], teaser, estimatedMinutes:${time.totalMinutes}${isProjectBased ? ', hasBossProject:true, bossMilestonePreview' : ''}, contentLayer, videoStrategy, transferability, contentSource, skipTest{questionSets[[3 MCQs]], passThreshold:2}.
${isProjectBased ? `bossProjects:[{day:${params.durationDays}, combinesDays:[${dayNums.join(',')}], estimatedMinutes:75}]` : 'bossProjects:[]'}
metadata:{isProjectBased:${isProjectBased}}`;

  return { staticPart, dynamicPart, userPrompt };
}

/**
 * Cacheable day detail core prompt
 */
export function buildCacheableDayDetailCorePrompt(params: DayDetailParams): {
  staticPart: string;
  dynamicPart: string;
  userPrompt: string;
} {
  const time = getTimeStructure(params.hoursPerDay);
  // Use stored isProjectBased from metadata, fall back to calculation if not provided
  const isProjectBased = params.isProjectBased ?? usesProjectBasedLearning(params.skillType, params.outputType);

  // Static part - cacheable
  const staticPart = DAY_DETAIL_STATIC_INSTRUCTIONS;

  // Dynamic part - day-specific
  const dynamicPart = `Day ${params.dayNumber} of "${params.skillName}" (${params.skillType})
Title: ${params.dayTitle}
${params.previousDayTitle ? `Previous: ${params.previousDayTitle}` : ''}
${params.suggestedLanguage ? `Lang: ${params.suggestedLanguage}` : ''}
${isProjectBased ? 'Include bossMilestone with REAL starterCode (10-25 lines) and COMPLETE solution code (15-40 lines).' : 'No bossMilestone (practice-based).'}
Generate: prePrompt, video, foundationCards(5-6), task1, ${isProjectBased ? 'bossMilestone, ' : ''}skipTest.`;

  // Minimal template - AI generates content, no empty placeholders
  const userPrompt = `Day ${params.dayNumber}: "${params.dayTitle}"
Generate: prePrompt{text, primeQuestions[], yesterdayRecap}, video{watchPoints[]}, foundationCards[5-6 with id, concept, explanation, realWorldContext, microQuestion], task1{format:quiz/fillBlank, passingScore:80, questions[]}${isProjectBased ? ', bossMilestone{title, microTask, starterCode(10-25 lines REAL code with TODOs), expectedOutput, hints[3 levels], solution(15-40 lines COMPLETE working code), solutionAnnotations[], validationType:run}' : ''}, skipTest{questionSets[[3 hard MCQs]], passThreshold:3}`;

  return { staticPart, dynamicPart, userPrompt };
}
