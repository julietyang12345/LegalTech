import type {
  ParsedFile,
  PreviewRecord,
  ResolvedSchema,
  SessionTaxonomyGroup,
  SessionTaxonomyState,
  TaxonomyCandidateGroup,
  TaxonomyObjectType,
  TaxonomyObservedValue,
  TaxonomyScanColumn,
} from './types';

const TAXONOMY_STOP_WORDS = new Set(['campaign', 'appeal', 'fund', 'the', 'and', 'for', 'program']);
const DENYLIST_PATTERNS = [
  /(^|[^a-z])(first|last|full)\s*name([^a-z]|$)/i,
  /(^|[^a-z])(email|phone|mobile|address|city|state|zip|zipcode|postal|country)([^a-z]|$)/i,
  /(^|[^a-z])(created|updated|timestamp|date|time|scheduled|settled|refunded)([^a-z]|$)/i,
  /(^|[^a-z])(amount|total|balance|debit|credit|goal|fee|tip|tips|currency|net)([^a-z]|$)/i,
  /(^|[^a-z])(memo|note|notes|description|comment)([^a-z]|$)/i,
  /(^|[^a-z])(id|transaction|row id|record id|status|owner|assigned staff|frequency|channel|method|recurring|type)([^a-z]|$)/i,
  /(^|[^a-z])(honoree|soft credit|schedule)([^a-z]|$)/i,
];
const LABEL_HINT_PATTERNS: Array<{ pattern: RegExp; objectType: TaxonomyObjectType | null; reason: string; score: number }> = [
  { pattern: /(^|[^a-z])fund([^a-z]|$)|designation|allocation/i, objectType: 'Fund', reason: 'Header suggests Fund', score: 0.58 },
  { pattern: /(^|[^a-z])appeal([^a-z]|$)|source\s*code|initiative/i, objectType: 'Appeal', reason: 'Header suggests Appeal', score: 0.58 },
  { pattern: /(^|[^a-z])campaign([^a-z]|$)/i, objectType: 'Campaign', reason: 'Header suggests Campaign', score: 0.58 },
  { pattern: /(^|[^a-z])(code|label|name)($|[^a-z])/i, objectType: null, reason: 'Header looks label-like', score: 0.16 },
];
const ABBREVIATION_MAP: Record<string, string[]> = {
  af: ['annual', 'fund'],
  dm: ['direct', 'mail'],
  ym: ['year', 'end', 'match'],
  eoy: ['year', 'end'],
  yr: ['year'],
  corp: ['corporate'],
  wkpl: ['workplace'],
  gt: ['giving', 'tuesday'],
  ann: ['annual'],
};
const MAX_TAXONOMY_SCAN_COLUMNS = 6;
const MAX_OBSERVED_VALUES_PER_COLUMN = 40;
const MAX_CANDIDATE_GROUP_SIZE = 8;
const MIN_PAIR_SCORE = 0.5;
const MIN_GROUP_AVERAGE_SCORE = 0.58;
const TAXONOMY_SCHEMA_FIELD_KEYS = new Set(['fund', 'appeal', 'campaign_name']);

function safeValues(parsedFile: ParsedFile, header: string) {
  return parsedFile.rows
    .map((row) => String(row.values?.[header] ?? '').trim())
    .filter(Boolean);
}

