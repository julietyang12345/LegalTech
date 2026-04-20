// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTransformHubHouseholdReview } from '../use-transformhub-household-review';
import type { CanonicalPerson, HouseholdResolverResult, PreviewAttributionDraft, PreviewRecord } from '../types';

function buildPerson(overrides: Partial<CanonicalPerson> = {}): CanonicalPerson {
  return {
    id: overrides.id ?? 'P-1',
    firstName: overrides.firstName ?? 'Michael',
    lastName: overrides.lastName ?? 'Brown',
    email: overrides.email ?? 'michael@example.com',
    phone: overrides.phone ?? '',
    addressLine1: overrides.addressLine1 ?? '',
    city: overrides.city ?? '',
    state: overrides.state ?? '',
    zip: overrides.zip ?? '',
    tags: overrides.tags ?? [],
    lifecycle: overrides.lifecycle ?? 'active',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildArgs(householdResult: HouseholdResolverResult, people: CanonicalPerson[]) {
  const peopleById = new Map(people.map((person) => [person.id, person] as const));

  return {
    householdResult,
    peopleById,
    removedPersonIdsByHousehold: {},
    finalHouseholdDrafts: {},
    finalAttributionDrafts: {},
    embeddedHouseholdDrafts: {},
    previewMatchByInputRef: new Map<string, { matchedPersonId?: string | null }>(),
    mergedSourceRefsByRepresentative: new Map<string, string[]>(),
    representativeByAbsorbedRef: new Map<string, string>(),
    buildInitialHouseholdDraft: () => ({
      label: 'Brown Household',
      primaryPersonId: people[0]?.id ?? null,
      formalSalutation: 'Michael Brown',
      informalSalutation: 'Michael',
      eventSalutation: 'Michael Brown',
      addressee: 'Michael Brown',
    }),
    buildInitialAttributionDraft: () => ({
      mode: 'person',
      primaryPersonId: people[0]?.id ?? null,
      secondaryPersonId: null,
      householdId: householdResult.households[0]?.id ?? null,
      householdRemoved: false,
      creditAmount: null,
      campaignFund: '',
      organizationName: '',
      splitPercent: 50,
      notes: '',
    } satisfies PreviewAttributionDraft),
    summarizeAttributionDraft: () => 'Hard credit',
    previewRecordLabel: (record: PreviewRecord) => String(record.sourceRowRef),
    parseCurrencyAmount: () => null,
    getPreviewRecordBaseAmount: () => null,
    previewRecords: [],
    ambiguousAttributionRefs: new Set<string>(),
  };
}

describe('useTransformHubHouseholdReview', () => {
  it('hides singleton household entries from the household review layer', () => {
    const people = [buildPerson({ id: 'P-1' })];
    const householdResult: HouseholdResolverResult = {
      households: [
        {
          id: 'HH-1',
          lastName: 'Brown',
          memberIds: ['P-1'],
          primaryAddress: '',
          salutation: 'individual',
          salutationText: 'Michael Brown',
          jointGivingTotal: 0,
          version: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      ungroupedPersonIds: [],
    };

    const { result } = renderHook(() => useTransformHubHouseholdReview(buildArgs(householdResult, people)));

    expect(result.current).toEqual([]);
  });

  it('hides household entries that collapse to one distinct person after duplicate-collapse', () => {
    const people = [
      buildPerson({ id: 'P-1', firstName: 'Michael', lastName: 'Brown', email: 'm.brown@company.com' }),
      buildPerson({ id: 'P-2', firstName: 'Michael', lastName: 'Brown', email: 'm.brown@company.com' }),
    ];
    const householdResult: HouseholdResolverResult = {
      households: [
        {
          id: 'HH-1',
          lastName: 'Brown',
          memberIds: ['P-1', 'P-2'],
          primaryAddress: '',
          salutation: 'joint',
          salutationText: 'Michael Brown',
          jointGivingTotal: 200,
          version: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      ungroupedPersonIds: [],
    };

    const { result } = renderHook(() => useTransformHubHouseholdReview(buildArgs(householdResult, people)));

    expect(result.current).toEqual([]);
  });

  it('keeps actual multi-person households in the household review layer', () => {
    const people = [
      buildPerson({ id: 'P-1', firstName: 'Michael', lastName: 'Brown', email: 'michael@company.com' }),
      buildPerson({ id: 'P-2', firstName: 'Michelle', lastName: 'Brown', email: 'michelle@company.com' }),
    ];
    const householdResult: HouseholdResolverResult = {
      households: [
        {
          id: 'HH-1',
          lastName: 'Brown',
          memberIds: ['P-1', 'P-2'],
          primaryAddress: '',
          salutation: 'joint',
          salutationText: 'Michael and Michelle Brown',
          jointGivingTotal: 200,
          version: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      ungroupedPersonIds: [],
    };

    const { result } = renderHook(() => useTransformHubHouseholdReview(buildArgs(householdResult, people)));

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.householdId).toBe('HH-1');
    expect(result.current[0]?.members.map((member) => member.id)).toEqual(['P-1', 'P-2']);
  });
});
