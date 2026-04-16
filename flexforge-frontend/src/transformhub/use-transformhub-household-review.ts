import { useMemo } from 'react';
import type { CanonicalPerson, HouseholdResolverResult, PreviewAttributionDraft, PreviewRecord } from './types';
import type { FinalAttributionDraftMap, FinalHouseholdDraft, HouseholdLayerView } from './review-types';

type UseTransformHubHouseholdReviewArgs = {
  householdResult: HouseholdResolverResult | null;
  peopleById: Map<string, CanonicalPerson>;
  removedPersonIdsByHousehold: Record<string, string[]>;
  finalHouseholdDrafts: Record<string, FinalHouseholdDraft>;
  finalAttributionDrafts: FinalAttributionDraftMap;
  embeddedHouseholdDrafts: Record<string, Record<string, PreviewAttributionDraft>>;
  previewMatchByInputRef: Map<string, { matchedPersonId?: string | null }>;
  mergedSourceRefsByRepresentative: Map<string, string[]>;
  representativeByAbsorbedRef: Map<string, string>;
  buildInitialHouseholdDraft: (household: HouseholdResolverResult['households'][number], members: CanonicalPerson[]) => FinalHouseholdDraft;
  buildInitialAttributionDraft: (record: PreviewRecord, members: CanonicalPerson[], primaryPerson: CanonicalPerson | null) => PreviewAttributionDraft;
  summarizeAttributionDraft: (draft: PreviewAttributionDraft, members: CanonicalPerson[], primaryPerson: CanonicalPerson | null) => string;
  previewRecordLabel: (record: PreviewRecord) => string;
  parseCurrencyAmount: (value: unknown) => number | null;
  getPreviewRecordBaseAmount: (record: PreviewRecord | null | undefined) => number | null;
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

function isAttributionDraftRemoved(draft: PreviewAttributionDraft): boolean {
  return draft.householdRemoved === true && !draft.primaryPersonId && !draft.secondaryPersonId;
}

function getMemberRoleForDraft(
  draft: PreviewAttributionDraft,
  memberId: string,
): 'primary' | 'secondary' | 'unassigned' {
  if (isAttributionDraftRemoved(draft)) return 'unassigned';
  if (draft.secondaryPersonId === memberId) return 'secondary';
  if (draft.primaryPersonId === memberId) return 'primary';
  return 'unassigned';
}

function getEffectiveCreditAmount(
  draft: PreviewAttributionDraft,
  rawAmount: number | null,
  role: 'primary' | 'secondary' | 'unassigned' = 'primary',
): number {
  const baseAmount = draft.creditAmount ?? rawAmount ?? 0;
  if (draft.mode === 'soft_credit') return 0;
  if (draft.mode === 'joint_split') {
    const pct = role === 'secondary' ? Math.max(0, 100 - draft.splitPercent) : draft.splitPercent;
    return Math.round((baseAmount * (pct / 100)) * 100) / 100;
  }
  return role === 'unassigned' ? 0 : baseAmount;
}

export function useTransformHubHouseholdReview({
  householdResult,
  peopleById,
  removedPersonIdsByHousehold,
  finalHouseholdDrafts,
  finalAttributionDrafts,
  embeddedHouseholdDrafts,
  previewMatchByInputRef,
  mergedSourceRefsByRepresentative,
  representativeByAbsorbedRef,
  buildInitialHouseholdDraft,
  buildInitialAttributionDraft,
  summarizeAttributionDraft,
  previewRecordLabel,
  parseCurrencyAmount,
  getPreviewRecordBaseAmount,
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
      const getActiveAttributionDraft = (record: PreviewRecord, matchedPerson: CanonicalPerson | null) => {
        const persistedDraft = finalAttributionDrafts[record.sourceRowRef] ?? buildInitialAttributionDraft(record, rawMembers, matchedPerson);
        return embeddedHouseholdDrafts[household.id]?.[record.sourceRowRef] ?? persistedDraft;
      };
      const relatedRecords = previewRecords.filter((record) => {
        const clusterContext = getRecordClusterContext(record);
        const defaultHouseholdId = clusterContext.householdIds.length === 1 ? clusterContext.householdIds[0] : null;
        const attributionDraft = getActiveAttributionDraft(record, clusterContext.matchedPerson);
        const assignedHouseholdId = attributionDraft?.householdRemoved
          ? null
          : (attributionDraft?.householdId ?? defaultHouseholdId);
        return assignedHouseholdId === household.id;
      });
      const memberBreakdown = displayMemberGroups.map(([, groupedMembers]) => {
        const representative = groupedMembers[0];
        const groupedMemberIds = new Set(groupedMembers.map((member) => member.id));
        const memberRows = relatedRecords.map((record) => {
          const matchedPerson = getRecordClusterContext(record).matchedPerson;
          const attributionDraft = getActiveAttributionDraft(record, matchedPerson);
          const matchingMemberId = groupedMembers.find((member) => getMemberRoleForDraft(attributionDraft, member.id) !== 'unassigned')?.id ?? null;
          if (!matchingMemberId || !groupedMemberIds.has(matchingMemberId)) return null;
          const role = getMemberRoleForDraft(attributionDraft, matchingMemberId);
          return {
            amount: getEffectiveCreditAmount(attributionDraft, getPreviewRecordBaseAmount(record), role),
            countsAsGift: role !== 'unassigned',
          };
        }).filter((row): row is { amount: number; countsAsGift: boolean } => Boolean(row));
        const totals = memberRows
          .map((row) => row.amount);
        return {
          personId: representative.id,
          name: [representative.firstName, representative.lastName].filter(Boolean).join(' ').trim() || representative.id,
          total: totals.reduce((sum, amount) => sum + amount, 0),
          giftCount: memberRows.filter((row) => row.countsAsGift).length,
        };
      });
      const amounts = relatedRecords
        .map((record) => {
          const matchedPerson = getRecordClusterContext(record).matchedPerson;
          const attributionDraft = getActiveAttributionDraft(record, matchedPerson);
          return getEffectiveCreditAmount(attributionDraft, getPreviewRecordBaseAmount(record));
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
        const draft = getActiveAttributionDraft(record, matchedPerson ?? null);
        const organization = draft.organizationName ? `${draft.organizationName} context` : null;
        const campaignFund = draft.campaignFund || [record.campaignName, record.fund].filter(Boolean).join(' · ');
        const summary = summarizeAttributionDraft(draft, members, matchedPerson ?? null);
        return {
          recordId: record.id,
          sourceRowRef: record.sourceRowRef,
          label: previewRecordLabel(record),
          amount: getEffectiveCreditAmount(draft, getPreviewRecordBaseAmount(record)),
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
    embeddedHouseholdDrafts,
    previewMatchByInputRef,
    removedPersonIdsByHousehold,
    buildInitialHouseholdDraft,
    buildInitialAttributionDraft,
    summarizeAttributionDraft,
    previewRecordLabel,
    parseCurrencyAmount,
    getPreviewRecordBaseAmount,
    previewRecords,
    ambiguousAttributionRefs,
    mergedSourceRefsByRepresentative,
    representativeByAbsorbedRef,
  ]);
}