function titleCase(input: string) {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function toHeaderKey(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeYearToken(token: string) {
  if (/^20\d{2}$/.test(token)) return token;
  if (/^[0-9]{2}$/.test(token)) return `20${token}`;
  return token;
}

function expandToken(token: string) {
  const match = token.match(/^([a-z]+)(20\d{2}|\d{2})$/);
  if (match && ABBREVIATION_MAP[match[1]]) {
    return [...ABBREVIATION_MAP[match[1]], normalizeYearToken(match[2])];
  }
  return ABBREVIATION_MAP[token] ?? [token];
}

function normalizeTaxonomyValue(rawValue: string) {
  const years = Array.from(new Set((rawValue.match(/\b(20\d{2}|\d{2})\b/g) ?? []).map((token) => normalizeYearToken(token))));
  const expandedTokens = tokenize(rawValue)
    .flatMap((token) => expandToken(token))
    .map((token) => normalizeYearToken(token))
    .filter((token) => token && !TAXONOMY_STOP_WORDS.has(token));
  const normalizedTokens = expandedTokens.length > 0 ? expandedTokens : tokenize(rawValue).map((token) => normalizeYearToken(token));
  const sortedTokens = [...normalizedTokens].sort();
  return {
    normalizedValue: sortedTokens.join(' ').trim(),
    tokenSet: Array.from(new Set(normalizedTokens)),
    years,
  };
}

function inferObjectType(header: string, schema: ResolvedSchema | null, fileClass: string): TaxonomyObjectType | null {
  const normalizedHeader = toHeaderKey(header);
  const fieldMap = (schema?.fieldMap ?? {}) as Record<string, string>;
  if (fieldMap.fund === header) return 'Fund';
  if (fieldMap.appeal === header) return 'Appeal';
  if (fieldMap.campaign_name === header) return 'Campaign';

  for (const hint of LABEL_HINT_PATTERNS) {
    if (hint.objectType && hint.pattern.test(normalizedHeader)) return hint.objectType;
  }

  if (fileClass === 'donor' && normalizedHeader.includes('designation')) return 'Fund';
  if (fileClass === 'donor' && /source code|initiative|allocation/.test(normalizedHeader)) return 'Appeal';
  return null;
}

function isDeniedHeader(header: string) {
  return DENYLIST_PATTERNS.some((pattern) => pattern.test(toHeaderKey(header)));
}
function isDigits(value: string) {
  return value.length > 0 && value.split('').every((char) => char >= '0' && char <= '9');
}

function isDateLikeValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const isoParts = trimmed.split(' ')[0].split('-');
  if (isoParts.length === 3 && isoParts[0].length === 4 && isoParts[1].length === 2 && isoParts[2].length === 2 && isoParts.every(isDigits)) return true;
  const slashParts = trimmed.split('/');
  if (slashParts.length === 3 && slashParts.every(isDigits)) return true;
  const commaParts = trimmed.split(',');
  if (commaParts.length === 2) {
    const left = commaParts[0].trim().split(' ').filter(Boolean);
    const right = commaParts[1].trim();
    if (left.length === 2 && left[0].split('').every((char) => /[A-Za-z]/.test(char)) && isDigits(left[1]) && right.length === 4 && isDigits(right)) return true;
  }
  return false;
}

function isNumericLikeValue(value: string) {
  const compact = value.split('').filter((char) => !'$,()% '.includes(char)).join('');
  return compact !== '' && !Number.isNaN(Number(compact));
}

function isLikelyPersonNameValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.split('').some((char) => char >= '0' && char <= '9')) return false;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 3) return false;
  return tokens.every((token) => /^[A-Za-z][A-Za-z'.-]{0,24}$/.test(token)) && tokens.some((token) => token.length > 1);
}
function isEmailLikeValue(value: string) {
  const trimmed = value.trim();
  return trimmed.includes("@") && trimmed.includes(".") && !trimmed.includes(" ");
}

function isPhoneLikeValue(value: string) {
  const digits = value.split('').filter((char) => char >= '0' && char <= '9').join('');
  return digits.length >= 10 && digits.length <= 15;
}

function isAddressLikeValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const hasStreetWord = /\b(street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|way|boulevard|blvd|suite|ste|apt|apartment)\b/i.test(trimmed);
  const hasLeadingNumber = /^\d+[A-Za-z0-9\-/#]*\s+/.test(trimmed);
  return hasStreetWord || hasLeadingNumber;
}


function valueRatio(values: string[], predicate: (value: string) => boolean) {
  return values.length > 0 ? values.filter(predicate).length / values.length : 0;
}


function scoreTaxonomyHeader(header: string, values: string[], objectType: TaxonomyObjectType | null, schemaHeader: boolean) {
  let score = schemaHeader ? 1 : 0;
  const reasons: string[] = [];
  const normalizedHeader = toHeaderKey(header);
  if (schemaHeader) reasons.push('Mapped by schema');
  if (objectType) reasons.push(`Header suggests ${objectType}`);

  LABEL_HINT_PATTERNS.forEach((hint) => {
    if (hint.pattern.test(normalizedHeader)) {
      score += hint.score;
      reasons.push(hint.reason);
    }
  });

  const uniqueCount = new Set(values).size;
  const repeatRatio = values.length > 0 ? 1 - uniqueCount / values.length : 0;
  if (repeatRatio >= 0.08) {
    score += 0.14;
    reasons.push('Values repeat across rows');
  }

  const shortPhraseRatio = values.length > 0
    ? values.filter((value) => value.length <= 44 && value.split(/\s+/).length <= 6).length / values.length
    : 0;
  if (shortPhraseRatio >= 0.72) {
    score += 0.1;
    reasons.push('Values look like short labels');
  }

  const taxonomyValueRatio = values.length > 0
    ? values.filter((value) => /(20\d{2}|\b\d{2}\b|spring|summer|fall|autumn|winter|annual|gala|appeal|fund|match|giving|scholarship)/i.test(value)).length / values.length
    : 0;
  if (taxonomyValueRatio >= 0.2) {
    score += 0.16;
    reasons.push('Values look like taxonomy labels');
  }

  return { score: Math.min(score, 1), reasons: Array.from(new Set(reasons)) };
}

export function deriveTaxonomyScanColumns(parsedFile: ParsedFile | null, schema: ResolvedSchema | null): TaxonomyScanColumn[] {
  const fieldMap = (schema?.fieldMap ?? {}) as Record<string, string>;
  const taxonomyHeaders = new Set(
    Array.from(TAXONOMY_SCHEMA_FIELD_KEYS)
      .map((fieldKey) => fieldMap[fieldKey])
      .filter((header): header is string => Boolean(header)),
  );
  if (!parsedFile?.headers?.length) return [];
  return parsedFile.headers
    .map((header) => {
      const objectType = inferObjectType(header, schema, schema?.fileClass ?? 'unknown');
      const schemaHeader = taxonomyHeaders.has(header);
      const values = safeValues(parsedFile, header).slice(0, 40);
      const { score, reasons } = scoreTaxonomyHeader(header, values, objectType, schemaHeader);
      const dateLikeRatio = valueRatio(values, isDateLikeValue);
      const numericLikeRatio = valueRatio(values, isNumericLikeValue);
      const emailLikeRatio = valueRatio(values, isEmailLikeValue);
      const phoneLikeRatio = valueRatio(values, isPhoneLikeValue);
      const addressLikeRatio = valueRatio(values, isAddressLikeValue);
      const personNameRatio = valueRatio(values, isLikelyPersonNameValue);
      const denyReasons: string[] = [];
      if (!schemaHeader && isDeniedHeader(header)) denyReasons.push('Excluded by denylist');
      if (emailLikeRatio >= 0.8) denyReasons.push('Mostly email values');
      if (phoneLikeRatio >= 0.8) denyReasons.push('Mostly phone values');
      if (addressLikeRatio >= 0.8) denyReasons.push('Mostly address values');
      if (dateLikeRatio >= 0.8) denyReasons.push('Mostly date values');
      if (numericLikeRatio >= 0.8) denyReasons.push('Mostly numeric values');
      if (personNameRatio >= 0.8) denyReasons.push('Mostly person-name values');
      const denied = denyReasons.length > 0;
      const included = !denied && (
        schemaHeader ||
        (objectType !== null && score >= 0.58) ||
        score >= 0.78
      );
      return {
        header,
        objectType: objectType ?? 'Campaign',
        score,
        included,
        reasonSignals: denied ? denyReasons : reasons,
        sampleValues: Array.from(new Set(values)).slice(0, 5),
        source: schemaHeader ? 'schema' : 'scored',
      } as TaxonomyScanColumn;
    })
    .filter((column) => column.included)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_TAXONOMY_SCAN_COLUMNS);
}

