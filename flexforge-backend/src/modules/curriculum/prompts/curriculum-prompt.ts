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

// Content layer and strategy guidance for AI
function getContentStrategyGuidance(): string {
  return `
CONTENT STRATEGY (decide per day):

═══ CONTENT LAYER ═══
Classify each day's primary learning type:

"foundation"     - Core concepts: variables, functions, data structures, algorithms
                   These are universal programming building blocks.

"language_core"  - Language fundamentals: Python basics, JS syntax, TS types
                   The core language features before frameworks.

"framework"      - Framework patterns: React hooks, Next.js routing, Django views
                   Architecture, conventions, idiomatic usage.

"tool"           - Tools & platforms: Claude API, Cursor, VSCode, Vercel, Make.com
                   UI walkthroughs, setup, configuration.

"project"        - Building & integrating: Build a todo app, deploy to production
                   End-to-end implementation, debugging, decisions.

═══ VIDEO STRATEGY ═══
Decide if video helps for THIS specific topic:

"skip"        - Video adds NO value. Text + practice is better.
                Use for: simple syntax, basic variable declarations, trivial concepts.
                DO NOT use for algorithms, data structures, or CS theory (these benefit from lectures).

"optional"    - Video might help some learners. Not required.
                Use for: language basics, simple patterns, straightforward API usage.

"helpful"     - Video provides useful mental models or flow.
                Use for: framework patterns, project walkthroughs, algorithm visualization.

"recommended" - Video is the BEST way to learn this.
                Use for: UI-heavy tools, visual workflows, debugging, complex algorithms,
                data structure operations, Big O analysis (visual explanations help greatly).

═══ TRANSFERABILITY ═══
Does this skill transfer to other tools/contexts?

"high"   - Universal concept. Works everywhere.
           Examples: "event-driven architecture", "state management patterns"

"medium" - Transfers to similar tools/contexts.
           Examples: "webhook patterns", "REST API design"

"low"    - Platform-specific. Only works here.
           Examples: "Make.com scenario UI", "Vercel dashboard settings"

═══ CONTENT SOURCE ═══
Where to get the primary content:

"university" - MIT OCW, Stanford, Harvard lectures
              USE FOR: algorithms, data structures, computer science theory,
              math foundations, system design principles, database theory,
              networking fundamentals, operating systems concepts.
              WHEN: contentLayer is "foundation" AND topic is academic/theoretical.

"youtube"    - Curated tutorials from trusted creators
              USE FOR: framework tutorials, tool demos, project walkthroughs,
              coding along, visual explanations of practical concepts.
              WHEN: contentLayer is "framework", "tool", or "project".

"text"       - AI-generated explanations (no external content)
              USE FOR: simple syntax, basic concepts that don't need video,
              quick reference material.
              WHEN: videoStrategy is "skip" AND topic is straightforward.

"docs"       - Official documentation (MDN, React docs, Python docs, etc.)
              USE FOR: API reference, language features, standard library,
              official best practices.
              WHEN: contentLayer is "language_core" AND topic is well-documented.

IMPORTANT: For foundational CS topics like algorithms, data structures, Big O,
recursion, trees, graphs, sorting - ALWAYS use "university" as contentSource.

For each day, output ALL of:
- "contentLayer": "foundation" | "language_core" | "framework" | "tool" | "project"
- "videoStrategy": "skip" | "optional" | "helpful" | "recommended"
- "transferability": "high" | "medium" | "low"
- "contentSource": "university" | "youtube" | "text" | "docs"
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

  const systemPrompt = `You are an expert curriculum designer for FlexForge, using evidence-based learning science.

SKILL: ${params.skillName}
TYPE: ${params.skillType} | LEVEL: ${params.skillLevel} | COMPLEXITY: ${params.complexity}
DURATION: ${params.durationDays} days × ${time.totalMinutes} min/day (${time.mode} Mode)
USER TIER: ${params.userTier}
${params.suggestedLanguage ? `LANGUAGE: ${params.suggestedLanguage}` : ''}
${params.prerequisiteSkills?.length ? `PREREQUISITES: ${params.prerequisiteSkills.join(', ')}` : ''}

LEARNING SCIENCE PRINCIPLES:
1. Active Retrieval - Test before feeling ready; explain BEFORE seeing answers
2. Spaced Repetition - Connect each day to previous concepts; review at intervals
3. Immediate Application - Apply concepts within same session (3x retention)
4. Metacognition - Self-assessment improves learning (effect size: 0.69)
5. Dual Coding - Visual + text = 50-80% improvement

${getSkillTypeGuidance(params.skillType, params.complexity, params.safetyLevel)}

${getContentStrategyGuidance()}

DAILY STRUCTURE OPTIONS (${time.mode} Mode - ${time.totalMinutes} min):
With video: ${time.structure}
Without video: ${time.structureNoVideo}

${time.task2 > 0 ? 'NOTE: Deep Dive mode includes TASK 2 (extended practice in different context).' : ''}

BOSS PROJECTS: Days ${bossDays.join(', ')} (60-90 min, combines ALL previous concepts)

${getTierInstructions(params.userTier)}

OUTPUT REQUIREMENT:
Generate SKELETON only for ALL days (including Day 1).
Full day content will be generated on-demand when user starts each day.

For each day, include:
- title, subtitle, skills, teaser, estimatedMinutes, hasBossProject, skipTest
- contentLayer: "foundation" | "language_core" | "framework" | "tool" | "project"
- videoStrategy: "skip" | "optional" | "helpful" | "recommended"
- transferability: "high" | "medium" | "low"
- contentSource: "university" | "youtube" | "text" | "docs"

The AI decides ALL strategy fields based on the specific topic for each day.
There are no rigid rules — use judgment for what helps learning best.

Output valid JSON only. No markdown formatting.`;

  const userPrompt = `Create ${params.durationDays}-day curriculum for "${params.skillName}".

Generate SKELETON for ALL days (Day 1 through Day ${params.durationDays}).

{
  "title": "Curriculum title",
  "description": "What student will master by completion",
  "finalProject": "Capstone project they'll build",
  "skillType": "${params.skillType}",

  "days": [
    {
      "day": 1,
      "title": "Day 1: [Specific Topic]",
      "subtitle": "Compelling one-line tagline",
      "skills": ["Specific skill 1", "Specific skill 2", "Specific skill 3"],
      "teaser": "You'll learn [exciting thing]!",
      "estimatedMinutes": ${time.totalMinutes},
      "hasBossProject": ${bossDays.includes(1)},
      "contentLayer": "foundation",
      "videoStrategy": "skip",
      "transferability": "high",
      "contentSource": "text",
      "skipTest": {
        "description": "Already know this? Prove mastery to skip ahead",
        "questions": [
          {"question": "Challenging Q1 that proves understanding?", "answer": "Correct answer"},
          {"question": "Application Q2 that shows real skill?", "answer": "Correct answer"},
          {"question": "Edge case Q3 that experts would know?", "answer": "Correct answer"}
        ],
        "passThreshold": 2
      }
    },
    {
      "day": 2,
      "title": "Day 2: [Topic Name]",
      "subtitle": "Compelling tagline",
      "skills": ["Skill 1", "Skill 2"],
      "teaser": "You'll build [exciting thing]!",
      "estimatedMinutes": ${time.totalMinutes},
      "hasBossProject": ${bossDays.includes(2)},
      "contentLayer": "tool",
      "videoStrategy": "recommended",
      "transferability": "medium",
      "contentSource": "youtube",
      "skipTest": {
        "description": "Prove mastery to skip",
        "questions": [
          {"question": "Hard Q1?", "answer": "Answer"},
          {"question": "Hard Q2?", "answer": "Answer"},
          {"question": "Hard Q3?", "answer": "Answer"}
        ],
        "passThreshold": 2
      }
    }
  ],

  "bossProjects": [
    {
      "day": ${bossDays[0]},
      "title": "Boss Project: [Epic Name]",
      "description": "Combines concepts from days 1-${Math.min(bossDays[0], params.durationDays)} to build [impressive thing]",
      "combinesDays": [${Array.from({ length: Math.min(bossDays[0], 4) }, (_, i) => i + 1).join(', ')}],
      "estimatedMinutes": 75,
      "teaser": "Why this project is exciting"
    }
  ],

  "metadata": {
    "recommendedTools": ["Tool 1", "Tool 2"],
    "prerequisites": ${JSON.stringify(params.prerequisiteSkills || [])},
    "safetyLevel": "${params.safetyLevel || 'low'}"
  }
}

Generate ALL ${params.durationDays} days as SKELETONS.
Each day must include: day, title, subtitle, skills, teaser, estimatedMinutes, hasBossProject, contentLayer, videoStrategy, transferability, contentSource, skipTest.
Boss projects on days: ${bossDays.join(', ')} (set hasBossProject: true for those days).

DECIDE FOR EACH DAY:
- contentLayer: What type of learning? (foundation/language_core/framework/tool/project)
- videoStrategy: Does video help? (skip/optional/helpful/recommended)
- transferability: Does skill transfer? (high/medium/low)
- contentSource: Where to get content? (university/youtube/text/docs)`;

  return { systemPrompt, userPrompt };
}

// Alias for backward compatibility
export const buildOverviewPrompt = buildCurriculumPrompt;

/**
 * PREVIEW PROMPT: Generates SKELETON ONLY for ALL days (fast preview)
 * Used for Phase 1 - user sees timeline before committing to "Start Learning"
 * ~500-1000 tokens output vs ~3000-5000 for full generation
 */
export function buildPreviewPrompt(params: CurriculumPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const time = getTimeStructure(params.hoursPerDay);
  const bossDays = getBossProjectDays(params.durationDays);

  const systemPrompt = `You are an expert curriculum designer. Generate a PREVIEW/SKELETON only.

SKILL: ${params.skillName}
TYPE: ${params.skillType} | LEVEL: ${params.skillLevel}
DURATION: ${params.durationDays} days × ${time.totalMinutes} min/day

OUTPUT: Generate SKELETON for ALL days. NO full content.
This is a QUICK PREVIEW for the user to see the learning path before starting.

Boss projects on days: ${bossDays.join(', ')}

For each day, decide:
- contentLayer: foundation | language_core | framework | tool | project
- videoStrategy: skip | optional | helpful | recommended
- transferability: high | medium | low
- contentSource: university | youtube | text | docs

Output valid JSON only. Keep it concise.`;

  const userPrompt = `Create ${params.durationDays}-day curriculum PREVIEW for "${params.skillName}".

SKELETON ONLY for ALL days. Output format:

{
  "title": "Curriculum title",
  "description": "One sentence on what student will master",
  "finalProject": "Brief capstone description",
  "skillType": "${params.skillType}",
  "days": [
    {
      "day": 1,
      "title": "Day 1: [Topic]",
      "subtitle": "Compelling tagline",
      "skills": ["Skill 1", "Skill 2", "Skill 3"],
      "teaser": "What they'll build/learn today",
      "estimatedMinutes": ${time.totalMinutes},
      "hasBossProject": false,
      "contentLayer": "foundation",
      "videoStrategy": "skip",
      "transferability": "high",
      "contentSource": "text"
    }
  ],
  "metadata": {
    "skillName": "${params.skillName}",
    "durationDays": ${params.durationDays},
    "hoursPerDay": ${params.hoursPerDay},
    "skillLevel": "${params.skillLevel}",
    "suggestedLanguage": "${params.suggestedLanguage || 'English'}"
  }
}

Generate ALL ${params.durationDays} days. Boss projects on days: ${bossDays.join(', ')}.
Decide contentLayer, videoStrategy, transferability, contentSource for each day.`;

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
4. Active recall: student explains BEFORE seeing answer
5. Include stuck detection triggers
6. ALWAYS include conceptCheck with 3 multiple-choice questions (levels 1, 2, 3) - this is REQUIRED for all days

Output valid JSON only.`;

  const userPrompt = `Generate complete Day ${params.dayNumber} content.

Skeleton from overview:
${JSON.stringify(params.skeleton, null, 2)}

{
  "day": ${params.dayNumber},
  "title": "${params.dayTitle}",
  "subtitle": "${params.skeleton?.subtitle || ''}",
  "skills": ${JSON.stringify(params.skeleton?.skills || params.dayObjectives)},
  "estimatedMinutes": ${time.totalMinutes},

  "prePrompt": {
    "text": "Today's brain primer connecting to Day ${params.dayNumber - 1}",
    "primeQuestions": ["Activation Q1?", "Activation Q2?"],
    "yesterdayRecap": "${params.previousDayTitle ? `Quick recall: What was the key concept from ${params.previousDayTitle}?` : 'N/A'}"
  },

  "video": {
    "watchPoints": ["Key concept to look for", "Important technique shown"]
  },

  "activeRecall": {
    "instruction": "Explain in your own words BEFORE seeing answer",
    "keyPointsToInclude": ["Point 1", "Point 2", "Point 3"],
    "sampleGoodAnswer": "Example answer",
    "connectionToYesterday": {
      "question": "How does today's [concept] build on yesterday's [${params.previousDayTitle || 'concept'}]?",
      "sampleConnection": "Example of how they connect"
    }
  },

  "conceptCheck": {
    "description": "REQUIRED - Generate 3 actual multiple-choice questions about today's topic",
    "questions": [
      {
        "level": 1,
        "question": "Basic understanding question about ${params.dayTitle}?",
        "options": ["Correct answer", "Plausible wrong 1", "Plausible wrong 2", "Plausible wrong 3"],
        "correctIndex": 0,
        "explanation": "Why correct and why others wrong"
      },
      {
        "level": 2,
        "question": "Application question - when/how to use this concept?",
        "options": ["Correct scenario", "Wrong scenario 1", "Wrong scenario 2", "Wrong scenario 3"],
        "correctIndex": 0,
        "explanation": "Context and common misconceptions"
      },
      {
        "level": 3,
        "question": "Deep understanding - why does this work this way?",
        "options": ["Correct principle", "Misconception 1", "Misconception 2", "Misconception 3"],
        "correctIndex": 0,
        "explanation": "Deeper mechanism understanding"
      }
    ]
  },

  "task1": {
    "id": "day${params.dayNumber}-task1",
    "title": "Task title",
    "description": "Full description",
    "estimatedMinutes": ${time.task1},
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
    "stuckDetection": {
      "triggerAfterMinutes": 7,
      "suggestions": ["Re-watch X", "Check hint", "Try simpler"]
    }
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
