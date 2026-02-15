import { GoalType } from '../../../database/entities/session.entity';
import { TrainingConfig } from './types';

export const interviewConfig: TrainingConfig = {
  goalType: GoalType.INTERVIEW,
  name: 'Interview Prep',
  subtitle: 'Short, sharp simulations that build real interview confidence.',
  stepFlow: ['prePrompt', 'task1', 'reflection'],
  stepLabels: {
    prePrompt: 'Scenario Brief',
    task1: 'Timed Attempt',
    reflection: 'Feedback & Fix',
  },
  scenarioTypes: [
    'coding',
    'system_design',
    'behavioral',
    'technical_deep_dive',
    'pair_programming',
  ],
  rubricDimensions: [
    'problem_decomposition',
    'code_quality',
    'communication',
    'edge_cases',
    'time_management',
  ],
  subskills: [
    'algorithm_design',
    'data_structures',
    'system_architecture',
    'behavioral_stories',
    'whiteboard_communication',
    'debugging_under_pressure',
  ],
  hasTimedAttempt: true,
  scoringType: 'rubric',
  defaultTimerMinutes: 25,
  promptOverrides: {
    skeleton: `INTERVIEW PREP MODE:
- Each day is a STANDALONE interview scenario (no multi-day continuity needed)
- Day title = scenario type + skill area (e.g., "Coding: Hash Maps & Frequency Counting")
- Skills = specific subskills tested (e.g., ["hash maps", "time complexity", "edge cases"])
- Progression: Day 1 = easier warm-up scenario, later days increase difficulty
- Mix scenario types across days: coding (60%), system design (20%), behavioral (20%)
- Each day's teaser should describe the interview scenario briefly`,

    dayCore: `INTERVIEW SCENARIO FORMAT:
Generate a realistic interview scenario with:

prePrompt:
- Concept explanation: Teach the relevant concept/pattern (same depth as curriculum prePrompt)
- 2-3 inline warm-up questions (quick-tap, not graded) to prime the candidate
- Then the scenario: problem statement, constraints, expected input/output
- Time limit and what the interviewer is looking for
- Rubric criteria (what dimensions will be scored)

task1 (sections format):
- The interview problem itself as interactive exercises
- For coding: provide starter code template, test cases
- For system design: provide requirements, scale expectations
- For behavioral: provide the STAR prompt and situation context
- Include hints that simulate interviewer guidance

The scenario should feel like a real interview — professional tone, realistic constraints.`,
  },
};
