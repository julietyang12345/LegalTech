import { GoalType } from '../../../database/entities/session.entity';
import { TrainingConfig } from './types';

export const aiBuilderConfig: TrainingConfig = {
  goalType: GoalType.AI_BUILDER,
  name: 'AI Builder',
  subtitle: 'Build one small thing that actually works, using AI.',
  stepFlow: ['prePrompt', 'task1', 'reflection'],
  stepLabels: {
    prePrompt: 'Project Scope',
    task1: 'Build with AI',
    reflection: 'Ship & Reflect',
  },
  scenarioTypes: [
    'prompt_engineering',
    'api_integration',
    'agent_workflow',
    'rag_pipeline',
    'automation_chain',
  ],
  rubricDimensions: [],
  subskills: [
    'prompt_design',
    'api_usage',
    'output_parsing',
    'error_handling',
    'chain_of_thought',
    'tool_selection',
  ],
  hasTimedAttempt: false,
  scoringType: 'feedback',
  defaultTimerMinutes: 0,
  promptOverrides: {
    skeleton: `AI BUILDER MODE:
- Each day scopes a MICRO-PROJECT that uses AI tools/APIs
- Day title = what they'll build (e.g., "Email Summarizer with Claude API")
- Skills = AI concepts + implementation skills (e.g., ["prompt engineering", "API calls", "JSON parsing"])
- Progression: Day 1 = simple prompt → later days = chains, agents, integrations
- Each day produces a WORKING ARTIFACT the user can keep and use
- Focus on shipping, not perfection — "good enough to demo" is the bar`,

    dayCore: `AI BUILDER FORMAT:
Generate a micro-project scope with:

prePrompt:
- Concept explanation: Teach the AI concept/tool being used (same depth as curriculum prePrompt)
- 2-3 inline warm-up questions about the AI concept
- Then the project scope: what to build, why it's useful, what tools/APIs to use
- Expected output/artifact description
- "Ship criteria" — minimum viable version

task1 (sections format):
- Step-by-step build guide as interactive exercises
- Include prompt templates the user will customize
- Code snippets for API integration
- Testing/validation steps
- "Polish" suggestions for going beyond MVP

The tone should be builder-focused: practical, exciting, shipping-oriented.`,
  },
};
