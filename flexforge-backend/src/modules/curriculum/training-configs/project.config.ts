import { GoalType } from '../../../database/entities/session.entity';
import { TrainingConfig } from './types';

export const projectConfig: TrainingConfig = {
  goalType: GoalType.PROJECT,
  name: 'Project Lab',
  subtitle: 'Turn real work problems into a learning project.',
  stepFlow: ['prePrompt', 'task1', 'bossMilestone', 'reflection'],
  stepLabels: {
    prePrompt: "Today's Focus",
    task1: 'Warm-up',
    bossMilestone: 'Build',
    reflection: 'Apply & Reflect',
  },
  scenarioTypes: [
    'debug_production',
    'optimize_workflow',
    'build_feature',
    'refactor_legacy',
    'automate_process',
  ],
  rubricDimensions: [],
  subskills: [
    'problem_identification',
    'solution_design',
    'implementation',
    'testing_strategy',
    'documentation',
    'stakeholder_communication',
  ],
  hasTimedAttempt: false,
  scoringType: 'feedback',
  defaultTimerMinutes: 0,
  promptOverrides: {
    skeleton: `PROJECT LAB MODE:
- Each day focuses on a REAL WORK PROBLEM tied to the user's project goal
- Day title = skill/concept + project context (e.g., "API Error Handling in Production")
- Skills = practical subskills (e.g., ["error boundaries", "retry logic", "logging"])
- Progression: identify skill gap → learn concept → apply to the project
- Mix problem types: debug (30%), build (40%), optimize (30%)
- Each day should feel like solving a real work ticket for THEIR project
- hasBossProject: true — EVERY day must have a boss project milestone tied to the user's project`,

    dayCore: `PROJECT LAB FORMAT:
The user is building a real project. Generate content that helps them learn by building.

prePrompt:
- Concept explanation: Teach the relevant skill/concept needed for today's build step
- Describe today's work problem in the context of THEIR project
- What the user will build/fix/optimize today
- Expected deliverable

task1 (warm-up quiz):
- Generate exactly 1 quiz section with 5 questions — mix of theory and application — NO other section types
- Q1: Theory question testing understanding of today's concept
- Q2-Q4: Application questions tied to today's build task at the user's current level
- LAST QUESTION (stretch): One question ABOVE the user's current skill level — a harder scenario that pushes them to think deeper. For beginners: intermediate-level question. For intermediate: advanced-level question. For advanced: expert/edge-case question.
- NO secondary sections (outputPrediction, fillBlank, etc.)

bossMilestone:
- Guide the user to produce a WORKING product step by step
- Provide existing code the user can start from (starterCode)
- Break the build into clear, sequential steps with expected output at each stage
- Include debugging guidance: common errors, how to diagnose them, what to check when things break
- Show how to verify each step works before moving to the next
- This is the CORE of the day — hands-on building with guardrails

Focus on TRANSFERABLE skills — the user should be able to apply what they learn to their actual work.`,
  },
};
