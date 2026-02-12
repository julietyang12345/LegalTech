/**
 * Extract concept names from task1 sections.
 * Used by ReflectionStep, AchievementCard, socialShare.
 * Falls back to foundationCards for backward compat with old cached data.
 */
export function extractConceptsFromTask1(task1: any, day?: any): string[] {
  // New format: extract conceptTitle from task1 sections
  if (task1?.sections && Array.isArray(task1.sections)) {
    const concepts: string[] = [];
    for (const section of task1.sections) {
      const items = section.questions || section.items || [];
      for (const item of items) {
        if (item.conceptTitle) {
          concepts.push(item.conceptTitle);
        }
      }
    }
    if (concepts.length > 0) {
      return [...new Set(concepts)]; // Deduplicate
    }
  }

  // Legacy quiz format: extract from questions
  if (task1?.questions && Array.isArray(task1.questions)) {
    const concepts: string[] = [];
    for (const q of task1.questions) {
      if (q.conceptTitle) {
        concepts.push(q.conceptTitle);
      }
    }
    if (concepts.length > 0) {
      return [...new Set(concepts)];
    }
  }

  // Backward compat: extract from foundationCards (old cached data)
  if (day) {
    const cards = day.languageFoundationCards || day.foundationCards;
    if (cards && Array.isArray(cards)) {
      return cards
        .map((card: any) => card.vocabulary?.term || card.concept || '')
        .filter((concept: string) => concept.length > 0);
    }
  }

  return [];
}
