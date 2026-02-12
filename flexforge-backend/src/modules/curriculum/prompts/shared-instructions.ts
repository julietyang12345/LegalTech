/**
 * Shared Instruction Builders
 *
 * Reusable instruction builders for curriculum prompts.
 * These ensure consistent personalization and continuity across all content types.
 */

import { ContentGenerationContext } from './content-generation-context';

/**
 * Build personalization instructions from context.
 * Used in both core and deferred prompts.
 *
 * Generates instructions for:
 * - Improvement areas (soft preference)
 * - Less-of areas (soft preference)
 * - Confused concepts (add review)
 * - Foggy understanding (adjust content style)
 * - Low confidence (add scaffolding)
 */
export function buildPersonalizationInstructions(
  ctx: ContentGenerationContext,
): string {
  const parts: string[] = [];
  const { personalization } = ctx;

  // Improvement areas - apply where it fits naturally
  if (personalization.improvementAreas?.length) {
    parts.push(`USER WANTS TO IMPROVE: ${personalization.improvementAreas.join(', ')}
Apply to task1 questions, explanations, and examples where it fits naturally. Not required.`);
  }

  // Less-of areas - prefer to avoid, but not required
  if (personalization.lessOfAreas?.length) {
    parts.push(`USER WANTS LESS OF: ${personalization.lessOfAreas.join(', ')}
When choosing task1 question topics, examples, and explanations, prefer ones not focused on these areas. Not required - include if essential to the topic.`);
  }

  // Handle "what's foggy" - adjust content based on user's confusion type
  if (personalization.whatsFoggy) {
    const foggyInstructions: Record<string, string> = {
      when: `YESTERDAY FEEDBACK: User was unclear on WHEN to apply concepts.
- Add clear "use this when..." context to examples
- Include real-world scenarios showing appropriate timing and situations
- Contrast "good fit" vs "bad fit" situations`,
      how: `YESTERDAY FEEDBACK: User struggled with HOW to apply concepts.
- Include step-by-step application examples
- Show practical implementation with clear before/after demonstrations
- Break down complex operations into smaller steps`,
      connection: `YESTERDAY FEEDBACK: User had trouble seeing HOW CONCEPTS CONNECT.
- Explicitly show relationships between ideas
- Use "this builds on..." and "this relates to..." framing
- Reference previous concepts when introducing new ones`,
      everything: `YESTERDAY FEEDBACK: User found everything confusing.
- Start with a brief 2-3 sentence recap of key points
- Use simpler examples and build up gradually
- Avoid introducing too many concepts at once`,
    };
    parts.push(foggyInstructions[personalization.whatsFoggy] || '');
  }

  // Confused concepts - add targeted review
  if (personalization.confusedConcepts?.length) {
    parts.push(`REVIEW NEEDED: User was confused about [${personalization.confusedConcepts.join(', ')}].
If today's content builds on these, include a brief clarifying example. Reference these concepts when relevant to reinforce understanding.`);
  }

  // Low confidence - add encouragement and scaffolding
  if (personalization.confidence && personalization.confidence < 3) {
    parts.push(`SCAFFOLDING: User had low confidence yesterday (${personalization.confidence}/5).
- Use encouraging framing
- Break down complex steps
- Provide more hints and context
- Celebrate small wins`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `
PERSONALIZATION CONTEXT:
${parts.join('\n\n')}
`;
}

/**
 * Build continuity instructions from context.
 * Used for maintaining narrative flow across days.
 *
 * Generates instructions for:
 * - Previous day connection
 * - Boss project context and progress
 */
export function buildContinuityInstructions(
  ctx: ContentGenerationContext,
): string {
  const parts: string[] = [];
  const { continuity, isProjectBased } = ctx;

  // Previous day connection
  if (continuity.previousDayTitle) {
    parts.push(`PREVIOUS DAY: "${continuity.previousDayTitle}"
- First question should RECAP/connect to previous content
- Reference yesterday's concepts when building new understanding`);
  }

  // Boss project context (for project-based curricula)
  if (isProjectBased && continuity.bossProjectTarget) {
    parts.push(`BOSS PROJECT TARGET: "${continuity.bossProjectTarget}"
- All content should build toward this final project
- bossMilestone.dayContribution should explain how today's work helps the project
- bossMilestone.conceptConnection should link to a task1 concept`);

    if (continuity.bossProjectProgress) {
      parts.push(`BOSS PROJECT PROGRESS (what user has built so far):
${continuity.bossProjectProgress}
- Today's bossMilestone should build on this existing work
- Starter code should continue from where they left off`);
    }

    // Include previous day's actual code for cumulative building
    if (continuity.previousDayCode) {
      console.log(`[ContinuityInstructions] Including previous day code in prompt (length: ${continuity.previousDayCode.length})`);
      parts.push(`CUMULATIVE CODE REQUIREMENT

PREVIOUS DAY'S CODE (Day ${ctx.dayNumber - 1}):
\`\`\`
${continuity.previousDayCode}
\`\`\`

TODAY'S CODE MUST BE CUMULATIVE - THIS IS MANDATORY:
1. SAME FILE: Today's solutionCode should be the SAME file as above, with NEW code ADDED
2. KEEP ALL EXISTING CODE: Include ALL the code from above, then add today's new functionality
3. DO NOT create a different file or endpoint - extend the existing one
4. The output should be ONE complete file that includes yesterday's code PLUS today's additions

✅ CORRECT APPROACH:
- Take the EXACT code above as your starting point
- ADD new functionality by modifying existing functions OR adding new helper functions
- ENHANCE existing code with new features
- You CAN add new imports, new helper functions - just integrate them into the same file

❌ WRONG APPROACH:
- Creating a different file or endpoint
- Appending new code at the bottom without integrating with existing code
- Duplicating logic that already exists

EXAMPLE of correct cumulative building:
Day 1 code:
\`\`\`python
def fetch_data(url):
    response = requests.get(url)
    return response.text
\`\`\`

Day 2 solutionCode (enhanced version):
\`\`\`python
def fetch_data(url):
    # Day 2: Enhanced with error handling
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return response.text
    except requests.RequestException:
        return None

# Day 2: Added helper function
def validate_response(data):
    return data and len(data) > 0
\`\`\`

Your solutionCode for Day ${ctx.dayNumber} MUST be ONE complete file containing Day ${ctx.dayNumber - 1}'s code with today's enhancements/additions.`);
    } else {
      console.log(`[ContinuityInstructions] No previous day code available for cumulative building`);
    }
  }

  if (parts.length === 0) {
    return '';
  }

  return `
CONTINUITY CONTEXT:
${parts.join('\n\n')}
`;
}

/**
 * Build content reference instructions for deferred prompts.
 * Ensures bossMilestone and intensivePractice reference today's task1 concepts.
 *
 * @param task1Concepts - Concepts from today's task1 questions
 */
export function buildContentReferenceInstructions(
  ctx: ContentGenerationContext,
): string {
  const concepts = ctx.generatedContent?.task1Concepts;

  if (!concepts || concepts.length === 0) {
    return '';
  }

  return `
TODAY'S CORE CONCEPTS (from task1 - reference these in bossMilestone, intensivePractice):
${concepts.map((c, i) => `${i + 1}. ${c}`).join('\n')}

IMPORTANT:
- bossMilestone.conceptConnection should reference one of these concepts
- intensivePractice can introduce NEW concepts, but should build on these
`;
}

/**
 * Combine all shared instructions for a complete context header.
 * Use this in deferred prompt builders for full context.
 */
export function buildFullContextInstructions(
  ctx: ContentGenerationContext,
): string {
  const parts: string[] = [];

  const personalization = buildPersonalizationInstructions(ctx);
  if (personalization) {
    parts.push(personalization);
  }

  const continuity = buildContinuityInstructions(ctx);
  if (continuity) {
    parts.push(continuity);
  }

  const contentRef = buildContentReferenceInstructions(ctx);
  if (contentRef) {
    parts.push(contentRef);
  }

  return parts.join('\n');
}