export function extractObservedTaxonomyValues(parsedFile: ParsedFile | null, scanColumns: TaxonomyScanColumn[]): TaxonomyObservedValue[] {
  if (!parsedFile?.preview?.records?.length || scanColumns.length === 0) return [];
  const records = parsedFile.preview.records as PreviewRecord[];
  const observed = new Map<string, TaxonomyObservedValue>();
  records.forEach((record) => {
    const rawValues = (record.rawValues ?? record.values ?? {}) as Record<string, string>;
    scanColumns.forEach((column) => {
      const rawValue = String(rawValues[column.header] ?? '').trim();
      if (!rawValue) return;
      if (isDateLikeValue(rawValue) || isNumericLikeValue(rawValue)) return;
      const normalized = normalizeTaxonomyValue(rawValue);
      const key = [column.objectType, column.header, rawValue.toLowerCase()].join('::');
      const current = observed.get(key);
      const sourceFile = String(record.sourceFile ?? record.source_file ?? record.sourceRowRef ?? parsedFile.fileName);
      if (current) {
        current.rowCount += 1;
        if (!current.sourceFiles.includes(sourceFile)) current.sourceFiles.push(sourceFile);
        if (!current.sourceRowRefs.includes(String(record.sourceRowRef ?? ''))) current.sourceRowRefs.push(String(record.sourceRowRef ?? ''));
        normalized.years.forEach((year) => {
          if (!current.years.includes(year)) current.years.push(year);
        });
        return;
      }
      observed.set(key, {
        id: `obs-${column.objectType}-${observed.size + 1}`,
        objectType: column.objectType,
        header: column.header,
        rawValue,
        normalizedValue: normalized.normalizedValue,
        sourceField: column.header,
        sourceFiles: [sourceFile],
        sourceRowRefs: [String(record.sourceRowRef ?? '')].filter(Boolean),
        rowCount: 1,
        years: normalized.years,
        tokenSet: normalized.tokenSet,
      });
    });
  });
  const groupedByColumn = new Map<string, TaxonomyObservedValue[]>();
  Array.from(observed.values()).forEach((value) => {
    const key = `${value.objectType}::${value.header}`;
    const current = groupedByColumn.get(key) ?? [];
    current.push(value);
    groupedByColumn.set(key, current);
  });
  return Array.from(groupedByColumn.values())
    .flatMap((values) =>
      values
        .sort((left, right) => (right.rowCount - left.rowCount) || (left.rawValue.length - right.rawValue.length))
        .slice(0, MAX_OBSERVED_VALUES_PER_COLUMN),
    );
}

