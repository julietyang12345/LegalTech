import { startTransition, type ChangeEvent, useCallback, useEffect, useMemo, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleHelp,
  Database,
  Filter,
  FileSpreadsheet,
  FolderTree,
  GripVertical,
  RefreshCcw,
  Save,
  ShieldAlert,
  Upload,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import './transformhub.css';
import { addBalancingRow, updateCanonicalRow } from './engine';
import {
  evaluateTaxonomyBackend,
  exportCsvFallback,
  fetchEntityModel,
  reviewTaxonomySuggestionBackend,
  fetchAuditDashboard,
  fetchAuditRuleCatalog,
  fetchCampaignPerformanceReport,
  fetchChartOfAccounts,
  fetchCrmSyncExport,
  fetchDonorReport,
  fetchReviewAnalytics,
  fetchTaxonomy,
  fetchSession,
  ingestFile,
  persistMergeDecisionBackend,
  resolveHouseholdsBackend,
  resolvePersonsBackend,
  runAuditRulesBackend,
  runBackendPreflight,
  saveSession,
  simulateBackendPost,
} from './service';
import type {
  AnalyticsSavedView,
  AnalyticsWorkspaceFilters,
  AnalyticsWorkspaceState,
  AuditRuleCatalogEntry,
  AuditRuleResult,
  BlockingIssue,
  CampaignPerformanceReport,
  CanonicalHousehold,
  CanonicalLedgerRow,
  CanonicalPerson,
  CrmSyncExport,
  DonorReport,
  EntityModelResult,
  FileClass,
  GuardrailFinding,
  HouseholdResolverResult,
  HouseholdReviewSuggestion,
  LegacyMapping,
  ParsedFile,
  PersonMatch,
  PersonResolverResult,
  PostingReceipt,
  PreflightResult,
  PreviewRecord,
  PreviewAttributionDraft,
  ResolvedSchema,
  SourcePlatform,
  SessionTaxonomyState,
  TaxonomyCode,
  TaxonomyGovernanceResult,
  TransformSession,
  TransformSessionStatus,
} from './types';
import { TransformHubAuditModePanel, TransformHubMappingLayerPanel } from './product-panels';
import { ReviewQueuePanel, useReviewQueueSummary } from './review-queue';
import { IdentityHubPanel } from './identity-hub';
import { AppliedDecisionsPanel } from './applied-decisions';
import { applyTaxonomyGroupsToPreviewRecords, buildTaxonomyState, dismissTaxonomyCandidate, mergeTaxonomyCandidate, renameResolvedTaxonomyGroup, summarizeTaxonomyState, updateTaxonomyScanColumn } from './taxonomy-session';
import { buildAppendColumnDecisions, getMergeStrategy, getPendingColumnMerges, mergeUploadIntoExisting, prepareIncomingUpload, resolvePendingColumnMerge as resolvePendingColumnMergeInParsedFile, type AppendColumnDecision, type PendingColumnMerge } from './merge-table';
import { EntityGraphEditors } from './review-editors';
import { EntityGraphTable, type EntityGraphSelection, type EntityGraphView } from './review-graph';
import type { FinalAttributionDraftMap, FinalHouseholdDraft } from './review-types';
import { useTransformHubReviewGraph } from './use-transformhub-review-graph';
import { useTransformHubHouseholdReview } from './use-transformhub-household-review';
import { useTransformHubReviewDrafts } from './use-transformhub-review-drafts';

const CRM_PLATFORMS = new Set<SourcePlatform>(['Bloomerang', 'Salesforce', 'NeonOne', 'GiveButter']);
const PREVIEW_SOURCE_PALETTE = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];

type UploadPayload = {
  fileName: string;
  kind: 'text' | 'xlsx';
  contents?: string;
  contentsBase64?: string;
};

type WorkbookSheetAction = 'append' | 'ignore';

type PendingWorkbookSheetReview = {
  payload: UploadPayload;
  workbookSheets: NonNullable<ParsedFile['workbookSheets']>;
  actionsBySheet: Record<string, WorkbookSheetAction>;
};

type AppendReviewSummary = {
  sourceFile: string;
  appendedRows: number;
  combinedColumns: number;
  newColumns: string[];
  fuzzyMerges: AppendColumnDecision[];
};

type PendingAppendReview = {
  sessionId: string;
  currentParsedFile: ParsedFile;
  currentSchema: ResolvedSchema;
  currentRows: CanonicalLedgerRow[];
  incomingParsedFile: ParsedFile;
  incomingSchema: ResolvedSchema;
  incomingRows: CanonicalLedgerRow[];
  columnDecisions: AppendColumnDecision[];
  guardrails: GuardrailFinding[];
  blockingIssues: BlockingIssue[];
  summary: AppendReviewSummary;
};

type EditablePreviewDraftValue = string | string[];
type EditablePreviewDraft = Record<string, EditablePreviewDraftValue>;
type PreviewTableContextMenu =
  | { kind: 'row'; rowRef: string; x: number; y: number }
  | { kind: 'column'; header: string; x: number; y: number };
type PreviewRowDropTarget = {
  rowRef: string;
  position: 'before' | 'after';
};
type PreviewCellRef = {
  rowRef: string;
  header: string;
};

type PreviewColumnFilters = Record<string, string>;

type NonLedgerReviewPanel = 'schema_union' | 'duplicate' | 'matching' | 'household' | 'taxonomy' | 'tx' | 'outcomes';
type MatchingTableView = 'raw' | 'consolidated';
type ReviewOutcomeId = 'revenue_at_risk' | 'money_leakage' | 'finance_mismatch' | 'campaign_truth' | 'donor_health';
type ReviewOutcomeAction = 'duplicate' | 'household' | 'taxonomy' | 'final_table';

type ReviewOutcomeDetail = {
  id: string;
  label: string;
  count: number;
  amount: number;
  description: string;
  ctaLabel: string;
  action: ReviewOutcomeAction;
};

type ReviewOutcomeCard = {
  id: ReviewOutcomeId;
  eyebrow: string;
  title: string;
  tone: 'risk' | 'opportunity' | 'warning' | 'neutral';
  amount: number;
  metricKind: 'currency' | 'percent';
  summary: string;
  supporting: string;
  details: ReviewOutcomeDetail[];
};

type AnalyticsWorkspaceItem = {
  id: string;
  outcomeId: ReviewOutcomeId;
  detailId: string;
  label: string;
  description: string;
  amount: number;
  sortDate: string | null;
  campaign: string;
  donorSegment: string;
  sourceRowRefs: string[];
  duplicateCount: number;
  includesSoftCredit: boolean;
  action: ReviewOutcomeAction;
  evidenceRows?: Array<{
    sourceRowRef: string;
    date: string | null;
    amount: number;
    source: string;
    type: string;
    recurring: boolean;
  }>;
};

type DonorHealthCard = {
  id: string;
  title: string;
  metric: string;
  note: string;
  valueLabel: string;
  secondaryLabel?: string;
  trend?: 'up' | 'down' | 'flat';
  bars?: Array<{
    label: string;
    value: number;
    tone?: 'primary' | 'secondary';
  }>;
};

type ParsedFileWithOptionalMergeState = ParsedFile & {
  mergeState?: {
    uploadedFiles?: string[];
  };
};

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read the file.'));
    reader.readAsText(file);
  });
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const payload = result.includes(',') ? result.split(',')[1] : result;
      resolve(payload);
    };
    reader.onerror = () => reject(new Error('Failed to read the XLSX file.'));
    reader.readAsDataURL(file);
  });
}

function deriveSessionStatus(
  nextRows: CanonicalLedgerRow[],
  nextPreflight: PreflightResult | null,
  nextReceipts: PostingReceipt[],
): TransformSessionStatus {
  const activeRows = nextRows.filter((row) => row.review_status !== 'rejected');
  if (nextReceipts.length > 0) return 'posted';
  if (nextPreflight?.valid && activeRows.length > 0 && activeRows.every((row) => row.review_status === 'approved' && !row.needs_review)) return 'ready';
  return 'review';
}

function buildMergeDecisionMap(rows: CanonicalLedgerRow[], auditDecisions: TransformSession['auditDecisions'] = []): Map<string, 'confirmed' | 'separated'> {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const decisions = new Map<string, 'confirmed' | 'separated'>();

  (auditDecisions ?? []).forEach((decision) => {
    if (!decision.rowId) return;
    const row = rowById.get(decision.rowId);
    if (!row) return;
    if (decision.merge) decisions.set(row.source_row_ref, 'confirmed');
    if (decision.split) decisions.set(row.source_row_ref, 'separated');
  });

  return decisions;
}

function buildMergeDecisionMapFromStructure(session: TransformSession): Map<string, 'confirmed' | 'separated'> {
  const fallback = buildMergeDecisionMap(session.rows, session.auditDecisions);
  if (fallback.size > 0) return fallback;

  const decisions = new Map<string, 'confirmed' | 'separated'>();
  const rowBySourceRef = new Map(session.rows.map((row) => [row.source_row_ref, row]));
  const decisionLog = session.structure?.decisionLog ?? [];

  decisionLog.forEach((entry) => {
    const decisionType = String(entry.decisionType ?? '');
    const payload = (entry.payload ?? {}) as Record<string, unknown>;
    const sourceRef = String(payload.inputRef ?? '');
    if (decisionType !== 'merge_resolution' || !sourceRef || !rowBySourceRef.has(sourceRef)) return;
    const action = String((entry.rationale as Record<string, unknown> | undefined)?.action ?? '');
    if (action === 'confirmed') decisions.set(sourceRef, 'confirmed');
    if (action === 'separated') decisions.set(sourceRef, 'separated');
  });

  return decisions;
}

function deriveReviewDecision(match: PersonMatch, mergeDecisions: Map<string, 'confirmed' | 'separated'>) {
  const persistedDecision = mergeDecisions.get(match.inputRef);
  if (persistedDecision) return persistedDecision;
  if (isExactDuplicateMatch(match)) return 'confirmed' as const;
  if (match.duplicateClass === 'possible_match' || match.duplicateClass === 'no_match') return 'separated' as const;
  if (match.decision === 'org_rule') return 'confirmed' as const;
  if (match.decision === 'new' || match.band === 'separate') return 'separated' as const;
  return null;
}

function isPendingDuplicateReview(match: PersonMatch, mergeDecisions: Map<string, 'confirmed' | 'separated'>): boolean {
  return match.duplicateClass === 'likely_match' && !deriveReviewDecision(match, mergeDecisions);
}

function isExactDuplicateMatch(match: PersonMatch): boolean {
  return match.duplicateClass === 'exact_match' || match.decision === 'org_rule' || (!match.duplicateClass && match.decision === 'auto' && match.score >= 98);
}

function describeAiSuggestion(match: PersonMatch): string | null {
  const suggestion = match.reviewPayload?.aiSuggestion;
  if (!suggestion) return null;
  const action = suggestion.suggestedAction === 'confirm_merge' ? 'suggest merge' : 'suggest separate';
  const evidence = suggestion.evidence.filter(Boolean).slice(0, 2).join(' + ');
  const reason = suggestion.reason.trim();
  return ['AI', suggestion.confidence, action, evidence || reason].filter(Boolean).join(' · ');
}

function describeHouseholdAiSuggestion(suggestion: HouseholdReviewSuggestion): string | null {
  const aiSuggestion = suggestion.aiSuggestion;
  if (!aiSuggestion) return null;
  const action = aiSuggestion.suggestedAction === 'confirm_merge' ? 'suggest same household' : 'suggest separate households';
  const evidence = aiSuggestion.evidence.filter(Boolean).slice(0, 2).join(' + ');
  const reason = aiSuggestion.reason.trim();
  return ['AI', aiSuggestion.confidence, action, evidence || reason].filter(Boolean).join(' · ');
}

function formatPersonLabel(person: CanonicalPerson | null): string {
  if (!person) return 'Unknown matched person';
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return name || person.id;
}

function describeLedgerRow(row: CanonicalLedgerRow): string {
  return [
    row.memo ? `Memo: ${row.memo}` : null,
    row.raw_fund ? `Fund: ${row.raw_fund}` : null,
    row.raw_appeal ? `Appeal: ${row.raw_appeal}` : null,
    row.canonical_person_id ? `Current person: ${row.canonical_person_id}` : null,
  ].filter(Boolean).join(' · ') || 'No additional row details.';
}

function previewRecordLabel(record: PreviewRecord | null | undefined): string {
  if (!record) return 'Unknown preview record';
  return String(record.displayName || record.donorName || record.campaignName || record.accountName || record.preview || record.sourceRowRef || record.id || 'Unknown preview record');
}

function formatReviewDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatReviewTransactionDate(value: string | null | undefined): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildAnalyticsEvidenceRows(records: PreviewRecord[]) {
  return records
    .map((record) => {
      const amount = parseCurrencyAmount(record.amount) ?? 0;
      const recurring = String(record.recurring ?? record.frequency ?? '').toLowerCase();
      return {
        sourceRowRef: String(record.sourceRowRef ?? record.id ?? ''),
        date: record.date ? String(record.date) : null,
        amount,
        source: String(record.sourceFile || record.source_file || 'Current file'),
        type: String(record.type || record.frequency || record.method || record.fund || 'Gift'),
        recurring: recurring.includes('true') || recurring.includes('monthly') || recurring.includes('quarterly') || recurring.includes('yearly'),
      };
    })
    .sort((left, right) => {
      const leftTime = left.date ? new Date(left.date).getTime() : 0;
      const rightTime = right.date ? new Date(right.date).getTime() : 0;
      return rightTime - leftTime;
    });
}

function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

function formatDeltaLabel(value: number | null | undefined, suffix = '%'): string {
  if (value == null || !Number.isFinite(value)) return 'Insufficient history';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(0)}${suffix}`;
}

function formatPreviewHeaderLabel(header: string): string {
  return header.replace(/[_-]+/g, ' ').trim() || header;
}

function parsePreviewColumnFilter(input: string): { operator: 'contains' | '>' | '>=' | '<' | '<=' | '='; value: string } {
  const trimmed = input.trim();
  const matched = trimmed.match(/^(<=|>=|=|<|>)(.*)$/);
  if (!matched) return { operator: 'contains', value: trimmed };
  return {
    operator: matched[1] as '>' | '>=' | '<' | '<=' | '=',
    value: matched[2].trim(),
  };
}

function parseComparableNumber(value: string): number | null {
  const normalized = value.replace(/[^0-9.-]+/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeComparableDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function isNumericPreviewColumn(columnKey: string): boolean {
  return /amount|debit|credit|balance|total|goal|revenue|credit_amount/.test(columnKey.toLowerCase());
}

function isDatePreviewColumn(columnKey: string): boolean {
  return /date|created|updated|posted|closed|settled|submitted/.test(columnKey.toLowerCase());
}

function matchesComparableNumberFilter(haystack: string, rawFilter: string): boolean {
  const parsedFilter = parsePreviewColumnFilter(rawFilter);
  const left = parseComparableNumber(haystack);
  if (left === null) return false;
  if (parsedFilter.operator === 'contains') return haystack.toLowerCase().includes(parsedFilter.value.toLowerCase());
  const right = parseComparableNumber(parsedFilter.value);
  if (right === null) return false;
  if (parsedFilter.operator === '>') return left > right;
  if (parsedFilter.operator === '>=') return left >= right;
  if (parsedFilter.operator === '<') return left < right;
  if (parsedFilter.operator === '<=') return left <= right;
  return left === right;
}

function matchesComparableDateFilter(haystack: string, rawFilter: string): boolean {
  const parsedFilter = parsePreviewColumnFilter(rawFilter);
  const left = normalizeComparableDate(haystack);
  if (!left) return false;
  if (parsedFilter.operator === 'contains') {
    const probe = parsedFilter.value.trim();
    if (/^\d{4}(-\d{2}){0,2}$/.test(probe)) return left.startsWith(probe);
    return haystack.toLowerCase().includes(probe.toLowerCase()) || left.includes(probe.toLowerCase());
  }
  const right = normalizeComparableDate(parsedFilter.value);
  if (!right) return false;
  if (parsedFilter.operator === '>') return left > right;
  if (parsedFilter.operator === '>=') return left >= right;
  if (parsedFilter.operator === '<') return left < right;
  if (parsedFilter.operator === '<=') return left <= right;
  return left === right;
}

function formatEntityGraphViewLabel(view: EntityGraphView): string {
  if (view === 'persons') return 'Canonical Profiles';
  if (view === 'donations') return 'Canonical Transactions';
  if (view === 'attributions') return 'Transaction Links';
  if (view === 'households') return 'Household Groups';
  return 'Organizations';
}

function getPreviewRecordRawValues(record: PreviewRecord | null | undefined): Record<string, string> {
  return record?.rawValues ?? record?.values ?? {};
}

function getPreviewRecordRawCell(record: PreviewRecord | null | undefined, header: string): string {
  const rawValues = getPreviewRecordRawValues(record);
  const value = rawValues[header];
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function getPreviewRecordAttribution(record: PreviewRecord | null | undefined): PreviewAttributionDraft | null {
  if (!record) return null;
  const candidate = record.attribution;
  if (!candidate || typeof candidate !== 'object') return null;
  const attribution = candidate as Partial<PreviewAttributionDraft>;
  if (!attribution.mode) return null;
  return {
    mode: attribution.mode,
    primaryPersonId: attribution.primaryPersonId ?? null,
    secondaryPersonId: attribution.secondaryPersonId ?? null,
    householdId: attribution.householdId ?? null,
    householdRemoved: attribution.householdRemoved === true,
    creditAmount: attribution.creditAmount ?? null,
    campaignFund: attribution.campaignFund ?? '',
    organizationName: attribution.organizationName ?? '',
    splitPercent: attribution.splitPercent ?? 50,
    notes: attribution.notes ?? '',
  };
}

function getPreviewRecordTransactionId(record: PreviewRecord | null | undefined): string | null {
  const rawValues = getPreviewRecordRawValues(record);
  const transactionId = rawValues.transaction_id || rawValues.transactionId || rawValues['transaction id'] || rawValues.id || '';
  const normalized = String(transactionId ?? '').trim();
  return normalized || null;
}

function createBlankPreviewRecord(fileClass: string, headers: string[], sourceRowRef: string): PreviewRecord {
  const rawValues = Object.fromEntries(headers.map((header) => [header, '']));
  if (fileClass === 'constituent') {
    return {
      id: `inserted:${sourceRowRef}`,
      sourceRowRef,
      displayName: '',
      constituentType: '',
      firstName: '',
      lastName: '',
      organizationName: '',
      householdName: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
      tags: [],
      assignedStaff: '',
      createdAt: '',
      updatedAt: '',
      rawValues,
    } as PreviewRecord;
  }
  if (fileClass === 'donor') {
    return {
      id: `inserted:${sourceRowRef}`,
      sourceRowRef,
      donorName: '',
      firstName: '',
      lastName: '',
      organizationName: '',
      householdName: '',
      date: '',
      amount: '',
      fund: '',
      appeal: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      tags: [],
      assignedStaff: '',
      memo: '',
      currency: '',
      rawValues,
    } as PreviewRecord;
  }
  if (fileClass === 'campaign') {
    return {
      id: `inserted:${sourceRowRef}`,
      sourceRowRef,
      code: '',
      campaignName: '',
      startDate: '',
      endDate: '',
      status: '',
      goalAmount: '',
      rawValues,
    } as PreviewRecord;
  }
  if (fileClass === 'coa') {
    return {
      id: `inserted:${sourceRowRef}`,
      sourceRowRef,
      accountCode: '',
      accountName: '',
      accountType: '',
      balance: '',
      rawValues,
    } as PreviewRecord;
  }
  return {
    id: `inserted:${sourceRowRef}`,
    sourceRowRef,
    preview: '',
    values: rawValues,
    rawValues,
  } as PreviewRecord;
}

function getSourceOriginKey(sourceRef: string | null | undefined, fallbackContext?: string | null): string {
  if (!sourceRef) return fallbackContext || 'current upload';
  const parts = sourceRef.split(':').filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, -1).join(' · ') : null) || fallbackContext || 'current upload';
}

function buildUploadNamespace(fileName: string): string {
  const stem = fileName
    .replace(/\.[^.]+$/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'upload';
  return `${stem}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function scoreSheetHeaderOverlap(left: string[], right: string[]): number {
  const leftSet = new Set(left.map((header) => header.toLowerCase().trim()).filter(Boolean));
  const rightSet = new Set(right.map((header) => header.toLowerCase().trim()).filter(Boolean));
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  const intersection = Array.from(leftSet).filter((header) => rightSet.has(header)).length;
  return intersection / Math.max(leftSet.size, rightSet.size, 1);
}

function normalizeSheetHeader(header: string): string {
  return header.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function sheetHasAnyHeader(headers: string[], patterns: RegExp[]): boolean {
  const normalized = headers.map(normalizeSheetHeader);
  return normalized.some((header) => patterns.some((pattern) => pattern.test(header)));
}

function qualifiesForHouseholdAnalysis(sheet: NonNullable<ParsedFile['workbookSheets']>[number]): boolean {
  if (sheet.structureAnalysis.dataRowCount < 2) return false;
  if (sheet.fileClass !== 'donor' && sheet.fileClass !== 'constituent') return false;
  const headers = sheet.headers ?? [];
  const hasNameSignals = sheetHasAnyHeader(headers, [
    /(^| )first name($| )/,
    /(^| )last name($| )/,
    /(^| )(donor|constituent|full) name($| )/,
    /(^| )name($| )/,
    /(^| )household name($| )/,
  ]);
  const hasHouseholdSignals = sheetHasAnyHeader(headers, [
    /(^| )address($| )/,
    /(^| )mailing address($| )/,
    /(^| )postal code($| )/,
    /(^| )zip($| )/,
    /(^| )city($| )/,
    /(^| )state($| )/,
    /(^| )household name($| )/,
  ]);
  return hasNameSignals && hasHouseholdSignals;
}

function scoreWorkbookBaseSheet(sheet: NonNullable<ParsedFile['workbookSheets']>[number]): number {
  const normalizedName = sheet.sheetName.toLowerCase().trim();
  let score = sheet.structureAnalysis.dataRowCount * 100 + (sheet.headers?.length ?? 0);
  if (qualifiesForHouseholdAnalysis(sheet)) score += 2000;
  if (sheet.fileClass === 'donor' || sheet.fileClass === 'constituent') score += 400;
  if (/^readme$|read me|instruction|instructions|notes?|summary|cover|about/.test(normalizedName)) score -= 2500;
  if (/expected|sample output|review pairs?|pairs?|qa|test cases?/.test(normalizedName)) score -= 1200;
  return score;
}

function pickWorkbookBaseSheet(workbookSheets: NonNullable<ParsedFile['workbookSheets']>) {
  return workbookSheets.reduce((best, sheet) => (
    !best || scoreWorkbookBaseSheet(sheet) > scoreWorkbookBaseSheet(best) ? sheet : best
  ), workbookSheets[0]);
}

function buildDefaultWorkbookSheetActions(workbookSheets: NonNullable<ParsedFile['workbookSheets']>): Record<string, WorkbookSheetAction> {
  if (workbookSheets.length === 0) return {};
  const baseSheet = pickWorkbookBaseSheet(workbookSheets);
  return Object.fromEntries(
    workbookSheets.map((sheet) => {
      if (!qualifiesForHouseholdAnalysis(sheet)) {
        return [sheet.sheetName, 'ignore' as const];
      }
      if (sheet.sheetName === baseSheet.sheetName) return [sheet.sheetName, 'append' as const];
      const overlap = scoreSheetHeaderOverlap(baseSheet.headers, sheet.headers);
      const isCompatible = sheet.fileClass === baseSheet.fileClass && overlap >= 0.45;
      return [sheet.sheetName, isCompatible ? 'append' as const : 'ignore' as const];
    }),
  );
}

function describeWorkbookSheetCompatibility(sheet: NonNullable<ParsedFile['workbookSheets']>[number], baseSheet: NonNullable<ParsedFile['workbookSheets']>[number]) {
  if (!qualifiesForHouseholdAnalysis(sheet)) {
    return {
      tone: 'warning' as const,
      label: 'Skipped',
      detail: 'This tab does not look like a donor/constituent sheet with usable household signals, so it is ignored by default.',
    };
  }
  if (sheet.sheetName === baseSheet.sheetName) {
    return { tone: 'ready' as const, label: 'Base sheet', detail: 'Used as the comparison baseline for workbook combine review.' };
  }
  const overlap = scoreSheetHeaderOverlap(baseSheet.headers, sheet.headers);
  if (sheet.fileClass !== baseSheet.fileClass) {
    return {
      tone: 'warning' as const,
      label: 'Different class',
      detail: `Detected as ${sheet.fileClass} instead of ${baseSheet.fileClass}. Ignore this tab unless you intentionally want one mixed table.`,
    };
  }
  if (overlap < 0.45) {
    return {
      tone: 'warning' as const,
      label: 'Low overlap',
      detail: `Only ${Math.round(overlap * 100)}% header overlap with the base sheet. Separate review is recommended.`,
    };
  }
  return {
    tone: 'ready' as const,
    label: 'Compatible',
    detail: `About ${Math.round(overlap * 100)}% header overlap with the base sheet. Safe to append into the same table.`,
  };
}

type PeopleReviewFilter = 'pending' | 'merged' | 'separated' | 'all';
type HouseholdReviewTab = 'needs_attribution' | 'all';

function getPeopleReviewBucket(match: PersonMatch, mergeDecisions: Map<string, 'confirmed' | 'separated'>): Exclude<PeopleReviewFilter, 'all'> {
  const decision = deriveReviewDecision(match, mergeDecisions);
  if (decision === 'confirmed') return 'merged';
  if (decision === 'separated') return 'separated';
  return 'pending';
}

function matchesPeopleReviewFilter(filter: PeopleReviewFilter, match: PersonMatch, mergeDecisions: Map<string, 'confirmed' | 'separated'>): boolean {
  if (filter === 'all') return true;
  return getPeopleReviewBucket(match, mergeDecisions) === filter;
}

function countPeopleReviewBuckets(matches: PersonMatch[], mergeDecisions: Map<string, 'confirmed' | 'separated'>) {
  return matches.reduce(
    (counts, match) => {
      const bucket = getPeopleReviewBucket(match, mergeDecisions);
      counts[bucket] += 1;
      counts.all += 1;
      return counts;
    },
    { pending: 0, merged: 0, separated: 0, all: 0 } as Record<PeopleReviewFilter, number>,
  );
}

function formatPersonName(person: Pick<CanonicalPerson, 'firstName' | 'lastName' | 'id'> | null | undefined): string {
  if (!person) return 'Unknown person';
  return [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || person.id;
}

function getPersonInitials(person: Pick<CanonicalPerson, 'firstName' | 'lastName' | 'id'> | null | undefined): string {
  if (!person) return '??';
  const initials = [person.firstName?.[0], person.lastName?.[0]].filter(Boolean).join('');
  return (initials || person.id.slice(0, 2)).toUpperCase();
}

function buildHouseholdMemberDisplayKey(person: Pick<CanonicalPerson, 'firstName' | 'lastName' | 'email' | 'id'> | null | undefined): string {
  if (!person) return '';
  const nameKey = [person.firstName, person.lastName]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join('|');
  const emailKey = String(person.email ?? '').trim().toLowerCase();
  return emailKey || nameKey || person.id;
}

function collapseHouseholdMembersForDisplay<T extends Pick<CanonicalPerson, 'firstName' | 'lastName' | 'email' | 'id'>>(members: T[]): T[] {
  const unique = new Map<string, T>();
  members.forEach((member) => {
    const key = buildHouseholdMemberDisplayKey(member);
    if (!key || unique.has(key)) return;
    unique.set(key, member);
  });
  return Array.from(unique.values());
}

function buildHouseholdLabel(members: CanonicalPerson[], fallbackLastName?: string | null) {
  const displayMembers = collapseHouseholdMembersForDisplay(members);
  const lastName = fallbackLastName || displayMembers.map((member) => member.lastName).find(Boolean) || 'Household';
  return /\bhousehold\b/i.test(lastName) ? lastName : `${lastName} Household`;
}

function buildInformalSalutation(members: CanonicalPerson[]) {
  const displayMembers = collapseHouseholdMembersForDisplay(members);
  const firstNames = displayMembers.map((member) => member.firstName).filter(Boolean);
  if (firstNames.length === 0) return 'Friends';
  if (firstNames.length === 1) return firstNames[0];
  if (firstNames.length === 2) return `${firstNames[0]} and ${firstNames[1]}`;
  return `${firstNames[0]} and family`;
}

function buildAddressee(members: CanonicalPerson[]) {
  const displayMembers = collapseHouseholdMembersForDisplay(members);
  if (displayMembers.length === 0) return 'Household';
  if (displayMembers.length === 1) return formatPersonName(displayMembers[0]);
  const uniqueLastNames = Array.from(new Set(displayMembers.map((member) => member.lastName).filter(Boolean)));
  const firstNames = displayMembers.map((member) => member.firstName).filter(Boolean);
  if (displayMembers.length === 2 && uniqueLastNames.length === 1 && firstNames.length === 2) {
    return `${firstNames[0]} and ${firstNames[1]} ${uniqueLastNames[0]}`;
  }
  return displayMembers.map((member) => formatPersonName(member)).join(' and ');
}

function buildFormalSalutation(members: CanonicalPerson[]) {
  const displayMembers = collapseHouseholdMembersForDisplay(members);
  if (displayMembers.length === 0) return 'Household';
  if (displayMembers.length === 1) return formatPersonName(displayMembers[0]);
  const uniqueLastNames = Array.from(new Set(displayMembers.map((member) => member.lastName).filter(Boolean)));
  if (displayMembers.length === 2 && uniqueLastNames.length === 1) {
    return `${displayMembers.map((member) => member.firstName).filter(Boolean).join(' and ')} ${uniqueLastNames[0]}`.trim();
  }
  return buildAddressee(displayMembers);
}

function buildInitialHouseholdDraft(household: CanonicalHousehold, members: CanonicalPerson[]): FinalHouseholdDraft {
  return {
    label: household.label || buildHouseholdLabel(members, household.lastName),
    primaryPersonId: household.primaryPersonId ?? household.memberIds[0] ?? null,
    formalSalutation: household.formalSalutation || household.salutationText || buildFormalSalutation(members),
    informalSalutation: household.informalSalutation || buildInformalSalutation(members),
    eventSalutation: household.eventSalutation || buildFormalSalutation(members),
    addressee: household.addressee || buildAddressee(members),
  };
}

function parseCurrencyAmount(value: unknown): number | null {
  const normalized = String(value ?? '').replace(/[^0-9.-]+/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrencyAmount(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function roundCurrencyAmount(value: number, increment = 100): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value / increment) * increment;
}

function formatOutcomeMetric(kind: ReviewOutcomeCard['metricKind'], value: number): string {
  if (kind === 'percent') return `${Math.round(value)}%`;
  return formatCurrencyAmount(value);
}

function normalizeRecordIdentity(record: PreviewRecord): string {
  return String(
    record.organizationName
    || record.donorName
    || record.displayName
    || [record.firstName, record.lastName].filter(Boolean).join(' ')
    || record.sourceRowRef
    || record.id,
  ).trim().toLowerCase();
}

function buildDefaultAnalyticsFilters(): AnalyticsWorkspaceFilters {
  return {
    campaign: 'all',
    donorSegment: 'all',
    minAmount: null,
    sort: 'highest_value',
    includeDuplicates: true,
    includeSoftCredit: true,
  };
}

function buildDefaultAnalyticsWorkspace(): AnalyticsWorkspaceState {
  return {
    selectedOutcomeId: 'revenue_at_risk',
    selectedDetailIdByOutcome: {},
    filtersByDetail: {},
    savedViews: [],
  };
}

function matchesEntityGraphSearch(values: unknown[], query: string) {
  if (!query.trim()) return true;
  const normalized = query.trim().toLowerCase();
  return values.some((value) => String(value ?? '').toLowerCase().includes(normalized));
}

function matchesEntityGraphSelection(
  selection: EntityGraphSelection | null,
  row: unknown,
  entityModelResult: EntityModelResult | null,
  view: EntityGraphView,
) {
  if (!selection || !entityModelResult) return true;
  const attributionsForDonation = (donationId: string) => entityModelResult.attributions.filter((entry) => entry.donationId === donationId);
  const householdsById = new Map(entityModelResult.households.map((household) => [household.id, household]));

  if (selection.type === 'donations') {
    const donation = entityModelResult.donations.find((item) => item.id === selection.id);
    if (!donation) return true;
    if (view === 'donations') return (row as EntityModelResult['donations'][number]).id === donation.id;
    if (view === 'attributions') return (row as EntityModelResult['attributions'][number]).donationId === donation.id;
    if (view === 'households') return (row as EntityModelResult['households'][number]).id === donation.canonical_household_id;
    if (view === 'persons') {
      const personIds = new Set([donation.canonical_person_id, ...attributionsForDonation(donation.id).map((entry) => entry.personId)].filter(Boolean));
      return personIds.has((row as EntityModelResult['persons'][number]).id);
    }
    if (view === 'organizations') {
      const orgIds = new Set([donation.canonical_org_id, ...attributionsForDonation(donation.id).map((entry) => entry.organizationId)].filter(Boolean));
      return orgIds.has((row as EntityModelResult['organizations'][number]).id);
    }
  }

  if (selection.type === 'attributions') {
    const attribution = entityModelResult.attributions.find((item) => item.id === selection.id);
    if (!attribution) return true;
    if (view === 'attributions') return (row as EntityModelResult['attributions'][number]).id === attribution.id;
    if (view === 'donations') return (row as EntityModelResult['donations'][number]).id === attribution.donationId;
    if (view === 'persons') return (row as EntityModelResult['persons'][number]).id === attribution.personId;
    if (view === 'organizations') return (row as EntityModelResult['organizations'][number]).id === attribution.organizationId;
    if (view === 'households') {
      const donation = entityModelResult.donations.find((item) => item.id === attribution.donationId);
      return (row as EntityModelResult['households'][number]).id === donation?.canonical_household_id;
    }
  }

  if (selection.type === 'households') {
    const household = householdsById.get(selection.id);
    if (!household) return true;
    if (view === 'households') return (row as EntityModelResult['households'][number]).id === household.id;
    if (view === 'persons') return household.memberIds.includes((row as EntityModelResult['persons'][number]).id);
    if (view === 'donations') return (row as EntityModelResult['donations'][number]).canonical_household_id === household.id;
    if (view === 'attributions') {
      const donationIds = new Set(entityModelResult.donations.filter((item) => item.canonical_household_id === household.id).map((item) => item.id));
      const donationId = (row as EntityModelResult['attributions'][number]).donationId;
      return donationId ? donationIds.has(donationId) : false;
    }
    if (view === 'organizations') {
      const donationIds = new Set(entityModelResult.donations.filter((item) => item.canonical_household_id === household.id).map((item) => item.id));
      return entityModelResult.attributions.some((entry) => entry.donationId !== null && donationIds.has(entry.donationId) && entry.organizationId === (row as EntityModelResult['organizations'][number]).id);
    }
  }

  if (selection.type === 'persons') {
    if (view === 'persons') return (row as EntityModelResult['persons'][number]).id === selection.id;
    if (view === 'donations') return (row as EntityModelResult['donations'][number]).canonical_person_id === selection.id;
    if (view === 'attributions') return (row as EntityModelResult['attributions'][number]).personId === selection.id;
    if (view === 'households') return (row as EntityModelResult['households'][number]).memberIds.includes(selection.id);
    if (view === 'organizations') {
      return entityModelResult.attributions.some((entry) => entry.personId === selection.id && entry.organizationId === (row as EntityModelResult['organizations'][number]).id);
    }
  }

  if (selection.type === 'organizations') {
    if (view === 'organizations') return (row as EntityModelResult['organizations'][number]).id === selection.id;
    if (view === 'attributions') return (row as EntityModelResult['attributions'][number]).organizationId === selection.id;
    if (view === 'donations') return (row as EntityModelResult['donations'][number]).canonical_org_id === selection.id;
    if (view === 'persons') {
      return entityModelResult.attributions.some((entry) => entry.organizationId === selection.id && entry.personId === (row as EntityModelResult['persons'][number]).id);
    }
    if (view === 'households') {
      const householdIds = new Set(
        entityModelResult.donations
          .filter((donation) => donation.canonical_org_id === selection.id)
          .map((donation) => donation.canonical_household_id)
          .filter(Boolean),
      );
      return householdIds.has((row as EntityModelResult['households'][number]).id);
    }
  }

  return true;
}

function summarizeAttributionDraft(
  draft: PreviewAttributionDraft,
  members: CanonicalPerson[],
  matchedPerson: CanonicalPerson | null,
) {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const primary = (draft.primaryPersonId ? memberById.get(draft.primaryPersonId) : null) ?? matchedPerson;
  const secondary = draft.secondaryPersonId ? memberById.get(draft.secondaryPersonId) ?? null : null;
  if (draft.mode === 'joint_split') {
    return `${primary ? formatPersonName(primary) : 'Primary donor'} ${draft.splitPercent}% · ${secondary ? formatPersonName(secondary) : 'Secondary donor'} ${Math.max(0, 100 - draft.splitPercent)}%`;
  }
  if (draft.mode === 'soft_credit') {
    return `${primary ? formatPersonName(primary) : 'Primary donor'} hard credit · ${secondary ? formatPersonName(secondary) : 'Secondary donor'} soft credit`;
  }
  if (draft.mode === 'org_match') {
    return `${primary ? formatPersonName(primary) : 'Primary donor'} hard credit · ${draft.organizationName || 'Employer'} matching gift`;
  }
  return `${primary ? formatPersonName(primary) : 'Primary donor'} hard credit`;
}

function buildInitialAttributionDraft(
  record: PreviewRecord,
  members: CanonicalPerson[],
  matchedPerson: CanonicalPerson | null,
): PreviewAttributionDraft {
  const existing = record.attribution as PreviewAttributionDraft | undefined;
  if (existing) return existing;
  const lowerName = String(record.donorName || record.displayName || '').toLowerCase();
  const lowerMemo = String(record.memo || '').toLowerCase();
  const hasJointGift = /\s(&|and)\s/.test(lowerName) && members.length > 1;
  const hasSoftCredit = /soft credit|tribute|in honor/i.test(lowerMemo);
  const hasOrgMatch = /matching gift|employer match|workplace/i.test(lowerMemo);
  const detectedMode = hasOrgMatch ? 'org_match' : hasSoftCredit ? 'soft_credit' : hasJointGift ? 'joint_split' : 'person';
  const rawAmount = parseCurrencyAmount(record.amount);
  return {
    mode: detectedMode,
    primaryPersonId: matchedPerson?.id ?? members[0]?.id ?? null,
    secondaryPersonId: members.find((member) => member.id !== (matchedPerson?.id ?? members[0]?.id))?.id ?? null,
    householdId: null,
    householdRemoved: false,
    creditAmount: detectedMode === 'soft_credit' ? 0 : rawAmount,
    campaignFund: [record.campaignName, record.fund].filter(Boolean).join(' · '),
    organizationName: String(record.organizationName ?? ''),
    splitPercent: 50,
    notes: String(record.memo ?? ''),
  };
}

function getAttributionModeLabel(mode: PreviewAttributionDraft['mode']): string {
  if (mode === 'joint_split') return 'Joint split';
  if (mode === 'soft_credit') return 'Soft credit';
  if (mode === 'org_match') return 'Org match';
  return 'Hard credit';
}

function getAttributionModeCreditLabel(mode: PreviewAttributionDraft['mode']): string {
  if (mode === 'joint_split') return 'split';
  if (mode === 'soft_credit') return 'soft';
  if (mode === 'org_match') return 'pending';
  return 'hard';
}

function getRoleTone(role: 'primary' | 'secondary' | 'organization' | 'unassigned'): 'green' | 'amber' | 'blue' | 'slate' {
  if (role === 'primary') return 'green';
  if (role === 'secondary') return 'amber';
  if (role === 'organization') return 'blue';
  return 'slate';
}

function getAttributionReviewKey(record: PreviewRecord) {
  const rawValues = record.rawValues ?? record.values ?? {};
  const transactionId = rawValues.transaction_id || rawValues.transactionId || rawValues['transaction id'] || rawValues.id || '';
  if (transactionId) return `tx:${String(transactionId).trim().toLowerCase()}`;
  return [
    String(record.date ?? '').trim().toLowerCase(),
    String(record.amount ?? '').trim().toLowerCase(),
    String(record.fund ?? '').trim().toLowerCase(),
    String(record.appeal ?? '').trim().toLowerCase(),
    String(record.campaignName ?? '').trim().toLowerCase(),
  ].join('::');
}

function getBestPersonDisplayLabel(person: CanonicalPerson | null, record: PreviewRecord): string {
  if (person && (person.firstName || person.lastName)) return formatPersonName(person);
  return String(record.donorName || record.displayName || record.organizationName || record.householdName || record.preview || 'Unassigned');
}

function getAttributionTagLabel(mode: PreviewAttributionDraft['mode'], needsAttributionReview: boolean): string {
  if (needsAttributionReview && mode === 'person') return 'Select attribution';
  if (mode === 'soft_credit') return 'Soft credit';
  if (mode === 'joint_split') return 'Joint gift';
  if (mode === 'org_match') return 'Org match';
  return 'Hard credit';
}

function summarizeMatchSignals(match: PersonMatch): string {
  const count = match.matchedFields.filter(Boolean).length;
  if (count === 0) return 'Name similarity';
  if (count === 1) return match.matchedFields[0].replace(/_/g, ' ');
  return `${count} matching signals`;
}

function formatSourceBadgeRowLabel(sourceRef: string | null | undefined, sourceBadgeByOrigin: Map<string, string>, fallbackContext?: string | null): string {
  const parts = String(sourceRef || '').split(':').filter(Boolean);
  const primary = parts[parts.length - 1] || String(sourceRef || '—');
  const origin = getSourceOriginKey(sourceRef, fallbackContext);
  const badge = sourceBadgeByOrigin.get(origin) ?? origin;
  return `${badge} ${primary}`;
}

function classifyDuplicateCandidate(match: PersonMatch): 'exact match' | 'likely match' | 'possible match' | 'no match' {
  if (match.duplicateClass === 'exact_match') return 'exact match';
  if (match.duplicateClass === 'likely_match') return 'likely match';
  if (match.duplicateClass === 'possible_match') return 'possible match';
  if (match.duplicateClass === 'no_match') return 'no match';
  if (match.decision === 'new' || match.band === 'separate' || !match.matchedPersonId) return 'no match';
  if (match.decision === 'org_rule' || match.decision === 'auto' || match.score >= 0.98) return 'exact match';
  if (match.score >= 0.85) return 'likely match';
  return 'possible match';
}

function getDuplicateClassCounts(result: PersonResolverResult | null | undefined) {
  const base = result?.duplicateClassCounts ?? { exact_match: 0, likely_match: 0, possible_match: 0, no_match: 0 };
  return {
    exact_match: base.exact_match ?? 0,
    likely_match: base.likely_match ?? 0,
    possible_match: base.possible_match ?? 0,
    no_match: base.no_match ?? 0,
  };
}

function getResolvedPersonAssignment(match: PersonMatch | undefined, mergeDecisions: Map<string, 'confirmed' | 'separated'>): string | null {
  if (!match?.matchedPersonId) return null;
  const decision = deriveReviewDecision(match, mergeDecisions);
  if (decision === 'confirmed') return match.matchedPersonId;
  if (match.duplicateClass === 'no_match' && match.decision === 'new') return match.matchedPersonId;
  return null;
}

type PreviewCompareField = {
  key: string;
  label: string;
  editable: boolean;
  kind: 'source' | 'raw';
  header?: string;
};

function getPreviewCompareFields(headers: string[]): PreviewCompareField[] {
  return [
    { key: 'sourceRowRef', label: 'Source', editable: false, kind: 'source' },
    ...headers.map((header) => ({
      key: `raw:${header}`,
      label: formatPreviewHeaderLabel(header),
      editable: true,
      kind: 'raw' as const,
      header,
    })),
  ];
}

// The semantics that identify a PERSON, not a transaction.
const DONOR_IDENTITY_SEMANTICS = new Set([
  'entity_name', 'donor_name', 'first_name', 'last_name', 'organization_name',
  'email', 'phone', 'address', 'city', 'state', 'postal_code', 'zip', 'country',
]);

// The semantics that describe a TRANSACTION, not a person.
const TX_DUPLICATE_SEMANTICS = new Set([
  'date', 'amount', 'debit', 'credit', 'account_code', 'account_name',
  'fund', 'appeal', 'campaign', 'memo', 'currency',
]);

function getDonorIdentityCompareFields(headers: string[], fieldMap: Record<string, string> | null | undefined): PreviewCompareField[] {
  // Build a set of raw headers that map to identity semantics.
  const identityHeaders = new Set<string>();
  if (fieldMap) {
    for (const [semantic, rawHeader] of Object.entries(fieldMap)) {
      if (DONOR_IDENTITY_SEMANTICS.has(semantic) && rawHeader) identityHeaders.add(rawHeader);
    }
  }
  // Fall back to heuristic if no fieldMap or no matches.
  const useAll = identityHeaders.size === 0;
  const filtered = headers.filter((header) => {
    if (useAll) return true;
    if (identityHeaders.has(header)) return true;
    // Also include by header name heuristic as a safety net.
    const probe = header.toLowerCase().replace(/[^a-z]/g, '');
    return /^(name|donor|first|last|org|org|email|phone|address|street|city|state|zip|postal|country)/.test(probe);
  });
  return [
    { key: 'sourceRowRef', label: 'Source', editable: false, kind: 'source' },
    ...filtered.map((header) => ({
      key: `raw:${header}`,
      label: formatPreviewHeaderLabel(header),
      editable: true,
      kind: 'raw' as const,
      header,
    })),
  ];
}

function getTxDuplicateCompareFields(headers: string[], fieldMap: Record<string, string> | null | undefined): PreviewCompareField[] {
  const prioritizedHeaders: string[] = [];
  const seenHeaders = new Set<string>();
  const wantedSemantics = new Set([...DONOR_IDENTITY_SEMANTICS, ...TX_DUPLICATE_SEMANTICS]);
  if (fieldMap) {
    for (const [semantic, rawHeader] of Object.entries(fieldMap)) {
      if (!wantedSemantics.has(semantic) || !rawHeader || seenHeaders.has(rawHeader)) continue;
      prioritizedHeaders.push(rawHeader);
      seenHeaders.add(rawHeader);
    }
  }
  const orderedHeaders = [
    ...prioritizedHeaders.filter((header) => headers.includes(header)),
    ...headers.filter((header) => !seenHeaders.has(header)),
  ];
  return [
    { key: 'sourceRowRef', label: 'Source', editable: false, kind: 'source' },
    ...orderedHeaders.map((header) => ({
      key: `raw:${header}`,
      label: formatPreviewHeaderLabel(header),
      editable: true,
      kind: 'raw' as const,
      header,
    })),
  ];
}

function getPreviewCompareValue(record: PreviewRecord | null, field: PreviewCompareField): string {
  if (!record) return '—';
  if (field.kind === 'source') {
    return record.sourceRowRef ? String(record.sourceRowRef) : '—';
  }
  return field.header ? getPreviewRecordRawCell(record, field.header) : '—';
}

type TransactionDuplicateReviewCardProps = {
  match: PersonMatch;
  incomingRecord: PreviewRecord | null;
  matchedRecord: PreviewRecord | null;
  compareFields: PreviewCompareField[];
  decision: 'confirmed' | 'separated' | undefined;
  isExpanded: boolean;
  previewRecordLabel: (record: PreviewRecord | null | undefined) => string;
  getCompactSourceRef: (sourceRef: string | null | undefined) => { primary: string; context: string | null };
  onToggleExpanded: () => void;
  onSetDecision: (decision: 'confirmed' | 'separated') => void;
};

function TransactionDuplicateReviewCard({
  match,
  incomingRecord,
  matchedRecord,
  compareFields,
  decision,
  isExpanded,
  previewRecordLabel: getPreviewRecordLabel,
  getCompactSourceRef,
  onToggleExpanded,
  onSetDecision,
}: TransactionDuplicateReviewCardProps) {
  const candidateEvidence = match.reviewPayload?.matchedEvidence?.filter(Boolean) ?? [];
  const incomingSourceLabel = getCompactSourceRef(match.inputRef).primary;
  const matchedSourceLabel = matchedRecord
    ? getCompactSourceRef(matchedRecord.sourceRowRef).primary
    : (match.reviewPayload?.matchedInputRef ?? match.inputRef);

  return (
    <article className="th-guardrail is-warning th-review-match-card" style={{ gap: 14 }}>
      <div className="th-review-match-head">
        <div style={{ flex: 1 }}>
          <strong>{incomingSourceLabel} ↔ {matchedSourceLabel}</strong>
          <p>{getPreviewRecordLabel(incomingRecord)} → {getPreviewRecordLabel(matchedRecord)}</p>
          <p>{candidateEvidence.join(' · ') || 'Matched on donor + amount + date'}</p>
        </div>
        <div className="th-review-match-actions">
          <button
            type="button"
            className={`th-button ${isExpanded ? 'th-button-primary' : 'th-button-secondary'}`}
            style={{ minHeight: 34 }}
            onClick={onToggleExpanded}
          >
            {isExpanded ? 'Hide compare' : 'Show compare'}
          </button>
          {decision ? (
            <span className={`th-status ${decision === 'confirmed' ? 'is-ready' : 'is-rejected'}`}>
              {decision === 'confirmed' ? 'Kept one' : 'Kept both'}
            </span>
          ) : (
            <div className="th-review-match-actions">
              <button type="button" className="th-button th-button-primary" style={{ minHeight: 34 }} onClick={() => onSetDecision('confirmed')}>Keep one (deduplicate)</button>
              <button type="button" className="th-button th-button-secondary" style={{ minHeight: 34 }} onClick={() => onSetDecision('separated')}>Keep both</button>
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        className={`th-review-summary ${isExpanded ? 'is-open' : ''}`}
        onClick={onToggleExpanded}
      >
        <span><strong>Incoming</strong> {getPreviewRecordLabel(incomingRecord)}</span>
        <span><strong>Matched row</strong> {getPreviewRecordLabel(matchedRecord)}</span>
      </button>
      {isExpanded && (
        <div className="th-stack" style={{ width: '100%' }}>
          <div className="th-mini-block">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <strong>Transaction compare</strong>
              <span className="th-helper">Full uploaded row view for duplicate gift review</span>
            </div>
            <div className="th-table-wrap" style={{ marginTop: 10 }}>
              <table className="th-table th-review-compare-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    {compareFields.map((field) => (
                      <th key={field.key}>{field.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Incoming</strong></td>
                    {compareFields.map((field) => (
                      <td key={`incoming-${field.key}`}>{getPreviewCompareValue(incomingRecord, field)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td><strong>Matched</strong></td>
                    {compareFields.map((field) => (
                      <td key={`matched-${field.key}`}>{getPreviewCompareValue(matchedRecord, field)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="th-mini-block">
            <strong>Why this was flagged</strong>
            <p className="th-helper" style={{ padding: 0, marginTop: 8 }}>
              {candidateEvidence.length > 0
                ? candidateEvidence.join(' · ')
                : 'Matched on same donor + amount + close date.'}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

function buildMatchedPersonCompareRecord(person: CanonicalPerson | null) {
  if (!person) return null;
  return {
    id: `db:${person.id}`,
    sourceRowRef: `db:${person.id}`,
    firstName: person.firstName,
    lastName: person.lastName,
    organizationName: '',
    householdName: '',
    constituentType: 'Existing person',
    email: person.email,
    phone: person.phone,
    address: person.addressLine1,
    city: person.city,
    state: person.state,
    postalCode: person.zip,
    country: '',
    assignedStaff: '',
    date: '',
    amount: '',
    fund: '',
    appeal: '',
    memo: '',
    donorName: [person.firstName, person.lastName].filter(Boolean).join(' ').trim(),
    displayName: [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || person.id,
    preview: [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || person.id,
    values: {},
  } as unknown as PreviewRecord;
}

export default function TransformHubPage() {
  const [platform, setPlatform] = useState<SourcePlatform>('AppFolio');
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [schema, setSchema] = useState<ResolvedSchema | null>(null);
  const [rows, setRows] = useState<CanonicalLedgerRow[]>([]);
  const [receipts, setReceipts] = useState<PostingReceipt[]>([]);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [guardrails, setGuardrails] = useState<GuardrailFinding[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<TransformSessionStatus>('review');
  const [sessionUpdatedAt, setSessionUpdatedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('Upload CSV or XLSX to start the backend-backed pipeline.');
  const [fallbackFileName, setFallbackFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeUploadLabel, setActiveUploadLabel] = useState<string | null>(null);
  const isUploadLoading = isLoading && activeUploadLabel !== null;
  const [blockingIssues, setBlockingIssues] = useState<BlockingIssue[]>([]);
  const [pendingIngestPayload, setPendingIngestPayload] = useState<UploadPayload | null>(null);
  const [isResolvingPendingMerge, setIsResolvingPendingMerge] = useState(false);
  const [pendingWorkbookSheetReview, setPendingWorkbookSheetReview] = useState<PendingWorkbookSheetReview | null>(null);

  // Layer 03 state
  const [personResult, setPersonResult] = useState<PersonResolverResult | null>(null);
  const [householdResult, setHouseholdResult] = useState<HouseholdResolverResult | null>(null);
  // merge decisions: map of inputRef → 'confirmed' | 'separated'
  const [mergeDecisions, setMergeDecisions] = useState<Map<string, 'confirmed' | 'separated'>>(new Map());
  const [isRunningPersonResolver, setIsRunningPersonResolver] = useState(false);
  const [isRunningHouseholdResolver, setIsRunningHouseholdResolver] = useState(false);
  const [isResettingPeople, setIsResettingPeople] = useState(false);

  // Layer 04 state
  const [taxonomyResult, setTaxonomyResult] = useState<TaxonomyGovernanceResult | null>(null);
  const [taxonomyState, setTaxonomyState] = useState<SessionTaxonomyState | null>(null);
  const [registry, setRegistry] = useState<TaxonomyCode[]>([]);
  const [legacyMap, setLegacyMap] = useState<LegacyMapping[]>([]);
  const [, setCoa] = useState<Array<{ id: string; code: string; name: string }>>([]);

  // Layer 08 state
  const [auditResult, setAuditResult] = useState<AuditRuleResult | null>(null);
  const [entityModelResult, setEntityModelResult] = useState<EntityModelResult | null>(null);
  const [auditCatalog, setAuditCatalog] = useState<AuditRuleCatalogEntry[]>([]);
  const [auditEngineVersion, setAuditEngineVersion] = useState<string | null>(null);
  const [rowSpotlight, setRowSpotlight] = useState<'all' | 'donor-review' | 'identity-review' | 'mapping-review'>('all');
  const [activeOperatorIntent, setActiveOperatorIntent] = useState<'run-audit' | 'review-donors' | 'resolve-identities' | 'open-mapping' | null>(null);
  const [pendingReturnRowId, setPendingReturnRowId] = useState<string | null>(null);
  const [expandedPeopleReviewRef, setExpandedPeopleReviewRef] = useState<string | null>(null);
  const [previewSourceFocus, setPreviewSourceFocus] = useState<string>('all');
  const [hiddenPreviewHeaders, setHiddenPreviewHeaders] = useState<string[]>([]);
  const [editingMergedRecordRef, setEditingMergedRecordRef] = useState<string | null>(null);
  const [editingMergedDraft, setEditingMergedDraft] = useState<Record<string, string>>({});
  const [debugPreviewRowRef, setDebugPreviewRowRef] = useState<string | null>(null);
  const [peopleReviewFilter, setPeopleReviewFilter] = useState<PeopleReviewFilter>('pending');
  const [nonLedgerReviewPanel, setNonLedgerReviewPanel] = useState<NonLedgerReviewPanel>('duplicate');
  const [householdReviewTab, setHouseholdReviewTab] = useState<HouseholdReviewTab>('needs_attribution');
  const [selectedAttributionGroupKey, setSelectedAttributionGroupKey] = useState<string | null>(null);
  const [matchingTableView, setMatchingTableView] = useState<MatchingTableView>('raw');
  const [expandedHouseholdReviewId, setExpandedHouseholdReviewId] = useState<string | null>(null);
  const [pendingHouseholdMemberRemovalKey, setPendingHouseholdMemberRemovalKey] = useState<string | null>(null);
  const [removedPersonIdsByHousehold, setRemovedPersonIdsByHousehold] = useState<Record<string, string[]>>({});
  const [embeddedHouseholdDrafts, setEmbeddedHouseholdDrafts] = useState<Record<string, Record<string, PreviewAttributionDraft>>>({});
  const [, setExpandedFinalHouseholdId] = useState<string | null>(null);
  const [selectedOutcomeCardId, setSelectedOutcomeCardId] = useState<ReviewOutcomeId>('revenue_at_risk');
  const [analyticsWorkspace, setAnalyticsWorkspace] = useState<AnalyticsWorkspaceState>(buildDefaultAnalyticsWorkspace());
  const [analyticsSavedViewDraft, setAnalyticsSavedViewDraft] = useState('');
  const [reviewAnalyticsData, setReviewAnalyticsData] = useState<{ generatedAt: string; cards: ReviewOutcomeCard[]; items: AnalyticsWorkspaceItem[]; suggestedViews: Array<{ id: string; name: string; outcomeId: string; detailId: string }>; provenance?: { layer: string; source: string; actionCount: number; reproducible: boolean } } | null>(null);
  const [isGeneratingReviewAnalytics, setIsGeneratingReviewAnalytics] = useState(false);
  const [expandedAnalyticsItemId, setExpandedAnalyticsItemId] = useState<string | null>(null);
  const [taxonomyScanColumnsExpanded, setTaxonomyScanColumnsExpanded] = useState(false);
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const [showIdentityHub, setShowIdentityHub] = useState(false);
  const [showAppliedDecisions, setShowAppliedDecisions] = useState(false);
  const [expandedRootCauses, setExpandedRootCauses] = useState<Set<string>>(new Set());
  const reviewQueueSummary = useReviewQueueSummary();
  const [sessionStructure, setSessionStructure] = useState<TransformSession['structure'] | null>(null);
  const [pendingTaxonomyMergeCandidateId, setPendingTaxonomyMergeCandidateId] = useState<string | null>(null);
  const [pendingTaxonomyMergeLabel, setPendingTaxonomyMergeLabel] = useState('');
  const [editingResolvedTaxonomyGroupId, setEditingResolvedTaxonomyGroupId] = useState<string | null>(null);
  const [editingResolvedTaxonomyLabel, setEditingResolvedTaxonomyLabel] = useState('');
  const [nonLedgerColumnWidths, setNonLedgerColumnWidths] = useState<Record<string, number>>({ __source__: 172 });
  const [previewColumnFilters, setPreviewColumnFilters] = useState<PreviewColumnFilters>({});
  const [isRunningTaxonomyReview, setIsRunningTaxonomyReview] = useState(false);
  const [selectedPreviewHeader, setSelectedPreviewHeader] = useState<string | null>(null);
  const [selectedPreviewRowRef, setSelectedPreviewRowRef] = useState<string | null>(null);
  const [selectedPreviewHeaders, setSelectedPreviewHeaders] = useState<string[]>([]);
  const [selectedPreviewRowRefs, setSelectedPreviewRowRefs] = useState<string[]>([]);
  const [activePreviewCell, setActivePreviewCell] = useState<PreviewCellRef | null>(null);
  const [editingPreviewCell, setEditingPreviewCell] = useState<PreviewCellRef | null>(null);
  const [editingPreviewCellDraft, setEditingPreviewCellDraft] = useState('');
  const [editingPreviewHeader, setEditingPreviewHeader] = useState<string | null>(null);
  const [editingPreviewHeaderDraft, setEditingPreviewHeaderDraft] = useState('');
  const [previewTableContextMenu, setPreviewTableContextMenu] = useState<PreviewTableContextMenu | null>(null);
  const [draggingPreviewRowRef, setDraggingPreviewRowRef] = useState<string | null>(null);
  const [previewRowDropTarget, setPreviewRowDropTarget] = useState<PreviewRowDropTarget | null>(null);
  const [draggingPreviewHeader, setDraggingPreviewHeader] = useState<string | null>(null);
  const [previewHeaderDropTarget, setPreviewHeaderDropTarget] = useState<string | null>(null);
  const [activePreviewFilterColumn, setActivePreviewFilterColumn] = useState<string | null>(null);
  const [finalHouseholdDrafts, setFinalHouseholdDrafts] = useState<Record<string, FinalHouseholdDraft>>({});
  const [finalAttributionDrafts, setFinalAttributionDrafts] = useState<FinalAttributionDraftMap>({});
  const [isRefreshingEntityModel, setIsRefreshingEntityModel] = useState(false);
  const [entityGraphView, setEntityGraphView] = useState<EntityGraphView>('donations');
  const [entityGraphSearch, setEntityGraphSearch] = useState('');
  const [entityGraphSelection, setEntityGraphSelection] = useState<EntityGraphSelection | null>(null);
  const [organizationGraphDrafts, setOrganizationGraphDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchAuditRuleCatalog(), fetchChartOfAccounts(), fetchTaxonomy()])
      .then(([catalog, nextCoa, taxonomy]) => {
        if (cancelled) return;
        setAuditCatalog(catalog.ruleCatalog);
        setAuditEngineVersion(catalog.engineVersion);
        setCoa(nextCoa);
        setRegistry(taxonomy.registry);
        setLegacyMap(taxonomy.legacyMappings);
      })
      .catch(() => {
        if (cancelled) return;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const readyRows = rows.filter((row) => row.review_status === 'approved').length;
  const reviewRows = rows.filter((row) => row.review_status === 'pending').length;
  const rejectedRows = rows.filter((row) => row.review_status === 'rejected').length;
  const effectiveReviewQueueSummary = sessionStructure?.reviewBuckets
    ? {
        pendingCount: sessionStructure.reviewBuckets.needsReview,
        highConfidenceCount: sessionStructure.reviewBuckets.highConfidence,
        driftAlertCount: (sessionStructure.decisionLog ?? []).filter((entry) => entry.decisionType === 'guardrail').length,
      }
    : reviewQueueSummary;
  const structureAnalysis = parsedFile?.structureAnalysis ?? null;
  const isCrmPlatform = CRM_PLATFORMS.has(platform);
  const activeRows = rows.filter((row) => row.review_status !== 'rejected');
  const highConfidenceRows = rows.filter((row) => row.mapping_confidence >= 0.85).length;
  const rowsWithCanonicalDestination = rows.filter((row) => Boolean(row.account_code || row.journal_id)).length;
  const visibleRows = rows.filter((row) => {
    if (rowSpotlight === 'donor-review') return row.needs_review;
    if (rowSpotlight === 'identity-review') return row.needs_review && !row.canonical_person_id;
    if (rowSpotlight === 'mapping-review') return Boolean(row.taxonomy_exception_id || row.raw_fund || row.raw_appeal);
    return true;
  });
  const activeFixRowId = rowSpotlight === 'all' ? null : visibleRows[0]?.id ?? null;
  const preview = parsedFile?.preview ?? null;
  const pendingColumnMerges = getPendingColumnMerges(parsedFile);
  const pendingColumnMergeSourceFiles = Array.from(new Set(pendingColumnMerges.map((merge) => merge.sourceFile).filter(Boolean)));
  const hasPendingColumnMergeReview = pendingColumnMerges.length > 0;
  const previewBaseRecords = useMemo<PreviewRecord[]>(
    () => (preview?.records as PreviewRecord[] | undefined) ?? [],
    [preview?.records],
  );
  const uploadedPreviewFileClasses = useMemo(
    () => new Set(
      previewBaseRecords
        .map((record) => record.sourceFileClass ?? record.source_file_class ?? null)
        .filter((value): value is FileClass => Boolean(value)),
    ),
    [previewBaseRecords],
  );
  const hasTransactionSourceRecords = uploadedPreviewFileClasses.has('donor') || uploadedPreviewFileClasses.has('ledger');
  const hasTransactionLinkFlow = hasTransactionSourceRecords
    && Array.from(uploadedPreviewFileClasses).some((value) => value !== 'donor' && value !== 'ledger');
  const fileClass = hasTransactionLinkFlow
    ? (uploadedPreviewFileClasses.has('ledger') ? 'ledger' : 'donor')
    : (schema?.fileClass ?? preview?.fileClass ?? 'ledger');
  const isLedgerFile = fileClass === 'ledger';
  const reviewTableActive = true;
  const duplicateReviewActive = nonLedgerReviewPanel === 'duplicate';
  const matchingReviewActive = nonLedgerReviewPanel === 'matching';
  const householdReviewActive = nonLedgerReviewPanel === 'household';
  const previewRecords = useMemo<PreviewRecord[]>(
    () => (!isLedgerFile
      ? applyTaxonomyGroupsToPreviewRecords(previewBaseRecords, taxonomyState, schema) as PreviewRecord[]
      : previewBaseRecords),
    [isLedgerFile, previewBaseRecords, taxonomyState, schema],
  );
  const taxonomySummary = summarizeTaxonomyState(taxonomyState);
  const previewCount = preview?.summary.rowCount ?? parsedFile?.rows.length ?? 0;
  const isDonorFile = fileClass === "donor";
  const isConstituentFile = fileClass === 'constituent';
  const supportsDuplicateWorkflow = !isLedgerFile;
  const primaryMergeStepLabel = 'Duplicate Detection';
  const primaryMergeStepDescription = isDonorFile
    ? 'Layer 2 finds exact, likely, possible, and no-match donor candidate groups without consolidating rows yet.'
    : 'Layer 2 finds exact, likely, possible, and no-match profile candidate groups without consolidating rows yet.';
  const matchingStepLabel = 'Record Consolidation';
  const matchingStepDescription = hasTransactionLinkFlow
    ? 'Layer 3 only consolidates rows after duplicate candidates are scored. Raw rows stay visible until you confirm merge behavior.'
    : 'Layer 3 turns approved duplicate candidates into canonical people or donors. Unapproved rows stay separate.';
  const householdCleanupStepLabel = 'Household Cleanup';
  const householdCleanupStepDescription = isDonorFile
    ? 'Review household grouping, attribution, and salutations after the merge tables are built.'
    : 'Review household grouping and communication rules after the relationship layer is built.';
  const taxonomyCleanupStepLabel = 'Taxonomy Cleanup';
  const taxonomyCleanupStepDescription = 'Review possible same fund, appeal, and campaign labels before export.';
  const txCleanupStepLabel = 'Check Transaction Duplicates';
  const txCleanupStepDescription = 'Review likely duplicate transactions (same donor, same amount, close dates) before export.';
  const householdStepNumber = hasTransactionLinkFlow ? 3 : 2;
  const taxonomyStepNumber = hasTransactionLinkFlow ? 4 : 3;
  const txCleanupStepNumber = hasTransactionLinkFlow ? 5 : 4;
  const analyticsStepNumber = hasTransactionLinkFlow ? 6 : (isDonorFile ? 5 : 4);
  const reviewTableLabel = 'Review Table';
  const reviewTableDescription = hasTransactionLinkFlow
    ? 'This review table is transaction-anchored full outer style: all tx rows remain, matched profile fields are attached, and unmatched profile records appear as separate rows.'
    : isDonorFile
      ? 'This is the operator-facing review table. Raw transactions remain visible while matched people, households, and attribution decisions stay editable in one place.'
    : 'This is the final review table after profile cleanup and record linking.';
  const analyticsStepLabel = 'Analytics Review';
  const analyticsStepDescription = 'Review post-cleanup metrics, exceptions, and outcome summaries before export.';
  const duplicateQueueLabel = 'Duplicate candidate queue';
  const duplicateRunLabel = 'Run duplicate detection';
  const duplicateRerunLabel = 'Rerun duplicate detection';
  const duplicateRunningLabel = 'Running duplicate detection…';
  const duplicateResetLabel = 'Reset duplicate detection';
  const duplicateResettingLabel = 'Resetting duplicate detection…';
  const confirmMergeLabel = 'Consolidate records';
  const keepSeparateLabel = isDonorFile ? 'Keep separate' : isConstituentFile ? 'Keep separate' : 'Keep separate';
  const mergeAllLabel = 'Consolidate all shown';
  const supportsHouseholdWorkflow = !isLedgerFile;
  const canonicalPeople = useMemo(() => personResult?.persons ?? [], [personResult?.persons]);
  const previewCompareFields = useMemo(() => {
    if (!supportsDuplicateWorkflow || !duplicateReviewActive) return [];
    const headers = parsedFile?.headers ?? [];
    const fieldMap = schema?.fieldMap as Record<string, string> | null | undefined;
    if (isDonorFile) return getTxDuplicateCompareFields(headers, fieldMap);
    return getPreviewCompareFields(headers);
  }, [supportsDuplicateWorkflow, duplicateReviewActive, isDonorFile, parsedFile?.headers, schema?.fieldMap]);
  useEffect(() => {
    if (isLedgerFile || !parsedFile?.preview) {
      setTaxonomyState((current) => (current ? null : current));
    }
  }, [isLedgerFile, parsedFile]);

  // txDuplicateResult is returned by the backend when baselineFileClass='donor' and matchMode=combined.
  const txDuplicateResult = (personResult as any)?.txDuplicateResult as PersonResolverResult | null | undefined;
  const txCompareFields = useMemo(() => {
    const headers = parsedFile?.headers ?? [];
    const fieldMap = schema?.fieldMap as Record<string, string> | null | undefined;
    return getTxDuplicateCompareFields(headers, fieldMap);
  }, [parsedFile?.headers, schema?.fieldMap]);
  const txReviewMatches = useMemo(
    () => (txDuplicateResult?.matches ?? []).filter(
      (match) => match.band !== 'separate' && previewRecords.some((r) => r.sourceRowRef === match.inputRef),
    ),
    [txDuplicateResult?.matches, previewRecords],
  );
  const [txMergeDecisions, setTxMergeDecisions] = useState<Map<string, 'confirmed' | 'separated'>>(new Map());
  const [expandedTxReviewRef, setExpandedTxReviewRef] = useState<string | null>(null);

  const ledgerReviewMatches = (personResult?.matches ?? []).filter((match) => {
    const matchedRowRef = match.reviewPayload?.matchedInputRef ?? null;
    return matchedRowRef ? rows.some((row) => row.source_row_ref === matchedRowRef) : false;
  });
  const previewReviewMatches = useMemo(
    () => {
      if (!duplicateReviewActive && !householdReviewActive) return [];
      return (personResult?.matches ?? []).filter((match) => {
        return previewRecords.some((record) => record.sourceRowRef === match.inputRef);
      });
    },
    [duplicateReviewActive, householdReviewActive, personResult?.matches, previewRecords],
  );
  const filteredLedgerReviewMatches = ledgerReviewMatches.filter((match) => matchesPeopleReviewFilter(peopleReviewFilter, match, mergeDecisions));
  const filteredPreviewReviewMatches = useMemo(
    () => previewReviewMatches.filter((match) => matchesPeopleReviewFilter(peopleReviewFilter, match, mergeDecisions)),
    [previewReviewMatches, peopleReviewFilter, mergeDecisions],
  );
  useEffect(() => {
    if (!supportsDuplicateWorkflow || !duplicateReviewActive) return;
    const livePreviewReviewCounts = countPeopleReviewBuckets(previewReviewMatches, mergeDecisions);
    const matchBandCounts = (personResult?.matches ?? []).reduce<Record<string, number>>((counts, match) => {
      counts[match.band] = (counts[match.band] ?? 0) + 1;
      return counts;
    }, {});
    const matchDecisionCounts = (personResult?.matches ?? []).reduce<Record<string, number>>((counts, match) => {
      counts[match.decision] = (counts[match.decision] ?? 0) + 1;
      return counts;
    }, {});
  }, [supportsDuplicateWorkflow, duplicateReviewActive, sessionId, personResult?.matches, previewReviewMatches, filteredPreviewReviewMatches, mergeDecisions]);
  const ledgerReviewCounts = countPeopleReviewBuckets(ledgerReviewMatches, mergeDecisions);
  const previewReviewCounts = useMemo(
    () => countPeopleReviewBuckets(previewReviewMatches, mergeDecisions),
    [previewReviewMatches, mergeDecisions],
  );
  const mergeableLedgerReviewMatches = filteredLedgerReviewMatches.filter((match) => isPendingDuplicateReview(match, mergeDecisions));
  const mergeablePreviewReviewMatches = filteredPreviewReviewMatches.filter((match) => isPendingDuplicateReview(match, mergeDecisions));
  // Donor files: group matches by unique donor pair (same input name + same matchedPersonId) so each pair shows ONE card
  const groupedFilteredPreviewReviewMatches = useMemo(() => {
    if (!isDonorFile) {
      return filteredPreviewReviewMatches.map((m) => ({ key: m.inputRef, representative: m, allMatches: [m] as PersonMatch[] }));
    }
    const groups = new Map<string, { key: string; representative: PersonMatch; allMatches: PersonMatch[] }>();
    for (const match of filteredPreviewReviewMatches) {
      const inputName = (match.reviewPayload?.input?.name ?? '').trim().toLowerCase();
      // Group by input name + candidate display name so that rows matched to the same
      // person (even via different canonical person IDs) collapse into one card
      const candidate = match.reviewPayload?.candidate;
      const candidateName = candidate
        ? `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim().toLowerCase()
        : (match.matchedPersonId ?? '');
      const groupKey = `${inputName}|${candidateName}`;
      const existing = groups.get(groupKey);
      if (existing) {
        existing.allMatches.push(match);
      } else {
        groups.set(groupKey, { key: groupKey, representative: match, allMatches: [match] });
      }
    }
    return Array.from(groups.values());
  }, [isDonorFile, filteredPreviewReviewMatches]);
  const mergeablePreviewGroupCount = groupedFilteredPreviewReviewMatches.filter(
    ({ representative }) => isPendingDuplicateReview(representative, mergeDecisions),
  ).length;
  const pendingPeopleReviews = personResult?.matches.filter((match) => isPendingDuplicateReview(match, mergeDecisions)).length ?? 0;
  const duplicateClassCounts = getDuplicateClassCounts(personResult);
  useEffect(() => {
    if (!supportsDuplicateWorkflow || !personResult || typeof window === 'undefined') return;
    console.groupCollapsed('[TransformHub debug] Duplicate review hydration');
    console.debug('personResultSummary', {
      personCount: personResult.persons?.length ?? 0,
      matchCount: personResult.matches?.length ?? 0,
      pendingPeopleReviews,
      previewReviewMatchCount: previewReviewMatches.length,
      filteredPreviewReviewMatchCount: filteredPreviewReviewMatches.length,
      duplicateClassCounts,
      txDuplicateMatchCount: (txDuplicateResult?.matches ?? []).length,
    });
    console.debug('previewReviewSample', previewReviewMatches.slice(0, 5).map((match) => ({
      inputRef: match.inputRef,
      matchedPersonId: match.matchedPersonId ?? null,
      band: match.band,
      decision: deriveReviewDecision(match, mergeDecisions) ?? null,
      duplicateClass: match.duplicateClass ?? null,
      matchedInputRef: match.reviewPayload?.matchedInputRef ?? null,
    })));
    console.groupEnd();
  }, [
    duplicateClassCounts,
    filteredPreviewReviewMatches.length,
    mergeDecisions,
    pendingPeopleReviews,
    personResult,
    previewReviewMatches,
    supportsDuplicateWorkflow,
    txDuplicateResult?.matches,
  ]);
  const peopleStepReady = !supportsDuplicateWorkflow || (!!personResult && pendingPeopleReviews === 0);
  const householdsStepReady = !supportsHouseholdWorkflow || (!!householdResult && peopleStepReady);
  const nonLedgerExportReady = (!supportsDuplicateWorkflow || peopleStepReady) && (!supportsHouseholdWorkflow || householdsStepReady);
  const peopleById = useMemo(
    () => new Map(canonicalPeople.map((person) => [person.id, person])),
    [canonicalPeople],
  );
  const collapseResolvedPersonIds = useCallback((personIds: string[]) => (
    Array.from(
      personIds.reduce((unique, personId) => {
        const person = peopleById.get(personId);
        const key = buildHouseholdMemberDisplayKey(person ?? { id: personId, firstName: '', lastName: '', email: '' });
        if (!key || unique.has(key)) return unique;
        unique.set(key, personId);
        return unique;
      }, new Map<string, string>()),
    ).map(([, personId]) => personId)
  ), [peopleById]);
  const previewMatchByInputRef = useMemo(
    () => new Map((personResult?.matches ?? []).map((match) => [
      match.inputRef,
      { ...match, matchedPersonId: getResolvedPersonAssignment(match, mergeDecisions) },
    ])),
    [personResult?.matches, mergeDecisions],
  );
  useTransformHubReviewDrafts({
    householdResult,
    peopleById,
    previewRecords,
    previewMatchByInputRef,
    buildInitialHouseholdDraft,
    buildInitialAttributionDraft,
    setFinalHouseholdDrafts,
    setFinalAttributionDrafts,
    setOrganizationGraphDrafts,
  });
  const householdIdByPersonId = useMemo(() => {
    const next = new Map<string, string>();
    (householdResult?.households ?? []).forEach((household) => {
      household.memberIds.forEach((memberId) => next.set(memberId, household.id));
    });
    return next;
  }, [householdResult]);
  const previewMergeView = useMemo(() => {
    const txAnchoredPreviewRecords = hasTransactionLinkFlow
      ? previewRecords.filter((record) => {
          const sourceFileClass = record.sourceFileClass ?? record.source_file_class ?? null;
          return sourceFileClass === 'donor' || sourceFileClass === 'ledger' || Boolean((record as Record<string, unknown>)['link_profile_only']);
        })
      : previewRecords;
    return {
      representativeByAbsorbedRef: new Map<string, string>(),
      mergedSourceRefsByRepresentative: new Map<string, string[]>(),
      displayedPreviewRecords: txAnchoredPreviewRecords,
    };
  }, [hasTransactionLinkFlow, previewRecords]);
  const representativeByAbsorbedRef = previewMergeView.representativeByAbsorbedRef;
  const mergedSourceRefsByRepresentative = previewMergeView.mergedSourceRefsByRepresentative;
  const displayedPreviewRecords = previewMergeView.displayedPreviewRecords;
  const reviewedPreviewRecords = useMemo(
    () => (supportsDuplicateWorkflow ? displayedPreviewRecords : previewRecords),
    [supportsDuplicateWorkflow, displayedPreviewRecords, previewRecords],
  );
  const donorHealthCards = useMemo<DonorHealthCard[]>(() => {
    if (fileClass !== 'donor') return [];

    const yearly = new Map<number, {
      donorKeys: Set<string>;
      recurringKeys: Set<string>;
      revenue: number;
      smallDollarKeys: Set<string>;
      donorRevenue: Map<string, number>;
      recurringRevenue: number;
    }>();

    reviewedPreviewRecords.forEach((record) => {
      const key = normalizeRecordIdentity(record);
      const amount = parseCurrencyAmount(record.amount) ?? 0;
      const date = record.date ? new Date(String(record.date)) : null;
      if (!date || Number.isNaN(date.getTime()) || amount <= 0) return;
      const year = date.getFullYear();
      const bucket = yearly.get(year) ?? {
        donorKeys: new Set<string>(),
        recurringKeys: new Set<string>(),
        revenue: 0,
        smallDollarKeys: new Set<string>(),
        donorRevenue: new Map<string, number>(),
        recurringRevenue: 0,
      };
      const recurring = String(record.recurring ?? record.frequency ?? record.type ?? '').toLowerCase();
      const isRecurring = recurring.includes('true') || recurring.includes('monthly') || recurring.includes('quarterly') || recurring.includes('yearly');
      bucket.donorKeys.add(key);
      bucket.revenue += amount;
      bucket.donorRevenue.set(key, (bucket.donorRevenue.get(key) ?? 0) + amount);
      if (isRecurring) {
        bucket.recurringKeys.add(key);
        bucket.recurringRevenue += amount;
      }
      yearly.set(year, bucket);
    });

    yearly.forEach((bucket) => {
      bucket.donorRevenue.forEach((total, key) => {
        if (total >= 1 && total <= 100) bucket.smallDollarKeys.add(key);
      });
    });

    const years = Array.from(yearly.keys()).sort((left, right) => left - right);
    const latestYear = years[years.length - 1] ?? null;
    const previousYear = years.length > 1 ? years[years.length - 2] : null;
    const latest = latestYear != null ? yearly.get(latestYear) ?? null : null;
    const previous = previousYear != null ? yearly.get(previousYear) ?? null : null;

    const overlapRate = (current: Set<string> | undefined, prior: Set<string> | undefined) => {
      if (!current || !prior || prior.size === 0) return null;
      let retained = 0;
      prior.forEach((key) => {
        if (current.has(key)) retained += 1;
      });
      return (retained / prior.size) * 100;
    };

    const donorRetention = overlapRate(latest?.donorKeys, previous?.donorKeys);
    const recurringRetention = overlapRate(latest?.recurringKeys, previous?.recurringKeys);
    const donorCountChange = latest && previous && previous.donorKeys.size > 0
      ? ((latest.donorKeys.size - previous.donorKeys.size) / previous.donorKeys.size) * 100
      : null;
    const revenueChange = latest && previous && previous.revenue > 0
      ? ((latest.revenue - previous.revenue) / previous.revenue) * 100
      : null;
    const smallDollarShare = latest && latest.donorKeys.size > 0 ? (latest.smallDollarKeys.size / latest.donorKeys.size) * 100 : null;
    const smallDollarChange = latest && previous && previous.smallDollarKeys.size > 0
      ? ((latest.smallDollarKeys.size - previous.smallDollarKeys.size) / previous.smallDollarKeys.size) * 100
      : null;
    const recurringRevenueShare = latest && latest.revenue > 0 ? (latest.recurringRevenue / latest.revenue) * 100 : null;

    const concentrationShare = (() => {
      if (!latest || latest.revenue <= 0 || latest.donorRevenue.size === 0) return null;
      const totals = Array.from(latest.donorRevenue.values()).sort((left, right) => right - left);
      const topCount = Math.max(1, Math.ceil(totals.length * 0.1));
      const topRevenue = totals.slice(0, topCount).reduce((sum, value) => sum + value, 0);
      return (topRevenue / latest.revenue) * 100;
    })();

    const fundDependency = (() => {
      if (latestYear == null) return null;
      const fundTotals = new Map<string, number>();
      reviewedPreviewRecords.forEach((record) => {
        const amount = parseCurrencyAmount(record.amount) ?? 0;
        const date = record.date ? new Date(String(record.date)) : null;
        if (!date || Number.isNaN(date.getTime()) || date.getFullYear() !== latestYear || amount <= 0) return;
        const fund = String(record.fund || record.appeal || record.campaignName || 'Unassigned').trim() || 'Unassigned';
        fundTotals.set(fund, (fundTotals.get(fund) ?? 0) + amount);
      });
      if (fundTotals.size === 0 || !latest || latest.revenue <= 0) return null;
      const ranked = Array.from(fundTotals.entries()).sort((left, right) => right[1] - left[1]);
      const [topFundName, topFundAmount] = ranked[0];
      const nextFundAmount = ranked[1]?.[1] ?? 0;
      return {
        topFundName,
        topFundShare: (topFundAmount / latest.revenue) * 100,
        nextFundShare: nextFundAmount > 0 ? (nextFundAmount / latest.revenue) * 100 : 0,
      };
    })();

    const bars = years.slice(-4).map((year) => {
      const bucket = yearly.get(year);
      return {
        label: String(year),
        value: bucket?.revenue ?? 0,
      };
    });

    return [
      {
        id: 'retention',
        title: 'Donor retention',
        metric: formatPercent(donorRetention),
        valueLabel: latestYear && previousYear ? `${previousYear} to ${latestYear}` : 'Insufficient history',
        secondaryLabel: recurringRetention != null ? `Recurring ${formatPercent(recurringRetention)}` : undefined,
        note: donorRetention != null ? 'Share of prior-year donors who also gave again in the latest year.' : 'Need at least two years of giving history to calculate retention.',
        trend: donorRetention != null ? (donorRetention >= 50 ? 'up' : 'down') : undefined,
      },
      {
        id: 'count_vs_revenue',
        title: 'Donor count vs revenue',
        metric: donorCountChange != null ? `${formatDeltaLabel(donorCountChange)} donors` : 'Insufficient history',
        valueLabel: revenueChange != null ? `${formatDeltaLabel(revenueChange)} revenue` : 'Need two years',
        note: 'Shows whether revenue is growing faster than donor count in the cleaned donor layer.',
        trend: donorCountChange != null && revenueChange != null
          ? (donorCountChange < 0 && revenueChange > 0 ? 'up' : donorCountChange > 0 && revenueChange > 0 ? 'flat' : 'down')
          : undefined,
        bars,
      },
      {
        id: 'small_dollar',
        title: 'Small-dollar donors',
        metric: smallDollarShare != null ? `${formatPercent(smallDollarShare)} of donors` : 'Insufficient history',
        valueLabel: smallDollarChange != null ? formatDeltaLabel(smallDollarChange) : 'Need two years',
        note: 'Donors whose total giving in the latest year lands between $1 and $100.',
        trend: smallDollarChange != null ? (smallDollarChange >= 0 ? 'up' : 'down') : undefined,
      },
      {
        id: 'recurring_share',
        title: 'Recurring revenue share',
        metric: recurringRevenueShare != null ? formatPercent(recurringRevenueShare) : 'Insufficient history',
        valueLabel: latestYear != null ? `Latest year ${latestYear}` : 'No annual history',
        secondaryLabel: recurringRetention != null ? `Retention ${formatPercent(recurringRetention)}` : undefined,
        note: 'Based on transactions explicitly marked recurring by the source data.',
        trend: recurringRevenueShare != null ? (recurringRevenueShare >= 25 ? 'up' : 'flat') : undefined,
      },
      {
        id: 'donor_concentration',
        title: 'Donor concentration',
        metric: concentrationShare != null ? `${formatPercent(concentrationShare)} from top 10%` : 'Insufficient history',
        valueLabel: latestYear != null ? `Latest year ${latestYear}` : 'No annual history',
        note: 'Measures how much of the latest-year revenue comes from the top decile of donors.',
        trend: concentrationShare != null ? (concentrationShare >= 50 ? 'down' : 'flat') : undefined,
      },
      {
        id: 'fund_dependency',
        title: 'Fund dependency',
        metric: fundDependency != null ? `${fundDependency.topFundName} ${formatPercent(fundDependency.topFundShare)}` : 'Insufficient history',
        valueLabel: fundDependency != null ? `Next largest ${formatPercent(fundDependency.nextFundShare)}` : 'No annual history',
        note: fundDependency != null
          ? `If ${fundDependency.topFundName} underperforms, the latest-year revenue base is exposed.`
          : 'Need latest-year fund totals to assess dependency risk.',
        trend: fundDependency != null ? (fundDependency.topFundShare >= 50 ? 'down' : 'flat') : undefined,
      },
    ];
  }, [fileClass, reviewedPreviewRecords]);
  const getPreviewRecordClusterRefs = useCallback((sourceRowRef: string) => {
    const representativeRef = representativeByAbsorbedRef.get(sourceRowRef) ?? sourceRowRef;
    return [representativeRef, ...(mergedSourceRefsByRepresentative.get(representativeRef) ?? [])];
  }, [mergedSourceRefsByRepresentative, representativeByAbsorbedRef]);
  const getResolvedPreviewPersonIds = useCallback((sourceRowRef: string) => (
    Array.from(new Set(
      getPreviewRecordClusterRefs(sourceRowRef)
        .map((ref) => getResolvedPersonAssignment(previewMatchByInputRef.get(ref), mergeDecisions))
        .filter((personId): personId is string => Boolean(personId)),
    ))
  ), [getPreviewRecordClusterRefs, previewMatchByInputRef, mergeDecisions]);
  const getResolvedPreviewDistinctPersonIds = useCallback((sourceRowRef: string) => (
    collapseResolvedPersonIds(getResolvedPreviewPersonIds(sourceRowRef))
  ), [collapseResolvedPersonIds, getResolvedPreviewPersonIds]);
  const getResolvedPreviewHouseholdIds = useCallback((sourceRowRef: string) => (
    Array.from(new Set(
      getResolvedPreviewDistinctPersonIds(sourceRowRef)
        .map((personId) => householdIdByPersonId.get(personId) ?? null)
        .filter((householdId): householdId is string => Boolean(householdId)),
    ))
  ), [getResolvedPreviewDistinctPersonIds, householdIdByPersonId]);
  const ambiguousAttributionGroups = useMemo(() => {
    const forcedAmbiguousKeys = new Set<string>();
    const groups = new Map<string, PreviewRecord[]>();
    displayedPreviewRecords.forEach((record) => {
      const householdIds = getResolvedPreviewHouseholdIds(record.sourceRowRef);
      if (householdIds.length !== 1) return;
      const householdId = householdIds[0];
      const key = `${householdId}::${getAttributionReviewKey(record)}`;
      const current = groups.get(key) ?? [];
      current.push(record);
      groups.set(key, current);
      if (getResolvedPreviewDistinctPersonIds(record.sourceRowRef).length > 1) {
        forcedAmbiguousKeys.add(key);
      }
    });
    return Array.from(groups.entries())
      .filter(([key, records]) => records.length > 1 || forcedAmbiguousKeys.has(key))
      .map(([key, records]) => {
        const householdId = key.split('::')[0] ?? '';
        const leadRecord = records[0];
        const labelDate = leadRecord && typeof leadRecord.date === 'string' ? leadRecord.date : null;
        const labelName = String(leadRecord?.fund ?? leadRecord?.campaignName ?? 'Gift');
        const labelAmount = String(leadRecord?.amount ?? '—');
        return {
          key,
          householdId,
          records,
          label: `${formatReviewDate(labelDate)} · ${labelName} · ${labelAmount}`,
        };
      });
  }, [displayedPreviewRecords, getResolvedPreviewDistinctPersonIds, getResolvedPreviewHouseholdIds]);
  const ambiguousAttributionRefs = useMemo(
    () => new Set(ambiguousAttributionGroups.flatMap((group) => group.records.map((record) => record.sourceRowRef))),
    [ambiguousAttributionGroups],
  );
  const ambiguousGroupKeyBySourceRef = useMemo(
    () => new Map(ambiguousAttributionGroups.flatMap((group) => group.records.map((record) => [record.sourceRowRef, group.key] as const))),
    [ambiguousAttributionGroups],
  );
  useEffect(() => {
    if (isLedgerFile || !householdResult) return;
  }, [
    isLedgerFile,
    householdResult,
    displayedPreviewRecords,
    ambiguousAttributionGroups,
    getResolvedPreviewPersonIds,
    getResolvedPreviewHouseholdIds,
    mergedSourceRefsByRepresentative,
  ]);
  const householdLayerViews = useTransformHubHouseholdReview({
    householdResult,
    peopleById,
    removedPersonIdsByHousehold,
    finalHouseholdDrafts,
    finalAttributionDrafts,
    previewMatchByInputRef,
    mergedSourceRefsByRepresentative,
    representativeByAbsorbedRef,
    buildInitialHouseholdDraft,
    buildInitialAttributionDraft,
    summarizeAttributionDraft,
    previewRecordLabel,
    parseCurrencyAmount,
    previewRecords,
    ambiguousAttributionRefs,
  });
  const finalReviewReady = householdsStepReady && householdLayerViews.length > 0;
  const householdLabelById = useMemo(
    () => new Map(householdLayerViews.map((view) => [view.householdId, view.draft.label])),
    [householdLayerViews],
  );
  const householdsNeedingAttribution = useMemo(
    () => new Set(householdLayerViews.filter((view) => view.status.label === 'Needs attribution').map((view) => view.householdId)),
    [householdLayerViews],
  );
  const visibleHouseholdLayerViews = useMemo(
    () => (householdReviewTab === 'needs_attribution'
      ? householdLayerViews.filter((view) => householdsNeedingAttribution.has(view.householdId))
      : householdLayerViews),
    [householdReviewTab, householdLayerViews, householdsNeedingAttribution],
  );
  const reviewOutcomeCards = useMemo<ReviewOutcomeCard[]>(() => {
    const donorRecords = fileClass === 'donor' ? reviewedPreviewRecords : [];
    const donorGroups = new Map<string, {
      label: string;
      totalAmount: number;
      latestAmount: number;
      dates: Date[];
      tags: Set<string>;
      assignedStaff: Set<string>;
      memoText: string[];
      rawCount: number;
    }>();

    donorRecords.forEach((record) => {
      const key = normalizeRecordIdentity(record);
      const current = donorGroups.get(key) ?? {
        label: String(record.donorName || record.organizationName || [record.firstName, record.lastName].filter(Boolean).join(' ') || record.sourceRowRef),
        totalAmount: 0,
        latestAmount: 0,
        dates: [],
        tags: new Set<string>(),
        assignedStaff: new Set<string>(),
        memoText: [],
        rawCount: 0,
      };
      const amount = parseCurrencyAmount(record.amount) ?? 0;
      const nextDate = record.date ? new Date(String(record.date)) : null;
      const latestTime = current.dates.reduce((max, date) => Math.max(max, date.getTime()), 0);
      if (amount > 0) {
        current.totalAmount += amount;
        if (nextDate && !Number.isNaN(nextDate.getTime()) && nextDate.getTime() >= latestTime) current.latestAmount = amount;
      }
      if (nextDate && !Number.isNaN(nextDate.getTime())) current.dates.push(nextDate);
      (Array.isArray(record.tags) ? record.tags : []).forEach((tag) => {
        const normalized = String(tag || '').trim().toLowerCase();
        if (normalized) current.tags.add(normalized);
      });
      const staff = String(record.assignedStaff || '').trim();
      if (staff) current.assignedStaff.add(staff);
      if (record.memo) current.memoText.push(String(record.memo).toLowerCase());
      current.rawCount += 1;
      donorGroups.set(key, current);
    });

    const now = new Date();
    const donorSnapshots = Array.from(donorGroups.values()).map((entry) => {
      const years = new Set(entry.dates.map((date) => date.getFullYear()));
      const latestDate = entry.dates.reduce<Date | null>((latest, date) => {
        if (!latest || date.getTime() > latest.getTime()) return date;
        return latest;
      }, null);
      const intervals = entry.dates
        .slice()
        .sort((left, right) => left.getTime() - right.getTime())
        .slice(1)
        .map((date, index, sorted) => {
          const previous = entry.dates.slice().sort((left, right) => left.getTime() - right.getTime())[index];
          return Math.round((date.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));
        });
      const recurringPattern = intervals.some((interval) => interval >= 25 && interval <= 40) || entry.rawCount >= 3;
      const matchHint = entry.memoText.some((memo) => memo.includes('match') || memo.includes('employer') || memo.includes('company'));
      const hasOwner = entry.assignedStaff.size > 0;
      return {
        ...entry,
        years,
        latestDate,
        recurringPattern,
        matchHint,
        hasOwner,
      };
    });

    const recurringDonors = donorSnapshots.filter((entry) => entry.recurringPattern);
    const lapsedDonors = donorSnapshots.filter((entry) => entry.latestDate && (now.getTime() - entry.latestDate.getTime()) > (1000 * 60 * 60 * 24 * 365));
    const missingMatchingGiftDonors = donorSnapshots.filter((entry) => entry.matchHint);
    const sortedDonorsByTotal = donorSnapshots.slice().sort((left, right) => right.totalAmount - left.totalAmount);
    const upgradeCandidates = sortedDonorsByTotal.filter((entry, index) => index < Math.max(1, Math.ceil(sortedDonorsByTotal.length * 0.2)) && entry.hasOwner);
    const unassignedMajorDonors = donorSnapshots.filter((entry) => entry.totalAmount >= 1000 && !entry.hasOwner);
    const ambiguousAmount = Array.from(ambiguousAttributionRefs).reduce((sum, sourceRowRef) => {
      const record = reviewedPreviewRecords.find((item) => item.sourceRowRef === sourceRowRef);
      return sum + (parseCurrencyAmount(record?.amount) ?? 0);
    }, 0);
    const splitMismatchAmount = displayedPreviewRecords.reduce((sum, record) => {
      const draft = finalAttributionDrafts[record.sourceRowRef] ?? getPreviewRecordAttribution(record);
      const amount = parseCurrencyAmount(record.amount) ?? 0;
      if (!draft || draft.creditAmount == null || draft.mode !== 'joint_split') return sum;
      return Math.abs(draft.creditAmount - amount) > 1 ? sum + Math.abs(draft.creditAmount - amount) : sum;
    }, 0);
    const taxonomyPendingGroups = taxonomyState?.candidateGroups.filter((group) => group.status === 'pending' && !taxonomyState.dismissedCandidateIds.includes(group.id)) ?? [];
    const taxonomyImpactedRows = new Set(
      taxonomyPendingGroups.flatMap((group) => group.members.flatMap((member) => member.sourceRowRefs ?? [])),
    );
    const taxonomyImpactPercent = reviewedPreviewRecords.length > 0 ? Math.round((taxonomyImpactedRows.size / reviewedPreviewRecords.length) * 100) : 0;

    const revenueAtRiskAmount = roundCurrencyAmount(
      recurringDonors.reduce((sum, entry) => sum + Math.max(entry.latestAmount, entry.totalAmount * 0.5), 0)
      + lapsedDonors.reduce((sum, entry) => sum + entry.latestAmount, 0),
    );
    const moneyLeakageAmount = roundCurrencyAmount(
      missingMatchingGiftDonors.reduce((sum, entry) => sum + entry.totalAmount, 0)
      + upgradeCandidates.reduce((sum, entry) => sum + (entry.totalAmount * 0.2), 0)
      + unassignedMajorDonors.reduce((sum, entry) => sum + entry.totalAmount, 0),
    );
    const financeMismatchAmount = roundCurrencyAmount(ambiguousAmount + splitMismatchAmount);
    const campaignTruthPercent = taxonomyImpactPercent;

    return [
      {
        id: 'revenue_at_risk',
        eyebrow: 'Critical · revenue at risk',
        title: `${formatOutcomeMetric('currency', revenueAtRiskAmount)} at risk of churn`,
        tone: 'risk',
        amount: revenueAtRiskAmount,
        metricKind: 'currency',
        summary: 'Recurring donors and lapsed donors surface churn risk after duplicate, household, and taxonomy review.',
        supporting: 'Estimated from the cleaned donor layer using reviewed recency, repeat-gift cadence, and attribution updates.',
        details: [
          {
            id: 'recurring_donors',
            label: 'Recurring donors',
            count: recurringDonors.length,
            amount: roundCurrencyAmount(recurringDonors.reduce((sum, entry) => sum + Math.max(entry.latestAmount, entry.totalAmount * 0.5), 0)),
            description: 'Multiple gifts suggest a recurring giving pattern.',
            ctaLabel: 'Review attribution table',
            action: 'final_table',
          },
          {
            id: 'lapsed_donors',
            label: 'Lapsed donors',
            count: lapsedDonors.length,
            amount: roundCurrencyAmount(lapsedDonors.reduce((sum, entry) => sum + entry.latestAmount, 0)),
            description: 'Last gift is over 12 months old.',
            ctaLabel: 'Open review table',
            action: 'final_table',
          },
        ],
      },
      {
        id: 'money_leakage',
        eyebrow: 'Opportunity · hidden revenue',
        title: `${formatOutcomeMetric('currency', moneyLeakageAmount)} potential upside`,
        tone: 'opportunity',
        amount: moneyLeakageAmount,
        metricKind: 'currency',
        summary: 'Matching gifts, upgrade candidates, and unassigned major donors are sitting in the file uncaptured.',
        supporting: 'Opportunity sizing is estimated from employer-match hints, donor concentration, and missing ownership.',
        details: [
          {
            id: 'missing_matching_gifts',
            label: 'Missing matching gifts',
            count: missingMatchingGiftDonors.length,
            amount: roundCurrencyAmount(missingMatchingGiftDonors.reduce((sum, entry) => sum + entry.totalAmount, 0)),
            description: 'Employer-match signals appear in the source data but are not yet worked.',
            ctaLabel: 'Open household review',
            action: 'household',
          },
          {
            id: 'upgrade_opportunities',
            label: 'Upgrade opportunities',
            count: upgradeCandidates.length,
            amount: roundCurrencyAmount(upgradeCandidates.reduce((sum, entry) => sum + (entry.totalAmount * 0.2), 0)),
            description: 'High-value donors are giving below what their file pattern suggests.',
            ctaLabel: 'Open review table',
            action: 'final_table',
          },
          {
            id: 'unassigned_major_donors',
            label: 'Unassigned major donors',
            count: unassignedMajorDonors.length,
            amount: roundCurrencyAmount(unassignedMajorDonors.reduce((sum, entry) => sum + entry.totalAmount, 0)),
            description: 'Large donors have no staff owner assigned.',
            ctaLabel: 'Open review table',
            action: 'final_table',
          },
        ],
      },
      {
        id: 'finance_mismatch',
        eyebrow: 'Warning · finance mismatch',
        title: `${formatOutcomeMetric('currency', financeMismatchAmount)} discrepancy`,
        tone: 'warning',
        amount: financeMismatchAmount,
        metricKind: 'currency',
        summary: 'Ambiguous credits and amount mismatches still create downstream reconciliation risk.',
        supporting: 'This rolls up unresolved attribution rows and split-credit mismatches that can distort exported totals.',
        details: [
          {
            id: 'crm_vs_finance_gap',
            label: 'CRM vs QuickBooks gap',
            count: ambiguousAttributionRefs.size,
            amount: roundCurrencyAmount(ambiguousAmount),
            description: 'Rows still need attribution cleanup before totals can reconcile cleanly.',
            ctaLabel: 'Open household review',
            action: 'household',
          },
          {
            id: 'gl_errors',
            label: 'GL errors',
            count: displayedPreviewRecords.filter((record) => {
              const draft = finalAttributionDrafts[record.sourceRowRef] ?? getPreviewRecordAttribution(record);
              const amount = parseCurrencyAmount(record.amount) ?? 0;
              return !!draft && draft.creditAmount != null && draft.mode === 'joint_split' && Math.abs(draft.creditAmount - amount) > 1;
            }).length,
            amount: roundCurrencyAmount(splitMismatchAmount),
            description: 'Credit math does not line up with the original gift amount on some rows.',
            ctaLabel: 'Open review table',
            action: 'final_table',
          },
        ],
      },
      {
        id: 'campaign_truth',
        eyebrow: 'Warning · campaign truth',
        title: `${formatOutcomeMetric('percent', campaignTruthPercent)} of gifts misclassified`,
        tone: 'warning',
        amount: campaignTruthPercent,
        metricKind: 'percent',
        summary: 'Normalized campaign performance is unreliable while taxonomy remains broken or unresolved.',
        supporting: 'Percentage is based on records participating in still-pending taxonomy candidate groups.',
        details: [
          {
            id: 'normalized_campaign_performance',
            label: 'Normalized campaign performance',
            count: taxonomyState?.resolvedGroups.length ?? 0,
            amount: campaignTruthPercent,
            description: 'Campaign comparisons improve as duplicate labels are merged into one canonical view.',
            ctaLabel: 'Open taxonomy review',
            action: 'taxonomy',
          },
          {
            id: 'broken_taxonomy',
            label: 'Broken taxonomy',
            count: taxonomyPendingGroups.length,
            amount: campaignTruthPercent,
            description: 'Pending campaign, appeal, or fund aliases are still splitting the same performance story.',
            ctaLabel: 'Fix taxonomy',
            action: 'taxonomy',
          },
        ],
      },
    ];
  }, [
    ambiguousAttributionRefs,
    displayedPreviewRecords,
    fileClass,
    finalAttributionDrafts,
    householdLayerViews,
    previewRecords,
    reviewedPreviewRecords,
    taxonomyState,
  ]);
  const effectiveReviewOutcomeCards = reviewAnalyticsData?.cards?.length ? reviewAnalyticsData.cards : reviewOutcomeCards;
  const donorHealthOutcomeCard = useMemo<ReviewOutcomeCard | null>(() => {
    if (donorHealthCards.length === 0 || fileClass !== 'donor') return null;
    return {
      id: 'donor_health',
      eyebrow: 'Health · Structure',
      title: 'Donor Health + Structure',
      tone: 'neutral',
      amount: 0,
      metricKind: 'percent',
      summary: 'Retention, composition, and revenue quality signals from the reviewed donor layer.',
      supporting: `${donorHealthCards.length} metric${donorHealthCards.length !== 1 ? 's' : ''} computed`,
      details: donorHealthCards.map((card) => ({
        id: card.id,
        label: card.title,
        count: 0,
        amount: 0,
        description: card.note ?? '',
        ctaLabel: card.metric,
        action: 'final_table' as ReviewOutcomeAction,
      })),
    };
  }, [donorHealthCards, fileClass]);
  const displayedOutcomeCards = useMemo(
    () => (donorHealthOutcomeCard ? [...effectiveReviewOutcomeCards, donorHealthOutcomeCard] : effectiveReviewOutcomeCards),
    [effectiveReviewOutcomeCards, donorHealthOutcomeCard],
  );
  const selectedOutcomeCard = displayedOutcomeCards.find((card) => card.id === selectedOutcomeCardId) ?? displayedOutcomeCards[0];
  const analyticsWorkspaceItems = useMemo<AnalyticsWorkspaceItem[]>(() => {
    const donorRecords = fileClass === 'donor' ? reviewedPreviewRecords : [];
    const donorGroups = new Map<string, {
      label: string;
      totalAmount: number;
      latestAmount: number;
      latestDate: Date | null;
      campaigns: Set<string>;
      tags: Set<string>;
      assignedStaff: Set<string>;
      memoText: string[];
      records: PreviewRecord[];
      recurringPattern: boolean;
      years: Set<number>;
    }>();

    donorRecords.forEach((record) => {
      const key = normalizeRecordIdentity(record);
      const current = donorGroups.get(key) ?? {
        label: String(record.donorName || record.organizationName || [record.firstName, record.lastName].filter(Boolean).join(' ') || record.sourceRowRef),
        totalAmount: 0,
        latestAmount: 0,
        latestDate: null,
        campaigns: new Set<string>(),
        tags: new Set<string>(),
        assignedStaff: new Set<string>(),
        memoText: [],
        records: [],
        recurringPattern: false,
        years: new Set<number>(),
      };
      const amount = parseCurrencyAmount(record.amount) ?? 0;
      const nextDate = record.date ? new Date(String(record.date)) : null;
      current.totalAmount += amount;
      current.records.push(record);
      if (amount > 0 && (!current.latestDate || (nextDate && !Number.isNaN(nextDate.getTime()) && nextDate.getTime() >= current.latestDate.getTime()))) {
        current.latestAmount = amount;
      }
      if (nextDate && !Number.isNaN(nextDate.getTime())) {
        current.latestDate = !current.latestDate || nextDate.getTime() > current.latestDate.getTime() ? nextDate : current.latestDate;
        current.years.add(nextDate.getFullYear());
      }
      const campaign = String(record.fund || record.appeal || 'Unassigned').trim();
      if (campaign) current.campaigns.add(campaign);
      (Array.isArray(record.tags) ? record.tags : []).forEach((tag) => {
        const normalized = String(tag || '').trim().toLowerCase();
        if (normalized) current.tags.add(normalized);
      });
      const owner = String(record.assignedStaff || '').trim();
      if (owner) current.assignedStaff.add(owner);
      if (record.memo) current.memoText.push(String(record.memo).toLowerCase());
      donorGroups.set(key, current);
    });

    const now = new Date();
      const donorEntries = Array.from(donorGroups.values()).map((entry) => {
      const sortedDates = entry.records
        .map((record) => (record.date ? new Date(String(record.date)) : null))
        .filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()))
        .sort((left, right) => left.getTime() - right.getTime());
      const intervals = sortedDates.slice(1).map((date, index) => {
        const previousDate = sortedDates[index];
        if (!previousDate) return 0;
        return Math.round((date.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));
      });
      return {
        ...entry,
        recurringPattern: intervals.some((interval) => interval >= 25 && interval <= 40) || entry.records.length >= 3,
      };
    });

    const items: AnalyticsWorkspaceItem[] = [];
    donorEntries.forEach((entry) => {
      const campaign = Array.from(entry.campaigns)[0] ?? 'Unassigned';
      const sourceRowRefs = entry.records.map((record) => record.sourceRowRef);
      const duplicateCount = Math.max(0, sourceRowRefs.length - 1);
      const includesSoftCredit = entry.records.some((record) => {
        const attribution = finalAttributionDrafts[record.sourceRowRef] ?? getPreviewRecordAttribution(record);
        return attribution?.mode === 'soft_credit';
      });
      const base = {
        campaign,
        sourceRowRefs,
        duplicateCount,
        includesSoftCredit,
      };
      if (entry.recurringPattern) {
        items.push({
          id: `recurring:${entry.label}`,
          outcomeId: 'revenue_at_risk',
          detailId: 'recurring_donors',
          label: entry.label,
          description: 'Multiple gifts suggest a recurring giving pattern.',
          amount: Math.max(entry.latestAmount, entry.totalAmount * 0.5),
          sortDate: entry.latestDate?.toISOString() ?? null,
          campaign,
          donorSegment: 'recurring donors',
          sourceRowRefs,
          duplicateCount,
          includesSoftCredit,
          evidenceRows: buildAnalyticsEvidenceRows(entry.records),
          action: 'final_table',
        });
      }
      if (entry.latestDate && (now.getTime() - entry.latestDate.getTime()) > (1000 * 60 * 60 * 24 * 365)) {
        items.push({
          id: `lapsed:${entry.label}`,
          outcomeId: 'revenue_at_risk',
          detailId: 'lapsed_donors',
          label: entry.label,
          description: 'No gift recorded in the last 12 months.',
          amount: entry.latestAmount || entry.totalAmount,
          sortDate: entry.latestDate.toISOString(),
          campaign,
          donorSegment: 'lapsed donors',
          sourceRowRefs,
          duplicateCount,
          includesSoftCredit,
          action: 'final_table',
        });
      }
      if (entry.memoText.some((memo) => memo.includes('match') || memo.includes('employer') || memo.includes('company'))) {
        items.push({
          id: `match:${entry.label}`,
          outcomeId: 'money_leakage',
          detailId: 'missing_matching_gifts',
          label: entry.label,
          description: 'Employer matching gift hint found in notes or source data.',
          amount: entry.totalAmount,
          sortDate: entry.latestDate?.toISOString() ?? null,
          campaign,
          donorSegment: 'matching gift opportunities',
          sourceRowRefs,
          duplicateCount,
          includesSoftCredit,
          action: 'household',
        });
      }
      if (entry.totalAmount >= 1000 && entry.assignedStaff.size === 0) {
        items.push({
          id: `unassigned:${entry.label}`,
          outcomeId: 'money_leakage',
          detailId: 'unassigned_major_donors',
          label: entry.label,
          description: 'Major donor has no development owner assigned.',
          amount: entry.totalAmount,
          sortDate: entry.latestDate?.toISOString() ?? null,
          campaign,
          donorSegment: 'unassigned prospects',
          sourceRowRefs,
          duplicateCount,
          includesSoftCredit,
          action: 'final_table',
        });
      }
    });

    donorEntries
      .slice()
      .sort((left, right) => right.totalAmount - left.totalAmount)
      .slice(0, Math.max(1, Math.ceil(donorEntries.length * 0.2)))
      .forEach((entry) => {
        const campaign = Array.from(entry.campaigns)[0] ?? 'Unassigned';
        const sourceRowRefs = entry.records.map((record) => record.sourceRowRef);
        const duplicateCount = Math.max(0, sourceRowRefs.length - 1);
        const includesSoftCredit = entry.records.some((record) => {
          const attribution = finalAttributionDrafts[record.sourceRowRef] ?? getPreviewRecordAttribution(record);
          return attribution?.mode === 'soft_credit';
        });
        items.push({
          id: `upgrade:${entry.label}`,
          outcomeId: 'money_leakage',
          detailId: 'upgrade_opportunities',
          label: entry.label,
          description: 'Top-value donor with room to upgrade based on giving concentration.',
          amount: entry.totalAmount * 0.2,
          sortDate: entry.latestDate?.toISOString() ?? null,
          campaign,
          donorSegment: entry.totalAmount >= 1000 ? 'major donors' : 'upgrade opportunities',
          sourceRowRefs,
          duplicateCount,
          includesSoftCredit,
          action: 'final_table',
        });
      });

    ambiguousAttributionGroups.forEach((group) => {
      const amount = group.records.reduce((sum, record) => sum + (parseCurrencyAmount(record.amount) ?? 0), 0);
      items.push({
        id: `finance-gap:${group.key}`,
        outcomeId: 'finance_mismatch',
        detailId: 'crm_vs_finance_gap',
        label: group.label,
        description: 'Attribution ambiguity can distort CRM versus finance totals.',
        amount,
        sortDate: group.records[0]?.date ? new Date(String(group.records[0].date)).toISOString() : null,
        campaign: String(group.records[0]?.fund || group.records[0]?.appeal || 'Unassigned'),
        donorSegment: 'data issues',
        sourceRowRefs: group.records.map((record) => record.sourceRowRef),
        duplicateCount: Math.max(0, group.records.length - 1),
        includesSoftCredit: group.records.some((record) => {
          const attribution = finalAttributionDrafts[record.sourceRowRef] ?? getPreviewRecordAttribution(record);
          return attribution?.mode === 'soft_credit';
        }),
        action: 'household',
      });
    });

    displayedPreviewRecords.forEach((record) => {
      const draft = finalAttributionDrafts[record.sourceRowRef] ?? getPreviewRecordAttribution(record);
      const amount = parseCurrencyAmount(record.amount) ?? 0;
      if (!draft || draft.creditAmount == null || draft.mode !== 'joint_split' || Math.abs(draft.creditAmount - amount) <= 1) return;
      items.push({
        id: `gl:${record.sourceRowRef}`,
        outcomeId: 'finance_mismatch',
        detailId: 'gl_errors',
        label: previewRecordLabel(record),
        description: 'Split credit does not match the source gift amount.',
        amount: Math.abs(draft.creditAmount - amount),
        sortDate: record.date ? new Date(String(record.date)).toISOString() : null,
        campaign: String(record.fund || record.appeal || 'Unassigned'),
        donorSegment: 'data issues',
        sourceRowRefs: [record.sourceRowRef],
        duplicateCount: getPreviewRecordClusterRefs(record.sourceRowRef).length - 1,
        includesSoftCredit: false,
        action: 'final_table',
      });
    });

    (taxonomyState?.candidateGroups ?? [])
      .filter((group) => group.status === 'pending' && !(taxonomyState?.dismissedCandidateIds ?? []).includes(group.id))
      .forEach((group) => {
        const sourceRowRefs = Array.from(new Set(group.members.flatMap((member) => member.sourceRowRefs ?? [])));
        const groupAmount = sourceRowRefs.reduce((sum, ref) => {
          const record = reviewedPreviewRecords.find((item) => item.sourceRowRef === ref);
          return sum + (parseCurrencyAmount(record?.amount) ?? 0);
        }, 0);
        items.push({
          id: `taxonomy:${group.id}`,
          outcomeId: 'campaign_truth',
          detailId: group.id.startsWith('normalized') ? 'normalized_campaign_performance' : 'broken_taxonomy',
          label: group.suggestedCanonicalLabel,
          description: `${group.objectType} aliases are still split across raw labels.`,
          amount: groupAmount || sourceRowRefs.length,
          sortDate: null,
          campaign: group.suggestedCanonicalLabel,
          donorSegment: 'campaign ops',
          sourceRowRefs,
          duplicateCount: Math.max(0, sourceRowRefs.length - 1),
          includesSoftCredit: false,
          action: 'taxonomy',
        });
      });

    return items;
  }, [
    ambiguousAttributionGroups,
    displayedPreviewRecords,
    fileClass,
    finalAttributionDrafts,
    getPreviewRecordClusterRefs,
    previewRecords,
    reviewedPreviewRecords,
    taxonomyState,
  ]);
  const activeOutcomeDetailId = analyticsWorkspace.selectedDetailIdByOutcome[selectedOutcomeCardId] ?? selectedOutcomeCard?.details[0]?.id ?? null;
  const activeOutcomeDetail = selectedOutcomeCard?.details.find((detail) => detail.id === activeOutcomeDetailId) ?? selectedOutcomeCard?.details[0] ?? null;
  const activeAnalyticsFilters = (activeOutcomeDetailId ? analyticsWorkspace.filtersByDetail[activeOutcomeDetailId] : null) ?? buildDefaultAnalyticsFilters();
  const effectiveAnalyticsWorkspaceItems = reviewAnalyticsData?.items?.length ? reviewAnalyticsData.items : analyticsWorkspaceItems;
  const activeOutcomeItems = activeOutcomeDetailId
    ? effectiveAnalyticsWorkspaceItems.filter((item) => item.outcomeId === selectedOutcomeCardId && item.detailId === activeOutcomeDetailId)
    : [];
  const analyticsCampaignOptions = Array.from(new Set(activeOutcomeItems.map((item) => item.campaign).filter(Boolean))).sort((left, right) => left.localeCompare(right));
  const analyticsSegmentOptions = Array.from(new Set(activeOutcomeItems.map((item) => item.donorSegment).filter(Boolean))).sort((left, right) => left.localeCompare(right));
  const filteredAnalyticsItems = activeOutcomeItems
    .filter((item) => activeAnalyticsFilters.campaign === 'all' || item.campaign === activeAnalyticsFilters.campaign)
    .filter((item) => activeAnalyticsFilters.donorSegment === 'all' || item.donorSegment === activeAnalyticsFilters.donorSegment)
    .filter((item) => activeAnalyticsFilters.minAmount == null || item.amount >= activeAnalyticsFilters.minAmount)
    .filter((item) => activeAnalyticsFilters.includeDuplicates || item.duplicateCount === 0)
    .filter((item) => activeAnalyticsFilters.includeSoftCredit || !item.includesSoftCredit)
    .sort((left, right) => {
      if (activeAnalyticsFilters.sort === 'most_recent') return (new Date(right.sortDate ?? 0).getTime()) - (new Date(left.sortDate ?? 0).getTime());
      return right.amount - left.amount;
    });
  useEffect(() => {
    if (filteredAnalyticsItems.length === 0) {
      setExpandedAnalyticsItemId(null);
      return;
    }
    setExpandedAnalyticsItemId((current) => (
      current && filteredAnalyticsItems.some((item) => item.id === current)
        ? current
        : (filteredAnalyticsItems.find((item) => item.evidenceRows && item.evidenceRows.length > 0)?.id ?? null)
    ));
  }, [filteredAnalyticsItems]);
  const analyticsSavedViewsForOutcome = analyticsWorkspace.savedViews.filter((view) => view.outcomeId === selectedOutcomeCardId);
  useEffect(() => {
    setAnalyticsWorkspace(parsedFile?.analyticsWorkspace ?? buildDefaultAnalyticsWorkspace());
  }, [parsedFile]);
  useEffect(() => {
    if (isLedgerFile || !preview || previewRecords.length === 0) {
      setReviewAnalyticsData(null);
      return;
    }
  }, [isLedgerFile, preview, previewRecords]);
  useEffect(() => {
    if (!selectedOutcomeCard) return;
    const activeDetailId = analyticsWorkspace.selectedDetailIdByOutcome[selectedOutcomeCard.id];
    if (activeDetailId && selectedOutcomeCard.details.some((detail) => detail.id === activeDetailId)) return;
    setAnalyticsWorkspace((current) => ({
      ...current,
      selectedDetailIdByOutcome: {
        ...current.selectedDetailIdByOutcome,
        [selectedOutcomeCard.id]: selectedOutcomeCard.details[0]?.id ?? '',
      },
    }));
  }, [analyticsWorkspace.selectedDetailIdByOutcome, selectedOutcomeCard]);
  useEffect(() => {
    if (visibleHouseholdLayerViews.length === 0) {
      setExpandedHouseholdReviewId(null);
      setExpandedFinalHouseholdId(null);
      return;
    }
    setExpandedHouseholdReviewId((current) => current && visibleHouseholdLayerViews.some((view) => view.householdId === current) ? current : visibleHouseholdLayerViews[0].householdId);
    setExpandedFinalHouseholdId((current) => current && visibleHouseholdLayerViews.some((view) => view.householdId === current) ? current : visibleHouseholdLayerViews[0].householdId);
  }, [visibleHouseholdLayerViews]);
  const {
    filteredEntityGraphRows,
    selectedEntityGraphDonationContext,
    selectedEntityGraphHouseholdContext,
    selectedEntityGraphPersonContext,
    selectedEntityGraphOrganizationContext,
  } = useTransformHubReviewGraph({
    entityModelResult,
    entityGraphView,
    entityGraphSearch,
    entityGraphSelection,
    parsedPreviewRecords: previewBaseRecords,
    finalAttributionDrafts,
    finalHouseholdDrafts,
    householdResult,
    organizationGraphDrafts,
    matchesEntityGraphSearch,
    matchesEntityGraphSelection,
    buildInitialAttributionDraft,
    buildInitialHouseholdDraft,
  });
  const entityGraphViews: EntityGraphView[] = ['donations', 'attributions', 'households', 'persons', 'organizations'];
  const heroTitle = isLedgerFile ? 'Canonical ledger in the center.' : 'Canonical records in the center.';
  const heroSummary = isLedgerFile
    ? 'Everything flows into one final ledger, and every export flows back out from the same reviewed rows.'
    : 'Each upload is classified first, normalized into its own canonical model, and reviewed in a file-specific table before export.';

  const nonLedgerTableHeaders = useMemo(() => parsedFile?.headers ?? [], [parsedFile?.headers]);
  const visibleNonLedgerTableHeaders = useMemo(
    () => nonLedgerTableHeaders.filter((header) => !hiddenPreviewHeaders.includes(header)),
    [nonLedgerTableHeaders, hiddenPreviewHeaders],
  );
  const hiddenNonLedgerTableHeaders = useMemo(
    () => nonLedgerTableHeaders.filter((header) => hiddenPreviewHeaders.includes(header)),
    [nonLedgerTableHeaders, hiddenPreviewHeaders],
  );
  const reviewAugmentedColumns = useMemo(
    () => (householdResult ? ['__role__', '__attribution_type__', '__credit_amount__', '__household__', '__notes__'] : []),
    [householdResult],
  );
  const nonLedgerTableColumnKeys = useMemo(
    () => ['__source__', ...visibleNonLedgerTableHeaders, ...reviewAugmentedColumns],
    [visibleNonLedgerTableHeaders, reviewAugmentedColumns],
  );

  const nonLedgerTableWidth = useMemo(
    () => nonLedgerTableColumnKeys.reduce((total, columnKey) => {
      const width = nonLedgerColumnWidths[columnKey] ?? (columnKey === '__source__' ? 172 : 148);
      return total + width;
    }, 0),
    [nonLedgerTableColumnKeys, nonLedgerColumnWidths],
  );
  useEffect(() => {
    setHiddenPreviewHeaders((current) => current.filter((header) => nonLedgerTableHeaders.includes(header)));
    setSelectedPreviewHeader((current) => current && nonLedgerTableHeaders.includes(current) ? current : null);
    setSelectedPreviewHeaders((current) => current.filter((header) => nonLedgerTableHeaders.includes(header)));
    setEditingPreviewHeader((current) => current && nonLedgerTableHeaders.includes(current) ? current : null);
    setActivePreviewCell((current) => current && nonLedgerTableHeaders.includes(current.header) ? current : null);
    setEditingPreviewCell((current) => current && nonLedgerTableHeaders.includes(current.header) ? current : null);
  }, [nonLedgerTableHeaders]);
  useEffect(() => {
    setSelectedPreviewRowRef((current) => current && previewBaseRecords.some((record) => record.sourceRowRef === current) ? current : null);
    setSelectedPreviewRowRefs((current) => current.filter((rowRef) => previewBaseRecords.some((record) => record.sourceRowRef === rowRef)));
    setActivePreviewCell((current) => current && previewBaseRecords.some((record) => record.sourceRowRef === current.rowRef) ? current : null);
    setEditingPreviewCell((current) => current && previewBaseRecords.some((record) => record.sourceRowRef === current.rowRef) ? current : null);
  }, [previewBaseRecords]);
  useEffect(() => {
    if (!previewTableContextMenu) return;
    const handleCloseMenu = () => setPreviewTableContextMenu(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewTableContextMenu(null);
    };
    window.addEventListener('pointerdown', handleCloseMenu);
    window.addEventListener('resize', handleCloseMenu);
    window.addEventListener('scroll', handleCloseMenu, true);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handleCloseMenu);
      window.removeEventListener('resize', handleCloseMenu);
      window.removeEventListener('scroll', handleCloseMenu, true);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [previewTableContextMenu]);
  useEffect(() => {
    if (isLedgerFile || !parsedFile?.preview) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('#th-review-table')) return;
      if (target?.closest('.th-context-menu')) return;
      setSelectedPreviewHeader(null);
      setSelectedPreviewRowRef(null);
      setSelectedPreviewHeaders([]);
      setSelectedPreviewRowRefs([]);
      setActivePreviewCell(null);
      setActivePreviewFilterColumn(null);
      setPreviewHeaderDropTarget(null);
      setPreviewRowDropTarget(null);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isLedgerFile, parsedFile]);
  function getNonLedgerColumnWidth(columnKey: string) {
    if (nonLedgerColumnWidths[columnKey]) return nonLedgerColumnWidths[columnKey];
    if (columnKey === '__source__') return 172;
    if (columnKey === '__attribution_type__') return 160;
    if (columnKey === '__credit_amount__') return 140;
    if (columnKey === '__role__') return 150;
    if (columnKey === '__household__') return 180;
    if (columnKey === '__notes__') return 220;
    return 148;
  }

  function startNonLedgerColumnResize(columnKey: string, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startWidth = getNonLedgerColumnWidth(columnKey);
    const minWidth = columnKey === '__source__' ? 156 : 120;
    const startClientX = event.clientX;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startClientX;
      setNonLedgerColumnWidths((current) => ({
        ...current,
        [columnKey]: Math.max(minWidth, startWidth + delta),
      }));
    };
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }
  function updatePreviewColumnFilter(columnKey: string, value: string) {
    setPreviewColumnFilters((current) => {
      const next = { ...current };
      const trimmed = value.trimStart();
      if (trimmed) next[columnKey] = trimmed;
      else delete next[columnKey];
      return next;
    });
  }

  function getPreviewColumnFilterValue(columnKey: string) {
    return previewColumnFilters[columnKey] ?? '';
  }
  function isPreviewColumnFiltered(columnKey: string) {
    return Boolean(getPreviewColumnFilterValue(columnKey).trim());
  }
  function renderPreviewColumnFilterControl(columnKey: string, label: string, placeholder: string) {
    const isOpen = activePreviewFilterColumn === columnKey;
    const isFiltered = isPreviewColumnFiltered(columnKey);
    return (
      <div className="th-header-filter-wrap">
        <button
          type="button"
          className={`th-header-filter-button${isFiltered ? ' is-filtered' : ''}${isOpen ? ' is-open' : ''}`}
          aria-label={`Filter ${label} column`}
          onClick={(event) => {
            event.stopPropagation();
            setActivePreviewFilterColumn((current) => current === columnKey ? null : columnKey);
          }}
        >
          <Filter size={13} />
        </button>
        {isOpen && (
          <div className="th-header-filter-popover" onClick={(event) => event.stopPropagation()}>
            <input
              autoFocus
              className={`th-table-cell-input th-column-filter-input${isFiltered ? ' is-filtered' : ''}`}
              value={getPreviewColumnFilterValue(columnKey)}
              onChange={(event) => updatePreviewColumnFilter(columnKey, event.target.value)}
              placeholder={placeholder}
              aria-label={`Filter ${label} column`}
            />
          </div>
        )}
      </div>
    );
  }
  const previewSourceOrigins = useMemo(
    () => Array.from(new Set(previewRecords.map((record) => getSourceOriginKey(record.sourceRowRef, parsedFile?.fileName)))),
    [previewRecords, parsedFile?.fileName],
  );
  const previewSourceBadgeByOrigin = useMemo(
    () => new Map(previewSourceOrigins.map((origin, index) => [origin, `S${index + 1}`])),
    [previewSourceOrigins],
  );
  const previewSourceColorByOrigin = useMemo(
    () => new Map(previewSourceOrigins.map((origin, index) => [origin, PREVIEW_SOURCE_PALETTE[index % PREVIEW_SOURCE_PALETTE.length]])),
    [previewSourceOrigins],
  );
  const previewSourceLegendEntries = useMemo(
    () => previewSourceOrigins.map((origin) => {
      const labels = Array.from(new Set(
        previewRecords
          .filter((record) => getSourceOriginKey(record.sourceRowRef, parsedFile?.fileName) === origin)
          .map((record) => String(record.sourceFile || record.source_file || '').trim())
          .filter(Boolean),
      ));
      return {
        origin,
        badge: previewSourceBadgeByOrigin.get(origin) ?? origin,
        label: labels.join(' + ') || origin,
      };
    }),
    [parsedFile?.fileName, previewRecords, previewSourceBadgeByOrigin, previewSourceOrigins],
  );
  const getRecordSourceOrigins = useCallback((record: PreviewRecord) => {
    const refs = [record.sourceRowRef, ...(mergedSourceRefsByRepresentative.get(record.sourceRowRef) ?? [])];
    return Array.from(new Set(refs.map((ref) => getSourceOriginKey(ref, parsedFile?.fileName))));
  }, [mergedSourceRefsByRepresentative, parsedFile?.fileName]);
  const filteredDisplayedPreviewRecords = useMemo(
    () => (previewSourceFocus === 'all'
      ? displayedPreviewRecords
      : displayedPreviewRecords.filter((record) => getRecordSourceOrigins(record).includes(previewSourceFocus))),
    [previewSourceFocus, displayedPreviewRecords, getRecordSourceOrigins],
  );
  const consolidatedDisplayedPreviewRecords = useMemo(() => {
    const grouped = new Map<string, PreviewRecord>();
    filteredDisplayedPreviewRecords.forEach((record) => {
      const resolvedPersonIds = getResolvedPreviewDistinctPersonIds(record.sourceRowRef);
      if (resolvedPersonIds.length === 0) return;
      const key = resolvedPersonIds.join('|');
      if (grouped.has(key)) return;
      const canonicalPerson = resolvedPersonIds.length === 1 ? peopleById.get(resolvedPersonIds[0]) ?? null : null;
      if (!canonicalPerson) {
        grouped.set(key, record);
        return;
      }

      const nextRawValues = { ...getPreviewRecordRawValues(record) };
      const fieldMap = (schema?.fieldMap ?? {}) as Record<string, string>;
      const canonicalOverrides: Array<[string, string]> = [
        ['first_name', canonicalPerson.firstName ?? ''],
        ['last_name', canonicalPerson.lastName ?? ''],
        ['email', canonicalPerson.email ?? ''],
        ['phone', canonicalPerson.phone ?? ''],
        ['address', canonicalPerson.addressLine1 ?? ''],
        ['city', canonicalPerson.city ?? ''],
        ['state', canonicalPerson.state ?? ''],
        ['postal_code', canonicalPerson.zip ?? ''],
      ];
      canonicalOverrides.forEach(([canonicalKey, value]) => {
        const header = fieldMap[canonicalKey];
        if (header) nextRawValues[header] = value;
      });
      const canonicalName = [canonicalPerson.firstName, canonicalPerson.lastName].filter(Boolean).join(' ').trim() || canonicalPerson.id;
      const nameHeaders = Object.entries(fieldMap)
        .filter(([semantic]) => /entity_name|donor_name|full_name/.test(semantic))
        .map(([, header]) => header);
      nameHeaders.forEach((header) => { nextRawValues[header] = canonicalName; });
      grouped.set(key, {
        ...record,
        firstName: canonicalPerson.firstName,
        lastName: canonicalPerson.lastName,
        email: canonicalPerson.email,
        phone: canonicalPerson.phone,
        address: canonicalPerson.addressLine1,
        city: canonicalPerson.city,
        state: canonicalPerson.state,
        postalCode: canonicalPerson.zip,
        donorName: canonicalName,
        displayName: canonicalName,
        rawValues: nextRawValues,
        values: { ...(record.values ?? {}), ...nextRawValues },
      });
    });
    return Array.from(grouped.values());
  }, [filteredDisplayedPreviewRecords, getResolvedPreviewDistinctPersonIds, peopleById, schema?.fieldMap]);
  const matchesPreviewColumnFilters = useCallback((record: PreviewRecord) => {
    const activeFilters = Object.entries(previewColumnFilters).filter(([, value]) => value.trim());
    if (activeFilters.length === 0) return true;

    return activeFilters.every(([columnKey, value]) => {
      const needle = value.toLowerCase().trim();
      if (!needle) return true;

      let haystack = '';
      if (columnKey === '__source__') {
        haystack = supportsDuplicateWorkflow
          ? describeRepresentativeSource(record)
          : getCompactSourceRef(record.sourceRowRef).primary;
      } else if (columnKey === '__role__') {
        const { matchedPerson, draft } = getAttributionDraftForRecord(record);
        haystack = `${getRecordRole(record, draft, matchedPerson)} ${getBestPersonDisplayLabel(matchedPerson, record)}`;
      } else if (columnKey === '__attribution_type__') {
        const { draft } = getAttributionDraftForRecord(record);
        haystack = `${draft.mode} ${getAttributionModeLabel(draft.mode)}`;
      } else if (columnKey === '__credit_amount__') {
        const { matchedPerson, draft } = getAttributionDraftForRecord(record);
        const rawAmount = parseCurrencyAmount(record.amount);
        haystack = `${getDisplayCreditAmount(draft, rawAmount, getRecordRole(record, draft, matchedPerson))}`;
      } else if (columnKey === '__household__') {
        const { assignedHouseholdId } = getAttributionDraftForRecord(record);
        haystack = assignedHouseholdId ? householdLabelById.get(assignedHouseholdId) ?? assignedHouseholdId : '';
      } else if (columnKey === '__notes__') {
        const { draft } = getAttributionDraftForRecord(record);
        haystack = String(draft.notes || record.memo || '');
      } else {
        haystack = getPreviewRecordRawCell(record, columnKey);
      }

      if (isNumericPreviewColumn(columnKey)) {
        return matchesComparableNumberFilter(haystack, needle);
      }
      if (isDatePreviewColumn(columnKey)) {
        return matchesComparableDateFilter(haystack, needle);
      }
      return haystack.toLowerCase().includes(needle);
    });
  }, [getAttributionDraftForRecord, householdLabelById, previewColumnFilters, supportsDuplicateWorkflow]);
  const visibleAttributionTableRecords = useMemo(
    () => {
      const sourceRecords = matchingReviewActive && matchingTableView === 'consolidated'
        ? consolidatedDisplayedPreviewRecords
        : filteredDisplayedPreviewRecords;
      const baseRecords = selectedAttributionGroupKey
        ? sourceRecords.filter((record) => ambiguousGroupKeyBySourceRef.get(record.sourceRowRef) === selectedAttributionGroupKey)
        : sourceRecords;
      return baseRecords.filter(matchesPreviewColumnFilters);
    },
    [selectedAttributionGroupKey, filteredDisplayedPreviewRecords, consolidatedDisplayedPreviewRecords, ambiguousGroupKeyBySourceRef, matchesPreviewColumnFilters, matchingReviewActive, matchingTableView],
  );
  useEffect(() => {
    if (!debugPreviewRowRef || typeof window === 'undefined') return;
    const previewRecord = previewBaseRecords.find((record) => record.sourceRowRef === debugPreviewRowRef) ?? null;
    const normalizedRecord = previewRecords.find((record) => record.sourceRowRef === debugPreviewRowRef) ?? null;
    const filteredRecord = filteredDisplayedPreviewRecords.find((record) => record.sourceRowRef === debugPreviewRowRef) ?? null;
    const consolidatedRecord = consolidatedDisplayedPreviewRecords.find((record) => record.sourceRowRef === debugPreviewRowRef) ?? null;
    const visibleRecord = visibleAttributionTableRecords.find((record) => record.sourceRowRef === debugPreviewRowRef) ?? null;
    const nameHeaders = Object.entries((schema?.fieldMap ?? {}) as Record<string, string>)
      .filter(([semantic]) => /entity_name|donor_name|full_name|first_name|last_name/.test(semantic))
      .map(([, header]) => header);
    const summarizeRecord = (record: PreviewRecord | null) => {
      if (!record) return null;
      const rawValues = getPreviewRecordRawValues(record);
      return {
        sourceRowRef: record.sourceRowRef,
        donorName: record.donorName ?? null,
        displayName: record.displayName ?? null,
        firstName: record.firstName ?? null,
        lastName: record.lastName ?? null,
        organizationName: record.organizationName ?? null,
        email: record.email ?? null,
        matchedNameFields: Object.fromEntries(nameHeaders.map((header) => [header, rawValues[header] ?? null])),
      };
    };
    console.groupCollapsed('[TransformHub debug] Preview row pipeline ' + debugPreviewRowRef);
    console.debug('tracking', {
      debugPreviewRowRef,
      matchingReviewActive,
      matchingTableView,
      selectedAttributionGroupKey,
      visibleRowCount: visibleAttributionTableRecords.length,
    });
    console.debug('previewBaseRecords', summarizeRecord(previewRecord));
    console.debug('previewRecords', summarizeRecord(normalizedRecord));
    console.debug('filteredDisplayedPreviewRecords', summarizeRecord(filteredRecord));
    console.debug('consolidatedDisplayedPreviewRecords', summarizeRecord(consolidatedRecord));
    console.debug('visibleAttributionTableRecords', summarizeRecord(visibleRecord));
    console.groupEnd();
  }, [
    consolidatedDisplayedPreviewRecords,
    debugPreviewRowRef,
    filteredDisplayedPreviewRecords,
    matchingReviewActive,
    matchingTableView,
    previewBaseRecords,
    previewRecords,
    schema?.fieldMap,
    selectedAttributionGroupKey,
    visibleAttributionTableRecords,
  ]);
  useEffect(() => {
    if (isLedgerFile || !parsedFile?.preview) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && activePreviewCell && !isTypingTarget) {
        event.preventDefault();
        const headers = selectedPreviewHeaders.length > 0 ? visibleNonLedgerTableHeaders.filter((header) => selectedPreviewHeaders.includes(header)) : [activePreviewCell.header];
        const rowRefs = selectedPreviewRowRefs.length > 0 ? visibleAttributionTableRecords.map((record) => record.sourceRowRef).filter((rowRef) => selectedPreviewRowRefs.includes(rowRef)) : [activePreviewCell.rowRef];
        const text = rowRefs.map((rowRef) => {
          const record = visibleAttributionTableRecords.find((candidate) => candidate.sourceRowRef === rowRef);
          return headers.map((header) => getPreviewRecordRawCell(record, header).replace(/^—$/, '')).join('\t');
        }).join('\n');
        void navigator.clipboard?.writeText(text);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && activePreviewCell && !isTypingTarget) {
        event.preventDefault();
        void navigator.clipboard?.readText().then(async (text) => {
          const rowsText = text.replace(/\r/g, '').split('\n').filter((line) => line.length > 0);
          if (rowsText.length === 0) return;
          const startRowIndex = visibleAttributionTableRecords.findIndex((record) => record.sourceRowRef === activePreviewCell.rowRef);
          const startHeaderIndex = visibleNonLedgerTableHeaders.findIndex((header) => header === activePreviewCell.header);
          if (startRowIndex < 0 || startHeaderIndex < 0) return;
          const changes: Array<{ rowRef: string; header: string; value: string }> = [];
          rowsText.forEach((line, rowOffset) => {
            const rowRef = visibleAttributionTableRecords[startRowIndex + rowOffset]?.sourceRowRef;
            if (!rowRef) return;
            line.split('\t').forEach((value, columnOffset) => {
              const header = visibleNonLedgerTableHeaders[startHeaderIndex + columnOffset];
              if (!header) return;
              changes.push({ rowRef, header, value });
            });
          });
          await applyPreviewCellChanges(changes, `Pasted ${changes.length} cell${changes.length === 1 ? '' : 's'} into the table.`);
        }).catch(() => setMessage('Paste failed.'));
        return;
      }
      if (isTypingTarget) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        if (selectedPreviewHeaders.length > 0) {
          void handleDeletePreviewColumns(selectedPreviewHeaders);
          return;
        }
        if (selectedPreviewRowRefs.length > 0) {
          void handleDeletePreviewRows(selectedPreviewRowRefs);
          return;
        }
        if (activePreviewCell) {
          void applyPreviewCellChanges([{ rowRef: activePreviewCell.rowRef, header: activePreviewCell.header, value: '' }], 'Cleared cell value.');
        }
        return;
      }
      if (!activePreviewCell) return;
      const rowIndex = visibleAttributionTableRecords.findIndex((record) => record.sourceRowRef === activePreviewCell.rowRef);
      const headerIndex = visibleNonLedgerTableHeaders.findIndex((header) => header === activePreviewCell.header);
      if (rowIndex < 0 || headerIndex < 0) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        const record = visibleAttributionTableRecords[rowIndex];
        setEditingPreviewCell(activePreviewCell);
        setEditingPreviewCellDraft(getPreviewRecordRawCell(record, activePreviewCell.header).replace(/^—$/, ''));
        return;
      }
      const offsets: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const offset = offsets[event.key];
      if (!offset) return;
      event.preventDefault();
      const nextRow = visibleAttributionTableRecords[rowIndex + offset[0]];
      const nextHeader = visibleNonLedgerTableHeaders[headerIndex + offset[1]];
      if (!nextRow || !nextHeader) return;
      selectPreviewCell(nextRow.sourceRowRef, nextHeader);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLedgerFile, parsedFile, activePreviewCell, selectedPreviewHeaders, selectedPreviewRowRefs, visibleAttributionTableRecords, visibleNonLedgerTableHeaders]);
  const editablePreviewFieldToCanonicalKey: Record<string, string> = {
    firstName: 'first_name',
    lastName: 'last_name',
    organizationName: 'organization_name',
    householdName: 'household_name',
    email: 'email',
    phone: 'phone',
    address: 'address',
    city: 'city',
    state: 'state',
    postalCode: 'postal_code',
    country: 'country',
    assignedStaff: 'assigned_staff',
    amount: 'amount',
    fund: 'fund',
    appeal: 'appeal',
    memo: 'memo',
  };

  function applyPreviewRecordEdits(record: PreviewRecord, draft: EditablePreviewDraft): PreviewRecord {
    const nextRawValues = { ...getPreviewRecordRawValues(record) };
    Object.entries(editablePreviewFieldToCanonicalKey).forEach(([draftKey, canonicalKey]) => {
      if (!(draftKey in draft)) return;
      const header = (schema?.fieldMap as Record<string, string> | undefined)?.[canonicalKey];
      if (!header) return;
      const value = draft[draftKey];
      nextRawValues[header] = Array.isArray(value) ? value.join('; ') : (value ?? '');
    });
    Object.entries(draft).forEach(([draftKey, value]) => {
      if (!draftKey.startsWith('raw:')) return;
      const header = draftKey.slice(4);
      if (!header) return;
      nextRawValues[header] = Array.isArray(value) ? value.join('; ') : (value ?? '');
    });
    const nextRecord: PreviewRecord = { ...record, ...draft, rawValues: nextRawValues };
    if (fileClass === 'constituent') {
      const displayName = nextRecord.organizationName || [nextRecord.firstName, nextRecord.lastName].filter(Boolean).join(' ');
      nextRecord.displayName = displayName || nextRecord.displayName || nextRecord.sourceRowRef;
    }
    if (fileClass === 'donor') {
      const donorName = nextRecord.organizationName || [nextRecord.firstName, nextRecord.lastName].filter(Boolean).join(' ');
      nextRecord.donorName = donorName || nextRecord.donorName || nextRecord.sourceRowRef;
    }
    return nextRecord;
  }

  function applyConfirmedMergeNamesToParsedFile(currentParsedFile: ParsedFile | null, matches: PersonMatch[]): ParsedFile | null {
    if (!currentParsedFile?.preview || matches.length === 0) return currentParsedFile;
    const fieldMap = (schema?.fieldMap ?? {}) as Record<string, string>;
    const fullNameHeaders = Object.entries(fieldMap)
      .filter(([semantic]) => /entity_name|donor_name|full_name/.test(semantic))
      .map(([, header]) => header);
    const firstNameHeader = fieldMap.first_name ?? null;
    const lastNameHeader = fieldMap.last_name ?? null;
    const candidateByInputRef = matches.reduce<Map<string, { firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null }>>((acc, match) => {
      const matchedPerson = match.matchedPersonId ? peopleById.get(match.matchedPersonId) ?? null : null;
      const candidate = match.reviewPayload?.candidate ?? null;
      const nameSource = matchedPerson
        ? {
            firstName: matchedPerson.firstName ?? '',
            lastName: matchedPerson.lastName ?? '',
            email: matchedPerson.email ?? '',
            phone: matchedPerson.phone ?? '',
          }
        : candidate;
      if (nameSource) acc.set(match.inputRef, nameSource);
      return acc;
    }, new Map());
    const inputNames = matches
      .map((match) => ({
        inputName: String(match.reviewPayload?.input?.name ?? '').trim().toLowerCase(),
        candidate: match.reviewPayload?.candidate ?? null,
      }))
      .filter((entry): entry is { inputName: string; candidate: NonNullable<PersonMatch['reviewPayload']>['candidate'] } => Boolean(entry.inputName && entry.candidate));

    const nextRecords = (currentParsedFile.preview.records as PreviewRecord[]).map((record) => {
      const directCandidate = candidateByInputRef.get(record.sourceRowRef) ?? null;
      const recordName = String(record.donorName ?? record.displayName ?? '').trim().toLowerCase();
      const inferredCandidate = directCandidate ?? inputNames.find((entry) => entry.inputName === recordName)?.candidate ?? null;
      if (!inferredCandidate) return record;

      const canonicalFirstName = String(inferredCandidate.firstName ?? '').trim();
      const canonicalLastName = String(inferredCandidate.lastName ?? '').trim();
      const canonicalName = [canonicalFirstName, canonicalLastName].filter(Boolean).join(' ').trim();
      if (!canonicalName) return record;

      const nextRawValues = { ...getPreviewRecordRawValues(record) };
      fullNameHeaders.forEach((header) => {
        nextRawValues[header] = canonicalName;
      });
      if (firstNameHeader) nextRawValues[firstNameHeader] = canonicalFirstName;
      if (lastNameHeader) nextRawValues[lastNameHeader] = canonicalLastName;

      return {
        ...record,
        donorName: canonicalName,
        displayName: canonicalName,
        firstName: canonicalFirstName || String(record.firstName ?? ''),
        lastName: canonicalLastName || String(record.lastName ?? ''),
        email: String(inferredCandidate.email ?? record.email ?? ''),
        phone: String(inferredCandidate.phone ?? record.phone ?? ''),
        rawValues: nextRawValues,
        values: nextRawValues,
      } as PreviewRecord;
    });

    return {
      ...currentParsedFile,
      preview: {
        ...currentParsedFile.preview,
        records: nextRecords,
      },
    };
  }

  function getCompactSourceRef(sourceRef: string | null | undefined) {
    if (!sourceRef) return { primary: '—', context: null as string | null };
    const parts = sourceRef.split(':').filter(Boolean);
    const primary = parts[parts.length - 1] || sourceRef;
    const context = parts.length > 1 ? parts.slice(0, -1).join(' · ') : null;
    return { primary, context };
  }

  function describeRepresentativeSource(record: PreviewRecord) {
    const primary = getCompactSourceRef(record.sourceRowRef).primary;
    const mergedRefs = (mergedSourceRefsByRepresentative.get(record.sourceRowRef) ?? []).map((ref) => getCompactSourceRef(ref).primary);
    if (mergedRefs.length === 0) return primary;
    return `${primary} (merged ${mergedRefs.join(', ')})`;
  }

  function startMergedRecordEdit(record: PreviewRecord) {
    setEditingMergedRecordRef(record.sourceRowRef);
    setEditingMergedDraft({
      firstName: String(record.firstName ?? ''),
      lastName: String(record.lastName ?? ''),
      organizationName: String(record.organizationName ?? ''),
      householdName: String(record.householdName ?? ''),
      email: String(record.email ?? ''),
      phone: String(record.phone ?? ''),
      address: String(record.address ?? ''),
      city: String(record.city ?? ''),
      state: String(record.state ?? ''),
      postalCode: String(record.postalCode ?? ''),
      country: String(record.country ?? ''),
      assignedStaff: String(record.assignedStaff ?? ''),
      tags: Array.isArray(record.tags) ? record.tags.join('; ') : String(record.tags ?? ''),
      amount: String(record.amount ?? ''),
      fund: String(record.fund ?? ''),
      appeal: String(record.appeal ?? ''),
      memo: String(record.memo ?? ''),
      ...Object.fromEntries(Object.entries(getPreviewRecordRawValues(record)).map(([header, value]) => [`raw:${header}`, String(value ?? '')])),
    });
  }

  function selectPreviewHeader(header: string, options?: { additive?: boolean }) {
    setSelectedPreviewHeader(header);
    setSelectedPreviewRowRef(null);
    setActivePreviewCell(null);
    setSelectedPreviewHeaders((current) => {
      if (!options?.additive) return [header];
      return current.includes(header) ? current.filter((item) => item !== header) : [...current, header];
    });
    setSelectedPreviewRowRefs([]);
  }

  function selectPreviewRow(rowRef: string, options?: { additive?: boolean }) {
    setSelectedPreviewRowRef(rowRef);
    setSelectedPreviewHeader(null);
    setActivePreviewCell(null);
    setSelectedPreviewRowRefs((current) => {
      if (!options?.additive) return [rowRef];
      return current.includes(rowRef) ? current.filter((item) => item !== rowRef) : [...current, rowRef];
    });
    setSelectedPreviewHeaders([]);
  }

  function selectPreviewCell(rowRef: string, header: string, options?: { additive?: boolean }) {
    setSelectedPreviewRowRef(rowRef);
    setSelectedPreviewHeader(header);
    setActivePreviewCell({ rowRef, header });
    setSelectedPreviewHeaders(options?.additive ? Array.from(new Set([...selectedPreviewHeaders, header])) : [header]);
    setSelectedPreviewRowRefs(options?.additive ? Array.from(new Set([...selectedPreviewRowRefs, rowRef])) : [rowRef]);
  }

  function updateParsedRowCellValue(row: ParsedFile['rows'][number], header: string, value: string) {
    return {
      ...row,
      values: {
        ...row.values,
        [header]: value,
      },
    };
  }

  function updatePreviewRecordCellValue(record: PreviewRecord, header: string, value: string) {
    const nextRecord = {
      ...record,
      rawValues: {
        ...getPreviewRecordRawValues(record),
        [header]: value,
      },
    } as PreviewRecord;
    if (record.values) {
      nextRecord.values = {
        ...record.values,
        [header]: value,
      };
    }
    return nextRecord;
  }

  function buildPreviewRecordWithRenamedHeader(record: PreviewRecord, previousHeader: string, nextHeader: string) {
    const nextRawValues = { ...getPreviewRecordRawValues(record) };
    const nextValues = record.values ? { ...record.values } : undefined;
    if (Object.prototype.hasOwnProperty.call(nextRawValues, previousHeader)) {
      nextRawValues[nextHeader] = nextRawValues[previousHeader];
      delete nextRawValues[previousHeader];
    }
    if (nextValues && Object.prototype.hasOwnProperty.call(nextValues, previousHeader)) {
      nextValues[nextHeader] = String(nextValues[previousHeader] ?? '');
      delete nextValues[previousHeader];
    }
    return {
      ...record,
      rawValues: nextRawValues,
      ...(nextValues ? { values: nextValues } : {}),
    };
  }

  function buildPreviewRecordWithoutHeader(record: PreviewRecord, header: string) {
    const nextRawValues = { ...getPreviewRecordRawValues(record) };
    const nextValues = record.values ? { ...record.values } : undefined;
    delete nextRawValues[header];
    if (nextValues) delete nextValues[header];
    return {
      ...record,
      rawValues: nextRawValues,
      ...(nextValues ? { values: nextValues } : {}),
    };
  }

  function buildParsedSourceRowWithRenamedHeader(row: ParsedFile['rows'][number], previousHeader: string, nextHeader: string) {
    const nextValues = { ...row.values };
    if (Object.prototype.hasOwnProperty.call(nextValues, previousHeader)) {
      nextValues[nextHeader] = nextValues[previousHeader];
      delete nextValues[previousHeader];
    }
    return { ...row, values: nextValues };
  }

  function buildParsedSourceRowWithoutHeader(row: ParsedFile['rows'][number], header: string) {
    const nextValues = { ...row.values };
    delete nextValues[header];
    return { ...row, values: nextValues };
  }

  function normalizeStructureAfterRowRemoval(currentParsedFile: ParsedFile, nextRows: ParsedFile['rows']) {
    const removedRowCount = Math.max(0, currentParsedFile.rows.length - nextRows.length);
    return {
      ...currentParsedFile.structureAnalysis,
      rawRowCount: Math.max(nextRows.length, currentParsedFile.structureAnalysis.rawRowCount - removedRowCount),
      dataRowCount: Math.max(nextRows.length, currentParsedFile.structureAnalysis.dataRowCount - removedRowCount),
      rowRoleSummary: {
        ...currentParsedFile.structureAnalysis.rowRoleSummary,
        data: Math.max(nextRows.length, currentParsedFile.structureAnalysis.rowRoleSummary.data - removedRowCount),
      },
      removedRows: currentParsedFile.structureAnalysis.removedRows + removedRowCount,
    };
  }

  function closePreviewHeaderRename() {
    setEditingPreviewHeader(null);
    setEditingPreviewHeaderDraft('');
  }

  function startPreviewHeaderRename(header: string) {
    setSelectedPreviewHeader(header);
    setSelectedPreviewRowRef(null);
    setEditingPreviewHeader(header);
    setEditingPreviewHeaderDraft(header);
    setPreviewTableContextMenu(null);
  }

  function matchParsedRowToPreviewRow(rowRef: string, parsedRowRef: string) {
    const compact = getCompactSourceRef(rowRef).primary;
    return parsedRowRef === rowRef || parsedRowRef === compact;
  }

  function moveItemInList<T>(items: T[], fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  async function persistNonLedgerStructureChange(
    nextParsedFile: ParsedFile,
    nextSchema: ResolvedSchema | null,
    nextMessage: string,
    options: { resetReviewState?: boolean; nextTaxonomyState?: SessionTaxonomyState | null } = {},
  ) {
    const nextTaxonomyState = options.nextTaxonomyState ?? (
      !isLedgerFile && nextParsedFile.preview
        ? buildTaxonomyState(nextParsedFile, nextSchema, options.resetReviewState ? null : taxonomyState)
        : null
    );
    const nextPersonResult = options.resetReviewState ? null : personResult;
    const nextHouseholdResult = options.resetReviewState ? null : householdResult;

    setParsedFile(nextParsedFile);
    setSchema(nextSchema);
    setTaxonomyState(nextTaxonomyState);
    setPreviewTableContextMenu(null);
    closePreviewHeaderRename();

    if (options.resetReviewState) {
      setPersonResult(null);
      setHouseholdResult(null);
      setEntityModelResult(null);
      setMergeDecisions(new Map());
      setFinalHouseholdDrafts({});
      setFinalAttributionDrafts({});
      setOrganizationGraphDrafts({});
      setEditingMergedRecordRef(null);
      setEditingMergedDraft({});
      setNonLedgerReviewPanel('duplicate');
    }
    setDraggingPreviewRowRef(null);
    setPreviewRowDropTarget(null);

    if (!sessionId) {
      setMessage(nextMessage);
      return;
    }

    setIsLoading(true);
    try {
      const nextStatus = deriveSessionStatus(rows, preflight, receipts);
      const session = await saveSession(sessionId, rows, nextStatus, preflight, nextPersonResult, nextHouseholdResult, nextParsedFile, nextSchema, nextTaxonomyState);
      applySession(session, nextMessage, options.resetReviewState ? { nextNonLedgerReviewPanel: 'duplicate' } : undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save table structure changes.');
    } finally {
      setIsLoading(false);
    }
  }

  async function persistNonLedgerValueChange(nextParsedFile: ParsedFile, nextMessage: string) {
    setParsedFile(nextParsedFile);
    setPreviewTableContextMenu(null);

    if (!sessionId) {
      setMessage(nextMessage);
      return;
    }

    setIsLoading(true);
    try {
      const nextStatus = deriveSessionStatus(rows, preflight, receipts);
      const session = await saveSession(sessionId, rows, nextStatus, preflight, personResult, householdResult, nextParsedFile, schema, taxonomyState);
      applySession(session, nextMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save table cell changes.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleStartFresh() {
    setMessage('Started a fresh review workspace. Upload a file to begin a new session.');
    setParsedFile(null);
    setSchema(null);
    setRows([]);
    setGuardrails([]);
    setBlockingIssues([]);
    setReceipts([]);
    setPreflight(null);
    setFallbackFileName(null);
    setPersonResult(null);
    setHouseholdResult(null);
    setTaxonomyResult(null);
    setTaxonomyState(null);
    setAuditResult(null);
    setEntityModelResult(null);
    setMergeDecisions(new Map());
    setFinalHouseholdDrafts({});
    setFinalAttributionDrafts({});
    setOrganizationGraphDrafts({});
    setPendingIngestPayload(null);
    setPendingWorkbookSheetReview(null);
    setSessionId(null);
    setSessionStatus('review');
    setSessionUpdatedAt(null);
    setExpandedAnalyticsItemId(null);
    setAnalyticsWorkspace(buildDefaultAnalyticsWorkspace());
    setAnalyticsSavedViewDraft('');
    setReviewAnalyticsData(null);
    setPreviewSourceFocus('all');
  }

  async function applyPreviewCellChanges(changes: Array<{ rowRef: string; header: string; value: string }>, nextMessage: string) {
    if (!parsedFile?.preview || changes.length === 0) return;
    const changeMap = new Map(changes.map((change) => [`${change.rowRef}::${change.header}`, change.value]));
    const nextPreviewRecords = (parsedFile.preview.records as PreviewRecord[]).map((record) => {
      let nextRecord = record;
      visibleNonLedgerTableHeaders.forEach((header) => {
        const value = changeMap.get(`${record.sourceRowRef}::${header}`);
        if (value == null) return;
        nextRecord = updatePreviewRecordCellValue(nextRecord, header, value);
      });
      return nextRecord;
    });
    const nextParsedRows = parsedFile.rows.map((row) => {
      let nextRow = row;
      visibleNonLedgerTableHeaders.forEach((header) => {
        const rowMatches = nextPreviewRecords.find((record) => matchParsedRowToPreviewRow(record.sourceRowRef, row.ref));
        const rowRef = rowMatches?.sourceRowRef;
        if (!rowRef) return;
        const value = changeMap.get(`${rowRef}::${header}`);
        if (value == null) return;
        nextRow = updateParsedRowCellValue(nextRow, header, value);
      });
      return nextRow;
    });
    await persistNonLedgerValueChange(
      {
        ...parsedFile,
        rows: nextParsedRows,
        preview: {
          ...parsedFile.preview,
          records: nextPreviewRecords,
        },
      },
      nextMessage,
    );
  }

  async function commitPreviewHeaderRename(previousHeader: string) {
    if (!parsedFile || editingPreviewHeader !== previousHeader) return;
    const nextHeader = editingPreviewHeaderDraft.trim();
    if (!nextHeader) {
      setMessage('Column name cannot be empty.');
      return;
    }
    if (nextHeader === previousHeader) {
      closePreviewHeaderRename();
      return;
    }
    if (parsedFile.headers.some((header) => header !== previousHeader && header.toLowerCase() === nextHeader.toLowerCase())) {
      setMessage('Column name already exists in this table.');
      return;
    }

    const nextParsedFile: ParsedFile = {
      ...parsedFile,
      headers: parsedFile.headers.map((header) => header === previousHeader ? nextHeader : header),
      rows: parsedFile.rows.map((row) => buildParsedSourceRowWithRenamedHeader(row, previousHeader, nextHeader)),
      preview: parsedFile.preview
        ? {
          ...parsedFile.preview,
          records: parsedFile.preview.records.map((record) => buildPreviewRecordWithRenamedHeader(record as PreviewRecord, previousHeader, nextHeader)),
        }
        : parsedFile.preview,
    };
    const nextSchema = schema
      ? {
        ...schema,
        fieldMap: Object.fromEntries(
          Object.entries(schema.fieldMap ?? {}).map(([fieldKey, header]) => [fieldKey, header === previousHeader ? nextHeader : header]),
        ),
      }
      : schema;

    setHiddenPreviewHeaders((current) => current.map((header) => header === previousHeader ? nextHeader : header));
    setNonLedgerColumnWidths((current) => {
      if (!(previousHeader in current)) return current;
      const nextWidths = { ...current, [nextHeader]: current[previousHeader] };
      delete nextWidths[previousHeader];
      return nextWidths;
    });
    setEditingMergedDraft((current) => {
      if (!(`raw:${previousHeader}` in current)) return current;
      const nextDraft = { ...current, [`raw:${nextHeader}`]: current[`raw:${previousHeader}`] };
      delete nextDraft[`raw:${previousHeader}`];
      return nextDraft;
    });
    setSelectedPreviewHeader(nextHeader);

    await persistNonLedgerStructureChange(nextParsedFile, nextSchema, `Renamed column ${formatPreviewHeaderLabel(previousHeader)} to ${formatPreviewHeaderLabel(nextHeader)}.`);
  }

  async function handleDeletePreviewColumn(header: string) {
    if (!parsedFile || parsedFile.headers.length <= 1) {
      setMessage('The table must keep at least one column.');
      return;
    }

    const removedMappedFieldKeys = Object.entries(schema?.fieldMap ?? {})
      .filter(([, mappedHeader]) => mappedHeader === header)
      .map(([fieldKey]) => fieldKey);
    const nextParsedFile: ParsedFile = {
      ...parsedFile,
      headers: parsedFile.headers.filter((candidate) => candidate !== header),
      rows: parsedFile.rows.map((row) => buildParsedSourceRowWithoutHeader(row, header)),
      preview: parsedFile.preview
        ? {
          ...parsedFile.preview,
          records: parsedFile.preview.records.map((record) => buildPreviewRecordWithoutHeader(record as PreviewRecord, header)),
        }
        : parsedFile.preview,
    };
    const nextSchema = schema
      ? {
        ...schema,
        fieldMap: Object.fromEntries(Object.entries(schema.fieldMap ?? {}).filter(([, mappedHeader]) => mappedHeader !== header)),
        unresolvedFields: Array.from(new Set([...schema.unresolvedFields, ...removedMappedFieldKeys])),
      }
      : schema;

    setHiddenPreviewHeaders((current) => current.filter((candidate) => candidate !== header));
    setNonLedgerColumnWidths((current) => {
      if (!(header in current)) return current;
      const nextWidths = { ...current };
      delete nextWidths[header];
      return nextWidths;
    });
    setSelectedPreviewHeader(null);

    await persistNonLedgerStructureChange(
      nextParsedFile,
      nextSchema,
      `Removed column ${formatPreviewHeaderLabel(header)}. Duplicate review and household state were cleared because the source structure changed.`,
      { resetReviewState: true },
    );
  }

  async function handleDeletePreviewColumns(headers: string[]) {
    const uniqueHeaders = Array.from(new Set(headers)).filter((header) => nonLedgerTableHeaders.includes(header));
    if (uniqueHeaders.length === 0) return;
    if (uniqueHeaders.length === 1) {
      await handleDeletePreviewColumn(uniqueHeaders[0]);
      return;
    }
    if (!parsedFile || parsedFile.headers.length - uniqueHeaders.length <= 0) {
      setMessage('The table must keep at least one column.');
      return;
    }
    const removedMappedFieldKeys = Object.entries(schema?.fieldMap ?? {})
      .filter(([, mappedHeader]) => uniqueHeaders.includes(String(mappedHeader)))
      .map(([fieldKey]) => fieldKey);
    const nextParsedFile: ParsedFile = {
      ...parsedFile,
      headers: parsedFile.headers.filter((candidate) => !uniqueHeaders.includes(candidate)),
      rows: parsedFile.rows.map((row) => {
        let nextRow = row;
        uniqueHeaders.forEach((header) => {
          nextRow = buildParsedSourceRowWithoutHeader(nextRow, header);
        });
        return nextRow;
      }),
      preview: parsedFile.preview
        ? {
          ...parsedFile.preview,
          records: parsedFile.preview.records.map((record) => {
            let nextRecord = record as PreviewRecord;
            uniqueHeaders.forEach((header) => {
              nextRecord = buildPreviewRecordWithoutHeader(nextRecord, header);
            });
            return nextRecord;
          }),
        }
        : parsedFile.preview,
    };
    const nextSchema = schema
      ? {
        ...schema,
        fieldMap: Object.fromEntries(Object.entries(schema.fieldMap ?? {}).filter(([, mappedHeader]) => !uniqueHeaders.includes(String(mappedHeader)))),
        unresolvedFields: Array.from(new Set([...schema.unresolvedFields, ...removedMappedFieldKeys])),
      }
      : schema;
    setSelectedPreviewHeader(null);
    setSelectedPreviewHeaders([]);
    await persistNonLedgerStructureChange(
      nextParsedFile,
      nextSchema,
      `Removed ${uniqueHeaders.length} columns. Duplicate review and household state were cleared because the source structure changed.`,
      { resetReviewState: true },
    );
  }

  async function handleDeletePreviewRow(rowRef: string) {
    if (!parsedFile?.preview) return;
    const nextPreviewRecords = parsedFile.preview.records.filter((record) => (record as PreviewRecord).sourceRowRef !== rowRef) as PreviewRecord[];
    const nextParsedRows = parsedFile.rows.filter((row) => !matchParsedRowToPreviewRow(rowRef, row.ref));
    const nextParsedFile: ParsedFile = {
      ...parsedFile,
      rows: nextParsedRows,
      structureAnalysis: normalizeStructureAfterRowRemoval(parsedFile, nextParsedRows),
      preview: {
        ...parsedFile.preview,
        summary: {
          ...parsedFile.preview.summary,
          rowCount: nextPreviewRecords.length,
        },
        records: nextPreviewRecords,
      },
    };

    setSelectedPreviewRowRef(null);

    await persistNonLedgerStructureChange(
      nextParsedFile,
      schema,
      `Removed row ${getCompactSourceRef(rowRef).primary}. Duplicate review and household state were cleared because the source rows changed.`,
      { resetReviewState: true },
    );
  }

  async function handleDeletePreviewRows(rowRefs: string[]) {
    const uniqueRowRefs = Array.from(new Set(rowRefs)).filter((rowRef) => previewBaseRecords.some((record) => record.sourceRowRef === rowRef));
    if (uniqueRowRefs.length === 0) return;
    if (uniqueRowRefs.length === 1) {
      await handleDeletePreviewRow(uniqueRowRefs[0]);
      return;
    }
    if (!parsedFile?.preview) return;
    const nextPreviewRecords = (parsedFile.preview.records as PreviewRecord[]).filter((record) => !uniqueRowRefs.includes(record.sourceRowRef));
    const nextParsedRows = parsedFile.rows.filter((row) => !uniqueRowRefs.some((rowRef) => matchParsedRowToPreviewRow(rowRef, row.ref)));
    const nextParsedFile: ParsedFile = {
      ...parsedFile,
      rows: nextParsedRows,
      structureAnalysis: normalizeStructureAfterRowRemoval(parsedFile, nextParsedRows),
      preview: {
        ...parsedFile.preview,
        summary: {
          ...parsedFile.preview.summary,
          rowCount: nextPreviewRecords.length,
        },
        records: nextPreviewRecords,
      },
    };
    setSelectedPreviewRowRef(null);
    setSelectedPreviewRowRefs([]);
    await persistNonLedgerStructureChange(
      nextParsedFile,
      schema,
      `Removed ${uniqueRowRefs.length} rows. Duplicate review and household state were cleared because the source rows changed.`,
      { resetReviewState: true },
    );
  }

  async function handleInsertPreviewColumn(targetHeader: string, position: 'left' | 'right') {
    if (!parsedFile) return;
    const targetIndex = parsedFile.headers.findIndex((header) => header === targetHeader);
    if (targetIndex < 0) return;
    let nextHeader = 'new_column';
    let suffix = 2;
    const existing = new Set(parsedFile.headers.map((header) => header.toLowerCase()));
    while (existing.has(nextHeader.toLowerCase())) {
      nextHeader = `new_column_${suffix}`;
      suffix += 1;
    }
    const insertIndex = position === 'left' ? targetIndex : targetIndex + 1;
    const nextHeaders = [...parsedFile.headers.slice(0, insertIndex), nextHeader, ...parsedFile.headers.slice(insertIndex)];
    const nextParsedFile: ParsedFile = {
      ...parsedFile,
      headers: nextHeaders,
      rows: parsedFile.rows.map((row) => {
        const nextValues = { ...row.values };
        nextValues[nextHeader] = '';
        return { ...row, values: Object.fromEntries(nextHeaders.map((header) => [header, nextValues[header] ?? ''])) };
      }),
      preview: parsedFile.preview ? {
        ...parsedFile.preview,
        records: parsedFile.preview.records.map((record) => updatePreviewRecordCellValue(record as PreviewRecord, nextHeader, '')),
      } : parsedFile.preview,
    };
    setSelectedPreviewHeader(nextHeader);
    setSelectedPreviewHeaders([nextHeader]);
    await persistNonLedgerStructureChange(
      nextParsedFile,
      schema,
      `Inserted column ${formatPreviewHeaderLabel(nextHeader)} ${position} of ${formatPreviewHeaderLabel(targetHeader)}.`,
    );
  }

  async function handleMovePreviewColumn(header: string, targetHeader: string) {
    if (!parsedFile || header === targetHeader) return;
    const fromIndex = parsedFile.headers.findIndex((item) => item === header);
    const toIndex = parsedFile.headers.findIndex((item) => item === targetHeader);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextHeaders = moveItemInList(parsedFile.headers, fromIndex, toIndex);
    const nextParsedFile: ParsedFile = {
      ...parsedFile,
      headers: nextHeaders,
      rows: parsedFile.rows.map((row) => ({ ...row, values: Object.fromEntries(nextHeaders.map((item) => [item, row.values[item] ?? ''])) })),
      preview: parsedFile.preview ? {
        ...parsedFile.preview,
        records: parsedFile.preview.records.map((record) => {
          const rawValues = getPreviewRecordRawValues(record as PreviewRecord);
          return {
            ...(record as PreviewRecord),
            rawValues: Object.fromEntries(nextHeaders.map((item) => [item, rawValues[item] ?? ''])),
          };
        }),
      } : parsedFile.preview,
    };
    setSelectedPreviewHeader(header);
    await persistNonLedgerStructureChange(nextParsedFile, schema, `Moved column ${formatPreviewHeaderLabel(header)}.`);
  }

  async function handleInsertPreviewRow(targetRowRef: string, position: 'above' | 'below') {
    if (!parsedFile?.preview) return;
    const targetPreviewIndex = parsedFile.preview.records.findIndex((record) => (record as PreviewRecord).sourceRowRef === targetRowRef);
    if (targetPreviewIndex < 0) return;

    const sourceRowRefBase = getCompactSourceRef(targetRowRef).primary || 'row';
    let nextSourceRowRef = `${sourceRowRefBase}:inserted`;
    let suffix = 2;
    const existingRowRefs = new Set((parsedFile.preview.records as PreviewRecord[]).map((record) => record.sourceRowRef));
    while (existingRowRefs.has(nextSourceRowRef)) {
      nextSourceRowRef = `${sourceRowRefBase}:inserted-${suffix}`;
      suffix += 1;
    }

    const nextPreviewRecord = createBlankPreviewRecord(fileClass, parsedFile.headers, nextSourceRowRef);
    const previewInsertIndex = position === 'above' ? targetPreviewIndex : targetPreviewIndex + 1;
    const nextPreviewRecords = [
      ...(parsedFile.preview.records.slice(0, previewInsertIndex) as PreviewRecord[]),
      nextPreviewRecord,
      ...(parsedFile.preview.records.slice(previewInsertIndex) as PreviewRecord[]),
    ];

    const targetParsedIndex = parsedFile.rows.findIndex((row) => matchParsedRowToPreviewRow(targetRowRef, row.ref));
    const parsedInsertIndex = targetParsedIndex >= 0
      ? (position === 'above' ? targetParsedIndex : targetParsedIndex + 1)
      : parsedFile.rows.length;
    const nextParsedRow = {
      ref: nextSourceRowRef,
      values: Object.fromEntries(parsedFile.headers.map((header) => [header, ''])),
    };
    const nextParsedRows = [
      ...parsedFile.rows.slice(0, parsedInsertIndex),
      nextParsedRow,
      ...parsedFile.rows.slice(parsedInsertIndex),
    ];

    const nextParsedFile: ParsedFile = {
      ...parsedFile,
      rows: nextParsedRows,
      structureAnalysis: {
        ...parsedFile.structureAnalysis,
        rawRowCount: parsedFile.structureAnalysis.rawRowCount + 1,
        dataRowCount: parsedFile.structureAnalysis.dataRowCount + 1,
        rowRoleSummary: {
          ...parsedFile.structureAnalysis.rowRoleSummary,
          data: parsedFile.structureAnalysis.rowRoleSummary.data + 1,
        },
      },
      preview: {
        ...parsedFile.preview,
        summary: {
          ...parsedFile.preview.summary,
          rowCount: nextPreviewRecords.length,
        },
        records: nextPreviewRecords,
      },
    };

    setSelectedPreviewRowRef(nextSourceRowRef);

    await persistNonLedgerStructureChange(
      nextParsedFile,
      schema,
      `Inserted a blank row ${position} ${getCompactSourceRef(targetRowRef).primary}. Duplicate review and household state were cleared because the source rows changed.`,
      { resetReviewState: true },
    );
  }

  function getPreviewRowDropPosition(event: ReactDragEvent<HTMLTableRowElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY - bounds.top < bounds.height / 2 ? 'before' as const : 'after' as const;
  }

  async function handleMovePreviewRow(rowRef: string, targetRowRef: string, position: 'before' | 'after') {
    if (!parsedFile?.preview || rowRef === targetRowRef) return;
    const previewIndex = parsedFile.preview.records.findIndex((record) => (record as PreviewRecord).sourceRowRef === rowRef);
    const targetPreviewIndex = parsedFile.preview.records.findIndex((record) => (record as PreviewRecord).sourceRowRef === targetRowRef);
    if (previewIndex < 0 || targetPreviewIndex < 0) return;

    let nextPreviewIndex = targetPreviewIndex;
    if (position === 'after') nextPreviewIndex += 1;
    if (previewIndex < nextPreviewIndex) nextPreviewIndex -= 1;
    if (previewIndex === nextPreviewIndex) {
      setDraggingPreviewRowRef(null);
      setPreviewRowDropTarget(null);
      return;
    }

    const parsedIndex = parsedFile.rows.findIndex((row) => matchParsedRowToPreviewRow(rowRef, row.ref));
    const targetParsedIndex = parsedFile.rows.findIndex((row) => matchParsedRowToPreviewRow(targetRowRef, row.ref));
    const nextPreviewRecords = moveItemInList(parsedFile.preview.records as PreviewRecord[], previewIndex, nextPreviewIndex);
    let nextParsedRows = parsedFile.rows;
    if (parsedIndex >= 0 && targetParsedIndex >= 0) {
      let nextParsedInsertIndex = targetParsedIndex;
      if (position === 'after') nextParsedInsertIndex += 1;
      if (parsedIndex < nextParsedInsertIndex) nextParsedInsertIndex -= 1;
      nextParsedRows = moveItemInList(parsedFile.rows, parsedIndex, nextParsedInsertIndex);
    }

    const nextParsedFile: ParsedFile = {
      ...parsedFile,
      rows: nextParsedRows,
      preview: {
        ...parsedFile.preview,
        records: nextPreviewRecords,
      },
    };
    setSelectedPreviewRowRef(rowRef);

    await persistNonLedgerStructureChange(
      nextParsedFile,
      schema,
      `Moved row ${getCompactSourceRef(rowRef).primary} ${position === 'before' ? 'above' : 'below'} ${getCompactSourceRef(targetRowRef).primary}. Duplicate review and household state were cleared because row order changed.`,
      { resetReviewState: true },
    );
  }

  async function handleSaveMergedRecordEdit() {
    if (!parsedFile?.preview || !editingMergedRecordRef) return;
    const debugRowRef = editingMergedRecordRef;
    const normalizedDraft: EditablePreviewDraft = {
      ...editingMergedDraft,
      tags: editingMergedDraft.tags
        ? editingMergedDraft.tags.split(';').map((value) => value.trim()).filter(Boolean)
        : [],
    };
    const previousRecord = (parsedFile.preview.records as PreviewRecord[]).find((record) => record.sourceRowRef === debugRowRef) ?? null;
    const nextPreview = {
      ...parsedFile.preview,
      records: parsedFile.preview.records.map((record) =>
        record.sourceRowRef === debugRowRef ? applyPreviewRecordEdits(record, normalizedDraft) : record,
      ),
    };
    const nextRecord = (nextPreview.records as PreviewRecord[]).find((record) => record.sourceRowRef === debugRowRef) ?? null;
    console.groupCollapsed('[TransformHub debug] Saving merged row edit ' + debugRowRef);
    console.debug('draft', normalizedDraft);
    console.debug('beforeSaveRecord', previousRecord ? {
      sourceRowRef: previousRecord.sourceRowRef,
      donorName: previousRecord.donorName ?? null,
      displayName: previousRecord.displayName ?? null,
      firstName: previousRecord.firstName ?? null,
      lastName: previousRecord.lastName ?? null,
      rawValues: getPreviewRecordRawValues(previousRecord),
    } : null);
    console.debug('afterLocalApplyRecord', nextRecord ? {
      sourceRowRef: nextRecord.sourceRowRef,
      donorName: nextRecord.donorName ?? null,
      displayName: nextRecord.displayName ?? null,
      firstName: nextRecord.firstName ?? null,
      lastName: nextRecord.lastName ?? null,
      rawValues: getPreviewRecordRawValues(nextRecord),
    } : null);
    console.groupEnd();
    const nextParsedFile = { ...parsedFile, preview: nextPreview };
    setParsedFile(nextParsedFile);
    setDebugPreviewRowRef(debugRowRef);
    setEditingMergedRecordRef(null);
    setEditingMergedDraft({});

    if (sessionId) {
      setIsLoading(true);
      try {
        const nextStatus = deriveSessionStatus(rows, preflight, receipts);
        const session = await saveSession(sessionId, rows, nextStatus, preflight, personResult, householdResult, nextParsedFile, schema, taxonomyState);
        applySession(session, 'Merged result updated in this session.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to save merged result edits.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setMessage('Merged result updated locally.');
  }

  async function persistTaxonomyState(nextTaxonomyState: SessionTaxonomyState, nextMessage: string, reviewAction?: Record<string, unknown>) {
    setTaxonomyState(nextTaxonomyState);
    if (!sessionId) {
      setMessage(nextMessage);
      return;
    }
    setIsLoading(true);
    try {
      const nextStatus = deriveSessionStatus(rows, preflight, receipts);
      const session = await saveSession(sessionId, rows, nextStatus, preflight, personResult, householdResult, parsedFile, schema, nextTaxonomyState, reviewAction);
      applySession(session, nextMessage, { nextNonLedgerReviewPanel: 'taxonomy' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save taxonomy review changes.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRunTaxonomyReview() {
    if (isLedgerFile || !parsedFile?.preview) return;
    setIsRunningTaxonomyReview(true);
    try {
      const nextTaxonomyState = buildTaxonomyState(parsedFile, schema, taxonomyState);
      const openGroups = nextTaxonomyState.candidateGroups.filter((group) => group.status === 'pending' && !nextTaxonomyState.dismissedCandidateIds.includes(group.id)).length;
      await persistTaxonomyState(
        nextTaxonomyState,
        `Taxonomy review ready: ${openGroups} open candidate group${openGroups === 1 ? '' : 's'}.`,
      );
    } finally {
      setIsRunningTaxonomyReview(false);
    }
  }
  async function handleMergeTaxonomyCandidate(candidateId: string, suggestedLabel: string) {
    if (!taxonomyState) return;
    setPendingTaxonomyMergeCandidateId(candidateId);
    setPendingTaxonomyMergeLabel(suggestedLabel);
  }

  function closeTaxonomyMergeDialog() {
    setPendingTaxonomyMergeCandidateId(null);
    setPendingTaxonomyMergeLabel('');
  }

  async function confirmTaxonomyMergeDialog() {
    if (!taxonomyState || !pendingTaxonomyMergeCandidateId) return;
    const nextLabel = pendingTaxonomyMergeLabel.trim();
    if (!nextLabel) return;
    await persistTaxonomyState(
      mergeTaxonomyCandidate(taxonomyState, pendingTaxonomyMergeCandidateId, nextLabel),
      'Merged taxonomy group into ' + nextLabel + '.',
      {
        actionType: 'map_taxonomy',
        entityType: 'taxonomy_group',
        entityId: pendingTaxonomyMergeCandidateId,
        payload: { canonicalValue: nextLabel },
        reason: 'Merged likely duplicate taxonomy labels into one canonical value.',
      },
    );
    closeTaxonomyMergeDialog();
  }

  function startResolvedTaxonomyGroupEdit(groupId: string, canonicalLabel: string) {
    setEditingResolvedTaxonomyGroupId(groupId);
    setEditingResolvedTaxonomyLabel(canonicalLabel);
  }

  function cancelResolvedTaxonomyGroupEdit() {
    setEditingResolvedTaxonomyGroupId(null);
    setEditingResolvedTaxonomyLabel('');
  }

  async function saveResolvedTaxonomyGroupEdit() {
    if (!taxonomyState || !editingResolvedTaxonomyGroupId) return;
    const nextLabel = editingResolvedTaxonomyLabel.trim();
    if (!nextLabel) return;
    await persistTaxonomyState(
      renameResolvedTaxonomyGroup(taxonomyState, editingResolvedTaxonomyGroupId, nextLabel),
      'Updated taxonomy label to ' + nextLabel + '.',
    );
    cancelResolvedTaxonomyGroupEdit();
  }



  async function handleDismissTaxonomyCandidate(candidateId: string) {
    if (!taxonomyState) return;
    await persistTaxonomyState(
      dismissTaxonomyCandidate(taxonomyState, candidateId),
      'Kept taxonomy candidates separate.',
      {
        actionType: 'dismiss_taxonomy_mapping',
        entityType: 'taxonomy_group',
        entityId: candidateId,
        payload: {},
        reason: 'Reviewer kept taxonomy values separate.',
      },
    );
  }

  async function handleToggleTaxonomyColumn(header: string, included: boolean) {
    if (!taxonomyState || !parsedFile) return;
    const next = updateTaxonomyScanColumn(taxonomyState, header, included);
    const rebuilt = buildTaxonomyState(parsedFile, schema, next);
    await persistTaxonomyState(rebuilt, included ? 'Included ' + header + ' in taxonomy scan.' : 'Removed ' + header + ' from taxonomy scan.');
  }

  function updateFinalHouseholdDraft(householdId: string, patch: Partial<FinalHouseholdDraft>) {
    setFinalHouseholdDrafts((current) => {
      const existing = current[householdId];
      if (!existing) return current;
      return {
        ...current,
        [householdId]: {
          ...existing,
          ...patch,
        },
      };
    });
  }

  function updateFinalAttributionDraft(sourceRowRef: string, patch: Partial<PreviewAttributionDraft>) {
    setFinalAttributionDrafts((current) => {
      const existing = current[sourceRowRef];
      if (!existing) return current;
      return {
        ...current,
        [sourceRowRef]: {
          ...existing,
          ...patch,
        },
      };
    });
  }

  function buildDraftForRoleSelection(
    attributionDraft: PreviewAttributionDraft,
    matchedPerson: CanonicalPerson | null,
    assignedHouseholdId: string | null,
    nextRole: 'primary' | 'secondary' | 'organization' | 'unassigned',
  ): PreviewAttributionDraft {
    if (!matchedPerson) return attributionDraft;
    const householdMembers = assignedHouseholdId
      ? (householdResult?.households.find((household) => household.id === assignedHouseholdId)?.memberIds ?? [])
      : [];
    const otherMemberId = householdMembers.find((memberId) => memberId !== matchedPerson.id) ?? attributionDraft.secondaryPersonId ?? null;

    if (nextRole === 'secondary') {
      return {
        ...attributionDraft,
        primaryPersonId: otherMemberId,
        secondaryPersonId: matchedPerson.id,
      };
    }

    if (nextRole === 'organization') {
      return {
        ...attributionDraft,
        mode: 'org_match',
        primaryPersonId: matchedPerson.id,
        secondaryPersonId: otherMemberId,
      };
    }

    return {
      ...attributionDraft,
      primaryPersonId: matchedPerson.id,
      secondaryPersonId: otherMemberId,
      mode: attributionDraft.mode === 'org_match' && nextRole === 'primary' ? 'person' : attributionDraft.mode,
    };
  }

  function assignPersonToHouseholdDraft(personId: string, nextHouseholdId: string) {
    if (!householdResult) return;
    const nextHouseholds = householdResult.households.map((household) => {
      const withoutPerson = household.memberIds.filter((memberId) => memberId !== personId);
      if (household.id === nextHouseholdId) {
        return {
          ...household,
          memberIds: Array.from(new Set([...withoutPerson, personId])),
          primaryPersonId: household.primaryPersonId ?? personId,
        };
      }
      return {
        ...household,
        memberIds: withoutPerson,
        primaryPersonId: household.primaryPersonId === personId ? (withoutPerson[0] ?? null) : household.primaryPersonId,
      };
    }).filter((household) => household.memberIds.length > 0);
    setHouseholdResult({ ...householdResult, households: nextHouseholds });
    setFinalHouseholdDrafts((current) => {
      const nextDrafts = { ...current };
      Object.entries(nextDrafts).forEach(([householdId, draft]) => {
        const nextHousehold = nextHouseholds.find((candidate) => candidate.id === householdId);
        if (!nextHousehold) {
          delete nextDrafts[householdId];
          return;
        }
        if (draft.primaryPersonId === personId && !nextHousehold.memberIds.includes(personId)) {
          nextDrafts[householdId] = { ...draft, primaryPersonId: nextHousehold.memberIds[0] ?? null };
        }
      });
      const targetDraft = nextDrafts[nextHouseholdId];
      if (targetDraft && !targetDraft.primaryPersonId) {
        nextDrafts[nextHouseholdId] = { ...targetDraft, primaryPersonId: personId };
      }
      return nextDrafts;
    });
    setEntityModelResult(null);
  }

  function setPersonAsHouseholdPrimary(personId: string, householdId: string) {
    if (!householdResult) return;
    setHouseholdResult({
      ...householdResult,
      households: householdResult.households.map((household) => household.id === householdId ? { ...household, primaryPersonId: personId } : household),
    });
    updateFinalHouseholdDraft(householdId, { primaryPersonId: personId });
    setEntityModelResult(null);
  }

  function removeMemberFromHousehold(householdId: string, personId: string) {
    if (!householdResult) return;
    setPendingHouseholdMemberRemovalKey(null);
    const targetPerson = peopleById.get(personId) ?? null;
    const targetDisplayKey = buildHouseholdMemberDisplayKey(targetPerson);
    const removedPersonIds = new Set(
      (householdResult.households.find((household) => household.id === householdId)?.memberIds ?? []).filter((memberId) => {
        const member = peopleById.get(memberId) ?? null;
        return buildHouseholdMemberDisplayKey(member) === targetDisplayKey;
      }),
    );
    if (removedPersonIds.size === 0) removedPersonIds.add(personId);
    setRemovedPersonIdsByHousehold((current) => ({
      ...current,
      [householdId]: Array.from(new Set([...(current[householdId] ?? []), ...removedPersonIds])),
    }));
    const nextHouseholds = householdResult.households
      .map((household) => {
        if (household.id !== householdId) return household;
        const nextMemberIds = household.memberIds.filter((memberId) => !removedPersonIds.has(memberId));
        return {
          ...household,
          memberIds: nextMemberIds,
          primaryPersonId: household.primaryPersonId && removedPersonIds.has(household.primaryPersonId) ? (nextMemberIds[0] ?? null) : household.primaryPersonId,
        };
      })
      .filter((household) => household.memberIds.length > 0);

    setHouseholdResult({ ...householdResult, households: nextHouseholds });
    setFinalHouseholdDrafts((current) => {
      const nextDrafts = { ...current };
      const targetDraft = nextDrafts[householdId];
      if (targetDraft) {
        const survivingMembers = nextHouseholds.find((household) => household.id === householdId)?.memberIds ?? [];
        if (survivingMembers.length === 0) {
          delete nextDrafts[householdId];
        } else if (targetDraft.primaryPersonId && removedPersonIds.has(targetDraft.primaryPersonId)) {
          nextDrafts[householdId] = { ...targetDraft, primaryPersonId: survivingMembers[0] ?? null };
        }
      }
      return nextDrafts;
    });
    setFinalAttributionDrafts((current) => {
      const nextDrafts = { ...current };
      previewRecords.forEach((record) => {
        const resolvedPersonIds = getResolvedPreviewDistinctPersonIds(record.sourceRowRef);
        const matchedPerson = resolvedPersonIds.length === 1 ? peopleById.get(resolvedPersonIds[0]) ?? null : null;
        const defaultHouseholdIds = Array.from(new Set(
          resolvedPersonIds
            .map((resolvedPersonId) => householdIdByPersonId.get(resolvedPersonId) ?? null)
            .filter((resolvedHouseholdId): resolvedHouseholdId is string => Boolean(resolvedHouseholdId)),
        ));
        const defaultHouseholdId = defaultHouseholdIds.length === 1 ? defaultHouseholdIds[0] : null;
        const members = defaultHouseholdId
          ? ((householdResult.households.find((household) => household.id === defaultHouseholdId)?.memberIds ?? [])
            .map((memberId) => peopleById.get(memberId))
            .filter((member): member is CanonicalPerson => Boolean(member)))
          : [];
        const currentDraft = current[record.sourceRowRef] ?? buildInitialAttributionDraft(record, members, matchedPerson);
        const assignedHouseholdId = currentDraft.householdRemoved ? null : (currentDraft.householdId ?? defaultHouseholdId);
        const referencesRemovedMember = resolvedPersonIds.some((resolvedPersonId) => removedPersonIds.has(resolvedPersonId))
          || (currentDraft.primaryPersonId ? removedPersonIds.has(currentDraft.primaryPersonId) : false)
          || (currentDraft.secondaryPersonId ? removedPersonIds.has(currentDraft.secondaryPersonId) : false);

        if (!referencesRemovedMember || assignedHouseholdId !== householdId) return;

        const nextSecondaryPersonId = currentDraft.secondaryPersonId && removedPersonIds.has(currentDraft.secondaryPersonId) ? null : currentDraft.secondaryPersonId;
        nextDrafts[record.sourceRowRef] = {
          ...currentDraft,
          primaryPersonId: currentDraft.primaryPersonId && !removedPersonIds.has(currentDraft.primaryPersonId)
            ? currentDraft.primaryPersonId
            : (matchedPerson?.id && !removedPersonIds.has(matchedPerson.id) ? matchedPerson.id : personId),
          secondaryPersonId: nextSecondaryPersonId,
          mode: currentDraft.mode === 'joint_split' && !nextSecondaryPersonId ? 'person' : currentDraft.mode,
          householdId: null,
          householdRemoved: true,
        };
      });
      return nextDrafts;
    });
    setEmbeddedHouseholdDrafts((current) => {
      const nextDrafts = { ...current };
      const stagedHouseholdDrafts = nextDrafts[householdId];
      if (stagedHouseholdDrafts) {
        const filteredEntries = Object.entries(stagedHouseholdDrafts).filter(([sourceRowRef, draft]) => (
          (!draft.primaryPersonId || !removedPersonIds.has(draft.primaryPersonId))
          && (!draft.secondaryPersonId || !removedPersonIds.has(draft.secondaryPersonId))
          && !getResolvedPreviewDistinctPersonIds(sourceRowRef).some((resolvedPersonId) => removedPersonIds.has(resolvedPersonId))
        ));
        if (filteredEntries.length > 0) {
          nextDrafts[householdId] = Object.fromEntries(filteredEntries);
        } else {
          delete nextDrafts[householdId];
        }
      }
      return nextDrafts;
    });
    setEntityModelResult(null);
    setMessage('Removed member from this household. Linked transactions remain in the full review table, but no longer count toward this household.');
  }

  function updateOrganizationDrafts(organizationId: string, nextOrganizationName: string) {
    if (!entityModelResult) return;
    const linkedDonationRowIds = new Set(
      entityModelResult.donations
        .filter((donation) => donation.canonical_org_id === organizationId)
        .map((donation) => donation.rowId)
        .filter(Boolean),
    );
    entityModelResult.attributions
      .filter((entry) => entry.organizationId === organizationId)
      .forEach((entry) => {
        const donation = entityModelResult.donations.find((candidate) => candidate.id === entry.donationId);
        if (donation?.rowId) linkedDonationRowIds.add(donation.rowId);
      });

    setFinalAttributionDrafts((current) => {
      const nextDrafts = { ...current };
      linkedDonationRowIds.forEach((rowId) => {
        if (!rowId) return;
        const existing = nextDrafts[rowId];
        if (!existing) return;
        nextDrafts[rowId] = {
          ...existing,
          organizationName: nextOrganizationName,
          mode: existing.mode === 'person' ? 'org_match' : existing.mode,
        };
      });
      return nextDrafts;
    });
    setOrganizationGraphDrafts((current) => ({ ...current, [organizationId]: nextOrganizationName }));
    setEntityModelResult(null);
  }

  async function handleApplyFinalHouseholdEdits() {
    if (!parsedFile?.preview || !householdResult) return;
    const householdDraftByPersonId = new Map<string, FinalHouseholdDraft>();
    const nextHouseholds = householdResult.households.map((household) => {
      const members = household.memberIds
        .map((memberId) => peopleById.get(memberId))
        .filter((member): member is CanonicalPerson => Boolean(member));
      const draft = finalHouseholdDrafts[household.id] ?? buildInitialHouseholdDraft(household, members);
      household.memberIds.forEach((memberId) => householdDraftByPersonId.set(memberId, draft));
      return {
        ...household,
        label: draft.label.trim() || household.label || buildHouseholdLabel(members, household.lastName),
        primaryPersonId: draft.primaryPersonId,
        formalSalutation: draft.formalSalutation.trim() || household.formalSalutation || buildFormalSalutation(members),
        informalSalutation: draft.informalSalutation.trim() || household.informalSalutation || buildInformalSalutation(members),
        eventSalutation: draft.eventSalutation.trim() || household.eventSalutation || buildFormalSalutation(members),
        addressee: draft.addressee.trim() || household.addressee || buildAddressee(members),
        salutationText: draft.formalSalutation.trim() || household.salutationText || buildFormalSalutation(members),
      };
    });
    const nextPreview = {
      ...parsedFile.preview,
      records: parsedFile.preview.records.map((record) => {
        const resolvedPersonIds = getResolvedPreviewDistinctPersonIds(record.sourceRowRef);
        const personId = resolvedPersonIds.length === 1 ? resolvedPersonIds[0] : null;
        const attribution = finalAttributionDrafts[record.sourceRowRef] ?? getPreviewRecordAttribution(record);
        if (!personId) {
          return attribution ? { ...record, attribution } : record;
        }
        const draft = householdDraftByPersonId.get(personId);
        const nextRecord = draft
          ? applyPreviewRecordEdits(record, { householdName: draft.label.trim() || draft.addressee.trim() })
          : record;
        return attribution ? { ...nextRecord, attribution } : nextRecord;
      }),
    };
    const nextParsedFile = { ...parsedFile, preview: nextPreview };
    const nextHouseholdResult = { ...householdResult, households: nextHouseholds };
    setParsedFile(nextParsedFile);
    setHouseholdResult(nextHouseholdResult);
    setEntityModelResult(null);

    if (!sessionId) {
      setMessage('Applied final household edits locally.');
      return;
    }

    setIsLoading(true);
    try {
      const nextStatus = deriveSessionStatus(rows, preflight, receipts);
      const session = await saveSession(
        sessionId,
        rows,
        nextStatus,
        preflight,
        personResult,
        nextHouseholdResult,
        nextParsedFile,
        schema,
        taxonomyState,
        {
          actionType: 'apply_household_review',
          entityType: 'household',
          entityId: null,
          payload: {
            householdCount: nextHouseholdResult.households.length,
            attributionDraftCount: Object.keys(finalAttributionDrafts).length,
          },
          reason: 'Applied reviewed household and attribution changes to cleaned data.',
        },
      );
      applySession(session, 'Applied final household edits to this session.', { nextNonLedgerReviewPanel: 'household' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to apply final household edits.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefreshEntityModel(persist = false) {
    const persons = personResult?.persons ?? [];
    const households = householdResult?.households ?? [];
    if (!parsedFile?.preview?.records || persons.length === 0) {
      setMessage('Run Step 1 cleanup before previewing merge tables.');
      return;
    }
    setIsRefreshingEntityModel(true);
    try {
      const result = await fetchEntityModel(rows, persons, households, parsedFile.preview.records as PreviewRecord[], sessionId ?? undefined, persist);
      setEntityModelResult(result);
      setMessage(`Merge tables preview loaded: ${result.summary.personCount} canonical profiles · ${result.summary.donationCount} canonical transactions · ${result.attributions.length} transaction links.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load the merge tables preview.');
    } finally {
      setIsRefreshingEntityModel(false);
    }
  }

  async function handleGenerateReviewAnalytics() {
    if (isGeneratingReviewAnalytics) return;
    setIsGeneratingReviewAnalytics(true);
    try {
      const result = await fetchReviewAnalytics(
        rows,
        canonicalPeople,
        householdResult?.households ?? [],
        reviewedPreviewRecords,
        taxonomyState,
        finalAttributionDrafts,
        fileClass,
        sessionId ?? undefined,
        true,
      );
      setReviewAnalyticsData(result as { generatedAt: string; cards: ReviewOutcomeCard[]; items: AnalyticsWorkspaceItem[]; suggestedViews: Array<{ id: string; name: string; outcomeId: string; detailId: string }>; provenance?: { layer: string; source: string; actionCount: number; reproducible: boolean; postReviewReady?: boolean } });
      setMessage('Generated post-review analytics from the reviewed clean layer.');
    } catch (error) {
      setReviewAnalyticsData(null);
      setMessage(error instanceof Error ? error.message : 'Failed to generate post-review analytics.');
    } finally {
      setIsGeneratingReviewAnalytics(false);
    }
  }

  function applySession(
    session: TransformSession,
    nextMessage?: string,
    options?: { nextNonLedgerReviewPanel?: NonLedgerReviewPanel },
  ) {
    startTransition(() => {
      const nextPendingColumnMerges = getPendingColumnMerges(session.parsedFile);
      const nextDefaultPanel = options?.nextNonLedgerReviewPanel ?? (nextPendingColumnMerges.length > 0 ? 'schema_union' : 'duplicate');
      setSessionId(session.id);
      setSessionStatus(session.status);
      setSessionUpdatedAt(session.updatedAt);
      setParsedFile(session.parsedFile);
      setAnalyticsWorkspace(session.parsedFile.analyticsWorkspace ?? buildDefaultAnalyticsWorkspace());
      setSelectedOutcomeCardId((session.parsedFile.analyticsWorkspace?.selectedOutcomeId as ReviewOutcomeId | null) ?? 'revenue_at_risk');
      setPlatform(session.parsedFile.platform);
      setSchema(session.schema);
      setSessionStructure(session.structure ?? null);
      setTaxonomyState(session.taxonomyState ?? null);
      setGuardrails(session.guardrails);
      setBlockingIssues(session.blockingIssues ?? []);
      setRows(session.rows);
      setPreflight(session.preflight);
      setReceipts(session.receipts);
      setPersonResult(session.personResult ?? null);
      setHouseholdResult(session.householdResult ?? null);
      setMergeDecisions(buildMergeDecisionMapFromStructure(session));
      setNonLedgerReviewPanel(nextDefaultPanel);
      setActiveOperatorIntent(null);
      if (nextMessage) setMessage(nextMessage);
    });
  }

  function getAttributionDraftForRecord(record: PreviewRecord) {
    const resolvedPersonIds = getResolvedPreviewDistinctPersonIds(record.sourceRowRef);
    const matchedPerson = resolvedPersonIds.length === 1 ? peopleById.get(resolvedPersonIds[0]) ?? null : null;
    const resolvedHouseholdIds = getResolvedPreviewHouseholdIds(record.sourceRowRef);
    const defaultHouseholdId = resolvedHouseholdIds.length === 1 ? resolvedHouseholdIds[0] : (matchedPerson ? householdIdByPersonId.get(matchedPerson.id) ?? null : null);
    const members = defaultHouseholdId
      ? ((householdResult?.households.find((household) => household.id === defaultHouseholdId)?.memberIds ?? [])
        .map((memberId) => peopleById.get(memberId))
        .filter((member): member is CanonicalPerson => Boolean(member)))
      : [];
    const draft = finalAttributionDrafts[record.sourceRowRef] ?? buildInitialAttributionDraft(record, members, matchedPerson);
    return {
      matchedPerson,
      draft,
      assignedHouseholdId: draft.householdRemoved ? null : (draft.householdId ?? defaultHouseholdId),
    };
  }

  function getEditableDraftKeyForHeader(header: string): string | null {
    const mappedEntry = Object.entries(editablePreviewFieldToCanonicalKey).find(([, canonicalKey]) => {
      const mappedHeader = (schema?.fieldMap as Record<string, string> | undefined)?.[canonicalKey];
      return mappedHeader === header;
    });
    return mappedEntry?.[0] ?? null;
  }

  function updateInlinePreviewCell(header: string, value: string) {
    const draftKey = getEditableDraftKeyForHeader(header);
    setEditingMergedDraft((current) => {
      if (draftKey) return { ...current, [draftKey]: value };
      return { ...current, [`raw:${header}`]: value };
    });
  }

  function updateRecordCreditAmount(record: PreviewRecord, value: string) {
    const normalized = value.trim();
    updateFinalAttributionDraft(record.sourceRowRef, { creditAmount: normalized ? parseCurrencyAmount(normalized) : null });
  }

  function buildDraftForModeSelection(
    attributionDraft: PreviewAttributionDraft,
    rawAmount: number | null,
    nextMode: PreviewAttributionDraft['mode'],
  ): PreviewAttributionDraft {
    return {
      ...attributionDraft,
      mode: nextMode,
      creditAmount: nextMode === 'soft_credit' ? 0 : (rawAmount ?? attributionDraft.creditAmount),
    };
  }

  function updateRecordRole(
    record: PreviewRecord,
    attributionDraft: PreviewAttributionDraft,
    matchedPerson: CanonicalPerson | null,
    assignedHouseholdId: string | null,
    nextRole: 'primary' | 'secondary' | 'organization' | 'unassigned',
  ) {
    updateFinalAttributionDraft(record.sourceRowRef, buildDraftForRoleSelection(attributionDraft, matchedPerson, assignedHouseholdId, nextRole));
  }

  function getRecordRole(
    record: PreviewRecord,
    attributionDraft: PreviewAttributionDraft,
    matchedPerson: CanonicalPerson | null,
  ): 'primary' | 'secondary' | 'organization' | 'unassigned' {
    if (!matchedPerson) return attributionDraft.mode === 'org_match' ? 'organization' : 'unassigned';
    if (attributionDraft.secondaryPersonId === matchedPerson.id) return 'secondary';
    return 'primary';
  }

  function getRecordCreditPercent(
    attributionDraft: PreviewAttributionDraft,
    role: 'primary' | 'secondary' | 'organization' | 'unassigned',
  ): number {
    if (attributionDraft.mode !== 'joint_split') return role === 'secondary' ? 0 : 100;
    if (role === 'secondary') return Math.max(0, 100 - attributionDraft.splitPercent);
    return attributionDraft.splitPercent;
  }

  function getDisplayCreditAmount(
    attributionDraft: PreviewAttributionDraft,
    rawAmount: number | null,
    role: 'primary' | 'secondary' | 'organization' | 'unassigned',
  ) {
    const baseAmount = attributionDraft.creditAmount ?? rawAmount ?? 0;
    if (attributionDraft.mode === 'soft_credit') return 0;
    if (attributionDraft.mode === 'joint_split') {
      const pct = role === 'secondary' ? Math.max(0, 100 - attributionDraft.splitPercent) : attributionDraft.splitPercent;
      return Math.round((baseAmount * (pct / 100)) * 100) / 100;
    }
    return baseAmount;
  }

  function updateEmbeddedHouseholdDraft(householdId: string, sourceRowRef: string, nextDraft: PreviewAttributionDraft) {
    setEmbeddedHouseholdDrafts((current) => ({
      ...current,
      [householdId]: {
        ...(current[householdId] ?? {}),
        [sourceRowRef]: nextDraft,
      },
    }));
  }

  function applyEmbeddedHouseholdChanges(householdId: string) {
    const staged = embeddedHouseholdDrafts[householdId];
    if (!staged || Object.keys(staged).length === 0) return;
    setFinalAttributionDrafts((current) => ({
      ...current,
      ...staged,
    }));
    setEmbeddedHouseholdDrafts((current) => {
      const next = { ...current };
      delete next[householdId];
      return next;
    });
    setMessage('Applied household attribution changes to the full review table.');
  }

  function jumpToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openOutcomeAction(action: ReviewOutcomeAction) {
    if (action === 'household') {
      setNonLedgerReviewPanel('household');
      window.setTimeout(() => jumpToSection('th-review'), 80);
      return;
    }
    if (action === 'taxonomy') {
      setNonLedgerReviewPanel('taxonomy');
      window.setTimeout(() => jumpToSection('th-review'), 80);
      return;
    }
    if (action === 'duplicate') {
      setNonLedgerReviewPanel('duplicate');
      window.setTimeout(() => jumpToSection('th-review'), 80);
      return;
    }
    window.setTimeout(() => jumpToSection('th-review-table'), 80);
  }

  async function persistAnalyticsWorkspace(nextWorkspace: AnalyticsWorkspaceState, nextMessage?: string) {
    setAnalyticsWorkspace(nextWorkspace);
    if (!parsedFile) return;
    const nextParsedFile: ParsedFile = {
      ...parsedFile,
      analyticsWorkspace: nextWorkspace,
    };
    setParsedFile(nextParsedFile);
    if (!sessionId) {
      if (nextMessage) setMessage(nextMessage);
      return;
    }
    setIsLoading(true);
    try {
      const nextStatus = deriveSessionStatus(rows, preflight, receipts);
      const session = await saveSession(sessionId, rows, nextStatus, preflight, personResult, householdResult, nextParsedFile, schema, taxonomyState);
      applySession(session, nextMessage, { nextNonLedgerReviewPanel: 'outcomes' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save analytics workspace.');
    } finally {
      setIsLoading(false);
    }
  }

  function updateAnalyticsFilters(patch: Partial<AnalyticsWorkspaceFilters>) {
    if (!activeOutcomeDetailId) return;
    setAnalyticsWorkspace((current) => ({
      ...current,
      filtersByDetail: {
        ...current.filtersByDetail,
        [activeOutcomeDetailId]: {
          ...(current.filtersByDetail[activeOutcomeDetailId] ?? buildDefaultAnalyticsFilters()),
          ...patch,
        },
      },
    }));
  }

  function selectOutcomeDetail(detailId: string) {
    setAnalyticsWorkspace((current) => ({
      ...current,
      selectedDetailIdByOutcome: {
        ...current.selectedDetailIdByOutcome,
        [selectedOutcomeCardId]: detailId,
      },
    }));
  }

  async function handleSaveAnalyticsView() {
    if (!activeOutcomeDetailId) return;
    const name = analyticsSavedViewDraft.trim();
    if (!name) {
      setMessage('Name the saved view first.');
      return;
    }
    const nextWorkspace: AnalyticsWorkspaceState = {
      ...analyticsWorkspace,
      savedViews: [
        {
          id: `view-${Date.now()}`,
          name,
          outcomeId: selectedOutcomeCardId,
          detailId: activeOutcomeDetailId,
          filters: activeAnalyticsFilters,
          createdAt: new Date().toISOString(),
        },
        ...analyticsWorkspace.savedViews,
      ],
    };
    setAnalyticsSavedViewDraft('');
    await persistAnalyticsWorkspace(nextWorkspace, `Saved analytics view "${name}".`);
  }

  async function applyAnalyticsSavedView(view: AnalyticsSavedView) {
    const nextWorkspace: AnalyticsWorkspaceState = {
      ...analyticsWorkspace,
      selectedOutcomeId: view.outcomeId,
      selectedDetailIdByOutcome: {
        ...analyticsWorkspace.selectedDetailIdByOutcome,
        [view.outcomeId]: view.detailId,
      },
      filtersByDetail: {
        ...analyticsWorkspace.filtersByDetail,
        [view.detailId]: view.filters,
      },
    };
    setSelectedOutcomeCardId(view.outcomeId as ReviewOutcomeId);
    await persistAnalyticsWorkspace(nextWorkspace, `Applied analytics view "${view.name}".`);
  }

  async function deleteAnalyticsSavedView(viewId: string) {
    const nextWorkspace: AnalyticsWorkspaceState = {
      ...analyticsWorkspace,
      savedViews: analyticsWorkspace.savedViews.filter((view) => view.id !== viewId),
    };
    await persistAnalyticsWorkspace(nextWorkspace, 'Removed saved analytics view.');
  }

  function scrollToSelector(selector: string) {
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 140);
  }

  function queueReturnToActiveRow() {
    if (!activeFixRowId) return;
    setPendingReturnRowId(activeFixRowId);
  }

  function restoreReturnRowFocus(nextRowId = pendingReturnRowId) {
    if (!nextRowId) return;
    jumpToSection('th-review');
    scrollToSelector('#th-row-' + nextRowId);
    setPendingReturnRowId(null);
  }

  function focusReviewQueue(nextSpotlight: 'donor-review' | 'identity-review' | 'mapping-review', nextMessage: string) {
    setRowSpotlight(nextSpotlight);
    setActiveOperatorIntent(nextSpotlight === 'donor-review' ? 'review-donors' : nextSpotlight === 'identity-review' ? 'resolve-identities' : 'open-mapping');
    setMessage(nextMessage);
    jumpToSection('th-review');
    scrollToSelector('#th-review tbody tr');
  }

  function clearOperatorFocus() {
    setRowSpotlight('all');
    setActiveOperatorIntent(null);
    setPendingReturnRowId(null);
  }

  function handleOperatorAction(action: 'run-audit' | 'review-donors' | 'resolve-identities' | 'open-mapping') {
    if (action === 'run-audit') {
      void handleRunAuditRules();
      setActiveOperatorIntent('run-audit');
      jumpToSection('th-audit-mode');
      return;
    }

    if (action === 'review-donors') {
      focusReviewQueue('donor-review', 'Spotlighting rows that still need donor-review attention.');
      return;
    }

    if (action === 'resolve-identities') {
      focusReviewQueue('identity-review', 'Spotlighting rows that still need duplicate review.');
      return;
    }

    setRowSpotlight('mapping-review');
    setActiveOperatorIntent('open-mapping');
    setMessage('Jumped to mapping layer and taxonomy exceptions for reconciliation.');
    jumpToSection('th-mapping-layer');
    scrollToSelector('#th-mapping-layer .th-map-rule, #th-mapping-layer .th-map-row');
  }

  async function applyWorkbookSheetReview(review: PendingWorkbookSheetReview) {
    const baseSheet = pickWorkbookBaseSheet(review.workbookSheets);
    const appendSheets = review.workbookSheets
      .filter((sheet) => review.actionsBySheet[sheet.sheetName] === 'append')
      .sort((left, right) => {
        if (left.sheetName === baseSheet.sheetName) return -1;
        if (right.sheetName === baseSheet.sheetName) return 1;
        return scoreWorkbookBaseSheet(right) - scoreWorkbookBaseSheet(left);
      });
    if (appendSheets.length === 0) {
      setMessage('Choose at least one workbook tab to append, or ignore the tabs you do not want.');
      return;
    }

    setActiveUploadLabel(review.payload.fileName);
    setIsLoading(true);
    setMessage(appendSheets.length === 1 ? `Loading ${appendSheets[0].sheetName} from ${review.payload.fileName}...` : `Preparing ${appendSheets.length} workbook tabs from ${review.payload.fileName}...`);

    try {
      const ingestedSheets = [];
      for (const sheet of appendSheets) {
        const result = await ingestFile({
          platform,
          fileName: review.payload.fileName,
          kind: review.payload.kind,
          contents: review.payload.contents,
          contentsBase64: review.payload.contentsBase64,
          selectedWorkbookSheets: [sheet.sheetName],
        });
        if (!result.schema) throw new Error(`Failed to ingest sheet ${sheet.sheetName}.`);
        const returnedSheet = result.parsedFile.sourceSheetName;
        if (returnedSheet && returnedSheet.trim().toLowerCase() !== sheet.sheetName.trim().toLowerCase()) {
          throw new Error(`Sheet mismatch: requested "${sheet.sheetName}" but server returned "${returnedSheet}". Please try again.`);
        }
        ingestedSheets.push({ sheet, result });
      }

      const baseIngest = ingestedSheets[0];
      let combinedPrepared = prepareIncomingUpload(
        baseIngest.result.parsedFile,
        baseIngest.result.schema!,
        baseIngest.result.rows,
        `${review.payload.fileName} · ${baseIngest.sheet.sheetName}`,
        buildUploadNamespace(`${review.payload.fileName}-${baseIngest.sheet.sheetName}`),
      );

      for (const entry of ingestedSheets.slice(1)) {
        const preparedSheet = prepareIncomingUpload(
          entry.result.parsedFile,
          entry.result.schema!,
          entry.result.rows,
          `${review.payload.fileName} · ${entry.sheet.sheetName}`,
          buildUploadNamespace(`${review.payload.fileName}-${entry.sheet.sheetName}`),
        );
        const decisions = buildAppendColumnDecisions(combinedPrepared.parsedFile, preparedSheet.parsedFile, `${review.payload.fileName} · ${entry.sheet.sheetName}`, {
          existingSchema: combinedPrepared.schema,
          incomingSchema: preparedSheet.schema,
        });
        const merged = mergeUploadIntoExisting({
          currentParsedFile: combinedPrepared.parsedFile,
          currentSchema: combinedPrepared.schema,
          currentRows: combinedPrepared.rows,
          incomingParsedFile: preparedSheet.parsedFile,
          incomingSchema: preparedSheet.schema,
          incomingRows: preparedSheet.rows,
          sourceFile: `${review.payload.fileName} · ${entry.sheet.sheetName}`,
          columnDecisions: decisions,
        });
        combinedPrepared = {
          parsedFile: merged.parsedFile,
          schema: merged.schema,
          rows: merged.rows,
        };
      }

      const baseSessionId = sessionId ?? baseIngest.result.sessionId!;
      const canAppend = Boolean(
        parsedFile
        && schema
        && ((schema.fileClass === 'ledger' && combinedPrepared.schema.fileClass === 'ledger') || (schema.fileClass !== 'ledger' && combinedPrepared.schema.fileClass !== 'ledger')),
      );

      if (canAppend && parsedFile && schema) {
        const appendColumnDecisions = buildAppendColumnDecisions(parsedFile, combinedPrepared.parsedFile, `${review.payload.fileName} · workbook`, {
          existingSchema: schema,
          incomingSchema: combinedPrepared.schema,
        });
        const appliedMerge = mergeUploadIntoExisting({
          currentParsedFile: parsedFile,
          currentSchema: schema,
          currentRows: rows,
          incomingParsedFile: combinedPrepared.parsedFile,
          incomingSchema: combinedPrepared.schema,
          incomingRows: combinedPrepared.rows,
          sourceFile: `${review.payload.fileName} · workbook`,
          columnDecisions: appendColumnDecisions,
        });
        const session = await saveSession(
          sessionId ?? baseSessionId,
          appliedMerge.rows,
          'review',
          null,
          null,
          null,
          appliedMerge.parsedFile,
          appliedMerge.schema,
          taxonomyState,
        );
        setPendingWorkbookSheetReview(null);
        applySession(session, `Loaded ${appendSheets.length} selected workbook tabs from ${review.payload.fileName}.`);
        return;
      }

      const session = await saveSession(
        baseSessionId,
        combinedPrepared.rows,
        'review',
        null,
        null,
        null,
        combinedPrepared.parsedFile,
        combinedPrepared.schema,
        taxonomyState,
      );
      setPendingWorkbookSheetReview(null);
      applySession(
        session,
        `Loaded ${appendSheets.length} selected workbook tabs from ${review.payload.fileName}.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to process the selected workbook tabs.');
    } finally {
      setActiveUploadLabel(null);
      setIsLoading(false);
    }
  }

  async function hydrateUpload(
    payload: UploadPayload & { selectedWorkbookSheets?: string[] },
    forceIngest = false,
    precombinedWorkbookUpload?: { parsedFile: ParsedFile; schema: ResolvedSchema; rows: CanonicalLedgerRow[] },
  ) {
    setActiveUploadLabel(payload.fileName);
    setIsLoading(true);
    setMessage(forceIngest ? 'Continuing ' + payload.fileName + '...' : 'Loading ' + payload.fileName + '...');
    setBlockingIssues([]);
    setReceipts([]);
    setPreflight(null);
    setFallbackFileName(null);
    setPersonResult(null);
    setHouseholdResult(null);
    setTaxonomyResult(null);
    setAuditResult(null);
    setMergeDecisions(new Map());
    setNonLedgerReviewPanel('duplicate');

    try {
      const result = await ingestFile({
        platform,
        fileName: payload.fileName,
        kind: payload.kind,
        contents: payload.contents,
        contentsBase64: payload.contentsBase64,
        sessionId: forceIngest ? sessionId ?? undefined : undefined,
        forceIngest,
        selectedWorkbookSheets: payload.selectedWorkbookSheets,
      });

      if (result.parsedFile.workbookSelectionRequired && result.parsedFile.workbookSheets) {
        setPendingWorkbookSheetReview({
          payload,
          workbookSheets: result.parsedFile.workbookSheets,
          actionsBySheet: buildDefaultWorkbookSheetActions(result.parsedFile.workbookSheets),
        });
        setMessage(`Choose which workbook tabs to combine from ${payload.fileName}. Compatible sheets are preselected.`);
        jumpToSection('th-ingest');
        return;
      }

      const nextTaxonomy = result.taxonomy ?? null;
      const nextAudit = result.audit ?? null;
      const uploadNamespace = buildUploadNamespace(payload.fileName);
      const prepared = precombinedWorkbookUpload
        ? {
            parsedFile: precombinedWorkbookUpload.parsedFile as ParsedFile,
            schema: precombinedWorkbookUpload.schema,
            rows: precombinedWorkbookUpload.rows,
          }
        : prepareIncomingUpload(result.parsedFile, result.schema!, result.rows, payload.fileName, uploadNamespace);
      const mergeStrategy = parsedFile && schema ? getMergeStrategy(schema.fileClass ?? '', prepared.schema.fileClass ?? '') : null;
      const canAppend = result.status !== 'blocked' && Boolean(parsedFile && schema && mergeStrategy !== null);
      let merged: { parsedFile: ParsedFile; schema: ResolvedSchema; rows: CanonicalLedgerRow[]; pendingMergeCount?: number };
      if (canAppend && parsedFile && schema) {
        const appendColumnDecisions = buildAppendColumnDecisions(parsedFile, prepared.parsedFile, payload.fileName, {
          existingSchema: schema,
          incomingSchema: prepared.schema,
        });
        merged = mergeUploadIntoExisting({ currentParsedFile: parsedFile, currentSchema: schema, currentRows: rows, incomingParsedFile: prepared.parsedFile, incomingSchema: prepared.schema, incomingRows: prepared.rows, sourceFile: payload.fileName, columnDecisions: appendColumnDecisions });
      } else {
        merged = { parsedFile: prepared.parsedFile, schema: prepared.schema, rows: prepared.rows, pendingMergeCount: getPendingColumnMerges(prepared.parsedFile).length };
      }
      const nextSchema = merged.schema;
      const nextParsedFile = merged.parsedFile;
      const nextRows = merged.rows;
      const nextStatus = result.status === 'blocked' ? result.status : 'review';
      const nextMessage = result.status === 'blocked'
        ? `Blocked by ${result.blockingIssues.length} blocking issue${result.blockingIssues.length === 1 ? '' : 's'}. Review the report below, then force continue if intentional.`
        : canAppend
            ? `Appended ${prepared.rows.length} row${prepared.rows.length === 1 ? '' : 's'} from ${payload.fileName}. Schema union merged safe columns and queued ${merged.pendingMergeCount ?? 0} column review item${(merged.pendingMergeCount ?? 0) === 1 ? '' : 's'}.`
            : `Loaded ${prepared.rows.length} row${prepared.rows.length === 1 ? '' : 's'} from ${payload.fileName}${payload.selectedWorkbookSheets?.length ? ` · ${payload.selectedWorkbookSheets.length} sheet${payload.selectedWorkbookSheets.length === 1 ? '' : 's'} combined` : ''} · ${nextAudit?.errorCount ?? 0} audit error(s) · ${nextTaxonomy?.unmappedCount ?? 0} taxonomy exception(s).`;
      const nextPreviewRecords = ((nextParsedFile.preview?.records as PreviewRecord[] | undefined) ?? []);
      const nextUploadedPreviewFileClasses = new Set(
        nextPreviewRecords
          .map((record) => record.sourceFileClass ?? record.source_file_class ?? null)
          .filter((value): value is FileClass => Boolean(value)),
      );
      const nextHasTransactionSourceRecords = nextUploadedPreviewFileClasses.has('donor') || nextUploadedPreviewFileClasses.has('ledger');
      const nextHasTransactionLinkFlow = nextHasTransactionSourceRecords
        && Array.from(nextUploadedPreviewFileClasses).some((value) => value !== 'donor' && value !== 'ledger');

      const session = await saveSession(
        result.sessionId!,
        nextRows,
        nextStatus,
        null,
        null,
        null,
        nextParsedFile,
        nextSchema,
      );
      if (result.status === 'blocked') {
        setPendingIngestPayload(payload);
      }
      applySession(session, nextMessage, { nextNonLedgerReviewPanel: nextHasTransactionLinkFlow ? 'matching' : 'duplicate' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to process the file.');
      setParsedFile(null);
      setSchema(null);
      setRows([]);
      setGuardrails([]);
      setBlockingIssues([]);
      setReceipts([]);
      setPreflight(null);
      setSessionId(null);
      setSessionStatus('review');
      setSessionUpdatedAt(null);
      setPendingIngestPayload(null);
    } finally {
      setActiveUploadLabel(null);
      setIsLoading(false);
    }
  }

  async function handleResolvePendingColumnMerge(merge: PendingColumnMerge, action: 'combine' | 'keep_separate' | 'keep_s1' | 'keep_s2') {
    if (!parsedFile) return;
    const nextParsedFile = resolvePendingColumnMergeInParsedFile(parsedFile, merge, action);
    setParsedFile(nextParsedFile);
    const actionMessage = action === 'combine'
      ? `Combined ${merge.incomingHeader} into ${merge.suggestedHeader} with safe value union.`
      : action === 'keep_s1'
        ? `Kept only S1 column ${merge.suggestedHeader}.`
        : action === 'keep_s2'
          ? `Kept only S2 column ${merge.incomingHeader} as ${merge.suggestedHeader}.`
          : `Kept both columns separate by splitting S2 into ${merge.splitHeader}.`;

    if (!sessionId) {
      setMessage(actionMessage);
      return;
    }

    setIsResolvingPendingMerge(true);
    try {
      const nextStatus = deriveSessionStatus(rows, preflight, receipts);
      const session = await saveSession(sessionId, rows, nextStatus, preflight, personResult, householdResult, nextParsedFile, schema, taxonomyState);
      applySession(session, actionMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update the pending column merge.');
    } finally {
      setIsResolvingPendingMerge(false);
    }
  }

  async function handleForceIngest() {
    if (!pendingIngestPayload || !sessionId) return;
    await hydrateUpload(pendingIngestPayload, true);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setActiveUploadLabel(file.name);
    setIsLoading(true);
    setMessage('Loading ' + file.name + '...');
    try {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.xlsx')) {
        const contentsBase64 = await readFileBase64(file);
        await hydrateUpload({ fileName: file.name, kind: 'xlsx', contentsBase64 });
      } else if (lowerName.endsWith('.xls')) {
        setActiveUploadLabel(null);
        setIsLoading(false);
        setMessage('Legacy .xls files are not supported. Save as .xlsx or CSV first.');
      } else {
        const contents = await readFileText(file);
        await hydrateUpload({ fileName: file.name, kind: 'text', contents });
      }
    } catch (error) {
      setActiveUploadLabel(null);
      setIsLoading(false);
      setMessage(error instanceof Error ? error.message : 'Failed to read the selected file.');
    } finally {
      event.target.value = '';
    }
  }

  function handleRowChange(rowId: string, field: keyof CanonicalLedgerRow, value: string) {
    const nextRows = updateCanonicalRow(rows, rowId, { [field]: value });
    setRows(nextRows);
    setReceipts([]);
    setFallbackFileName(null);
    setSessionStatus('review');

    if (preflight || auditResult || taxonomyResult) {
      const inlineWindow = window as typeof window & { __transformHubInlineTimer?: number };
      if (inlineWindow.__transformHubInlineTimer) window.clearTimeout(inlineWindow.__transformHubInlineTimer);
      inlineWindow.__transformHubInlineTimer = window.setTimeout(async () => {
        setIsLoading(true);
        try {
          const result = await runBackendPreflight(nextRows, sessionId ?? undefined);
          setPreflight(result);
          if (result.audit) setAuditResult(result.audit);
          setSessionStatus(deriveSessionStatus(nextRows, result, []));
          setSessionUpdatedAt(new Date().toISOString());
          setMessage(result.valid ? 'Inline fixes cleared the current issues.' : 'Inline issues refreshed after your edits.');
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Inline issue refresh failed.');
        } finally {
          setIsLoading(false);
        }
      }, 700);
    }
  }

  function handleAddBalancingRow(rowId: string) {
    setRows(addBalancingRow(rows, rowId));
    setReceipts([]);
    setPreflight(null);
    setFallbackFileName(null);
    setSessionStatus('review');
  }

  function handleReviewAction(rowId: string, action: 'approved' | 'pending' | 'rejected') {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row;
        if (action === 'approved') return { ...row, review_status: 'approved', needs_review: false, suggested_fix: null };
        if (action === 'rejected') return { ...row, review_status: 'rejected', needs_review: false, suggested_fix: null };
        return { ...row, review_status: 'pending', needs_review: true, suggested_fix: row.suggested_fix ?? 'Pending human review before posting.' };
      }),
    );
    setReceipts([]);
    setPreflight(null);
    setSessionStatus('review');
  }

  async function handleSaveSession() {
    if (!sessionId) { setMessage('Load a file first so there is a backend session to save.'); return; }
    setIsLoading(true);
    try {
      const nextStatus = deriveSessionStatus(rows, preflight, receipts);
      const session = await saveSession(sessionId, rows, nextStatus, preflight, personResult, householdResult, parsedFile, schema, taxonomyState);
      applySession(session, 'Review state saved to the backend session.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save the current session.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReloadSession() {
    if (!sessionId) { setMessage('No backend session exists yet.'); return; }
    setIsLoading(true);
    try {
      const session = await fetchSession(sessionId);
      applySession(session, 'Reloaded the latest saved session snapshot.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to reload the saved session.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRunPreflight() {
    setIsLoading(true);
    try {
      const result = await runBackendPreflight(rows, sessionId ?? undefined);
      setPreflight(result);
      if (result.audit) setAuditResult(result.audit);
      setSessionStatus(deriveSessionStatus(rows, result, []));
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(result.valid ? 'Pre-flight passed. Batch is ready to post.' : 'Inline issue markers updated. Fix highlighted rows and the batch will re-check automatically.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Pre-flight failed.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSimulatePost() {
    setIsLoading(true);
    try {
      const result = await simulateBackendPost(rows, sessionId ?? undefined);
      setRows(result.rows);
      setReceipts(result.receipts);
      setPreflight(result.preflight);
      if (result.audit) setAuditResult(result.audit);
      setSessionStatus(deriveSessionStatus(result.rows, result.preflight, result.receipts));
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(`Posted ${result.receipts.length} journal batch${result.receipts.length === 1 ? '' : 'es'} in simulation.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Posting failed.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExportCsvFallback() {
    setIsLoading(true);
    try {
      const result = await exportCsvFallback(rows, sessionId ?? undefined);
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      setPreflight(result.preflight);
      if (result.audit) setAuditResult(result.audit);
      setFallbackFileName(result.fileName);
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(`Exported ${result.rowCount} approved row${result.rowCount === 1 ? "" : "s"} to CSV fallback.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CSV fallback export failed.");
    } finally {
      setIsLoading(false);
    }
  }
  async function handleRunPersonResolver() {
    const returnRowId = activeFixRowId;
    queueReturnToActiveRow();
    setIsLoading(true);
    setIsRunningPersonResolver(true);
    try {
      const identityRows = buildPreviewIdentityRows();
      if (!isLedgerFile && supportsDuplicateWorkflow) {
        const result = await resolvePersonsBackend(identityRows, undefined, sessionId ?? undefined, {
          usePersistentIdentityMemory: true,
          forceReviewOnAutoMatches: true,
          seedExistingPersonsFromDb: true,
          baselinePlatform: platform,
          baselineFileClass: fileClass,
          persistIdentityMemory: false,
          includeAiSuggestions: false,
        });
        console.groupCollapsed('[TransformHub debug] Donor duplicate check result');
        console.debug('request', {
          baselinePlatform: platform,
          baselineFileClass: fileClass,
          identityRowCount: identityRows.length,
          sessionId: sessionId ?? null,
        });
        console.debug('summary', {
          autoMergedCount: result.autoMergedCount,
          pendingReviewCount: result.pendingReviewCount,
          separated: result.separated,
          personCount: result.persons?.length ?? 0,
          matchCount: result.matches?.length ?? 0,
          txDuplicateMatchCount: ((result as any)?.txDuplicateResult?.matches ?? []).length,
        });
        console.debug('sampleMatches', (result.matches ?? []).slice(0, 5).map((match) => ({
          inputRef: match.inputRef,
          matchedPersonId: match.matchedPersonId ?? null,
          band: match.band,
          decision: match.decision,
          duplicateClass: match.duplicateClass ?? null,
          candidateName: match.reviewPayload?.candidate
            ? [match.reviewPayload.candidate.firstName, match.reviewPayload.candidate.lastName].filter(Boolean).join(' ')
            : null,
          matchedInputRef: match.reviewPayload?.matchedInputRef ?? null,
        })));
        console.groupEnd();
        setPersonResult(result);
        setHouseholdResult(null);
        setMergeDecisions(new Map());
        setSessionUpdatedAt(new Date().toISOString());
        setMessage(`Duplicate check: ${result.autoMergedCount} auto-merged, ${result.pendingReviewCount} pending review, ${result.separated} new.`);
        restoreReturnRowFocus(returnRowId);
        return;
      }

      const result = await resolvePersonsBackend(rows, personResult ? canonicalPeople : undefined, sessionId ?? undefined, {
        usePersistentIdentityMemory: Boolean(sessionId),
        forceReviewOnAutoMatches: true,
        seedExistingPersonsFromDb: Boolean(sessionId) && !personResult,
        baselinePlatform: platform,
        baselineFileClass: fileClass,
        persistIdentityMemory: true,
        includeAiSuggestions: false,
      });
      setPersonResult(result);
      if (result.updatedRows) setRows(result.updatedRows);
      if (result.audit) setAuditResult(result.audit);
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(`Duplicate check: ${result.autoMatched} previously confirmed, ${result.needsReview} pending review, ${result.separated} new.`);
      restoreReturnRowFocus(returnRowId);
    } catch (error) {
      setPendingReturnRowId(null);
      setMessage(error instanceof Error ? error.message : "Duplicate check failed.");
    } finally {
      setIsRunningPersonResolver(false);
      setIsLoading(false);
    }
  }

  async function handleResetPeopleState() {
    const nextStatus = deriveSessionStatus(rows, preflight, receipts);
    setPersonResult(null);
    setHouseholdResult(null);
    setMergeDecisions(new Map());
    setSessionStatus(nextStatus);
    setSessionUpdatedAt(new Date().toISOString());

    if (!sessionId) {
      setMessage('Duplicate check and household state cleared. Run duplicate check again to rebuild from source rows.');
      return;
    }

    setIsLoading(true);
    setIsResettingPeople(true);
    try {
      const session = await saveSession(sessionId, rows, nextStatus, preflight, null, null);
      applySession(session, 'Duplicate check and household state cleared. Run duplicate check again to rebuild from source rows.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to reset people state.');
    } finally {
      setIsResettingPeople(false);
      setIsLoading(false);
    }
  }

  async function handleMergeAllPeopleReviews(matches: PersonMatch[]) {
    const pendingMatches = matches.filter((match) => isPendingDuplicateReview(match, mergeDecisions));
    if (pendingMatches.length === 0 || !personResult) return;

    setIsLoading(true);
    setMessage(`Merging ${pendingMatches.length} review item${pendingMatches.length === 1 ? '' : 's'}...`);

    try {
      if (sessionId && isLedgerFile) {
        let latestResult: Awaited<ReturnType<typeof persistMergeDecisionBackend>> | null = null;
        for (const match of pendingMatches) {
          latestResult = await persistMergeDecisionBackend(sessionId, match.inputRef, 'confirmed', match.matchedPersonId);
        }

        if (latestResult) {
          setRows(latestResult.updatedRows);
          setMergeDecisions(buildMergeDecisionMap(latestResult.updatedRows, latestResult.auditDecisions));
          if (latestResult.audit) setAuditResult(latestResult.audit);
        }

        setExpandedPeopleReviewRef(null);
        setSessionUpdatedAt(new Date().toISOString());
        setMessage(`Merged ${pendingMatches.length} review item${pendingMatches.length === 1 ? '' : 's'}.`);
        return;
      }

      const pendingRefs = new Set(pendingMatches.map((match) => match.inputRef));
      const matchedPersonByRef = new Map(
        pendingMatches
          .filter((match) => Boolean(match.matchedPersonId))
          .map((match) => [match.inputRef, match.matchedPersonId as string]),
      );
      const nextMergeDecisions = new Map(mergeDecisions);
      pendingMatches.forEach((match) => nextMergeDecisions.set(match.inputRef, 'confirmed'));

      const nextPersonResult: PersonResolverResult = {
        ...personResult,
        matches: personResult.matches.map((candidate) =>
          pendingRefs.has(candidate.inputRef)
            ? { ...candidate, decision: 'auto', matchedPersonId: matchedPersonByRef.get(candidate.inputRef) ?? candidate.matchedPersonId }
            : candidate,
        ),
      };

      const nextRows = isLedgerFile
        ? rows.map((row) => {
            const matchedPersonId = matchedPersonByRef.get(row.source_row_ref);
            return matchedPersonId ? { ...row, canonical_person_id: matchedPersonId } : row;
          })
        : rows;

      setMergeDecisions(nextMergeDecisions);
      setPersonResult(nextPersonResult);
      if (isLedgerFile) setRows(nextRows);
      setHouseholdResult(null);
      setExpandedPeopleReviewRef(null);
      const nextParsedFile = applyConfirmedMergeNamesToParsedFile(parsedFile, pendingMatches);
      if (nextParsedFile !== parsedFile) setParsedFile(nextParsedFile);

      if (sessionId) {
        // Persist permanent decisions regardless of file class — fire-and-forget so UI isn't blocked.
        for (const match of pendingMatches) {
          persistMergeDecisionBackend(sessionId, match.inputRef, 'confirmed', match.matchedPersonId, undefined, undefined, match.reviewPayload?.input?.name, match.inputKey).catch(() => {});
        }
        const nextStatus = deriveSessionStatus(nextRows, preflight, receipts);
        const session = await saveSession(sessionId, nextRows, nextStatus, preflight, nextPersonResult, null, nextParsedFile);
        applySession(session, `Merged ${pendingMatches.length} review item${pendingMatches.length === 1 ? '' : 's'}.`);
        setMergeDecisions(nextMergeDecisions);
        setPersonResult(nextPersonResult);
        if (nextParsedFile !== parsedFile) setParsedFile(nextParsedFile);
        return;
      }

      setMessage(`Merged ${pendingMatches.length} review item${pendingMatches.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to merge all shown review items.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRunHouseholdResolver() {
    if (!personResult) return;
    if (!isLedgerFile && supportsDuplicateWorkflow && pendingPeopleReviews > 0) {
      setMessage(`Resolve ${pendingPeopleReviews} pending duplicate match${pendingPeopleReviews === 1 ? "" : "es"} before continuing to households.`);
      return;
    }

    setIsLoading(true);
    setIsRunningHouseholdResolver(true);
    try {
      const result = await resolveHouseholdsBackend(canonicalPeople, sessionId ?? undefined);
      setHouseholdResult(result);
      setNonLedgerReviewPanel('household');
      if (result.updatedRows) setRows(result.updatedRows);
      if (result.audit) setAuditResult(result.audit);
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(`HouseholdResolver: ${result.households.length} household${result.households.length === 1 ? "" : "s"} formed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "HouseholdResolver failed.");
    } finally {
      setIsRunningHouseholdResolver(false);
      setIsLoading(false);
    }
  }

  async function handleMergeDecision(match: PersonMatch, action: "confirmed" | "separated") {
    if (!sessionId || !isLedgerFile) {
      const nextMergeDecisions = new Map(mergeDecisions).set(match.inputRef, action);
      const nextPersonResult: PersonResolverResult | null = personResult
        ? {
            ...personResult,
            matches: personResult.matches.map((candidate) =>
              candidate.inputRef === match.inputRef
                ? {
                    ...candidate,
                    decision: action === "confirmed" ? 'auto' as const : 'new' as const,
                    matchedPersonId: action === "confirmed" ? match.matchedPersonId : null,
                  }
                : candidate,
            ),
          }
        : personResult;
      const nextRows = action === "confirmed" && match.matchedPersonId
        ? rows.map((row) =>
            row.source_row_ref === match.inputRef
              ? { ...row, canonical_person_id: match.matchedPersonId }
              : row,
          )
        : rows;

      setMergeDecisions(nextMergeDecisions);
      setPersonResult(nextPersonResult);
      setHouseholdResult(null);
      if (action === "confirmed" && match.matchedPersonId) {
        setRows(nextRows);
      }
      const nextParsedFile = action === 'confirmed'
        ? applyConfirmedMergeNamesToParsedFile(parsedFile, [match])
        : parsedFile;
      if (nextParsedFile !== parsedFile) setParsedFile(nextParsedFile);

      if (sessionId) {
        setIsLoading(true);
        try {
          const nextStatus = deriveSessionStatus(nextRows, preflight, receipts);
          // Persist permanent decision regardless of file class — fire-and-forget so UI isn't blocked.
          persistMergeDecisionBackend(sessionId, match.inputRef, action, match.matchedPersonId, undefined, undefined, match.reviewPayload?.input?.name, match.inputKey).catch(() => {});
          const session = await saveSession(sessionId, nextRows, nextStatus, preflight, nextPersonResult, null, nextParsedFile);
          applySession(session, action === "confirmed" ? "Merge decision saved to the backend session." : "Separate decision saved to the backend session.");
          setMergeDecisions(nextMergeDecisions);
          setPersonResult(nextPersonResult);
          if (nextParsedFile !== parsedFile) setParsedFile(nextParsedFile);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Failed to save the merge decision.");
        } finally {
          setIsLoading(false);
        }
        return;
      }

      setMessage(action === "confirmed" ? "Merge confirmed. Continue after all pending people reviews are resolved." : "Records marked separate. Continue after all pending people reviews are resolved.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await persistMergeDecisionBackend(
        sessionId,
        match.inputRef,
        action,
        match.matchedPersonId,
        (match.reviewPayload?.matchedEvidence ?? []).slice(0, 3).join(' + ') || summarizeMatchSignals(match),
        Number.isFinite(match.score) ? Math.round(match.score * 100) / 100 : undefined,
      );
      setRows(result.updatedRows);
      setMergeDecisions(buildMergeDecisionMap(result.updatedRows, result.auditDecisions));
      if (result.audit) setAuditResult(result.audit);
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(action === 'confirmed' ? 'Merge decision saved to the backend session.' : 'Separate decision saved to the backend session.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save the merge decision.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGroupMergeDecision(allMatches: PersonMatch[], action: "confirmed" | "separated") {
    const representativeMatch = allMatches[0];
    if (!representativeMatch) return;
    const inputRefSet = new Set(allMatches.map((m) => m.inputRef));

    if (!sessionId || !isLedgerFile) {
      const nextMergeDecisions = new Map(mergeDecisions);
      for (const m of allMatches) nextMergeDecisions.set(m.inputRef, action);

      const nextPersonResult: PersonResolverResult | null = personResult
        ? {
            ...personResult,
            matches: personResult.matches.map((candidate) =>
              inputRefSet.has(candidate.inputRef)
                ? {
                    ...candidate,
                    decision: action === "confirmed" ? 'auto' as const : 'new' as const,
                    matchedPersonId: action === "confirmed" ? representativeMatch.matchedPersonId : null,
                  }
                : candidate,
            ),
          }
        : personResult;

      setMergeDecisions(nextMergeDecisions);
      setPersonResult(nextPersonResult);
      setHouseholdResult(null);

      const nextParsedFile = action === 'confirmed'
        ? applyConfirmedMergeNamesToParsedFile(parsedFile, allMatches)
        : parsedFile;

      if (sessionId) {
        setIsLoading(true);
        try {
          const nextStatus = deriveSessionStatus(rows, preflight, receipts);
          // Persist permanent decisions regardless of file class — fire-and-forget so UI isn't blocked.
          for (const m of allMatches) {
            persistMergeDecisionBackend(sessionId, m.inputRef, action, m.matchedPersonId, undefined, undefined, m.reviewPayload?.input?.name, m.inputKey).catch(() => {});
          }
          // Apply name changes locally immediately so the table updates even before server round-trip
          if (nextParsedFile !== parsedFile) setParsedFile(nextParsedFile);
          const session = await saveSession(sessionId, rows, nextStatus, preflight, nextPersonResult, null, nextParsedFile);
          applySession(session, action === "confirmed" ? "Merge decision saved to the backend session." : "Separate decision saved to the backend session.");
          setMergeDecisions(nextMergeDecisions);
          setPersonResult(nextPersonResult);
          // Re-apply local parsedFile after applySession in case server returned stale data
          if (nextParsedFile !== parsedFile) setParsedFile(nextParsedFile);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Failed to save the merge decision.");
        } finally {
          setIsLoading(false);
        }
        return;
      }

      if (nextParsedFile !== parsedFile) setParsedFile(nextParsedFile);
      setMessage(action === "confirmed" ? "Merge confirmed. Continue after all pending people reviews are resolved." : "Records marked separate. Continue after all pending people reviews are resolved.");
      return;
    }

    // Session / ledger path: call backend for each match in the group
    setIsLoading(true);
    try {
      let lastResult: Awaited<ReturnType<typeof persistMergeDecisionBackend>> | null = null;
      for (const match of allMatches) {
        lastResult = await persistMergeDecisionBackend(
          sessionId,
          match.inputRef,
          action,
          match.matchedPersonId,
          (match.reviewPayload?.matchedEvidence ?? []).slice(0, 3).join(' + ') || summarizeMatchSignals(match),
          Number.isFinite(match.score) ? Math.round(match.score * 100) / 100 : undefined,
        );
      }
      if (lastResult) {
        setRows(lastResult.updatedRows);
        setMergeDecisions(buildMergeDecisionMap(lastResult.updatedRows, lastResult.auditDecisions));
        if (lastResult.audit) setAuditResult(lastResult.audit);
      }
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(action === 'confirmed' ? 'Merge decision saved to the backend session.' : 'Separate decision saved to the backend session.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save the merge decision.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRunTaxonomy() {
    const returnRowId = activeFixRowId;
    queueReturnToActiveRow();
    setIsLoading(true);
    try {
      const result = await evaluateTaxonomyBackend(rows, sessionId ?? undefined);
      setTaxonomyResult(result);
      setMessage(`Taxonomy: ${result.resolvedCount} resolved, ${result.unmappedCount} unknown → exception queue.`);
      restoreReturnRowFocus(returnRowId);
    } catch (error) {
      setPendingReturnRowId(null);
      setMessage(error instanceof Error ? error.message : 'Taxonomy evaluation failed.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReviewTaxonomySuggestion(exceptionId: string, action: 'approve' | 'reject', resolvedCode?: string) {
    setIsLoading(true);
    try {
      const result = await reviewTaxonomySuggestionBackend(exceptionId, action, {
        resolvedCode,
        reviewedBy: 'user',
      });
      const nextRows = result.updatedRows.length > 0 ? result.updatedRows : rows;
      if (result.updatedRows.length > 0) {
        setRows(result.updatedRows);
      }
      if (result.audit) {
        setAuditResult(result.audit);
      }
      const nextTaxonomy = await evaluateTaxonomyBackend(nextRows, sessionId ?? undefined);
      setTaxonomyResult(nextTaxonomy);
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(action === 'approve' ? 'AI taxonomy suggestion approved and applied.' : 'AI taxonomy suggestion rejected. Exception remains open for manual mapping.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to review the taxonomy suggestion.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRunAuditRules() {
    setIsLoading(true);
    try {
      const result = await runAuditRulesBackend(rows, sessionId ?? undefined);
      setAuditResult(result);
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(`Audit rules: ${result.errorCount} error(s), ${result.warningCount} warning(s), ${result.infoCount} info.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Audit rules failed.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExportDonorReport() {
    setIsLoading(true);
    try {
      const persons = personResult?.persons ?? [];
      const households = householdResult?.households ?? [];
      const report = await fetchDonorReport(rows, persons, households, previewRecords);
      downloadCsv(`donor-report-${new Date().toISOString().slice(0, 10)}.csv`, buildDonorReportCsv(report));
      setMessage(`Donor report exported: ${report.persons.length} persons, ${report.households.length} households.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Donor report export failed.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExportAuditDashboard() {
    setIsLoading(true);
    try {
      const dashboard = await fetchAuditDashboard(rows, sessionId ?? undefined);
      setAuditResult(dashboard);
      setSessionUpdatedAt(new Date().toISOString());
      downloadCsv(`audit-dashboard-${new Date().toISOString().slice(0, 10)}.csv`, buildAuditDashboardCsv(dashboard));
      setMessage(`Audit dashboard exported: ${dashboard.findings.length} findings.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Audit dashboard export failed.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExportCampaignPerformanceReport() {
    setIsLoading(true);
    try {
      const report = await fetchCampaignPerformanceReport(rows);
      downloadCsv(`campaign-performance-${new Date().toISOString().slice(0, 10)}.csv`, buildCampaignPerformanceCsv(report));
      setMessage(`Campaign performance report exported: ${report.campaigns.length} campaign row${report.campaigns.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Campaign performance export failed.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExportCrmSyncExport() {
    setIsLoading(true);
    try {
      const persons = personResult?.persons ?? [];
      const households = householdResult?.households ?? [];
      const report = await fetchCrmSyncExport(rows, persons, households, previewRecords);
      downloadCsv(`crm-sync-export-${new Date().toISOString().slice(0, 10)}.csv`, buildCrmSyncCsv(report));
      setMessage(`CRM sync export created: ${report.rows.length} sync row${report.rows.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'CRM sync export failed.');
    } finally {
      setIsLoading(false);
    }
  }

  function buildDonorReportCsv(report: DonorReport) {
    return [
      'PersonId,FirstName,LastName,Email,Lifecycle',
      ...report.persons.map(
        (p) => `${p.id},${p.firstName},${p.lastName},${p.email},${p.lifecycle}`,
      ),
      '',
      'HouseholdId,LastName,Members,Salutation,JointGivingTotal',
      ...report.households.map(
        (hh) => `${hh.id},${hh.lastName},${hh.memberIds.length},"${hh.salutationText}",${hh.jointGivingTotal.toFixed(2)}`,
      ),
      '',
      'SourceRowRef,Amount,HouseholdId,PrimaryPersonId,SecondaryPersonId,OrganizationName,AttributionMode,CreditSummary',
      ...report.attributionRows.map(
        (row) => [row.source_row_ref, row.amount, row.household_id ?? '', row.primary_person_id ?? '', row.secondary_person_id ?? '', row.organization_name ?? '', row.attribution_mode, row.credit_summary].map(csvCell).join(','),
      ),
      '',
      `GeneratedAt,${report.generatedAt}`,
      `DonationCount,${report.donationCount}`,
      `TotalDebit,${report.totalDebit.toFixed(2)}`,
      `TotalCredit,${report.totalCredit.toFixed(2)}`,
    ].join('\n');
  }

  function buildAuditDashboardCsv(dashboard: AuditRuleResult) {
    return [
      'RuleCode,RuleVersion,Label,Severity,Count,Message',
      ...dashboard.findings.map(
        (finding) => `${finding.ruleCode},${finding.ruleVersion ?? ''},"${finding.label}",${finding.severity},${finding.count},"${finding.message}"`,
      ),
      '',
      `GeneratedAt,${dashboard.generatedAt ?? new Date().toISOString()}`,
      `EngineVersion,${dashboard.engineVersion ?? 'unknown'}`,
      `Errors,${dashboard.errorCount}`,
      `Warnings,${dashboard.warningCount}`,
      `Info,${dashboard.infoCount}`,
      `DeltaTrend,${dashboard.deltaTrend ?? dashboard.delta?.trend ?? 'baseline'}`,
      `LatestPersistedRunId,${dashboard.latestPersistedRunId ?? ''}`,
    ].join('\n');
  }

  function buildCampaignPerformanceCsv(report: CampaignPerformanceReport) {
    return [
      'CanonicalCode,TotalRaised,DonationCount,RetentionBucket',
      ...report.campaigns.map(
        (campaign) => `${campaign.canonicalCode},${campaign.totalRaised},${campaign.donationCount},${campaign.retentionBucket}`,
      ),
      '',
      `GeneratedAt,${report.generatedAt}`,
    ].join('\n');
  }

  function buildCrmSyncCsv(report: CrmSyncExport) {
    return [
      "CanonicalPersonId,CanonicalHouseholdId,CanonicalOrgId,Name,FormattedFor,Addressee,AttributionMode,OrganizationCredit,SourceRowRef",
      ...report.rows.map(
        (row) => [row.canonical_person_id ?? '', row.canonical_household_id ?? '', row.canonical_org_id ?? '', row.name, row.formatted_for, row.addressee ?? '', row.attribution_mode ?? '', row.organization_credit ?? '', row.source_row_ref].map(csvCell).join(','),
      ),
      "",
      `GeneratedAt,${report.generatedAt}`,
      `Resolved duplicates,${report.persons.length}`,
      `Households,${report.households.length}`,
    ].join("\n");
  }

  function downloadCsv(fileName: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  }

  function downloadExcelCompatibleTable(fileName: string, sheetName: string, headers: string[], rowsToExport: unknown[][]) {
    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const tableHtml = `
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rowsToExport.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    `;

    const workbookHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8" />
          <meta name="ProgId" content="Excel.Sheet" />
          <meta name="Generator" content="TransformHub" />
          <title>${escapeHtml(sheetName)}</title>
        </head>
        <body>${tableHtml}</body>
      </html>
    `;

    const blob = new Blob([workbookHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  }

  function csvCell(value: unknown) {
    const cell = String(value ?? "");
    const quote = String.fromCharCode(34);
    const escaped = cell.split(quote).join(quote + quote);
    return /[",]/.test(cell) || cell.includes("\n") ? quote + escaped + quote : cell;
  }

  function buildPreviewExportTable(): { headers: string[]; rows: unknown[][] } | null {
    if (!preview || previewRecords.length === 0) return null;
    const reviewRows = supportsDuplicateWorkflow ? visibleAttributionTableRecords : displayedPreviewRecords;
    if (supportsDuplicateWorkflow) {
      const headers = ['Source', ...visibleNonLedgerTableHeaders, ...reviewAugmentedColumns.map((columnKey) => {
        if (columnKey === '__role__') return 'Role';
        if (columnKey === '__attribution_type__') return 'Attribution Type';
        if (columnKey === '__credit_amount__') return 'Credit Amount';
        if (columnKey === '__household__') return 'Household';
        if (columnKey === '__notes__') return 'Notes';
        return columnKey;
      })];
      return {
        headers,
        rows: reviewRows.map((record) => {
          const recordOrigins = getRecordSourceOrigins(record);
          const sourceLabel = recordOrigins
            .map((origin) => previewSourceBadgeByOrigin.get(origin) ?? origin)
            .join(', ');
          const rawCells = visibleNonLedgerTableHeaders.map((header) => getPreviewRecordRawCell(record, header));
          const augmentedCells = reviewAugmentedColumns.map((columnKey) => {
            const { matchedPerson, draft, assignedHouseholdId } = getAttributionDraftForRecord(record);
            const rawAmount = parseCurrencyAmount(record.amount);
            if (columnKey === '__role__') return getRecordRole(record, draft, matchedPerson);
            if (columnKey === '__attribution_type__') return getAttributionModeLabel(draft.mode);
            if (columnKey === '__credit_amount__') return getDisplayCreditAmount(draft, rawAmount, getRecordRole(record, draft, matchedPerson));
            if (columnKey === '__household__') return assignedHouseholdId ? householdLabelById.get(assignedHouseholdId) ?? assignedHouseholdId : '—';
            if (columnKey === '__notes__') return String(draft.notes || record.memo || '—');
            return '—';
          });
          return [sourceLabel || '—', ...rawCells, ...augmentedCells];
        }),
      };
    }
    return {
      headers: ["SourceRowRef", "Preview"],
      rows: reviewRows.map((record) => [record.sourceRowRef, record.preview ?? ""]),
    };
  }

  function buildPreviewCsv() {
    const table = buildPreviewExportTable();
    if (!table) return "";
    return [table.headers.map(csvCell).join(","), ...table.rows.map((row) => row.map(csvCell).join(","))].join("\n");
  }

  function buildPreviewIdentityRows(): CanonicalLedgerRow[] {
    if (!supportsDuplicateWorkflow || previewRecords.length === 0) return [];
    return previewRecords.map((record, index: number) => {
      const entityName = isDonorFile
        ? record.donorName || record.email || record.sourceRowRef
        : record.displayName || [record.firstName, record.lastName].filter(Boolean).join(" ") || record.organizationName || record.householdName || record.sourceRowRef;
      const rowDate = isDonorFile ? record.date || "" : record.updatedAt || record.createdAt || "";
      const memo = isDonorFile ? [record.memo, record.fund, record.appeal].filter(Boolean).join(" | ") : "";

      return {
        id: `preview-person-${index + 1}`,
        date: String(rowDate),
        entity_name: String(entityName),
        account_code: "",
        account_name: "",
        debit: "",
        credit: "",
        currency: String(record.currency ?? ""),
        memo,
        source_platform: platform,
        source_row_ref: record.sourceRowRef,
        journal_id: "",
        mapping_confidence: schema?.confidence ?? 0,
        review_status: "pending",
        needs_review: false,
        suggested_fix: null,
        qbo_account_id: null,
        qbo_txn_id: null,
        canonical_person_id: null,
        canonical_household_id: null,
        raw_fund: isDonorFile ? (record.fund || null) : null,
        raw_appeal: isDonorFile ? (record.appeal || null) : null,
        taxonomy_exception_id: null,
        canonical_org_id: null,
        attribution_entry_id: null,
        normalized_fund: null,
        normalized_appeal: null,
        amount: isDonorFile ? String(record.amount ?? '') : '',
        email: String(record.email ?? ""),
        phone: String(record.phone ?? ""),
        address: String(record.address ?? ""),
        postalCode: String(record.postalCode ?? ""),
        zip: String(record.postalCode ?? ""),
        householdName: String(record.householdName ?? ""),
        firstName: String(record.firstName ?? ""),
        lastName: String(record.lastName ?? ""),
        organizationName: String(record.organizationName ?? ""),
        city: String(record.city ?? ""),
        state: String(record.state ?? ""),
        tags: Array.isArray(record.tags) ? record.tags : [],
        rawValues: record.rawValues || {},
      } as unknown as CanonicalLedgerRow;
    });
  }

  function handleExportPreview() {
    const table = buildPreviewExportTable();
    if (!table) {
      setMessage("Nothing to export from this file class yet.");
      return;
    }
    const exportViewLabel = supportsDuplicateWorkflow
      ? (matchingReviewActive ? matchingTableView : 'review')
      : 'review';
    downloadExcelCompatibleTable(
      "transformhub-" + fileClass + "-" + exportViewLabel + "-" + new Date().toISOString().slice(0, 10) + ".xls",
      `${fileClass}-${exportViewLabel}`,
      table.headers,
      table.rows,
    );
    const exportedCount = supportsDuplicateWorkflow ? visibleAttributionTableRecords.length : displayedPreviewRecords.length;
    setMessage("Downloaded " + exportedCount + " " + fileClass + " record" + (exportedCount === 1 ? "" : "s") + " as an Excel-compatible export.");
  }
  const activeAuditCatalog = auditResult?.ruleCatalog ?? auditCatalog;
  const activeAuditEngineVersion = auditResult?.engineVersion ?? auditEngineVersion;
  const auditCatalogByCode = new Map(activeAuditCatalog.map((rule) => [rule.code, rule]));

  function scrollToSection(sectionId: string) {
    const el = document.getElementById(sectionId);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  function handlePipelineNodeClick(node: { id: string; target: string }) {
    if (!isLedgerFile) {
      if (node.id === 'duplicates') {
        setNonLedgerReviewPanel('duplicate');
      } else if (node.id === 'households') {
        setNonLedgerReviewPanel('matching');
      } else if (node.id === 'guardrails') {
        setNonLedgerReviewPanel('taxonomy');
      } else if (node.id === 'analytics') {
        setNonLedgerReviewPanel('outcomes');
      } else if (node.id === 'review') {
        setNonLedgerReviewPanel(supportsHouseholdWorkflow ? 'household' : 'duplicate');
      }
    }
    scrollToSection(node.target);
  }

  type NodeStatus = 'idle' | 'ok' | 'warning' | 'error';

  const uploadedFileCount = ((parsedFile as ParsedFileWithOptionalMergeState | null)?.mergeState?.uploadedFiles?.length ?? (parsedFile ? 1 : 0));
  const combineStepComplete = Boolean(parsedFile);

  const pipelineNodes: Array<{ id: string; label: string; status: NodeStatus; count: string | null; target: string }> = isLedgerFile
    ? [
        {
          id: 'source',
          label: 'Source',
          status: parsedFile ? 'ok' : 'idle',
          count: parsedFile ? `${structureAnalysis?.dataRowCount ?? parsedFile.rows.length} rows · ${parsedFile.platform}` : null,
          target: 'th-ingest',
        },
        {
          id: 'schema',
          label: 'Schema',
          status: !schema ? 'idle' : schema.confidence >= 0.75 ? 'ok' : 'warning',
          count: schema ? `${schema.reportType} · ${Math.round(schema.confidence * 100)}%` : null,
          target: 'th-guardrails',
        },
        {
          id: 'guardrails',
          label: 'Guardrails',
          status: guardrails.length === 0 ? 'idle' : guardrails.some((g) => g.triggered) ? 'error' : 'ok',
          count: guardrails.length > 0 ? `${guardrails.filter((g) => !g.triggered).length}/${guardrails.length} clear` : null,
          target: 'th-guardrails',
        },
        ...(isCrmPlatform
          ? [
              {
                id: 'identity',
                label: 'Check duplicates',
                status: (!personResult ? 'idle' : personResult.needsReview > 0 ? 'warning' : 'ok') as NodeStatus,
                count: personResult ? `${personResult.persons.length} resolved · ${personResult.needsReview} pending review` : null,
                target: 'th-identity',
              },
            ]
          : []),
        {
          id: 'mapping',
          label: 'Mapping',
          status: (rows.length === 0 ? 'idle' : highConfidenceRows >= rows.length * 0.7 ? 'ok' : 'warning') as NodeStatus,
          count: rows.length > 0 ? `${highConfidenceRows}/${rows.length} high-conf` : null,
          target: 'th-mapping-layer',
        },
        {
          id: 'taxonomy',
          label: 'Taxonomy',
          status: (!taxonomyResult ? 'idle' : taxonomyResult.unmappedCount > 0 ? 'warning' : 'ok') as NodeStatus,
          count: taxonomyResult ? `${taxonomyResult.resolvedCount} resolved · ${taxonomyResult.unmappedCount} queued` : null,
          target: 'th-taxonomy',
        },
        {
          id: 'review',
          label: 'Review',
          status: (rows.length === 0 ? 'idle' : reviewRows > 0 ? 'warning' : readyRows > 0 ? 'ok' : 'idle') as NodeStatus,
          count: rows.length > 0 ? `${readyRows} approved · ${reviewRows} pending` : null,
          target: 'th-review',
        },
        {
          id: 'audit',
          label: 'Audit',
          status: (!auditResult ? 'idle' : auditResult.errorCount > 0 ? 'error' : auditResult.warningCount > 0 ? 'warning' : 'ok') as NodeStatus,
          count: auditResult ? `${auditResult.errorCount} errors · ${auditResult.warningCount} warnings` : null,
          target: 'th-audit',
        },
        {
          id: 'export',
          label: 'Export',
          status: (receipts.length > 0 ? 'ok' : preflight?.valid ? 'ok' : 'idle') as NodeStatus,
          count: receipts.length > 0 ? `${receipts.length} posted` : preflight?.valid ? 'ready' : null,
          target: 'th-export',
        },
      ]
    : supportsDuplicateWorkflow
      ? [
          {
            id: 'combine',
            label: 'Combine sheets',
            status: (!parsedFile ? 'idle' : combineStepComplete ? 'ok' : 'idle') as NodeStatus,
            count: parsedFile ? `${uploadedFileCount} sheet${uploadedFileCount === 1 ? '' : 's'} ${uploadedFileCount > 1 ? 'combined' : 'loaded'}` : null,
            target: 'th-ingest',
          },
          {
            id: 'duplicates',
            label: 'Check duplicates',
            status: (!combineStepComplete ? 'idle' : !personResult ? 'warning' : pendingPeopleReviews > 0 ? 'warning' : 'ok') as NodeStatus,
            count: !combineStepComplete ? null : !personResult ? 'run Duplicate check' : pendingPeopleReviews > 0 ? `${pendingPeopleReviews} pending review` : `${canonicalPeople.length} resolved`,
            target: 'th-review',
          },
          ...(supportsHouseholdWorkflow ? [{
            id: 'households',
            label: 'Households',
            status: (!peopleStepReady ? 'idle' : !householdResult ? 'warning' : 'ok') as NodeStatus,
            count: !peopleStepReady ? 'unlock after duplicates' : !householdResult ? 'ready to run' : `${householdResult.households.length} formed`,
            target: 'th-review',
          }] : []),
          {
            id: 'guardrails',
            label: 'Guardrails',
            status: (!combineStepComplete ? 'idle' : guardrails.some((g) => g.triggered) ? 'error' : taxonomySummary.open > 0 ? 'warning' : guardrails.length > 0 ? 'ok' : 'idle') as NodeStatus,
            count: taxonomySummary.open > 0 ? taxonomySummary.open + ' taxonomy groups to review' : guardrails.length > 0 ? (guardrails.filter((g) => !g.triggered).length + '/' + guardrails.length + ' clear') : null,
            target: 'th-guardrails',
          },
          {
            id: 'review',
            label: 'Review',
            status: (!(supportsHouseholdWorkflow ? householdsStepReady : peopleStepReady) ? 'idle' : !preview ? 'idle' : previewRecords.length > 0 ? 'ok' : 'warning') as NodeStatus,
            count: !(supportsHouseholdWorkflow ? householdsStepReady : peopleStepReady) ? `unlock after ${supportsHouseholdWorkflow ? 'households' : 'duplicates'}` : preview ? `${previewRecords.length} ${fileClass} records` : null,
            target: 'th-review',
          },
          {
            id: 'analytics',
            label: 'Review analytics',
            status: (!(supportsHouseholdWorkflow ? householdsStepReady : peopleStepReady) ? 'idle' : displayedOutcomeCards.length > 0 ? 'ok' : 'idle') as NodeStatus,
            count: !(supportsHouseholdWorkflow ? householdsStepReady : peopleStepReady)
              ? `unlock after ${supportsHouseholdWorkflow ? 'review' : 'duplicates'}`
              : selectedOutcomeCard
                ? `${formatOutcomeMetric(selectedOutcomeCard.metricKind, selectedOutcomeCard.amount)} highlighted`
                : null,
            target: 'th-review',
          },
          {
            id: 'export',
            label: 'Export',
            status: (!nonLedgerExportReady ? 'idle' : previewRecords.length > 0 ? 'ok' : 'idle') as NodeStatus,
            count: !nonLedgerExportReady ? 'unlock after review' : previewRecords.length > 0 ? `${previewRecords.length} rows ready` : null,
            target: 'th-export',
          },
        ]
      : [
          {
            id: 'combine',
            label: 'Combine sheets',
            status: (!parsedFile ? 'idle' : combineStepComplete ? 'ok' : 'idle') as NodeStatus,
            count: parsedFile ? `${uploadedFileCount} sheet${uploadedFileCount === 1 ? '' : 's'} ${uploadedFileCount > 1 ? 'combined' : 'loaded'}` : null,
            target: 'th-ingest',
          },
          {
            id: 'guardrails',
            label: 'Guardrails',
            status: (!combineStepComplete ? 'idle' : guardrails.length === 0 ? 'idle' : guardrails.some((g) => g.triggered) ? 'error' : 'ok') as NodeStatus,
            count: guardrails.length > 0 ? `${guardrails.filter((g) => !g.triggered).length}/${guardrails.length} clear` : null,
            target: 'th-guardrails',
          },
          {
            id: 'review',
            label: 'Review',
            status: (!preview ? 'idle' : previewRecords.length > 0 ? 'ok' : 'warning') as NodeStatus,
            count: preview ? `${previewRecords.length} ${fileClass} records` : null,
            target: 'th-review',
          },
          {
            id: 'export',
            label: 'Export',
            status: (previewRecords.length > 0 ? 'ok' : 'idle') as NodeStatus,
            count: previewRecords.length > 0 ? `${previewRecords.length} rows ready` : null,
            target: 'th-export',
          },
        ];

  return (
    <div className="th-shell">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="th-topbar">
        <div className="th-topbar-inner">
          <div className="th-brand">
            <WandSparkles size={16} />
            TransformHub
          </div>
          <div className="th-topbar-actions">
            {sessionId && (
              <span className="th-session-badge">
                {sessionStatus} · {sessionId.slice(0, 8)}
                {sessionUpdatedAt && ` · ${new Date(sessionUpdatedAt).toLocaleTimeString()}`}
              </span>
            )}
            <button type="button" className="th-button th-button-secondary" onClick={handleSaveSession} disabled={!sessionId || (rows.length === 0 && previewRecords.length === 0)} style={{ minHeight: 34, fontSize: '0.82rem' }}>
              <Save size={14} /> Save
            </button>
            <button type="button" className="th-button th-button-secondary" onClick={handleReloadSession} disabled={!sessionId} style={{ minHeight: 34, fontSize: '0.82rem' }}>
              <RefreshCcw size={14} /> Reload
            </button>
            <button
              type="button"
              className="th-button th-button-secondary"
              onClick={() => setShowAppliedDecisions(true)}
              style={{ minHeight: 34, fontSize: '0.82rem' }}
            >
              Auto-rules
            </button>
            <button
              type="button"
              className="th-button th-button-secondary"
              onClick={() => setShowIdentityHub(true)}
              style={{ minHeight: 34, fontSize: '0.82rem' }}
            >
              Profiles
            </button>
            <button
              type="button"
              className="th-button th-button-secondary"
              onClick={() => setShowReviewQueue(true)}
              style={{ minHeight: 34, fontSize: '0.82rem', position: 'relative' }}
            >
              Things to review
              {(effectiveReviewQueueSummary?.pendingCount ?? 0) > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  background: effectiveReviewQueueSummary?.driftAlertCount ? 'var(--th-red)' : effectiveReviewQueueSummary?.highConfidenceCount ? 'var(--th-blue)' : 'var(--th-muted)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                  lineHeight: 1,
                }}>
                  {effectiveReviewQueueSummary?.pendingCount}
                </span>
              )}
            </button>
            <button type="button" className="th-button th-button-secondary" onClick={handleStartFresh} disabled={!sessionId && !parsedFile} style={{ minHeight: 34, fontSize: '0.82rem' }}>
              Start fresh
            </button>
          </div>
        </div>
      </header>

      <div className="th-content">
        <section className="th-section">
          <div className="th-canonical-hero">
            <div className="th-canonical-copy">
              <span className="th-eyebrow">System of record</span>
              <h1>{heroTitle}</h1>
              <p>{heroSummary}</p>
            </div>
            <div className="th-canonical-metrics">
              <div className="th-metric-card">
                <strong>{isLedgerFile ? activeRows.length : previewCount}</strong>
                <span>{isLedgerFile ? 'Active ledger rows' : 'Classified records'}</span>
              </div>
              <div className="th-metric-card">
                <strong>{isLedgerFile ? rowsWithCanonicalDestination : Object.keys(schema?.fieldMap ?? {}).length}</strong>
                <span>{isLedgerFile ? 'Rows with posting destination' : 'Mapped source fields'}</span>
              </div>
              <div className="th-metric-card">
                <strong>{isLedgerFile ? highConfidenceRows : Math.round((schema?.confidence ?? 0) * 100) + '%'}</strong>
                <span>{isLedgerFile ? 'High-confidence mappings' : 'Classifier confidence'}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Ingestion ─────────────────────────────────────────────────── */}
        <section className="th-section" id="th-ingest">
          <div className="th-panel">
            <div className="th-ingest-header">
              <span className="th-ingest-title">Ingestion</span>
              <span className="th-status-msg">{isUploadLoading ? 'Processing…' : message}</span>
            </div>
            <div className="th-upload-actions">
              <label className="th-file-input th-file-input-primary" aria-disabled={isUploadLoading}>
                <div className="th-file-input-icon"><Upload size={18} /></div>
                <div className="th-file-input-copy">
                  <strong>Upload source file</strong>
                  <span>CSV or XLSX · start a new review table or combine sheets into the current one</span>
                  {activeUploadLabel && <em>{activeUploadLabel}</em>}
                </div>
                <input type="file" accept=".csv,.txt,.tsv,.xlsx" onChange={handleFileChange} disabled={isUploadLoading} />
              </label>
              {parsedFile?.preview && (
                <button type="button" className="th-button th-button-secondary" onClick={handleExportPreview} style={{ minHeight: 44 }}>
                  <FileSpreadsheet size={14} /> Download existing file
                </button>
              )}
            </div>
            {isUploadLoading && (
              <div className="th-mini-block th-upload-loading-block" style={{ marginTop: 12 }}>
                <strong>{pendingWorkbookSheetReview ? 'Preparing selected sheets' : `Loading ${activeUploadLabel}`}</strong>
                <p>
                  {pendingWorkbookSheetReview
                    ? 'Classifying the selected workbook tabs, checking compatibility, and preparing the append review.'
                    : 'Parsing the file, classifying the columns, and preparing the review workspace.'}
                </p>
              </div>
            )}
            {pendingWorkbookSheetReview && (
              <div className="th-stack" style={{ marginTop: 12 }}>
                <div className="th-panel-head"><span>Combine sheets</span><span>{pendingWorkbookSheetReview.workbookSheets.length} workbook tab{pendingWorkbookSheetReview.workbookSheets.length === 1 ? '' : 's'}</span></div>
                <div className="th-mini-block">
                  <strong>Select which workbook tabs to combine</strong>
                  <p>Compatible tabs are preselected. Ignore tabs you do not want in the combined review table. Row refs will preserve the sheet name for audit tracing.</p>
                </div>
                <div className="th-workbook-sheet-list">
                  {pendingWorkbookSheetReview.workbookSheets.map((sheet) => {
                    const baseSheet = pickWorkbookBaseSheet(pendingWorkbookSheetReview.workbookSheets);
                    const compatibility = describeWorkbookSheetCompatibility(sheet, baseSheet);
                    const currentAction = pendingWorkbookSheetReview.actionsBySheet[sheet.sheetName] ?? 'ignore';
                    return (
                      <div key={sheet.sheetName} className="th-workbook-sheet-card">
                        <div className="th-workbook-sheet-head">
                          <div>
                            <strong>{sheet.sheetName}</strong>
                            <p>{sheet.structureAnalysis.dataRowCount} row{sheet.structureAnalysis.dataRowCount === 1 ? '' : 's'} · {sheet.fileClass}</p>
                          </div>
                          <div className="th-workbook-sheet-action-group" role="group" aria-label={`Workbook tab action for ${sheet.sheetName}`}>
                            {(['append', 'ignore'] as WorkbookSheetAction[]).map((action) => {
                              const label = action === 'append' ? 'Append' : 'Ignore';
                              return (
                                <button
                                  key={action}
                                  type="button"
                                  className={`th-workbook-sheet-action-pill${currentAction === action ? ' is-active' : ''}`}
                                  onClick={() => {
                                    setPendingWorkbookSheetReview((current) => current ? {
                                      ...current,
                                      actionsBySheet: { ...current.actionsBySheet, [sheet.sheetName]: action },
                                    } : current);
                                  }}
                                  aria-pressed={currentAction === action}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="th-cell-chip-row">
                          <span className="th-cell-chip">{sheet.headers.length} columns</span>
                          <span className={`th-cell-chip${compatibility.tone === 'warning' ? ' is-warning' : ''}`}>{compatibility.label}</span>
                          {sheet.guardrails?.some((item) => item.triggered) && <span className="th-cell-chip">Has warnings</span>}
                          {sheet.schema?.reportType && <span className="th-cell-chip">{sheet.schema.reportType}</span>}
                        </div>
                        <p className="th-helper">{compatibility.detail}</p>
                        <p className="th-helper">{sheet.headers.slice(0, 6).join(' · ')}{sheet.headers.length > 6 ? ' …' : ''}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="th-review-match-actions">
                  <button type="button" className="th-button th-button-primary" onClick={() => void applyWorkbookSheetReview(pendingWorkbookSheetReview)}>Apply sheet selection</button>
                  <button type="button" className="th-button th-button-secondary" onClick={() => setPendingWorkbookSheetReview(null)}>Cancel</button>
                </div>
              </div>
            )}
            {pendingColumnMerges.length > 0 && (
              <div className="th-stack" style={{ marginTop: 12 }}>
                <div className="th-panel-head"><span>Schema union review</span><span>{pendingColumnMerges.length} column item{pendingColumnMerges.length === 1 ? '' : 's'}</span></div>
                <p className="th-helper" style={{ padding: 0, margin: 0 }}>
                  S1 current table · S2 {pendingColumnMergeSourceFiles.join(' + ')}
                </p>
                {pendingColumnMerges.map((merge) => (
                  <div key={merge.id} className="th-guardrail is-warning" style={{ alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <strong>{merge.reason === 'value_review' ? 'Confirm column match' : 'Review possible column match'}</strong>
                      <p><strong>S1 column:</strong> {merge.suggestedHeader}</p>
                      <p><strong>S2 column:</strong> {merge.incomingHeader}</p>
                      <p className="th-helper">
                        {merge.reason === 'value_review'
                          ? 'Same column name, different sample format.'
                          : `Fuzzy schema candidate · ${Math.round((merge.score ?? 0) * 100)}%`}
                      </p>
                    </div>
                    <div className="th-review-match-actions">
                      <button type="button" className="th-button th-button-secondary" onClick={() => void handleResolvePendingColumnMerge(merge, 'keep_separate')} disabled={isResolvingPendingMerge}>Keep separate</button>
                      <button type="button" className="th-button th-button-secondary" onClick={() => void handleResolvePendingColumnMerge(merge, 'keep_s1')} disabled={isResolvingPendingMerge}>Keep S1 only</button>
                      <button type="button" className="th-button th-button-secondary" onClick={() => void handleResolvePendingColumnMerge(merge, 'keep_s2')} disabled={isResolvingPendingMerge}>Keep S2 only</button>
                      <button type="button" className="th-button th-button-primary" onClick={() => void handleResolvePendingColumnMerge(merge, 'combine')} disabled={isResolvingPendingMerge}>Combine safe union</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Hard-stop banner ────────────────────────────────────────────── */}
        {blockingIssues.length > 0 && (
          <section className="th-section">
            <div className="th-panel" style={{ borderColor: 'rgba(166,64,52,0.3)', background: 'rgba(255,232,228,0.6)' }}>
              <div className="th-panel-head">
                <span style={{ color: 'var(--th-red)' }}>
                  <ShieldAlert size={16} style={{ display: 'inline', marginRight: 6 }} />
                  {sessionStatus === 'blocked' ? 'Ingest blocked' : 'Forced from blocked'} — {blockingIssues.length} blocking issue{blockingIssues.length === 1 ? '' : 's'}
                </span>
                <button type="button" className="th-button th-button-primary" style={{ background: 'var(--th-red)', borderColor: 'var(--th-red)' }} onClick={handleForceIngest} disabled={isLoading || sessionStatus !== 'blocked' || !pendingIngestPayload}>
                  <ArrowRight size={14} /> Force continue
                </button>
              </div>
              <div className="th-stack">
                {blockingIssues.map((stop) => (
                  <div key={stop.code} className="th-guardrail is-triggered">
                    <AlertTriangle size={15} />
                    <div>
                      <strong>{stop.reason ?? stop.code}</strong>
                      <p>{stop.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="th-helper" style={{ marginTop: 10 }}>
                This session keeps the blocking report for audit history. Force continue upgrades the blocked session into a review session without discarding the original block reason.
              </p>
            </div>
          </section>
        )}

        {/* ── Pipeline strip ──────────────────────────────────────────────── */}
        <section className="th-section">
          <div className="th-pipeline-header-row">
            <div className="th-pipeline-wrap">
              {pipelineNodes.map((node, i) => (
                <div key={node.id} className="th-pipeline-step">
                  <button
                    type="button"
                    className={`th-pipeline-node th-pipeline-${node.status}`}
                    onClick={() => handlePipelineNodeClick(node)}
                    title={node.count ?? node.label}
                  >
                    <div className="th-pipeline-dot" />
                    <div className="th-pipeline-info">
                      <span className="th-pipeline-label">{node.label}</span>
                      {node.count && <span className="th-pipeline-count">{node.count}</span>}
                    </div>
                  </button>
                  {i < pipelineNodes.length - 1 && (
                    <div className="th-pipeline-connector">
                      <div className="th-pipeline-line" />
                      <svg width="8" height="12" viewBox="0 0 8 12" fill="none" className="th-pipeline-arrow">
                        <path d="M1 1l6 5-6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Check duplicates (CRM platforms only) ────────────────────── */}
        {isLedgerFile && isCrmPlatform && rows.length > 0 && (
          <section className="th-section" id="th-identity">
            <div className="th-panel">
              <div className="th-panel-head">
                <span><span className="th-layer-badge">03</span> Check duplicates</span>
                <div className="th-action-row" style={{ marginBottom: 0 }}>
                  <button type="button" className="th-button th-button-primary" onClick={handleRunPersonResolver} disabled={isRunningPersonResolver || isRunningHouseholdResolver}>
                    <Users size={14} /> {isRunningPersonResolver ? 'Running duplicate check…' : 'Duplicate check'}
                  </button>
                  <button type="button" className="th-button th-button-secondary" onClick={handleRunHouseholdResolver} disabled={!personResult || isRunningPersonResolver || isRunningHouseholdResolver}>
                    <Building2 size={14} /> {isRunningHouseholdResolver ? 'Running Households…' : 'Households'}
                  </button>
                </div>
              </div>
	              {(isRunningPersonResolver || isRunningHouseholdResolver) && (
	                <div className="th-mini-block" style={{ marginBottom: 14 }}>
	                  <strong>{isRunningPersonResolver ? 'Duplicate check is running' : 'Households are running'}</strong>
	                  <p>{isRunningPersonResolver ? 'Building and scoring duplicate matches. Review queue will refresh when this completes.' : 'Grouping resolved records into households. Household cards will refresh when this completes.'}</p>
	                </div>
	              )}
              <div className="th-grid th-main-grid">
                <article className="th-panel th-inner-panel">
                  <div className="th-panel-head">
                    <span>Resolved duplicates</span>
                    <span>{personResult ? `${personResult.persons.length} resolved` : 'not run'}</span>
                  </div>
                  {!personResult ? (
                    <p className="th-helper">Detect duplicate records across the combined sheet before review.</p>
                  ) : (
                    <>
                      <div className="th-grid th-grid-4" style={{ marginBottom: 10 }}>
                        <div className="th-stat-chip th-band-auto"><strong>{duplicateClassCounts.exact_match}</strong><span>Exact</span></div>
                        <div className="th-stat-chip th-band-review"><strong>{duplicateClassCounts.likely_match}</strong><span>Likely</span></div>
                        <div className="th-stat-chip th-band-review"><strong>{duplicateClassCounts.possible_match}</strong><span>Possible</span></div>
                        <div className="th-stat-chip th-band-separate"><strong>{duplicateClassCounts.no_match}</strong><span>No match</span></div>
                      </div>
                      <p className="th-helper" style={{ paddingTop: 0, marginBottom: 10 }}>
                        Resolved matches and review decisions are different counts. A single resolved entity can still have several incoming rows waiting for merge confirmation.
                      </p>
                      <div className="th-stack" style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {personResult.persons.slice(0, 8).map((person) => (
                          <div key={person.id} className="th-person-card">
                            <div className="th-person-id">{person.id}</div>
                            <strong>{person.firstName} {person.lastName}</strong>
                            <span>{person.lifecycle}</span>
                          </div>
                        ))}
                        {personResult.persons.length > 8 && (
                          <p className="th-helper">+{personResult.persons.length - 8} more resolved records</p>
                        )}
                      </div>
                    </>
                  )}
                </article>

                <article className="th-panel th-inner-panel">
                  <div className="th-panel-head">
                    <span>Build households</span>
                    <span>{householdResult ? `${householdResult.households.length} formed` : 'not run'}</span>
                  </div>
                  {!householdResult ? (
                    <p className="th-helper">Group resolved records by last name and address after running duplicate check.</p>
                  ) : householdResult.households.length === 0 ? (
                    <div className="th-guardrail is-clear">
                      <CheckCircle2 size={15} />
                      <div><strong>No multi-person households</strong><p>All records grouped individually.</p></div>
                    </div>
                  ) : (
                    <div className="th-stack" style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {householdResult.households.map((hh) => (
                        <div key={hh.id} className="th-household-card">
                          <div className="th-person-id">{hh.id}</div>
                          <strong>{hh.salutationText}</strong>
                          <span>{hh.memberIds.length} members</span>
                        </div>
                      ))}
                      {householdResult.ungroupedPersonIds.length > 0 && (
                        <p className="th-helper">{householdResult.ungroupedPersonIds.length} ungrouped</p>
                      )}
                    </div>
                  )}
                </article>
              </div>

              {ledgerReviewMatches.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="th-panel-head" style={{ marginBottom: 10 }}>
                    <span>Duplicate review queue</span>
                    <div className="th-review-match-actions">
                    {mergeableLedgerReviewMatches.length > 0 && (
                        <button type="button" className="th-button th-button-primary" style={{ minHeight: 34 }} onClick={() => void handleMergeAllPeopleReviews(filteredLedgerReviewMatches)} disabled={isLoading}>Consolidate shown ({mergeableLedgerReviewMatches.length})</button>
                      )}
                      <span>{filteredLedgerReviewMatches.length} shown</span>
                    </div>
                  </div>
                  <div className="th-review-filter-row" style={{ marginBottom: 10 }}>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'pending' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('pending')}>Pending {ledgerReviewCounts.pending}</button>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'merged' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('merged')}>Merged {ledgerReviewCounts.merged}</button>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'separated' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('separated')}>Separate {ledgerReviewCounts.separated}</button>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'all' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('all')}>All {ledgerReviewCounts.all}</button>
                  </div>
                  {filteredLedgerReviewMatches.length === 0 ? (
                    <div className="th-mini-block">
                      <strong>No items in this view</strong>
                      <p>{peopleReviewFilter === 'all' ? 'No duplicate candidates are visible right now.' : `No ${peopleReviewFilter} items are visible right now.`}</p>
                    </div>
                  ) : (
                    <div className="th-stack">
                    {filteredLedgerReviewMatches.map((match) => {
                        const decision = deriveReviewDecision(match, mergeDecisions);
                        const incomingRows = rows.filter((row) => row.source_row_ref === match.inputRef);
                        const matchedRowRef = match.reviewPayload?.matchedInputRef ?? null;
                        const matchedRows = matchedRowRef ? rows.filter((row) => row.source_row_ref === matchedRowRef) : [];
                        const candidateEvidence = match.reviewPayload?.matchedEvidence?.filter(Boolean) ?? [];
                        const isExpanded = expandedPeopleReviewRef === match.inputRef;
                        if (matchedRows.length === 0) return null;
                        return (
                          <div key={match.inputRef} className="th-guardrail is-warning th-review-match-card" style={{ gap: 14 }}>
                            <div className="th-review-match-head">
                              <div style={{ flex: 1 }}>
                                <strong>Ref {match.inputRef} · score {match.score}</strong>
                                <p>{incomingRows.length > 0 ? incomingRows.map((row) => row.entity_name || row.source_row_ref).join(' · ') : match.inputRef} → {matchedRows.map((row) => row.entity_name || row.source_row_ref).join(' · ')}</p>
                                <p>{summarizeMatchSignals(match)}</p>
                                {describeAiSuggestion(match) && <p className="th-helper">{describeAiSuggestion(match)}</p>}
                              </div>
                              <div className="th-review-match-actions">
                                <button
                                  type="button"
                                  className={`th-button ${isExpanded ? 'th-button-primary' : 'th-button-secondary'}`}
                                  style={{ minHeight: 34 }}
                                  onClick={() => setExpandedPeopleReviewRef(isExpanded ? null : match.inputRef)}
                                >
                                  {isExpanded ? 'Hide compare' : 'Show compare'}
                                </button>
                                {decision ? (
                                  <span className={`th-status ${decision === 'confirmed' ? 'is-ready' : 'is-rejected'}`}>
                                    {decision === 'confirmed' ? 'Merged' : 'Separated'}
                                  </span>
                                ) : (
                                  <div className="th-review-match-actions">
                                    <button type="button" className="th-button th-button-primary" style={{ minHeight: 34 }} onClick={() => handleMergeDecision(match, 'confirmed')}>Confirm merge</button>
                                    <button type="button" className="th-button th-button-secondary" style={{ minHeight: 34 }} onClick={() => handleMergeDecision(match, 'separated')}>Keep separate</button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              className={`th-review-summary ${isExpanded ? 'is-open' : ''}`}
                              onClick={() => setExpandedPeopleReviewRef(isExpanded ? null : match.inputRef)}
                            >
                              <span><strong>Incoming</strong> {incomingRows.length > 0 ? incomingRows.map((row) => row.entity_name || row.source_row_ref).join(' · ') : match.inputRef}</span>
                              <span><strong>Matched row</strong> {matchedRows.map((row) => row.entity_name || row.source_row_ref).join(' · ')}</span>
                            </button>
                            {isExpanded && (
                              <div className="th-stack" style={{ width: '100%' }}>
                                <div className="th-mini-block">
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                                    <strong>Merge proposal</strong>
                                    <span className="th-helper">Incoming {incomingRows.length} row{incomingRows.length === 1 ? '' : 's'} · Matched {matchedRows.length} uploaded row{matchedRows.length === 1 ? '' : 's'}</span>
                                  </div>
                                  <div className="th-review-compare-grid" style={{ marginTop: 10 }}>
                                    <div className="th-person-card" style={{ gap: 10, border: '1px solid rgba(224, 184, 91, 0.32)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                                        <strong>Incoming record</strong>
                                        <span className="th-person-id">{match.inputRef}</span>
                                      </div>
                                      <p className="th-helper" style={{ padding: 0, margin: 0 }}>
                                        {incomingRows.length > 0
                                          ? incomingRows.map((row) => row.entity_name || row.source_row_ref).join(' · ')
                                          : match.reviewPayload?.input.name || 'No incoming row was found for this reference.'}
                                      </p>
                                      <p className="th-helper" style={{ padding: 0, margin: 0 }}>
                                        {[
                                          match.reviewPayload?.input.email ? `Email: ${match.reviewPayload.input.email}` : null,
                                          match.reviewPayload?.input.phone ? `Phone: ${match.reviewPayload.input.phone}` : null,
                                          match.reviewPayload?.input.address ? `Address: ${match.reviewPayload.input.address}` : null,
                                          match.reviewPayload?.input.householdName ? `Household: ${match.reviewPayload.input.householdName}` : null,
                                        ].filter(Boolean).join(' · ') || 'No additional incoming context.'}
                                      </p>
                                    </div>
                                    <div className="th-person-card" style={{ gap: 10, border: '1px solid rgba(83, 160, 116, 0.28)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                                        <strong>Matched row</strong>
                                        <span className="th-person-id">{matchedRowRef}</span>
                                      </div>
                                      <p className="th-helper" style={{ padding: 0, margin: 0 }}>
                                        {matchedRows.map((row) => row.entity_name || row.source_row_ref).join(' · ')}
                                      </p>
                                      <p className="th-helper" style={{ padding: 0, margin: 0 }}>
                                        {matchedRows.map((row) => describeLedgerRow(row)).filter(Boolean).join(' · ')}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <div className="th-review-compare-grid">
                                  <div className="th-mini-block">
                                    <strong>Incoming row details</strong>
                                    {incomingRows.length === 0 ? (
                                      <p className="th-helper" style={{ marginTop: 8 }}>No ledger rows were found for this incoming reference.</p>
                                    ) : (
                                      <div className="th-stack" style={{ marginTop: 8 }}>
                                        {incomingRows.map((row) => (
                                          <div key={row.id} className="th-person-card" style={{ gap: 6 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                                              <strong>{row.entity_name || 'Unnamed row'}</strong>
                                              <span className="th-person-id">{row.id}</span>
                                            </div>
                                            <span>Source ref {row.source_row_ref} · {row.date || 'no date'}</span>
                                            <p className="th-helper" style={{ padding: 0 }}>{describeLedgerRow(row)}</p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="th-mini-block">
                                  <strong>Why this was flagged</strong>
                                  <p className="th-helper" style={{ padding: 0, marginTop: 8 }}>
                                    {candidateEvidence.length > 0
                                      ? candidateEvidence.join(' · ')
                                      : 'No matching evidence was returned for this review item.'}
                                  </p>
                                  {match.reviewPayload && (
                                    <p className="th-helper" style={{ padding: 0, marginTop: 8 }}>
                                      {[
                                        match.reviewPayload.input.city ? `City: ${match.reviewPayload.input.city}` : null,
                                        match.reviewPayload.input.state ? `State: ${match.reviewPayload.input.state}` : null,
                                        match.reviewPayload.input.zip ? `ZIP: ${match.reviewPayload.input.zip}` : null,
                                      ].filter(Boolean).join(' · ') || 'No extra location context.'}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {isLedgerFile && rows.length > 0 && (
          <TransformHubMappingLayerPanel
            platform={platform}
            schema={schema}
            rows={rows}
            legacyMap={legacyMap}
            structure={sessionStructure}
          />
        )}

        {/* ── Taxonomy ────────────────────────────────────────────────────── */}
        {isLedgerFile && rows.length > 0 && (
          <section className="th-section" id="th-taxonomy">
            <div className="th-panel">
              <div className="th-panel-head">
                <span><span className="th-layer-badge">04</span> Taxonomy</span>
                <button type="button" className="th-button th-button-primary" onClick={handleRunTaxonomy} style={{ minHeight: 34 }}>
                  <FolderTree size={14} /> Evaluate
                </button>
              </div>
              <div className="th-grid th-main-grid">
                <article className="th-panel th-inner-panel">
                  <div className="th-panel-head"><span>Registry</span><span>{registry.length} codes</span></div>
                  <div className="th-taxonomy-grid">
                    {registry.map((code) => (
                      <div key={code.code} className={`th-taxonomy-item th-taxonomy-${code.type}`}>
                        <span className="th-taxonomy-type">{code.type}</span>
                        <strong>{code.code}</strong>
                        <span>{code.label}</span>
                      </div>
                    ))}
                  </div>
                  {legacyMap.length > 0 && (
                    <div className="th-mini-block" style={{ marginTop: 10 }}>
                      <strong>Legacy mappings ({legacyMap.length})</strong>
                      <p>{legacyMap.slice(0, 3).map((m) => `"${m.legacyValue}" → ${m.canonicalCode}`).join(' · ')}{legacyMap.length > 3 ? ` +${legacyMap.length - 3} more` : ''}</p>
                    </div>
                  )}
                </article>

                <article className="th-panel th-inner-panel">
                  <div className="th-panel-head">
                    <span>Exception queue</span>
                    <span>{taxonomyResult ? `${taxonomyResult.unmappedCount} unmapped` : 'not evaluated'}</span>
                  </div>
                  {!taxonomyResult ? (
                    <p className="th-helper">Check fund/appeal codes against the canonical registry.</p>
                  ) : taxonomyResult.violations.length === 0 ? (
                    <div className="th-guardrail is-clear">
                      <CheckCircle2 size={15} />
                      <div>
                        <strong>All codes resolved</strong>
                        <p>{taxonomyResult.resolvedCount} code{taxonomyResult.resolvedCount === 1 ? '' : 's'} matched.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="th-stack">
                      {taxonomyResult.exceptions.length > 0 ? taxonomyResult.exceptions.map((exception) => {
                        const suggestedCode = exception.aiSuggestion?.code ?? exception.resolvedCode;
                        const evidence = exception.aiSuggestion?.evidence?.length
                          ? exception.aiSuggestion.evidence
                          : (exception.ruleEvidence ?? []).map((item) => `${item.key}: ${item.value}`);
                        return (
                          <div key={exception.id} className={`th-guardrail ${exception.aiSuggestion ? 'is-warning' : 'is-triggered'}`}>
                            <AlertTriangle size={15} />
                            <div style={{ width: "100%" }}>
                              <strong>Row {exception.sourceRowRef} · {exception.type}</strong>
                              <p>"{exception.rawValue}"{suggestedCode ? ` → ${suggestedCode}` : " — no candidate yet"}</p>
                              {exception.aiSuggestion ? (
                                <p>AI {exception.aiSuggestion.confidence} confidence · {exception.aiSuggestion.reasoning}</p>
                              ) : (
                                <p className="th-helper">Rule-layer queue item. No AI suggestion was produced for this exception.</p>
                              )}
                              {evidence.length > 0 && (
                                <p className="th-helper">Evidence: {evidence.join(' · ')}</p>
                              )}
                              {exception.aiReviewStatus === "rejected" && exception.aiRejectedReason && (
                                <p className="th-helper">Rejected: {exception.aiRejectedReason}</p>
                              )}
                              {exception.aiSuggestion && exception.aiReviewStatus !== "approved" && suggestedCode && (
                                <div className="th-review-pill-row" style={{ marginTop: 10 }}>
                                  <button type="button" className="th-button th-button-primary" onClick={() => void handleReviewTaxonomySuggestion(exception.id, "approve", suggestedCode)} disabled={isLoading}>
                                    Approve AI suggestion
                                  </button>
                                  <button type="button" className="th-button th-button-secondary" onClick={() => void handleReviewTaxonomySuggestion(exception.id, "reject")} disabled={isLoading}>
                                    Reject AI suggestion
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }) : taxonomyResult.violations.map((v, i) => (
                        <div key={i} className="th-guardrail is-triggered">
                          <AlertTriangle size={15} />
                          <div>
                            <strong>Row {v.rowRef} · {v.field}</strong>
                            <p>"{v.rawValue}"{v.suggestedCode ? ` → ${v.suggestedCode}` : " — no match"}</p>
                          </div>
                        </div>
                      ))}
                      <div className="th-mini-block">
                        <strong>{taxonomyResult.resolvedCount} resolved · {taxonomyResult.unmappedCount} queued</strong>
                      </div>
                    </div>
                  )}
                </article>
              </div>
            </div>
          </section>
        )}

        {/* ── Review ledger ────────────────────────────────────────────────── */}
        {isLedgerFile && rows.length > 0 && (
          <section className="th-section" id="th-review">
            <div className="th-panel">
              <div className="th-panel-head">
                <span><span className="th-layer-badge">09</span> Review ledger</span>
                <span>{readyRows} approved · {reviewRows} pending · {rejectedRows} rejected</span>
              </div>
              <div className="th-review-intro">
                <div>
                  <strong>Final truth before export</strong>
                  <p className="th-helper">Review rows exactly as they will post. Each row keeps a visible path back to the original source record. Issues stay in the table now, and inline fixes trigger an automatic pre-flight refresh.</p>
                </div>
                <div className="th-review-pill-row">
                  <span className="th-audit-meta-pill">Inline edits</span>
                  <span className="th-audit-meta-pill">Traceable rows</span>
                  <span className="th-audit-meta-pill">No wizard flow</span>
                </div>
              </div>
              <div className="th-review-toolbar">
                <div className="th-chip-row">
                  <button type="button" className={`th-chip${rowSpotlight === 'all' ? ' is-active' : ''}`} onClick={() => { setRowSpotlight('all'); setActiveOperatorIntent(null); }}>All rows</button>
                  <button type="button" className={`th-chip${rowSpotlight === 'donor-review' ? ' is-active' : ''}`} onClick={() => { setRowSpotlight('donor-review'); setActiveOperatorIntent('review-donors'); }}>Donor review</button>
                  <button type="button" className={`th-chip${rowSpotlight === 'identity-review' ? ' is-active' : ''}`} onClick={() => { setRowSpotlight('identity-review'); setActiveOperatorIntent('resolve-identities'); }}>Duplicate gaps</button>
                  <button type="button" className={`th-chip${rowSpotlight === 'mapping-review' ? ' is-active' : ''}`} onClick={() => { setRowSpotlight('mapping-review'); setActiveOperatorIntent('open-mapping'); }}>Mapping exceptions</button>
                </div>
                <span className="th-helper">Showing {visibleRows.length} of {rows.length} rows{activeOperatorIntent ? ` · active intent ${activeOperatorIntent}` : ''}</span>
              </div>
              {previewSourceOrigins.length > 1 && (
                <div className="th-review-source-filters">
                  <div className="th-review-filter-row" style={{ marginBottom: 12 }}>
                    <button type="button" className={`th-chip${previewSourceFocus === 'all' ? ' is-active' : ''}`} onClick={() => setPreviewSourceFocus('all')}>All {displayedPreviewRecords.length}</button>
                    {previewSourceOrigins.map((origin) => (
                      <button
                        key={origin}
                        type="button"
                        title={origin}
                        className={`th-chip${previewSourceFocus === origin ? ' is-active' : ''}`}
                        onClick={() => setPreviewSourceFocus(origin)}
                      >
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: previewSourceColorByOrigin.get(origin), marginRight: 6 }} />
                        {previewSourceBadgeByOrigin.get(origin)}
                      </button>
                    ))}
                  </div>
                  <div className="th-source-legend" aria-label="Source legend">
                    {previewSourceLegendEntries.map((entry) => (
                      <span key={entry.origin} className="th-source-legend-item">
                        <strong>{entry.badge}</strong>
                        <span>=</span>
                        <span>{entry.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="th-table-wrap">
                {nonLedgerTableHeaders.length > 0 && (
                  <div className="th-column-visibility-panel">
                    <div className="th-column-visibility-group">
                      <span className="th-helper">Visible columns</span>
                      <div className="th-chip-row">
                        {visibleNonLedgerTableHeaders.map((header) => (
                          <button
                            key={`visible-${header}`}
                            type="button"
                            className="th-chip th-column-chip"
                            onClick={() => setHiddenPreviewHeaders((current) => Array.from(new Set([...current, header])))}
                            title={`Hide ${formatPreviewHeaderLabel(header)}`}
                          >
                            {formatPreviewHeaderLabel(header)}
                            <span className="th-column-chip-action">Hide</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {hiddenNonLedgerTableHeaders.length > 0 && (
                      <div className="th-column-visibility-group">
                        <span className="th-helper">Hidden columns</span>
                        <div className="th-chip-row">
                          {hiddenNonLedgerTableHeaders.map((header) => (
                            <button
                              key={`hidden-${header}`}
                              type="button"
                              className="th-chip th-column-chip is-hidden"
                              onClick={() => setHiddenPreviewHeaders((current) => current.filter((item) => item !== header))}
                              title={`Show ${formatPreviewHeaderLabel(header)}`}
                            >
                              {formatPreviewHeaderLabel(header)}
                              <span className="th-column-chip-action">Show</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <table className="th-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Trace</th>
                      <th>Date</th>
                      <th>Entity</th>
                      <th>Account</th>
                      <th>Debit</th>
                      <th>Credit</th>
                      <th>Fund / Appeal</th>
                      <th>Journal</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const preflightIssues = (preflight?.issues ?? []).filter((issue) => issue.rowId === row.id || issue.journalId === row.journal_id);
                      const auditFindings = (auditResult?.findings ?? []).filter((finding) => finding.rowIds.includes(row.id));
                      const taxonomyViolations = (taxonomyResult?.violations ?? []).filter((violation) => String(violation.rowRef) === row.source_row_ref);
                      const rowHasIssue = row.needs_review || Boolean(row.suggested_fix) || preflightIssues.length > 0 || auditFindings.length > 0 || taxonomyViolations.length > 0;
                      const rowClassName = [
                        row.id === activeFixRowId ? 'th-row-active-fix' : '',
                        rowSpotlight !== 'all' ? 'th-row-spotlight' : '',
                        rowHasIssue ? 'has-inline-issue' : '',
                      ].filter(Boolean).join(' ') || undefined;
                      const entityIssue = row.needs_review || auditFindings.some((finding) => /donor|entity|identity|person/i.test(`${finding.label} ${finding.message} ${finding.detail}`));
                      const accountIssue = preflightIssues.some((issue) => /account|gl|chart of accounts/i.test(issue.message)) || auditFindings.some((finding) => /account|gl|chart of accounts/i.test(`${finding.label} ${finding.message} ${finding.detail}`));
                      const amountIssue = preflightIssues.some((issue) => /balance|debit|credit|amount/i.test(issue.message)) || auditFindings.some((finding) => /balance|debit|credit|amount/i.test(`${finding.label} ${finding.message} ${finding.detail}`));
                      const taxonomyIssue = taxonomyViolations.length > 0 || preflightIssues.some((issue) => /campaign|appeal|fund|mapping|taxonomy/i.test(issue.message)) || auditFindings.some((finding) => /campaign|appeal|fund|mapping|taxonomy/i.test(`${finding.label} ${finding.message} ${finding.detail}`));
                      const issueChips = [
                        entityIssue ? 'Duplicate check' : null,
                        accountIssue ? 'Wrong GL account' : null,
                        amountIssue ? 'Amount mismatch' : null,
                        taxonomyIssue ? 'Campaign mapping' : null,
                      ].filter(Boolean) as string[];

                      return (
                        <tr key={row.id} id={`th-row-${row.id}`} className={rowClassName}>
                          <td>
                            <div className="th-source-cell">
                              <strong>{row.source_platform}</strong>
                              <span>{row.source_row_ref}</span>
                              {row.source_file && <span>{row.source_file}</span>}
                              {row.canonical_person_id && <span className="th-person-tag">{row.canonical_person_id}</span>}
                            </div>
                          </td>
                          <td>
                            <div className="th-trace-cell">
                              <span className="th-trace-path">{row.source_row_ref} <ArrowRight size={12} /> {row.journal_id || row.account_code || 'pending'}</span>
                              <span>{Math.round(row.mapping_confidence * 100)}% mapping confidence</span>
                              {(row.normalized_fund || row.normalized_appeal) && <span>{row.normalized_fund || row.normalized_appeal}</span>}
                            </div>
                          </td>
                          <td><input value={row.date} onChange={(e) => handleRowChange(row.id, 'date', e.target.value)} /></td>
                          <td className={entityIssue ? 'th-cell-issue' : undefined}><input value={row.entity_name} onChange={(e) => handleRowChange(row.id, 'entity_name', e.target.value)} /></td>
                          <td className={accountIssue ? 'th-cell-issue' : undefined}>
                            <input value={row.account_code} onChange={(e) => handleRowChange(row.id, 'account_code', e.target.value)} style={{ width: 72 }} />
                            <input value={row.account_name} onChange={(e) => handleRowChange(row.id, 'account_name', e.target.value)} style={{ marginTop: 3 }} />
                          </td>
                          <td className={amountIssue ? 'th-cell-issue' : undefined}><input value={row.debit} onChange={(e) => handleRowChange(row.id, 'debit', e.target.value)} style={{ width: 80 }} /></td>
                          <td className={amountIssue ? 'th-cell-issue' : undefined}><input value={row.credit} onChange={(e) => handleRowChange(row.id, 'credit', e.target.value)} style={{ width: 80 }} /></td>
                          <td className={taxonomyIssue ? 'th-cell-issue' : undefined}>
                            <input value={row.raw_fund ?? ''} placeholder="Fund" onChange={(e) => handleRowChange(row.id, 'raw_fund', e.target.value)} />
                            <input value={row.raw_appeal ?? ''} placeholder="Appeal / Campaign" onChange={(e) => handleRowChange(row.id, 'raw_appeal', e.target.value)} style={{ marginTop: 3 }} />
                          </td>
                          <td><input value={row.journal_id} onChange={(e) => handleRowChange(row.id, 'journal_id', e.target.value)} /></td>
                          <td>
                            <span className={`th-status ${row.review_status === 'rejected' ? 'is-rejected' : row.review_status === 'approved' ? 'is-ready' : 'is-review'}`}>
                              {row.review_status === 'rejected' ? 'Rejected' : row.review_status === 'approved' ? 'Approved' : 'Pending'}
                            </span>
                            {row.suggested_fix && <p className="th-inline-note">{row.suggested_fix}</p>}
                            {rowHasIssue && (
                              <div className="th-cell-chip-row">
                                {issueChips.map((chip) => <span key={chip} className="th-cell-chip">{chip}</span>)}
                              </div>
                            )}
                          </td>
                          <td>
                            <button type="button" className="th-link-button" onClick={() => handleAddBalancingRow(row.id)}>Balance</button>
                            <button type="button" className="th-link-button" onClick={() => handleReviewAction(row.id, 'approved')}>Approve</button>
                            <button type="button" className="th-link-button" onClick={() => handleReviewAction(row.id, 'rejected')}>Reject</button>
                            {row.review_status === 'rejected' && (
                              <button type="button" className="th-link-button" onClick={() => handleReviewAction(row.id, 'pending')}>Reopen</button>
                            )}
                            {row.id === activeFixRowId && activeOperatorIntent && (
                              <div className="th-inline-fix">
                                <strong>Active fix target</strong>
                                <p>
                                  {activeOperatorIntent === 'review-donors'
                                    ? 'Approve or reject this donor row to clear the checklist.'
                                    : activeOperatorIntent === 'resolve-identities'
                                      ? 'Send this row into Duplicate check or keep it pending until ownership is clear.'
                                      : 'Open mapping work for this fund or appeal mismatch, then return to approve the row.'}
                                </p>
                                <div className="th-inline-fix-actions">
                                  {activeOperatorIntent === 'review-donors' && (
                                    <>
                                      <button type="button" className="th-map-action" onClick={() => handleReviewAction(row.id, 'approved')}>Approve now</button>
                                      <button type="button" className="th-map-action" onClick={() => handleReviewAction(row.id, 'rejected')}>Reject row</button>
                                    </>
                                  )}
                                  {activeOperatorIntent === 'resolve-identities' && (
                                    <>
                                      <button type="button" className="th-map-action" onClick={() => { jumpToSection('th-identity'); void handleRunPersonResolver(); }}>Run duplicate check</button>
                                      <button type="button" className="th-map-action" onClick={() => handleReviewAction(row.id, 'pending')}>Keep pending</button>
                                    </>
                                  )}
                                  {activeOperatorIntent === 'open-mapping' && (
                                    <>
                                      <button type="button" className="th-map-action" onClick={() => { jumpToSection('th-mapping-layer'); void handleRunTaxonomy(); }}>Run taxonomy</button>
                                      <button type="button" className="th-map-action" onClick={() => handleReviewAction(row.id, 'pending')}>Keep pending</button>
                                    </>
                                  )}
                                  <button type="button" className="th-link-button" onClick={clearOperatorFocus}>Clear focus</button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ── Audit + Pre-flight ───────────────────────────────────────────── */}
        {!isLedgerFile && preview && previewRecords.length > 0 && (
          <section className="th-section" id="th-review">
            <div className="th-panel">
              <div className="th-panel-head">
                <span><span className="th-layer-badge">09</span> Review {fileClass}</span>
                <span>{preview.summary.rowCount} records · {preview.canonicalModel}</span>
              </div>
              {isUploadLoading && (
                <div className="th-review-loader" style={{ marginBottom: 14 }}>
                  <div className="th-review-loader-spinner" aria-hidden="true" />
                  <div>
                    <strong>Loading {activeUploadLabel}</strong>
                    <p>Parsing the sheet, classifying the columns, and preparing the review workspace.</p>
                  </div>
                </div>
              )}
              <div className="th-review-tab-row" style={{ marginBottom: 14 }}>
                {hasPendingColumnMergeReview && (
                  <button
                    type="button"
                    className={`th-chip th-review-tab${nonLedgerReviewPanel === 'schema_union' ? ' is-active' : ''}`}
                    onClick={() => setNonLedgerReviewPanel('schema_union')}
                  >
                    <span>Schema union {pendingColumnMerges.length}</span>
                  </button>
                )}
                {supportsDuplicateWorkflow && <button type="button" className={`th-chip th-review-tab${nonLedgerReviewPanel === 'duplicate' ? ' is-active' : ''}`} onClick={() => setNonLedgerReviewPanel('duplicate')}><span>Step 1 · {primaryMergeStepLabel}</span><span className="th-step-info-icon" title={primaryMergeStepDescription} aria-label={`Step 1 info. ${primaryMergeStepDescription}`} onClick={(event) => event.stopPropagation()}><CircleHelp size={14} /></span></button>}
                {supportsHouseholdWorkflow && hasTransactionLinkFlow && <button type="button" className={`th-chip th-review-tab${nonLedgerReviewPanel === 'matching' ? ' is-active' : ''}`} onClick={() => setNonLedgerReviewPanel('matching')}><span>Step 2 · {matchingStepLabel}</span><span className="th-step-info-icon" title={matchingStepDescription} aria-label={`Step 2 info. ${matchingStepDescription}`} onClick={(event) => event.stopPropagation()}><CircleHelp size={14} /></span></button>}
                {supportsHouseholdWorkflow && <button type="button" className={`th-chip th-review-tab${nonLedgerReviewPanel === 'household' ? ' is-active' : ''}`} onClick={() => setNonLedgerReviewPanel('household')}><span>{`Step ${householdStepNumber} · ${householdCleanupStepLabel}`}</span><span className="th-step-info-icon" title={householdCleanupStepDescription} aria-label={`Step ${householdStepNumber} info. ${householdCleanupStepDescription}`} onClick={(event) => event.stopPropagation()}><CircleHelp size={14} /></span></button>}
                <button type="button" className={"th-chip th-review-tab" + (nonLedgerReviewPanel === "taxonomy" ? " is-active" : "")} onClick={() => setNonLedgerReviewPanel("taxonomy")}><span>{`Step ${taxonomyStepNumber} · ${taxonomyCleanupStepLabel}`}</span><span className="th-step-info-icon" title={taxonomyCleanupStepDescription} aria-label={`Step ${taxonomyStepNumber} info. ${taxonomyCleanupStepDescription}`} onClick={(event) => event.stopPropagation()}><CircleHelp size={14} /></span></button>
                {isDonorFile && <button type="button" className={`th-chip th-review-tab${nonLedgerReviewPanel === 'tx' ? ' is-active' : ''}`} onClick={() => setNonLedgerReviewPanel('tx')}><span>{`Step ${txCleanupStepNumber} · ${txCleanupStepLabel}`}</span><span className="th-step-info-icon" title={txCleanupStepDescription} aria-label={`Step ${txCleanupStepNumber} info. ${txCleanupStepDescription}`} onClick={(event) => event.stopPropagation()}><CircleHelp size={14} /></span></button>}
                <button
                  type="button"
                  className={`th-chip th-review-tab${nonLedgerReviewPanel === 'outcomes' ? ' is-active' : ''}`}
                  onClick={() => setNonLedgerReviewPanel('outcomes')}
                >
                  <span>{`Step ${analyticsStepNumber} · ${analyticsStepLabel}`}</span>
                  <span className="th-step-info-icon" title={analyticsStepDescription} aria-label={`Step ${analyticsStepNumber} info. ${analyticsStepDescription}`} onClick={(event) => event.stopPropagation()}><CircleHelp size={14} /></span>
                </button>
              </div>
              {previewSourceOrigins.length > 1 && (
                <p className="th-helper" style={{ padding: 0, marginTop: -4, marginBottom: 12 }}>
                  Source sheets: {previewSourceLegendEntries.map((entry) => `${entry.badge} = ${entry.label}`).join(' · ')}
                </p>
              )}
              {nonLedgerReviewPanel === 'schema_union' && hasPendingColumnMergeReview && (
                <div className="th-stack" style={{ marginBottom: 14 }}>
                  <div className="th-panel th-inner-panel">
                    <div className="th-panel-head">
                      <span>Schema union review</span>
                      <span>{pendingColumnMerges.length} column item{pendingColumnMerges.length === 1 ? '' : 's'}</span>
                    </div>
                    <p className="th-helper">Confirm column pairs before duplicate review. These items come from the workbook combine step and stay visible here until you resolve them.</p>
                    {pendingColumnMergeSourceFiles.length > 0 && (
                      <p className="th-helper" style={{ padding: 0, marginTop: 6 }}>
                        S1 current table · S2 {pendingColumnMergeSourceFiles.join(' + ')}
                      </p>
                    )}
                  </div>
                  {pendingColumnMerges.map((merge) => (
                    <div key={merge.id} className="th-guardrail is-warning" style={{ alignItems: 'center', gap: 14 }}>
                      <div style={{ flex: 1 }}>
                        <strong>{merge.reason === 'value_review' ? 'Confirm column match' : 'Review possible column match'}</strong>
                        <p><strong>S1 column:</strong> {merge.suggestedHeader}</p>
                        <p><strong>S2 column:</strong> {merge.incomingHeader}</p>
                        <p className="th-helper">
                          {merge.reason === 'value_review'
                            ? 'Same concept, but the sampled values drift enough that this needs review.'
                            : `Fuzzy schema candidate · ${Math.round((merge.score ?? 0) * 100)}%`}
                        </p>
                        {(merge.sampleConflicts ?? []).length > 0 && (
                          <div className="th-stack" style={{ marginTop: 8, gap: 6 }}>
                            {(merge.sampleConflicts ?? []).slice(0, 5).map((conflict, index) => (
                              <p key={`${merge.id}-${conflict.rowRef}-${index}`} className="th-helper" style={{ padding: 0 }}>
                                {conflict.rowRef}: S1 "{conflict.existingValue}" vs S2 "{conflict.incomingValue}" · {conflict.reason.replace(/_/g, ' ')}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="th-review-match-actions">
                        <button type="button" className="th-button th-button-secondary" onClick={() => void handleResolvePendingColumnMerge(merge, 'keep_separate')} disabled={isResolvingPendingMerge}>Keep separate</button>
                        <button type="button" className="th-button th-button-secondary" onClick={() => void handleResolvePendingColumnMerge(merge, 'keep_s1')} disabled={isResolvingPendingMerge}>Keep S1 only</button>
                        <button type="button" className="th-button th-button-secondary" onClick={() => void handleResolvePendingColumnMerge(merge, 'keep_s2')} disabled={isResolvingPendingMerge}>Keep S2 only</button>
                        <button type="button" className="th-button th-button-primary" onClick={() => void handleResolvePendingColumnMerge(merge, 'combine')} disabled={isResolvingPendingMerge}>Combine safe union</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {nonLedgerReviewPanel === 'tx' && (
                <div className="th-stack" style={{ marginBottom: 14 }}>
                  <div className="th-panel th-inner-panel">
                    <div className="th-panel-head">
                      <span>Transaction duplicate queue</span>
                      <span>{txReviewMatches.length} pair{txReviewMatches.length === 1 ? '' : 's'} to review</span>
                    </div>
                    <p className="th-helper">These rows share the same donor, amount, and close date — they may be the same gift entered twice. Review each pair and keep one or keep both.</p>
                  </div>
                  {!txDuplicateResult && (
                    <div className="th-mini-block">
                      <strong>Run donor duplicate check first</strong>
                      <p>Transaction duplicate analysis runs automatically after the donor check (Step 1). Run Step 1 to populate this queue.</p>
                      <button type="button" className="th-button th-button-secondary" style={{ marginTop: 8 }} onClick={() => setNonLedgerReviewPanel('duplicate')}>Go to Step 1 · {primaryMergeStepLabel}</button>
                    </div>
                  )}
                  {txDuplicateResult && txReviewMatches.length === 0 && (
                    <div className="th-mini-block">
                      <strong>No transaction duplicates found</strong>
                      <p>No rows matched on donor + amount + close date. You can proceed to Analytics Review.</p>
                    </div>
                  )}
                  {txReviewMatches.map((match) => {
                    const incomingRecord = previewRecords.find((r) => r.sourceRowRef === match.inputRef) ?? null;
                    const matchedRecordRef = match.reviewPayload?.matchedInputRef ?? null;
                    const matchedRecord = matchedRecordRef ? previewRecords.find((r) => r.sourceRowRef === matchedRecordRef) ?? null : null;
                    const decision = txMergeDecisions.get(match.inputRef);
                    const isExpanded = expandedTxReviewRef === match.inputRef;
                    return (
                      <TransactionDuplicateReviewCard
                        key={match.inputRef}
                        match={match}
                        incomingRecord={incomingRecord}
                        matchedRecord={matchedRecord}
                        compareFields={txCompareFields}
                        decision={decision}
                        isExpanded={isExpanded}
                        previewRecordLabel={previewRecordLabel}
                        getCompactSourceRef={getCompactSourceRef}
                        onToggleExpanded={() => setExpandedTxReviewRef(isExpanded ? null : match.inputRef)}
                        onSetDecision={(nextDecision) => setTxMergeDecisions((prev) => new Map(prev).set(match.inputRef, nextDecision))}
                      />
                    );
                  })}
                </div>
              )}
              {nonLedgerReviewPanel === 'outcomes' && (
                <div id="th-review-analytics" className="th-stack" style={{ marginBottom: 14 }}>
                  <div className="th-review-outcomes-topline">
                    <div>
                      <span className="th-eyebrow">Post-review analytics</span>
                      <h3>Outcome summary after review</h3>
                      <p>Surface the biggest revenue, stewardship, finance, and campaign risks before export.</p>
                      {reviewAnalyticsData?.provenance && (
                        <p className="th-helper" style={{ padding: 0, marginTop: 8 }}>
                          Cleaned layer: {reviewAnalyticsData.provenance.source} · {reviewAnalyticsData.provenance.actionCount} logged review action{reviewAnalyticsData.provenance.actionCount === 1 ? '' : 's'}.
                        </p>
                      )}
                    </div>
                    <div className="th-review-match-actions">
                      <button
                        type="button"
                        className="th-button th-button-primary"
                        onClick={() => void handleGenerateReviewAnalytics()}
                        disabled={isGeneratingReviewAnalytics}
                      >
                        <Database size={14} />
                        {isGeneratingReviewAnalytics ? 'Generating…' : 'Generate data analytics'}
                      </button>
                      {reviewAnalyticsData && (
                        <div className="th-review-outcomes-badge">
                          <strong>{formatCurrencyAmount(displayedOutcomeCards.filter((card) => card.metricKind === 'currency').reduce((sum, card) => sum + card.amount, 0))}</strong>
                          <span>total exposure identified</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {(() => {
                    if (isGeneratingReviewAnalytics) {
                      return (
                        <div className="th-review-loader" style={{ marginBottom: 12 }}>
                          <div className="th-review-loader-spinner" aria-hidden="true" />
                          <div>
                            <strong>Generating post-review analytics</strong>
                            <p>Building outcome cards and workspace items from the reviewed clean layer.</p>
                          </div>
                        </div>
                      );
                    }

                    if (!selectedOutcomeCard) {
                      return (
                        <div className="th-mini-block">
                          <strong>Analytics ready to generate</strong>
                          <p>Run the generator once the review state looks right. The backend will compute cards and workspace items from the post-review dataset only.</p>
                        </div>
                      );
                    }

                    return (
                      <>
                        <div className="th-review-outcomes-grid">
                          {displayedOutcomeCards.map((card) => (
                            <button
                              key={card.id}
                              type="button"
                              className={`th-review-outcome-card is-${card.tone}${selectedOutcomeCardId === card.id ? ' is-active' : ''}`}
                              onClick={() => {
                                setSelectedOutcomeCardId(card.id);
                                setAnalyticsWorkspace((current) => ({ ...current, selectedOutcomeId: card.id }));
                              }}
                            >
                              <span className="th-review-outcome-eyebrow">{card.eyebrow}</span>
                              <strong>{card.title}</strong>
                              <p>{card.summary}</p>
                              <div className="th-review-outcome-supporting">{card.supporting}</div>
                              <div className="th-review-outcome-list" aria-hidden="true">
                                {card.details.map((detail) => (
                                  <div key={`${card.id}-${detail.id}`} className="th-review-outcome-list-item">
                                    <span>{detail.label}</span>
                                    <span>{card.id === 'donor_health' ? detail.ctaLabel : card.metricKind === 'percent' ? `${detail.count} items` : formatCurrencyAmount(detail.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </button>
                          ))}
                        </div>
                        <div className={`th-review-outcome-detail-panel is-${selectedOutcomeCard.tone}`}>
                          <div className="th-review-outcome-detail-head">
                            <div>
                              <span className="th-review-outcome-eyebrow">{selectedOutcomeCard.eyebrow}</span>
                              <h3>{selectedOutcomeCard.title}</h3>
                              <p>{selectedOutcomeCard.summary}</p>
                            </div>
                            {selectedOutcomeCardId !== 'donor_health' && (
                              <div className="th-review-outcome-detail-metric">
                                <strong>{formatOutcomeMetric(selectedOutcomeCard.metricKind, selectedOutcomeCard.amount)}</strong>
                                <span>{selectedOutcomeCard.metricKind === 'percent' ? 'misclassified' : 'exposure'}</span>
                              </div>
                            )}
                          </div>
                          {selectedOutcomeCardId !== 'donor_health' && (
                          <div className="th-review-outcome-detail-grid">
                            {selectedOutcomeCard.details.map((detail) => (
                              <article
                                key={`${selectedOutcomeCard.id}-${detail.id}`}
                                className={`th-review-outcome-detail-card${activeOutcomeDetailId === detail.id ? ' is-active' : ''}`}
                              >
                                <div className="th-review-outcome-detail-copy">
                                  <div>
                                    <span className="th-status-pill is-info">{detail.count} {detail.count === 1 ? 'record' : 'records'}</span>
                                  </div>
                                  <strong>{detail.label}</strong>
                                  <p>{detail.description}</p>
                                </div>
                                <div className="th-review-outcome-detail-actions">
                                  <span className="th-review-outcome-detail-value">
                                    {selectedOutcomeCard.metricKind === 'percent' ? `${Math.round(detail.amount)}%` : formatCurrencyAmount(detail.amount)}
                                  </span>
                                  <button type="button" className="th-button th-button-primary" onClick={() => selectOutcomeDetail(detail.id)}>
                                    Open workspace
                                  </button>
                                  <button type="button" className="th-button th-button-secondary" onClick={() => openOutcomeAction(detail.action)}>
                                    {detail.ctaLabel}
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                          )}
                          {selectedOutcomeCardId === 'donor_health' && donorHealthCards.length > 0 && (
                            <div className="th-review-health-grid">
                              {donorHealthCards.map((card) => (
                                <article key={card.id} className="th-review-health-card">
                                  <div className="th-review-health-head">
                                    <div className="th-stack" style={{ gap: 4 }}>
                                      <strong>{card.title}</strong>
                                      <span className="th-helper">{card.note}</span>
                                    </div>
                                    <span className={`th-chip${card.trend ? ` is-${card.trend}` : ''}`}>{card.metric}</span>
                                  </div>
                                  <div className="th-review-health-meta">
                                    <span>{card.valueLabel}</span>
                                    {card.secondaryLabel && <span>{card.secondaryLabel}</span>}
                                  </div>
                                  {card.bars && card.bars.length > 0 && (
                                    <div className="th-review-health-bars">
                                      {card.bars.map((bar) => (
                                        <div key={`${card.id}-${bar.label}`} className="th-review-health-bar-row">
                                          <span className="th-helper">{bar.label}</span>
                                          <div className="th-review-health-bar-track">
                                            <div
                                              className={`th-review-health-bar${bar.tone === 'secondary' ? ' is-secondary' : ''}`}
                                              style={{
                                                width: `${Math.max(8, Math.min(100, (bar.value / Math.max(...card.bars!.map((item) => item.value), 1)) * 100))}%`,
                                              }}
                                            />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </article>
                              ))}
                            </div>
                          )}
                          {selectedOutcomeCardId !== 'donor_health' && activeOutcomeDetail && (
                            <div className="th-review-outcome-workspace">
                              <div className="th-review-outcome-workspace-head">
                                <div>
                                  <span className="th-review-outcome-eyebrow">Focused workspace</span>
                                  <h3>{activeOutcomeDetail.label}</h3>
                                  <p>Filter, sort, and save views of this problem instead of building a custom dashboard.</p>
                                </div>
                                <div className="th-review-outcomes-badge">
                                  <strong>{filteredAnalyticsItems.length}</strong>
                                  <span>items in current view</span>
                                </div>
                              </div>
                              <div className="th-review-outcome-workspace-controls">
                                <label className="th-stack">
                                  <span className="th-helper">Campaign</span>
                                  <select className="th-select" value={activeAnalyticsFilters.campaign} onChange={(event) => updateAnalyticsFilters({ campaign: event.target.value })}>
                                    <option value="all">All campaigns</option>
                                    {analyticsCampaignOptions.map((campaign) => (
                                      <option key={`${activeOutcomeDetail.id}-${campaign}`} value={campaign}>{campaign}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="th-stack">
                                  <span className="th-helper">Donor segment</span>
                                  <select className="th-select" value={activeAnalyticsFilters.donorSegment} onChange={(event) => updateAnalyticsFilters({ donorSegment: event.target.value })}>
                                    <option value="all">All segments</option>
                                    {analyticsSegmentOptions.map((segment) => (
                                      <option key={`${activeOutcomeDetail.id}-${segment}`} value={segment}>{segment}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="th-stack">
                                  <span className="th-helper">Minimum amount</span>
                                  <input
                                    className="th-input"
                                    inputMode="numeric"
                                    value={activeAnalyticsFilters.minAmount ?? ''}
                                    onChange={(event) => updateAnalyticsFilters({ minAmount: event.target.value.trim() ? Number(event.target.value.replace(/[^0-9.-]+/g, '')) : null })}
                                    placeholder="$0"
                                  />
                                </label>
                                <label className="th-stack">
                                  <span className="th-helper">Sort</span>
                                  <select className="th-select" value={activeAnalyticsFilters.sort} onChange={(event) => updateAnalyticsFilters({ sort: event.target.value as AnalyticsWorkspaceFilters['sort'] })}>
                                    <option value="highest_value">Highest value</option>
                                    <option value="most_recent">Most recent</option>
                                    <option value="largest_gap">Largest gap</option>
                                  </select>
                                </label>
                                <label className="th-review-toggle">
                                  <input type="checkbox" checked={activeAnalyticsFilters.includeDuplicates} onChange={(event) => updateAnalyticsFilters({ includeDuplicates: event.target.checked })} />
                                  <span>Include duplicates</span>
                                </label>
                                <label className="th-review-toggle">
                                  <input type="checkbox" checked={activeAnalyticsFilters.includeSoftCredit} onChange={(event) => updateAnalyticsFilters({ includeSoftCredit: event.target.checked })} />
                                  <span>Include soft credit</span>
                                </label>
                              </div>
                              <div className="th-review-outcome-saved-views">
                                <div className="th-panel-head" style={{ marginBottom: 0 }}>
                                  <span>Saved views</span>
                                  <span>{analyticsSavedViewsForOutcome.length}</span>
                                </div>
                                <div className="th-review-outcome-saved-controls">
                                  <input
                                    className="th-input"
                                    placeholder="Save this view"
                                    value={analyticsSavedViewDraft}
                                    onChange={(event) => setAnalyticsSavedViewDraft(event.target.value)}
                                  />
                                  <button type="button" className="th-button th-button-primary" onClick={() => void handleSaveAnalyticsView()}>
                                    Save current view
                                  </button>
                                  <button
                                    type="button"
                                    className="th-button th-button-secondary"
                                    onClick={() => {
                                      updateAnalyticsFilters(buildDefaultAnalyticsFilters());
                                      setAnalyticsSavedViewDraft('');
                                    }}
                                  >
                                    Reset filters
                                  </button>
                                </div>
                                <div className="th-chip-row">
                                  {analyticsSavedViewsForOutcome.length === 0 ? (
                                    <>
                                      <span className="th-helper">No saved views yet for this outcome.</span>
                                      {(reviewAnalyticsData?.suggestedViews ?? [])
                                        .filter((view) => view.outcomeId === selectedOutcomeCardId)
                                        .map((view) => (
                                          <button
                                            key={view.id}
                                            type="button"
                                            className="th-chip"
                                            onClick={() => {
                                              const detailId = view.detailId;
                                              setAnalyticsSavedViewDraft(view.name);
                                              selectOutcomeDetail(detailId);
                                            }}
                                          >
                                            {view.name}
                                          </button>
                                        ))}
                                    </>
                                  ) : (
                                    analyticsSavedViewsForOutcome.map((view) => (
                                      <div key={view.id} className="th-review-outcome-saved-view">
                                        <button type="button" className="th-chip" onClick={() => void applyAnalyticsSavedView(view)}>
                                          {view.name}
                                        </button>
                                        <button type="button" className="th-link-button" onClick={() => void deleteAnalyticsSavedView(view.id)}>
                                          Remove
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                                              <div className="th-review-outcome-results">
                                {filteredAnalyticsItems.length === 0 ? (
                                  <div className="th-mini-block">
                                    <strong>No items in this view</strong>
                                    <p>Try widening the filters or include duplicates / soft credit to broaden the result set.</p>
                                  </div>
                                ) : (
                                  filteredAnalyticsItems.map((item) => (
                                    <article key={item.id} className="th-review-outcome-result-row">
                                      <div className="th-review-outcome-result-copy">
                                        <strong>{item.label}</strong>
                                        <p>{item.description}</p>
                                        <div className="th-chip-row">
                                          <span className="th-chip">{item.campaign}</span>
                                          <span className="th-chip">{item.donorSegment}</span>
                                          {item.duplicateCount > 0 && <span className="th-chip">duplicates {item.duplicateCount}</span>}
                                          {item.includesSoftCredit && <span className="th-chip">soft credit</span>}
                                        </div>
                                      </div>
                                      <div className="th-review-outcome-result-actions">
                                        <strong>{selectedOutcomeCard.metricKind === 'percent' ? `${Math.round(item.amount)} impacted` : formatCurrencyAmount(item.amount)}</strong>
                                        {item.evidenceRows && item.evidenceRows.length > 0 && (
                                          <button
                                            type="button"
                                            className="th-button th-button-secondary"
                                            onClick={() => setExpandedAnalyticsItemId((current) => current === item.id ? null : item.id)}
                                          >
                                            {expandedAnalyticsItemId === item.id ? 'Hide activity' : 'Show activity'}
                                          </button>
                                        )}
                                        <button type="button" className="th-button th-button-secondary" onClick={() => openOutcomeAction(item.action)}>
                                          Open records
                                        </button>
                                      </div>
                                      {expandedAnalyticsItemId === item.id && item.evidenceRows && item.evidenceRows.length > 0 && (
                                        <div className="th-stack" style={{ gridColumn: '1 / -1', paddingTop: 8 }}>
                                          <strong style={{ fontSize: '0.9rem' }}>Recent recurring activity</strong>
                                          <div className="th-stack" style={{ gap: 8 }}>
                                            {item.evidenceRows.map((evidence) => (
                                              <div
                                                key={`${item.id}-${evidence.sourceRowRef}`}
                                                style={{
                                                  display: 'grid',
                                                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                                                  gap: 12,
                                                  alignItems: 'center',
                                                  padding: '10px 12px',
                                                  border: '1px solid rgba(15, 23, 42, 0.08)',
                                                  borderRadius: 14,
                                                  background: 'rgba(255, 255, 255, 0.78)',
                                                }}
                                              >
                                                <div className="th-stack" style={{ gap: 4 }}>
                                                  <span style={{ fontWeight: 600 }}>{formatReviewTransactionDate(evidence.date)}</span>
                                                  <span className="th-helper">{[evidence.source, evidence.type, evidence.recurring ? 'explicit recurring' : null].filter(Boolean).join(' · ')}</span>
                                                </div>
                                                <strong>{formatCurrencyAmount(evidence.amount)}</strong>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </article>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
              {nonLedgerReviewPanel === 'taxonomy' && (
                <div className="th-panel th-inner-panel th-taxonomy-session-panel" style={{ marginBottom: 14 }}>
                  <div className="th-panel-head">
                    <span>Possible same taxonomy labels</span>
                    <span>{taxonomyState ? `${taxonomySummary.resolved} resolved · ${taxonomySummary.open} open` : 'not run'}</span>
                  </div>
                  <p className="th-helper">No registry required. TransformHub scans likely taxonomy columns, compares similar labels, and asks you to confirm when two values may describe the same campaign, appeal, or fund. This review only runs after you click the button below.</p>
                  <div className="th-action-row" style={{ marginBottom: 12 }}>
                    <button type="button" className="th-button th-button-primary" onClick={() => void handleRunTaxonomyReview()} disabled={isRunningTaxonomyReview}>
                      <FolderTree size={14} /> {isRunningTaxonomyReview ? 'Running taxonomy review…' : taxonomyState ? 'Rerun taxonomy review' : 'Run taxonomy review'}
                    </button>
                  </div>
                  {isRunningTaxonomyReview && (
                    <div className="th-review-loader" style={{ marginBottom: 12 }}>
                      <div className="th-review-loader-spinner" aria-hidden="true" />
                      <div>
                        <strong>Scanning taxonomy labels</strong>
                        <p>Comparing campaigns, funds, and appeals across the uploaded records.</p>
                      </div>
                    </div>
                  )}
                  {taxonomyState ? (
                    <>
                      <div className="th-mini-block" style={{ marginBottom: 12 }}>
                        <div className="th-review-match-head">
                          <div style={{ flex: 1 }}>
                            <strong>Included taxonomy columns ({taxonomyState.scanColumns.length})</strong>
                            <p className="th-helper" style={{ padding: 0, marginTop: 6 }}>We now hide this by default and exclude obvious non-taxonomy fields like dates, amounts, names, addresses, and transaction metadata.</p>
                          </div>
                          <div className="th-review-match-actions">
                            <button
                              type="button"
                              className="th-button th-button-secondary"
                              onClick={() => setTaxonomyScanColumnsExpanded((current) => current ? false : true)}
                            >
                              {taxonomyScanColumnsExpanded ? 'Hide included columns' : 'Show included columns'}
                            </button>
                          </div>
                        </div>
                        {taxonomyScanColumnsExpanded && (
                          <div className="th-review-filter-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                            {taxonomyState.scanColumns.map((column) => (
                              <button
                                key={column.header}
                                type="button"
                                className={"th-chip" + (column.included ? " is-active" : "")}
                                onClick={() => void handleToggleTaxonomyColumn(column.header, column.included ? false : true)}
                                title={column.reasonSignals.join(' · ')}
                              >
                                {column.header} · {column.objectType}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="th-grid th-grid-3" style={{ marginBottom: 12 }}>
                        <div className="th-stat-chip th-band-auto"><strong>{taxonomySummary.high}</strong><span>High-confidence groups</span></div>
                        <div className="th-stat-chip th-band-review"><strong>{taxonomySummary.medium}</strong><span>Manual review groups</span></div>
                        <div className="th-stat-chip th-band-separate"><strong>{taxonomyState.observedValues.length}</strong><span>Observed labels</span></div>
                      </div>
                      <div className="th-stack">
                        {taxonomyState.candidateGroups.filter((group) => group.status === 'pending' && !taxonomyState.dismissedCandidateIds.includes(group.id)).length === 0 ? (
                          <div className="th-guardrail is-clear">
                            <CheckCircle2 size={15} />
                            <div><strong>No open taxonomy candidates</strong><p>Everything currently looks distinct or already resolved for this session.</p></div>
                          </div>
                        ) : (
                          taxonomyState.candidateGroups
                            .filter((group) => group.status === 'pending' && !taxonomyState.dismissedCandidateIds.includes(group.id))
                            .map((group) => (
                              <div key={group.id} className={"th-guardrail th-taxonomy-candidate-card " + (group.confidenceBand === 'high' ? 'is-clear' : 'is-warning')}>
                                <div style={{ flex: 1 }}>
                                  <strong>{group.objectType} from {Array.from(new Set(group.members.map((member) => member.header))).join(' · ')}</strong>
                                  <p>{group.suggestedCanonicalLabel} · {Math.round(group.score * 100)}% match · {group.reasonSignals.join(' · ') || 'Similarity signals found'}</p>
                                  <div className="th-chip-row" style={{ marginTop: 10 }}>
                                    {group.members.map((member) => (
                                      <span key={member.observedValueId} className="th-chip th-taxonomy-member-chip">{member.rawValue} ({member.rowCount} row{member.rowCount === 1 ? '' : 's'})</span>
                                    ))}
                                  </div>
                                </div>
                                <div className="th-review-match-actions">
                                  <button type="button" className="th-button th-button-primary" onClick={() => void handleMergeTaxonomyCandidate(group.id, group.suggestedCanonicalLabel)}>Merge as same taxonomy</button>
                                  <button type="button" className="th-button th-button-secondary" onClick={() => void handleDismissTaxonomyCandidate(group.id)}>Keep separate</button>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                      {taxonomyState.resolvedGroups.length > 0 && (
                        <div className="th-stack" style={{ marginTop: 16 }}>
                          <div className="th-panel-head" style={{ marginBottom: 0 }}>
                            <span>Merged taxonomy labels</span>
                            <span>{taxonomyState.resolvedGroups.length} saved</span>
                          </div>
                          <div className="th-table-wrap th-taxonomy-resolved-table-wrap">
                            <table className="th-table th-taxonomy-resolved-table">
                              <thead>
                                <tr>
                                  <th>Type</th>
                                  <th>Merged name</th>
                                  <th>Aliases</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {taxonomyState.resolvedGroups.map((group) => {
                                  const isEditing = editingResolvedTaxonomyGroupId === group.id;
                                  return (
                                    <tr key={group.id}>
                                      <td>{group.objectType}</td>
                                      <td>
                                        {isEditing ? (
                                          <input
                                            className="th-input"
                                            value={editingResolvedTaxonomyLabel}
                                            onChange={(event) => setEditingResolvedTaxonomyLabel(event.target.value)}
                                            onKeyDown={(event) => {
                                              if (event.key === 'Enter') {
                                                event.preventDefault();
                                                void saveResolvedTaxonomyGroupEdit();
                                              }
                                              if (event.key === 'Escape') {
                                                event.preventDefault();
                                                cancelResolvedTaxonomyGroupEdit();
                                              }
                                            }}
                                            autoFocus
                                          />
                                        ) : (
                                          <strong>{group.canonicalLabel}</strong>
                                        )}
                                      </td>
                                      <td>
                                        <div className="th-chip-row">
                                          {group.aliases.map((alias) => (
                                            <span key={`${group.id}-${alias}`} className="th-chip th-taxonomy-member-chip">{alias}</span>
                                          ))}
                                        </div>
                                      </td>
                                      <td>
                                        <div className="th-review-match-actions">
                                          {isEditing ? (
                                            <>
                                              <button type="button" className="th-button th-button-secondary" onClick={cancelResolvedTaxonomyGroupEdit}>Cancel</button>
                                              <button type="button" className="th-button th-button-primary" onClick={() => void saveResolvedTaxonomyGroupEdit()} disabled={!editingResolvedTaxonomyLabel.trim()}>
                                                Save name
                                              </button>
                                            </>
                                          ) : (
                                            <button type="button" className="th-button th-button-secondary" onClick={() => startResolvedTaxonomyGroupEdit(group.id, group.canonicalLabel)}>Edit name</button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="th-mini-block" style={{ marginBottom: 12 }}>
                      <strong>Taxonomy review has not run yet</strong>
                      <p>Nothing will be scanned until you explicitly start this review.</p>
                    </div>
                  )}
                </div>
              )}
              {supportsDuplicateWorkflow && (nonLedgerReviewPanel === 'duplicate' || nonLedgerReviewPanel === 'matching' || nonLedgerReviewPanel === 'household') && (
                <div className="th-grid th-main-grid" style={{ marginBottom: 14 }}>
                  {nonLedgerReviewPanel === 'duplicate' && (
                    <article className="th-panel th-inner-panel">
                      <div className="th-panel-head"><span>{primaryMergeStepLabel}</span><span>{personResult ? `${canonicalPeople.length} resolved` : "not run"}</span></div>
                      <p className="th-helper">{primaryMergeStepDescription} Any pending items here block the matching step.</p>
                      <div className="th-grid th-grid-4" style={{ marginBottom: 10 }}>
                        <div className="th-stat-chip th-band-auto"><strong>{duplicateClassCounts.exact_match}</strong><span>Exact</span></div>
                        <div className="th-stat-chip th-band-review"><strong>{duplicateClassCounts.likely_match}</strong><span>Likely</span></div>
                        <div className="th-stat-chip th-band-review"><strong>{duplicateClassCounts.possible_match}</strong><span>Possible</span></div>
                        <div className="th-stat-chip th-band-separate"><strong>{duplicateClassCounts.no_match}</strong><span>No match</span></div>
                      </div>
                      <div className="th-action-row">
                        <button type="button" className="th-button th-button-primary" onClick={handleRunPersonResolver} disabled={isRunningPersonResolver || isResettingPeople || isRunningHouseholdResolver}>
                          <Users size={14} /> {isRunningPersonResolver ? duplicateRunningLabel : personResult ? duplicateRerunLabel : duplicateRunLabel}
                        </button>
                        <button type="button" className="th-button th-button-secondary" onClick={handleResetPeopleState} disabled={(!personResult && !householdResult) || isRunningPersonResolver || isResettingPeople || isRunningHouseholdResolver}>
                          <RefreshCcw size={14} /> {isResettingPeople ? duplicateResettingLabel : duplicateResetLabel}
                        </button>
                      </div>
                      {isRunningPersonResolver && (
                        <div className="th-review-loader" style={{ marginTop: 12 }}>
                          <div className="th-review-loader-spinner" aria-hidden="true" />
                          <div>
                            <strong>{duplicateRunningLabel.replace(/…$/, '')}</strong>
                            <p>{isDonorFile ? 'Scoring likely duplicate transactions and rebuilding the manual keep-one / keep-both queue.' : 'Scoring likely duplicate profiles and rebuilding the manual merge queue.'}</p>
                          </div>
                        </div>
                      )}
                    </article>
                  )}
                  {supportsHouseholdWorkflow && matchingReviewActive && (
                    <article className="th-panel th-inner-panel">
                      <div className="th-panel-head"><span>{matchingStepLabel}</span><span>{filteredDisplayedPreviewRecords.length} rows</span></div>
                      <p className="th-helper">{matchingStepDescription} This step unlocks only after Step 1 is clean.</p>
                      {hasTransactionLinkFlow && (
                        <p className="th-helper">Transaction rows stay as the base rows. Matched profile fields are added onto those rows, and unmatched profiles are appended as separate rows. If both tables contain the same field, the profile version uses a <code>profile_</code> prefix.</p>
                      )}
                      <div className="th-action-row">
                        <button type="button" className="th-button th-button-primary" onClick={() => jumpToSection('th-review-table')} disabled={!peopleStepReady}>
                          <Database size={14} /> Open merged table
                        </button>
                      </div>
                      {!peopleStepReady && (
                        <p className="th-helper">Resolve {pendingPeopleReviews} pending Step 1 review{pendingPeopleReviews === 1 ? '' : 's'} to unlock this matching layer.</p>
                      )}
                    </article>
                  )}
                  {supportsHouseholdWorkflow && householdReviewActive && (
                    <article className="th-panel th-inner-panel">
                      <div className="th-panel-head"><span>{householdCleanupStepLabel}</span><span>{isRunningHouseholdResolver ? 'running' : householdResult ? `${householdResult.households.length} matched` : 'not run'}</span></div>
                      <p className="th-helper">{householdCleanupStepDescription} This step uses the Step 2 merge tables underneath.</p>
                      <div className="th-action-row">
                        <button type="button" className="th-button th-button-primary" onClick={handleRunHouseholdResolver} disabled={!peopleStepReady || isRunningHouseholdResolver}>
                          <Building2 size={14} /> {isRunningHouseholdResolver ? 'Building matches…' : householdCleanupStepLabel}
                        </button>
                        <button type="button" className="th-button th-button-secondary" onClick={() => void handleRefreshEntityModel(false)} disabled={!peopleStepReady || isRefreshingEntityModel}>
                          <Database size={14} /> {isRefreshingEntityModel ? 'Previewing merge tables…' : 'Preview merge tables'}
                        </button>
                      </div>
                      {isRunningHouseholdResolver ? (
                        <div className="th-review-loader" style={{ marginTop: 12 }}>
                          <div className="th-review-loader-spinner" aria-hidden="true" />
                          <div>
                            <strong>{householdCleanupStepLabel}</strong>
                            <p>{isDonorFile ? 'Linking cleaned transactions to people and building the household-facing review layer.' : 'Grouping resolved profiles and preparing the relationship review.'}</p>
                          </div>
                        </div>
                      ) : !peopleStepReady && (
                        <p className="th-helper">Resolve {pendingPeopleReviews} pending Step 1 review{pendingPeopleReviews === 1 ? '' : 's'} to unlock household cleanup.</p>
                      )}
                    </article>
                  )}
                </div>
              )}              {supportsHouseholdWorkflow && matchingReviewActive && (
                <div className="th-stack" style={{ marginBottom: 14 }}>
                  {!peopleStepReady ? (
                    <div className="th-mini-block">
                      <strong>Merge tables are locked</strong>
                      <p>Resolve duplicate review first so the person layer is stable before the joined tables are previewed.</p>
                    </div>
                  ) : (
                    <article className="th-panel th-inner-panel">
                      <div className="th-panel-head">
                        <span>Merged table</span>
                        <span>{filteredDisplayedPreviewRecords.length} visible row{filteredDisplayedPreviewRecords.length === 1 ? '' : 's'}</span>
                      </div>
                      <p className="th-helper">The canonical profiles / transactions preview has been removed here. Use the merged review table directly for verification and edits.</p>
                      <div className="th-action-row">
                        <button type="button" className="th-button th-button-primary" onClick={() => jumpToSection('th-review-table')}>
                          Open merged table
                        </button>
                      </div>
                    </article>
                  )}
                </div>
              )}              {supportsHouseholdWorkflow && householdReviewActive && (
                <div className="th-stack" style={{ marginBottom: 14 }}>
                  {!peopleStepReady ? (
                    <div className="th-mini-block">
                      <strong>Relationship layer is locked</strong>
                      <p>Resolve duplicate review first. Householding creates a grouping object above people, so the person layer has to be stable before relationship logic is safe.</p>
                    </div>
                  ) : householdLayerViews.length === 0 ? (
                    <div className="th-mini-block">
                      <strong>No households built yet</strong>
                      <p>Run householding to create relationship objects without collapsing the person records.</p>
                    </div>
                  ) : (
                    <>
                      <div className="th-review-tab-row" style={{ marginBottom: 14 }}>
                        <button type="button" className={`th-chip th-review-tab${householdReviewTab === 'needs_attribution' ? ' is-active' : ''}`} onClick={() => setHouseholdReviewTab('needs_attribution')}>
                          Needs attribution {householdsNeedingAttribution.size}
                        </button>
                        <button type="button" className={`th-chip th-review-tab${householdReviewTab === 'all' ? ' is-active' : ''}`} onClick={() => setHouseholdReviewTab('all')}>
                          All households {householdLayerViews.length}
                        </button>
                      </div>
                      {visibleHouseholdLayerViews.length === 0 ? (
                        <div className="th-mini-block">
                          <strong>No households need attribution review</strong>
                          <p>All current households are either complete or only have non-attribution warnings.</p>
                        </div>
                      ) : (
                    <div className="th-household-review-list">
                      <div className="th-household-summary-header" aria-hidden="true">
                        <span />
                        <span>Household / members</span>
                        <span>Communication</span>
                        <span>Individual</span>
                        <span>HH total</span>
                        <span>Status</span>
                      </div>
                      {visibleHouseholdLayerViews.map((view) => {
                        const isExpanded = expandedHouseholdReviewId === view.householdId;
                        return (
                          <article key={view.householdId} className={`th-panel th-inner-panel th-household-summary-card${isExpanded ? ' is-expanded' : ''}`}>
                            <button
                              type="button"
                              className="th-household-summary-row"
                              aria-expanded={isExpanded}
                              aria-controls={`th-household-detail-${view.householdId}`}
                              onClick={() => setExpandedHouseholdReviewId(isExpanded ? null : view.householdId)}
                            >
                              <span className={`th-household-summary-toggle${isExpanded ? ' is-expanded' : ''}`} aria-hidden="true">
                                <ArrowRight size={18} />
                              </span>
                              <div className="th-household-summary-main">
                                <strong>{view.draft.label}</strong>
                                <div className="th-chip-row" style={{ marginTop: 10 }}>
                                  {view.members.map((member) => (
                                    <span key={`${view.householdId}-${member.id}`} className="th-person-id">{formatPersonName(member)} {member.id}</span>
                                  ))}
                                </div>
                              </div>
                              <div className="th-household-summary-communication">
                                <strong>{view.communication.addressee}</strong>
                                <p>{view.communication.formalSalutation}</p>
                                <span>Primary: {view.communication.primaryLabel}</span>
                              </div>
                              <div className="th-household-summary-individual">
                                <strong>{view.reporting.memberBreakdown.map((member) => member.total > 0 ? formatCurrencyAmount(member.total) : '—').join(' / ')}</strong>
                                <p>{view.reporting.memberBreakdown.map((member) => member.name.split(' ')[0] || member.name).join(' / ')}</p>
                                <span>Last gift {formatReviewDate(view.reporting.lastGift)}</span>
                              </div>
                              <div className="th-household-summary-total">
                                <strong>{view.reporting.householdTotal > 0 ? formatCurrencyAmount(view.reporting.householdTotal) : 'No gifts'}</strong>
                                <span>{view.reporting.giftCount} gift{view.reporting.giftCount === 1 ? '' : 's'} · {view.reporting.yearsGiving > 0 ? `${view.reporting.yearsGiving} yr` : '— yr'}</span>
                              </div>
                              <div className="th-household-summary-status">
                                <span className={`th-status-pill is-${view.status.tone}`}>{view.status.label}</span>
                                <span>{view.status.note}</span>
                              </div>
                            </button>
                            {isExpanded && (
                              <div id={`th-household-detail-${view.householdId}`} className="th-household-expanded-card">
                                {view.alerts.length > 0 && (
                                  <div className="th-household-alert">
                                    <AlertTriangle size={14} />
                                    <span>{view.alerts[0]}</span>
                                  </div>
                                )}
                                <div className="th-household-expanded-grid">
                                  <section className="th-mini-block th-household-detail-section">
                                    <strong>Members</strong>
                                    <div className="th-stack" style={{ marginTop: 10 }}>
                                      {view.members.map((member) => (
                                        (() => {
                                          const removalKey = `${view.householdId}:${member.id}`;
                                          const isPendingRemoval = pendingHouseholdMemberRemovalKey === removalKey;
                                          return (
                                            <div key={member.id} className="th-household-member-row">
                                              <div className="th-household-member-ident">
                                                <span className="th-household-member-avatar">{getPersonInitials(member)}</span>
                                                <div>
                                                  <strong>{formatPersonName(member)}</strong>
                                                  <p>{member.id}</p>
                                                </div>
                                              </div>
                                              <div className="th-household-member-actions">
                                                <span>{member.id === view.draft.primaryPersonId ? 'primary' : 'member'}</span>
                                                {isPendingRemoval ? (
                                                  <div className="th-household-member-confirm">
                                                    <button
                                                      type="button"
                                                      className="th-button th-button-secondary th-household-member-confirm-button"
                                                      onClick={() => removeMemberFromHousehold(view.householdId, member.id)}
                                                    >
                                                      Remove from household
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="th-button th-button-secondary th-household-member-cancel-button"
                                                      onClick={() => setPendingHouseholdMemberRemovalKey(null)}
                                                    >
                                                      Cancel
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <button
                                                    type="button"
                                                    className="th-household-member-delete-button"
                                                    onClick={() => setPendingHouseholdMemberRemovalKey(removalKey)}
                                                    aria-label={`Remove ${formatPersonName(member)} from household ${view.draft.label}`}
                                                  >
                                                    <X size={14} />
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })()
                                      ))}
                                    </div>
                                  </section>
                                  <section className="th-mini-block th-household-detail-section">
                                    <strong>Giving breakdown</strong>
                                    <div className="th-stack" style={{ marginTop: 10 }}>
                                      {view.reporting.memberBreakdown.map((member) => (
                                        <div key={`${view.householdId}-giving-${member.personId}`} className="th-household-giving-row">
                                          <div>
                                            <strong>{member.name}</strong>
                                            <p>{member.giftCount} gift{member.giftCount === 1 ? '' : 's'}</p>
                                          </div>
                                          <span>{member.total > 0 ? formatCurrencyAmount(member.total) : 'No gifts'}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </section>
                                </div>
                                {view.relatedRecords.length > 0 && (
                                  <section className="th-mini-block th-household-detail-section">
                                    <div className="th-panel-head" style={{ marginBottom: 10 }}>
                                      <span>Attribution rows</span>
                                      <div className="th-review-match-actions">
                                        <button
                                          type="button"
                                          className="th-button th-button-primary"
                                          style={{ minHeight: 32 }}
                                          onClick={() => applyEmbeddedHouseholdChanges(view.householdId)}
                                          disabled={!embeddedHouseholdDrafts[view.householdId] || Object.keys(embeddedHouseholdDrafts[view.householdId]).length === 0}
                                        >
                                          Apply changes
                                        </button>
                                        <button
                                          type="button"
                                          className="th-button th-button-secondary"
                                          style={{ minHeight: 32 }}
                                          onClick={() => jumpToSection('th-review-table')}
                                        >
                                          Open full table ↓
                                        </button>
                                      </div>
                                    </div>
                                    <div className="th-household-embedded-table-wrap">
                                      <table className="th-household-embedded-table">
                                        <thead>
                                          <tr>
                                            <th>Source</th>
                                            <th>Role</th>
                                            <th>Attribution</th>
                                            <th>Credit</th>
                                            <th>Household</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {view.relatedRecords.map((record) => {
                                            const { matchedPerson, draft: sharedDraft, assignedHouseholdId: sharedAssignedHouseholdId } = getAttributionDraftForRecord(record);
                                            const stagedDraft = embeddedHouseholdDrafts[view.householdId]?.[record.sourceRowRef] ?? null;
                                            const attributionDraft = stagedDraft ?? sharedDraft;
                                            const assignedHouseholdId = stagedDraft
                                              ? (stagedDraft.householdRemoved ? null : (stagedDraft.householdId ?? sharedAssignedHouseholdId))
                                              : (attributionDraft.householdRemoved ? null : (attributionDraft.householdId ?? sharedAssignedHouseholdId));
                                            const assignedHouseholdLabel = assignedHouseholdId ? householdLabelById.get(assignedHouseholdId) ?? assignedHouseholdId : 'No household';
                                            const recordRole = getRecordRole(record, attributionDraft, matchedPerson);
                                            const rawAmount = parseCurrencyAmount(record.amount);
                                            const displayCreditAmount = getDisplayCreditAmount(attributionDraft, rawAmount, recordRole);
                                            const sourceLabel = previewRecordLabel(record);
                                            const matchedLabel = matchedPerson ? formatPersonName(matchedPerson) : null;
                                            const transactionId = getPreviewRecordTransactionId(record);
                                            const transactionDate = record.date ? formatReviewTransactionDate(String(record.date)) : null;
                                            const rawAmountLabel = rawAmount !== null ? formatCurrencyAmount(rawAmount) : null;
                                            const showsMatchedOverride = Boolean(
                                              matchedLabel
                                              && matchedLabel.trim().toLowerCase() !== sourceLabel.trim().toLowerCase(),
                                            );
                                            return (
                                              <tr key={`${view.householdId}-${record.sourceRowRef}`}>
                                                <td>
                                                  <strong>{sourceLabel}</strong>
                                                  <div className="th-inline-note">{transactionId ?? getCompactSourceRef(record.sourceRowRef).primary}</div>
                                                  {(transactionDate || rawAmountLabel) && (
                                                    <div className="th-inline-note">{[transactionDate, rawAmountLabel].filter(Boolean).join(' · ')}</div>
                                                  )}
                                                  {showsMatchedOverride && (
                                                    <div className="th-inline-note">Matched to {matchedLabel}</div>
                                                  )}
                                                </td>
                                                <td>
                                                  <select
                                                    className="th-table-cell-input"
                                                    value={recordRole}
                                                    onChange={(event) => updateEmbeddedHouseholdDraft(view.householdId, record.sourceRowRef, buildDraftForRoleSelection(attributionDraft, matchedPerson, assignedHouseholdId, event.target.value as 'primary' | 'secondary' | 'organization' | 'unassigned'))}
                                                    aria-label={`Role for ${sourceLabel}`}
                                                  >
                                                    <option value="primary">Primary</option>
                                                    <option value="secondary">Secondary</option>
                                                    <option value="organization">Organization</option>
                                                    <option value="unassigned">Unassigned</option>
                                                  </select>
                                                </td>
                                                <td>
                                                  <select
                                                    className="th-table-cell-input"
                                                    value={attributionDraft.mode}
                                                    onChange={(event) => updateEmbeddedHouseholdDraft(
                                                      view.householdId,
                                                      record.sourceRowRef,
                                                      buildDraftForModeSelection(
                                                        attributionDraft,
                                                        rawAmount,
                                                        event.target.value as PreviewAttributionDraft['mode'],
                                                      ),
                                                    )}
                                                    aria-label={`Attribution type for ${sourceLabel}`}
                                                  >
                                                    <option value="person">Hard credit</option>
                                                    <option value="soft_credit">Soft credit</option>
                                                    <option value="joint_split">Joint gift</option>
                                                    <option value="org_match">Org match</option>
                                                  </select>
                                                </td>
                                                <td>
                                                  <input
                                                    className="th-table-cell-input"
                                                    value={String(attributionDraft.creditAmount ?? rawAmount ?? '')}
                                                    onChange={(event) => {
                                                      const normalized = event.target.value.replace(/[^0-9.-]+/g, '');
                                                      const parsed = normalized ? Number(normalized) : null;
                                                      updateEmbeddedHouseholdDraft(view.householdId, record.sourceRowRef, {
                                                        ...attributionDraft,
                                                        creditAmount: parsed !== null && Number.isFinite(parsed) ? parsed : null,
                                                      });
                                                    }}
                                                    aria-label={`Credit amount for ${sourceLabel}`}
                                                  />
                                                  <div className="th-inline-note">
                                                    {displayCreditAmount > 0 ? formatCurrencyAmount(displayCreditAmount) : '$0'} · {getAttributionModeCreditLabel(attributionDraft.mode)} credit
                                                  </div>
                                                </td>
                                                <td>
                                                  <strong>{assignedHouseholdLabel}</strong>
                                                  <div className="th-inline-note">{assignedHouseholdId ?? 'No household assigned'}</div>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </section>
                                )}
                                <div className="th-household-expanded-actions">
                                  <button
                                    type="button"
                                    className="th-button th-button-secondary"
                                    onClick={() => {
                                      const firstGroup = ambiguousAttributionGroups.find((group) => group.householdId === view.householdId) ?? null;
                                      setSelectedAttributionGroupKey(firstGroup?.key ?? null);
                                      jumpToSection('th-review-table');
                                    }}
                                  >
                                    Review attribution ↓
                                  </button>
                                  <button
                                    type="button"
                                    className="th-button th-button-secondary"
                                    onClick={() => {
                                      setExpandedFinalHouseholdId(view.householdId);
                                      jumpToSection('th-review-table');
                                    }}
                                  >
                                    Open full table ↓
                                  </button>
                                  <button
                                    type="button"
                                    className="th-button th-button-secondary"
                                    onClick={handleExportPreview}
                                  >
                                    Download Excel
                                  </button>
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {supportsDuplicateWorkflow && previewReviewMatches.length > 0 && nonLedgerReviewPanel === 'duplicate' && (
                <div id="th-identity-review-queue" className="th-stack" style={{ marginBottom: 14 }}>
                  <div className="th-panel-head">
                    <span>{duplicateQueueLabel}</span>
                    <div className="th-review-match-actions">
                      {mergeablePreviewGroupCount > 0 && (
                        <button type="button" className="th-button th-button-primary" style={{ minHeight: 34 }} onClick={() => void handleMergeAllPeopleReviews(filteredPreviewReviewMatches)} disabled={isLoading}>Consolidate shown ({mergeablePreviewGroupCount})</button>
                      )}
                      <span>{groupedFilteredPreviewReviewMatches.length} shown</span>
                    </div>
                  </div>
                  <div className="th-review-filter-row">
                    <button type="button" className={`th-chip${peopleReviewFilter === 'pending' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('pending')}>Pending {previewReviewCounts.pending}</button>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'merged' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('merged')}>Merged {previewReviewCounts.merged}</button>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'separated' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('separated')}>Separate {previewReviewCounts.separated}</button>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'all' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('all')}>All {previewReviewCounts.all}</button>
                  </div>
                  {groupedFilteredPreviewReviewMatches.length === 0 ? (
                    <div className="th-mini-block">
                      <strong>No items in this view</strong>
                      <p>{peopleReviewFilter === 'all' ? 'No duplicate candidates are visible right now.' : `No ${peopleReviewFilter} items are visible right now.`}</p>
                    </div>
                  ) : (
                  groupedFilteredPreviewReviewMatches.map(({ key, representative: match, allMatches }) => {
                    const decision = deriveReviewDecision(match, mergeDecisions);
                    const duplicateCandidateLabel = classifyDuplicateCandidate(match);
                    const incomingRecord = previewRecords.find((record) => record.sourceRowRef === match.inputRef) ?? null;
                    const matchedRecordRef = match.reviewPayload?.matchedInputRef ?? null;
                    const siblingMatch = !matchedRecordRef && match.matchedPersonId
                      ? (personResult?.matches ?? []).find((candidate) => candidate.inputRef !== match.inputRef && candidate.matchedPersonId === match.matchedPersonId)
                      : null;
                    const matchedPreviewRecord = matchedRecordRef
                      ? previewRecords.find((record) => record.sourceRowRef === matchedRecordRef) ?? null
                      : siblingMatch
                        ? previewRecords.find((record) => record.sourceRowRef === siblingMatch.inputRef) ?? null
                        : null;
                    const candidateComparePerson = match.duplicateClass === 'possible_match' && match.reviewPayload?.candidate
                      ? {
                          id: match.reviewPayload.candidate.id,
                          firstName: match.reviewPayload.candidate.firstName,
                          lastName: match.reviewPayload.candidate.lastName,
                          email: match.reviewPayload.candidate.email,
                          phone: match.reviewPayload.candidate.phone,
                          addressLine1: match.reviewPayload.candidate.addressLine1,
                          city: match.reviewPayload.candidate.city,
                          state: match.reviewPayload.candidate.state,
                          zip: match.reviewPayload.candidate.zip,
                        } as CanonicalPerson
                      : null;
                    const matchedPerson = !matchedPreviewRecord
                      ? candidateComparePerson ?? (match.matchedPersonId ? canonicalPeople.find((person: CanonicalPerson) => person.id === match.matchedPersonId) ?? null : null)
                      : null;
                    const matchedRecord = matchedPreviewRecord ?? buildMatchedPersonCompareRecord(matchedPerson);
                    const matchedLabel = matchedPreviewRecord
                      ? previewRecordLabel(matchedPreviewRecord)
                      : formatPersonLabel(matchedPerson);
                    const isExpanded = expandedPeopleReviewRef === match.inputRef;
                    if (!matchedRecord) return null;
                    const groupRowRefs = allMatches.map((m) => formatSourceBadgeRowLabel(m.inputRef, previewSourceBadgeByOrigin, parsedFile?.fileName)).join(', ');
                    const matchedRowRef = matchedPreviewRecord
                      ? formatSourceBadgeRowLabel(matchedRecord.sourceRowRef, previewSourceBadgeByOrigin, parsedFile?.fileName)
                      : 'existing record';
                    return (
                      <div key={key} className="th-guardrail is-warning th-review-match-card" style={{ gap: 14 }}>
                        <div className="th-review-match-head">
                          <div style={{ flex: 1 }}>
                            <strong>{groupRowRefs} ↔ {matchedRowRef}</strong>
                            {allMatches.length > 1 && <p className="th-helper">{allMatches.length} transaction rows for same donor</p>}
                            <p className="th-helper" style={{ marginTop: 4, textTransform: 'capitalize' }}>{duplicateCandidateLabel}</p>
                            <p>{incomingRecord ? previewRecordLabel(incomingRecord) : match.inputRef} → {matchedLabel}</p>
                            {describeAiSuggestion(match) && <p className="th-helper">{describeAiSuggestion(match)}</p>}
                          </div>
                          <div className="th-review-match-actions">
                            <button
                              type="button"
                              className={`th-button ${isExpanded ? 'th-button-primary' : 'th-button-secondary'}`}
                              style={{ minHeight: 34 }}
                              onClick={() => setExpandedPeopleReviewRef(isExpanded ? null : match.inputRef)}
                            >
                              {isExpanded ? 'Hide compare' : 'Show compare'}
                            </button>
                            {decision ? (
                              <span className={`th-status ${decision === "confirmed" ? "is-ready" : "is-rejected"}`}>
                                {decision === "confirmed" ? "Merged" : "Separated"}
                              </span>
                            ) : (
                              <div className="th-review-match-actions">
                                <button type="button" className="th-button th-button-primary" style={{ minHeight: 34 }} onClick={() => void handleGroupMergeDecision(allMatches, "confirmed")}>{confirmMergeLabel}</button>
                                <button type="button" className="th-button th-button-secondary" style={{ minHeight: 34 }} onClick={() => void handleGroupMergeDecision(allMatches, "separated")}>{keepSeparateLabel}</button>
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`th-review-summary ${isExpanded ? 'is-open' : ''}`}
                          onClick={() => setExpandedPeopleReviewRef(isExpanded ? null : match.inputRef)}
                        >
                          <span><strong>Incoming</strong> {incomingRecord ? (previewRecordLabel(incomingRecord)) : match.inputRef}</span>
                          <span><strong>{matchedPreviewRecord ? 'Matched row' : 'Matched record'}</strong> {matchedLabel}</span>
                        </button>
                        {isExpanded && matchedRecord && (
                          <div className="th-stack" style={{ width: '100%' }}>
                            <div className="th-mini-block">
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                <strong>Row compare</strong>
                                <div className="th-review-match-actions">
                                  {incomingRecord && editingMergedRecordRef === incomingRecord.sourceRowRef ? (
                                    <>
                                      <button type="button" className="th-button th-button-primary" style={{ minHeight: 34 }} onClick={() => void handleSaveMergedRecordEdit()}>Save incoming row</button>
                                      <button type="button" className="th-button th-button-secondary" style={{ minHeight: 34 }} onClick={() => { setEditingMergedRecordRef(null); setEditingMergedDraft({}); }}>Cancel</button>
                                    </>
                                  ) : incomingRecord ? (
                                    <button type="button" className="th-button th-button-secondary" style={{ minHeight: 34 }} onClick={() => startMergedRecordEdit(incomingRecord)}>Edit incoming row</button>
                                  ) : null}
                                </div>
                              </div>
                              <div className="th-table-wrap" style={{ marginTop: 10 }}>
                                <table className="th-table th-review-compare-table">
                                  <thead>
                                    <tr>
                                      <th>Row</th>
                                      {previewCompareFields.map((field) => (
                                        <th key={field.key}>{field.label}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr>
                                      <td><strong>Incoming</strong></td>
                                      {previewCompareFields.map((field) => {
                                        const isEditingIncoming = incomingRecord && editingMergedRecordRef === incomingRecord.sourceRowRef;
                                        const draftValue = field.kind === 'source'
                                          ? incomingRecord?.sourceRowRef ?? '—'
                                          : String(editingMergedDraft[field.key] ?? (field.header ? getPreviewRecordRawValues(incomingRecord)?.[field.header] : '') ?? '');
                                        return (
                                          <td key={`incoming-${field.key}`}>
                                            {isEditingIncoming && field.editable ? (
                                              <input
                                                className="th-review-compare-input"
                                                value={draftValue}
                                                onChange={(event) => setEditingMergedDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                                              />
                                            ) : (
                                              getPreviewCompareValue(incomingRecord, field)
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                    <tr>
                                      <td><strong>Matched</strong></td>
                                      {previewCompareFields.map((field) => (
                                        <td key={`matched-${field.key}`}>{getPreviewCompareValue(matchedRecord, field)}</td>
                                      ))}
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                  )}
                </div>
              )}
              {reviewTableActive && (
                <div className="th-table-wrap">
                {(fileClass === 'constituent' || fileClass === 'donor') && editingMergedRecordRef && (
                  <div className="th-mini-block" style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <strong>Edit matched row</strong>
                      <span className="th-helper">Source row {editingMergedRecordRef}</span>
                    </div>
                    <div className="th-review-compare-grid" style={{ marginTop: 10 }}>
                      <label className="th-stack"><span className="th-helper">First name</span><input className="th-input" value={editingMergedDraft.firstName ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, firstName: event.target.value }))} /></label>
                      <label className="th-stack"><span className="th-helper">Last name</span><input className="th-input" value={editingMergedDraft.lastName ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, lastName: event.target.value }))} /></label>
                      <label className="th-stack"><span className="th-helper">Organization</span><input className="th-input" value={editingMergedDraft.organizationName ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, organizationName: event.target.value }))} /></label>
                      <label className="th-stack"><span className="th-helper">Household</span><input className="th-input" value={editingMergedDraft.householdName ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, householdName: event.target.value }))} /></label>
                      <label className="th-stack"><span className="th-helper">Email</span><input className="th-input" value={editingMergedDraft.email ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, email: event.target.value }))} /></label>
                      <label className="th-stack"><span className="th-helper">Phone</span><input className="th-input" value={editingMergedDraft.phone ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
                      <label className="th-stack"><span className="th-helper">Address</span><input className="th-input" value={editingMergedDraft.address ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, address: event.target.value }))} /></label>
                      <label className="th-stack"><span className="th-helper">City</span><input className="th-input" value={editingMergedDraft.city ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, city: event.target.value }))} /></label>
                      <label className="th-stack"><span className="th-helper">State</span><input className="th-input" value={editingMergedDraft.state ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, state: event.target.value }))} /></label>
                      <label className="th-stack"><span className="th-helper">Postal code</span><input className="th-input" value={editingMergedDraft.postalCode ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, postalCode: event.target.value }))} /></label>
                      <label className="th-stack"><span className="th-helper">Country</span><input className="th-input" value={editingMergedDraft.country ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, country: event.target.value }))} /></label>
                      <label className="th-stack"><span className="th-helper">Owner</span><input className="th-input" value={editingMergedDraft.assignedStaff ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, assignedStaff: event.target.value }))} /></label>
                      {fileClass === 'donor' && <label className="th-stack"><span className="th-helper">Amount</span><input className="th-input" value={editingMergedDraft.amount ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, amount: event.target.value }))} /></label>}
                      {fileClass === 'donor' && <label className="th-stack"><span className="th-helper">Fund</span><input className="th-input" value={editingMergedDraft.fund ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, fund: event.target.value }))} /></label>}
                      {fileClass === 'donor' && <label className="th-stack"><span className="th-helper">Appeal</span><input className="th-input" value={editingMergedDraft.appeal ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, appeal: event.target.value }))} /></label>}
                      {fileClass === 'donor' && <label className="th-stack"><span className="th-helper">Memo</span><input className="th-input" value={editingMergedDraft.memo ?? ''} onChange={(event) => setEditingMergedDraft((current) => ({ ...current, memo: event.target.value }))} /></label>}
                    </div>
                    <div className="th-review-match-actions" style={{ marginTop: 12 }}>
                      <button type="button" className="th-button th-button-primary" onClick={() => void handleSaveMergedRecordEdit()}>Save matched row</button>
                      <button type="button" className="th-button th-button-secondary" onClick={() => { setEditingMergedRecordRef(null); setEditingMergedDraft({}); }}>Cancel</button>
                    </div>
                  </div>
                )}
                {(matchingReviewActive || householdResult) && (
                  <div className="th-review-tab-row" style={{ marginBottom: 14 }}>
                    {matchingReviewActive ? (
                      <>
                        <button
                          type="button"
                          className={`th-chip th-review-tab${matchingTableView === 'raw' ? ' is-active' : ''}`}
                          onClick={() => setMatchingTableView('raw')}
                        >
                          Raw rows {filteredDisplayedPreviewRecords.length}
                        </button>
                        <button
                          type="button"
                          className={`th-chip th-review-tab${matchingTableView === 'consolidated' ? ' is-active' : ''}`}
                          onClick={() => setMatchingTableView('consolidated')}
                        >
                          Consolidated {consolidatedDisplayedPreviewRecords.length}
                        </button>
                      </>
                    ) : (
                      <span className="th-chip th-review-tab is-active">
                        Raw rows {filteredDisplayedPreviewRecords.length}
                      </span>
                    )}
                    {selectedAttributionGroupKey && (
                      <button type="button" className="th-chip is-active" onClick={() => setSelectedAttributionGroupKey(null)}>
                        Clear transaction focus
                      </button>
                    )}
                  </div>
                )}
                <div id="th-review-table" className="th-table-wrap">
                <table className="th-table th-resizable-table" style={{ width: nonLedgerTableWidth, minWidth: nonLedgerTableWidth }}>
                  <colgroup>
                    {nonLedgerTableColumnKeys.map((columnKey) => (
                      <col key={columnKey} style={{ width: getNonLedgerColumnWidth(columnKey), minWidth: getNonLedgerColumnWidth(columnKey) }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={`th-resizable-header${isPreviewColumnFiltered('__source__') ? ' is-filtered' : ''}`}>
                        <div className="th-resizable-header-inner">
                          <span>Source</span>
                          {renderPreviewColumnFilterControl('__source__', 'Source', 'Filter source')}
                          <button type="button" className="th-column-resizer" aria-label="Resize Source column" onPointerDown={(event) => startNonLedgerColumnResize('__source__', event)} />
                        </div>
                      </th>
                      {visibleNonLedgerTableHeaders.map((header) => (
                        <th
                          key={header}
                          draggable
                          className={`th-resizable-header${selectedPreviewHeaders.includes(header) ? ' is-selected' : ''}${previewHeaderDropTarget === header ? ' is-drop-target' : ''}${isPreviewColumnFiltered(header) ? ' is-filtered' : ''}`}
                          onClick={(event) => selectPreviewHeader(header, { additive: event.metaKey || event.ctrlKey })}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            selectPreviewHeader(header);
                            setPreviewTableContextMenu({ kind: 'column', header, x: event.clientX, y: event.clientY });
                          }}
                          onDoubleClick={() => startPreviewHeaderRename(header)}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', header);
                            setDraggingPreviewHeader(header);
                            setPreviewHeaderDropTarget(null);
                          }}
                          onDragOver={(event) => {
                            if (!draggingPreviewHeader || draggingPreviewHeader === header) return;
                            event.preventDefault();
                            setPreviewHeaderDropTarget(header);
                          }}
                          onDrop={(event) => {
                            if (!draggingPreviewHeader || draggingPreviewHeader === header) return;
                            event.preventDefault();
                            void handleMovePreviewColumn(draggingPreviewHeader, header);
                          }}
                          onDragEnd={() => {
                            setDraggingPreviewHeader(null);
                            setPreviewHeaderDropTarget(null);
                          }}
                        >
                          <div className="th-resizable-header-inner">
                            {editingPreviewHeader === header ? (
                              <input
                                autoFocus
                                className="th-table-cell-input th-table-header-input"
                                value={editingPreviewHeaderDraft}
                                onChange={(event) => setEditingPreviewHeaderDraft(event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void commitPreviewHeaderRename(header);
                                  }
                                  if (event.key === 'Escape') {
                                    event.preventDefault();
                                    closePreviewHeaderRename();
                                  }
                                }}
                                onBlur={() => { void commitPreviewHeaderRename(header); }}
                              />
                            ) : (
                              <span>{formatPreviewHeaderLabel(header)}</span>
                            )}
                            {renderPreviewColumnFilterControl(header, formatPreviewHeaderLabel(header), `Filter ${formatPreviewHeaderLabel(header)}`)}
                            <button type="button" className="th-column-resizer" aria-label={`Resize ${formatPreviewHeaderLabel(header)} column`} onPointerDown={(event) => startNonLedgerColumnResize(header, event)} />
                          </div>
                        </th>
                      ))}
                      {householdResult && (
                        <>
                          <th className={`th-resizable-header${isPreviewColumnFiltered('__role__') ? ' is-filtered' : ''}`}>
                            <div className="th-resizable-header-inner">
                              <span>Role</span>
                              {renderPreviewColumnFilterControl('__role__', 'Role', 'Filter role')}
                              <button type="button" className="th-column-resizer" aria-label="Resize Role column" onPointerDown={(event) => startNonLedgerColumnResize('__role__', event)} />
                            </div>
                          </th>
                          <th className={`th-resizable-header${isPreviewColumnFiltered('__attribution_type__') ? ' is-filtered' : ''}`}>
                            <div className="th-resizable-header-inner">
                              <span>Attribution type</span>
                              {renderPreviewColumnFilterControl('__attribution_type__', 'Attribution type', 'Filter attribution')}
                              <button type="button" className="th-column-resizer" aria-label="Resize Attribution type column" onPointerDown={(event) => startNonLedgerColumnResize('__attribution_type__', event)} />
                            </div>
                          </th>
                          <th className={`th-resizable-header${isPreviewColumnFiltered('__credit_amount__') ? ' is-filtered' : ''}`}>
                            <div className="th-resizable-header-inner">
                              <span>Credit amount</span>
                              {renderPreviewColumnFilterControl('__credit_amount__', 'Credit amount', 'Filter credit')}
                              <button type="button" className="th-column-resizer" aria-label="Resize Credit amount column" onPointerDown={(event) => startNonLedgerColumnResize('__credit_amount__', event)} />
                            </div>
                          </th>
                          <th className={`th-resizable-header${isPreviewColumnFiltered('__household__') ? ' is-filtered' : ''}`}>
                            <div className="th-resizable-header-inner">
                              <span>Household</span>
                              {renderPreviewColumnFilterControl('__household__', 'Household', 'Filter household')}
                              <button type="button" className="th-column-resizer" aria-label="Resize Household column" onPointerDown={(event) => startNonLedgerColumnResize('__household__', event)} />
                            </div>
                          </th>
                          <th className={`th-resizable-header${isPreviewColumnFiltered('__notes__') ? ' is-filtered' : ''}`}>
                            <div className="th-resizable-header-inner">
                              <span>Notes</span>
                              {renderPreviewColumnFilterControl('__notes__', 'Notes', 'Filter notes')}
                              <button type="button" className="th-column-resizer" aria-label="Resize Notes column" onPointerDown={(event) => startNonLedgerColumnResize('__notes__', event)} />
                            </div>
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAttributionGroupKey && (
                      <tr>
                        <td colSpan={nonLedgerTableColumnKeys.length}>
                          <div className="th-mini-block">
                            <strong>Focused ambiguity group</strong>
                            <p>{ambiguousAttributionGroups.find((group) => group.key === selectedAttributionGroupKey)?.label ?? 'Selected attribution review group'}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                    {visibleAttributionTableRecords.map((record) => {
                      const recordOrigins = getRecordSourceOrigins(record);
                      const isSourceFocused = previewSourceFocus === 'all' || recordOrigins.includes(previewSourceFocus);
                      const { matchedPerson, draft: attributionDraft, assignedHouseholdId } = getAttributionDraftForRecord(record);
                      const assignedHouseholdLabel = assignedHouseholdId ? householdLabelById.get(assignedHouseholdId) ?? assignedHouseholdId : '—';
                      const recordRole = getRecordRole(record, attributionDraft, matchedPerson);
                      const rawAmount = parseCurrencyAmount(record.amount);
                      const displayCreditAmount = getDisplayCreditAmount(attributionDraft, rawAmount, recordRole);
                      const needsAttributionReview = ambiguousAttributionRefs.has(record.sourceRowRef) && attributionDraft.mode === 'person';
                      const isEditingRow = editingMergedRecordRef === record.sourceRowRef;
                      const dropBefore = previewRowDropTarget?.rowRef === record.sourceRowRef && previewRowDropTarget.position === 'before';
                      const dropAfter = previewRowDropTarget?.rowRef === record.sourceRowRef && previewRowDropTarget.position === 'after';
                      return (
                        <tr
                          key={record.id}
                          className={[
                            selectedPreviewRowRefs.includes(record.sourceRowRef) ? 'is-selected' : '',
                            draggingPreviewRowRef === record.sourceRowRef ? 'is-dragging' : '',
                            dropBefore ? 'is-drop-before' : '',
                            dropAfter ? 'is-drop-after' : '',
                          ].filter(Boolean).join(' ') || undefined}
                          style={previewSourceFocus === 'all' ? undefined : isSourceFocused ? { background: `${previewSourceColorByOrigin.get(previewSourceFocus)}12` } : { opacity: 0.48 }}
                          onClick={(event) => selectPreviewRow(record.sourceRowRef, { additive: event.metaKey || event.ctrlKey })}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            selectPreviewRow(record.sourceRowRef);
                            setPreviewTableContextMenu({ kind: 'row', rowRef: record.sourceRowRef, x: event.clientX, y: event.clientY });
                          }}
                          onDragOver={(event) => {
                            if (!draggingPreviewRowRef || draggingPreviewRowRef === record.sourceRowRef) return;
                            event.preventDefault();
                            setPreviewRowDropTarget({ rowRef: record.sourceRowRef, position: getPreviewRowDropPosition(event) });
                          }}
                          onDrop={(event) => {
                            if (!draggingPreviewRowRef || draggingPreviewRowRef === record.sourceRowRef) return;
                            event.preventDefault();
                            const position = getPreviewRowDropPosition(event);
                            void handleMovePreviewRow(draggingPreviewRowRef, record.sourceRowRef, position);
                          }}
                        >
                          <td>
                            <div className="th-row-source-cell">
                              <button
                                type="button"
                                className="th-row-drag-handle"
                                draggable
                                aria-label={`Drag row ${getCompactSourceRef(record.sourceRowRef).primary}`}
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = 'move';
                                  event.dataTransfer.setData('text/plain', record.sourceRowRef);
                                  setDraggingPreviewRowRef(record.sourceRowRef);
                                  setPreviewRowDropTarget(null);
                                }}
                                onDragEnd={() => {
                                  setDraggingPreviewRowRef(null);
                                  setPreviewRowDropTarget(null);
                                }}
                              >
                                <GripVertical size={14} />
                              </button>
                              <strong>{supportsDuplicateWorkflow ? describeRepresentativeSource(record) : getCompactSourceRef(record.sourceRowRef).primary}</strong>
                            </div>
                            <div className="th-cell-chip-row" style={{ marginTop: 6 }}>
                              {recordOrigins.map((origin) => (
                                <span
                                  key={`${record.id}-${origin}`}
                                  className="th-cell-chip"
                                  title={origin}
                                  style={{
                                    background: `${previewSourceColorByOrigin.get(origin)}1A`,
                                    color: previewSourceColorByOrigin.get(origin),
                                    borderColor: `${previewSourceColorByOrigin.get(origin)}55`,
                                  }}
                                >
                                  {previewSourceBadgeByOrigin.get(origin)}
                                </span>
                              ))}
                            </div>
                          </td>
                          {visibleNonLedgerTableHeaders.map((header) => (
                            <td
                              key={`${record.id}-${header}`}
                              className={[
                                selectedPreviewHeaders.includes(header) ? 'is-selected' : '',
                                activePreviewCell?.rowRef === record.sourceRowRef && activePreviewCell.header === header ? 'is-active-cell' : '',
                              ].filter(Boolean).join(' ') || undefined}
                              onClick={(event) => {
                                event.stopPropagation();
                                selectPreviewCell(record.sourceRowRef, header, { additive: event.metaKey || event.ctrlKey });
                              }}
                              onDoubleClick={() => {
                                setEditingPreviewCell({ rowRef: record.sourceRowRef, header });
                                setEditingPreviewCellDraft(getPreviewRecordRawCell(record, header).replace(/^—$/, ''));
                              }}
                            >
                              {isEditingRow ? (
                                <input
                                  className="th-table-cell-input"
                                  value={String((getEditableDraftKeyForHeader(header) ? editingMergedDraft[getEditableDraftKeyForHeader(header) as string] : editingMergedDraft[`raw:${header}`]) ?? getPreviewRecordRawCell(record, header)).replace(/^—$/, '')}
                                  onChange={(event) => updateInlinePreviewCell(header, event.target.value)}
                                />
                              ) : editingPreviewCell?.rowRef === record.sourceRowRef && editingPreviewCell.header === header ? (
                                <input
                                  autoFocus
                                  className="th-table-cell-input"
                                  value={editingPreviewCellDraft}
                                  onChange={(event) => setEditingPreviewCellDraft(event.target.value)}
                                  onBlur={() => {
                                    void applyPreviewCellChanges([{ rowRef: record.sourceRowRef, header, value: editingPreviewCellDraft }], 'Updated cell value.');
                                    setEditingPreviewCell(null);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      void applyPreviewCellChanges([{ rowRef: record.sourceRowRef, header, value: editingPreviewCellDraft }], 'Updated cell value.');
                                      setEditingPreviewCell(null);
                                    }
                                    if (event.key === 'Escape') {
                                      event.preventDefault();
                                      setEditingPreviewCell(null);
                                    }
                                  }}
                                />
                              ) : (
                                <span className="th-cell-ellipsis" title={getPreviewRecordRawCell(record, header)}>
                                  {getPreviewRecordRawCell(record, header)}
                                </span>
                              )}
                            </td>
                          ))}
                          {householdResult && (
                            <>
                              <td>
                                <select
                                  className="th-table-cell-input"
                                  value={recordRole}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => updateRecordRole(record, attributionDraft, matchedPerson, assignedHouseholdId, event.target.value as 'primary' | 'secondary' | 'organization' | 'unassigned')}
                                  aria-label={`Role for ${getBestPersonDisplayLabel(matchedPerson, record)}`}
                                >
                                  <option value="primary">Primary</option>
                                  <option value="secondary">Secondary</option>
                                  <option value="organization">Organization</option>
                                  <option value="unassigned">Unassigned</option>
                                </select>
                                <div className="th-inline-note">{getBestPersonDisplayLabel(matchedPerson, record)}</div>
                              </td>
                              <td>
                                <select
                                  className="th-table-cell-input"
                                  value={attributionDraft.mode}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => updateFinalAttributionDraft(
                                    record.sourceRowRef,
                                    buildDraftForModeSelection(
                                      attributionDraft,
                                      rawAmount,
                                      event.target.value as PreviewAttributionDraft['mode'],
                                    ),
                                  )}
                                  aria-label={`Attribution type for ${getBestPersonDisplayLabel(matchedPerson, record)}`}
                                >
                                  <option value="person">Hard credit</option>
                                  <option value="soft_credit">Soft credit</option>
                                  <option value="joint_split">Joint gift</option>
                                  <option value="org_match">Org match</option>
                                </select>
                              </td>
                              <td>
                                {isEditingRow ? (
                                  <input
                                    className="th-table-cell-input"
                                    value={String(attributionDraft.creditAmount ?? rawAmount ?? '')}
                                    onChange={(event) => updateRecordCreditAmount(record, event.target.value)}
                                  />
                                ) : (
                                  <>
                                    <strong>{displayCreditAmount > 0 ? formatCurrencyAmount(displayCreditAmount) : '$0'}</strong>
                                    <div className="th-inline-note">
                                      {attributionDraft.mode === 'joint_split'
                                        ? `${getRecordCreditPercent(attributionDraft, recordRole)}% split`
                                        : `${getAttributionModeCreditLabel(attributionDraft.mode)} credit`}
                                    </div>
                                  </>
                                )}
                              </td>
                              <td>
                                {isEditingRow ? (
                                  <select
                                    className="th-table-cell-input"
                                    value={assignedHouseholdId ?? ''}
                                    onChange={(event) => updateFinalAttributionDraft(record.sourceRowRef, {
                                      householdId: event.target.value || null,
                                      householdRemoved: event.target.value === '',
                                    })}
                                  >
                                    <option value="">No household</option>
                                    {householdLayerViews.map((view) => (
                                      <option key={`${record.sourceRowRef}-${view.householdId}`} value={view.householdId}>{view.draft.label}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="th-cell-ellipsis" title={assignedHouseholdLabel}>
                                    {assignedHouseholdLabel}
                                  </span>
                                )}
                              </td>
                              <td>
                                {isEditingRow ? (
                                  <textarea
                                    className="th-table-cell-input th-table-cell-textarea"
                                    value={attributionDraft.notes || ''}
                                    onChange={(event) => updateFinalAttributionDraft(record.sourceRowRef, { notes: event.target.value })}
                                  />
                                ) : (
                                  <span className="th-cell-ellipsis" title={attributionDraft.notes || String(record.memo ?? '—')}>
                                    {attributionDraft.notes || String(record.memo ?? '—')}
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {previewTableContextMenu && (
                  <div
                    className="th-context-menu"
                    style={{ left: previewTableContextMenu.x, top: previewTableContextMenu.y }}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {previewTableContextMenu.kind === 'column' ? (
                      <>
                        <button type="button" className="th-context-menu-item" onClick={() => void handleInsertPreviewColumn(previewTableContextMenu.header, 'left')}>Insert column left</button>
                        <button type="button" className="th-context-menu-item" onClick={() => void handleInsertPreviewColumn(previewTableContextMenu.header, 'right')}>Insert column right</button>
                        <button type="button" className="th-context-menu-item" onClick={() => startPreviewHeaderRename(previewTableContextMenu.header)}>Rename column</button>
                        <button type="button" className="th-context-menu-item is-danger" onClick={() => void handleDeletePreviewColumns(selectedPreviewHeaders.length > 0 ? selectedPreviewHeaders : [previewTableContextMenu.header])}>Delete column{selectedPreviewHeaders.length > 1 ? 's' : ''}</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="th-context-menu-item" onClick={() => void handleInsertPreviewRow(previewTableContextMenu.rowRef, 'above')}>Insert row above</button>
                        <button type="button" className="th-context-menu-item" onClick={() => void handleInsertPreviewRow(previewTableContextMenu.rowRef, 'below')}>Insert row below</button>
                        <button type="button" className="th-context-menu-item is-danger" onClick={() => void handleDeletePreviewRows(selectedPreviewRowRefs.length > 0 ? selectedPreviewRowRefs : [previewTableContextMenu.rowRef])}>Delete row{selectedPreviewRowRefs.length > 1 ? 's' : ''}</button>
                      </>
                    )}
                  </div>
                )}
                </div>
                </div>
              )}
            </div>
          </section>
        )}

        {isLedgerFile && rows.length > 0 && (
          <section className="th-section th-grid th-main-grid" id="th-audit">
            <article className="th-panel" id="th-audit-mode">
              <div className="th-panel-head">
                <span><span className="th-layer-badge">08</span> Audit mode</span>
                <button type="button" className="th-button th-button-primary" onClick={handleRunAuditRules} style={{ minHeight: 34 }}>
                  <ShieldAlert size={14} /> Run audit
                </button>
              </div>
              <TransformHubAuditModePanel rows={rows} taxonomyResult={taxonomyResult} auditResult={auditResult} activeAction={activeOperatorIntent} onAction={handleOperatorAction} structure={sessionStructure} />
              {!auditResult ? (
                <p className="th-helper">
                  Check for donor tag gaps, wrong GL accounts, lapsed giving, and more.
                  {activeAuditCatalog.length > 0 && ` ${activeAuditCatalog.length} rules ready.`}
                </p>
              ) : (
                <>
                  <div className="th-grid th-grid-3" style={{ marginBottom: 12 }}>
                    <div className="th-stat-chip" style={{ background: 'var(--th-red-bg)', color: 'var(--th-red)' }}><strong>{auditResult.errorCount}</strong><span>Errors</span></div>
                    <div className="th-stat-chip" style={{ background: 'rgba(255,183,60,0.18)', color: '#c07800' }}><strong>{auditResult.warningCount}</strong><span>Warnings</span></div>
                    <div className="th-stat-chip" style={{ background: 'var(--th-green-bg)', color: 'var(--th-green)' }}><strong>{auditResult.infoCount}</strong><span>Info</span></div>
                  </div>
                  <div className="th-audit-meta-row">
                    <span className="th-audit-meta-pill">Engine {activeAuditEngineVersion ?? 'local'}</span>
                    <span className="th-audit-meta-pill">Trend {auditResult.deltaTrend ?? auditResult.delta?.trend ?? 'baseline'}</span>
                    {auditResult.latestPersistedRunId && (
                      <span className="th-audit-meta-pill">Run {auditResult.latestPersistedRunId.slice(0, 8)}</span>
                    )}
                  </div>
                  <div className="th-stack">
                    {auditResult.findings.map((finding) => {
                      const catalogEntry = auditCatalogByCode.get(finding.ruleCode);
                      return (
                        <div key={finding.ruleCode} className={`th-guardrail ${finding.severity === 'error' ? 'is-triggered' : finding.severity === 'warning' ? 'is-warning' : 'is-info'}`}>
                          {finding.severity === 'error' ? <ShieldAlert size={15} /> : finding.severity === 'warning' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                          <div>
                            <strong>{finding.label} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {finding.count}</span></strong>
                            <div className="th-audit-code-row">
                              <span className="th-audit-code">{finding.ruleCode}</span>
                              <span className="th-audit-version">v{catalogEntry?.version ?? finding.ruleVersion ?? 1}</span>
                            </div>
                            <p>{finding.message}</p>
                            <p className="th-inline-note">{catalogEntry?.description ?? finding.detail}</p>
                            {finding.rootCause && (
                              <div style={{ marginTop: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => setExpandedRootCauses((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(finding.ruleCode)) next.delete(finding.ruleCode);
                                    else next.add(finding.ruleCode);
                                    return next;
                                  })}
                                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--th-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
                                >
                                  {expandedRootCauses.has(finding.ruleCode) ? '▾' : '▸'} Why did this happen?
                                </button>
                                {expandedRootCauses.has(finding.ruleCode) && (
                                  <div style={{ marginTop: 6, padding: '8px 10px', background: 'rgba(0,0,0,0.03)', borderRadius: 6, fontSize: 12, color: 'var(--th-ink)' }}>
                                    <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Root cause</p>
                                    <p style={{ margin: '0 0 6px' }}>{finding.rootCause.explanation}</p>
                                    {finding.rootCause.suggestedFix && (
                                      <>
                                        <p style={{ margin: '0 0 2px', fontWeight: 600 }}>How to fix</p>
                                        <p style={{ margin: 0 }}>{finding.rootCause.suggestedFix}</p>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </article>

            <article className="th-panel">
              <div className="th-panel-head">
                <span><span className="th-layer-badge">09</span> Inline issues</span>
              </div>
              <div className="th-action-row" style={{ marginBottom: 14 }}>
                <button type="button" className="th-button th-button-primary" onClick={handleRunPreflight}>
                  <RefreshCcw size={14} /> Run pre-flight
                </button>
                <button type="button" className="th-button th-button-secondary" onClick={handleSimulatePost} disabled={!preflight?.valid}>
                  <ArrowRight size={14} /> Simulate post
                </button>
                <button type="button" className="th-button th-button-secondary" onClick={handleExportCsvFallback}>
                  <FileSpreadsheet size={14} /> Export CSV
                </button>
              </div>
              <div className="th-stack">
                {!preflight ? (
                  <p className="th-helper">Validate journal balance, duplicate donors, missing campaign mappings, and wrong GL accounts directly from the ledger.</p>
                ) : preflight.issues.length === 0 ? (
                  <div className="th-guardrail is-clear"><CheckCircle2 size={15} /><div><strong>Pre-flight passed</strong><p>Ready to post.</p></div></div>
                ) : (
                  preflight.issues.map((issue, index) => (
                    <div key={`${issue.message}-${index}`} className={`th-guardrail ${issue.severity === 'error' ? 'is-triggered' : 'is-clear'}`}>
                      {issue.severity === 'error' ? <ShieldAlert size={15} /> : <CheckCircle2 size={15} />}
                      <div>
                        <strong>{issue.journalId ?? issue.rowId ?? 'Issue'}</strong>
                        <p>{issue.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {(receipts.length > 0 || fallbackFileName) && (
                <div style={{ marginTop: 14 }}>
                  <div className="th-panel-head" style={{ marginBottom: 10 }}><span>Receipts</span><span>{receipts.length}</span></div>
                  <div className="th-stack">
                    {fallbackFileName && (
                      <div className="th-mini-block"><strong>CSV fallback</strong><p>{fallbackFileName}</p></div>
                    )}
                    {receipts.map((receipt) => (
                      <div key={receipt.qboTxnId} className="th-receipt">
                        <div className="th-card-head"><Building2 size={15} /><strong>{receipt.qboTxnId}</strong></div>
                        <p>Journal: {receipt.journalId}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          </section>
        )}

        {/* ── Outputs ─────────────────────────────────────────────────────── */}
        {isLedgerFile && rows.length > 0 && (
          <section className="th-section" id="th-export">
            <div className="th-panel">
              <div className="th-panel-head">
                <span><span className="th-layer-badge">10</span> Outputs</span>
              </div>
              <div className="th-grid th-grid-3">
                <article className="th-output-card">
                  <div className="th-card-head"><FileSpreadsheet size={16} /><strong>Finance CSV</strong></div>
                  <p>Approved rows formatted for QBO / Xero import.</p>
                  <button type="button" className="th-button th-button-primary" onClick={handleExportCsvFallback}>
                    <FileSpreadsheet size={14} /> Export
                  </button>
                </article>
                <article className="th-output-card">
                  <div className="th-card-head"><Users size={16} /><strong>Donor report</strong></div>
                  <p>Resolved persons and households with giving totals.</p>
                  <button type="button" className="th-button th-button-primary" onClick={handleExportDonorReport}>
                    <Users size={14} /> Export
                  </button>
                </article>
                <article className="th-output-card">
                  <div className="th-card-head"><ShieldAlert size={16} /><strong>Audit dashboard</strong></div>
                  <p>Rule findings with severity and recommended actions.</p>
                  <button type="button" className="th-button th-button-primary" onClick={handleExportAuditDashboard}>
                    <ShieldAlert size={14} /> Export
                  </button>
                </article>
                <article className="th-output-card">
                  <div className="th-card-head"><FolderTree size={16} /><strong>Campaign performance</strong></div>
                  <p>Fund and appeal activity by campaign with retention buckets.</p>
                  <button type="button" className="th-button th-button-primary" onClick={handleExportCampaignPerformanceReport}>
                    <FolderTree size={14} /> Export
                  </button>
                </article>
                <article className="th-output-card">
                  <div className="th-card-head"><Database size={16} /><strong>CRM sync</strong></div>
                  <p>Person and household mappings for CRM import pipelines.</p>
                  <button type="button" className="th-button th-button-primary" onClick={handleExportCrmSyncExport}>
                    <Database size={14} /> Export
                  </button>
                </article>
              </div>
            </div>
          </section>
        )}
      {pendingTaxonomyMergeCandidateId && (
        <div className="th-modal-backdrop" onClick={closeTaxonomyMergeDialog}>
          <div className="th-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="th-modal-head">
              <span>Choose canonical taxonomy label</span>
              <button type="button" className="th-button th-button-secondary" onClick={closeTaxonomyMergeDialog}>Cancel</button>
            </div>
            <p className="th-helper">Pick the label that should represent this merged taxonomy group across the current session.</p>
            <label className="th-stack" style={{ gap: 8 }}>
              <span className="th-helper">Canonical label</span>
              <input
                className="th-input th-modal-input"
                value={pendingTaxonomyMergeLabel}
                onChange={(event) => setPendingTaxonomyMergeLabel(event.target.value)}
                autoFocus
              />
            </label>
            <div className="th-review-match-actions" style={{ marginTop: 18 }}>
              <button type="button" className="th-button th-button-secondary" onClick={closeTaxonomyMergeDialog}>Cancel</button>
              <button type="button" className="th-button th-button-primary" onClick={() => void confirmTaxonomyMergeDialog()} disabled={!pendingTaxonomyMergeLabel.trim()}>
                Save taxonomy label
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* ── Applied Decisions slide-over ───────────────────────────────────── */}
      {showAppliedDecisions && (
        <>
          <div
            onClick={() => setShowAppliedDecisions(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,35,0.4)', zIndex: 200 }}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 520,
              maxWidth: '92vw',
              background: 'var(--th-bg)',
              borderLeft: '1px solid var(--th-line)',
              zIndex: 201,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-8px 0 32px rgba(15,23,35,0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--th-line)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Auto-rules
              </span>
              <button type="button" onClick={() => setShowAppliedDecisions(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--th-muted)', display: 'flex', alignItems: 'center' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <AppliedDecisionsPanel />
            </div>
          </div>
        </>
      )}

      {/* ── Identity Hub slide-over ────────────────────────────────────────── */}
      {showIdentityHub && (
        <>
          <div
            onClick={() => setShowIdentityHub(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,35,0.4)', zIndex: 200 }}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 560,
              maxWidth: '92vw',
              background: 'var(--th-bg)',
              borderLeft: '1px solid var(--th-line)',
              zIndex: 201,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-8px 0 32px rgba(15,23,35,0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--th-line)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Profiles
              </span>
              <button
                type="button"
                onClick={() => setShowIdentityHub(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--th-muted)', display: 'flex', alignItems: 'center' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <IdentityHubPanel />
            </div>
          </div>
        </>
      )}

      {/* ── Review Queue slide-over ─────────────────────────────────────────── */}
      {showReviewQueue && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowReviewQueue(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15,23,35,0.4)',
              zIndex: 200,
            }}
          />
          {/* Drawer */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 480,
              maxWidth: '92vw',
              background: 'var(--th-bg)',
              borderLeft: '1px solid var(--th-line)',
              zIndex: 201,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-8px 0 32px rgba(15,23,35,0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--th-line)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Review Queue
              </span>
              <button
                type="button"
                onClick={() => setShowReviewQueue(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--th-muted)', display: 'flex', alignItems: 'center' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ReviewQueuePanel />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
