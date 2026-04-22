import { describe, expect, it } from 'vitest';
import { buildConfirmedSafeAbsorbPairs, buildPreviewMergeView } from '../preview-merge';
import type { PersonMatch, PreviewRecord } from '../types';

function buildRecord(sourceRowRef: string, sourceFileClass: 'donor' | 'constituent' = 'donor'): PreviewRecord {
  return {
    id: sourceRowRef,
    sourceRowRef,
    sourceFileClass,
    values: {},
    rawValues: {},
  } as PreviewRecord;
}

function buildMatch(inputRef: string, matchedInputRef: string): PersonMatch {
  return {
    inputRef,
    score: 100,
    band: 'review',
    decision: 'review',
    matchedPersonId: 'person-1',
    matchedFields: ['transaction_id'],
    reviewPayload: {
      rowRef: inputRef,
      rawValues: {},
      matchedInputRef,
      input: {
        name: 'John Smith',
        email: 'john@example.com',
        phone: '555-111-2001',
        address: '123 Oak St',
        zip: '94602',
        householdName: '',
        city: 'Oakland',
        state: 'CA',
      },
      matchedEvidence: ['transaction_id'],
      candidate: null,
    },
  };
}

describe('buildPreviewMergeView', () => {
  it('keeps profile-only rows visible in tx-linked donor preview exports', () => {
    const previewRecords = [
      buildRecord('S1:row-2', 'donor'),
      {
        ...buildRecord('S2:row-10', 'constituent'),
        link_profile_only: true,
      } as PreviewRecord,
    ];

    const result = buildPreviewMergeView(
      previewRecords,
      [],
      new Map(),
      true,
    );

    expect(result.displayedPreviewRecords.map((record) => record.sourceRowRef)).toEqual(['S1:row-2', 'S2:row-10']);
  });

  it('auto-absorbs a confirmed donor duplicate when the matched row safely covers it', () => {
    const previewRecords = [
      {
        ...buildRecord('S1:row-2', 'donor'),
        rawValues: {
          Email: 'emily.j@gmail.com',
          Phone: '555-111-2003',
          Address: '456 Pine St',
          Amount: '125',
        },
        values: {
          Email: 'emily.j@gmail.com',
          Phone: '555-111-2003',
          Address: '456 Pine St',
          Amount: '125',
        },
        email: 'emily.j@gmail.com',
        phone: '555-111-2003',
        address: '456 Pine St',
        amount: '125',
      } as PreviewRecord,
      {
        ...buildRecord('S2:row-8', 'donor'),
        rawValues: {
          Email: 'emily.j@gmail.com',
          Phone: '(555) 111-2003',
          Address: '456 Pine Street',
          alternate_email: 'emily.alt@gmail.com',
          status: 'Active',
        },
        values: {
          Email: 'emily.j@gmail.com',
          Phone: '(555) 111-2003',
          Address: '456 Pine Street',
          alternate_email: 'emily.alt@gmail.com',
          status: 'Active',
        },
        email: 'emily.j@gmail.com',
        phone: '(555) 111-2003',
        address: '456 Pine Street',
        status: 'Active',
      } as PreviewRecord,
    ];
    const confirmedMatches = [
      buildMatch('S2:row-8', 'S1:row-2'),
    ];

    const autoPairs = buildConfirmedSafeAbsorbPairs(previewRecords, confirmedMatches);
    expect(autoPairs).toEqual([{ representativeRef: 'S1:row-2', absorbedRef: 'S2:row-8' }]);

    const result = buildPreviewMergeView(previewRecords, [], new Map(), true, autoPairs);
    expect(result.displayedPreviewRecords.map((record) => record.sourceRowRef)).toEqual(['S1:row-2']);
    expect(result.displayedPreviewRecords[0]?.rawValues?.alternate_email).toBe('emily.alt@gmail.com');
    expect(result.mergedSourceRefsByRepresentative.get('S1:row-2')).toEqual(['S2:row-8']);
  });

  it('does not auto-absorb a confirmed donor duplicate when transaction values conflict', () => {
    const previewRecords = [
      {
        ...buildRecord('S1:row-2', 'donor'),
        rawValues: { Amount: '125', Date: '2024-05-07', Email: 'emily.j@gmail.com' },
        values: { Amount: '125', Date: '2024-05-07', Email: 'emily.j@gmail.com' },
        amount: '125',
        date: '2024-05-07',
        email: 'emily.j@gmail.com',
      } as PreviewRecord,
      {
        ...buildRecord('S2:row-8', 'donor'),
        rawValues: { Amount: '90', Date: '2025-11-28', Email: 'emily.j@gmail.com' },
        values: { Amount: '90', Date: '2025-11-28', Email: 'emily.j@gmail.com' },
        amount: '90',
        date: '2025-11-28',
        email: 'emily.j@gmail.com',
      } as PreviewRecord,
    ];

    const autoPairs = buildConfirmedSafeAbsorbPairs(previewRecords, [buildMatch('S2:row-8', 'S1:row-2')]);
    expect(autoPairs).toEqual([]);
  });

  it('removes the absorbed row when tx duplicate refs are compact but preview refs are namespaced', () => {
    const previewRecords = [
      buildRecord('S1:row-2'),
      buildRecord('S2:row-10'),
    ];

    const result = buildPreviewMergeView(
      previewRecords,
      [buildMatch('row-2', 'row-10')],
      new Map(),
      true,
    );

    expect(result.displayedPreviewRecords.map((record) => record.sourceRowRef)).toEqual(['S2:row-10']);
    expect(result.representativeByAbsorbedRef.get('S1:row-2')).toBe('S2:row-10');
    expect(result.mergedSourceRefsByRepresentative.get('S2:row-10')).toEqual(['S1:row-2']);
  });

  it('honors a swapped keep-row decision after ref normalization', () => {
    const previewRecords = [
      buildRecord('S1:row-2'),
      buildRecord('S2:row-10'),
    ];

    const result = buildPreviewMergeView(
      previewRecords,
      [buildMatch('row-2', 'row-10')],
      new Map([['row-2', true]]),
      true,
    );

    expect(result.displayedPreviewRecords.map((record) => record.sourceRowRef)).toEqual(['S1:row-2']);
    expect(result.representativeByAbsorbedRef.get('S2:row-10')).toBe('S1:row-2');
    expect(result.mergedSourceRefsByRepresentative.get('S1:row-2')).toEqual(['S2:row-10']);
  });

  it('removes the absorbed row when tx duplicate refs arrive as namespaced suffix aliases', () => {
    const previewRecords = [
      buildRecord('nonprofit-data-test::Source_A::row-2'),
      buildRecord('nonprofit-data-test::Source_B::row-10'),
    ];

    const result = buildPreviewMergeView(
      previewRecords,
      [buildMatch('Source_A::row-2', 'Source_B::row-10')],
      new Map(),
      true,
    );

    expect(result.displayedPreviewRecords.map((record) => record.sourceRowRef)).toEqual(['nonprofit-data-test::Source_B::row-10']);
    expect(result.representativeByAbsorbedRef.get('nonprofit-data-test::Source_A::row-2')).toBe('nonprofit-data-test::Source_B::row-10');
    expect(result.mergedSourceRefsByRepresentative.get('nonprofit-data-test::Source_B::row-10')).toEqual(['nonprofit-data-test::Source_A::row-2']);
  });
});