function jaccard(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = left.filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function trigramSet(value: string) {
  const padded = `  ${value}  `;
  const set = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) set.add(padded.slice(index, index + 3));
  return Array.from(set);
}

function trigramSimilarity(left: string, right: string) {
  const leftSet = trigramSet(left);
  const rightSet = trigramSet(right);
  return jaccard(leftSet, rightSet);
}

function compareObservedValues(left: TaxonomyObservedValue, right: TaxonomyObservedValue) {
  if (left.objectType !== right.objectType) return { score: 0, reasons: [] as string[] };
  const reasons: string[] = [];
  const tokenScore = jaccard(left.tokenSet, right.tokenSet);
  const trigramScore = trigramSimilarity(left.normalizedValue, right.normalizedValue);
  const editDistance = levenshtein(left.normalizedValue, right.normalizedValue);
  const maxLength = Math.max(left.normalizedValue.length, right.normalizedValue.length, 1);
  const editScore = 1 - editDistance / maxLength;
  const yearOverlap = left.years.some((year) => right.years.includes(year));
  const sortedExact = left.normalizedValue && left.normalizedValue === right.normalizedValue;
  const contextOverlap = left.sourceFiles.some((file) => right.sourceFiles.includes(file));

  let score = tokenScore * 0.34 + trigramScore * 0.24 + editScore * 0.18;
  if (sortedExact) {
    score += 0.2;
    reasons.push('Same normalized label');
  }
  if (yearOverlap) {
    score += 0.08;
    reasons.push('Same year');
  }
  if (contextOverlap) {
    score += 0.08;
    reasons.push('Shared source context');
  }
  if (left.header === right.header) {
    score += 0.08;
    reasons.push('Same source field');
  }
  if (tokenScore >= 0.5) reasons.push('Token overlap');
  if (trigramScore >= 0.55) reasons.push('Trigram similarity');
  if (editScore >= 0.7) reasons.push('Edit distance');

  return { score: Math.min(score, 1), reasons: Array.from(new Set(reasons)) };
}


