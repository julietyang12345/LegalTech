import { useMemo } from 'react';
import type { CanonicalPerson, EntityModelResult, HouseholdResolverResult, PreviewAttributionDraft, PreviewRecord } from './types';
import type { FinalAttributionDraftMap, FinalHouseholdDraft } from './review-types';
import type { EntityGraphSelection, EntityGraphView } from './review-graph';

type SelectedDonationContext = {
  donation: EntityModelResult['donations'][number];
  selectedAttribution: EntityModelResult['attributions'][number] | null;
  previewRecord: PreviewRecord;
  household: EntityModelResult['households'][number] | null;
  members: CanonicalPerson[];
  primaryPerson: CanonicalPerson | null;
  draft: PreviewAttributionDraft;
  linkedAttributions: EntityModelResult['attributions'];
};

type SelectedHouseholdContext = {
  household: EntityModelResult['households'][number];
  members: CanonicalPerson[];
  draft: FinalHouseholdDraft;
  linkedDonations: EntityModelResult['donations'];
};

type SelectedPersonContext = {
  person: CanonicalPerson;
  household: (HouseholdResolverResult['households'][number] & Partial<EntityModelResult['households'][number]>) | null;
  draft: FinalHouseholdDraft | null;
  availableHouseholds: HouseholdResolverResult['households'] | EntityModelResult['households'];
  linkedDonations: EntityModelResult['donations'];
};

type SelectedOrganizationContext = {
  organization: EntityModelResult['organizations'][number];
  draftName: string;
  linkedAttributions: EntityModelResult['attributions'];
  linkedDonations: EntityModelResult['donations'];
  linkedPreviewRecords: PreviewRecord[];
};

type UseTransformHubReviewGraphArgs = {
  entityModelResult: EntityModelResult | null;
  entityGraphView: EntityGraphView;
  entityGraphSearch: string;
  entityGraphSelection: EntityGraphSelection | null;
  parsedPreviewRecords: PreviewRecord[];
  finalAttributionDrafts: FinalAttributionDraftMap;
  finalHouseholdDrafts: Record<string, FinalHouseholdDraft>;
  householdResult: HouseholdResolverResult | null;
  organizationGraphDrafts: Record<string, string>;
  matchesEntityGraphSearch: (haystack: Array<string | number | boolean | null | undefined>, needle: string) => boolean;
  matchesEntityGraphSelection: (
    selection: EntityGraphSelection | null,
    row: unknown,
    entityModel: EntityModelResult,
    view: EntityGraphView,
  ) => boolean;
  buildInitialAttributionDraft: (record: PreviewRecord, members: CanonicalPerson[], primaryPerson: CanonicalPerson | null) => PreviewAttributionDraft;
  buildInitialHouseholdDraft: (household: HouseholdResolverResult['households'][number] | EntityModelResult['households'][number], members: CanonicalPerson[]) => FinalHouseholdDraft;
};

