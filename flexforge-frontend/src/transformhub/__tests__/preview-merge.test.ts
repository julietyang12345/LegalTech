import { describe, expect, it } from 'vitest';
import { buildPreviewMergeView } from '../preview-merge';
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
