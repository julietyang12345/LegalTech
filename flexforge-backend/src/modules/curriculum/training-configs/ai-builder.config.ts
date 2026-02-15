import { GoalType } from '../../../database/entities/session.entity';
import { TrainingConfig } from './types';

export const aiBuilderConfig: TrainingConfig = {
  goalType: GoalType.AI_BUILDER,
  name: 'AI Builder',
  subtitle: 'Build one small thing that actually works, using AI.',
  stepFlow: ['prePrompt', 'task1', 'bossMilestone', 'reflection'],
  stepLabels: {
    prePrompt: 'Project Scope',
    task1: 'Warm-up',
    bossMilestone: 'Build with AI',
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
- Each day scopes a BUILD STEP for the user's AI project
- Day title = what they'll build (e.g., "Email Summarizer with Claude API")
- Skills = AI concepts + implementation skills (e.g., ["prompt engineering", "API calls", "JSON parsing"])
- Progression: Day 1 = simple prompt → later days = chains, agents, integrations
- Each day produces a WORKING ARTIFACT the user can keep and use
- Focus on shipping, not perfection — "good enough to demo" is the bar
- hasBossProject: true — EVERY day must have a boss project milestone for the actual build`,

    dayCore: `AI BUILDER FORMAT:
The user is building an AI-powered project. Generate content that teaches concepts through building.

prePrompt:
- Concept explanation: Teach the AI concept/tool being used today
- Project scope: what to build today, why it's useful, what tools/APIs to use
- Expected output/artifact description
- "Ship criteria" — minimum viable version

task1 (sections format):
- Generate exactly 3 quiz questions — all tied to real-world use cases of today's AI concept
- Each question should present a practical scenario or use case, then test understanding
- e.g., "A startup wants to summarize customer emails. Which approach would you use?", "Your chatbot keeps hallucinating product prices. What's the most likely cause?"
- NO caseStudy field — the real-world context IS the question itself
- Every question must connect to the specific AI tool/concept the user will build with today

bossMilestone:
- Guide the user to produce a WORKING AI product step by step
- Provide existing code and prompt templates the user can start from
- Break the build into clear sequential steps: setup → implement → test → verify
- Include debugging guidance: common API errors, how to diagnose bad outputs, what to check when the AI returns unexpected results
- Show how to validate each step works (e.g., "Run this, you should see...")
- Include troubleshooting tips for common pitfalls (rate limits, token limits, malformed responses)

The tone should be builder-focused: practical, exciting, shipping-oriented.`,
  },
};
