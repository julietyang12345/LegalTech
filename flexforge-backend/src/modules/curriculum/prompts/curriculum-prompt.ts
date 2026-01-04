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

// Helper function to generate time-scaled daily structure
function getDailyStructure(hoursPerDay: number): {
  totalMinutes: number;
  structure: string;
  structureSummary: string;
} {
  const totalMinutes = Math.round(hoursPerDay * 60);

  if (totalMinutes <= 30) {
    // QUICK MODE: 30 min
    return {
      totalMinutes,
      structure: `
1. PRE-PROMPT (30 sec)
   - Prime brain with: "Today you'll learn X"
   - Activate prior knowledge

2. VIDEO (5 min)
   - Ultra-focused, timestamped segment
   - Use videoPlaceholder format
   - ONE key concept only

3. ACTIVE RECALL (5 min)
   - "Explain in 2 sentences what you learned"
   - Student writes before seeing answer
   - Then show key points to include:
     * What concept does
     * When to use it

4. TASK 1 (15 min) - Immediate Application
   - Apply today's concept
   - Tier resources per TIER-SPECIFIC ACCESS
   - Stuck detection at 10 min

5. QUICK REFLECTION (3 min)
   - Confidence rating 1-5
   - One thing that clicked`,
      structureSummary: 'Quick Mode (30 min): Video → Recall → Practice → Reflect',
    };
  } else if (totalMinutes <= 45) {
    // STANDARD MODE: 45 min
    return {
      totalMinutes,
      structure: `
1. PRE-PROMPT (30 sec)
   - Prime brain with: "Today you'll learn X"
   - Activate prior knowledge

2. VIDEO (6 min)
   - Focused, timestamped segment
   - Use videoPlaceholder format
   - Concept introduction only

3. ACTIVE RECALL (6 min)
   - "Explain in your own words (3 sentences)"
   - Student writes before seeing answer
   - Then show key points to include:
     * What concept does
     * When to use it
     * Simple example

4. CONCEPT CHECK (4 min)
   - Level 1: What is it? (definition)
   - Level 2: When to use? (application)
   - Static questions (same for all users)

5. TASK 1 (12 min) - Immediate Application
   - Apply today's concept
   - Tier resources per TIER-SPECIFIC ACCESS
   - Stuck detection at 8 min

6. PRACTICE PROJECT (12 min) - Interleaved
   - Core Challenge: Today's concept (primary)
   - Stretch Goals: Add yesterday's concept
   - Tier resources per TIER-SPECIFIC ACCESS

7. REFLECTION (4 min) - Metacognition
   - Confidence rating 1-5
   - What clicked?
   - What's foggy?`,
      structureSummary: 'Standard Mode (45 min): Video → Recall → Check → Task → Practice → Reflect',
    };
  } else if (totalMinutes <= 60) {
    // FOCUSED MODE: 1 hour
    return {
      totalMinutes,
      structure: `
1. PRE-PROMPT (1 min)
   - Prime brain with: "Today you'll learn X"
   - Activate prior knowledge
   - Set learning intention

2. VIDEO (7 min)
   - Focused, timestamped segment
   - Use videoPlaceholder format
   - Concept introduction only

3. ACTIVE RECALL (8 min total)

   PART 1: Write What You Learned (5 min)
   - "Explain in your own words (3 sentences)"
   - Student writes before seeing answer
   - Then show key points to include:
     * What concept does
     * When to use it
     * Simple example

   PART 2: Connect to Yesterday (3 min)
   - Quick recall of Day N-1 concept
   - Connection question: How does today relate to yesterday?
   - (Skip on Day 1)

4. CONCEPT CHECK (5 min)
   - Level 1: What is it? (definition)
   - Level 2: When to use? (application)
   - Level 3: Why does it work? (deep understanding)
   - Static questions (same for all users)

5. TASK 1 (15 min) - Immediate Application
   - Apply today's concept
   - Tier resources per TIER-SPECIFIC ACCESS
   - Stuck detection at 10 min

6. PRACTICE PROJECT (18 min) - Interleaved
   - Core Challenge: Today's concept (primary)
   - Stretch Goals: Add yesterday's concept
   - Tier resources per TIER-SPECIFIC ACCESS

7. REFLECTION (5 min) - Metacognition
   - Confidence rating 1-5
   - What clicked?
   - What's foggy?
   - Explain in 1 sentence
   - Tomorrow's 5-min warm-up plan`,
      structureSummary: 'Focused Mode (1 hour): Full structure with interleaving',
    };
  } else {
    // DEEP DIVE MODE: 1.5 hours (90 min)
    return {
      totalMinutes,
      structure: `
1. PRE-PROMPT (2 min)
   - Prime brain with: "Today you'll learn X"
   - Activate prior knowledge
   - Set learning intention
   - Quick review of yesterday's key concept

2. VIDEO (10 min)
   - Focused, timestamped segments
   - Use videoPlaceholder format
   - May include 2 video segments for complex topics

3. ACTIVE RECALL (12 min total)

   PART 1: Write What You Learned (7 min)
   - "Explain in your own words (4-5 sentences)"
   - Include your own example
   - Student writes before seeing answer
   - Then show key points to include:
     * What concept does
     * When to use it
     * Common mistakes to avoid

   PART 2: Connect to Yesterday (5 min)
   - Detailed recall of Day N-1 concept
   - Connection question with explanation
   - (Skip on Day 1)

4. CONCEPT CHECK (8 min)
   - Level 1: What is it? (definition)
   - Level 2: When to use? (application)
   - Level 3: Why does it work? (deep understanding)
   - Level 4: Edge cases and exceptions
   - Static questions (same for all users)

5. TASK 1 (15 min) - Immediate Application
   - Apply today's concept (more complex)
   - Tier resources per TIER-SPECIFIC ACCESS
   - Stuck detection at 10 min

6. TASK 2 (15 min) - Extended Practice
   - Variation of Task 1 in different context
   - Tier resources per TIER-SPECIFIC ACCESS

7. PRACTICE PROJECT (25 min) - Interleaved
   - Core Challenge: Today's concept (primary)
   - Stretch Goals: Combine 2-3 previous concepts
   - Tier resources per TIER-SPECIFIC ACCESS

8. REFLECTION (8 min) - Deep Metacognition
   - Confidence rating 1-5
   - What clicked?
   - What's foggy?
   - Explain concept to imaginary student
   - Tomorrow's warm-up plan
   - One question you still have`,
      structureSummary: 'Deep Dive Mode (90 min): Extended practice with Task 2 and deeper projects',
    };
  }
}

