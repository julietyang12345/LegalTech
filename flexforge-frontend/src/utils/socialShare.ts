import type { Session, CurriculumDay } from '@/types';

export function buildShareText(session: Session, currentDay: CurriculumDay): string {
  const concepts = currentDay.foundationCards
    ?.slice(0, 4)
    .map((c) => c.concept)
    .join(', ');

  const lines = [
    `Day ${currentDay.day}/${session.durationDays} of learning ${session.skillName} complete!`,
  ];

  if (concepts) {
    lines.push(`Covered: ${concepts}`);
  }

  if (currentDay.bossMilestone?.title) {
    lines.push(`Project: ${currentDay.bossMilestone.title}`);
  }

  lines.push('', 'Learning with FlexForge');

  return lines.join('\n');
}

export async function shareNative(content: string): Promise<boolean> {
  if (!navigator.share) return false;
  try {
    await navigator.share({ text: content });
    return true;
  } catch {
    return false;
  }
}

export function shareToTwitter(content: string): void {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(content)}`;
  window.open(url, '_blank', 'noopener,noreferrer,width=550,height=420');
}

export function shareToLinkedIn(content: string): void {
  const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://flexforge.app')}&summary=${encodeURIComponent(content)}`;
  window.open(url, '_blank', 'noopener,noreferrer,width=550,height=520');
}

export async function copyShareText(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}
