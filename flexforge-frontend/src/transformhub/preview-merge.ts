import type { PersonMatch, PreviewRecord } from './types';

type PreviewMergeView = {
  representativeByAbsorbedRef: Map<string, string>;
  mergedSourceRefsByRepresentative: Map<string, string[]>;
  displayedPreviewRecords: PreviewRecord[];
};

type AutoMergedPreviewPair = {
  representativeRef: string;
  absorbedRef: string;
};

const ABSORB_IGNORED_KEYS = new Set([
  'id',
  'sourcerowref',
  'sourcefile',
  'source_file',
  'sourcefileclass',
  'source_file_class',
  'preview',
  'displayname',
  'donorname',
  'fullname',
  'full_name',
  'entityname',
  'entity_name',
  'firstname',
  'first_name',
  'lastname',
  'last_name',
  'organizationname',
  'organization_name',
  'preferredname',
  'preferred_name',
]);

const PREVIEW_FILL_FIELDS = [
  'donorName',
  'displayName',
  'firstName',
  'lastName',
  'organizationName',
  'householdName',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'postalCode',
  'country',
  'date',
  'amount',
  'fund',
  'campaignName',
  'appeal',
  'memo',
  'currency',
  'preferredName',
  'alternateEmail',
  'municipality',
  'region',
  'status',
  'lifetimeGiving',
  'lastGiftDate',
  'preferredFund',
  'appealCode',
  'campaignname__incoming',
  'date__incoming',
] as const;

function getCompactSourceRef(sourceRef: string | null | undefined): string {
  if (!sourceRef) return '';
  const parts = sourceRef.split(':').filter(Boolean);
  return parts[parts.length - 1] || sourceRef;
}

function getSourceRefAliases(sourceRef: string | null | undefined): string[] {
  if (!sourceRef) return [];
  const parts = sourceRef.split(':').filter(Boolean);
  if (parts.length === 0) return [sourceRef];
  const aliases = new Set<string>([sourceRef]);
  for (let index = 0; index < parts.length; index += 1) {
    aliases.add(parts.slice(index).join(':'));
    aliases.add(parts.slice(index).join('::'));
  }
  return Array.from(aliases);
}

function normalizeCompareValue(key: string, value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '—') return '';
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (normalizedKey.includes('email')) {
    const lower = raw.toLowerCase();
    if (!lower.includes('@')) return lower;
    const [local, domain] = lower.split('@');
    return `${local.split('+')[0]}@${domain}`;
  }
  if (normalizedKey.includes('phone')) {
    return raw.replace(/\D/g, '').slice(-10);
  }
  if (normalizedKey.includes('date')) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw.toLowerCase() : parsed.toISOString().slice(0, 10);
  }
  if (
    normalizedKey.includes('amount')
    || normalizedKey.includes('fee')
    || normalizedKey.includes('net')
    || normalizedKey.includes('debit')
    || normalizedKey.includes('credit')
    || normalizedKey.includes('lifetimegiving')
  ) {
    const numeric = raw.replace(/[^0-9.-]+/g, '');
    return numeric || raw.toLowerCase();
  }
  const tokens = raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/ +/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      switch (token) {
        case 'st': return 'street';
        case 'rd': return 'road';
        case 'ave': return 'avenue';
        case 'blvd': return 'boulevard';
        case 'dr': return 'drive';
        case 'ln': return 'lane';
        case 'ct': return 'court';
        case 'cir': return 'circle';
        case 'pkwy': return 'parkway';
        case 'hwy': return 'highway';
        case 'apt': return 'apartment';
        default: return token;
      }
    });
  return tokens.join('');
}

function collectComparableValues(record: PreviewRecord): Map<string, string> {
  const values = new Map<string, string>();
  const addEntry = (key: string, value: unknown) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!normalizedKey || ABSORB_IGNORED_KEYS.has(normalizedKey)) return;
    const normalizedValue = normalizeCompareValue(normalizedKey, value);
    if (!normalizedValue) return;
    if (!values.has(normalizedKey)) values.set(normalizedKey, normalizedValue);
  };

  Object.entries(record.values ?? {}).forEach(([key, value]) => addEntry(key, value));
  Object.entries(record.rawValues ?? {}).forEach(([key, value]) => addEntry(key, value));
  PREVIEW_FILL_FIELDS.forEach((key) => addEntry(key, (record as Record<string, unknown>)[key]));
  return values;
}

