import { describe, expect, it } from 'vitest';
import type { ParsedFile, ResolvedSchema } from '../types';
import { buildAppendColumnDecisions, getPendingColumnMerges, mergeTxWithProfileLookup, resolvePendingColumnMerge, type PendingColumnMerge } from '../merge-table';

function buildParsedFile(headers: string[], rows: Array<Record<string, string>>): ParsedFile {
  return {
    fileName: 'test.csv',
    delimiter: ',',
    headers,
    platform: 'Bloomerang',
    structureAnalysis: {
      headerRowIndex: 0,
      skippedTopRows: 0,
      removedRows: 0,
      rawRowCount: rows.length,
      dataRowCount: rows.length,
      rowRoleSummary: { data: rows.length, blank: 0, subtotal: 0, footer: 0 },
      warnings: [],
    },
    rows: rows.map((values, index) => ({ ref: `row-${index + 1}`, values })),
  } as ParsedFile;
}

describe('buildAppendColumnDecisions', () => {
  it('merges exact header matches automatically', () => {
    const decisions = buildAppendColumnDecisions(['Email', 'First Name'], ['Email'], 'upload.csv');
    expect(decisions[0]).toMatchObject({
      matchType: 'exact',
      action: 'merge',
      targetHeader: 'Email',
    });
  });

  it('merges alias header matches automatically', () => {
    const decisions = buildAppendColumnDecisions(
      buildParsedFile(['Email'], [{ Email: 'john@gmail.com' }, { Email: 'jane@gmail.com' }]),
      buildParsedFile(['emailaddress'], [{ emailaddress: 'maria@gmail.com' }, { emailaddress: 'sam@gmail.com' }]),
      'upload.csv',
    );
    expect(decisions[0]).toMatchObject({
      matchType: 'alias',
      action: 'merge',
      targetHeader: 'Email',
    });
  });

  it('uses schema canonical targets before hard-coded alias groups', () => {
    const existingSchema = {
      fieldMap: { assigned_staff: 'Owner' },
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;
    const incomingSchema = {
      fieldMap: { assigned_staff: 'Relationship Manager' },
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;

    const decisions = buildAppendColumnDecisions(
      buildParsedFile(['Owner'], [{ Owner: 'Alex' }]),
      buildParsedFile(['Relationship Manager'], [{ 'Relationship Manager': 'Sam' }]),
      'upload.csv',
      { existingSchema, incomingSchema },
    );

    expect(decisions[0]).toMatchObject({
      matchType: 'alias',
      action: 'merge',
      targetHeader: 'Owner',
    });
  });

  it('sends alias matches with incompatible sampled value shapes to review', () => {
    const decisions = buildAppendColumnDecisions(
      buildParsedFile(['Email'], [{ Email: 'john@gmail.com' }]),
      buildParsedFile(['Email Address'], [{ 'Email Address': '919-555-0101' }]),
      'upload.csv',
    );
    expect(decisions[0]).toMatchObject({
      matchType: 'alias',
      action: 'review',
      targetHeader: 'Email',
      sampleConflicts: [{
        rowRef: 'row-1',
        existingValue: 'john@gmail.com',
        incomingValue: '919-555-0101',
        reason: 'email_vs_phone',
      }],
    });
  });

  it('keeps high-confidence fuzzy matches separate for review', () => {
    const decisions = buildAppendColumnDecisions(['Gift Amount'], ['Amount Gift'], 'upload.csv');
    expect(decisions[0]).toMatchObject({
      matchType: 'fuzzy',
      action: 'keep_separate',
      targetHeader: 'Gift Amount',
    });
  });

  it('sends semantically close transaction headers to schema union review', () => {
    const existing = buildParsedFile(
      ['Fund', 'Payment Method', 'Channel', 'Receipt Status', 'Constituent ID'],
      [{
        Fund: 'Health',
        'Payment Method': 'Credit Card',
        Channel: 'Online',
        'Receipt Status': 'Sent',
        'Constituent ID': 'A1001',
      }],
    );
    const incoming = buildParsedFile(
      ['Campaign', 'Tender Type', 'Source Channel', 'Receipt Flag', 'External ID'],
      [{
        Campaign: 'Health Initiative',
        'Tender Type': 'CC',
        'Source Channel': 'Web',
        'Receipt Flag': 'Y',
        'External ID': 'EXT-9001',
      }],
    );
    const decisions = buildAppendColumnDecisions(existing, incoming, 'upload.csv');

    expect(decisions.map((decision) => [decision.incomingHeader, decision.targetHeader, decision.action])).toEqual([
      ['Campaign', 'Fund', 'review'],
      ['Tender Type', 'Payment Method', 'review'],
      ['Source Channel', 'Channel', 'review'],
      ['Receipt Flag', 'Receipt Status', 'review'],
      ['External ID', 'Constituent ID', 'review'],
    ]);
    expect(decisions[0].sampleConflicts).toEqual([{
      rowRef: 'row-1',
      existingValue: 'Health',
      incomingValue: 'Health Initiative',
      reason: 'same_shape_different_value',
    }]);
  });

  it('auto-merges safe transaction aliases', () => {
    const decisions = buildAppendColumnDecisions(
      ['Email', 'Phone', 'Gift Date', 'Gift Amount'],
      ['Email Address', 'Mobile', 'Received Date', 'Amount'],
      'upload.csv',
    );

    expect(decisions.map((decision) => [decision.incomingHeader, decision.targetHeader, decision.action])).toEqual([
      ['Email Address', 'Email', 'merge'],
      ['Mobile', 'Phone', 'merge'],
      ['Received Date', 'Gift Date', 'merge'],
      ['Amount', 'Gift Amount', 'merge'],
    ]);
  });

  it('auto-merges donor export aliases seen in workbook tabs', () => {
    const decisions = buildAppendColumnDecisions(
      ['home_phone', 'address1', 'gift_amount'],
      ['phone', 'street_1', 'gross_amount'],
      'upload.xlsx',
    );

    expect(decisions.map((decision) => [decision.incomingHeader, decision.targetHeader, decision.action])).toEqual([
      ['phone', 'home_phone', 'merge'],
      ['street_1', 'address1', 'merge'],
      ['gross_amount', 'gift_amount', 'merge'],
    ]);
  });

  it('does not auto-merge fund and campaign headers', () => {
    const decisions = buildAppendColumnDecisions(['Fund'], ['Campaign'], 'upload.csv');
    expect(decisions[0]).toMatchObject({
      matchType: 'alias',
      action: 'review',
      targetHeader: 'Fund',
    });
  });

  it('sends donor schema-union review pairs for program and appeal-style fields', () => {
    const decisions = buildAppendColumnDecisions(
      buildParsedFile(
        ['Fund', 'Campaign'],
        [{ Fund: 'General Fund', Campaign: 'Spring Gala 2025' }],
      ),
      buildParsedFile(
        ['Program', 'Appeal Name'],
        [{ Program: 'General', 'Appeal Name': '2025 Spring Gala' }],
      ),
      'upload.xlsx',
    );

    expect(decisions.map((decision) => [decision.incomingHeader, decision.targetHeader, decision.action])).toEqual([
      ['Program', 'Fund', 'review'],
      ['Appeal Name', 'Campaign', 'review'],
    ]);
  });

  it('hides legacy text-value column reviews from saved sessions when they are not semantic review pairs', () => {
    const parsedFile = {
      ...buildParsedFile(['Owner', 'Relationship Manager'], [{ Owner: 'Alex', 'Relationship Manager': 'Sam' }]),
      mergeState: {
        uploadedFiles: ['upload.csv'],
        canonicalHeaders: ['Owner', 'Relationship Manager'],
        pendingMerges: [{
          id: 'legacy-owner-manager',
          sourceFile: 'upload.csv',
          incomingHeader: 'Relationship Manager',
          suggestedHeader: 'Owner',
          splitHeader: 'owner__incoming',
          matchType: 'alias' as const,
          score: null,
          reason: 'value_review' as const,
          sampleConflicts: [{
            rowRef: 'row-1',
            existingValue: 'Alex',
            incomingValue: 'Sam',
            reason: 'same_shape_different_value',
          }],
        }],
      },
    };

    expect(getPendingColumnMerges(parsedFile)).toEqual([]);
  });

  it('splits a reviewed incoming column into a canonical __incoming header', () => {
    const parsedFile = buildParsedFile(['Email', 'Email Address'], [{ Email: 'john@gmail.com', 'Email Address': 'john_new@gmail.com' }]);
    const merge: PendingColumnMerge = {
      id: 'merge-1',
      sourceFile: 'upload.csv',
      incomingHeader: 'Email Address',
      suggestedHeader: 'Email',
      splitHeader: 'email__incoming',
      matchType: 'alias',
      score: null,
      reason: 'value_review',
    };

    const result = resolvePendingColumnMerge(parsedFile, merge, 'keep_separate');
    expect(result.headers).toEqual(['Email', 'email__incoming']);
    expect(result.rows[0].values).toEqual({
      Email: 'john@gmail.com',
      email__incoming: 'john_new@gmail.com',
    });
  });

  it('can keep S2 only by using incoming values under the concise S1 column name', () => {
    const parsedFile = buildParsedFile(['Email', 'Email Address'], [{ Email: 'john@gmail.com', 'Email Address': 'john_new@gmail.com' }]);
    const merge: PendingColumnMerge = {
      id: 'merge-2',
      sourceFile: 'upload.csv',
      incomingHeader: 'Email Address',
      suggestedHeader: 'Email',
      splitHeader: 'email__incoming',
      matchType: 'alias',
      score: null,
      reason: 'value_review',
    };

    const result = resolvePendingColumnMerge(parsedFile, merge, 'keep_s2');
    expect(result.headers).toEqual(['Email']);
    expect(result.rows[0].values).toEqual({
      Email: 'john_new@gmail.com',
    });
  });

  it('combines columns with safe value union under the concise S1 column name', () => {
    const parsedFile = buildParsedFile(['Campaign', 'Campaign Name'], [{ Campaign: 'Annual Fund', 'Campaign Name': 'Annual Fund 2025' }]);
    const merge: PendingColumnMerge = {
      id: 'merge-3',
      sourceFile: 'upload.csv',
      incomingHeader: 'Campaign Name',
      suggestedHeader: 'Campaign',
      splitHeader: 'campaign__incoming',
      matchType: 'alias',
      score: null,
      reason: 'value_review',
    };

    const result = resolvePendingColumnMerge(parsedFile, merge, 'combine');
    expect(result.headers).toEqual(['Campaign']);
    expect(result.rows[0].values).toEqual({
      Campaign: 'Annual Fund | Annual Fund 2025',
    });
  });

  it('does not match a transaction to a profile on shared contact info when names conflict', () => {
    const txParsedFile = {
      fileName: 'givebutter.csv',
      headers: ['Donor Name', 'Email', 'Phone'],
      rows: [{ ref: 'tx-1', values: { 'Donor Name': 'Monique Bryant', Email: 'shared@example.com', Phone: '9199350237' } }],
      preview: {
        summary: { rowCount: 1, populatedFields: 3 },
        records: [{
          sourceRowRef: 'tx-1',
          donorName: 'Monique Bryant',
          email: 'shared@example.com',
          phone: '9199350237',
          rawValues: { 'Donor Name': 'Monique Bryant', Email: 'shared@example.com', Phone: '9199350237' },
          values: { 'Donor Name': 'Monique Bryant', Email: 'shared@example.com', Phone: '9199350237' },
        }],
      },
    } as unknown as ParsedFile;
    const txSchema = {
      fieldMap: {},
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;
    const txRows = [{
      id: 'row-1',
      source_row_ref: 'tx-1',
      entity_name: 'Monique Bryant',
      canonical_person_id: null,
      source_platform: 'Givebutter',
      source_file: 'givebutter.csv',
      memo: '',
    }];
    const profileParsedFile = {
      fileName: 'bloomerang.csv',
      headers: ['Name', 'Email', 'Phone', 'Role'],
      rows: [{ ref: 'profile-1', values: { Name: 'Morgan Bryant', Email: 'shared@example.com', Phone: '9199350237', Role: 'board' } }],
      preview: {
        summary: { rowCount: 1, populatedFields: 4 },
        records: [{
          sourceRowRef: 'profile-1',
          displayName: 'Morgan Bryant',
          firstName: 'Morgan',
          lastName: 'Bryant',
          email: 'shared@example.com',
          phone: '9199350237',
          rawValues: { Name: 'Morgan Bryant', Email: 'shared@example.com', Phone: '9199350237', Role: 'board' },
          values: { Name: 'Morgan Bryant', Email: 'shared@example.com', Phone: '9199350237', Role: 'board' },
        }],
      },
    } as unknown as ParsedFile;

    const result = mergeTxWithProfileLookup({
      txParsedFile,
      txSchema,
      txRows: txRows as any,
      profileParsedFile,
      profileFileName: 'bloomerang.csv',
    });

    const txRecord = result.parsedFile.preview?.records.find((record) => record.sourceRowRef === 'tx-1');
    expect(txRecord).toBeTruthy();
    expect((txRecord as Record<string, unknown>)['Role']).toBeUndefined();
    expect((result.schema as Record<string, unknown>)['_txProfileMatchSummary']).toMatchObject({ matched: 0, unmatched: 1, profileOnly: 1 });
  });
});
