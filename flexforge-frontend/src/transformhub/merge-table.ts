import type { CanonicalLedgerRow, ParsedFile, PreviewRecord, ResolvedSchema } from './types';

export type PendingColumnMerge = {
  id: string;
  sourceFile: string;
  incomingHeader: string;
  originalIncomingHeader?: string | null;
  suggestedHeader: string;
  splitHeader: string;
  matchType: 'exact' | 'alias' | 'fuzzy';
  score: number | null;
  reason: 'fuzzy_candidate' | 'value_review';
  sampleConflicts?: Array<{
    rowRef: string;
    existingValue: string;
    incomingValue: string;
    reason: string;
  }>;
};

export type AutoMergedColumnMatch = {
  id: string;
  sourceFile: string;
  incomingHeader: string;
  originalIncomingHeader?: string | null;
  targetHeader: string;
  splitHeader: string;
  matchType: 'exact' | 'alias';
  score: number | null;
  sourceRowRefs?: string[];
};

export type AppendColumnDecision = {
  id: string;
  sourceFile: string;
  incomingHeader: string;
  originalIncomingHeader?: string | null;
  suggestedHeader: string | null;
  targetHeader: string | null;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'new';
  score: number | null;
  action: 'merge' | 'keep_separate' | 'drop' | 'review';
  sampleConflicts?: PendingColumnMerge['sampleConflicts'];
};

type AppendColumnDecisionOptions = {
  existingSchema?: ResolvedSchema | null;
  incomingSchema?: ResolvedSchema | null;
};

type ParsedFileMergeState = {
  uploadedFiles: string[];
  canonicalHeaders: string[];
  pendingMerges: PendingColumnMerge[];
  autoMergedColumns: AutoMergedColumnMatch[];
  rawHeaderLabelsByMergedHeader?: Record<string, string>;
};

type ParsedFileWithMerge = ParsedFile & { mergeState?: ParsedFileMergeState };

const HEADER_ALIAS_GROUPS = [
  ['email', 'emailaddress', 'e-mail', 'e-mailaddress'],
  ['firstname', 'first', 'fname', 'givenname'],
  ['lastname', 'last', 'lname', 'surname', 'familyname'],
  ['fullname', 'name', 'donorname', 'displayname', 'entityname'],
  ['phone', 'phonenumber', 'mobile', 'telephone', 'homephone', 'workphone', 'cellphone'],
  ['address', 'address1', 'street', 'street1', 'streetaddress', 'addressline1'],
  ['postalcode', 'zipcode', 'zip'],
  ['date', 'giftdate', 'receiveddate', 'transactiondate'],
  ['amount', 'giftamount', 'donationamount', 'grossamount', 'netamount', 'paymentamount'],
  ['fund', 'fundname'],
  ['appeal', 'appealname'],
  ['campaign', 'campaignname'],
] as const;

const SEMANTIC_REVIEW_HEADER_GROUPS = [
  ['fund', 'fundname', 'program', 'campaign'],
  ['campaign', 'campaignname', 'appeal', 'appealname'],
  ['paymentmethod', 'tendertype'],
  ['channel', 'sourcechannel'],
  ['receiptstatus', 'receiptflag'],
  ['constituentid', 'externalid'],
] as const;

function normalizeHeaderKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function buildIncomingSplitHeader(existingHeaders: string[], suggestedHeader: string): string {
  const base = `${normalizeHeaderKey(suggestedHeader) || 'column'}__incoming`;
  if (!existingHeaders.includes(base)) return base;
  let suffix = 2;
  while (existingHeaders.includes(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function resolveHeaderAlias(value: string): string {
  const normalized = normalizeHeaderKey(value);
  const group = HEADER_ALIAS_GROUPS.find((items) => (items as readonly string[]).includes(normalized));
  return group?.[0] ?? normalized;
}

function resolveSemanticReviewGroup(value: string): readonly string[] | null {
  const normalized = normalizeHeaderKey(value);
  return SEMANTIC_REVIEW_HEADER_GROUPS.find((items) => (items as readonly string[]).includes(normalized)) ?? null;
}

type HeaderConcept =
  | 'email'
  | 'phone'
  | 'address'
  | 'postal_code'
  | 'date'
  | 'amount'
  | 'payment_method'
  | 'channel'
  | 'receipt_status'
  | 'external_id'
  | 'fund'
  | 'program'
  | 'campaign'
  | 'appeal'
  | null;

const AUTO_MERGE_CONCEPTS = new Set<Exclude<HeaderConcept, null>>([
  'email',
  'phone',
  'address',
  'postal_code',
  'date',
  'amount',
  'payment_method',
  'channel',
  'receipt_status',
]);

const REVIEW_CONCEPT_FAMILIES: Array<Set<Exclude<HeaderConcept, null>>> = [
  new Set(['fund', 'program', 'campaign', 'appeal']),
  new Set(['external_id']),
];

function inferHeaderConcept(value: string): HeaderConcept {
  const normalized = normalizeHeaderKey(value);
  if (!normalized) return null;
  if (/paymentmethod|tendertype/.test(normalized)) return 'payment_method';
  if (/sourcechannel|channel/.test(normalized)) return 'channel';
  if (/receiptstatus|receiptflag/.test(normalized)) return 'receipt_status';
  if (/constituentid|externalid|contactid|customerid/.test(normalized)) return 'external_id';
  if (normalized.includes('email')) return 'email';
  if (/phone|mobile|telephone|cell/.test(normalized)) return 'phone';
  if (/address|street|addr/.test(normalized)) return 'address';
  if (/postal|zip/.test(normalized)) return 'postal_code';
  if (/date|createdat|receiveddate|transactiondate|giftdate|processedat|settledat|submittedat/.test(normalized)) return 'date';
  if (/amount|total|gross|net|proceeds/.test(normalized) && !normalized.includes('year')) return 'amount';
  if (/fund|designation/.test(normalized)) return 'fund';
  if (normalized.includes('program')) return 'program';
  if (normalized.includes('appeal')) return 'appeal';
  if (normalized.includes('campaign')) return 'campaign';
  return null;
}

type DateSemanticGroup =
  | 'generic'
  | 'transaction'
  | 'created'
  | 'updated'
  | 'joined'
  | 'start'
  | 'end'
  | 'processed'
  | 'submitted'
  | 'settled'
  | null;

function inferDateSemanticGroup(value: string): DateSemanticGroup {
  const normalized = normalizeHeaderKey(value);
  if (!normalized || !/(date|at)$|date/.test(normalized)) return null;
  if (/joindate|joineddate|membershipdate|signupdate/.test(normalized)) return 'joined';
  if (/createdat|creationdate/.test(normalized)) return 'created';
  if (/updatedat|modifiedat|lastupdated/.test(normalized)) return 'updated';
  if (/startdate|begindate/.test(normalized)) return 'start';
  if (/enddate|expirydate|expirationdate|closedate/.test(normalized)) return 'end';
  if (/processedat|processingdate/.test(normalized)) return 'processed';
  if (/submittedat|submissiondate/.test(normalized)) return 'submitted';
  if (/settledat|settlementdate/.test(normalized)) return 'settled';
  if (/giftdate|receiveddate|transactiondate|donationdate|paymentdate|posteddate/.test(normalized)) return 'transaction';
  if (normalized === 'date') return 'generic';
  if (normalized.endsWith('date')) return 'generic';
  return null;
}

function shouldForceSemanticColumnReview(existingHeader: string, incomingHeader: string): boolean {
  const existingDateGroup = inferDateSemanticGroup(existingHeader);
  const incomingDateGroup = inferDateSemanticGroup(incomingHeader);
  if (!existingDateGroup || !incomingDateGroup) return false;
  if (existingDateGroup === incomingDateGroup) return false;
  const safeGenericDateGroups = new Set<DateSemanticGroup>(['generic', 'transaction']);
  return !(safeGenericDateGroups.has(existingDateGroup) && safeGenericDateGroups.has(incomingDateGroup));
}

function areConceptsInSameReviewFamily(left: HeaderConcept, right: HeaderConcept): boolean {
  if (!left || !right) return false;
  return REVIEW_CONCEPT_FAMILIES.some((family) => family.has(left) && family.has(right));
}

function conceptReviewDistance(left: HeaderConcept, right: HeaderConcept): number {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  if (left === right) return 0;
  const fundraisingPriority: Record<'fund' | 'program' | 'campaign' | 'appeal', HeaderConcept[]> = {
    fund: ['program', 'campaign', 'appeal'],
    program: ['fund', 'campaign', 'appeal'],
    campaign: ['appeal', 'fund', 'program'],
    appeal: ['campaign', 'fund', 'program'],
  };
  if (left in fundraisingPriority) {
    const priority = fundraisingPriority[left as 'fund' | 'program' | 'campaign' | 'appeal'];
    const index = priority.indexOf(right);
    if (index >= 0) return index + 1;
  }
  return 10;
}

function isSemanticReviewPair(left: string, right: string): boolean {
  const leftKey = normalizeHeaderKey(left);
  const rightKey = normalizeHeaderKey(right);
  if (!leftKey || !rightKey || leftKey === rightKey) return false;
  const group = resolveSemanticReviewGroup(left);
  return Boolean(group && group.includes(rightKey));
}

function scoreHeaderSimilarity(left: string, right: string): number {
  const a = normalizeHeaderKey(left);
  const b = normalizeHeaderKey(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const aTokens = new Set(left.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean));
  const bTokens = new Set(right.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  return intersection / union;
}

type ColumnValueShape = 'email' | 'phone' | 'date' | 'numeric' | 'text' | 'empty';

function detectValueShape(value: string): ColumnValueShape {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return 'empty';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'email';
  if (/^\+?[\d()\-\s.]{7,}$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 7) return 'phone';
  if (!Number.isNaN(Date.parse(trimmed)) && /[\d/-]/.test(trimmed)) return 'date';
  if (/^[\d\s,$.%()-]+$/.test(trimmed) && /\d/.test(trimmed)) return 'numeric';
  return 'text';
}

function collectColumnSamples(source: string[] | ParsedFile, header: string): string[] {
  if (Array.isArray(source)) return [];
  return source.rows
    .map((row) => String(row.values?.[header] ?? '').trim())
    .filter(Boolean)
    .slice(0, 24);
}

function dominantShape(samples: string[]): ColumnValueShape {
  if (samples.length === 0) return 'empty';
  const counts = samples.reduce<Record<ColumnValueShape, number>>((acc, sample) => {
    const shape = detectValueShape(sample);
    acc[shape] = (acc[shape] ?? 0) + 1;
    return acc;
  }, { email: 0, phone: 0, date: 0, numeric: 0, text: 0, empty: 0 });
  return (Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] as ColumnValueShape) ?? 'empty';
}

function shouldReviewColumnMerge(existingSource: string[] | ParsedFile, incomingSource: string[] | ParsedFile, existingHeader: string, incomingHeader: string): boolean {
  if (shouldForceSemanticColumnReview(existingHeader, incomingHeader)) return true;
  const existingSamples = collectColumnSamples(existingSource, existingHeader);
  const incomingSamples = collectColumnSamples(incomingSource, incomingHeader);
  if (existingSamples.length === 0 || incomingSamples.length === 0) return false;
  const existingShape = dominantShape(existingSamples);
  const incomingShape = dominantShape(incomingSamples);
  if (existingShape === 'empty' || incomingShape === 'empty') return false;
  if (existingShape === incomingShape) return false;
  if (existingShape === 'text' || incomingShape === 'text') return false;
  return true;
}

function collectColumnConflictSamples(
  existingSource: string[] | ParsedFile,
  incomingSource: string[] | ParsedFile,
  existingHeader: string,
  incomingHeader: string,
): PendingColumnMerge['sampleConflicts'] {
  if (Array.isArray(existingSource) || Array.isArray(incomingSource)) return [];
  const samples: NonNullable<PendingColumnMerge['sampleConflicts']> = [];
  const maxRows = Math.max(existingSource.rows.length, incomingSource.rows.length);
  for (let index = 0; index < maxRows && samples.length < 8; index += 1) {
    const existingRow = existingSource.rows[index];
    const incomingRow = incomingSource.rows[index];
    const existingValue = String(existingRow?.values?.[existingHeader] ?? '').trim();
    const incomingValue = String(incomingRow?.values?.[incomingHeader] ?? '').trim();
    if (!existingValue || !incomingValue) continue;
    const existingShape = detectValueShape(existingValue);
    const incomingShape = detectValueShape(incomingValue);
    if (existingShape === incomingShape && existingValue === incomingValue) continue;
    samples.push({
      rowRef: incomingRow?.ref ?? existingRow?.ref ?? `row-${index + 1}`,
      existingValue,
      incomingValue,
      reason: existingShape === incomingShape
        ? 'same_shape_different_value'
        : `${existingShape}_vs_${incomingShape}`,
    });
  }
  return samples;
}

function getRawValues(record: PreviewRecord): Record<string, string> {
  return record?.rawValues ?? record?.values ?? {};
}

function money(value: string): string {
  const cleaned = String(value || '').replace(/[^0-9.-]/g, '').trim();
  if (!cleaned) return '';
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return '';
  return Math.abs(parsed).toFixed(2);
}

function valueFromParsedRow(row: ParsedFile['rows'][number], fieldMap: Record<string, string>, key: string): string {
  return String(row.values[fieldMap[key] ?? ''] ?? '').trim();
}

function buildDisplayName(values: string[]): string {
  return values.map((value) => String(value || '').trim()).filter(Boolean).join(' ').trim();
}

function splitTags(raw: string): string[] {
  return String(raw || '').split(/[;,]/).map((tag) => tag.trim()).filter(Boolean);
}

function rebuildParsedPreview(parsedFile: ParsedFileWithMerge, schema: ResolvedSchema): ParsedFileWithMerge {
  const existingRecordsByRef = new Map(
    (parsedFile.preview?.records ?? []).map((record) => [String(record.sourceRowRef), record as PreviewRecord]),
  );

  const records: PreviewRecord[] = parsedFile.rows.map((row, index) => {
    const existing = existingRecordsByRef.get(String(row.ref));
    const rawValues = row.values as Record<string, string>;

    if (schema.fileClass === 'constituent') {
      const firstName = valueFromParsedRow(row, schema.fieldMap, 'first_name');
      const lastName = valueFromParsedRow(row, schema.fieldMap, 'last_name');
      const organizationName = valueFromParsedRow(row, schema.fieldMap, 'organization_name');
      const householdName = valueFromParsedRow(row, schema.fieldMap, 'household_name');
      return {
        ...(existing ?? {}),
        id: existing?.id ?? `constituent-${index + 1}`,
        sourceRowRef: row.ref,
        displayName: organizationName || buildDisplayName([firstName, lastName]) || householdName || row.ref,
        constituentType: valueFromParsedRow(row, schema.fieldMap, 'constituent_type'),
        firstName,
        lastName,
        organizationName,
        householdName,
        email: valueFromParsedRow(row, schema.fieldMap, 'email'),
        phone: valueFromParsedRow(row, schema.fieldMap, 'phone'),
        address: valueFromParsedRow(row, schema.fieldMap, 'address'),
        city: valueFromParsedRow(row, schema.fieldMap, 'city'),
        state: valueFromParsedRow(row, schema.fieldMap, 'state'),
        postalCode: valueFromParsedRow(row, schema.fieldMap, 'postal_code'),
        country: valueFromParsedRow(row, schema.fieldMap, 'country'),
        tags: splitTags(valueFromParsedRow(row, schema.fieldMap, 'tags')),
        assignedStaff: valueFromParsedRow(row, schema.fieldMap, 'assigned_staff'),
        createdAt: valueFromParsedRow(row, schema.fieldMap, 'created_at'),
        updatedAt: valueFromParsedRow(row, schema.fieldMap, 'updated_at'),
        rawValues,
        values: rawValues,
      } as PreviewRecord;
    }

    if (schema.fileClass === 'donor') {
      const firstName = valueFromParsedRow(row, schema.fieldMap, 'first_name');
      const lastName = valueFromParsedRow(row, schema.fieldMap, 'last_name');
      const organizationName = valueFromParsedRow(row, schema.fieldMap, 'organization_name');
      const householdName = valueFromParsedRow(row, schema.fieldMap, 'household_name');
      const donorName = valueFromParsedRow(row, schema.fieldMap, 'donor_name')
        || valueFromParsedRow(row, schema.fieldMap, 'entity_name')
        || buildDisplayName([firstName, lastName])
        || organizationName
        || householdName
        || row.ref;
      return {
        ...(existing ?? {}),
        id: existing?.id ?? `donor-${index + 1}`,
        sourceRowRef: row.ref,
        donorName,
        firstName,
        lastName,
        organizationName,
        householdName,
        date: valueFromParsedRow(row, schema.fieldMap, 'date'),
        amount: money(valueFromParsedRow(row, schema.fieldMap, 'amount')),
        fund: valueFromParsedRow(row, schema.fieldMap, 'fund'),
        campaignName: valueFromParsedRow(row, schema.fieldMap, 'campaign_name'),
        appeal: valueFromParsedRow(row, schema.fieldMap, 'appeal'),
        email: valueFromParsedRow(row, schema.fieldMap, 'email'),
        phone: valueFromParsedRow(row, schema.fieldMap, 'phone'),
        address: valueFromParsedRow(row, schema.fieldMap, 'address'),
        city: valueFromParsedRow(row, schema.fieldMap, 'city'),
        state: valueFromParsedRow(row, schema.fieldMap, 'state'),
        postalCode: valueFromParsedRow(row, schema.fieldMap, 'postal_code'),
        tags: splitTags(valueFromParsedRow(row, schema.fieldMap, 'tags')),
        assignedStaff: valueFromParsedRow(row, schema.fieldMap, 'assigned_staff'),
        memo: valueFromParsedRow(row, schema.fieldMap, 'memo'),
        currency: valueFromParsedRow(row, schema.fieldMap, 'currency') || 'USD',
        rawValues,
        values: rawValues,
      } as PreviewRecord;
    }

    if (schema.fileClass === 'campaign') {
      return {
        ...(existing ?? {}),
        id: existing?.id ?? `campaign-${index + 1}`,
        sourceRowRef: row.ref,
        code: valueFromParsedRow(row, schema.fieldMap, 'code'),
        campaignName: valueFromParsedRow(row, schema.fieldMap, 'campaign_name') || row.ref,
        startDate: valueFromParsedRow(row, schema.fieldMap, 'start_date'),
        endDate: valueFromParsedRow(row, schema.fieldMap, 'end_date'),
        status: valueFromParsedRow(row, schema.fieldMap, 'status'),
        goalAmount: money(valueFromParsedRow(row, schema.fieldMap, 'goal_amount')),
        rawValues,
        values: rawValues,
      } as PreviewRecord;
    }

    if (schema.fileClass === 'coa') {
      return {
        ...(existing ?? {}),
        id: existing?.id ?? `coa-${index + 1}`,
        sourceRowRef: row.ref,
        accountCode: valueFromParsedRow(row, schema.fieldMap, 'account_code'),
        accountName: valueFromParsedRow(row, schema.fieldMap, 'account_name'),
        accountType: valueFromParsedRow(row, schema.fieldMap, 'account_type'),
        balance: money(valueFromParsedRow(row, schema.fieldMap, 'balance')),
        rawValues,
        values: rawValues,
      } as PreviewRecord;
    }

    const preview = Object.entries(rawValues)
      .filter(([, value]) => String(value || '').trim())
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' · ');
    return {
      ...(existing ?? {}),
      id: existing?.id ?? `unknown-${index + 1}`,
      sourceRowRef: row.ref,
      preview: preview || row.ref,
      values: rawValues,
      rawValues,
    } as PreviewRecord;
  });

  return {
    ...parsedFile,
    preview: {
      fileClass: schema.fileClass,
      canonicalModel: schema.canonicalModel,
      summary: {
        rowCount: records.length,
        populatedFields: parsedFile.headers.length,
        primaryLabel: parsedFile.preview?.summary.primaryLabel ?? schema.reportType,
      },
      records,
    },
  };
}

function remapRawValues(rawValues: Record<string, string> | undefined, headerMap: Map<string, string>): Record<string, string> {
  return Object.entries(rawValues ?? {}).reduce<Record<string, string>>((acc, [header, value]) => {
    acc[headerMap.get(header) ?? header] = value;
    return acc;
  }, {});
}

function prepareSchemaForMergedHeaders(schema: ResolvedSchema): ResolvedSchema {
  const headerMap = new Map<string, string>();
  const nextFieldMap = Object.entries(schema.fieldMap ?? {}).reduce<Record<string, string>>((acc, [canonicalKey, rawHeader]) => {
    if (!rawHeader) return acc;
    const normalized = normalizeHeaderKey(rawHeader);
    const mergedHeader = headerMap.get(normalized) ?? canonicalKey;
    headerMap.set(normalized, mergedHeader);
    acc[canonicalKey] = mergedHeader;
    return acc;
  }, {});

  return {
    ...schema,
    fieldMap: nextFieldMap,
  };
}

function findPreferredHeader(headers: string[], preferredNormalizedHeaders: string[]): string | null {
  const preferred = new Set(preferredNormalizedHeaders);
  return headers.find((header) => preferred.has(normalizeHeaderKey(header))) ?? null;
}

function applyHeaderHeuristicsToSchema(schema: ResolvedSchema, headers: string[]): ResolvedSchema {
  if (schema.fileClass !== 'donor' && schema.fileClass !== 'ledger') return schema;

  const nextFieldMap = { ...(schema.fieldMap ?? {}) } as Record<string, string>;
  const maybeOverride = (canonicalKey: string, preferredNormalizedHeaders: string[]) => {
    const preferredHeader = findPreferredHeader(headers, preferredNormalizedHeaders);
    if (!preferredHeader) return;
    const currentHeader = nextFieldMap[canonicalKey];
    const currentNormalized = normalizeHeaderKey(currentHeader ?? '');
    if (preferredNormalizedHeaders.includes(currentNormalized)) return;
    nextFieldMap[canonicalKey] = preferredHeader;
  };

  if (schema.fileClass === 'donor') {
    // Keep donor identity headers pinned to donor_name before workbook union runs.
    // If a source tab exposes "Full Name" or "Name" and schema guessing drifts,
    // safe union can stop collapsing obvious donor-name aliases together.
    maybeOverride('donor_name', ['donorname', 'constituentname', 'fullname', 'name', 'entityname', 'contactname', 'accountname']);
  }

  // Fundraising transaction headers need stronger guardrails than the generic schema guesser.
  // In multi-source donor uploads we often see:
  // program -> fund
  // campaign_name -> campaign
  // appeal_name -> appeal
  // If we collapse these incorrectly during prepareIncomingUpload, the original meaning is lost.
  maybeOverride('fund', ['fund', 'fundname', 'designation', 'program', 'programname']);
  maybeOverride('campaign_name', ['campaign', 'campaignname']);
  maybeOverride('appeal', ['appeal', 'appealname']);

  maybeOverride('address', ['address', 'address1', 'street1', 'street', 'streetaddress', 'addressline1']);
  maybeOverride('phone', ['phone', 'phonenumber', 'homephone', 'mobile', 'telephone', 'cellphone', 'workphone']);
  maybeOverride('email', ['email', 'emailaddress', 'email_address', 'e-mail', 'e-mailaddress']);
  maybeOverride('postal_code', ['postalcode', 'zipcode', 'zip']);

  return {
    ...schema,
    fieldMap: nextFieldMap,
  };
}

function ensureMergeState(
  parsedFile: ParsedFileWithMerge,
  uploadedFiles: string[],
  canonicalHeaders: string[],
  pendingMerges: PendingColumnMerge[] = [],
  autoMergedColumns: AutoMergedColumnMatch[] = [],
): ParsedFileWithMerge {
  return {
    ...parsedFile,
    mergeState: {
      uploadedFiles,
      canonicalHeaders,
      pendingMerges,
      autoMergedColumns,
    },
  };
}

function markNeedsPersonResolveOnRows(inputRows: CanonicalLedgerRow[]): CanonicalLedgerRow[] {
  const grouped = new Map<string, CanonicalLedgerRow[]>();
  inputRows.forEach((row) => {
    const key = normalizeHeaderKey(row.entity_name || '');
    if (!key) return;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  });

  const flagged = new Set<string>();
  grouped.forEach((group) => {
    const files = new Set(group.map((row) => row.source_file).filter(Boolean));
    const signatures = new Set(group.map((row) => [row.entity_name, row.memo, row.raw_fund, row.raw_appeal].filter(Boolean).join('|').toLowerCase()));
    if (files.size > 1 && signatures.size > 1) group.forEach((row) => flagged.add(row.id));
  });

  return inputRows.map((row) => ({ ...row, needs_person_resolve: flagged.has(row.id) }));
}

function markNeedsPersonResolveOnParsedFile(parsedFile: ParsedFileWithMerge, fileClass: string): ParsedFileWithMerge {
  if (!parsedFile.preview || (fileClass !== 'constituent' && fileClass !== 'donor')) return parsedFile;
  const records: PreviewRecord[] = parsedFile.preview.records.map((record) => ({ ...record, needs_person_resolve: false }));
  const grouped = new Map<string, PreviewRecord[]>();

  records.forEach((record) => {
    const label = fileClass === 'donor'
      ? record.donorName || [record.firstName, record.lastName].filter(Boolean).join(' ')
      : record.displayName || [record.firstName, record.lastName].filter(Boolean).join(' ');
    const key = normalizeHeaderKey(String(label ?? ''));
    if (!key) return;
    const current = grouped.get(key) ?? [];
    current.push(record);
    grouped.set(key, current);
  });

  const flagged = new Set<string>();
  grouped.forEach((group) => {
    const files = new Set(group.map((record) => record.source_file).filter(Boolean));
    const signatures = new Set(group.map((record) => [record.email, record.phone, record.address, record.city, record.state, record.postalCode].filter(Boolean).join('|').toLowerCase()));
    if (files.size > 1 && signatures.size > 1) group.forEach((record) => flagged.add(record.id));
  });

  return {
    ...parsedFile,
    preview: {
      ...parsedFile.preview,
      records: records.map((record) => ({ ...record, needs_person_resolve: flagged.has(record.id) })),
    },
  };
}

function mergeSchemas(current: ResolvedSchema, incoming: ResolvedSchema): ResolvedSchema {
  return {
    ...current,
    ...incoming,
    confidence: Math.min(current.confidence, incoming.confidence),
    expectedFields: Array.from(new Set([...(current.expectedFields ?? []), ...(incoming.expectedFields ?? [])])),
    unresolvedFields: Array.from(new Set([...(current.unresolvedFields ?? []), ...(incoming.unresolvedFields ?? [])])),
    // Current schema has the actual raw header names in use (applyHeaderMergePlan maps incoming
    // rows to current's header names). Incoming's prepared fieldMap has canonical-key-as-value
    // entries (e.g. date→'date') which are wrong once the plan renames the rows back. Let current
    // take precedence for shared fields; incoming fills in any fields the current doesn't have.
    fieldMap: {
      ...(incoming.fieldMap ?? {}),
      ...(current.fieldMap ?? {}),
    },
    fieldSuggestions: [],
  };
}

function buildSchemaTargetMap(schema: ResolvedSchema | null | undefined): Map<string, string> {
  const targetMap = new Map<string, string>();
  Object.entries(schema?.fieldMap ?? {}).forEach(([canonicalTarget, rawHeader]) => {
    if (!canonicalTarget) return;
    targetMap.set(normalizeHeaderKey(canonicalTarget), canonicalTarget);
    if (rawHeader) targetMap.set(normalizeHeaderKey(rawHeader), canonicalTarget);
  });
  return targetMap;
}

function resolveSchemaTarget(header: string, targetMap: Map<string, string>): string | null {
  return targetMap.get(normalizeHeaderKey(header)) ?? null;
}

function buildCanonicalToRawHeaderMap(schema: ResolvedSchema | null | undefined): Map<string, string> {
  const reverse = new Map<string, string>();
  Object.entries(schema?.fieldMap ?? {}).forEach(([canonicalKey, rawHeader]) => {
    if (!canonicalKey || !rawHeader) return;
    reverse.set(normalizeHeaderKey(canonicalKey), rawHeader);
  });
  return reverse;
}

function buildPreparedRawHeaderMap(parsedFile: ParsedFileWithMerge | null | undefined): Map<string, string> {
  const reverse = new Map<string, string>();
  Object.entries(parsedFile?.mergeState?.rawHeaderLabelsByMergedHeader ?? {}).forEach(([mergedHeader, rawHeader]) => {
    if (!mergedHeader || !rawHeader) return;
    reverse.set(normalizeHeaderKey(mergedHeader), rawHeader);
  });
  return reverse;
}

function buildPreparedRawHeaderLabelLookup(parsedFile: ParsedFileWithMerge | null | undefined): Map<string, string> {
  return new Map(
    Object.entries(parsedFile?.mergeState?.rawHeaderLabelsByMergedHeader ?? {})
      .filter(([mergedHeader, rawHeader]) => Boolean(mergedHeader && rawHeader)),
  );
}

function uniqueHeaderVariants(...values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function maxHeaderSimilarity(left: string[], right: string[]): number {
  let best = 0;
  left.forEach((leftValue) => {
    right.forEach((rightValue) => {
      best = Math.max(best, scoreHeaderSimilarity(leftValue, rightValue));
    });
  });
  return best;
}

function hasExactHeaderVariantMatch(left: string[], right: string[]): boolean {
  const normalizedRight = new Set(right.map((value) => normalizeHeaderKey(value)).filter(Boolean));
  return left.some((value) => normalizedRight.has(normalizeHeaderKey(value)));
}

function hasAliasHeaderVariantMatch(left: string[], right: string[]): boolean {
  const normalizedRight = new Set(right.map((value) => resolveHeaderAlias(value)).filter(Boolean));
  return left.some((value) => normalizedRight.has(resolveHeaderAlias(value)));
}

function isIdentityNameVariant(value: string): boolean {
  return ['donor_name', 'entity_name'].includes(normalizeHeaderKey(value)) || resolveHeaderAlias(value) === 'fullname';
}

type IntelligentHeaderMatch = {
  action: AppendColumnDecision['action'];
  matchType: AppendColumnDecision['matchType'];
  reason:
    | 'exact'
    | 'schema_alias'
    | 'alias_group'
    | 'identity_name_family'
    | 'semantic_review'
    | 'fuzzy_review'
    | 'fuzzy_keep_separate'
    | 'concept_review'
    | 'new';
  score: number | null;
  targetHeader: string | null;
};

function chooseIntelligentHeaderMatch(params: {
  existingHeaders: string[];
  incomingHeader: string;
  originalIncomingHeader: string;
  existingRawHeaderLabels: Map<string, string>;
  existingSchemaTargets: Map<string, string>;
  incomingSchemaTargets: Map<string, string>;
  existingSource: string[] | ParsedFile;
  incomingSource: string[] | ParsedFile;
}): IntelligentHeaderMatch {
  const incomingVariants = uniqueHeaderVariants(params.incomingHeader, params.originalIncomingHeader);
  const incomingSchemaTarget = resolveSchemaTarget(params.incomingHeader, params.incomingSchemaTargets);

  const scoredCandidates = params.existingHeaders.map((header) => {
    const existingVariants = uniqueHeaderVariants(header, params.existingRawHeaderLabels.get(header));
    const exact = hasExactHeaderVariantMatch(existingVariants, incomingVariants);
    const schemaAlias = incomingSchemaTarget
      ? resolveSchemaTarget(header, params.existingSchemaTargets) === incomingSchemaTarget
      : false;
    const alias = hasAliasHeaderVariantMatch(existingVariants, incomingVariants);
    const headerSimilarity = maxHeaderSimilarity(existingVariants, incomingVariants);
    const hasIdentityNameFamily = existingVariants.some(isIdentityNameVariant) && incomingVariants.some(isIdentityNameVariant);
    const needsReview = shouldReviewColumnMerge(params.existingSource, params.incomingSource, header, params.incomingHeader);
    const semanticReview = isSemanticReviewPair(header, params.incomingHeader);
    const forceSemanticReview = shouldForceSemanticColumnReview(header, params.incomingHeader);
    const incomingConcept = inferHeaderConcept(params.incomingHeader);
    const headerConcept = inferHeaderConcept(header);

    let match: IntelligentHeaderMatch = {
      action: 'keep_separate',
      matchType: 'new',
      reason: 'new',
      score: null,
      targetHeader: null,
    };

    if (exact) {
      match = {
        action: needsReview ? 'review' : 'merge',
        matchType: 'exact',
        reason: 'exact',
        score: 1,
        targetHeader: header,
      };
    } else if (schemaAlias) {
      match = {
        action: needsReview ? 'review' : 'merge',
        matchType: 'alias',
        reason: 'schema_alias',
        score: 0.98,
        targetHeader: header,
      };
    } else if (alias) {
      match = {
        action: needsReview ? 'review' : 'merge',
        matchType: 'alias',
        reason: 'alias_group',
        score: 0.93,
        targetHeader: header,
      };
    } else if (hasIdentityNameFamily) {
      match = {
        action: needsReview ? 'review' : 'merge',
        matchType: 'alias',
        reason: 'identity_name_family',
        score: Math.max(0.9, headerSimilarity),
        targetHeader: header,
      };
    } else if (semanticReview) {
      match = {
        action: 'review',
        matchType: 'alias',
        reason: 'semantic_review',
        score: 0.88,
        targetHeader: header,
      };
    } else if (headerSimilarity >= 0.84) {
      match = {
        action: forceSemanticReview ? 'review' : 'keep_separate',
        matchType: forceSemanticReview ? 'alias' : 'fuzzy',
        reason: forceSemanticReview ? 'fuzzy_review' : 'fuzzy_keep_separate',
        score: headerSimilarity,
        targetHeader: header,
      };
    } else {
      if (incomingConcept && areConceptsInSameReviewFamily(headerConcept, incomingConcept)) {
        match = {
          action: 'review',
          matchType: 'alias',
          reason: 'concept_review',
          score: 0.8 - (conceptReviewDistance(incomingConcept, headerConcept) * 0.01),
          targetHeader: header,
        };
      }
    }

    return { header, existingVariants, ...match };
  });

  const best = scoredCandidates
    .filter((candidate) => candidate.targetHeader)
    .sort((left, right) => {
      const scoreDelta = (right.score ?? -1) - (left.score ?? -1);
      if (scoreDelta !== 0) return scoreDelta;
      const reasonPriority = ['exact', 'schema_alias', 'alias_group', 'identity_name_family', 'semantic_review', 'fuzzy_review', 'concept_review', 'fuzzy_keep_separate', 'new'];
      return reasonPriority.indexOf(left.reason) - reasonPriority.indexOf(right.reason);
    })[0];

  if (!best?.targetHeader) {
    return {
      action: 'keep_separate',
      matchType: 'new',
      reason: 'new',
      score: null,
      targetHeader: null,
    };
  }

  return {
    action: best.action,
    matchType: best.matchType,
    reason: best.reason,
    score: best.score,
    targetHeader: best.targetHeader,
  };
}

export function buildAppendColumnDecisions(
  existingSource: string[] | ParsedFile,
  incomingSource: string[] | ParsedFile,
  sourceFile: string,
  options: AppendColumnDecisionOptions = {},
): AppendColumnDecision[] {
  const existingHeaders = Array.isArray(existingSource) ? existingSource : existingSource.headers;
  const incomingHeaders = Array.isArray(incomingSource) ? incomingSource : incomingSource.headers;
  const existingSchemaTargets = buildSchemaTargetMap(options.existingSchema);
  const incomingSchemaTargets = buildSchemaTargetMap(options.incomingSchema);
  const incomingCanonicalToRawHeader = buildCanonicalToRawHeaderMap(options.incomingSchema);
  const preparedIncomingRawHeaders = Array.isArray(incomingSource) ? new Map<string, string>() : buildPreparedRawHeaderMap(incomingSource);
  const existingPreparedRawHeaders = Array.isArray(existingSource) ? new Map<string, string>() : buildPreparedRawHeaderLabelLookup(existingSource);
  return incomingHeaders.map((incomingHeader) => {
    const originalIncomingHeader = preparedIncomingRawHeaders.get(normalizeHeaderKey(incomingHeader))
      ?? incomingCanonicalToRawHeader.get(normalizeHeaderKey(incomingHeader))
      ?? incomingHeader;
    const chosenMatch = chooseIntelligentHeaderMatch({
      existingHeaders,
      incomingHeader,
      originalIncomingHeader,
      existingRawHeaderLabels: existingPreparedRawHeaders,
      existingSchemaTargets,
      incomingSchemaTargets,
      existingSource,
      incomingSource,
    });
    if (!chosenMatch.targetHeader) {
    return {
      id: `${sourceFile}::${incomingHeader}::new`,
      sourceFile,
      incomingHeader,
      originalIncomingHeader,
      suggestedHeader: null,
      targetHeader: null,
      matchType: 'new',
      score: null,
      action: 'keep_separate',
    } satisfies AppendColumnDecision;
    }
    const sampleConflicts = chosenMatch.action === 'review' || chosenMatch.action === 'keep_separate'
      ? collectColumnConflictSamples(existingSource, incomingSource, chosenMatch.targetHeader, incomingHeader)
      : (shouldReviewColumnMerge(existingSource, incomingSource, chosenMatch.targetHeader, incomingHeader)
          ? collectColumnConflictSamples(existingSource, incomingSource, chosenMatch.targetHeader, incomingHeader)
          : undefined);
    return {
      id: `${sourceFile}::${incomingHeader}::${chosenMatch.targetHeader}`,
      sourceFile,
      incomingHeader,
      originalIncomingHeader,
      suggestedHeader: chosenMatch.targetHeader,
      targetHeader: chosenMatch.targetHeader,
      matchType: chosenMatch.matchType,
      score: chosenMatch.score,
      action: chosenMatch.action,
      sampleConflicts,
    } satisfies AppendColumnDecision;
  });
}

function buildHeaderPlanFromDecisions(existingHeaders: string[], decisions: AppendColumnDecision[]) {
  const mergedHeaders = [...existingHeaders];
  const headerMap = new Map<string, string>();
  const droppedHeaders = new Set<string>();
  const pendingMerges: PendingColumnMerge[] = [];
  const autoMergedColumns: AutoMergedColumnMatch[] = [];

  decisions.forEach((decision) => {
    if (decision.action === 'drop') {
      droppedHeaders.add(decision.incomingHeader);
      return;
    }
    if (decision.action === 'review' && decision.suggestedHeader) {
      pendingMerges.push({
        id: decision.id,
        sourceFile: decision.sourceFile,
        incomingHeader: decision.incomingHeader,
        originalIncomingHeader: decision.originalIncomingHeader,
        suggestedHeader: decision.suggestedHeader,
        splitHeader: buildIncomingSplitHeader([...mergedHeaders, decision.incomingHeader], decision.suggestedHeader),
        matchType: decision.matchType === 'new' ? 'fuzzy' : decision.matchType,
        score: decision.score,
        reason: decision.matchType === 'fuzzy' ? 'fuzzy_candidate' : 'value_review',
      });
    }
    const canMerge = decision.action === 'merge' && decision.targetHeader && existingHeaders.includes(decision.targetHeader);
    if (canMerge && (decision.matchType === 'exact' || decision.matchType === 'alias')) {
      autoMergedColumns.push({
        id: decision.id,
        sourceFile: decision.sourceFile,
        incomingHeader: decision.incomingHeader,
        originalIncomingHeader: decision.originalIncomingHeader,
        targetHeader: decision.targetHeader!,
        splitHeader: buildIncomingSplitHeader([...mergedHeaders, decision.incomingHeader], decision.targetHeader!),
        matchType: decision.matchType,
        score: decision.score,
      });
    }
    const target = canMerge ? decision.targetHeader! : decision.incomingHeader;
    headerMap.set(decision.incomingHeader, target);
    if (!mergedHeaders.includes(target)) mergedHeaders.push(target);
  });

  return { headerMap, droppedHeaders, mergedHeaders, pendingMerges, autoMergedColumns };
}

function rewriteValuesWithPlan(values: Record<string, string>, headerMap: Map<string, string>, droppedHeaders: Set<string>): Record<string, string> {
  return Object.entries(values ?? {}).reduce<Record<string, string>>((acc, [header, value]) => {
    if (droppedHeaders.has(header)) return acc;
    const target = headerMap.get(header) ?? header;
    if (!(target in acc) || !acc[target]) acc[target] = value;
    return acc;
  }, {});
}

function applyHeaderMergePlan(parsedFile: ParsedFileWithMerge, plan: ReturnType<typeof buildHeaderPlanFromDecisions>): ParsedFileWithMerge {
  const incomingRowRefs = parsedFile.rows.map((row) => row.ref);
  return ensureMergeState(
    {
      ...parsedFile,
      headers: plan.mergedHeaders,
      rows: parsedFile.rows.map((row) => ({ ...row, values: rewriteValuesWithPlan(row.values, plan.headerMap, plan.droppedHeaders) })),
      preview: parsedFile.preview
        ? {
            ...parsedFile.preview,
            summary: {
              ...parsedFile.preview.summary,
              populatedFields: plan.mergedHeaders.length,
            },
            records: parsedFile.preview.records.map((record) => {
              const previewRecord = record as PreviewRecord;
              return {
                ...previewRecord,
                rawValues: rewriteValuesWithPlan(getRawValues(previewRecord), plan.headerMap, plan.droppedHeaders),
                ...(previewRecord.values ? { values: rewriteValuesWithPlan(previewRecord.values, plan.headerMap, plan.droppedHeaders) } : {}),
              };
            }),
          }
        : parsedFile.preview,
    },
    parsedFile.mergeState?.uploadedFiles ?? [parsedFile.fileName],
    plan.mergedHeaders,
    [
      ...(parsedFile.mergeState?.pendingMerges ?? []),
      ...plan.pendingMerges.filter((merge) => !(parsedFile.mergeState?.pendingMerges ?? []).some((current) => current.id === merge.id)),
    ],
    [
      ...(parsedFile.mergeState?.autoMergedColumns ?? []),
      ...plan.autoMergedColumns
        .filter((merge) => !(parsedFile.mergeState?.autoMergedColumns ?? []).some((current) => current.id === merge.id))
        .map((merge) => ({ ...merge, sourceRowRefs: incomingRowRefs })),
    ],
  );
}

export function prepareIncomingUpload(
  parsedFile: ParsedFile,
  schema: ResolvedSchema,
  rows: CanonicalLedgerRow[],
  fileName: string,
  namespace: string,
): { parsedFile: ParsedFileWithMerge; schema: ResolvedSchema; rows: CanonicalLedgerRow[] } {
  const correctedSchema = applyHeaderHeuristicsToSchema(schema, parsedFile.headers ?? []);
  const preparedSchema = prepareSchemaForMergedHeaders(correctedSchema);
  const mappedHeaders = new Map<string, string>();
  const normalizedHeaderLabels = new Map<string, string>();

  // Use the ORIGINAL schema (not the prepared one) so raw header names like 'gift_date',
  // 'home_phone', 'address1' are correctly mapped to their canonical keys when renaming
  // the incoming file's headers. prepareSchemaForMergedHeaders replaces raw header values
  // with canonical keys (e.g. gift_date→date), which breaks the lookup.
  Object.entries(correctedSchema.fieldMap ?? {}).forEach(([canonicalKey, header]) => {
    if (!header) return;
    mappedHeaders.set(header, canonicalKey);
    normalizedHeaderLabels.set(normalizeHeaderKey(header), canonicalKey);
  });

  const remappedHeaders = parsedFile.headers.reduce<string[]>((acc, header, index) => {
    const normalized = normalizeHeaderKey(header);
    const mergedHeader = mappedHeaders.get(header)
      ?? normalizedHeaderLabels.get(normalized)
      ?? header.trim()
      ?? `column_${index + 1}`;
    if (!normalizedHeaderLabels.has(normalized)) normalizedHeaderLabels.set(normalized, mergedHeader);
    if (!acc.includes(mergedHeader)) acc.push(mergedHeader);
    return acc;
  }, []);

  const rawHeaderMap = new Map<string, string>();
  const rawHeaderLabelsByMergedHeader = parsedFile.headers.reduce<Record<string, string[]>>((acc, header, index) => {
    const mergedHeader = remappedHeaders[index] ?? header;
    const current = acc[mergedHeader] ?? [];
    if (!current.includes(header)) current.push(header);
    acc[mergedHeader] = current;
    return acc;
  }, {});
  parsedFile.headers.forEach((header, index) => {
    const normalized = normalizeHeaderKey(header);
    rawHeaderMap.set(
      header,
      mappedHeaders.get(header)
        ?? normalizedHeaderLabels.get(normalized)
        ?? remappedHeaders[index]
        ?? header,
    );
  });

  const preparedParsedFile = rebuildParsedPreview(ensureMergeState(
    {
      ...parsedFile,
      fileName: `${parsedFile.fileName} [${namespace}]`,
      headers: remappedHeaders,
      rows: parsedFile.rows.map((row) => ({
        ...row,
        ref: `${namespace}::${row.ref}`,
        values: remapRawValues(row.values, rawHeaderMap),
      })),
      preview: parsedFile.preview
        ? {
            ...parsedFile.preview,
            summary: {
              ...parsedFile.preview.summary,
              rowCount: parsedFile.preview.records.length,
              populatedFields: remappedHeaders.length,
            },
            records: parsedFile.preview.records.map((record) => {
              const previewRecord = record as PreviewRecord;
              return {
                ...previewRecord,
                id: `${namespace}::${previewRecord.id}`,
                sourceRowRef: `${namespace}::${previewRecord.sourceRowRef}`,
                source_file: fileName,
                source_file_class: correctedSchema.fileClass,
                sourceFileClass: correctedSchema.fileClass,
                needs_person_resolve: false,
                rawValues: remapRawValues(getRawValues(previewRecord), rawHeaderMap),
                ...(previewRecord.values ? { values: remapRawValues(previewRecord.values, rawHeaderMap) } : {}),
              };
            }),
          }
        : parsedFile.preview,
    },
    [fileName],
    remappedHeaders,
    [],
    [],
  ), preparedSchema);

  if (preparedParsedFile.mergeState) {
    preparedParsedFile.mergeState.rawHeaderLabelsByMergedHeader = Object.fromEntries(
      Object.entries(rawHeaderLabelsByMergedHeader).map(([mergedHeader, rawHeaders]) => [mergedHeader, rawHeaders.join(' + ')]),
    );
  }

  const preparedRows = rows.map((row) => ({
    ...row,
    id: `${namespace}::${row.id}`,
    source_row_ref: `${namespace}::${row.source_row_ref}`,
    source_file: fileName,
    needs_person_resolve: false,
    journal_id: row.journal_id ? `${namespace}::${row.journal_id}` : row.journal_id,
  }));

  return {
    parsedFile: preparedParsedFile,
    schema: preparedSchema,
    rows: preparedRows,
  };
}

export function mergeUploadIntoExisting(input: {
  currentParsedFile: ParsedFile;
  currentSchema: ResolvedSchema;
  currentRows: CanonicalLedgerRow[];
  incomingParsedFile: ParsedFileWithMerge;
  incomingSchema: ResolvedSchema;
  incomingRows: CanonicalLedgerRow[];
  sourceFile: string;
  columnDecisions?: AppendColumnDecision[];
}) {
  const decisions = input.columnDecisions ?? buildAppendColumnDecisions(input.currentParsedFile, input.incomingParsedFile, input.sourceFile, {
    existingSchema: input.currentSchema,
    incomingSchema: input.incomingSchema,
  });
  const plan = buildHeaderPlanFromDecisions(input.currentParsedFile.headers, decisions);
  const plannedIncoming = applyHeaderMergePlan(input.incomingParsedFile, plan);
  const nextSchema = mergeSchemas(input.currentSchema, input.incomingSchema);
  const mergedHeaders = Array.from(new Set([...(input.currentParsedFile.headers ?? []), ...(plannedIncoming.headers ?? [])]));
  const mergedPreviewRecords = Array.from(
    new Map(
      [
        ...(((input.currentParsedFile.preview?.records ?? []) as Array<PreviewRecord | null | undefined>)
          .filter((record): record is PreviewRecord => Boolean(record?.sourceRowRef))
          .map((record) => [String(record.sourceRowRef), record] as const)),
        ...(((plannedIncoming.preview?.records ?? []) as Array<PreviewRecord | null | undefined>)
          .filter((record): record is PreviewRecord => Boolean(record?.sourceRowRef))
          .map((record) => [String(record.sourceRowRef), record] as const)),
      ],
    ).values(),
  );
  const mergedParsedFile = markNeedsPersonResolveOnParsedFile(
    rebuildParsedPreview(ensureMergeState(
      {
        ...input.currentParsedFile,
        fileName: `${input.currentParsedFile.fileName} + ${plannedIncoming.fileName}`,
        headers: mergedHeaders,
        rows: [...(input.currentParsedFile.rows ?? []), ...(plannedIncoming.rows ?? [])],
        preview: mergedPreviewRecords.length > 0
          ? {
              ...(input.currentParsedFile.preview ?? plannedIncoming.preview ?? {
                fileClass: nextSchema.fileClass,
                canonicalModel: nextSchema.canonicalModel,
                summary: {
                  rowCount: mergedPreviewRecords.length,
                  populatedFields: mergedHeaders.length,
                  primaryLabel: nextSchema.reportType,
                },
              }),
              summary: {
                ...(input.currentParsedFile.preview?.summary
                  ?? plannedIncoming.preview?.summary
                  ?? {
                    rowCount: mergedPreviewRecords.length,
                    populatedFields: mergedHeaders.length,
                    primaryLabel: nextSchema.reportType,
                  }),
                rowCount: mergedPreviewRecords.length,
                populatedFields: mergedHeaders.length,
              },
              records: mergedPreviewRecords,
            }
          : (input.currentParsedFile.preview || plannedIncoming.preview),
      },
      Array.from(new Set([...(input.currentParsedFile as ParsedFileWithMerge).mergeState?.uploadedFiles ?? [], ...(plannedIncoming.mergeState?.uploadedFiles ?? [])])),
      mergedHeaders,
      Array.from(new Map([...(input.currentParsedFile as ParsedFileWithMerge).mergeState?.pendingMerges ?? [], ...(plannedIncoming.mergeState?.pendingMerges ?? [])].map((merge) => [merge.id, merge])).values()),
      Array.from(new Map([...(input.currentParsedFile as ParsedFileWithMerge).mergeState?.autoMergedColumns ?? [], ...(plannedIncoming.mergeState?.autoMergedColumns ?? [])].map((merge) => [merge.id, merge])).values()),
    ), nextSchema),
    nextSchema.fileClass,
  );

  return {
    parsedFile: mergedParsedFile,
    schema: nextSchema,
    rows: markNeedsPersonResolveOnRows([...(input.currentRows ?? []), ...(input.incomingRows ?? [])]),
    pendingMergeCount: mergedParsedFile.mergeState?.pendingMerges.length ?? 0,
  };
}

export function getPendingColumnMerges(parsedFile: ParsedFile | null): PendingColumnMerge[] {
  return ((parsedFile as ParsedFileWithMerge | null)?.mergeState?.pendingMerges ?? [])
    .filter((merge) => !isLegacyTextValueColumnReview(merge));
}

function isLegacyTextValueColumnReview(merge: PendingColumnMerge): boolean {
  const conflicts = merge.sampleConflicts ?? [];
  return (
    merge.reason === 'value_review' &&
    conflicts.length > 0 &&
    conflicts.every((conflict) => conflict.reason === 'same_shape_different_value') &&
    !isSemanticReviewPair(merge.suggestedHeader, merge.incomingHeader)
  );
}

export function resolvePendingColumnMerge(parsedFile: ParsedFile, merge: PendingColumnMerge, action: 'combine' | 'keep_separate' | 'keep_s1' | 'keep_s2', schema?: ResolvedSchema | null): ParsedFile {
  const current = parsedFile as ParsedFileWithMerge;
  if (action === 'keep_separate') {
    const nextHeaders = current.headers.map((header) => (header === merge.incomingHeader ? merge.splitHeader : header));
    const rewriteSeparate = (values: Record<string, string>) => {
      const next = { ...(values ?? {}) };
      if (merge.incomingHeader in next) {
        next[merge.splitHeader] = next[merge.incomingHeader];
        delete next[merge.incomingHeader];
      }
      return next;
    };
    const nextParsedFile = ensureMergeState(
      {
        ...current,
        headers: nextHeaders,
        rows: current.rows.map((row) => ({ ...row, values: rewriteSeparate(row.values) })),
        preview: current.preview
          ? {
              ...current.preview,
              summary: {
                ...current.preview.summary,
                populatedFields: nextHeaders.length,
              },
              records: current.preview.records.map((record) => {
                const previewRecord = record as PreviewRecord;
                return {
                  ...previewRecord,
                  rawValues: rewriteSeparate(getRawValues(previewRecord)),
                  ...(previewRecord.values ? { values: rewriteSeparate(previewRecord.values) } : {}),
                };
              }),
            }
          : current.preview,
      },
      current.mergeState?.uploadedFiles ?? [],
      nextHeaders,
      (current.mergeState?.pendingMerges ?? []).filter((item) => item.id !== merge.id),
      current.mergeState?.autoMergedColumns ?? [],
    );
    return schema ? rebuildParsedPreview(nextParsedFile, schema) : nextParsedFile;
  }

  const rewrite = (values: Record<string, string>) => {
    const next = { ...(values ?? {}) };
    const fromValue = next[merge.incomingHeader];
    const existingValue = String(next[merge.suggestedHeader] ?? '').trim();
    const incomingValue = String(fromValue ?? '').trim();
    if (action === 'combine' && incomingValue) {
      if (!existingValue) {
        next[merge.suggestedHeader] = fromValue;
      } else if (existingValue !== incomingValue) {
        next[merge.suggestedHeader] = `${existingValue} | ${incomingValue}`;
      }
    }
    if (action === 'keep_s2') {
      next[merge.suggestedHeader] = fromValue;
    }
    delete next[merge.incomingHeader];
    return next;
  };

  const nextHeaders = current.headers.filter((header) => header !== merge.incomingHeader);
  const nextParsedFile = ensureMergeState(
    {
      ...current,
      headers: nextHeaders,
      rows: current.rows.map((row) => ({ ...row, values: rewrite(row.values) })),
      preview: current.preview
        ? {
            ...current.preview,
            summary: {
              ...current.preview.summary,
              populatedFields: nextHeaders.length,
            },
            records: current.preview.records.map((record) => {
              const previewRecord = record as PreviewRecord;
              return {
                ...previewRecord,
                rawValues: rewrite(getRawValues(previewRecord)),
                ...(previewRecord.values ? { values: rewrite(previewRecord.values) } : {}),
              };
            }),
          }
        : current.preview,
    },
    current.mergeState?.uploadedFiles ?? [],
    nextHeaders,
    (current.mergeState?.pendingMerges ?? []).filter((item) => item.id !== merge.id),
    current.mergeState?.autoMergedColumns ?? [],
  );
  return schema ? rebuildParsedPreview(nextParsedFile, schema) : nextParsedFile;
}

export function separateAutoMergedColumn(parsedFile: ParsedFile, merge: AutoMergedColumnMatch, schema?: ResolvedSchema | null): ParsedFile {
  const current = parsedFile as ParsedFileWithMerge;
  const sourceRowRefs = new Set(merge.sourceRowRefs ?? []);
  const nextHeaders = current.headers.includes(merge.splitHeader)
    ? current.headers
    : [...current.headers, merge.splitHeader];

  const rewriteSeparate = (values: Record<string, string>, rowRef: string) => {
    if (!sourceRowRefs.has(rowRef)) return values ?? {};
    const next = { ...(values ?? {}) };
    if (merge.targetHeader in next) {
      next[merge.splitHeader] = next[merge.targetHeader];
      delete next[merge.targetHeader];
    }
    return next;
  };

  const nextParsedFile = ensureMergeState(
    {
      ...current,
      headers: nextHeaders,
      rows: current.rows.map((row) => ({ ...row, values: rewriteSeparate(row.values, row.ref) })),
      preview: current.preview
        ? {
            ...current.preview,
            summary: {
              ...current.preview.summary,
              populatedFields: nextHeaders.length,
            },
            records: current.preview.records.map((record) => {
              const previewRecord = record as PreviewRecord;
              return {
                ...previewRecord,
                rawValues: rewriteSeparate(getRawValues(previewRecord), previewRecord.sourceRowRef),
                ...(previewRecord.values ? { values: rewriteSeparate(previewRecord.values, previewRecord.sourceRowRef) } : {}),
              };
            }),
          }
        : current.preview,
    },
    current.mergeState?.uploadedFiles ?? [],
    nextHeaders,
    current.mergeState?.pendingMerges ?? [],
    (current.mergeState?.autoMergedColumns ?? []).filter((item) => item.id !== merge.id),
  );

  return schema ? rebuildParsedPreview(nextParsedFile, schema) : nextParsedFile;
}

// ─── Merge strategy detection ────────────────────────────────────────────────

function isTxFileClass(fc: string): boolean {
  return fc === 'ledger' || fc === 'donor';
}

function isProfileFileClass(fc: string): boolean {
  return fc === 'constituent';
}

export type MergeStrategy = 'tx_tx' | 'tx_profile' | 'profile_profile';

export function getMergeStrategy(currentFileClass: string, incomingFileClass: string): MergeStrategy | null {
  if (isTxFileClass(currentFileClass) && isTxFileClass(incomingFileClass)) return 'tx_tx';
  if ((isTxFileClass(currentFileClass) && isProfileFileClass(incomingFileClass)) || (isProfileFileClass(currentFileClass) && isTxFileClass(incomingFileClass))) return 'tx_profile';
  if (isProfileFileClass(currentFileClass) && isProfileFileClass(incomingFileClass)) return 'profile_profile';
  return null;
}

// ─── tx + profile lookup enrichment ──────────────────────────────────────────

type ProfileLookupEntry = {
  sourceRowRef: string;
  canonicalPersonId: string;
  record: PreviewRecord;
  email: string;
  phone: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
};

type TxProfileReviewItem = {
  id: string;
  txSourceRowRef: string;
  profileSourceRowRef: string;
  txDisplayName: string;
  profileDisplayName: string;
  reason: 'field_conflict' | 'ambiguous_match';
  conflictingFields: string[];
  evidence: string[];
};

type TxProfileAutoMergePair = {
  txSourceRowRef: string;
  profileSourceRowRef: string;
};

const PREVIEW_FIELD_BY_SEMANTIC: Partial<Record<string, keyof PreviewRecord>> = {
  donor_name: 'donorName',
  first_name: 'firstName',
  last_name: 'lastName',
  organization_name: 'organizationName',
  household_name: 'householdName',
  email: 'email',
  phone: 'phone',
  address: 'address',
  city: 'city',
  state: 'state',
  postal_code: 'postalCode',
  date: 'date',
  amount: 'amount',
  fund: 'fund',
  appeal: 'appeal',
  campaign_name: 'campaignName',
  memo: 'memo',
  currency: 'currency',
  assigned_staff: 'assignedStaff',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
};

function getSemanticRecordValue(record: PreviewRecord, schema: ResolvedSchema, semantic: string): string {
  const rawValues = getRawValues(record);
  const mappedHeader = schema.fieldMap?.[semantic as keyof typeof schema.fieldMap];
  if (mappedHeader) {
    const rawValue = String(rawValues[mappedHeader] ?? '').trim();
    if (rawValue) return rawValue;
  }
  const fallbackRawValue = getSemanticFallbackRawValue(rawValues, semantic);
  if (fallbackRawValue) return fallbackRawValue;
  if (semantic === 'entity_name') {
    const entityValue = String((record as Record<string, unknown>)['displayName'] ?? '').trim();
    if (entityValue) return entityValue;
  }
  const previewField = PREVIEW_FIELD_BY_SEMANTIC[semantic];
  if (previewField) {
    const previewValue = String(record[previewField] ?? '').trim();
    if (previewValue) return previewValue;
  }
  return '';
}

type SemanticFallbackFamily =
  | 'identity_name'
  | 'first_name'
  | 'last_name'
  | 'organization_name'
  | 'household_name'
  | 'email'
  | 'phone'
  | 'address'
  | 'city'
  | 'state'
  | 'postal_code'
  | 'country'
  | 'date'
  | 'created_at'
  | 'updated_at'
  | 'amount'
  | 'fund'
  | 'appeal'
  | 'campaign_name'
  | null;

function tokenizeSemanticLabel(value: string): string[] {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function inferSemanticFallbackFamily(value: string): SemanticFallbackFamily {
  const normalized = normalizeHeaderKey(value);
  if (!normalized) return null;

  const headerConcept = inferHeaderConcept(value);
  if (headerConcept === 'email') return 'email';
  if (headerConcept === 'phone') return 'phone';
  if (headerConcept === 'address') return 'address';
  if (headerConcept === 'postal_code') return 'postal_code';
  if (headerConcept === 'amount') return 'amount';
  if (headerConcept === 'appeal') return 'appeal';
  if (headerConcept === 'campaign') return 'campaign_name';
  if (headerConcept === 'fund' || headerConcept === 'program') return 'fund';

  const dateGroup = inferDateSemanticGroup(value);
  if (dateGroup === 'created') return 'created_at';
  if (dateGroup === 'updated') return 'updated_at';
  if (dateGroup === 'generic' || dateGroup === 'transaction') return 'date';

  const tokens = new Set(tokenizeSemanticLabel(value));
  if (tokens.has('email')) return 'email';
  if (tokens.has('phone') || tokens.has('telephone') || tokens.has('mobile')) return 'phone';
  if (tokens.has('address') || tokens.has('street')) return 'address';
  if (tokens.has('postal') || tokens.has('zip') || tokens.has('zipcode')) return 'postal_code';
  if (tokens.has('city') || tokens.has('town')) return 'city';
  if (tokens.has('state') || tokens.has('province') || tokens.has('region')) return 'state';
  if (tokens.has('country') || tokens.has('nation')) return 'country';
  if (tokens.has('household')) return 'household_name';
  if (tokens.has('organization') || tokens.has('company') || tokens.has('business') || tokens.has('account')) return 'organization_name';
  if (tokens.has('first') || tokens.has('given') || tokens.has('fname')) return 'first_name';
  if (tokens.has('last') || tokens.has('family') || tokens.has('surname') || tokens.has('lname')) return 'last_name';
  if (tokens.has('name') || isIdentityNameVariant(value)) return 'identity_name';

  return null;
}

function headerMatchesSemantic(header: string, semantic: string): boolean {
  const headerFamily = inferSemanticFallbackFamily(header);
  const semanticFamily = inferSemanticFallbackFamily(semantic);
  if (!headerFamily || !semanticFamily) return normalizeHeaderKey(header) === normalizeHeaderKey(semantic);
  if (semanticFamily === 'identity_name') return headerFamily === 'identity_name';
  return headerFamily === semanticFamily;
}

function getSemanticFallbackRawValue(rawValues: Record<string, string>, semantic: string): string {
  const direct = Object.entries(rawValues).find(([header, value]) => headerMatchesSemantic(header, semantic) && String(value ?? '').trim());
  if (direct) return String(direct[1] ?? '').trim();

  if (semantic === 'entity_name') {
    const donorName = getSemanticFallbackRawValue(rawValues, 'donor_name');
    if (donorName) return donorName;
  }

  if (semantic === 'donor_name') {
    const firstName = getSemanticFallbackRawValue(rawValues, 'first_name');
    const lastName = getSemanticFallbackRawValue(rawValues, 'last_name');
    const organizationName = getSemanticFallbackRawValue(rawValues, 'organization_name');
    return organizationName || [firstName, lastName].filter(Boolean).join(' ').trim();
  }

  return '';
}

function getFirstPopulatedSemanticValue(record: PreviewRecord, schema: ResolvedSchema, semantics: string[]): string {
  for (const semantic of semantics) {
    const value = getSemanticRecordValue(record, schema, semantic);
    if (value) return value;
  }
  return '';
}

function getLookupNameParts(record: PreviewRecord, schema: ResolvedSchema): { display: string; normalized: string } {
  const directName = getFirstPopulatedSemanticValue(record, schema, ['donor_name', 'entity_name']);
  if (directName) return { display: directName, normalized: normLookupStr(directName) };
  const firstName = getSemanticRecordValue(record, schema, 'first_name');
  const lastName = getSemanticRecordValue(record, schema, 'last_name');
  const organizationName = getSemanticRecordValue(record, schema, 'organization_name');
  const display = organizationName || [firstName, lastName].filter(Boolean).join(' ').trim();
  return { display, normalized: normLookupStr(display) };
}

function getLookupContactValue(record: PreviewRecord, schema: ResolvedSchema, kind: 'email' | 'phone'): string {
  return getSemanticRecordValue(record, schema, kind);
}

function compareLookupField(left: string, right: string, kind: 'email' | 'phone' | 'text'): boolean {
  const leftValue = String(left || '').trim();
  const rightValue = String(right || '').trim();
  if (!leftValue || !rightValue) return true;
  if (kind === 'email') return normLookupEmail(leftValue) === normLookupEmail(rightValue);
  if (kind === 'phone') return normLookupPhone(leftValue) === normLookupPhone(rightValue);
  return normLookupStr(leftValue) === normLookupStr(rightValue);
}

function getRecordConflictValues(record: PreviewRecord, schema: ResolvedSchema) {
  const rawValues = getRawValues(record);
  return {
    email: getSemanticRecordValue(record, schema, 'email'),
    phone: getSemanticRecordValue(record, schema, 'phone'),
    address: getSemanticRecordValue(record, schema, 'address'),
    city: getSemanticRecordValue(record, schema, 'city'),
    state: getSemanticRecordValue(record, schema, 'state'),
    postalCode: getSemanticRecordValue(record, schema, 'postal_code'),
    rawValues,
  };
}

function getTxProfileConflictingFields(
  txRecord: PreviewRecord,
  txSchema: ResolvedSchema,
  profileRecord: PreviewRecord,
  profileSchema: ResolvedSchema,
): string[] {
  const conflicts: string[] = [];
  const txValues = getRecordConflictValues(txRecord, txSchema);
  const profileValues = getRecordConflictValues(profileRecord, profileSchema);
  if (!compareLookupField(txValues.email, profileValues.email, 'email')) conflicts.push('email');
  if (!compareLookupField(txValues.phone, profileValues.phone, 'phone')) conflicts.push('phone');
  if (!compareLookupField(txValues.address, profileValues.address, 'text')) conflicts.push('address');
  if (!compareLookupField(txValues.city, profileValues.city, 'text')) conflicts.push('city');
  if (!compareLookupField(txValues.state, profileValues.state, 'text')) conflicts.push('state');
  if (!compareLookupField(txValues.postalCode, profileValues.postalCode, 'text')) conflicts.push('postal code');
  return conflicts;
}

function buildTxProfileEvidence(
  txRecord: PreviewRecord,
  txSchema: ResolvedSchema,
  profileRecord: PreviewRecord,
  profileSchema: ResolvedSchema,
): string[] {
  const evidence: string[] = [];
  const txEmail = getLookupContactValue(txRecord, txSchema, 'email');
  const profileEmail = getLookupContactValue(profileRecord, profileSchema, 'email');
  if (txEmail && profileEmail && compareLookupField(txEmail, profileEmail, 'email')) evidence.push(`Email ${txEmail}`);
  const txPhone = getLookupContactValue(txRecord, txSchema, 'phone');
  const profilePhone = getLookupContactValue(profileRecord, profileSchema, 'phone');
  if (txPhone && profilePhone && compareLookupField(txPhone, profilePhone, 'phone')) evidence.push(`Phone ${txPhone}`);
  const txName = getLookupNameParts(txRecord, txSchema).display;
  const profileName = getLookupNameParts(profileRecord, profileSchema).display;
  if (txName && profileName && hasCompatibleLookupName(txName, profileName)) evidence.push(`Name ${txName} ↔ ${profileName}`);
  return evidence;
}

function normLookupStr(s: string): string {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
}
function normLookupPhone(s: string): string {
  return String(s || '').replace(/\D/g, '').slice(-10);
}
function normLookupEmail(s: string): string {
  const raw = String(s || '').toLowerCase().trim();
  if (!raw.includes('@')) return raw;
  const [local, domain] = raw.split('@');
  return `${local.split('+')[0]}@${domain}`;
}

function splitLookupName(name: string): { firstName: string; lastName: string } {
  const parts = String(name || '').toLowerCase().trim().replace(/[^a-z0-9 ]+/g, ' ').replace(/ +/g, ' ').split(' ').filter(Boolean);
  return {
    firstName: parts.slice(0, -1).join(' ') || parts[0] || '',
    lastName: parts.slice(-1)[0] || '',
  };
}

function buildLookupBigrams(value: string): string[] {
  const normalized = normLookupStr(value);
  if (!normalized) return [];
  if (normalized.length === 1) return [normalized];
  const bigrams: string[] = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    bigrams.push(normalized.slice(index, index + 2));
  }
  return bigrams;
}

function computeLookupNameSimilarity(left: string, right: string): number {
  const normalizedLeft = normLookupStr(left);
  const normalizedRight = normLookupStr(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const leftBigrams = buildLookupBigrams(normalizedLeft);
  const rightBigrams = buildLookupBigrams(normalizedRight);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) return 0;

  const counts = new Map<string, number>();
  leftBigrams.forEach((bigram) => counts.set(bigram, (counts.get(bigram) ?? 0) + 1));

  let overlap = 0;
  rightBigrams.forEach((bigram) => {
    const current = counts.get(bigram) ?? 0;
    if (current <= 0) return;
    overlap += 1;
    counts.set(bigram, current - 1);
  });

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function hasConflictingLookupName(txName: string, profileName: string): boolean {
  const txParts = splitLookupName(txName);
  const profileParts = splitLookupName(profileName);
  if (!txParts.firstName || !txParts.lastName || !profileParts.firstName || !profileParts.lastName) return false;
  return txParts.lastName === profileParts.lastName && txParts.firstName !== profileParts.firstName;
}

function hasCompatibleLookupName(txName: string, profileName: string): boolean {
  const normalizedTx = normLookupStr(txName);
  const normalizedProfile = normLookupStr(profileName);
  if (!normalizedTx || !normalizedProfile) return false;
  if (normalizedTx === normalizedProfile) return true;
  if (hasConflictingLookupName(txName, profileName)) return false;
  return computeLookupNameSimilarity(txName, profileName) >= 0.78;
}

function buildProfileLookupIndex(profileRecords: PreviewRecord[], profileSchema: ResolvedSchema): {
  byEmail: Map<string, ProfileLookupEntry[]>;
  byPhone: Map<string, ProfileLookupEntry[]>;
  byName: Map<string, ProfileLookupEntry[]>;
} {
  const byEmail = new Map<string, ProfileLookupEntry[]>();
  const byPhone = new Map<string, ProfileLookupEntry[]>();
  const byName = new Map<string, ProfileLookupEntry[]>();

  for (const record of profileRecords) {
    const r = record as Record<string, unknown>;
    const email = normLookupEmail(getLookupContactValue(record, profileSchema, 'email'));
    const phone = normLookupPhone(getLookupContactValue(record, profileSchema, 'phone'));
    const rawName = getLookupNameParts(record, profileSchema).display;
    const name = normLookupStr(rawName);
    const entry: ProfileLookupEntry = {
      sourceRowRef: String(r['sourceRowRef'] || r['id'] || ''),
      canonicalPersonId: String(r['canonical_person_id'] || r['canonicalPersonId'] || r['sourceRowRef'] || r['id'] || ''),
      record,
      email,
      phone,
      name,
      address: getSemanticRecordValue(record, profileSchema, 'address'),
      city: getSemanticRecordValue(record, profileSchema, 'city'),
      state: getSemanticRecordValue(record, profileSchema, 'state'),
      postalCode: getSemanticRecordValue(record, profileSchema, 'postal_code'),
    };

    if (email) { if (!byEmail.has(email)) byEmail.set(email, []); byEmail.get(email)!.push(entry); }
    if (phone) { if (!byPhone.has(phone)) byPhone.set(phone, []); byPhone.get(phone)!.push(entry); }
    if (name) { if (!byName.has(name)) byName.set(name, []); byName.get(name)!.push(entry); }
  }

  return { byEmail, byPhone, byName };
}

function findBestProfileMatch(txRecord: PreviewRecord, txSchema: ResolvedSchema, profileSchema: ResolvedSchema, index: ReturnType<typeof buildProfileLookupIndex>): {
  entry: ProfileLookupEntry | null;
  matchStatus: 'matched' | 'unmatched' | 'ambiguous' | 'conflict';
  conflictingFields: string[];
  ambiguousEntries: ProfileLookupEntry[];
} {
  const email = normLookupEmail(getLookupContactValue(txRecord, txSchema, 'email'));
  const phone = normLookupPhone(getLookupContactValue(txRecord, txSchema, 'phone'));
  const rawName = getLookupNameParts(txRecord, txSchema).display;
  const name = normLookupStr(rawName);
  const txName = rawName;

  const scores = new Map<string, { entry: ProfileLookupEntry; score: number }>();
  const add = (entry: ProfileLookupEntry, score: number) => {
    const existing = scores.get(entry.sourceRowRef);
    if (!existing || existing.score < score) scores.set(entry.sourceRowRef, { entry, score });
  };

  if (email) {
    (index.byEmail.get(email) ?? []).forEach((entry) => {
      if (hasConflictingLookupName(txName, entry.name)) return;
      if (hasCompatibleLookupName(txName, entry.name)) add(entry, 3);
    });
  }
  if (phone) {
    (index.byPhone.get(phone) ?? []).forEach((entry) => {
      if (hasConflictingLookupName(txName, entry.name)) return;
      if (hasCompatibleLookupName(txName, entry.name)) add(entry, 2);
    });
  }
  if (name) (index.byName.get(name) ?? []).forEach((e) => add(e, 1));

  if (scores.size === 0) return { entry: null, matchStatus: 'unmatched', conflictingFields: [], ambiguousEntries: [] };

  const sorted = Array.from(scores.values())
    .filter(({ entry }) => {
      if (email && entry.email && email !== entry.email) return false;
      if (phone && entry.phone && phone !== entry.phone) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score);
  if (sorted.length === 0) return { entry: null, matchStatus: 'unmatched', conflictingFields: [], ambiguousEntries: [] };
  const conflictingFields = getTxProfileConflictingFields(txRecord, txSchema, sorted[0].entry.record, profileSchema);
  if (conflictingFields.length > 0) {
    return { entry: sorted[0].entry, matchStatus: 'conflict', conflictingFields, ambiguousEntries: [] };
  }
  if (sorted.length > 1 && sorted[0].score === sorted[1].score) {
    return {
      entry: sorted[0].entry,
      matchStatus: 'ambiguous',
      conflictingFields: [],
      ambiguousEntries: sorted.filter((item) => item.score === sorted[0].score).map((item) => item.entry),
    };
  }
  return { entry: sorted[0].entry, matchStatus: 'matched', conflictingFields: [], ambiguousEntries: [] };
}

export function mergeTxWithProfileLookup(input: {
  txParsedFile: ParsedFile;
  txSchema: ResolvedSchema;
  txRows: CanonicalLedgerRow[];
  profileParsedFile: ParsedFile;
  profileSchema: ResolvedSchema;
  profileFileName: string;
}): { parsedFile: ParsedFileWithMerge; schema: ResolvedSchema; rows: CanonicalLedgerRow[] } {
  const columnDecisions = buildAppendColumnDecisions(
    input.txParsedFile,
    input.profileParsedFile,
    input.profileFileName,
    {
      existingSchema: input.txSchema,
      incomingSchema: input.profileSchema,
    },
  );
  const plan = buildHeaderPlanFromDecisions(input.txParsedFile.headers ?? [], columnDecisions);
  const profileRecords = (input.profileParsedFile.preview?.records ?? []) as PreviewRecord[];
  const index = buildProfileLookupIndex(profileRecords, input.profileSchema);
  const profileHeaders = input.profileParsedFile.headers ?? [];
  const profileHeaderTargets = new Map<string, string>(
    profileHeaders.map((header) => [header, plan.headerMap.get(header) ?? header]),
  );

  // Build match map: tx preview record sourceRowRef → { entry, matchStatus }
  const txRecords = (input.txParsedFile.preview?.records ?? []) as PreviewRecord[];
  const matchMap = new Map<string, ReturnType<typeof findBestProfileMatch>>();
  for (const record of txRecords) {
    const ref = String((record as Record<string, unknown>)['sourceRowRef'] || (record as Record<string, unknown>)['id'] || '');
    matchMap.set(ref, findBestProfileMatch(record, input.txSchema, input.profileSchema, index));
  }
  const txProfileReviewItems: TxProfileReviewItem[] = txRecords.flatMap((record) => {
    const ref = String((record as Record<string, unknown>)['sourceRowRef'] || (record as Record<string, unknown>)['id'] || '');
    const match = matchMap.get(ref);
    if (!match || !match.entry || (match.matchStatus !== 'conflict' && match.matchStatus !== 'ambiguous')) return [];
    const profileRecord = match.entry.record;
    return [{
      id: `tx-profile-review::${ref}::${match.entry.sourceRowRef}`,
      txSourceRowRef: ref,
      profileSourceRowRef: match.entry.sourceRowRef,
      txDisplayName: getLookupNameParts(record, input.txSchema).display || ref,
      profileDisplayName: getLookupNameParts(profileRecord, input.profileSchema).display || match.entry.sourceRowRef,
      reason: match.matchStatus === 'conflict' ? 'field_conflict' : 'ambiguous_match',
      conflictingFields: match.conflictingFields,
      evidence: buildTxProfileEvidence(record, input.txSchema, profileRecord, input.profileSchema),
    }];
  });
  const txProfileAutoMergePairs: TxProfileAutoMergePair[] = txRecords.flatMap((record) => {
    const ref = String((record as Record<string, unknown>)['sourceRowRef'] || (record as Record<string, unknown>)['id'] || '');
    const match = matchMap.get(ref);
    if (!match || match.matchStatus !== 'matched' || !match.entry) return [];
    return [{ txSourceRowRef: ref, profileSourceRowRef: match.entry.sourceRowRef }];
  });

  const nextHeaders = plan.mergedHeaders;

  // Enrich parsed source rows with profile lookup results
  const enrichedRows = input.txParsedFile.rows.map((row) => {
    const match = matchMap.get(row.ref);
    if (!match || match.matchStatus !== 'matched' || !match.entry) return row;
    const profileValues = rewriteValuesWithPlan(getRawValues(match.entry.record), plan.headerMap, plan.droppedHeaders);
    return {
      ...row,
      values: {
        ...row.values,
        ...Object.fromEntries(
          Object.entries(profileValues).map(([header, value]) => [
            header,
            row.values?.[header] || value || '',
          ]),
        ),
      },
    };
  });

  const enrichedCanonicalRows = input.txRows.map((row) => {
    const match = matchMap.get(row.source_row_ref);
    if (!match || match.matchStatus !== 'matched' || !match.entry) return row;
    const profileValues = rewriteValuesWithPlan(getRawValues(match.entry.record), plan.headerMap, plan.droppedHeaders);
    return {
      ...row,
      canonical_person_id: match.entry.canonicalPersonId ?? row.canonical_person_id,
      entity_name: row.entity_name || getLookupNameParts(match.entry.record, input.profileSchema).display,
      source_file: row.source_file || String((match.entry.record as Record<string, unknown>)['source_file'] || (match.entry.record as Record<string, unknown>)['sourceFile'] || ''),
      memo: row.memo || String(profileValues.memo || ''),
    };
  });

  // Enrich tx preview records with matched profile data
  const enrichedRecords = txRecords.map((record) => {
    const ref = String((record as Record<string, unknown>)['sourceRowRef'] || (record as Record<string, unknown>)['id'] || '');
    const match = matchMap.get(ref);
    if (!match || match.matchStatus !== 'matched' || !match.entry) return record;
    const entry = match.entry;
    const currentRawValues = getRawValues(record);
    const profileValues = rewriteValuesWithPlan(getRawValues(entry.record), plan.headerMap, plan.droppedHeaders);
    return {
      ...record,
      rawValues: {
        ...currentRawValues,
        ...Object.fromEntries(
          Object.entries(profileValues).map(([header, value]) => [
            header,
            currentRawValues[header] || String(value ?? ''),
          ]),
        ),
      },
      values: {
        ...(record.values ?? {}),
        ...Object.fromEntries(
          Object.entries(profileValues).map(([header, value]) => [
            header,
            String((record.values ?? {})[header] ?? value ?? ''),
          ]),
        ),
      },
      canonical_person_id: entry.canonicalPersonId ?? (record as Record<string, unknown>)['canonical_person_id'] ?? null,
      ...Object.fromEntries(Object.entries(profileValues).map(([header, value]) => [header, String(value ?? '')])),
    };
  });

  const allProfileRecords = profileRecords;
  const allProfileParsedRows = allProfileRecords.map((record, index) => ({
    ref: String(record.sourceRowRef ?? record.id ?? `profile-row-${index + 1}`),
    values: Object.fromEntries(nextHeaders.map((header) => [header, ''])),
  })).map((row, index) => ({
    ...row,
    values: {
      ...row.values,
      ...rewriteValuesWithPlan(getRawValues(allProfileRecords[index]), plan.headerMap, plan.droppedHeaders),
    },
  }));
  const allProfileCanonicalRows = allProfileRecords.map((record, index) => {
    const label = getLookupNameParts(record, input.profileSchema).display || String(record.sourceRowRef || record.id || `profile-only-${index + 1}`);
    return {
      id: String(record.sourceRowRef ?? record.id ?? `profile-row-${index + 1}`),
      date: '',
      entity_name: label,
      account_code: '',
      account_name: '',
      debit: '',
      credit: '',
      currency: '',
      memo: '',
      source_platform: input.txRows[0]?.source_platform ?? input.txParsedFile.platform,
      source_row_ref: String(record.sourceRowRef ?? record.id ?? `profile-row-${index + 1}`),
      source_file: String((record as Record<string, unknown>)['source_file'] || (record as Record<string, unknown>)['sourceFile'] || input.profileFileName),
      journal_id: '',
      mapping_confidence: 0,
      review_status: 'pending' as const,
      needs_review: false,
      suggested_fix: null,
      qbo_account_id: null,
      qbo_txn_id: null,
      canonical_person_id: String(record.sourceRowRef ?? record.id ?? ''),
      canonical_household_id: null,
      raw_fund: null,
      raw_appeal: null,
      taxonomy_exception_id: null,
      canonical_org_id: null,
      attribution_entry_id: null,
      normalized_fund: null,
      normalized_appeal: null,
      needs_person_resolve: false,
    };
  });
  const allProfilePreviewRecords = allProfileRecords.map((record, index) => ({
    ...record,
    id: String(record.id ?? record.sourceRowRef ?? `profile-row-${index + 1}`),
    sourceRowRef: String(record.sourceRowRef ?? record.id ?? `profile-row-${index + 1}`),
    rawValues: {
      ...Object.fromEntries(nextHeaders.map((header) => [header, ''])),
      ...rewriteValuesWithPlan(getRawValues(record), plan.headerMap, plan.droppedHeaders),
    },
    values: {
      ...Object.fromEntries(nextHeaders.map((header) => [header, ''])),
      ...rewriteValuesWithPlan(getRawValues(record), plan.headerMap, plan.droppedHeaders),
    },
    sourceFileClass: (record.sourceFileClass ?? record.source_file_class ?? 'constituent'),
    source_file_class: (record.sourceFileClass ?? record.source_file_class ?? 'constituent'),
    link_profile_only: true,
  }));

  const uploadedFiles = Array.from(new Set([
    ...((input.txParsedFile as ParsedFileWithMerge).mergeState?.uploadedFiles ?? [input.txParsedFile.fileName]),
    input.profileFileName,
  ]));

  const matchedCount = Array.from(matchMap.values()).filter((m) => m.matchStatus === 'matched').length;
  const ambiguousCount = Array.from(matchMap.values()).filter((m) => m.matchStatus === 'ambiguous').length;
  const unmatchedCount = Array.from(matchMap.values()).filter((m) => m.matchStatus === 'unmatched').length;

  const nextParsedFile = ensureMergeState(
    {
      ...input.txParsedFile,
      fileName: `${input.txParsedFile.fileName} + ${input.profileFileName}`,
      headers: nextHeaders,
      rows: [...enrichedRows, ...allProfileParsedRows],
      preview: input.txParsedFile.preview
        ? {
            ...input.txParsedFile.preview,
            summary: {
              ...input.txParsedFile.preview.summary,
              rowCount: enrichedRecords.length + allProfilePreviewRecords.length,
              populatedFields: nextHeaders.length,
            },
            records: [...enrichedRecords, ...allProfilePreviewRecords],
          }
        : input.txParsedFile.preview,
    },
    uploadedFiles,
    nextHeaders,
    plan.pendingMerges,
    plan.autoMergedColumns,
  );

  return {
    parsedFile: nextParsedFile,
    schema: {
      ...mergeSchemas(input.txSchema, input.profileSchema),
      _txProfileMatchSummary: {
        matched: matchedCount,
        ambiguous: ambiguousCount,
        conflicting: txProfileReviewItems.filter((item) => item.reason === 'field_conflict').length,
        unmatched: unmatchedCount,
        profileOnly: allProfileRecords.filter((record) => {
          const recordRef = String(record.sourceRowRef ?? record.id ?? '');
          return !Array.from(matchMap.values()).some((match) => match.matchStatus === 'matched' && match.entry?.sourceRowRef === recordRef);
        }).length,
      },
      _txProfileAutoMergePairs: txProfileAutoMergePairs,
      _txProfileReviewItems: txProfileReviewItems,
    } as ResolvedSchema,
    rows: [...enrichedCanonicalRows, ...allProfileCanonicalRows],
  };
}
