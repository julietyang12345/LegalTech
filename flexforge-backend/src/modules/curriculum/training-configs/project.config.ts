import { GoalType } from '../../../database/entities/session.entity';
import { TrainingConfig } from './types';

export const projectConfig: TrainingConfig = {
  goalType: GoalType.PROJECT,
  name: 'Project Lab',
  subtitle: 'Turn real work problems into a learning engine.',
  stepFlow: ['prePrompt', 'task1', 'reflection'],
  stepLabels: {
    prePrompt: "Today's Focus",
    task1: 'Build',
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
- Each day focuses on a REAL WORK PROBLEM the user might face
- Day title = skill/concept + work context (e.g., "API Error Handling in Production")
- Skills = practical subskills (e.g., ["error boundaries", "retry logic", "logging"])
- Progression: identify skill gap → learn concept → apply to real work scenario
- Mix problem types: debug (30%), build (40%), optimize (30%)
- Each day should feel like solving a real work ticket, not an academic exercise`,

    dayCore: `PROJECT LAB FORMAT:
Generate a realistic work problem scenario with:

prePrompt:
- Concept explanation: Teach the relevant skill/concept (same depth as curriculum prePrompt)
- 2-3 inline warm-up questions to activate prior knowledge
- Then the work problem: realistic scenario from a team/company context
- What the user will build/fix/optimize today
- Expected deliverable

task1 (sections format):
- The work problem broken into guided steps
- Provide realistic context (codebase snippets, architecture diagrams, team constraints)
- Include decision points where the user must choose an approach
- Mix theory questions with hands-on application

Focus on TRANSFERABLE skills — the user should be able to apply what they learn to their actual work.`,
  },
};