function isNonTaxonomyGroup(values: TaxonomyObservedValue[]) {
  return values.every((value) => isDateLikeValue(value.rawValue) || isNumericLikeValue(value.rawValue));
}

function suggestCanonicalLabel(values: TaxonomyObservedValue[]) {
  return values
    .slice()
    .sort((left, right) => (right.rowCount - left.rowCount) || (right.rawValue.length - left.rawValue.length))[0]?.rawValue ?? values[0]?.rawValue ?? 'Untitled taxonomy';
}

function isExactDuplicateLabelGroup(values: TaxonomyObservedValue[]) {
  if (values.length < 2) return false;
  const rawLabels = new Set(values.map((value) => value.rawValue.trim().toLowerCase()));
  const normalizedLabels = new Set(values.map((value) => value.normalizedValue));
  return rawLabels.size === 1 && normalizedLabels.size === 1;
}

function averagePairScore(values: TaxonomyObservedValue[], pairReasons: Map<string, { score: number; reasons: string[] }>) {
  const scores: number[] = [];
  const reasons = new Set<string>();
  for (let leftIndex = 0; leftIndex < values.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
      const left = values[leftIndex];
      const right = values[rightIndex];
      const result = pairReasons.get(`${left.id}::${right.id}`) ?? pairReasons.get(`${right.id}::${left.id}`) ?? compareObservedValues(left, right);
      scores.push(result.score);
      result.reasons.forEach((reason) => reasons.add(reason));
    }
  }
  return {
    score: scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0,
    reasons: Array.from(reasons),
  };
}

function observedValueSignature(observedValueIds: string[]) {
  return [...observedValueIds].sort().join('::');
}

function getPairResult(
  pairReasons: Map<string, { score: number; reasons: string[] }>,
  leftId: string,
  rightId: string,
) {
  return pairReasons.get(`${leftId}::${rightId}`) ?? pairReasons.get(`${rightId}::${leftId}`) ?? { score: 0, reasons: [] as string[] };
}

function canAddToGroup(
  groupIds: string[],
  candidateId: string,
  pairReasons: Map<string, { score: number; reasons: string[] }>,
) {
  if (groupIds.length >= MAX_CANDIDATE_GROUP_SIZE) return false;
  const scores = groupIds.map((groupId) => getPairResult(pairReasons, groupId, candidateId).score);
  if (scores.some((score) => score < MIN_PAIR_SCORE)) return false;
  const average = scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1);
  return average >= MIN_GROUP_AVERAGE_SCORE;
}

