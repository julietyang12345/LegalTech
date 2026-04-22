import { describe, expect, it } from 'vitest';
import type { ParsedFile, ResolvedSchema } from '../types';
import { buildAppendColumnDecisions, getPendingColumnMerges, mergeTxWithProfileLookup, mergeUploadIntoExisting, prepareIncomingUpload, resolvePendingColumnMerge, separateAutoMergedColumn, type PendingColumnMerge } from '../merge-table';

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

  it('keeps combined full-name columns separate from split first or last name fields', () => {
    const existingSchema = {
      fieldMap: { first_name: 'first_name', last_name: 'last_name' },
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;
    const incomingSchema = {
      fieldMap: { last_name: 'full_name' },
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;

    const decisions = buildAppendColumnDecisions(
      buildParsedFile(['first_name', 'last_name'], [{ first_name: 'John', last_name: 'Smith' }]),
      buildParsedFile(['full_name'], [{ full_name: 'John Smith' }]),
      'upload.xlsx',
      { existingSchema, incomingSchema },
    );

    expect(decisions[0]).toMatchObject({
      incomingHeader: 'full_name',
      targetHeader: null,
      action: 'keep_separate',
    });
  });

  it('preserves the true prepared S2 raw header when schema fieldMap is already canonicalized', () => {
    const existingSchema = {
      fieldMap: { fund: 'fund' },
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;
    const incomingSchema = {
      fieldMap: { fund: 'fund' },
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;

    const incoming = {
      ...buildParsedFile(['fund'], [{ fund: 'General' }]),
      mergeState: {
        uploadedFiles: ['upload.xlsx'],
        canonicalHeaders: ['fund'],
        pendingMerges: [],
        autoMergedColumns: [],
        rawHeaderLabelsByMergedHeader: {
          fund: 'program',
        },
      },
    } as ParsedFile;

    const decisions = buildAppendColumnDecisions(
      buildParsedFile(['fund'], [{ fund: 'General Fund' }]),
      incoming,
      'upload.xlsx',
      { existingSchema, incomingSchema },
    );

    expect(decisions[0]).toMatchObject({
      incomingHeader: 'fund',
      originalIncomingHeader: 'program',
      targetHeader: 'fund',
      action: 'merge',
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

  it('keeps donor full-name aliases merged through prepareIncomingUpload and workbook union', () => {
    const donorSchema = {
      reportType: 'donor-export',
      fileClass: 'donor',
      canonicalModel: 'canonical-donor',
      expectedFields: ['date', 'donor_identity', 'amount'],
      confidence: 1,
      unresolvedFields: [],
      fingerprint: 'test-donor',
      fromTemplateCache: false,
      fieldMap: {
        donor_name: 'Donor Name',
        email: 'Email',
      },
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;

    const fullNameSchema = {
      ...donorSchema,
      fieldMap: {
        donor_name: 'Full Name',
        email: 'Email Address',
      },
    } as unknown as ResolvedSchema;

    const existingPrepared = prepareIncomingUpload(
      buildParsedFile(['Donor Name', 'Email'], [{ 'Donor Name': 'Emily Johnson', Email: 'emily.j@gmail.com' }]),
      donorSchema,
      [],
      's1.csv',
      's1',
    );
    const incomingPrepared = prepareIncomingUpload(
      buildParsedFile(['Full Name', 'Email Address'], [{ 'Full Name': 'E. Johnson', 'Email Address': 'emily.j@gmail.com' }]),
      fullNameSchema,
      [],
      's2.csv',
      's2',
    );

    const result = mergeUploadIntoExisting({
      currentParsedFile: existingPrepared.parsedFile,
      currentSchema: existingPrepared.schema,
      currentRows: existingPrepared.rows,
      incomingParsedFile: incomingPrepared.parsedFile,
      incomingSchema: incomingPrepared.schema,
      incomingRows: incomingPrepared.rows,
      sourceFile: 's2.csv',
    });

    expect(result.parsedFile.headers).toContain('donor_name');
    expect(result.parsedFile.headers).not.toContain('Full Name');
    expect(result.pendingMergeCount).toBe(0);
    expect((result.parsedFile as any).mergeState?.autoMergedColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          incomingHeader: 'donor_name',
          originalIncomingHeader: 'Full Name',
          targetHeader: 'donor_name',
          matchType: 'exact',
        }),
      ]),
    );
  });

  it('still auto-merges donor name aliases when the incoming sheet keeps a raw full-name header', () => {
    const donorSchema = {
      reportType: 'donor-export',
      fileClass: 'donor',
      canonicalModel: 'canonical-donor',
      expectedFields: ['date', 'donor_identity', 'amount'],
      confidence: 1,
      unresolvedFields: [],
      fingerprint: 'test-donor',
      fromTemplateCache: false,
      fieldMap: {
        donor_name: 'Donor Name',
        email: 'Email',
      },
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;

    const constituentLikeSchema = {
      reportType: 'constituent-export',
      fileClass: 'constituent',
      canonicalModel: 'canonical-constituent',
      expectedFields: ['first_name_or_org', 'email_or_phone', 'created_at'],
      confidence: 1,
      unresolvedFields: [],
      fingerprint: 'test-constituent',
      fromTemplateCache: false,
      fieldMap: {
        email: 'Email Address',
      },
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;

    const existingPrepared = prepareIncomingUpload(
      buildParsedFile(['Donor Name', 'Email'], [{ 'Donor Name': 'Emily Johnson', Email: 'emily.j@gmail.com' }]),
      donorSchema,
      [],
      's1.csv',
      's1',
    );
    const incomingPrepared = prepareIncomingUpload(
      buildParsedFile(['Full Name', 'Email Address'], [{ 'Full Name': 'E. Johnson', 'Email Address': 'emily.j@gmail.com' }]),
      constituentLikeSchema,
      [],
      's2.csv',
      's2',
    );

    const result = mergeUploadIntoExisting({
      currentParsedFile: existingPrepared.parsedFile,
      currentSchema: existingPrepared.schema,
      currentRows: existingPrepared.rows,
      incomingParsedFile: incomingPrepared.parsedFile,
      incomingSchema: incomingPrepared.schema,
      incomingRows: incomingPrepared.rows,
      sourceFile: 's2.csv',
    });

    expect(result.pendingMergeCount).toBe(0);
    expect((result.parsedFile as any).mergeState?.autoMergedColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          originalIncomingHeader: 'Full Name',
          targetHeader: 'donor_name',
        }),
      ]),
    );
  });

  it('re-canonicalizes donor full-name headers back to donor_name during prepareIncomingUpload', () => {
    const driftedDonorSchema = {
      reportType: 'donor-export',
      fileClass: 'donor',
      canonicalModel: 'canonical-donor',
      expectedFields: ['date', 'donor_identity', 'amount'],
      confidence: 0.7,
      unresolvedFields: ['donor_identity'],
      fingerprint: 'test-donor-drift',
      fromTemplateCache: false,
      fieldMap: {
        email: 'Email',
      },
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;

    const prepared = prepareIncomingUpload(
      buildParsedFile(['Full Name', 'Email'], [{ 'Full Name': 'Emily Johnson', Email: 'emily.j@gmail.com' }]),
      driftedDonorSchema,
      [],
      'drifted.csv',
      's1',
    );

    expect(prepared.schema.fieldMap.donor_name).toBe('donor_name');
    expect(prepared.parsedFile.headers).toContain('donor_name');
    expect(prepared.parsedFile.headers).not.toContain('Full Name');
    expect((prepared.parsedFile as any).mergeState?.rawHeaderLabelsByMergedHeader?.donor_name).toBe('Full Name');
  });

  it('derives first and last name from a drifted full-name mapping during prepareIncomingUpload', () => {
    const constituentSchema = {
      reportType: 'constituent-export',
      fileClass: 'constituent',
      canonicalModel: 'canonical-constituent',
      expectedFields: ['first_name_or_org', 'email_or_phone', 'created_at'],
      confidence: 0.72,
      unresolvedFields: ['first_name_or_org'],
      fingerprint: 'test-constituent-drift',
      fromTemplateCache: false,
      fieldMap: {
        last_name: 'full_name',
        email: 'email_address',
      },
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;

    const prepared = prepareIncomingUpload(
      buildParsedFile(['full_name', 'email_address'], [{ full_name: 'John Smith', email_address: 'john.smith@gmail.com' }]),
      constituentSchema,
      [],
      'drifted-constituent.xlsx',
      's2',
    );

    const previewRecord = prepared.parsedFile.preview?.records?.[0] as any;
    expect(previewRecord?.firstName).toBe('John');
    expect(previewRecord?.lastName).toBe('Smith');
    expect(previewRecord?.displayName).toBe('John Smith');
  });

  it('uses original raw header labels to recover donor name merges when prepared headers drift', () => {
    const existingSchema = {
      fieldMap: { donor_name: 'donor_name' },
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;
    const incomingSchema = {
      fieldMap: { household_name: 'household_name' },
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;

    const decisions = buildAppendColumnDecisions(
      {
        ...buildParsedFile(['donor_name'], [{ donor_name: 'Emily Johnson' }]),
        mergeState: {
          uploadedFiles: ['existing.xlsx'],
          canonicalHeaders: ['donor_name'],
          pendingMerges: [],
          autoMergedColumns: [],
          rawHeaderLabelsByMergedHeader: {
            donor_name: 'Donor Name',
          },
        },
      } as unknown as ParsedFile,
      {
        ...buildParsedFile(['household_name'], [{ household_name: 'Emily Johnson Household' }]),
        mergeState: {
          uploadedFiles: ['incoming.xlsx'],
          canonicalHeaders: ['household_name'],
          pendingMerges: [],
          autoMergedColumns: [],
          rawHeaderLabelsByMergedHeader: {
            household_name: 'Full Name',
          },
        },
      } as unknown as ParsedFile,
      'upload.xlsx',
      { existingSchema, incomingSchema },
    );

    expect(decisions[0]).toMatchObject({
      incomingHeader: 'household_name',
      originalIncomingHeader: 'Full Name',
      targetHeader: 'donor_name',
      action: 'merge',
      matchType: 'alias',
    });
  });

  it('keeps qualified date fields pending instead of auto-merging into a generic date column', () => {
    const decisions = buildAppendColumnDecisions(
      buildParsedFile(['date'], [{ date: '2026-04-01' }]),
      buildParsedFile(['join_date'], [{ join_date: '2020-01-15' }]),
      'upload.xlsx',
    );

    expect(decisions[0]).toMatchObject({
      incomingHeader: 'join_date',
      targetHeader: 'date',
      action: 'review',
      matchType: 'alias',
    });
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

  it('can split an auto-merged incoming column back into an incoming-only header', () => {
    const parsedFile = {
      ...buildParsedFile(['Email'], [
        { Email: 'john@gmail.com' },
        { Email: 'maria@gmail.com' },
      ]),
      mergeState: {
        uploadedFiles: ['existing.csv', 'incoming.csv'],
        canonicalHeaders: ['Email'],
        pendingMerges: [],
        autoMergedColumns: [{
          id: 'merged-email',
          sourceFile: 'incoming.csv',
          incomingHeader: 'Email Address',
          originalIncomingHeader: 'Email Address',
          targetHeader: 'Email',
          splitHeader: 'email__incoming',
          matchType: 'alias' as const,
          score: null,
          sourceRowRefs: ['row-2'],
        }],
      },
      preview: {
        summary: { rowCount: 2, populatedFields: 1 },
        records: [
          {
            sourceRowRef: 'row-1',
            rawValues: { Email: 'john@gmail.com' },
            values: { Email: 'john@gmail.com' },
          },
          {
            sourceRowRef: 'row-2',
            rawValues: { Email: 'maria@gmail.com' },
            values: { Email: 'maria@gmail.com' },
          },
        ],
      },
    } as unknown as ParsedFile;

    const result = separateAutoMergedColumn(parsedFile, (parsedFile as any).mergeState.autoMergedColumns[0]);

    expect(result.headers).toEqual(['Email', 'email__incoming']);
    expect(result.rows[0].values).toEqual({ Email: 'john@gmail.com' });
    expect(result.rows[1].values).toEqual({ email__incoming: 'maria@gmail.com' });
    expect((result as any).mergeState.autoMergedColumns).toEqual([]);
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
      profileSchema: txSchema,
      profileFileName: 'bloomerang.csv',
    });

    const txRecord = result.parsedFile.preview?.records.find((record) => record.sourceRowRef === 'tx-1');
    expect(txRecord).toBeTruthy();
    expect((txRecord as Record<string, unknown>)['Role']).toBeUndefined();
    expect((result.schema as Record<string, unknown>)['_txProfileMatchSummary']).toMatchObject({ matched: 0, unmatched: 1, profileOnly: 1 });
  });

  it('auto-matches tx/profile rows from raw headers even when fieldMap is sparse', () => {
    const txParsedFile = {
      fileName: 'transactions.csv',
      headers: ['Donor Name', 'Email', 'Amount'],
      rows: [{
        ref: 'tx-1',
        values: { 'Donor Name': 'John Smith', Email: 'john.smith@gmail.com', Amount: '100' },
      }],
      preview: {
        summary: { rowCount: 1, populatedFields: 3 },
        records: [{
          sourceRowRef: 'tx-1',
          rawValues: { 'Donor Name': 'John Smith', Email: 'john.smith@gmail.com', Amount: '100' },
          values: { 'Donor Name': 'John Smith', Email: 'john.smith@gmail.com', Amount: '100' },
        }],
      },
    } as unknown as ParsedFile;
    const txSchema = {
      fileClass: 'donor',
      fieldMap: {},
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;
    const txRows = [{
      id: 'row-1',
      source_row_ref: 'tx-1',
      entity_name: 'John Smith',
      canonical_person_id: null,
      source_platform: 'Givebutter',
      source_file: 'transactions.csv',
      memo: '',
    }];
    const profileParsedFile = {
      fileName: 'constituents.csv',
      headers: ['Full Name', 'Email', 'Phone', 'City'],
      rows: [{
        ref: 'profile-1',
        values: { 'Full Name': 'John Smith', Email: 'john.smith@gmail.com', Phone: '555-111-0001', City: 'LA' },
      }],
      preview: {
        summary: { rowCount: 1, populatedFields: 4 },
        records: [{
          sourceRowRef: 'profile-1',
          rawValues: { 'Full Name': 'John Smith', Email: 'john.smith@gmail.com', Phone: '555-111-0001', City: 'LA' },
          values: { 'Full Name': 'John Smith', Email: 'john.smith@gmail.com', Phone: '555-111-0001', City: 'LA' },
        }],
      },
    } as unknown as ParsedFile;
    const profileSchema = {
      fileClass: 'constituent',
      fieldMap: {},
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;

    const result = mergeTxWithProfileLookup({
      txParsedFile,
      txSchema,
      txRows: txRows as any,
      profileParsedFile,
      profileSchema,
      profileFileName: 'constituents.csv',
    });

    const txRecord = result.parsedFile.preview?.records.find((record) => record.sourceRowRef === 'tx-1');
    expect(txRecord).toBeTruthy();
    expect((txRecord as Record<string, unknown>)['Phone']).toBe('555-111-0001');
    expect((txRecord as Record<string, unknown>)['City']).toBe('LA');
    expect((result.schema as Record<string, unknown>)['_txProfileMatchSummary']).toMatchObject({ matched: 1, unmatched: 0, profileOnly: 0 });
    expect((result.schema as Record<string, unknown>)['_txProfileAutoMergePairs']).toEqual([
      { txSourceRowRef: 'tx-1', profileSourceRowRef: 'profile-1' },
    ]);
  });

  it('auto-matches tx/profile rows when the profile sheet drifted full_name into last_name', () => {
    const txParsedFile = {
      fileName: 'transactions.csv',
      headers: ['First Name', 'Last Name', 'Email', 'Amount'],
      rows: [{
        ref: 'tx-1',
        values: { 'First Name': 'John', 'Last Name': 'Smith', Email: 'john.smith@gmail.com', Amount: '100' },
      }],
      preview: {
        summary: { rowCount: 1, populatedFields: 4 },
        records: [{
          sourceRowRef: 'tx-1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@gmail.com',
          rawValues: { 'First Name': 'John', 'Last Name': 'Smith', Email: 'john.smith@gmail.com', Amount: '100' },
          values: { 'First Name': 'John', 'Last Name': 'Smith', Email: 'john.smith@gmail.com', Amount: '100' },
        }],
      },
    } as unknown as ParsedFile;
    const txSchema = {
      fileClass: 'donor',
      fieldMap: { first_name: 'First Name', last_name: 'Last Name', email: 'Email' },
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;
    const txRows = [{
      id: 'row-1',
      source_row_ref: 'tx-1',
      entity_name: 'John Smith',
      canonical_person_id: null,
      source_platform: 'Givebutter',
      source_file: 'transactions.csv',
      memo: '',
    }];

    const preparedProfile = prepareIncomingUpload(
      buildParsedFile(['full_name', 'email_address'], [{ full_name: 'John Smith', email_address: 'john.smith@gmail.com' }]),
      {
        fileClass: 'constituent',
        fieldMap: { last_name: 'full_name', email: 'email_address' },
        confidence: 0.72,
        expectedFields: [],
        unresolvedFields: [],
        fieldSuggestions: [],
      } as unknown as ResolvedSchema,
      [],
      'constituents.xlsx',
      's2',
    );

    const result = mergeTxWithProfileLookup({
      txParsedFile,
      txSchema,
      txRows: txRows as any,
      profileParsedFile: preparedProfile.parsedFile,
      profileSchema: preparedProfile.schema,
      profileFileName: 'constituents.xlsx',
    });

    expect((result.schema as Record<string, unknown>)['_txProfileMatchSummary']).toMatchObject({ matched: 1, unmatched: 0, profileOnly: 0 });
    expect((result.schema as Record<string, unknown>)['_txProfileAutoMergePairs']).toEqual([
      { txSourceRowRef: 'tx-1', profileSourceRowRef: 's2::row-1' },
    ]);
  });

  it('does not auto-match tx/profile rows before Step 1 when names differ even if email and phone align', () => {
    const txParsedFile = {
      fileName: 'transactions.csv',
      headers: ['Donor Name', 'Email', 'Phone', 'Amount'],
      rows: [{
        ref: 'tx-1',
        values: {
          'Donor Name': 'John Smith',
          Email: 'john.smith@gmail.com',
          Phone: '555-111-0001',
          Amount: '100',
        },
      }],
      preview: {
        summary: { rowCount: 1, populatedFields: 4 },
        records: [{
          sourceRowRef: 'tx-1',
          rawValues: {
            'Donor Name': 'John Smith',
            Email: 'john.smith@gmail.com',
            Phone: '555-111-0001',
            Amount: '100',
          },
          values: {
            'Donor Name': 'John Smith',
            Email: 'john.smith@gmail.com',
            Phone: '555-111-0001',
            Amount: '100',
          },
        }],
      },
    } as unknown as ParsedFile;
    const txSchema = {
      fileClass: 'donor',
      fieldMap: {},
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;
    const txRows = [{
      id: 'row-1',
      source_row_ref: 'tx-1',
      entity_name: 'John Smith',
      canonical_person_id: null,
      source_platform: 'Givebutter',
      source_file: 'transactions.csv',
      memo: '',
    }];
    const profileParsedFile = {
      fileName: 'constituents.csv',
      headers: ['Full Name', 'Email', 'Phone', 'Address'],
      rows: [{
        ref: 'profile-1',
        values: {
          'Full Name': 'John A Smith',
          Email: 'john.smith@gmail.com',
          Phone: '555-111-0001',
          Address: '123 Oak St',
        },
      }],
      preview: {
        summary: { rowCount: 1, populatedFields: 4 },
        records: [{
          sourceRowRef: 'profile-1',
          rawValues: {
            'Full Name': 'John A Smith',
            Email: 'john.smith@gmail.com',
            Phone: '555-111-0001',
            Address: '123 Oak St',
          },
          values: {
            'Full Name': 'John A Smith',
            Email: 'john.smith@gmail.com',
            Phone: '555-111-0001',
            Address: '123 Oak St',
          },
        }],
      },
    } as unknown as ParsedFile;
    const profileSchema = {
      fileClass: 'constituent',
      fieldMap: {},
      confidence: 1,
      expectedFields: [],
      unresolvedFields: [],
      fieldSuggestions: [],
    } as unknown as ResolvedSchema;

    const result = mergeTxWithProfileLookup({
      txParsedFile,
      txSchema,
      txRows: txRows as any,
      profileParsedFile,
      profileSchema,
      profileFileName: 'constituents.csv',
    });

    const txRecord = result.parsedFile.preview?.records.find((record) => record.sourceRowRef === 'tx-1');
    expect(txRecord).toBeTruthy();
    expect((txRecord as Record<string, unknown>)['Address']).toBeUndefined();
    expect((result.schema as Record<string, unknown>)['_txProfileMatchSummary']).toMatchObject({ matched: 0, unmatched: 1, profileOnly: 1 });
    expect((result.schema as Record<string, unknown>)['_txProfileAutoMergePairs']).toEqual([]);
  });

});