export function buildCurriculumPrompt(params: CurriculumPromptParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const dailyStructure = getDailyStructure(params.hoursPerDay);

  const systemPrompt = `You are an expert curriculum designer for FlexForge, an AI-powered rapid skill acquisition platform.

Your mission: Create a ${dailyStructure.totalMinutes}-minute daily learning structure based on COGNITIVE SCIENCE research:

🧠 RESEARCH FOUNDATION:
1. **Active Retrieval Practice** (Roediger & Karpicke, 2006)
   - 50% better retention than re-reading
   - Test before you feel ready

2. **Spaced Repetition** (Cepeda et al., 2006)
   - Review at increasing intervals
   - Spacing beats massing by 200-400%

3. **Dual Coding** (Paivio, 1971; Mayer, 2001)
   - Visual + Text = 50-80% improvement
   - Video + interactive questions

4. **Immediate Application** (Kolb, 1984)
   - Apply within 1 hour = 3x retention
   - Real projects, not theory

5. **Metacognition** (Hattie, 2009)
   - Self-monitoring improves learning
   - Effect size: 0.69

SKILL TYPE: ${params.skillType}
COMPLEXITY: ${params.complexity}
USER TIER: ${params.userTier}
DURATION: ${params.durationDays} days × ${params.hoursPerDay} hours

${getSkillTypeInstructions(params.skillType, params.complexity, params.safetyLevel)}

═══════════════════════════════════════════════════
CRITICAL: DAILY STRUCTURE (45-50 min)
═══════════════════════════════════════════════════

Each day MUST follow this exact structure:

${dailyStructure}

═══════════════════════════════════════════════════
BOSS PROJECT RULES
═══════════════════════════════════════════════════

Timing:
- Minimum gap: 3 days
- Maximum gap: 4 days  
- ALWAYS on final day

Examples:
- 3-day course: Day 3 only
- 4-day course: Day 4 only
- 5-day course: Day 3 + Day 5
- 7-day course: Day 4 + Day 7
- 10-day course: Day 4, Day 8, Day 10

Duration: 60-90 minutes

Content: Combines ALL previous concepts

═══════════════════════════════════════════════════
TIER-SPECIFIC ACCESS
═══════════════════════════════════════════════════

${getTierInstructions(params.userTier)}

Output: JSON only, no markdown, no explanations.`;

  const userPrompt = `Create a ${params.durationDays}-day curriculum for: ${params.skillName}

Parameters:
- Duration: ${params.durationDays} days
- Daily time: ${params.hoursPerDay} hours (45-50 min active learning)
- Skill level: ${params.skillLevel}
- Skill type: ${params.skillType}
- Complexity: ${params.complexity}
- User tier: ${params.userTier}
${params.suggestedLanguage ? `- Language: ${params.suggestedLanguage}` : ''}
${params.prerequisiteSkills?.length ? `- Prerequisites: ${params.prerequisiteSkills.join(', ')}` : ''}

CRITICAL REQUIREMENTS:

1. Each day MUST have 45-50 min structure
2. Boss Projects: Every 3-4 days + ALWAYS final day
3. Active Recall: Part 1 (write) + Part 2 (connect to yesterday)
4. All tasks need "stuck detection" at 7 min
5. Tier-appropriate resources

${getJSONTemplate(params.skillType, params.userTier, params.durationDays)}

Generate the curriculum now:`;

  return { systemPrompt, userPrompt };
}

