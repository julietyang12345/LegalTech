import type { CanonicalLedgerRow, ParsedFile, PreviewRecord, ResolvedSchema } from './types';

export type PendingColumnMerge = {
  id: string;
  sourceFile: string;
  incomingHeader: string;
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

export type AppendColumnDecision = {
  id: string;
  sourceFile: string;
  incomingHeader: string;
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
};

type ParsedFileWithMerge = ParsedFile & { mergeState?: ParsedFileMergeState };

const HEADER_ALIAS_GROUPS = [
  ['email', 'emailaddress', 'e-mail', 'e-mailaddress'],
  ['firstname', 'first', 'fname', 'givenname'],
  ['lastname', 'last', 'lname', 'surname', 'familyname'],
  ['fullname', 'name', 'donorname', 'displayname', 'entityname'],
  ['phone', 'phonenumber', 'mobile', 'telephone'],
  ['address', 'address1', 'street', 'streetaddress'],
  ['postalcode', 'zipcode', 'zip'],
  ['date', 'giftdate', 'receiveddate', 'transactiondate'],
  ['fund', 'fundname'],
  ['appeal', 'appealname'],
  ['campaign', 'campaignname'],
  ['amount', 'giftamount', 'donationamount'],
] as const;

const SEMANTIC_REVIEW_HEADER_GROUPS = [
  ['fund', 'fundname', 'campaign', 'campaignname'],
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

function ensureMergeState(parsedFile: ParsedFileWithMerge, uploadedFiles: string[], canonicalHeaders: string[], pendingMerges: PendingColumnMerge[] = []): ParsedFileWithMerge {
  return {
    ...parsedFile,
    mergeState: {
      uploadedFiles,
      canonicalHeaders,
      pendingMerges,
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
    fieldMap: {
      ...(current.fieldMap ?? {}),
      ...(incoming.fieldMap ?? {}),
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
  return incomingHeaders.map((incomingHeader) => {
    const exact = existingHeaders.find((header) => normalizeHeaderKey(header) === normalizeHeaderKey(incomingHeader));
    if (exact) {
      const needsReview = shouldReviewColumnMerge(existingSource, incomingSource, exact, incomingHeader);
      const sampleConflicts = needsReview ? collectColumnConflictSamples(existingSource, incomingSource, exact, incomingHeader) : undefined;
      return {
        id: `${sourceFile}::${incomingHeader}::${exact}`,
        sourceFile,
        incomingHeader,
        suggestedHeader: exact,
        targetHeader: exact,
        matchType: 'exact',
        score: 1,
        action: needsReview ? 'review' : 'merge',
        sampleConflicts,
      } satisfies AppendColumnDecision;
    }

    const incomingSchemaTarget = resolveSchemaTarget(incomingHeader, incomingSchemaTargets);
    const schemaAlias = incomingSchemaTarget
      ? existingHeaders.find((header) => resolveSchemaTarget(header, existingSchemaTargets) === incomingSchemaTarget)
      : null;
    if (schemaAlias) {
      const needsReview = shouldReviewColumnMerge(existingSource, incomingSource, schemaAlias, incomingHeader);
      const sampleConflicts = needsReview ? collectColumnConflictSamples(existingSource, incomingSource, schemaAlias, incomingHeader) : undefined;
      return {
        id: `${sourceFile}::${incomingHeader}::${schemaAlias}`,
        sourceFile,
        incomingHeader,
        suggestedHeader: schemaAlias,
        targetHeader: schemaAlias,
        matchType: 'alias',
        score: null,
        action: needsReview ? 'review' : 'merge',
        sampleConflicts,
      } satisfies AppendColumnDecision;
    }

    const alias = existingHeaders.find((header) => resolveHeaderAlias(header) === resolveHeaderAlias(incomingHeader));
    if (alias) {
      const needsReview = shouldReviewColumnMerge(existingSource, incomingSource, alias, incomingHeader);
      const sampleConflicts = needsReview ? collectColumnConflictSamples(existingSource, incomingSource, alias, incomingHeader) : undefined;
      return {
        id: `${sourceFile}::${incomingHeader}::${alias}`,
        sourceFile,
        incomingHeader,
        suggestedHeader: alias,
        targetHeader: alias,
        matchType: 'alias',
        score: null,
        action: needsReview ? 'review' : 'merge',
        sampleConflicts,
      } satisfies AppendColumnDecision;
    }

    const semanticReview = existingHeaders.find((header) => isSemanticReviewPair(header, incomingHeader));
    if (semanticReview) {
      return {
        id: `${sourceFile}::${incomingHeader}::${semanticReview}`,
        sourceFile,
        incomingHeader,
        suggestedHeader: semanticReview,
        targetHeader: semanticReview,
        matchType: 'alias',
        score: null,
        action: 'review',
        sampleConflicts: collectColumnConflictSamples(existingSource, incomingSource, semanticReview, incomingHeader),
      } satisfies AppendColumnDecision;
    }

    const scored = existingHeaders
      .map((header) => ({ header, score: scoreHeaderSimilarity(header, incomingHeader) }))
      .sort((left, right) => right.score - left.score)[0];

    if (scored && scored.score >= 0.84) {
      return {
        id: `${sourceFile}::${incomingHeader}::${scored.header}`,
        sourceFile,
        incomingHeader,
        suggestedHeader: scored.header,
        targetHeader: scored.header,
        matchType: 'fuzzy',
        score: scored.score,
        action: 'keep_separate',
        sampleConflicts: collectColumnConflictSamples(existingSource, incomingSource, scored.header, incomingHeader),
      } satisfies AppendColumnDecision;
    }

    return {
      id: `${sourceFile}::${incomingHeader}::new`,
      sourceFile,
      incomingHeader,
      suggestedHeader: null,
      targetHeader: null,
      matchType: 'new',
      score: null,
      action: 'keep_separate',
    } satisfies AppendColumnDecision;
  });
}

function buildHeaderPlanFromDecisions(existingHeaders: string[], decisions: AppendColumnDecision[]) {
  const mergedHeaders = [...existingHeaders];
  const headerMap = new Map<string, string>();
  const droppedHeaders = new Set<string>();
  const pendingMerges: PendingColumnMerge[] = [];

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
        suggestedHeader: decision.suggestedHeader,
        splitHeader: buildIncomingSplitHeader([...mergedHeaders, decision.incomingHeader], decision.suggestedHeader),
        matchType: decision.matchType === 'new' ? 'fuzzy' : decision.matchType,
        score: decision.score,
        reason: decision.matchType === 'fuzzy' ? 'fuzzy_candidate' : 'value_review',
      });
    }
    const canMerge = decision.action === 'merge' && decision.targetHeader && existingHeaders.includes(decision.targetHeader);
    const target = canMerge ? decision.targetHeader! : decision.incomingHeader;
    headerMap.set(decision.incomingHeader, target);
    if (!mergedHeaders.includes(target)) mergedHeaders.push(target);
  });

  return { headerMap, droppedHeaders, mergedHeaders, pendingMerges };
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
  );
}

