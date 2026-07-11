import type { LucideIcon } from 'lucide-react';

export type ChallengeCard = {
  title: string;
  copy: string;
};

export type ResourceCard = {
  icon: LucideIcon;
  title: string;
  copy: string;
};

export type ProviderOption = {
  title: string;
  slug: ProviderTypeSlug;
  fit: string;
  bestFor: string;
  note: string;
};

export type ProviderTypeSlug = 'therapists' | 'sports-psychologists' | 'performance-coaches';

export type ProviderDirectoryItem = {
  name: string;
  credentials: string;
  state: string;
  telehealth: boolean;
  focus: string;
  insurance: string;
  type: ProviderTypeSlug;
};

export type AssessmentOption = {
  title: string;
  detail: string;
};

export type AthleteStory = {
  quote: string;
  context: string;
  image: string;
  imageAlt: string;
};