function getTierInstructions(userTier: string): string {
  switch (userTier) {
    case 'FREE':
      return `FREE TIER:
- Video: Days 1-2 timestamps only
- Tasks (1 & 2): 1 hint + solution with annotations
- Practice Project: 1 hint + solution
- Boss (Day 1): Step-by-step
- Boss (D2+): Solution only
- Reflection: All questions, no AI
- No AI Tutor`;

    case 'PRO':
      return `PRO TIER ($15/mo):
- Video: All days + Ask AI (3 Q's)
- Active Recall: AI reviews explanation
- Tasks (1 & 2): Starter + 3 hints + AI Tutor
- Practice Project: Steps + 3 hints + AI
- Boss Project: Steps + 3 hints
- Reflection: AI analysis + review plan
- AI Tutor: 20 msgs/day`;

    case 'PREMIUM':
      return `PREMIUM TIER ($39/mo):
- Everything in PRO
- Unlimited AI Tutor
- Adaptive difficulty (Tasks, Practice, Boss)
- Code review on submit
- Weakness dashboard
- Career path integration`;

    default:
      return '';
  }
}

function getSkillTypeInstructions(
  skillType: SkillType,
  complexity: SkillComplexity,
  safetyLevel?: string,
): string {
  if (skillType === SkillType.AI_AGENT) {
    return getAIAgentInstructions(complexity);
  }

  switch (skillType) {
    case SkillType.CODE:
      return `CODE SKILLS: Provide actual code, starter files, working projects`;
    case SkillType.PHYSICAL:
      return `PHYSICAL SKILLS (${safetyLevel}): Checklists, safety warnings, verification`;
    case SkillType.KNOWLEDGE:
      return `KNOWLEDGE SKILLS: Quiz questions, practice exercises, mnemonics`;
    case SkillType.DESIGN:
      return `DESIGN SKILLS: Example outputs, principles, rubrics`;
    default:
      return '';
  }
}

function getAIAgentInstructions(complexity: SkillComplexity): string {
  switch (complexity) {
    case SkillComplexity.BEGINNER:
      return `AI AGENT (BEGINNER): No coding - pure prompt engineering, web interfaces only`;
    case SkillComplexity.INTERMEDIATE:
      return `AI AGENT (INTERMEDIATE): Basic Python + API calls from Day 3+`;
    case SkillComplexity.ADVANCED:
      return `AI AGENT (ADVANCED): Overview focus - recommend 30+ days for mastery`;
    default:
      return '';
  }
}