function isSafeAbsorbPair(absorbed: PreviewRecord, representative: PreviewRecord): boolean {
  const absorbedValues = collectComparableValues(absorbed);
  const representativeValues = collectComparableValues(representative);

  for (const [key, absorbedValue] of absorbedValues.entries()) {
    const representativeValue = representativeValues.get(key) ?? '';
    if (!representativeValue || representativeValue === absorbedValue) continue;
    return false;
  }

  return absorbedValues.size > 0;
}

function mergeRepresentativeRecord(representative: PreviewRecord, absorbedRecords: PreviewRecord[]): PreviewRecord {
  if (absorbedRecords.length === 0) return representative;

  const mergedRawValues = { ...(representative.rawValues ?? {}) };
  const mergedValues = { ...(representative.values ?? {}) };
  const mergedRecord = { ...representative } as PreviewRecord & Record<string, unknown>;

  absorbedRecords.forEach((absorbed) => {
    Object.entries(absorbed.rawValues ?? {}).forEach(([key, value]) => {
      if (!String(mergedRawValues[key] ?? '').trim() && String(value ?? '').trim()) mergedRawValues[key] = String(value);
    });
    Object.entries(absorbed.values ?? {}).forEach(([key, value]) => {
      if (!String(mergedValues[key] ?? '').trim() && String(value ?? '').trim()) mergedValues[key] = String(value);
    });
    PREVIEW_FILL_FIELDS.forEach((key) => {
      if (!String(mergedRecord[key] ?? '').trim()) {
        const value = (absorbed as Record<string, unknown>)[key];
        if (String(value ?? '').trim()) mergedRecord[key] = value;
      }
    });
  });

  mergedRecord.rawValues = mergedRawValues;
  mergedRecord.values = mergedValues;
  return mergedRecord as PreviewRecord;
}

export function buildConfirmedSafeAbsorbPairs(
  previewRecords: PreviewRecord[],
  confirmedMatches: PersonMatch[],
  swapDecisions: Map<string, boolean> = new Map(),
): AutoMergedPreviewPair[] {
  const previewRefMap = new Map<string, PreviewRecord>();
  const previewAliasMap = new Map<string, PreviewRecord>();

  previewRecords.forEach((record) => {
    previewRefMap.set(record.sourceRowRef, record);
    getSourceRefAliases(record.sourceRowRef).forEach((alias) => {
      if (!previewAliasMap.has(alias)) previewAliasMap.set(alias, record);
    });
    const compactRef = getCompactSourceRef(record.sourceRowRef);
    if (!previewAliasMap.has(compactRef)) previewAliasMap.set(compactRef, record);
  });

  const resolveRecord = (sourceRowRef: string | null | undefined): PreviewRecord | null => {
    if (!sourceRowRef) return null;
    return previewAliasMap.get(sourceRowRef) ?? previewAliasMap.get(getCompactSourceRef(sourceRowRef)) ?? null;
  };

  const pairs = new Map<string, AutoMergedPreviewPair>();
  confirmedMatches.forEach((match) => {
    const matchedInputRef = match.reviewPayload?.matchedInputRef ?? null;
    if (!matchedInputRef || matchedInputRef === match.inputRef) return;
    const inputRecord = resolveRecord(match.inputRef);
    const matchedRecord = resolveRecord(matchedInputRef);
    if (!inputRecord || !matchedRecord || inputRecord.sourceRowRef === matchedRecord.sourceRowRef) return;

    const isSwapped = swapDecisions.get(match.inputRef) === true;
    const absorbedRecord = isSwapped ? matchedRecord : inputRecord;
    const representativeRecord = isSwapped ? inputRecord : matchedRecord;
    if (!isSafeAbsorbPair(absorbedRecord, representativeRecord)) return;

    const pairKey = `${representativeRecord.sourceRowRef}::${absorbedRecord.sourceRowRef}`;
    pairs.set(pairKey, {
      representativeRef: representativeRecord.sourceRowRef,
      absorbedRef: absorbedRecord.sourceRowRef,
    });
  });

  return Array.from(pairs.values());
}

