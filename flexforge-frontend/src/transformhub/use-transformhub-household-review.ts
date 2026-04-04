import { useMemo } from 'react';
import type { CanonicalPerson, HouseholdResolverResult, PreviewAttributionDraft, PreviewRecord } from './types';
import type { FinalAttributionDraftMap, FinalHouseholdDraft, HouseholdLayerView } from './review-types';

type UseTransformHubHouseholdReviewArgs = {
  householdResult: HouseholdResolverResult | null;
  peopleById: Map<string, CanonicalPerson>;
  removedPersonIdsByHousehold: Record<string, string[]>;
  finalHouseholdDrafts: Record<string, FinalHouseholdDraft>;
  finalAttributionDrafts: FinalAttributionDraftMap;
  previewMatchByInputRef: Map<string, { matchedPersonId?: string | null }>;
  mergedSourceRefsByRepresentative: Map<string, string[]>;
  representativeByAbsorbedRef: Map<string, string>;
  buildInitialHouseholdDraft: (household: HouseholdResolverResult['households'][number], members: CanonicalPerson[]) => FinalHouseholdDraft;
  buildInitialAttributionDraft: (record: PreviewRecord, members: CanonicalPerson[], primaryPerson: CanonicalPerson | null) => PreviewAttributionDraft;
  summarizeAttributionDraft: (draft: PreviewAttributionDraft, members: CanonicalPerson[], primaryPerson: CanonicalPerson | null) => string;
  previewRecordLabel: (record: PreviewRecord) => string;
  parseCurrencyAmount: (value: unknown) => number | null;
  previewRecords: PreviewRecord[];
  ambiguousAttributionRefs: Set<string>;
};

function buildDisplayMemberKey(person: Pick<CanonicalPerson, 'firstName' | 'lastName' | 'email' | 'id'> | null | undefined): string {
  if (!person) return '';
  const nameKey = [person.firstName, person.lastName]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join('|');
  const emailKey = String(person.email ?? '').trim().toLowerCase();
  return nameKey || emailKey || person.id;
}

