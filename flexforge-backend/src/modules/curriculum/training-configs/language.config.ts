import { GoalType } from '../../../database/entities/session.entity';
import { TrainingConfig } from './types';

export const languageConfig: TrainingConfig = {
  goalType: GoalType.LANGUAGE,
  name: 'Speak & Write',
  subtitle: 'Master any language — from basics to professional fluency.',
  stepFlow: ['prePrompt', 'task1', 'reflection'],
  stepLabels: {
    prePrompt: "Today's Lesson",
    task1: 'Exercises',
    reflection: 'Reflect',
  },
  scenarioTypes: [
    'daily_conversation',
    'workplace_meeting',
    'email_writing',
    'negotiation',
    'presentation',
    'small_talk',
  ],
  subskills: [
    'grammar',
    'vocabulary',
    'pronunciation',
    'listening',
    'writing',
    'speaking',
    'professional_communication',
  ],
  hasTimedAttempt: false,
  scoringType: 'none',
  defaultTimerMinutes: 0,
  promptOverrides: {
    skeleton: `LANGUAGE TRAINING MODE:
- Each day teaches a grammar/vocabulary/communication concept
- Day title = topic + context (e.g., "Polite Requests in Business Settings")
- Skills = specific language subskills (e.g., ["modal verbs", "formal register", "email phrases"])
- Progression: fundamentals → situational usage → professional fluency
- Mix exercise types: quiz, matching, fillBlank, translation, reorder, typing, roleplay, rewrite
- Professional context users: weight toward workplace roleplay, rewrite, translation
- General/beginner users: balanced mix weighted toward quiz, matching, fillBlank, typing`,

    dayCore: `LANGUAGE EXERCISE FORMAT:
Generate language learning content with:

prePrompt:
- Concept/grammar explanation: Teach the language point clearly with examples
- 2-3 inline warm-up questions (translation or recognition)
- New vocabulary/phrases introduced for today
- Context for how today's language is used in real life

task1 (sections format):
- Use LANGUAGE_SECTION_REGISTRY section types: quiz, matching, toneSelect, fillBlank, translation, reorder, typing
- ALSO include roleplay sections: realistic dialogue scenarios appropriate to level
  - Beginner: ordering food, asking directions, introducing yourself
  - Professional: weekly standup, client email, disagreement resolution
- ALSO include rewrite sections: improve a weak/unclear text
  - Beginner: fix grammar/word choice in simple sentences
  - Professional: rewrite emails, messages, or reports for clarity and tone
- Each section should have audioText for TTS pronunciation
- Include romanization for non-Latin scripts

All exercises use the existing section format — roleplay and rewrite are new section types
added to the language section registry.`,
  },
};