export function buildPreviewMergeView(
  previewRecords: PreviewRecord[],
  confirmedTxDuplicateMatches: PersonMatch[],
  txSwapDecisions: Map<string, boolean>,
  hasTransactionLinkFlow: boolean,
  autoMergedPreviewPairs: AutoMergedPreviewPair[] = [],
): PreviewMergeView {
  const previewRefMap = new Map<string, string>();
  previewRecords.forEach((record) => {
    getSourceRefAliases(record.sourceRowRef).forEach((alias) => {
      if (!previewRefMap.has(alias)) previewRefMap.set(alias, record.sourceRowRef);
    });
    const compactRef = getCompactSourceRef(record.sourceRowRef);
    if (!previewRefMap.has(compactRef)) previewRefMap.set(compactRef, record.sourceRowRef);
  });

  const normalizePreviewRef = (sourceRowRef: string | null | undefined): string | null => {
    if (!sourceRowRef) return null;
    return previewRefMap.get(sourceRowRef) ?? previewRefMap.get(getCompactSourceRef(sourceRowRef)) ?? null;
  };

  const representativeByAbsorbedRef = new Map<string, string>();
  const mergedSourceRefsByRepresentative = new Map<string, string[]>();
  const resolveRepresentativeRef = (sourceRowRef: string): string => {
    let current = sourceRowRef;
    const visited = new Set<string>();
    while (representativeByAbsorbedRef.has(current) && !visited.has(current)) {
      visited.add(current);
      current = representativeByAbsorbedRef.get(current) ?? current;
    }
    return current;
  };

  confirmedTxDuplicateMatches.forEach((match) => {
    const normalizedIncomingRef = normalizePreviewRef(match.inputRef);
    const normalizedMatchedRef = normalizePreviewRef(match.reviewPayload?.matchedInputRef ?? null);
    if (!normalizedIncomingRef || !normalizedMatchedRef || normalizedIncomingRef === normalizedMatchedRef) return;

    const isSwapped = txSwapDecisions.get(match.inputRef) === true;
    const absorbedRef = isSwapped ? normalizedMatchedRef : normalizedIncomingRef;
    const representativeRef = isSwapped ? normalizedIncomingRef : normalizedMatchedRef;
    representativeByAbsorbedRef.set(absorbedRef, resolveRepresentativeRef(representativeRef));
  });

  autoMergedPreviewPairs.forEach((pair) => {
    const normalizedRepresentativeRef = normalizePreviewRef(pair.representativeRef);
    const normalizedAbsorbedRef = normalizePreviewRef(pair.absorbedRef);
    if (!normalizedRepresentativeRef || !normalizedAbsorbedRef || normalizedRepresentativeRef === normalizedAbsorbedRef) return;
    representativeByAbsorbedRef.set(normalizedAbsorbedRef, resolveRepresentativeRef(normalizedRepresentativeRef));
  });

  Array.from(representativeByAbsorbedRef.entries()).forEach(([absorbedRef, representativeRef]) => {
    const finalRepresentativeRef = resolveRepresentativeRef(representativeRef);
    if (finalRepresentativeRef !== representativeRef) {
      representativeByAbsorbedRef.set(absorbedRef, finalRepresentativeRef);
    }
    const current = mergedSourceRefsByRepresentative.get(finalRepresentativeRef) ?? [];
    if (!current.includes(absorbedRef)) current.push(absorbedRef);
    mergedSourceRefsByRepresentative.set(finalRepresentativeRef, current);
  });

  return {
    representativeByAbsorbedRef,
    mergedSourceRefsByRepresentative,
    displayedPreviewRecords: previewRecords
      .filter((record) => !representativeByAbsorbedRef.has(record.sourceRowRef))
      .map((record) => {
        const absorbedRefs = mergedSourceRefsByRepresentative.get(record.sourceRowRef) ?? [];
        const absorbedRecords = absorbedRefs
          .map((sourceRowRef) => previewRecords.find((candidate) => candidate.sourceRowRef === sourceRowRef) ?? null)
          .filter((candidate): candidate is PreviewRecord => Boolean(candidate));
        return mergeRepresentativeRecord(record, absorbedRecords);
      }),
  };
}
