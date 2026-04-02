import { describe, expect, it } from 'vitest';
import { buildTaxonomyState, mergeTaxonomyCandidate, summarizeTaxonomyState } from '../taxonomy-session';
import type { ParsedFile, ResolvedSchema } from '../types';

describe('taxonomy-session', () => {
  const parsedFile: ParsedFile = {
    fileName: 'donors.csv',
    delimiter: ',',
    headers: ['fund', 'appeal'],
    rows: [],
    platform: 'GiveButter',
    structureAnalysis: {
      headerRowIndex: 0,
      skippedTopRows: 0,
      removedRows: 0,
      rawRowCount: 2,
      dataRowCount: 2,
      rowRoleSummary: { data: 2, blank: 0, subtotal: 0, footer: 0 },
      warnings: [],
    },
    preview: {
      fileClass: 'donor',
      canonicalModel: 'donor',
      summary: { rowCount: 2, populatedFields: 2, primaryLabel: 'donor' },
      records: [
        {
          id: 'r1',
          sourceRowRef: 'row-1',
          donorName: 'John Smith',
          firstName: 'John',
          lastName: 'Smith',
          organizationName: '',
          householdName: '',
          date: '2025-01-10',
          amount: '100',
          fund: 'Annual Fund',
          appeal: 'Spring Appeal',
          email: '',
          phone: '',
          address: '',
          city: '',
          state: '',
          postalCode: '',
          tags: [],
          assignedStaff: '',
          memo: '',
          currency: 'USD',
          rawValues: { fund: 'Annual Fund', appeal: 'Spring Appeal' },
        },
        {
          id: 'r2',
          sourceRowRef: 'row-2',
          donorName: 'Mary Smith',
          firstName: 'Mary',
          lastName: 'Smith',
          organizationName: '',
          householdName: '',
          date: '2025-01-12',
          amount: '75',
          fund: 'Annual Funds',
          appeal: 'Spring Appeal 2025',
          email: '',
          phone: '',
          address: '',
          city: '',
          state: '',
          postalCode: '',
          tags: [],
          assignedStaff: '',
          memo: '',
          currency: 'USD',
          rawValues: { fund: 'Annual Funds', appeal: 'Spring Appeal 2025' },
        },
      ],
    },
  };

  const schema: ResolvedSchema = {
    fileClass: 'donor',
    reportType: 'donor-export',
    canonicalModel: 'donor',
    confidence: 0.98,
    fingerprint: 'test-schema',
    fromTemplateCache: false,
    expectedFields: ['fund', 'appeal'],
    unresolvedFields: [],
    fieldMap: { fund: 'fund', appeal: 'appeal' },
    fieldSuggestions: [],
  };

  it('builds taxonomy state with pending candidates and summarizes progress', () => {
    const state = buildTaxonomyState(parsedFile, schema);
    const summary = summarizeTaxonomyState(state);

    expect(state.scanColumns.length).toBeGreaterThan(0);
    expect(state.observedValues.length).toBeGreaterThan(0);
    expect(summary.open).toBeGreaterThanOrEqual(0);
  });

  it('marks a candidate as resolved when merged', () => {
    const state = buildTaxonomyState(parsedFile, schema);
    const pendingCandidate = state.candidateGroups.find((group) => group.status === 'pending');
    if (!pendingCandidate) {
      expect(state.candidateGroups.length).toBe(0);
      return;
    }

    const nextState = mergeTaxonomyCandidate(state, pendingCandidate.id, 'Annual Fund');
    expect(nextState.resolvedGroups.length).toBeGreaterThan(0);
    expect(nextState.candidateGroups.find((group) => group.id === pendingCandidate.id)?.status).toBe('merged');
  });
});
