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

function isTxAnchoredRecord(record: PreviewRecord): boolean {
  const sourceFileClass = record.sourceFileClass ?? record.source_file_class ?? null;
  return sourceFileClass === 'donor' || sourceFileClass === 'ledger' || Boolean((record as Record<string, unknown>).link_profile_only);
}

export function buildPreviewMergeView(
  previewRecords: PreviewRecord[],
  confirmedTxDuplicateMatches: PersonMatch[],
  txSwapDecisions: Map<string, boolean>,
  hasTransactionLinkFlow: boolean,
  autoMergedPreviewPairs: AutoMergedPreviewPair[] = [],
): PreviewMergeView {
  const txAnchoredPreviewRecords = hasTransactionLinkFlow
    ? previewRecords.filter(isTxAnchoredRecord)
    : previewRecords;

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
    displayedPreviewRecords: txAnchoredPreviewRecords.filter((record) => !representativeByAbsorbedRef.has(record.sourceRowRef)),
  };
}
