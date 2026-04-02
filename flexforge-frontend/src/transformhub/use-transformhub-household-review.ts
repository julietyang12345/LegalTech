import { useMemo } from 'react';
import type { CanonicalPerson, HouseholdResolverResult, PreviewAttributionDraft, PreviewRecord } from './types';
import type { FinalAttributionDraftMap, FinalHouseholdDraft, HouseholdLayerView } from './review-types';

type UseTransformHubHouseholdReviewArgs = {
  householdResult: HouseholdResolverResult | null;
  peopleById: Map<string, CanonicalPerson>;
  finalHouseholdDrafts: Record<string, FinalHouseholdDraft>;
  finalAttributionDrafts: FinalAttributionDraftMap;
  previewMatchByInputRef: Map<string, { matchedPersonId?: string | null }>;
  buildInitialHouseholdDraft: (household: HouseholdResolverResult['households'][number], members: CanonicalPerson[]) => FinalHouseholdDraft;
  buildInitialAttributionDraft: (record: PreviewRecord, members: CanonicalPerson[], primaryPerson: CanonicalPerson | null) => PreviewAttributionDraft;
  summarizeAttributionDraft: (draft: PreviewAttributionDraft, members: CanonicalPerson[], primaryPerson: CanonicalPerson | null) => string;
  previewRecordLabel: (record: PreviewRecord) => string;
  parseCurrencyAmount: (value: unknown) => number | null;
  previewRecords: PreviewRecord[];
  ambiguousAttributionRefs: Set<string>;
};

export function useTransformHubHouseholdReview({
  householdResult,
  peopleById,
  finalHouseholdDrafts,
  finalAttributionDrafts,
  previewMatchByInputRef,
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
      household.memberIds.forEach((memberId) => householdByPersonId.set(memberId, household.id));
    });
    return householdResult.households.map((household) => {
      const members = household.memberIds
        .map((memberId) => peopleById.get(memberId))
        .filter((member): member is CanonicalPerson => Boolean(member));
      const draft = finalHouseholdDrafts[household.id] ?? buildInitialHouseholdDraft(household, members);
      const primaryMember = members.find((member) => member.id === draft.primaryPersonId) ?? members[0] ?? null;
      const relatedRecords = previewRecords.filter((record) => {
        const matchedPersonId = previewMatchByInputRef.get(record.sourceRowRef)?.matchedPersonId ?? null;
        const defaultHouseholdId = matchedPersonId ? householdByPersonId.get(matchedPersonId) ?? null : null;
        const attributionDraft = finalAttributionDrafts[record.sourceRowRef];
        const assignedHouseholdId = attributionDraft?.householdId ?? defaultHouseholdId;
        return assignedHouseholdId === household.id;
      });
      const memberBreakdown = members.map((member) => {
        const memberRecords = relatedRecords.filter((record) => {
          const matchedPerson = peopleById.get(previewMatchByInputRef.get(record.sourceRowRef)?.matchedPersonId ?? '') ?? null;
          const attributionDraft = finalAttributionDrafts[record.sourceRowRef] ?? buildInitialAttributionDraft(record, members, matchedPerson);
          return (attributionDraft.primaryPersonId ?? matchedPerson?.id ?? null) === member.id;
        });
        const totals = memberRecords
          .map((record) => {
            const matchedPerson = peopleById.get(previewMatchByInputRef.get(record.sourceRowRef)?.matchedPersonId ?? '') ?? null;
            const attributionDraft = finalAttributionDrafts[record.sourceRowRef] ?? buildInitialAttributionDraft(record, members, matchedPerson);
            return attributionDraft.creditAmount ?? parseCurrencyAmount(record.amount);
          })
          .filter((amount): amount is number => amount !== null);
        return {
          personId: member.id,
          name: [member.firstName, member.lastName].filter(Boolean).join(' ').trim() || member.id,
          total: totals.reduce((sum, amount) => sum + amount, 0),
          giftCount: memberRecords.length,
        };
      });
      const amounts = relatedRecords
        .map((record) => {
          const matchedPerson = peopleById.get(previewMatchByInputRef.get(record.sourceRowRef)?.matchedPersonId ?? '') ?? null;
          const attributionDraft = finalAttributionDrafts[record.sourceRowRef] ?? buildInitialAttributionDraft(record, members, matchedPerson);
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
        const matchedPerson = peopleById.get(previewMatchByInputRef.get(record.sourceRowRef)?.matchedPersonId ?? '');
        const draft = finalAttributionDrafts[record.sourceRowRef] ?? buildInitialAttributionDraft(record, members, matchedPerson ?? null);
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
      const memberEmails = members.map((member) => member.email.trim()).filter(Boolean);
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
    buildInitialHouseholdDraft,
    buildInitialAttributionDraft,
    summarizeAttributionDraft,
    previewRecordLabel,
    parseCurrencyAmount,
    previewRecords,
    ambiguousAttributionRefs,
  ]);
}