export function useTransformHubReviewGraph({
  entityModelResult,
  entityGraphView,
  entityGraphSearch,
  entityGraphSelection,
  parsedPreviewRecords,
  finalAttributionDrafts,
  finalHouseholdDrafts,
  householdResult,
  organizationGraphDrafts,
  matchesEntityGraphSearch,
  matchesEntityGraphSelection,
  buildInitialAttributionDraft,
  buildInitialHouseholdDraft,
}: UseTransformHubReviewGraphArgs) {
  const filteredEntityGraphRows = useMemo(() => {
    if (!entityModelResult) return [];
    if (entityGraphView === 'attributions') {
      return entityModelResult.attributions.filter((entry) =>
        matchesEntityGraphSearch([entry.id, entry.donationId, entry.kind, entry.personId, entry.organizationId, entry.workplace], entityGraphSearch)
        && matchesEntityGraphSelection(entityGraphSelection, entry, entityModelResult, 'attributions'),
      );
    }
    if (entityGraphView === 'households') {
      return entityModelResult.households.filter((household) =>
        matchesEntityGraphSearch([household.id, household.lastName, household.label, household.addressee, household.formalSalutation, household.primaryPersonId], entityGraphSearch)
        && matchesEntityGraphSelection(entityGraphSelection, household, entityModelResult, 'households'),
      );
    }
    if (entityGraphView === 'persons') {
      return entityModelResult.persons.filter((person) =>
        matchesEntityGraphSearch([person.id, person.firstName, person.lastName, person.email, person.phone], entityGraphSearch)
        && matchesEntityGraphSelection(entityGraphSelection, person, entityModelResult, 'persons'),
      );
    }
    if (entityGraphView === 'organizations') {
      return entityModelResult.organizations.filter((organization) =>
        matchesEntityGraphSearch([organization.id, organization.name, organization.normalizedName], entityGraphSearch)
        && matchesEntityGraphSelection(entityGraphSelection, organization, entityModelResult, 'organizations'),
      );
    }
    return entityModelResult.donations.filter((donation) =>
      matchesEntityGraphSearch([donation.id, donation.rowId, donation.canonical_person_id, donation.canonical_household_id, donation.canonical_org_id, donation.fund, donation.appeal], entityGraphSearch)
      && matchesEntityGraphSelection(entityGraphSelection, donation, entityModelResult, 'donations'),
    );
  }, [entityModelResult, entityGraphView, entityGraphSearch, entityGraphSelection, matchesEntityGraphSearch, matchesEntityGraphSelection]);

  const selectedEntityGraphDonationContext = useMemo<SelectedDonationContext | null>(() => {
    if (!entityModelResult || !entityGraphSelection) return null;
    const selectedAttribution = entityGraphSelection.type === 'attributions'
      ? entityModelResult.attributions.find((entry) => entry.id === entityGraphSelection.id) ?? null
      : null;
    const selectedDonation = entityGraphSelection.type === 'donations'
      ? entityModelResult.donations.find((donation) => donation.id === entityGraphSelection.id) ?? null
      : selectedAttribution?.donationId
        ? entityModelResult.donations.find((donation) => donation.id === selectedAttribution.donationId) ?? null
        : null;
    if (!selectedDonation || !selectedDonation.rowId) return null;
    const previewRecord = parsedPreviewRecords.find((record) => record.sourceRowRef === selectedDonation.rowId) ?? null;
    if (!previewRecord) return null;
    const household = entityModelResult.households.find((item) => item.id === selectedDonation.canonical_household_id) ?? null;
    const members = household
      ? household.memberIds
        .map((memberId) => entityModelResult.persons.find((person) => person.id === memberId))
        .filter((member): member is CanonicalPerson => Boolean(member))
      : [];
    const primaryPerson = selectedDonation.canonical_person_id
      ? entityModelResult.persons.find((person) => person.id === selectedDonation.canonical_person_id) ?? null
      : null;
    const draft = finalAttributionDrafts[selectedDonation.rowId] ?? buildInitialAttributionDraft(previewRecord, members, primaryPerson);
    const linkedAttributions = entityModelResult.attributions.filter((entry) => entry.donationId === selectedDonation.id);
    return {
      donation: selectedDonation,
      selectedAttribution,
      previewRecord,
      household,
      members,
      primaryPerson,
      draft,
      linkedAttributions,
    };
  }, [entityModelResult, entityGraphSelection, parsedPreviewRecords, finalAttributionDrafts, buildInitialAttributionDraft]);

  const selectedEntityGraphHouseholdContext = useMemo<SelectedHouseholdContext | null>(() => {
    if (!entityModelResult || entityGraphSelection?.type !== 'households') return null;
    const household = entityModelResult.households.find((item) => item.id === entityGraphSelection.id) ?? null;
    if (!household) return null;
    const members = household.memberIds
      .map((memberId) => entityModelResult.persons.find((person) => person.id === memberId))
      .filter((member): member is CanonicalPerson => Boolean(member));
    const draft = finalHouseholdDrafts[household.id] ?? buildInitialHouseholdDraft(household, members);
    const linkedDonations = entityModelResult.donations.filter((donation) => donation.canonical_household_id === household.id);
    return { household, members, draft, linkedDonations };
  }, [entityModelResult, entityGraphSelection, finalHouseholdDrafts, buildInitialHouseholdDraft]);

  const selectedEntityGraphPersonContext = useMemo<SelectedPersonContext | null>(() => {
    if (!entityModelResult || entityGraphSelection?.type !== 'persons') return null;
    const person = entityModelResult.persons.find((item) => item.id === entityGraphSelection.id) ?? null;
    if (!person) return null;
    const workingHouseholds = householdResult?.households ?? entityModelResult.households;
    const household = workingHouseholds.find((item) => item.memberIds.includes(person.id)) ?? null;
    const householdMembers = household
      ? household.memberIds
        .map((memberId) => entityModelResult.persons.find((candidate) => candidate.id === memberId))
        .filter((member): member is CanonicalPerson => Boolean(member))
      : [];
    const draft = household ? (finalHouseholdDrafts[household.id] ?? buildInitialHouseholdDraft(household, householdMembers)) : null;
    return {
      person,
      household,
      draft,
      availableHouseholds: workingHouseholds,
      linkedDonations: entityModelResult.donations.filter((donation) => donation.canonical_person_id === person.id),
    };
  }, [entityModelResult, entityGraphSelection, householdResult, finalHouseholdDrafts, buildInitialHouseholdDraft]);

  const selectedEntityGraphOrganizationContext = useMemo<SelectedOrganizationContext | null>(() => {
    if (!entityModelResult || entityGraphSelection?.type !== 'organizations') return null;
    const organization = entityModelResult.organizations.find((item) => item.id === entityGraphSelection.id) ?? null;
    if (!organization) return null;
    const linkedAttributions = entityModelResult.attributions.filter((entry) => entry.organizationId === organization.id);
    const linkedDonations = entityModelResult.donations.filter((donation) => donation.canonical_org_id === organization.id || linkedAttributions.some((entry) => entry.donationId === donation.id));
    const linkedPreviewRecords = linkedDonations
      .map((donation) => parsedPreviewRecords.find((record) => record.sourceRowRef === donation.rowId) ?? null)
      .filter(Boolean) as PreviewRecord[];
    return {
      organization,
      draftName: organizationGraphDrafts[organization.id] ?? organization.name,
      linkedAttributions,
      linkedDonations,
      linkedPreviewRecords,
    };
  }, [entityModelResult, entityGraphSelection, parsedPreviewRecords, organizationGraphDrafts]);

  return {
    filteredEntityGraphRows,
    selectedEntityGraphDonationContext,
    selectedEntityGraphHouseholdContext,
    selectedEntityGraphPersonContext,
    selectedEntityGraphOrganizationContext,
  };
}
