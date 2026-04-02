import type { CanonicalPerson, PreviewAttributionDraft, PreviewRecord } from './types';

export type FinalHouseholdDraft = {
  label: string;
  primaryPersonId: string | null;
  formalSalutation: string;
  informalSalutation: string;
  eventSalutation: string;
  addressee: string;
};

export type FinalAttributionDraftMap = Record<string, PreviewAttributionDraft>;

export type HouseholdLayerView = {
  householdId: string;
  members: CanonicalPerson[];
  relatedRecords: PreviewRecord[];
  draft: FinalHouseholdDraft;
  reporting: {
    householdTotal: number;
    largestGift: number;
    lastGift: string | null;
    yearsGiving: number;
  };
  attributionPreview: Array<{
    recordId: string;
    sourceRowRef: string;
    label: string;
    amount: number | null;
    summary: string;
    draft: PreviewAttributionDraft;
  }>;
};
