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
  bestFor: string;
  note: string;
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