export function useTransformHubHouseholdReview({
  householdResult,
  peopleById,
  removedPersonIdsByHousehold,
  finalHouseholdDrafts,
  finalAttributionDrafts,
  previewMatchByInputRef,
  mergedSourceRefsByRepresentative,
  representativeByAbsorbedRef,
  buildInitialHouseholdDraft,
  buildInitialAttributionDraft,
  summarizeAttributionDraft,
  previewRecordLabel,
  parseCurrencyAmount,
  previewRecords,
  ambiguousAttributionRefs,
}: UseTransformHubHouseholdReviewArgs) {
  return useMemo<HouseholdLayerView[]>(() => {
    if (!householdResult) return [];
    const householdByPersonId = new Map<string, string>();
    householdResult.households.forEach((household) => {
      const removedMemberIds = new Set(removedPersonIdsByHousehold[household.id] ?? []);
      household.memberIds
        .filter((memberId) => !removedMemberIds.has(memberId))
        .forEach((memberId) => householdByPersonId.set(memberId, household.id));
    });
    const getRecordClusterRefs = (record: PreviewRecord) => {
      const representativeRef = representativeByAbsorbedRef.get(record.sourceRowRef) ?? record.sourceRowRef;
      return [representativeRef, ...(mergedSourceRefsByRepresentative.get(representativeRef) ?? [])];
    };
    const getRecordClusterContext = (record: PreviewRecord) => {
      const personIds = Array.from(new Set(
        getRecordClusterRefs(record)
          .map((ref) => previewMatchByInputRef.get(ref)?.matchedPersonId ?? null)
          .filter((personId): personId is string => Boolean(personId)),
      ));
      const householdIds = Array.from(new Set(
        personIds
          .map((personId) => householdByPersonId.get(personId) ?? null)
          .filter((householdId): householdId is string => Boolean(householdId)),
      ));
      return {
        personIds,
        householdIds,
        matchedPerson: personIds.length === 1 ? peopleById.get(personIds[0]) ?? null : null,
      };
    };
    return householdResult.households.map((household) => {
      const removedMemberIds = new Set(removedPersonIdsByHousehold[household.id] ?? []);
      const rawMembers = household.memberIds
        .filter((memberId) => !removedMemberIds.has(memberId))
        .map((memberId) => peopleById.get(memberId))
        .filter((member): member is CanonicalPerson => Boolean(member));
      const displayMemberGroups = Array.from(
        rawMembers.reduce((groups, member) => {
          const key = buildDisplayMemberKey(member);
          const current = groups.get(key) ?? [];
          current.push(member);
          groups.set(key, current);
          return groups;
        }, new Map<string, CanonicalPerson[]>()),
      );
      const members = displayMemberGroups.map(([, groupedMembers]) => groupedMembers[0]).filter(Boolean);
      const draft = finalHouseholdDrafts[household.id] ?? buildInitialHouseholdDraft(household, rawMembers);
      const primaryMember = rawMembers.find((member) => member.id === draft.primaryPersonId) ?? members[0] ?? rawMembers[0] ?? null;
      const relatedRecords = previewRecords.filter((record) => {
        const clusterContext = getRecordClusterContext(record);
        const defaultHouseholdId = clusterContext.householdIds.length === 1 ? clusterContext.householdIds[0] : null;
        const attributionDraft = finalAttributionDrafts[record.sourceRowRef];
        const assignedHouseholdId = attributionDraft?.householdRemoved
          ? null
          : (attributionDraft?.householdId ?? defaultHouseholdId);
        return assignedHouseholdId === household.id;
      });
      const memberBreakdown = displayMemberGroups.map(([, groupedMembers]) => {
        const representative = groupedMembers[0];
        const groupedMemberIds = new Set(groupedMembers.map((member) => member.id));
        const memberRecords = relatedRecords.filter((record) => {
          const matchedPerson = getRecordClusterContext(record).matchedPerson;
          const attributionDraft = finalAttributionDrafts[record.sourceRowRef] ?? buildInitialAttributionDraft(record, rawMembers, matchedPerson);
          const assignedPersonId = attributionDraft.primaryPersonId ?? matchedPerson?.id ?? null;
          return assignedPersonId ? groupedMemberIds.has(assignedPersonId) : false;
        });
        const totals = memberRecords
          .map((record) => {
            const matchedPerson = getRecordClusterContext(record).matchedPerson;
            const attributionDraft = finalAttributionDrafts[record.sourceRowRef] ?? buildInitialAttributionDraft(record, rawMembers, matchedPerson);
            return attributionDraft.creditAmount ?? parseCurrencyAmount(record.amount);
          })
          .filter((amount): amount is number => amount !== null);
        return {
          personId: representative.id,
          name: [representative.firstName, representative.lastName].filter(Boolean).join(' ').trim() || representative.id,
          total: totals.reduce((sum, amount) => sum + amount, 0),
          giftCount: memberRecords.length,
        };
      });
      const amounts = relatedRecords
        .map((record) => {
          const matchedPerson = getRecordClusterContext(record).matchedPerson;
          const attributionDraft = finalAttributionDrafts[record.sourceRowRef] ?? buildInitialAttributionDraft(record, rawMembers, matchedPerson);
          return attributionDraft.creditAmount ?? parseCurrencyAmount(record.amount);
        })
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
        const matchedPerson = getRecordClusterContext(record).matchedPerson;
        const draft = finalAttributionDrafts[record.sourceRowRef] ?? buildInitialAttributionDraft(record, rawMembers, matchedPerson ?? null);
        const organization = draft.organizationName ? `${draft.organizationName} context` : null;
        const campaignFund = draft.campaignFund || [record.campaignName, record.fund].filter(Boolean).join(' · ');
        const summary = summarizeAttributionDraft(draft, members, matchedPerson ?? null);
        return {
          recordId: record.id,
          sourceRowRef: record.sourceRowRef,
          label: previewRecordLabel(record),
          amount: draft.creditAmount ?? parseCurrencyAmount(record.amount),
          summary: [summary, campaignFund, organization, draft.notes || null].filter(Boolean).join(' · '),
          draft,
        };
      });
      const alerts: string[] = [];
      const hasAmbiguousAttribution = relatedRecords.some((record) => ambiguousAttributionRefs.has(record.sourceRowRef));
      const memberEmails = rawMembers.map((member) => member.email.trim()).filter(Boolean);
      const uniqueEmails = new Set(memberEmails.map((email) => email.toLowerCase()));
      if (memberEmails.length > 1 && uniqueEmails.size === 1) {
        alerts.push(`Both members share the same email — ${memberEmails[0]}. Verify before mailing.`);
      }
      const hasAttributionComplexity = attributionPreview.some((item) => item.draft.mode !== 'person');
      const hasNoGivingHistory = amounts.length === 0;
      const status = hasAmbiguousAttribution
        ? { tone: 'warning' as const, label: 'Needs attribution', note: 'Multiple household members appear tied to the same gift. Review attribution manually.' }
        : hasAttributionComplexity
        ? { tone: 'info' as const, label: 'Attribution', note: 'Has split, soft credit, or organization match logic.' }
        : hasNoGivingHistory
          ? { tone: 'warning' as const, label: 'Review', note: 'Household exists, but linked giving rows are still missing.' }
          : { tone: 'ready' as const, label: 'Complete', note: 'Communication and giving context are internally consistent.' };
      return {
        householdId: household.id,
        members,
        relatedRecords,
        draft,
        communication: {
          addressee: draft.addressee,
          formalSalutation: draft.formalSalutation,
          informalSalutation: draft.informalSalutation,
          primaryLabel: primaryMember ? [primaryMember.firstName, primaryMember.lastName].filter(Boolean).join(' ').trim() || primaryMember.id : 'Unset',
        },
        reporting: {
          householdTotal: amounts.reduce((sum, amount) => sum + amount, 0),
          largestGift: amounts.length > 0 ? Math.max(...amounts) : 0,
          lastGift,
          yearsGiving: years.size,
          giftCount: relatedRecords.length,
          memberBreakdown,
        },
        status,
        alerts,
        attributionPreview,
      };
    });
  }, [
    householdResult,
    peopleById,
    finalHouseholdDrafts,
    finalAttributionDrafts,
    previewMatchByInputRef,
    removedPersonIdsByHousehold,
    buildInitialHouseholdDraft,
    buildInitialAttributionDraft,
    summarizeAttributionDraft,
    previewRecordLabel,
    parseCurrencyAmount,
    previewRecords,
    ambiguousAttributionRefs,
    mergedSourceRefsByRepresentative,
    representativeByAbsorbedRef,
  ]);
}
