import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CanonicalPerson, HouseholdResolverResult, PreviewAttributionDraft, PreviewRecord } from './types';
import type { FinalAttributionDraftMap, FinalHouseholdDraft } from './review-types';

type UseTransformHubReviewDraftsArgs = {
  householdResult: HouseholdResolverResult | null;
  peopleById: Map<string, CanonicalPerson>;
  previewRecords: PreviewRecord[];
  previewMatchByInputRef: Map<string, { matchedPersonId?: string | null }>;
  buildInitialHouseholdDraft: (household: HouseholdResolverResult['households'][number], members: CanonicalPerson[]) => FinalHouseholdDraft;
  buildInitialAttributionDraft: (record: PreviewRecord, members: CanonicalPerson[], primaryPerson: CanonicalPerson | null) => PreviewAttributionDraft;
  setFinalHouseholdDrafts: Dispatch<SetStateAction<Record<string, FinalHouseholdDraft>>>;
  setFinalAttributionDrafts: Dispatch<SetStateAction<FinalAttributionDraftMap>>;
  setOrganizationGraphDrafts: Dispatch<SetStateAction<Record<string, string>>>;
};

export function useTransformHubReviewDrafts({
  householdResult,
  peopleById,
  previewRecords,
  previewMatchByInputRef,
  buildInitialHouseholdDraft,
  buildInitialAttributionDraft,
  setFinalHouseholdDrafts,
  setFinalAttributionDrafts,
  setOrganizationGraphDrafts,
}: UseTransformHubReviewDraftsArgs) {
  useEffect(() => {
    if (!householdResult) {
      setFinalHouseholdDrafts({});
      setFinalAttributionDrafts({});
      setOrganizationGraphDrafts({});
      return;
    }

    setFinalHouseholdDrafts((current) =>
      Object.fromEntries(
        householdResult.households.map((household) => {
          const members = household.memberIds
            .map((memberId) => peopleById.get(memberId))
            .filter((member): member is CanonicalPerson => Boolean(member));
          return [household.id, current[household.id] ?? buildInitialHouseholdDraft(household, members)];
        }),
      ),
    );

    setFinalAttributionDrafts((current) =>
      Object.fromEntries(
        previewRecords.map((record) => {
          const matchedPerson = peopleById.get(previewMatchByInputRef.get(record.sourceRowRef)?.matchedPersonId ?? '') ?? null;
          const matchedHousehold = householdResult.households
            .find((household) => household.memberIds.includes(matchedPerson?.id ?? '')) ?? null;
          const members = matchedHousehold
            ?.memberIds.map((memberId) => peopleById.get(memberId))
            .filter((member): member is CanonicalPerson => Boolean(member)) ?? [];
          const existing = current[record.sourceRowRef] ?? buildInitialAttributionDraft(record, members, matchedPerson);
          return [record.sourceRowRef, {
            ...existing,
            householdId: existing.householdRemoved ? null : (existing.householdId ?? matchedHousehold?.id ?? null),
            householdRemoved: existing.householdRemoved === true,
            creditAmount: existing.creditAmount ?? null,
            campaignFund: existing.campaignFund || [record.campaignName, record.fund].filter(Boolean).join(' · '),
            notes: existing.notes ?? '',
          }];
        }),
      ) as FinalAttributionDraftMap,
    );

  }, [
    householdResult,
    peopleById,
    previewRecords,
    previewMatchByInputRef,
    buildInitialHouseholdDraft,
    buildInitialAttributionDraft,
    setFinalHouseholdDrafts,
    setFinalAttributionDrafts,
    setOrganizationGraphDrafts,
  ]);
}
