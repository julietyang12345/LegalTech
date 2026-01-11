import { SkillLevel } from '../../../database/entities/session.entity';
import { SkillType, SkillComplexity } from '../services/skill-detector.service';

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
// NOTE: Video slot is now OPTIONAL - AI decides if video is needed per day
function getTimeStructure(hoursPerDay: number): {
  totalMinutes: number;
  mode: string;
  maxVideo: number;          // Max video time IF video is used (0 = no video)
  recall: number;
  check: number;
  task1: number;
  task2: number;
  practice: number;
  reflect: number;
  structure: string;
  structureNoVideo: string;  // Alternative structure when no video
} {
  const total = Math.round(hoursPerDay * 60);

  if (total <= 30) {
    return {
      totalMinutes: total, mode: 'Quick',
      maxVideo: 5, recall: 5, check: 0, task1: 15, task2: 0, practice: 0, reflect: 3,
      structure: 'PrePrompt(30s) → Video(5m) → ActiveRecall(5m) → Task(15m) → Reflect(3m)',
      structureNoVideo: 'PrePrompt(30s) → Explanation(5m) → ActiveRecall(5m) → Task(15m) → Reflect(3m)'
    };
  } else if (total <= 45) {
    return {
      totalMinutes: total, mode: 'Standard',
      maxVideo: 6, recall: 6, check: 4, task1: 12, task2: 0, practice: 12, reflect: 4,
      structure: 'PrePrompt(30s) → Video(6m) → ActiveRecall(6m) → ConceptCheck(4m) → Task(12m) → Practice(12m) → Reflect(4m)',
      structureNoVideo: 'PrePrompt(30s) → Explanation(6m) → ActiveRecall(6m) → ConceptCheck(4m) → Task(12m) → Practice(12m) → Reflect(4m)'
    };
  } else if (total <= 60) {
    return {
      totalMinutes: total, mode: 'Focused',
      maxVideo: 7, recall: 8, check: 5, task1: 15, task2: 0, practice: 18, reflect: 5,
      structure: 'PrePrompt(1m) → Video(7m) → ActiveRecall(8m) → ConceptCheck(5m) → Task(15m) → Practice(18m) → Reflect(5m)',
      structureNoVideo: 'PrePrompt(1m) → Explanation(7m) → ActiveRecall(8m) → ConceptCheck(5m) → Task(15m) → Practice(18m) → Reflect(5m)'
    };
  }
  // Deep Dive: 90+ min - includes Task 2
  return {
    totalMinutes: total, mode: 'DeepDive',
    maxVideo: 10, recall: 12, check: 8, task1: 15, task2: 15, practice: 25, reflect: 8,
    structure: 'PrePrompt(2m) → Video(10m) → ActiveRecall(12m) → ConceptCheck(8m) → Task1(15m) → Task2(15m) → Practice(25m) → Reflect(8m)',
    structureNoVideo: 'PrePrompt(2m) → Explanation(10m) → ActiveRecall(12m) → ConceptCheck(8m) → Task1(15m) → Task2(15m) → Practice(25m) → Reflect(8m)'
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

function getBossProjectDays(totalDays: number): number[] {
  if (totalDays <= 3) return [totalDays];
  if (totalDays === 4) return [4];
  const days: number[] = [];
  let current = 4;
  while (current < totalDays) {
    days.push(current);
    current += 4;
  }
  if (!days.includes(totalDays)) days.push(totalDays);
  return days;
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
 * PRIMARY PROMPT: Generates SKELETON for ALL days (including Day 1)
 * Day content is generated on-demand when user clicks "Start Learning" via buildDayDetailPrompt
 * Optimized for token efficiency - full content generated only when needed
 */
export function buildCurriculumPrompt(params: CurriculumPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const time = getTimeStructure(params.hoursPerDay);
  const bossDays = getBossProjectDays(params.durationDays);

  const systemPrompt = `Generate ${params.durationDays}-day curriculum skeleton for "${params.skillName}".
Type: ${params.skillType} | Level: ${params.skillLevel} | ${time.totalMinutes}min/day (${time.mode})
${params.suggestedLanguage ? `Language: ${params.suggestedLanguage}` : ''}
Boss project days: ${bossDays.join(', ')}

${getSkillTypeGuidance(params.skillType, params.complexity, params.safetyLevel)}

${getContentStrategyGuidance()}

${getTopicRelevanceGuidance()}

Per day include: day, title, subtitle, skills[], teaser, estimatedMinutes, hasBossProject, skipTest, contentLayer, videoStrategy, transferability, contentSource.

Output valid JSON only.`;

  const userPrompt = `{
  "title": "Curriculum title",
  "description": "What student will master",
  "finalProject": "Capstone project",
  "skillType": "${params.skillType}",
  "days": [
    {
      "day": 1,
      "title": "Day 1: [Topic]",
      "subtitle": "Tagline",
      "skills": ["Skill 1", "Skill 2"],
      "teaser": "What they'll learn",
      "estimatedMinutes": ${time.totalMinutes},
      "hasBossProject": false,
      "contentLayer": "",
      "videoStrategy": "",
      "transferability": "",
      "contentSource": "",
      "skipTest": {
        "description": "Prove mastery to skip",
        "questions": [
          {"question": "Q1?", "answer": "A1"},
          {"question": "Q2?", "answer": "A2"},
          {"question": "Q3?", "answer": "A3"}
        ],
        "passThreshold": 2
      }
    }
  ],
  "bossProjects": [{"day": ${bossDays[0]}, "title": "Boss Project: Name", "description": "Combines days 1-${Math.min(bossDays[0], params.durationDays)}", "combinesDays": [${Array.from({ length: Math.min(bossDays[0], 4) }, (_, i) => i + 1).join(', ')}], "estimatedMinutes": 75, "teaser": ""}],
  "metadata": {"recommendedTools": [], "prerequisites": ${JSON.stringify(params.prerequisiteSkills || [])}, "safetyLevel": "${params.safetyLevel || 'low'}"}
}

Generate ALL ${params.durationDays} days. hasBossProject=true for days: ${bossDays.join(', ')}.`;

  return { systemPrompt, userPrompt };
}

// Alias for backward compatibility
export const buildOverviewPrompt = buildCurriculumPrompt;

/**
 * PREVIEW PROMPT: Minimal skeleton for quick preview
 */
export function buildPreviewPrompt(params: CurriculumPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const time = getTimeStructure(params.hoursPerDay);
  const bossDays = getBossProjectDays(params.durationDays);

  const systemPrompt = `Generate ${params.durationDays}-day curriculum skeleton for "${params.skillName}".
Type: ${params.skillType} | Level: ${params.skillLevel} | ${time.totalMinutes}min/day
Boss project days: ${bossDays.join(', ')}

Per day: day, title, subtitle, skills[], teaser, estimatedMinutes, hasBossProject, contentLayer, videoStrategy, transferability, contentSource.

${getContentStrategyGuidance()}

${getTopicRelevanceGuidance()}
Output valid JSON only.`;

  const userPrompt = `{
  "title": "Curriculum title",
  "description": "What student will master",
  "finalProject": "Capstone description",
  "skillType": "${params.skillType}",
  "days": [{"day":1,"title":"Day 1: Topic","subtitle":"","skills":[],"teaser":"","estimatedMinutes":${time.totalMinutes},"hasBossProject":false,"contentLayer":"","videoStrategy":"","transferability":"","contentSource":""}],
  "metadata": {"skillName":"${params.skillName}","durationDays":${params.durationDays},"hoursPerDay":${params.hoursPerDay},"skillLevel":"${params.skillLevel}","suggestedLanguage":"${params.suggestedLanguage || ''}"}
}

Generate ALL ${params.durationDays} days. hasBossProject=true for days: ${bossDays.join(', ')}.`;

  return { systemPrompt, userPrompt };
}

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
}

export function buildDayDetailPrompt(params: DayDetailParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const time = getTimeStructure(params.hoursPerDay);

  const systemPrompt = `Generate COMPLETE learning content for Day ${params.dayNumber} of "${params.skillName}".

DAY: ${params.dayTitle}
SKILLS: ${params.skeleton?.skills?.join(', ') || params.dayObjectives?.join(', ')}
PREVIOUS DAY: ${params.previousDayTitle || 'N/A (early curriculum)'}
TYPE: ${params.skillType} | MODE: ${time.mode} (${time.totalMinutes} min)
TIER: ${params.userTier}
${params.suggestedLanguage ? `LANGUAGE: ${params.suggestedLanguage}` : ''}

${getSkillTypeGuidance(params.skillType, params.complexity)}

${getTierInstructions(params.userTier)}

REQUIREMENTS:
1. Connect to previous day's concept (spaced repetition)
2. Provide COMPLETE working solutions (not pseudocode)
3. Include 3 levels of hints (gentle → specific → approach)
4. Include stuck detection triggers
5. ALWAYS generate foundationCards (6-10 cards) - this is REQUIRED for all days
6. Choose appropriate TASK FORMAT based on learner level (see below)

TASK FORMAT SELECTION (taskFormat field):
Choose ONE format for task1 based on learner needs:

- "code": Full coding challenge with editor, hints, solution
  → Default for INTERMEDIATE/ADVANCED levels
  → Use when practicing implementation skills

- "quiz": Multiple choice questions (5-8 questions)
  → Best for: BEGINNERS, knowledge validation, concept understanding
  → Use when testing comprehension, not implementation
  → Each question needs: question, 4 options, correctIndex, explanation

- "fillBlank": Fill-in-the-blank code completion (5-8 items)
  → Best for: BEGINNERS learning syntax, pattern recognition
  → Use for: variable names, function calls, operators, keywords
  → Code template uses ___BLANK___ markers for blanks
  → Each blank can have multiple correct answers

LEVEL: ${params.skillLevel}
FORMAT GUIDELINES for ${params.skillLevel}:
${params.skillLevel === 'BEGINNER' ? `- Day 1-2: Prefer "quiz" (ease into learning)
- Days 3+: Mix "fillBlank" (60%) and "quiz" (30%), "code" (10%)
- Focus on understanding before implementation` : params.skillLevel === 'INTERMEDIATE' ? `- Prefer "code" (70%) with occasional "quiz" (20%) for review
- Use "fillBlank" (10%) for new syntax/patterns` : `- Almost always "code" (90%)
- Occasional "quiz" (10%) for quick knowledge checks`}

FOUNDATION CARDS GUIDELINES:
Generate 6-10 swipeable concept cards that progressively build understanding.
Each card = ONE atomic concept (can be grasped in 30-60 seconds).

Card structure:
${params.dayNumber === 1 ? `- Card 1: INTRO CARD - "Today we'll learn [X]. Here's why it matters..."` : `- Card 1: RECAP CARD - "Yesterday we learned [X]. Today builds on that by..."`}
- Cards 2-3: Core definitions (what is X?)
- Cards 4-5: How/when to use
- Cards 6-7: Common patterns/examples
- Cards 8-9: Gotchas/edge cases
- Card 10: Preview of next topic (optional)

REQUIRED FIELDS for each card:
- realWorldContext: 1 sentence explaining WHERE/WHY this is used in real work
  Example: "In production React apps, this prevents unnecessary re-renders that slow your UI."
  Example: "Senior developers use this pattern in code reviews to catch bugs early."
- videoTimestampRef (optional): Reference to video moment that shows this concept
  Example: "Remember at 2:15 when the instructor showed the console output? That's this."
  Only include if there's a relevant video moment to reference.

MicroQuestion types:
- "gotit": Simple "Got it! / Still confused" - use for recap/intro cards
- "understanding": Multiple choice (3-4 options) - use for concept cards

Code examples: Keep under 5 lines, use real runnable syntax.
For non-code skills: Use real-world examples instead of code.

Output valid JSON only.`;

  const userPrompt = `{
  "day": ${params.dayNumber},
  "title": "${params.dayTitle}",
  "subtitle": "${params.skeleton?.subtitle || ''}",
  "skills": ${JSON.stringify(params.skeleton?.skills || params.dayObjectives)},
  "estimatedMinutes": ${time.totalMinutes},

  "prePrompt": {"text": "", "primeQuestions": [], "yesterdayRecap": ""},
  "video": {"watchPoints": []},

  "foundationCards": [
    {"id": "day${params.dayNumber}-card-1", "concept": "", "visual": "", "explanation": "", "realWorldContext": "Where/why this matters in real work", "microQuestion": {"question": "", "type": "gotit"}, "order": 1},
    {"id": "day${params.dayNumber}-card-2", "concept": "", "visual": "", "explanation": "", "realWorldContext": "", "videoTimestampRef": "Remember at X:XX when...", "codeExample": "", "microQuestion": {"question": "", "type": "understanding", "options": [], "correctIndex": 0, "explanation": ""}, "order": 2}
  ],

  "taskFormat": "code|quiz|fillBlank",
  "task1": "USE ONE OF THE FORMATS BELOW based on taskFormat chosen",

  "_task1_code_format": {
    "id": "day${params.dayNumber}-task1",
    "title": "Task title",
    "description": "Full description",
    "estimatedMinutes": ${time.task1},
    "format": "code",
    "challenge": "Challenge statement",
    "expectedOutput": "Success criteria",
    "starterCode": "// Starter",
    "hints": [
      {"level": 1, "hint": "Gentle nudge"},
      {"level": 2, "hint": "More specific"},
      {"level": 3, "hint": "Near-answer approach"}
    ],
    "solution": "// COMPLETE working solution",
    "solutionAnnotations": ["// WHY: Key decision explanation"],
    "stuckDetection": {"triggerAfterMinutes": 7, "suggestions": ["Re-watch X", "Check hint"]}
  },

  "_task1_quiz_format": {
    "id": "day${params.dayNumber}-task1",
    "title": "Knowledge Check",
    "description": "Test your understanding",
    "estimatedMinutes": ${time.task1},
    "format": "quiz",
    "passingScore": 0.7,
    "questions": [
      {"id": "q1", "question": "Question about concept?", "options": ["Wrong A", "Correct B", "Wrong C", "Wrong D"], "correctIndex": 1, "explanation": "Why B is correct"},
      {"id": "q2", "question": "Another question?", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "Why A is correct"}
    ]
  },

  "_task1_fillBlank_format": {
    "id": "day${params.dayNumber}-task1",
    "title": "Complete the Code",
    "description": "Fill in the blanks",
    "estimatedMinutes": ${time.task1},
    "format": "fillBlank",
    "passingScore": 0.7,
    "items": [
      {"id": "fb1", "codeTemplate": "const ___BLANK___ = 'Hello';", "blanks": [{"id": "b1", "correctAnswers": ["greeting", "message", "text"], "hint": "Name the variable"}], "explanation": "Variables store values"},
      {"id": "fb2", "codeTemplate": "console.___BLANK___('Hi');", "blanks": [{"id": "b1", "correctAnswers": ["log"], "hint": "Output method"}], "explanation": "console.log prints to console"}
    ]
  },

  ${time.task2 > 0 ? `"task2": {
    "id": "day${params.dayNumber}-task2",
    "title": "Extended Practice",
    "description": "Same concept, different context",
    "estimatedMinutes": ${time.task2},
    "challenge": "Variation challenge",
    "expectedOutput": "Success criteria",
    "hints": [{"level": 1, "hint": "H1"}, {"level": 2, "hint": "H2"}, {"level": 3, "hint": "H3"}],
    "solution": "// Complete solution",
    "connectionToTask1": "How this reinforces Task 1"
  },` : ''}

  ${time.practice > 0 ? `"practiceProject": {
    "id": "day${params.dayNumber}-practice",
    "title": "Project title",
    "description": "Project description",
    "estimatedMinutes": ${time.practice},
    "coreChallenge": "Core challenge",
    "requirements": ["R1", "R2"],
    "hints": ["H1", "H2", "H3"],
    "solution": "// Complete solution",
    "stretchGoals": [
      {"condition": "Finished early", "goal": "Add yesterday's concept"},
      {"condition": "Struggling", "goal": "Use guided mode", "tier": "PREMIUM"}
    ],
    "tierResources": {
      "free": {"hints": 1, "solution": true},
      "pro": {"hints": 3, "stepByStep": true, "aiTutor": true},
      "premium": {"adaptiveDifficulty": {"high": "Challenge", "medium": "Standard", "low": "Guided"}}
    }
  },` : ''}

  "reflection": {
    "questions": [
      {"id": "confidence", "question": "Confidence 1-5?", "type": "scale"},
      {"id": "clicked", "question": "What clicked?", "type": "text"},
      {"id": "foggy", "question": "What's unclear?", "type": "text"},
      {"id": "connection", "question": "How does today connect to Day ${params.dayNumber - 1}?", "type": "text"},
      {"id": "warmup", "question": "Tomorrow's warmup plan?", "type": "text"}
    ]
  },

  "skipTest": {
    "questionSets": [
      [
        {"question": "Hard edge case question testing deep understanding?", "options": ["Plausible wrong A", "Plausible wrong B", "Correct answer", "Plausible wrong C"], "correctIndex": 2},
        {"question": "Tricky question about common misconception?", "options": ["Correct answer", "Common mistake", "Sounds right but wrong", "Another trap"], "correctIndex": 0},
        {"question": "Applied scenario requiring nuanced knowledge?", "options": ["Wrong approach A", "Wrong approach B", "Wrong approach C", "Correct approach"], "correctIndex": 3}
      ],
      [
        {"question": "Different hard question on same concept?", "options": ["Trap A", "Correct answer", "Trap B", "Trap C"], "correctIndex": 1},
        {"question": "Another tricky misconception question?", "options": ["Wrong", "Wrong", "Correct answer", "Wrong"], "correctIndex": 2},
        {"question": "Different applied scenario?", "options": ["Correct approach", "Plausible wrong", "Plausible wrong", "Plausible wrong"], "correctIndex": 0}
      ]
    ],
    "currentSetIndex": 0,
    "passThreshold": 3
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