export function prepareIncomingUpload(
  parsedFile: ParsedFile,
  schema: ResolvedSchema,
  rows: CanonicalLedgerRow[],
  fileName: string,
  namespace: string,
): { parsedFile: ParsedFileWithMerge; schema: ResolvedSchema; rows: CanonicalLedgerRow[] } {
  const preparedSchema = prepareSchemaForMergedHeaders(schema);
  const mappedHeaders = new Map<string, string>();
  const normalizedHeaderLabels = new Map<string, string>();

  Object.entries(preparedSchema.fieldMap ?? {}).forEach(([canonicalKey, header]) => {
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

  const preparedParsedFile = ensureMergeState(
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
                source_file_class: schema.fileClass,
                sourceFileClass: schema.fileClass,
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
  );

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
  const mergedParsedFile = markNeedsPersonResolveOnParsedFile(
    ensureMergeState(
      {
        ...input.currentParsedFile,
        fileName: `${input.currentParsedFile.fileName} + ${plannedIncoming.fileName}`,
        headers: mergedHeaders,
        rows: [...(input.currentParsedFile.rows ?? []), ...(plannedIncoming.rows ?? [])],
        preview: input.currentParsedFile.preview || plannedIncoming.preview
          ? {
              fileClass: plannedIncoming.preview?.fileClass ?? input.currentParsedFile.preview?.fileClass ?? nextSchema.fileClass,
              canonicalModel: plannedIncoming.preview?.canonicalModel ?? input.currentParsedFile.preview?.canonicalModel ?? nextSchema.canonicalModel,
              summary: {
                rowCount: [...(input.currentParsedFile.preview?.records ?? []), ...(plannedIncoming.preview?.records ?? [])].length,
                populatedFields: mergedHeaders.length,
                primaryLabel: plannedIncoming.preview?.summary.primaryLabel ?? input.currentParsedFile.preview?.summary.primaryLabel ?? nextSchema.reportType,
              },
              records: [...(input.currentParsedFile.preview?.records ?? []), ...(plannedIncoming.preview?.records ?? [])],
            }
          : undefined,
      },
      Array.from(new Set([...(input.currentParsedFile as ParsedFileWithMerge).mergeState?.uploadedFiles ?? [], ...(plannedIncoming.mergeState?.uploadedFiles ?? [])])),
      mergedHeaders,
      Array.from(new Map([...(input.currentParsedFile as ParsedFileWithMerge).mergeState?.pendingMerges ?? [], ...(plannedIncoming.mergeState?.pendingMerges ?? [])].map((merge) => [merge.id, merge])).values()),
    ),
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

export function resolvePendingColumnMerge(parsedFile: ParsedFile, merge: PendingColumnMerge, action: 'combine' | 'keep_separate' | 'keep_s1' | 'keep_s2'): ParsedFile {
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
    return ensureMergeState(
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
    );
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
  return ensureMergeState(
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
  );
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

function buildProfileLookupIndex(profileRecords: PreviewRecord[]): {
  byEmail: Map<string, ProfileLookupEntry[]>;
  byPhone: Map<string, ProfileLookupEntry[]>;
  byName: Map<string, ProfileLookupEntry[]>;
} {
  const byEmail = new Map<string, ProfileLookupEntry[]>();
  const byPhone = new Map<string, ProfileLookupEntry[]>();
  const byName = new Map<string, ProfileLookupEntry[]>();

  for (const record of profileRecords) {
    const r = record as Record<string, unknown>;
    const email = normLookupEmail(String(r['email'] || ''));
    const phone = normLookupPhone(String(r['phone'] || ''));
    const rawName = String(r['displayName'] || r['donorName'] || [r['firstName'], r['lastName']].filter(Boolean).join(' ') || '');
    const name = normLookupStr(rawName);
    const entry: ProfileLookupEntry = {
      sourceRowRef: String(r['sourceRowRef'] || r['id'] || ''),
      canonicalPersonId: String(r['canonical_person_id'] || r['canonicalPersonId'] || r['sourceRowRef'] || r['id'] || ''),
      record,
      email,
      phone,
      name,
      address: String(r['address'] || ''),
      city: String(r['city'] || ''),
      state: String(r['state'] || ''),
      postalCode: String(r['postalCode'] || ''),
    };

    if (email) { if (!byEmail.has(email)) byEmail.set(email, []); byEmail.get(email)!.push(entry); }
    if (phone) { if (!byPhone.has(phone)) byPhone.set(phone, []); byPhone.get(phone)!.push(entry); }
    if (name) { if (!byName.has(name)) byName.set(name, []); byName.get(name)!.push(entry); }
  }

  return { byEmail, byPhone, byName };
}

function findBestProfileMatch(txRecord: PreviewRecord, index: ReturnType<typeof buildProfileLookupIndex>): {
  entry: ProfileLookupEntry | null;
  matchStatus: 'matched' | 'unmatched' | 'ambiguous';
} {
  const r = txRecord as Record<string, unknown>;
  const email = normLookupEmail(String(r['email'] || getRawValues(txRecord)['email'] || ''));
  const phone = normLookupPhone(String(r['phone'] || getRawValues(txRecord)['phone'] || ''));
  const rawName = String(r['donorName'] || r['displayName'] || [r['firstName'], r['lastName']].filter(Boolean).join(' ') || r['entity_name'] || '');
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

  if (scores.size === 0) return { entry: null, matchStatus: 'unmatched' };

  const sorted = Array.from(scores.values()).sort((a, b) => b.score - a.score);
  if (sorted.length > 1 && sorted[0].score === sorted[1].score) {
    return { entry: sorted[0].entry, matchStatus: 'ambiguous' };
  }
  return { entry: sorted[0].entry, matchStatus: 'matched' };
}

export function mergeTxWithProfileLookup(input: {
  txParsedFile: ParsedFile;
  txSchema: ResolvedSchema;
  txRows: CanonicalLedgerRow[];
  profileParsedFile: ParsedFile;
  profileFileName: string;
}): { parsedFile: ParsedFileWithMerge; schema: ResolvedSchema; rows: CanonicalLedgerRow[] } {
  const profileRecords = (input.profileParsedFile.preview?.records ?? []) as PreviewRecord[];
  const index = buildProfileLookupIndex(profileRecords);
  const profileHeaders = input.profileParsedFile.headers ?? [];
  const profileHeaderTargets = new Map<string, string>(
    profileHeaders.map((header) => [
      header,
      input.txParsedFile.headers.includes(header) ? `profile_${header}` : header,
    ]),
  );

  // Build match map: tx preview record sourceRowRef → { entry, matchStatus }
  const txRecords = (input.txParsedFile.preview?.records ?? []) as PreviewRecord[];
  const matchMap = new Map<string, { entry: ProfileLookupEntry | null; matchStatus: 'matched' | 'unmatched' | 'ambiguous' }>();
  for (const record of txRecords) {
    const ref = String((record as Record<string, unknown>)['sourceRowRef'] || (record as Record<string, unknown>)['id'] || '');
    matchMap.set(ref, findBestProfileMatch(record, index));
  }

  const extraHeaders = profileHeaders
    .map((header) => profileHeaderTargets.get(header) ?? header)
    .filter((header) => !input.txParsedFile.headers.includes(header));
  const nextHeaders = [...input.txParsedFile.headers, ...extraHeaders];

  // Enrich parsed source rows with profile lookup results
  const enrichedRows = input.txParsedFile.rows.map((row) => {
    const match = matchMap.get(row.ref);
    if (!match || match.matchStatus !== 'matched' || !match.entry) return row;
    const profileValues = getRawValues(match.entry.record);
    return {
      ...row,
      values: {
        ...row.values,
        ...Object.fromEntries(profileHeaders.map((header) => [
          profileHeaderTargets.get(header) ?? header,
          profileValues[header] || '',
        ])),
      },
    };
  });

  const enrichedCanonicalRows = input.txRows.map((row) => {
    const match = matchMap.get(row.source_row_ref);
    if (!match || match.matchStatus !== 'matched' || !match.entry) return row;
    const profileValues = getRawValues(match.entry.record);
    return {
      ...row,
      canonical_person_id: match.entry.canonicalPersonId ?? row.canonical_person_id,
      entity_name: row.entity_name || String((match.entry.record as Record<string, unknown>)['displayName'] || (match.entry.record as Record<string, unknown>)['donorName'] || ''),
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
    const profileValues = getRawValues(entry.record);
    return {
      ...record,
      rawValues: {
        ...currentRawValues,
        ...Object.fromEntries(profileHeaders.map((header) => [
          profileHeaderTargets.get(header) ?? header,
          String(profileValues[header] ?? ''),
        ])),
      },
      values: {
        ...(record.values ?? {}),
        ...Object.fromEntries(profileHeaders.map((header) => [
          profileHeaderTargets.get(header) ?? header,
          String(profileValues[header] ?? ''),
        ])),
      },
      canonical_person_id: entry.canonicalPersonId ?? (record as Record<string, unknown>)['canonical_person_id'] ?? null,
      ...Object.fromEntries(profileHeaders.map((header) => [
        profileHeaderTargets.get(header) ?? header,
        String(profileValues[header] ?? ''),
      ])),
    };
  });

  const matchedProfileRefs = new Set(
    Array.from(matchMap.values())
      .filter((match) => match.matchStatus === 'matched' && match.entry)
      .map((match) => match.entry!.sourceRowRef),
  );
  const profileOnlyRecords = profileRecords.filter((record) => !matchedProfileRefs.has(String(record.sourceRowRef ?? record.id ?? '')));
  const profileOnlyParsedRows = profileOnlyRecords.map((record, index) => ({
    ref: `profile-only::${String(record.sourceRowRef ?? record.id ?? index)}`,
    values: Object.fromEntries(nextHeaders.map((header) => [
      header,
      String(
        (() => {
          const originalProfileHeader = Array.from(profileHeaderTargets.entries()).find(([, target]) => target === header)?.[0];
          return originalProfileHeader
            ? (getRawValues(record)[originalProfileHeader] ?? (record as Record<string, unknown>)[originalProfileHeader] ?? '')
            : '';
        })(),
      ),
    ])),
  }));
  const profileOnlyCanonicalRows = profileOnlyRecords.map((record, index) => {
    const label = String((record as Record<string, unknown>)['displayName'] || (record as Record<string, unknown>)['donorName'] || [record.firstName, record.lastName].filter(Boolean).join(' ') || record.sourceRowRef || record.id || `profile-only-${index + 1}`);
    return {
      id: `profile-only::${String(record.sourceRowRef ?? record.id ?? index)}`,
      date: '',
      entity_name: label,
      account_code: '',
      account_name: '',
      debit: '',
      credit: '',
      currency: '',
      memo: '',
      source_platform: input.txRows[0]?.source_platform ?? input.txParsedFile.platform,
      source_row_ref: `profile-only::${String(record.sourceRowRef ?? record.id ?? index)}`,
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
  const profileOnlyPreviewRecords = profileOnlyRecords.map((record, index) => ({
    ...record,
    id: `profile-only::${String(record.sourceRowRef ?? record.id ?? index)}`,
    sourceRowRef: `profile-only::${String(record.sourceRowRef ?? record.id ?? index)}`,
    rawValues: Object.fromEntries(nextHeaders.map((header) => [
      header,
      String(
        (() => {
          const originalProfileHeader = Array.from(profileHeaderTargets.entries()).find(([, target]) => target === header)?.[0];
          return originalProfileHeader
            ? (getRawValues(record)[originalProfileHeader] ?? (record as Record<string, unknown>)[originalProfileHeader] ?? '')
            : '';
        })(),
      ),
    ])),
    values: Object.fromEntries(nextHeaders.map((header) => [
      header,
      String(
        (() => {
          const originalProfileHeader = Array.from(profileHeaderTargets.entries()).find(([, target]) => target === header)?.[0];
          return originalProfileHeader
            ? ((record.values as Record<string, string> | undefined)?.[originalProfileHeader] ?? getRawValues(record)[originalProfileHeader] ?? (record as Record<string, unknown>)[originalProfileHeader] ?? '')
            : '';
        })(),
      ),
    ])),
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
      rows: [...enrichedRows, ...profileOnlyParsedRows],
      preview: input.txParsedFile.preview
        ? {
            ...input.txParsedFile.preview,
            summary: {
              ...input.txParsedFile.preview.summary,
              rowCount: enrichedRecords.length + profileOnlyPreviewRecords.length,
              populatedFields: nextHeaders.length,
            },
            records: [...enrichedRecords, ...profileOnlyPreviewRecords],
          }
        : input.txParsedFile.preview,
    },
    uploadedFiles,
    nextHeaders,
    [],
  );

  return {
    parsedFile: nextParsedFile,
    schema: { ...input.txSchema, _txProfileMatchSummary: { matched: matchedCount, ambiguous: ambiguousCount, unmatched: unmatchedCount, profileOnly: profileOnlyRecords.length } } as ResolvedSchema,
    rows: [...enrichedCanonicalRows, ...profileOnlyCanonicalRows],
  };
}
