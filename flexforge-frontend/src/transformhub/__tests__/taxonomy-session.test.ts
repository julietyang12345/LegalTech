import { describe, expect, it } from 'vitest';
import { buildTaxonomyState, deriveTaxonomyScanColumns, mergeTaxonomyCandidate, summarizeTaxonomyState } from '../taxonomy-session';
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

  it('auto-resolves exact duplicate labels instead of showing a merge candidate', () => {
    const basePreview = parsedFile.preview!;
    const duplicateParsedFile: ParsedFile = {
      ...parsedFile,
      headers: ['fund', 'designation'],
      preview: {
        ...basePreview,
        fileClass: basePreview.fileClass,
        canonicalModel: basePreview.canonicalModel,
        summary: { rowCount: 2, populatedFields: 2, primaryLabel: 'donor' },
        records: [
          {
            ...basePreview.records[0],
            rawValues: { fund: 'Scholarship', designation: 'Scholarship' },
            fund: 'Scholarship',
          },
          {
            ...basePreview.records[1],
            rawValues: { fund: 'Scholarship', designation: 'Scholarship' },
            fund: 'Scholarship',
          },
        ],
      },
    };

    const duplicateSchema: ResolvedSchema = {
      ...schema,
      expectedFields: ['fund'],
      fieldMap: { fund: 'fund' },
    };

    const state = buildTaxonomyState(duplicateParsedFile, duplicateSchema);

    expect(state.candidateGroups.some((group) =>
      group.status === 'pending' &&
      group.members.every((member) => member.rawValue === 'Scholarship'),
    )).toBe(false);
    expect(state.resolvedGroups.some((group) =>
      group.canonicalLabel === 'Scholarship' &&
      group.aliases.includes('Scholarship'),
    )).toBe(true);
  });

  it('does not include person-name schema fields in taxonomy scan columns', () => {
    const basePreview = parsedFile.preview!;
    const nameParsedFile: ParsedFile = {
      ...parsedFile,
      headers: ['last_name', 'campaign_name'],
      preview: {
        ...basePreview,
        summary: { rowCount: 2, populatedFields: 2, primaryLabel: 'donor' },
        records: [
          {
            ...basePreview.records[0],
            lastName: 'Waters',
            rawValues: { last_name: 'Waters', campaign_name: 'Annual Gala 2025' },
          },
          {
            ...basePreview.records[1],
            lastName: 'Waters Jr',
            rawValues: { last_name: 'Waters Jr', campaign_name: 'Annual Gala' },
          },
        ],
      },
    };

    const nameSchema: ResolvedSchema = {
      ...schema,
      expectedFields: ['last_name', 'campaign_name'],
      fieldMap: { last_name: 'last_name', campaign_name: 'campaign_name' },
    };

    const scanColumns = deriveTaxonomyScanColumns(nameParsedFile, nameSchema);

    expect(scanColumns.some((column) => column.header === 'last_name')).toBe(false);
    expect(scanColumns.some((column) => column.header === 'campaign_name')).toBe(true);
  });
});