function buildCandidateGroups(
  values: TaxonomyObservedValue[],
  pairReasons: Map<string, { score: number; reasons: string[] }>,
) {
  const edges = Array.from(pairReasons.entries())
    .map(([key, result]) => {
      const [leftId, rightId] = key.split('::');
      return { leftId, rightId, score: result.score };
    })
    .sort((left, right) => right.score - left.score);
  const groups: string[][] = [];
  const groupIndexById = new Map<string, number>();

  edges.forEach(({ leftId, rightId }) => {
    const leftIndex = groupIndexById.get(leftId);
    const rightIndex = groupIndexById.get(rightId);
    if (leftIndex == null && rightIndex == null) {
      groups.push([leftId, rightId]);
      const nextIndex = groups.length - 1;
      groupIndexById.set(leftId, nextIndex);
      groupIndexById.set(rightId, nextIndex);
      return;
    }
    if (leftIndex != null && rightIndex == null) {
      const groupIds = groups[leftIndex];
      if (!groupIds.includes(rightId) && canAddToGroup(groupIds, rightId, pairReasons)) {
        groupIds.push(rightId);
        groupIndexById.set(rightId, leftIndex);
      }
      return;
    }
    if (leftIndex == null && rightIndex != null) {
      const groupIds = groups[rightIndex];
      if (!groupIds.includes(leftId) && canAddToGroup(groupIds, leftId, pairReasons)) {
        groupIds.push(leftId);
        groupIndexById.set(leftId, rightIndex);
      }
      return;
    }
    if (leftIndex === rightIndex || leftIndex == null || rightIndex == null) return;
    const leftGroup = groups[leftIndex];
    const rightGroup = groups[rightIndex];
    if (leftGroup.length + rightGroup.length > MAX_CANDIDATE_GROUP_SIZE) return;
    const canMerge = leftGroup.every((leftGroupId) =>
      rightGroup.every((rightGroupId) => getPairResult(pairReasons, leftGroupId, rightGroupId).score >= MIN_PAIR_SCORE),
    );
    if (!canMerge) return;
    const mergedGroup = [...leftGroup, ...rightGroup];
    const summary = averagePairScore(
      mergedGroup.map((id) => values.find((value) => value.id === id)).filter((value): value is TaxonomyObservedValue => Boolean(value)),
      pairReasons,
    );
    if (summary.score < MIN_GROUP_AVERAGE_SCORE) return;
    groups[leftIndex] = mergedGroup;
    groups[rightIndex] = [];
    mergedGroup.forEach((id) => groupIndexById.set(id, leftIndex));
  });

  return groups.filter((group) => group.length >= 2);
}