function getJSONTemplate(skillType: SkillType, _userTier: string, durationDays: number): string {
  const bossProjectDays = calculateBossProjectDays(durationDays);
  
  return `Return ONLY valid JSON (no markdown) with this structure:

{
  "finalProjectTitle": "Project name",
  "finalProjectDescription": "What students build",
  "skillType": "${skillType}",
  "days": [
    {
      "day": 1,
      "title": "Day 1: Topic",
      "estimatedMinutes": 50,
      
      "prePrompt": {
        "text": "Today: [concept]. Think: How is this different? Where would I use it?",
        "primeQuestions": ["Q1", "Q2"]
      },
      
      "video": {
        "title": "Video title",
        "videoPlaceholder": {
          "searchQuery": "Search query",
          "preferredChannels": ["Channel 1"],
          "topicFocus": "Exact topic",
          "idealDuration": "5-7 minutes"
        },
        "estimatedMinutes": 6
      },
      
      "activeRecall": {
        "part1": {
          "instruction": "Explain in 3 sentences",
          "keyPointsToInclude": ["Point 1", "Point 2", "Point 3"]
        },
        "part2": {
          "skipOnDay1": true,
          "yesterdayQuestion": "Yesterday's concept?",
          "yesterdayAnswer": "Answer",
          "connectionQuestion": "How do they connect?",
          "exampleConnection": "Example"
        }
      },
      
      "conceptCheck": {
        "questions": [
          {"level": 1, "question": "What is X?", "answer": "Definition"},
          {"level": 2, "question": "When to use?", "answer": "Use cases"},
          {"level": 3, "question": "Why does it work?", "answer": "Principles"}
        ]
      },
      
      "task1": {
        "id": "day1-task1",
        "title": "Task title",
        "description": "Apply concept",
        "estimatedMinutes": 10,
        "free": {
          "challengeDescription": "Build X",
          "expectedOutput": "What it should do",
          "hint1": "Gentle nudge",
          "solution": "Complete code",
          "solutionAnnotations": ["// WHY: explanation"]
        },
        "pro": {
          "starterCode": "Template",
          "hints": ["Hint 1", "Hint 2", "Hint 3"],
          "aiTutorAccess": true
        },
        "stuckDetection": {
          "triggerAfterMinutes": 7,
          "suggestions": ["Re-watch video", "Check hint", "Try simpler"]
        },
        "answer": "SOLUTION FOR GENERATION"
      },
      
      "practiceProject": {
        "id": "day1-practice",
        "title": "Practice title",
        "estimatedMinutes": 15,
        "coreChallenge": "Build simple version",
        "stretchGoals": [
          {"condition": "Finished early", "goal": "Add yesterday's concept"},
          {"condition": "Struggling", "goal": "Use starter (PRO)", "tier": "PRO"}
        ],
        "tierResources": {
          "free": {"hint1": true, "solution": true},
          "pro": {"stepByStep": true, "hints": 3, "aiTutor": true},
          "premium": {
            "adaptiveDifficulty": {
              "high": "Challenge mode",
              "medium": "Standard",
              "low": "Guided"
            }
          }
        },
        "answer": "SOLUTION"
      },
      
      "reflection": {
        "questions": [
          {"id": 1, "question": "Confidence 1-5?"},
          {"id": 2, "question": "What clicked?"},
          {"id": 3, "question": "What's foggy?"},
          {"id": 4, "question": "Explain in 1 sentence"},
          {"id": 5, "question": "Tomorrow's warm-up?"}
        ]
      }
    }
  ],
  
  "bossProjects": [
    {
      "day": ${bossProjectDays[0] || durationDays},
      "title": "Boss Project",
      "estimatedMinutes": 75,
      "combinesDays": [1, 2, 3, 4],
      "free": {
        "projectDescription": "What to build",
        "requirements": ["Req 1"],
        "hint1": "Nudge",
        "solution": "Complete code"
      },
      "pro": {
        "allDaysStepByStep": true,
        "hints": ["Hint 1", "Hint 2", "Hint 3"],
        "weaknessStrengthSummary": true
      },
      "premium": {
        "adaptiveDifficulty": {
          "challenge": "High confidence mode",
          "standard": "Medium confidence",
          "guided": "Low confidence mode"
        }
      },
      "answer": "BOSS SOLUTION"
    }
  ],
  
  "prerequisites": [],
  "recommendedTools": []
}`;
}

function calculateBossProjectDays(totalDays: number): number[] {
  if (totalDays <= 3) return [totalDays];
  if (totalDays === 4) return [4];
  
  const days: number[] = [];
  let currentDay = 4;
  
  while (currentDay < totalDays) {
    days.push(currentDay);
    currentDay += 4;
  }
  
  if (!days.includes(totalDays)) {
    days.push(totalDays);
  }
  
  return days;
}