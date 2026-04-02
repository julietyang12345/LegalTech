import type { CanonicalLedgerRow, ParsedFile, PreviewRecord, ResolvedSchema } from './types';

export type PendingColumnMerge = {
  id: string;
  sourceFile: string;
  incomingHeader: string;
  suggestedHeader: string;
  matchType: 'fuzzy';
  score: number;
};

export type AppendColumnDecision = {
  id: string;
  sourceFile: string;
  incomingHeader: string;
  suggestedHeader: string | null;
  targetHeader: string | null;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'new';
  score: number | null;
  action: 'merge' | 'keep_separate' | 'drop';
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
  ['fund', 'fundname'],
  ['appeal', 'campaign', 'appealname', 'campaignname'],
  ['amount', 'giftamount', 'donationamount'],
] as const;

function normalizeHeaderKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveHeaderAlias(value: string): string {
  const normalized = normalizeHeaderKey(value);
  const group = HEADER_ALIAS_GROUPS.find((items) => (items as readonly string[]).includes(normalized));
  return group?.[0] ?? normalized;
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

export function buildAppendColumnDecisions(existingHeaders: string[], incomingHeaders: string[], sourceFile: string): AppendColumnDecision[] {
  return incomingHeaders.map((incomingHeader) => {
    const exact = existingHeaders.find((header) => normalizeHeaderKey(header) === normalizeHeaderKey(incomingHeader));
    if (exact) {
      return {
        id: `${sourceFile}::${incomingHeader}::${exact}`,
        sourceFile,
        incomingHeader,
        suggestedHeader: exact,
        targetHeader: exact,
        matchType: 'exact',
        score: 1,
        action: 'merge',
      } satisfies AppendColumnDecision;
    }

    const alias = existingHeaders.find((header) => resolveHeaderAlias(header) === resolveHeaderAlias(incomingHeader));
    if (alias) {
      return {
        id: `${sourceFile}::${incomingHeader}::${alias}`,
        sourceFile,
        incomingHeader,
        suggestedHeader: alias,
        targetHeader: alias,
        matchType: 'alias',
        score: null,
        action: 'merge',
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

  decisions.forEach((decision) => {
    if (decision.action === 'drop') {
      droppedHeaders.add(decision.incomingHeader);
      return;
    }
    const canMerge = decision.action === 'merge' && decision.targetHeader && existingHeaders.includes(decision.targetHeader);
    const target = canMerge ? decision.targetHeader! : decision.incomingHeader;
    headerMap.set(decision.incomingHeader, target);
    if (!mergedHeaders.includes(target)) mergedHeaders.push(target);
  });

  return { headerMap, droppedHeaders, mergedHeaders, pendingMerges: [] as PendingColumnMerge[] };
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
  const decisions = input.columnDecisions ?? buildAppendColumnDecisions(input.currentParsedFile.headers, input.incomingParsedFile.headers, input.sourceFile);
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
  return ((parsedFile as ParsedFileWithMerge | null)?.mergeState?.pendingMerges ?? []);
}

export function resolvePendingColumnMerge(parsedFile: ParsedFile, merge: PendingColumnMerge, action: 'merge' | 'keep_separate' | 'drop'): ParsedFile {
  const current = parsedFile as ParsedFileWithMerge;
  if (action === 'keep_separate') {
    return ensureMergeState(
      current,
      current.mergeState?.uploadedFiles ?? [],
      current.mergeState?.canonicalHeaders ?? current.headers,
      (current.mergeState?.pendingMerges ?? []).filter((item) => item.id !== merge.id),
    );
  }

  const rewrite = (values: Record<string, string>) => {
    const next = { ...(values ?? {}) };
    const fromValue = next[merge.incomingHeader];
    if (action === 'merge' && (next[merge.suggestedHeader] === undefined || next[merge.suggestedHeader] === null || next[merge.suggestedHeader] === '') && fromValue !== undefined) {
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