export function buildTaxonomyState(parsedFile: ParsedFile | null, schema: ResolvedSchema | null, previousState?: SessionTaxonomyState | null): SessionTaxonomyState {
  const scanColumns = deriveTaxonomyScanColumns(parsedFile, schema);
  const observedValues = extractObservedTaxonomyValues(parsedFile, scanColumns);
  const previousResolvedGroups = previousState?.resolvedGroups ?? [];
  const previousDismissed = previousState?.dismissedCandidateIds ?? [];
  const previousCandidateBySignature = new Map(
    (previousState?.candidateGroups ?? []).map((group) => [
      observedValueSignature(group.members.map((member) => member.observedValueId)),
      group,
    ]),
  );
  const nextResolvedGroups = previousResolvedGroups.filter((group) =>
    group.sourceObservedValueIds.every((id) => observedValues.some((observed) => observed.id === id)),
  );
  const resolvedBySignature = new Map(
    nextResolvedGroups.map((group) => [
      observedValueSignature(group.sourceObservedValueIds),
      group,
    ]),
  );
  const resolvedSignatureSet = new Set(
    nextResolvedGroups.map((group) => observedValueSignature(group.sourceObservedValueIds)),
  );
  const dismissedSignatureSet = new Set(
    (previousState?.candidateGroups ?? [])
      .filter((group) => previousDismissed.includes(group.id))
      .map((group) => observedValueSignature(group.members.map((member) => member.observedValueId))),
  );
  const byType = new Map<TaxonomyObjectType, TaxonomyObservedValue[]>();
  observedValues.forEach((value) => {
    const current = byType.get(value.objectType) ?? [];
    current.push(value);
    byType.set(value.objectType, current);
  });
  const candidateGroups: TaxonomyCandidateGroup[] = [];
  byType.forEach((values, objectType) => {
    const pairReasons = new Map<string, { score: number; reasons: string[] }>();
    for (let leftIndex = 0; leftIndex < values.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
        const left = values[leftIndex];
        const right = values[rightIndex];
        const result = compareObservedValues(left, right);
        if (result.score >= MIN_PAIR_SCORE) {
          pairReasons.set(`${left.id}::${right.id}`, result);
        }
      }
    }
    const valueById = new Map(values.map((value) => [value.id, value]));
    buildCandidateGroups(values, pairReasons)
      .map((cliqueIds) => {
        const groupValues = cliqueIds
          .map((id) => valueById.get(id))
          .filter((value): value is TaxonomyObservedValue => Boolean(value));
        const summary = averagePairScore(groupValues, pairReasons);
        return { groupValues, summary };
      })
      .filter(({ groupValues }) => groupValues.length >= 2)
      .filter(({ groupValues }) => !isNonTaxonomyGroup(groupValues))
      .sort((left, right) =>
        (right.groupValues.length - left.groupValues.length) ||
        (right.summary.score - left.summary.score),
      )
      .forEach(({ groupValues, summary }, groupIndex) => {
        const averageScore = summary.score;
        const reasons = summary.reasons;
        const memberIds = groupValues.map((value) => value.id);
        const signature = observedValueSignature(memberIds);
        const previousCandidate = previousCandidateBySignature.get(signature);
        const status = resolvedSignatureSet.has(signature)
          ? 'merged'
          : dismissedSignatureSet.has(signature)
            ? 'separate'
            : previousCandidate?.status === 'merged' || previousCandidate?.status === 'separate'
              ? previousCandidate.status
              : 'pending';

        if (!resolvedSignatureSet.has(signature) && isExactDuplicateLabelGroup(groupValues)) {
          const previousResolved = resolvedBySignature.get(signature);
          const nextGroup: SessionTaxonomyGroup = previousResolved ?? {
            id: `resolved-auto-${signature}`,
            objectType,
            canonicalLabel: suggestCanonicalLabel(groupValues),
            aliases: Array.from(new Set(groupValues.map((value) => value.rawValue))),
            sourceObservedValueIds: memberIds,
            status: 'active',
            createdAt: new Date().toISOString(),
          };
          resolvedBySignature.set(signature, nextGroup);
          resolvedSignatureSet.add(signature);
          nextResolvedGroups.push(nextGroup);
          return;
        }

        candidateGroups.push({
          id: previousCandidate?.id ?? `cand-${objectType}-${groupIndex + 1}`,
          objectType,
          confidenceBand: averageScore >= 0.85 ? 'high' : 'medium',
          score: Number(averageScore.toFixed(2)),
          reasonSignals: reasons,
          suggestedCanonicalLabel: titleCase(suggestCanonicalLabel(groupValues)),
          members: groupValues.map((value) => ({
            observedValueId: value.id,
            rawValue: value.rawValue,
            header: value.header,
            rowCount: value.rowCount,
            sourceFiles: value.sourceFiles,
            sourceRowRefs: value.sourceRowRefs,
          })),
          status,
        });
      });
  });
  const nextDismissedCandidateIds = candidateGroups
    .filter((group) => group.status === 'separate')
    .map((group) => group.id);

  return {
    scanColumns,
    observedValues,
    candidateGroups,
    resolvedGroups: nextResolvedGroups,
    dismissedCandidateIds: nextDismissedCandidateIds,
  };
}

