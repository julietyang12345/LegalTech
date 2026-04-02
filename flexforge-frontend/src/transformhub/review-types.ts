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
  communication: {
    addressee: string;
    formalSalutation: string;
    informalSalutation: string;
    primaryLabel: string;
  };
  reporting: {
    householdTotal: number;
    largestGift: number;
    lastGift: string | null;
    yearsGiving: number;
    giftCount: number;
    memberBreakdown: Array<{
      personId: string;
      name: string;
      total: number;
      giftCount: number;
    }>;
  };
  status: {
    tone: 'ready' | 'warning' | 'info';
    label: string;
    note: string;
  };
  alerts: string[];
  attributionPreview: Array<{
    recordId: string;
    sourceRowRef: string;
    label: string;
    amount: number | null;
    summary: string;
    draft: PreviewAttributionDraft;
  }>;
};
