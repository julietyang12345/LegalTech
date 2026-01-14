import { SkillLevel } from '../../../database/entities/session.entity';
import { SkillType, SkillComplexity } from '../services/skill-detector.service';

// Learner preferences from onboarding (optional - may not exist for users who skipped onboarding)
export interface LearnerPrefsForPrompt {
  originalGoal?: string;           // User's free-text goal from onboarding
  selectedDirection?: string;      // The direction they picked (more specific than skillName)
  directionKeywords?: string[];    // Keywords for the selected direction
  outputType?: 'working_code' | 'understand_concept' | 'fix_bug' | 'ship_project';
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

// Generate learner context guidance from onboarding preferences
function getLearnerContextGuidance(prefs?: LearnerPrefsForPrompt): string {
  if (!prefs) return '';

  const parts: string[] = [];

  // Original goal provides the most context
  if (prefs.originalGoal) {
    parts.push(`USER'S ORIGINAL GOAL: "${prefs.originalGoal}"`);
  }

  // Selected direction is more specific than skillName
  if (prefs.selectedDirection) {
    parts.push(`SPECIFIC FOCUS: "${prefs.selectedDirection}"`);
  }

  // Direction keywords help with search and content focus
  if (prefs.directionKeywords?.length) {
    parts.push(`KEY TOPICS: ${prefs.directionKeywords.join(', ')}`);
  }

  // Output type affects curriculum structure
  if (prefs.outputType) {
    const outputGuidance: Record<string, string> = {
      working_code: 'User wants WORKING CODE as output. Focus on practical implementation, real runnable examples.',
      understand_concept: 'User wants to UNDERSTAND CONCEPTS. Include more theory, explanations, and mental models.',
      fix_bug: 'User wants to FIX BUGS. Focus on debugging techniques, common issues, troubleshooting patterns.',
      ship_project: 'User wants to SHIP A PROJECT. Focus on end-to-end implementation, deployment, best practices.',
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
  const starterCode = dayNumber === 1
    ? '// Start your project here\\n\\n'
    : '// Code from previous days...\\n\\n// Today: Add your new code below\\n';

  return `"bossMilestone": {
    "day": ${dayNumber},
    "title": "Day ${dayNumber} Contribution",
    "description": "Build a piece of your boss project",
    "microTask": "What specific code to write today (5-15 lines)",
    "dayContribution": "How this helps the final project",
    "conceptConnection": "Which foundationCard concept this applies",
    "estimatedMinutes": ${estimatedMinutes},
    "starterCode": "${starterCode}",
    "expectedOutput": "What user should see when they run the code",
    "hints": [{"level": 1, "hint": ""}, {"level": 2, "hint": ""}, {"level": 3, "hint": ""}],
    "solution": "// COMPLETE working solution",
    "solutionAnnotations": ["Explanation of each key line"],
    "validationType": "run",
    "validationInstructions": "Run the code and verify the output"
  }`;
}

function getTierInstructions(userTier: string): string {
  switch (userTier) {
    case 'FREE':
      return `FREE TIER ACCESS:
- Video timestamps: Days 1-2 only
- Tasks: 1 hint + solution with annotations
- Practice Project: 1 hint + solution
- Boss Project (Day 1): Step-by-step guide
- Boss Project (Day 2+): Solution only
- Reflection: All questions, no AI feedback
- NO AI Tutor access`;

    case 'PRO':
      return `PRO TIER ACCESS ($15/mo):
- Video timestamps: All days + "Ask AI" (3 questions)
- Active Recall: AI reviews and grades explanation
- Tasks: Starter code + 3 progressive hints + AI Tutor
- Practice Project: Step-by-step + 3 hints + AI assistance
- Boss Project: Step-by-step for all days + 3 hints
- Reflection: AI analysis + personalized review plan
- AI Tutor: 20 messages/day`;

    case 'PREMIUM':
      return `PREMIUM TIER ACCESS ($39/mo):
- Everything in PRO, plus:
- UNLIMITED AI Tutor
- Adaptive difficulty on Tasks, Practice, Boss:
  * High confidence → Challenge mode (harder variations)
  * Medium confidence → Standard difficulty
  * Low confidence → Guided mode (more scaffolding)
- Code review on every submission
- Weakness tracking dashboard
- Career path integration`;

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
 * Decision factors:
 * 1. Skill type: KNOWLEDGE/PHYSICAL are always practice-based
 * 2. User's goal (outputType from questionnaire):
 *    - ship_project, working_code → project-based
 *    - understand_concept, fix_bug → practice-based
 * 3. Default: CODE/AI_AGENT/DESIGN without preference → project-based
 */
function usesProjectBasedLearning(
  skillType: SkillType,
  outputType?: 'working_code' | 'understand_concept' | 'fix_bug' | 'ship_project'
): boolean {
  // KNOWLEDGE and PHYSICAL are always practice-based (languages, theory, physical skills)
  if (skillType === SkillType.KNOWLEDGE || skillType === SkillType.PHYSICAL) {
    return false;
  }

  // If user specified their goal, use that
  if (outputType) {
    switch (outputType) {
      case 'ship_project':
      case 'working_code':
        return true;
      case 'understand_concept':
      case 'fix_bug':
        return false;
    }
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
  outputType?: 'working_code' | 'understand_concept' | 'fix_bug' | 'ship_project';
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

  const userPrompt = `{
  "day": ${params.dayNumber},
  "title": "${params.dayTitle}",
  "subtitle": "${params.skeleton?.subtitle || ''}",
  "skills": ${JSON.stringify(params.skeleton?.skills || params.dayObjectives)},
  "estimatedMinutes": ${time.totalMinutes},

  "prePrompt": {"text": "", "primeQuestions": [], "yesterdayRecap": ""},
  "video": {"watchPoints": []},

  "foundationCards": [
    {"id": "day${params.dayNumber}-card-1", "concept": "", "visual": "", "explanation": "", "realWorldContext": "", "microQuestion": {"question": "", "type": "gotit"}, "order": 1},
    {"id": "day${params.dayNumber}-card-2", "concept": "", "visual": "", "explanation": "", "realWorldContext": "", "codeExample": "", "microQuestion": {"question": "", "type": "understanding", "options": [], "correctIndex": 0, "explanation": ""}, "order": 2}
  ],

  ${getTask1Template(params.dayNumber, params.skillLevel, 5, task1Minutes)},

  ${getBossMilestoneTemplate(params.dayNumber, bossMilestoneMinutes)},

  ${time.practice > 0 ? `"practiceProject": {
    "id": "day${params.dayNumber}-practice",
    "title": "",
    "description": "",
    "estimatedMinutes": ${time.practice},
    "coreChallenge": "",
    "requirements": [],
    "hints": [],
    "solution": "",
    "stretchGoals": [],
    "tierResources": {"free": {"hints": 1, "solution": true}, "pro": {"hints": 3, "stepByStep": true, "aiTutor": true}, "premium": {"adaptiveDifficulty": {"high": "Challenge", "medium": "Standard", "low": "Guided"}}}
  },` : ''}

  "reflection": {
    "questions": [
      {"id": "confidence", "question": "Confidence 1-5?", "type": "scale"},
      {"id": "clicked", "question": "What clicked?", "type": "text"},
      {"id": "foggy", "question": "What's unclear?", "type": "text"},
      {"id": "connection", "question": "How does today connect to Day ${params.dayNumber - 1}?", "type": "text"}
    ]
  },

  "skipTest": {
    "questionSets": [[
      {"question": "Hard question 1?", "options": ["A", "B", "C", "D"], "correctIndex": 0},
      {"question": "Hard question 2?", "options": ["A", "B", "C", "D"], "correctIndex": 1},
      {"question": "Hard question 3?", "options": ["A", "B", "C", "D"], "correctIndex": 2}
    ]],
    "passThreshold": 3
  }
}`;

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
  const isProjectBased = usesProjectBasedLearning(params.skillType, params.outputType);
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
    ? '- bossMilestone = daily coding micro-step toward boss project (5-15 lines new code)\n'
    : '';

  const systemPrompt = `Generate CORE learning content for Day ${params.dayNumber} of "${params.skillName}".

${dayHeader}

${getSkillTypeGuidance(params.skillType, params.complexity)}

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
  const isProjectBased = usesProjectBasedLearning(params.skillType, params.outputType);
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
Challenging but achievable. Complete working solution required.

Output valid JSON only.`;

  const userPrompt = `Generate complete boss project:

{
  "day": ${params.bossDay},
  "title": "${params.bossTitle}",
  "description": "${params.bossDescription}",
  "combinesDays": ${JSON.stringify(params.combinesDays)},
  "estimatedMinutes": 75,

  "overview": {
    "whatYouBuild": "Clear description of final product",
    "whyItMatters": "Real-world relevance",
    "skillsIntegrated": [
      {"skill": "From Day 1", "howUsed": "How applied in project"},
      {"skill": "From Day 2", "howUsed": "How applied in project"}
    ]
  },

  "requirements": [
    {"requirement": "Functional req 1", "fromDay": 1, "concept": "Concept name"},
    {"requirement": "Functional req 2", "fromDay": 2, "concept": "Concept name"}
  ],

  "phases": [
    {"phase": 1, "title": "Setup", "minutes": 15, "objectives": ["Obj 1"], "deliverable": "What works"},
    {"phase": 2, "title": "Core Build", "minutes": 35, "objectives": ["Obj 1", "Obj 2"], "deliverable": "What works"},
    {"phase": 3, "title": "Polish", "minutes": 25, "objectives": ["Obj 1"], "deliverable": "Final product"}
  ],

  "starterCode": "// Comprehensive starter template with TODOs",

  "hints": [
    {"level": 1, "hint": "High-level approach", "phase": 1},
    {"level": 2, "hint": "Specific guidance", "phase": 2},
    {"level": 3, "hint": "Detailed approach", "phase": 2},
    {"level": 4, "hint": "Integration help", "phase": 3}
  ],

  "solution": "// COMPLETE working solution with detailed comments",

  "solutionWalkthrough": [
    {"step": 1, "description": "First...", "code": "snippet"},
    {"step": 2, "description": "Then...", "code": "snippet"}
  ],

  "tierResources": {
    "free": {
      "day1StepByStep": true,
      "otherDaysStepByStep": false,
      "hints": 1,
      "solution": true
    },
    "pro": {
      "allDaysStepByStep": true,
      "hints": 3,
      "aiTutor": true,
      "weaknessStrengthSummary": true
    },
    "premium": {
      "adaptiveDifficulty": {
        "high": "Challenge mode: Add [extra requirements]",
        "medium": "Standard: Complete as described",
        "low": "Guided: Detailed walkthrough with checkpoints"
      },
      "codeReview": true
    }
  },

  "evaluation": {
    "criteria": [
      {"criterion": "Core functionality", "points": 40, "checks": ["Check 1", "Check 2"]},
      {"criterion": "All concepts integrated", "points": 30, "checks": ["Uses Day 1", "Uses Day 2"]},
      {"criterion": "Code quality", "points": 20, "checks": ["Readable", "Organized"]},
      {"criterion": "Edge cases handled", "points": 10, "checks": ["Error handling"]}
    ],
    "passingScore": 70,
    "excellenceScore": 90
  },

  "commonMistakes": [
    {"mistake": "Common error 1", "fix": "How to fix"},
    {"mistake": "Common error 2", "fix": "How to fix"}
  ],

  "extensionIdeas": ["Bonus 1", "Bonus 2"]
}`;

  return { systemPrompt, userPrompt };
}