export function mergeTaxonomyCandidate(state: SessionTaxonomyState, candidateId: string, canonicalLabel?: string) {
  const candidate = state.candidateGroups.find((group) => group.id === candidateId);
  if (!candidate) return state;
  const nextGroup: SessionTaxonomyGroup = {
    id: `resolved-${candidate.id}`,
    objectType: candidate.objectType,
    canonicalLabel: canonicalLabel?.trim() || candidate.suggestedCanonicalLabel,
    aliases: candidate.members.map((member) => member.rawValue),
    sourceObservedValueIds: candidate.members.map((member) => member.observedValueId),
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  return {
    ...state,
    candidateGroups: state.candidateGroups.map((group) => group.id === candidateId ? { ...group, status: 'merged' as const } : group),
    resolvedGroups: [...state.resolvedGroups.filter((group) => group.id !== nextGroup.id), nextGroup],
    dismissedCandidateIds: state.dismissedCandidateIds.filter((id) => id !== candidateId),
  };
}

export function dismissTaxonomyCandidate(state: SessionTaxonomyState, candidateId: string) {
  return {
    ...state,
    candidateGroups: state.candidateGroups.map((group) => group.id === candidateId ? { ...group, status: 'separate' as const } : group),
    dismissedCandidateIds: Array.from(new Set([...state.dismissedCandidateIds, candidateId])),
  };
}

export function updateTaxonomyScanColumn(state: SessionTaxonomyState, header: string, included: boolean): SessionTaxonomyState {
  const scanColumns = state.scanColumns.map((column) => column.header === header ? { ...column, included, source: 'manual' as const } : column);
  return { ...state, scanColumns };
}

export function renameResolvedTaxonomyGroup(state: SessionTaxonomyState, groupId: string, canonicalLabel: string): SessionTaxonomyState {
  const nextLabel = canonicalLabel.trim();
  if (!nextLabel) return state;
  return {
    ...state,
    resolvedGroups: state.resolvedGroups.map((group) => (
      group.id === groupId
        ? { ...group, canonicalLabel: nextLabel }
        : group
    )),
  };
}

export function applyTaxonomyGroupsToPreviewRecords(
  records: PreviewRecord[],
  state: SessionTaxonomyState | null | undefined,
  schema: ResolvedSchema | null,
) {
  if (!state || state.resolvedGroups.length === 0) return records;
  const observedById = new Map(state.observedValues.map((value) => [value.id, value]));
  const replacementByHeader = new Map<string, Map<string, string>>();
  state.resolvedGroups.forEach((group) => {
    group.sourceObservedValueIds.forEach((observedId) => {
      const observed = observedById.get(observedId);
      if (!observed) return;
      const byValue = replacementByHeader.get(observed.header) ?? new Map<string, string>();
      byValue.set(observed.rawValue, group.canonicalLabel);
      replacementByHeader.set(observed.header, byValue);
    });
  });
  const fieldMap = (schema?.fieldMap ?? {}) as Record<string, string>;
  return records.map((record) => {
    const rawValues = { ...(record.rawValues ?? record.values ?? {}) };
    let changed = false;
    replacementByHeader.forEach((byValue, header) => {
      const currentValue = String(rawValues[header] ?? '').trim();
      if (!currentValue || !byValue.has(currentValue)) return;
      rawValues[header] = byValue.get(currentValue) ?? currentValue;
      changed = true;
    });
    if (!changed) return record;
    const nextRecord: PreviewRecord = { ...record, rawValues };
    if (fieldMap.fund && rawValues[fieldMap.fund] !== undefined) nextRecord.fund = rawValues[fieldMap.fund];
    if (fieldMap.appeal && rawValues[fieldMap.appeal] !== undefined) nextRecord.appeal = rawValues[fieldMap.appeal];
    if (fieldMap.campaign_name && rawValues[fieldMap.campaign_name] !== undefined) nextRecord.campaignName = rawValues[fieldMap.campaign_name];
    if (nextRecord.donorName) nextRecord.donorName = nextRecord.organizationName || [nextRecord.firstName, nextRecord.lastName].filter(Boolean).join(' ') || nextRecord.donorName;
    return nextRecord;
  });
}

export function summarizeTaxonomyState(state: SessionTaxonomyState | null | undefined) {
  if (!state) return { high: 0, medium: 0, resolved: 0, open: 0 };
  const openGroups = state.candidateGroups.filter((group) => group.status === 'pending' && !state.dismissedCandidateIds.includes(group.id));
  return {
    high: openGroups.filter((group) => group.confidenceBand === 'high').length,
    medium: openGroups.filter((group) => group.confidenceBand === 'medium').length,
    resolved: state.resolvedGroups.length,
    open: openGroups.length,
  };
}
