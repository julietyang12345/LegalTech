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
Apply to foundationCards content, examples, and task content and task explanations where it fits naturally. Not required.`);
  }

  // Less-of areas - prefer to avoid, but not required
  if (personalization.lessOfAreas?.length) {
    parts.push(`USER WANTS LESS OF: ${personalization.lessOfAreas.join(', ')}
When choosing foundationCards content, examples, pask content and task explanations, refer ones not focused on these areas. Not required - include if essential to the topic.`);
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
- Card 1 should be an INTRO/RECAP connecting to this previous content
- Reference yesterday's concepts when building new understanding`);
  }

  // Boss project context (for project-based curricula)
  if (isProjectBased && continuity.bossProjectTarget) {
    parts.push(`BOSS PROJECT TARGET: "${continuity.bossProjectTarget}"
- All content should build toward this final project
- bossMilestone.dayContribution should explain how today's work helps the project
- bossMilestone.conceptConnection should link to a foundationCard concept`);

    if (continuity.bossProjectProgress) {
      parts.push(`BOSS PROJECT PROGRESS (what user has built so far):
${continuity.bossProjectProgress}
- Today's bossMilestone should build on this existing work
- Starter code should continue from where they left off`);
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
 * Ensures task1, bossMilestone, and intensivePractice reference today's foundation cards.
 *
 * @param foundationCardConcepts - Concepts from today's foundation cards
 */
export function buildContentReferenceInstructions(
  ctx: ContentGenerationContext,
): string {
  const concepts = ctx.generatedContent?.foundationCardConcepts;

  if (!concepts || concepts.length === 0) {
    return '';
  }

  return `
TODAY'S FOUNDATION CONCEPTS (reference these in task1, bossMilestone, intensivePractice):
${concepts.map((c, i) => `${i + 1}. ${c}`).join('\n')}

IMPORTANT:
- task1 questions should ONLY test these concepts (no new knowledge)
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
