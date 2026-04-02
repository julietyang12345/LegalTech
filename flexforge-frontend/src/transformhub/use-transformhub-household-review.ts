import { useMemo } from 'react';
import type { CanonicalPerson, HouseholdResolverResult, PreviewAttributionDraft, PreviewRecord } from './types';
import type { FinalAttributionDraftMap, FinalHouseholdDraft, HouseholdLayerView } from './review-types';

type UseTransformHubHouseholdReviewArgs = {
  householdResult: HouseholdResolverResult | null;
  peopleById: Map<string, CanonicalPerson>;
  finalHouseholdDrafts: Record<string, FinalHouseholdDraft>;
  finalAttributionDrafts: FinalAttributionDraftMap;
  relatedPreviewRecordsByPersonId: Map<string, PreviewRecord[]>;
  previewMatchByInputRef: Map<string, { matchedPersonId?: string | null }>;
  buildInitialHouseholdDraft: (household: HouseholdResolverResult['households'][number], members: CanonicalPerson[]) => FinalHouseholdDraft;
  buildInitialAttributionDraft: (record: PreviewRecord, members: CanonicalPerson[], primaryPerson: CanonicalPerson | null) => PreviewAttributionDraft;
  summarizeAttributionDraft: (draft: PreviewAttributionDraft, members: CanonicalPerson[], primaryPerson: CanonicalPerson | null) => string;
  previewRecordLabel: (record: PreviewRecord) => string;
  parseCurrencyAmount: (value: unknown) => number | null;
};

export function useTransformHubHouseholdReview({
  householdResult,
  peopleById,
  finalHouseholdDrafts,
  finalAttributionDrafts,
  relatedPreviewRecordsByPersonId,
  previewMatchByInputRef,
  buildInitialHouseholdDraft,
  buildInitialAttributionDraft,
  summarizeAttributionDraft,
  previewRecordLabel,
  parseCurrencyAmount,
}: UseTransformHubHouseholdReviewArgs) {
  return useMemo<HouseholdLayerView[]>(() => {
    if (!householdResult) return [];
    return householdResult.households.map((household) => {
      const members = household.memberIds
        .map((memberId) => peopleById.get(memberId))
        .filter((member): member is CanonicalPerson => Boolean(member));
      const draft = finalHouseholdDrafts[household.id] ?? buildInitialHouseholdDraft(household, members);
      const relatedRecords = Array.from(
        new Map(
          household.memberIds
            .flatMap((memberId) => relatedPreviewRecordsByPersonId.get(memberId) ?? [])
            .map((record) => [record.sourceRowRef, record]),
        ).values(),
      );
      const amounts = relatedRecords
        .map((record) => parseCurrencyAmount(record.amount))
        .filter((amount): amount is number => amount !== null);
      const years = new Set(
        relatedRecords
          .map((record) => String(record.date || record.createdAt || '').slice(0, 4))
          .filter((value) => /^\d{4}$/.test(value)),
      );
      const giftDates = relatedRecords
        .map((record) => record.date || record.createdAt || null)
        .filter((value): value is string => Boolean(value))
        .sort();
      const lastGift = giftDates.length > 0 ? giftDates[giftDates.length - 1] : null;
      const attributionPreview = relatedRecords.map((record) => {
        const matchedPerson = peopleById.get(previewMatchByInputRef.get(record.sourceRowRef)?.matchedPersonId ?? '');
        const draft = finalAttributionDrafts[record.sourceRowRef] ?? buildInitialAttributionDraft(record, members, matchedPerson ?? null);
        const organization = draft.organizationName ? `${draft.organizationName} context` : null;
        const summary = summarizeAttributionDraft(draft, members, matchedPerson ?? null);
        return {
          recordId: record.id,
          sourceRowRef: record.sourceRowRef,
          label: previewRecordLabel(record),
          amount: parseCurrencyAmount(record.amount),
          summary: [summary, organization].filter(Boolean).join(' · '),
          draft,
        };
      });
      return {
        householdId: household.id,
        members,
        relatedRecords,
        draft,
        reporting: {
          householdTotal: amounts.reduce((sum, amount) => sum + amount, 0),
          largestGift: amounts.length > 0 ? Math.max(...amounts) : 0,
          lastGift,
          yearsGiving: years.size,
        },
        attributionPreview,
      };
    });
  }, [
    householdResult,
    peopleById,
    finalHouseholdDrafts,
    finalAttributionDrafts,
    relatedPreviewRecordsByPersonId,
    previewMatchByInputRef,
    buildInitialHouseholdDraft,
    buildInitialAttributionDraft,
    summarizeAttributionDraft,
    previewRecordLabel,
    parseCurrencyAmount,
  ]);
}
