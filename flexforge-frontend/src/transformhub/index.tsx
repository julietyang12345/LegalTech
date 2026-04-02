import { startTransition, type ChangeEvent, useCallback, useEffect, useMemo, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FolderTree,
  GripVertical,
  RefreshCcw,
  Save,
  ShieldAlert,
  Upload,
  Users,
  WandSparkles,
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
import { applyTaxonomyGroupsToPreviewRecords, buildTaxonomyState, dismissTaxonomyCandidate, mergeTaxonomyCandidate, renameResolvedTaxonomyGroup, summarizeTaxonomyState, updateTaxonomyScanColumn } from './taxonomy-session';
import { buildAppendColumnDecisions, getPendingColumnMerges, mergeUploadIntoExisting, prepareIncomingUpload, resolvePendingColumnMerge as resolvePendingColumnMergeInParsedFile, type AppendColumnDecision, type PendingColumnMerge } from './merge-table';
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

type WorkbookSheetAction = 'append' | 'ignore' | 'separate';

type PendingWorkbookSheetReview = {
  payload: UploadPayload;
  workbookSheets: NonNullable<ParsedFile['workbookSheets']>;
  actionsBySheet: Record<string, WorkbookSheetAction>;
};

type DeferredWorkbookSheetReview = {
  payload: UploadPayload;
  workbookSheets: NonNullable<ParsedFile['workbookSheets']>;
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

function deriveReviewDecision(match: PersonMatch, mergeDecisions: Map<string, 'confirmed' | 'separated'>) {
  const persistedDecision = mergeDecisions.get(match.inputRef);
  if (persistedDecision) return persistedDecision;
  if (match.band !== 'review') return null;
  if (match.decision === 'auto') return 'confirmed' as const;
  if (match.decision === 'new') return 'separated' as const;
  return null;
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

function formatPreviewHeaderLabel(header: string): string {
  return header.replace(/[_-]+/g, ' ').trim() || header;
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
    creditAmount: attribution.creditAmount ?? null,
    campaignFund: attribution.campaignFund ?? '',
    organizationName: attribution.organizationName ?? '',
    splitPercent: attribution.splitPercent ?? 50,
    notes: attribution.notes ?? '',
  };
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

function buildDefaultWorkbookSheetActions(workbookSheets: NonNullable<ParsedFile['workbookSheets']>): Record<string, WorkbookSheetAction> {
  if (workbookSheets.length === 0) return {};
  const baseSheet = workbookSheets[0];
  return Object.fromEntries(
    workbookSheets.map((sheet) => {
      if (sheet.sheetName === baseSheet.sheetName) return [sheet.sheetName, 'append' as const];
      const overlap = scoreSheetHeaderOverlap(baseSheet.headers, sheet.headers);
      const isCompatible = sheet.fileClass === baseSheet.fileClass && overlap >= 0.45;
      return [sheet.sheetName, isCompatible ? 'append' as const : 'separate' as const];
    }),
  );
}

function describeWorkbookSheetCompatibility(sheet: NonNullable<ParsedFile['workbookSheets']>[number], baseSheet: NonNullable<ParsedFile['workbookSheets']>[number]) {
  if (sheet.sheetName === baseSheet.sheetName) {
    return { tone: 'ready' as const, label: 'Base sheet', detail: 'Used as the comparison baseline for workbook combine review.' };
  }
  const overlap = scoreSheetHeaderOverlap(baseSheet.headers, sheet.headers);
  if (sheet.fileClass !== baseSheet.fileClass) {
    return {
      tone: 'warning' as const,
      label: 'Different class',
      detail: `Detected as ${sheet.fileClass} instead of ${baseSheet.fileClass}. Keep separate unless you intentionally want one mixed table.`,
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

function summarizeAppendColumnDecisions(decisions: AppendColumnDecision[]) {
  const mergedColumns = decisions.filter((decision) => decision.action === 'merge' && decision.targetHeader);
  const newColumns = decisions.filter((decision) => decision.action !== 'merge' || !decision.targetHeader).map((decision) => decision.incomingHeader);
  const fuzzyMerges = decisions.filter((decision) => decision.matchType === 'fuzzy');
  return { mergedColumns, newColumns, fuzzyMerges };
}

function buildAppendPreviewColumns(existingHeaders: string[], decisions: AppendColumnDecision[]) {
  const mergedInto = new Map<string, AppendColumnDecision[]>();
  const separated: AppendColumnDecision[] = [];

  decisions.forEach((decision) => {
    if (decision.action === 'merge' && decision.targetHeader) {
      const current = mergedInto.get(decision.targetHeader) ?? [];
      current.push(decision);
      mergedInto.set(decision.targetHeader, current);
      return;
    }
    separated.push(decision);
  });

  const preview = existingHeaders.map((header) => ({
    key: `existing-${header}`,
    header,
    status: (mergedInto.get(header)?.length ?? 0) > 0 ? 'merge-target' : 'existing',
    mergedFrom: (mergedInto.get(header) ?? []).map((decision) => decision.incomingHeader),
    editors: mergedInto.get(header) ?? [],
  }));

  separated.forEach((decision) => {
    preview.push({
      key: `${decision.action === 'drop' ? 'drop' : 'new'}-${decision.id}`,
      header: decision.incomingHeader,
      status: decision.action === 'drop' ? 'drop' : 'new',
      mergedFrom: [],
      editors: [decision],
    });
  });

  return preview;
}

type PeopleReviewFilter = 'pending' | 'merged' | 'separated' | 'all';
type HouseholdReviewTab = 'needs_attribution' | 'all';
type AttributionTableTab = 'needs_attribution' | 'all';

function getPeopleReviewBucket(decision: ReturnType<typeof deriveReviewDecision>): Exclude<PeopleReviewFilter, 'all'> {
  if (decision === 'confirmed') return 'merged';
  if (decision === 'separated') return 'separated';
  return 'pending';
}

function matchesPeopleReviewFilter(filter: PeopleReviewFilter, decision: ReturnType<typeof deriveReviewDecision>): boolean {
  if (filter === 'all') return true;
  return getPeopleReviewBucket(decision) === filter;
}

function countPeopleReviewBuckets(matches: PersonMatch[], mergeDecisions: Map<string, 'confirmed' | 'separated'>) {
  return matches.reduce(
    (counts, match) => {
      const bucket = getPeopleReviewBucket(deriveReviewDecision(match, mergeDecisions));
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

function buildHouseholdLabel(members: CanonicalPerson[], fallbackLastName?: string | null) {
  const lastName = fallbackLastName || members.map((member) => member.lastName).find(Boolean) || 'Household';
  return /\bhousehold\b/i.test(lastName) ? lastName : `${lastName} Household`;
}

function buildInformalSalutation(members: CanonicalPerson[]) {
  const firstNames = members.map((member) => member.firstName).filter(Boolean);
  if (firstNames.length === 0) return 'Friends';
  if (firstNames.length === 1) return firstNames[0];
  if (firstNames.length === 2) return `${firstNames[0]} and ${firstNames[1]}`;
  return `${firstNames[0]} and family`;
}

function buildAddressee(members: CanonicalPerson[]) {
  if (members.length === 0) return 'Household';
  if (members.length === 1) return formatPersonName(members[0]);
  const uniqueLastNames = Array.from(new Set(members.map((member) => member.lastName).filter(Boolean)));
  const firstNames = members.map((member) => member.firstName).filter(Boolean);
  if (members.length === 2 && uniqueLastNames.length === 1 && firstNames.length === 2) {
    return `${firstNames[0]} and ${firstNames[1]} ${uniqueLastNames[0]}`;
  }
  return members.map((member) => formatPersonName(member)).join(' and ');
}

function buildFormalSalutation(members: CanonicalPerson[]) {
  if (members.length === 0) return 'Household';
  if (members.length === 1) return formatPersonName(members[0]);
  const uniqueLastNames = Array.from(new Set(members.map((member) => member.lastName).filter(Boolean)));
  if (members.length === 2 && uniqueLastNames.length === 1) {
    return `${members.map((member) => member.firstName).filter(Boolean).join(' and ')} ${uniqueLastNames[0]}`.trim();
  }
  return buildAddressee(members);
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
  return {
    mode: hasOrgMatch ? 'org_match' : hasSoftCredit ? 'soft_credit' : hasJointGift ? 'joint_split' : 'person',
    primaryPersonId: matchedPerson?.id ?? members[0]?.id ?? null,
    secondaryPersonId: members.find((member) => member.id !== (matchedPerson?.id ?? members[0]?.id))?.id ?? null,
    householdId: null,
    creditAmount: parseCurrencyAmount(record.amount),
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

const ATTRIBUTION_MODE_SEQUENCE: PreviewAttributionDraft['mode'][] = ['person', 'soft_credit', 'joint_split', 'org_match'];
const ROLE_SEQUENCE: Array<'primary' | 'secondary' | 'organization' | 'unassigned'> = ['primary', 'secondary', 'organization', 'unassigned'];

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

function getPreviewCompareValue(record: PreviewRecord | null, field: PreviewCompareField): string {
  if (!record) return '—';
  if (field.kind === 'source') {
    return record.sourceRowRef ? String(record.sourceRowRef) : '—';
  }
  return field.header ? getPreviewRecordRawCell(record, field.header) : '—';
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
  const [pendingAppendReview, setPendingAppendReview] = useState<PendingAppendReview | null>(null);
  const [pendingWorkbookSheetReview, setPendingWorkbookSheetReview] = useState<PendingWorkbookSheetReview | null>(null);
  const [deferredWorkbookSheetReview, setDeferredWorkbookSheetReview] = useState<DeferredWorkbookSheetReview | null>(null);

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
  const [peopleReviewFilter, setPeopleReviewFilter] = useState<PeopleReviewFilter>('pending');
  const [nonLedgerReviewPanel, setNonLedgerReviewPanel] = useState<'duplicate' | 'household' | 'taxonomy' | 'final'>('duplicate');
  const [householdReviewTab, setHouseholdReviewTab] = useState<HouseholdReviewTab>('needs_attribution');
  const [attributionTableTab, setAttributionTableTab] = useState<AttributionTableTab>('needs_attribution');
  const [selectedAttributionGroupKey, setSelectedAttributionGroupKey] = useState<string | null>(null);
  const [expandedHouseholdReviewId, setExpandedHouseholdReviewId] = useState<string | null>(null);
  const [, setExpandedFinalHouseholdId] = useState<string | null>(null);
  const [taxonomyScanColumnsExpanded, setTaxonomyScanColumnsExpanded] = useState(false);
  const [pendingTaxonomyMergeCandidateId, setPendingTaxonomyMergeCandidateId] = useState<string | null>(null);
  const [pendingTaxonomyMergeLabel, setPendingTaxonomyMergeLabel] = useState('');
  const [editingResolvedTaxonomyGroupId, setEditingResolvedTaxonomyGroupId] = useState<string | null>(null);
  const [editingResolvedTaxonomyLabel, setEditingResolvedTaxonomyLabel] = useState('');
  const [nonLedgerColumnWidths, setNonLedgerColumnWidths] = useState<Record<string, number>>({ __source__: 172, __actions__: 156 });
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
  const fileClass = schema?.fileClass ?? preview?.fileClass ?? 'ledger';
  const isLedgerFile = fileClass === 'ledger';
  const previewBaseRecords = useMemo<PreviewRecord[]>(
    () => (preview?.records as PreviewRecord[] | undefined) ?? [],
    [preview?.records],
  );
  const reviewTableActive = true;
  const duplicateReviewActive = nonLedgerReviewPanel === 'duplicate';
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
  const supportsDuplicateWorkflow = !isLedgerFile;
  const supportsHouseholdWorkflow = !isLedgerFile;
  const canonicalPeople = useMemo(() => personResult?.persons ?? [], [personResult?.persons]);
  const previewCompareFields = useMemo(
    () => (supportsDuplicateWorkflow && duplicateReviewActive ? getPreviewCompareFields(parsedFile?.headers ?? []) : []),
    [supportsDuplicateWorkflow, duplicateReviewActive, parsedFile?.headers],
  );
  useEffect(() => {
    if (isLedgerFile || !parsedFile?.preview) {
      setTaxonomyState((current) => (current ? null : current));
    }
  }, [isLedgerFile, parsedFile]);

  const ledgerReviewMatches = (personResult?.matches ?? []).filter((match) => {
    if (match.band !== 'review') return false;
    const matchedRowRef = match.reviewPayload?.matchedInputRef ?? null;
    return matchedRowRef ? rows.some((row) => row.source_row_ref === matchedRowRef) : false;
  });
  const previewReviewMatches = useMemo(
    () => {
      if (!duplicateReviewActive && !householdReviewActive) return [];
      return (personResult?.matches ?? []).filter((match) => {
        if (match.band !== 'review') return false;
        return previewRecords.some((record) => record.sourceRowRef === match.inputRef);
      });
    },
    [duplicateReviewActive, householdReviewActive, personResult?.matches, previewRecords],
  );
  const filteredLedgerReviewMatches = ledgerReviewMatches.filter((match) => matchesPeopleReviewFilter(peopleReviewFilter, deriveReviewDecision(match, mergeDecisions)));
  const filteredPreviewReviewMatches = useMemo(
    () => previewReviewMatches.filter((match) => matchesPeopleReviewFilter(peopleReviewFilter, deriveReviewDecision(match, mergeDecisions))),
    [previewReviewMatches, peopleReviewFilter, mergeDecisions],
  );
  const ledgerReviewCounts = countPeopleReviewBuckets(ledgerReviewMatches, mergeDecisions);
  const previewReviewCounts = useMemo(
    () => countPeopleReviewBuckets(previewReviewMatches, mergeDecisions),
    [previewReviewMatches, mergeDecisions],
  );
  const mergeableLedgerReviewMatches = filteredLedgerReviewMatches.filter((match) => !deriveReviewDecision(match, mergeDecisions));
  const mergeablePreviewReviewMatches = filteredPreviewReviewMatches.filter((match) => !deriveReviewDecision(match, mergeDecisions));
  const resolvedReviewDecisions = personResult?.matches.filter((match) => deriveReviewDecision(match, mergeDecisions)).length ?? 0;
  const pendingPeopleReviews = Math.max(0, (personResult?.pendingReviewCount ?? personResult?.needsReview ?? 0) - resolvedReviewDecisions);
  const peopleStepReady = !supportsDuplicateWorkflow || (!!personResult && pendingPeopleReviews === 0);
  const householdsStepReady = !supportsHouseholdWorkflow || (!!householdResult && peopleStepReady);
  const nonLedgerExportReady = (!supportsDuplicateWorkflow || peopleStepReady) && (!supportsHouseholdWorkflow || householdsStepReady);
  const peopleById = useMemo(
    () => new Map(canonicalPeople.map((person) => [person.id, person])),
    [canonicalPeople],
  );
  const previewMatchByInputRef = useMemo(
    () => new Map((personResult?.matches ?? []).map((match) => [match.inputRef, match])),
    [personResult?.matches],
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
  const ambiguousAttributionGroups = useMemo(() => {
    const groups = new Map<string, PreviewRecord[]>();
    previewRecords.forEach((record) => {
      const matchedPersonId = previewMatchByInputRef.get(record.sourceRowRef)?.matchedPersonId ?? null;
      const householdId = matchedPersonId ? householdIdByPersonId.get(matchedPersonId) ?? null : null;
      if (!householdId) return;
      const key = `${householdId}::${getAttributionReviewKey(record)}`;
      const current = groups.get(key) ?? [];
      current.push(record);
      groups.set(key, current);
    });
    return Array.from(groups.entries())
      .filter(([, records]) => records.length > 1)
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
  }, [previewRecords, previewMatchByInputRef, householdIdByPersonId]);
  const ambiguousAttributionRefs = useMemo(
    () => new Set(ambiguousAttributionGroups.flatMap((group) => group.records.map((record) => record.sourceRowRef))),
    [ambiguousAttributionGroups],
  );
  const ambiguousGroupKeyBySourceRef = useMemo(
    () => new Map(ambiguousAttributionGroups.flatMap((group) => group.records.map((record) => [record.sourceRowRef, group.key] as const))),
    [ambiguousAttributionGroups],
  );
  const householdLayerViews = useTransformHubHouseholdReview({
    householdResult,
    peopleById,
    finalHouseholdDrafts,
    finalAttributionDrafts,
    previewMatchByInputRef,
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

  const previewMergeView = useMemo(() => {
    const previewRecordOrder = new Map(previewRecords.map((record, index) => [record.sourceRowRef, index]));
    const confirmedPreviewMergePairs: Array<[string, string]> = [];
    if (supportsDuplicateWorkflow && personResult) {
      personResult.matches.forEach((match) => {
        if (deriveReviewDecision(match, mergeDecisions) !== 'confirmed') return;
        const directRef = match.reviewPayload?.matchedInputRef ?? null;
        if (directRef && directRef !== match.inputRef && previewRecordOrder.has(directRef) && previewRecordOrder.has(match.inputRef)) {
          confirmedPreviewMergePairs.push([match.inputRef, directRef]);
          return;
        }
        if (!match.matchedPersonId) return;
        const siblingMatch = (personResult?.matches ?? []).find((candidate) => candidate.inputRef !== match.inputRef && candidate.matchedPersonId === match.matchedPersonId);
        if (siblingMatch?.inputRef && siblingMatch.inputRef !== match.inputRef && previewRecordOrder.has(siblingMatch.inputRef) && previewRecordOrder.has(match.inputRef)) {
          confirmedPreviewMergePairs.push([match.inputRef, siblingMatch.inputRef]);
        }
      });
    }
    const mergeParent = new Map<string, string>();
    const findMergedRepresentative = (ref: string): string => {
      const current = mergeParent.get(ref) ?? ref;
      if (current === ref) return current;
      const representative = findMergedRepresentative(current);
      mergeParent.set(ref, representative);
      return representative;
    };
    const unionMergedRows = (left: string, right: string) => {
      const leftRoot = findMergedRepresentative(left);
      const rightRoot = findMergedRepresentative(right);
      if (leftRoot === rightRoot) return;
      const leftOrder = previewRecordOrder.get(leftRoot) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = previewRecordOrder.get(rightRoot) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder <= rightOrder) mergeParent.set(rightRoot, leftRoot);
      else mergeParent.set(leftRoot, rightRoot);
    };
    confirmedPreviewMergePairs.forEach(([left, right]) => {
      if (!mergeParent.has(left)) mergeParent.set(left, left);
      if (!mergeParent.has(right)) mergeParent.set(right, right);
      unionMergedRows(left, right);
    });
    const representativeByAbsorbedRef = new Map<string, string>();
    const mergedSourceRefsByRepresentative = new Map<string, string[]>();
    previewRecords.forEach((record) => {
      if (!mergeParent.has(record.sourceRowRef)) return;
      const representative = findMergedRepresentative(record.sourceRowRef);
      if (representative === record.sourceRowRef) return;
      representativeByAbsorbedRef.set(record.sourceRowRef, representative);
      const current = mergedSourceRefsByRepresentative.get(representative) ?? [];
      current.push(record.sourceRowRef);
      mergedSourceRefsByRepresentative.set(representative, current);
    });
    return {
      representativeByAbsorbedRef,
      mergedSourceRefsByRepresentative,
      displayedPreviewRecords: supportsDuplicateWorkflow
        ? previewRecords.filter((record) => !representativeByAbsorbedRef.has(record.sourceRowRef))
        : previewRecords,
    };
  }, [supportsDuplicateWorkflow, personResult, mergeDecisions, previewRecords]);
  const mergedSourceRefsByRepresentative = previewMergeView.mergedSourceRefsByRepresentative;
  const displayedPreviewRecords = previewMergeView.displayedPreviewRecords;
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
    () => ['__source__', ...visibleNonLedgerTableHeaders, ...reviewAugmentedColumns, ...((fileClass === 'constituent' || fileClass === 'donor') ? ['__actions__'] : [])],
    [visibleNonLedgerTableHeaders, reviewAugmentedColumns, fileClass],
  );

  const nonLedgerTableWidth = useMemo(
    () => nonLedgerTableColumnKeys.reduce((total, columnKey) => {
      const width = nonLedgerColumnWidths[columnKey] ?? (columnKey === '__source__' ? 172 : columnKey === '__actions__' ? 156 : 148);
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
      setPreviewHeaderDropTarget(null);
      setPreviewRowDropTarget(null);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isLedgerFile, parsedFile]);
  function getNonLedgerColumnWidth(columnKey: string) {
    if (nonLedgerColumnWidths[columnKey]) return nonLedgerColumnWidths[columnKey];
    if (columnKey === '__source__') return 172;
    if (columnKey === '__actions__') return 156;
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
    const minWidth = columnKey === '__source__' ? 156 : columnKey === '__actions__' ? 132 : 120;
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
  const visibleAttributionTableRecords = useMemo(
    () => {
      const scoped = selectedAttributionGroupKey
        ? filteredDisplayedPreviewRecords.filter((record) => ambiguousGroupKeyBySourceRef.get(record.sourceRowRef) === selectedAttributionGroupKey)
        : filteredDisplayedPreviewRecords;
      if (attributionTableTab === 'needs_attribution' && ambiguousAttributionRefs.size > 0) {
        return scoped.filter((record) => ambiguousAttributionRefs.has(record.sourceRowRef));
      }
      return scoped;
    },
    [selectedAttributionGroupKey, attributionTableTab, ambiguousAttributionRefs, filteredDisplayedPreviewRecords, ambiguousGroupKeyBySourceRef],
  );
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
    const normalizedDraft: EditablePreviewDraft = {
      ...editingMergedDraft,
      tags: editingMergedDraft.tags
        ? editingMergedDraft.tags.split(';').map((value) => value.trim()).filter(Boolean)
        : [],
    };
    const nextPreview = {
      ...parsedFile.preview,
      records: parsedFile.preview.records.map((record) =>
        record.sourceRowRef === editingMergedRecordRef ? applyPreviewRecordEdits(record, normalizedDraft) : record,
      ),
    };
    const nextParsedFile = { ...parsedFile, preview: nextPreview };
    setParsedFile(nextParsedFile);
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

  async function persistTaxonomyState(nextTaxonomyState: SessionTaxonomyState, nextMessage: string) {
    setTaxonomyState(nextTaxonomyState);
    if (!sessionId) {
      setMessage(nextMessage);
      return;
    }
    setIsLoading(true);
    try {
      const nextStatus = deriveSessionStatus(rows, preflight, receipts);
      const session = await saveSession(sessionId, rows, nextStatus, preflight, personResult, householdResult, parsedFile, schema, nextTaxonomyState);
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
    await persistTaxonomyState(dismissTaxonomyCandidate(taxonomyState, candidateId), 'Kept taxonomy candidates separate.');
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
        const personId = previewMatchByInputRef.get(record.sourceRowRef)?.matchedPersonId;
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
      const session = await saveSession(sessionId, rows, nextStatus, preflight, personResult, nextHouseholdResult, nextParsedFile, schema, taxonomyState);
      applySession(session, 'Applied final household edits to this session.', { nextNonLedgerReviewPanel: 'final' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to apply final household edits.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefreshEntityModel(persist = false) {
    const persons = personResult?.persons ?? [];
    const households = householdResult?.households ?? [];
    if (!parsedFile?.preview?.records || persons.length === 0 || households.length === 0) {
      setMessage('Run duplicate review and householding before loading the entity model.');
      return;
    }
    setIsRefreshingEntityModel(true);
    try {
      const result = await fetchEntityModel(rows, persons, households, parsedFile.preview.records as PreviewRecord[], sessionId ?? undefined, persist);
      setEntityModelResult(result);
      setMessage(`Entity model loaded: ${result.summary.personCount} persons · ${result.summary.householdCount} households · ${result.summary.donationCount} donations.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load the entity model.');
    } finally {
      setIsRefreshingEntityModel(false);
    }
  }

  function applySession(
    session: TransformSession,
    nextMessage?: string,
    options?: { nextNonLedgerReviewPanel?: 'duplicate' | 'household' | 'taxonomy' | 'final' },
  ) {
    startTransition(() => {
      setSessionId(session.id);
      setSessionStatus(session.status);
      setSessionUpdatedAt(session.updatedAt);
      setParsedFile(session.parsedFile);
      setPlatform(session.parsedFile.platform);
      setSchema(session.schema);
      setTaxonomyState(session.taxonomyState ?? null);
      setGuardrails(session.guardrails);
      setBlockingIssues(session.blockingIssues ?? []);
      setRows(session.rows);
      setPreflight(session.preflight);
      setReceipts(session.receipts);
      setPersonResult(session.personResult ?? null);
      setHouseholdResult(session.householdResult ?? null);
      setMergeDecisions(buildMergeDecisionMap(session.rows, session.auditDecisions));
      setNonLedgerReviewPanel(options?.nextNonLedgerReviewPanel ?? 'duplicate');
      setActiveOperatorIntent(null);
      if (nextMessage) setMessage(nextMessage);
    });
  }

  function getAttributionDraftForRecord(record: PreviewRecord) {
    const matchedPerson = peopleById.get(previewMatchByInputRef.get(record.sourceRowRef)?.matchedPersonId ?? '') ?? null;
    const defaultHouseholdId = matchedPerson ? householdIdByPersonId.get(matchedPerson.id) ?? null : null;
    const members = defaultHouseholdId
      ? ((householdResult?.households.find((household) => household.id === defaultHouseholdId)?.memberIds ?? [])
        .map((memberId) => peopleById.get(memberId))
        .filter((member): member is CanonicalPerson => Boolean(member)))
      : [];
    const draft = finalAttributionDrafts[record.sourceRowRef] ?? buildInitialAttributionDraft(record, members, matchedPerson);
    return {
      matchedPerson,
      draft,
      assignedHouseholdId: draft.householdId ?? defaultHouseholdId,
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

  function updateRecordRole(
    record: PreviewRecord,
    attributionDraft: PreviewAttributionDraft,
    matchedPerson: CanonicalPerson | null,
    assignedHouseholdId: string | null,
    nextRole: 'primary' | 'secondary' | 'organization' | 'unassigned',
  ) {
    if (!matchedPerson) return;
    const householdMembers = assignedHouseholdId
      ? (householdResult?.households.find((household) => household.id === assignedHouseholdId)?.memberIds ?? [])
      : [];
    const otherMemberId = householdMembers.find((memberId) => memberId !== matchedPerson.id) ?? attributionDraft.secondaryPersonId ?? null;

    if (nextRole === 'secondary') {
      updateFinalAttributionDraft(record.sourceRowRef, {
        primaryPersonId: otherMemberId,
        secondaryPersonId: matchedPerson.id,
      });
      return;
    }

    if (nextRole === 'organization') {
      updateFinalAttributionDraft(record.sourceRowRef, {
        mode: 'org_match',
        primaryPersonId: matchedPerson.id,
        secondaryPersonId: otherMemberId,
      });
      return;
    }

    updateFinalAttributionDraft(record.sourceRowRef, {
      primaryPersonId: matchedPerson.id,
      secondaryPersonId: otherMemberId,
      mode: attributionDraft.mode === 'org_match' && nextRole === 'primary' ? 'person' : attributionDraft.mode,
    });
  }

  function cycleRecordRole(
    record: PreviewRecord,
    attributionDraft: PreviewAttributionDraft,
    matchedPerson: CanonicalPerson | null,
    assignedHouseholdId: string | null,
  ) {
    const currentRole = getRecordRole(record, attributionDraft, matchedPerson);
    const currentIndex = ROLE_SEQUENCE.indexOf(currentRole);
    const nextRole = ROLE_SEQUENCE[(currentIndex + 1) % ROLE_SEQUENCE.length];
    updateRecordRole(record, attributionDraft, matchedPerson, assignedHouseholdId, nextRole);
  }

  function cycleAttributionMode(record: PreviewRecord, attributionDraft: PreviewAttributionDraft) {
    const currentIndex = ATTRIBUTION_MODE_SEQUENCE.indexOf(attributionDraft.mode);
    const nextMode = ATTRIBUTION_MODE_SEQUENCE[(currentIndex + 1) % ATTRIBUTION_MODE_SEQUENCE.length];
    updateFinalAttributionDraft(record.sourceRowRef, { mode: nextMode });
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

  function jumpToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const appendSheets = review.workbookSheets.filter((sheet) => review.actionsBySheet[sheet.sheetName] === 'append');
    const separateSheets = review.workbookSheets.filter((sheet) => review.actionsBySheet[sheet.sheetName] === 'separate');

    if (appendSheets.length === 0 && separateSheets.length === 0) {
      setMessage('Choose at least one workbook tab to append or keep separate.');
      return;
    }

    if (appendSheets.length === 0) {
      setPendingWorkbookSheetReview(null);
      setDeferredWorkbookSheetReview(separateSheets.length > 0 ? { payload: review.payload, workbookSheets: separateSheets } : null);
      setMessage(`${separateSheets.length} workbook tab${separateSheets.length === 1 ? '' : 's'} queued for standalone review.`);
      return;
    }
    if (appendSheets.length === 1) {
      setPendingWorkbookSheetReview(null);
      setDeferredWorkbookSheetReview(separateSheets.length > 0 ? { payload: review.payload, workbookSheets: separateSheets } : null);
      await hydrateUpload(
        {
          ...review.payload,
          selectedWorkbookSheets: [appendSheets[0].sheetName],
        },
        false,
        undefined,
        separateSheets,
      );
      return;
    }

    setActiveUploadLabel(review.payload.fileName);
    setIsLoading(true);
    setMessage(`Preparing ${appendSheets.length} workbook tabs from ${review.payload.fileName}...`);

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
        const decisions = buildAppendColumnDecisions(combinedPrepared.parsedFile.headers, preparedSheet.parsedFile.headers, `${review.payload.fileName} · ${entry.sheet.sheetName}`);
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
      const canAppend = Boolean(parsedFile && schema && parsedFile.platform === combinedPrepared.parsedFile.platform && ((schema.fileClass === 'ledger' && combinedPrepared.schema.fileClass === 'ledger') || (schema.fileClass !== 'ledger' && combinedPrepared.schema.fileClass !== 'ledger')));

      if (canAppend && parsedFile && schema) {
        const appendColumnDecisions = buildAppendColumnDecisions(parsedFile.headers, combinedPrepared.parsedFile.headers, `${review.payload.fileName} · workbook`);
        const decisionSummary = summarizeAppendColumnDecisions(appendColumnDecisions);
        setPendingWorkbookSheetReview(null);
        setDeferredWorkbookSheetReview(separateSheets.length > 0 ? { payload: review.payload, workbookSheets: separateSheets } : null);
        setPendingAppendReview({
          sessionId: sessionId ?? baseSessionId,
          currentParsedFile: parsedFile,
          currentSchema: schema,
          currentRows: rows,
          incomingParsedFile: combinedPrepared.parsedFile,
          incomingSchema: combinedPrepared.schema,
          incomingRows: combinedPrepared.rows,
          columnDecisions: appendColumnDecisions,
          guardrails: ingestedSheets.flatMap((entry) => entry.result.guardrails),
          blockingIssues: [],
          summary: {
            sourceFile: `${review.payload.fileName} · ${appendSheets.length} sheets`,
            appendedRows: combinedPrepared.rows.length,
            combinedColumns: decisionSummary.mergedColumns.length,
            newColumns: decisionSummary.newColumns,
            fuzzyMerges: decisionSummary.fuzzyMerges,
          },
        });
        setMessage(`Review the merge plan for ${appendSheets.length} selected workbook tabs before applying them to the current table.`);
        jumpToSection('th-ingest');
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
      setDeferredWorkbookSheetReview(separateSheets.length > 0 ? { payload: review.payload, workbookSheets: separateSheets } : null);
      applySession(
        session,
        `Loaded ${appendSheets.length} selected workbook tabs from ${review.payload.fileName}${separateSheets.length ? ` · ${separateSheets.length} tab${separateSheets.length === 1 ? '' : 's'} left separate` : ''}.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to process the selected workbook tabs.');
    } finally {
      setActiveUploadLabel(null);
      setIsLoading(false);
    }
  }

  async function handleOpenDeferredWorkbookSheet(sheetName: string) {
    if (!deferredWorkbookSheetReview) return;
    const targetSheet = deferredWorkbookSheetReview.workbookSheets.find((sheet) => sheet.sheetName === sheetName);
    if (!targetSheet) return;
    setDeferredWorkbookSheetReview((current) => current ? {
      ...current,
      workbookSheets: current.workbookSheets.filter((sheet) => sheet.sheetName !== sheetName),
    } : current);
    await hydrateUpload({
      ...deferredWorkbookSheetReview.payload,
      selectedWorkbookSheets: [sheetName],
    });
  }

  async function hydrateUpload(
    payload: UploadPayload & { selectedWorkbookSheets?: string[] },
    forceIngest = false,
    precombinedWorkbookUpload?: { parsedFile: ParsedFile; schema: ResolvedSchema; rows: CanonicalLedgerRow[] },
    separateWorkbookSheets: NonNullable<ParsedFile['workbookSheets']> = [],
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
      const canAppend = result.status !== 'blocked' && Boolean(parsedFile && schema && parsedFile.platform === prepared.parsedFile.platform && ((schema.fileClass === 'ledger' && prepared.schema.fileClass === 'ledger') || (schema.fileClass !== 'ledger' && prepared.schema.fileClass !== 'ledger')));
      const appendColumnDecisions = canAppend && parsedFile ? buildAppendColumnDecisions(parsedFile.headers, prepared.parsedFile.headers, payload.fileName) : [];
      const merged = canAppend && parsedFile && schema
        ? mergeUploadIntoExisting({
            currentParsedFile: parsedFile,
            currentSchema: schema,
            currentRows: rows,
            incomingParsedFile: prepared.parsedFile,
            incomingSchema: prepared.schema,
            incomingRows: prepared.rows,
            sourceFile: payload.fileName,
            columnDecisions: appendColumnDecisions,
          })
        : { parsedFile: prepared.parsedFile, schema: prepared.schema, rows: prepared.rows, pendingMergeCount: getPendingColumnMerges(prepared.parsedFile).length };
      const nextSchema = merged.schema;
      const nextParsedFile = merged.parsedFile;
      const nextRows = merged.rows;
      const nextStatus = result.status === 'blocked' ? result.status : 'review';
      const nextMessage = result.status === 'blocked'
        ? `Blocked by ${result.blockingIssues.length} blocking issue${result.blockingIssues.length === 1 ? '' : 's'}. Review the report below, then force continue if intentional.`
        : canAppend
          ? `Appended ${prepared.rows.length} row${prepared.rows.length === 1 ? '' : 's'} from ${payload.fileName}. Combined table now has ${nextParsedFile.rows.length} source row${nextParsedFile.rows.length === 1 ? '' : 's'} · ${merged.pendingMergeCount} pending fuzzy column merge${merged.pendingMergeCount === 1 ? '' : 's'}.`
          : `Loaded ${prepared.rows.length} row${prepared.rows.length === 1 ? '' : 's'} from ${payload.fileName}${payload.selectedWorkbookSheets?.length ? ` · ${payload.selectedWorkbookSheets.length} sheet${payload.selectedWorkbookSheets.length === 1 ? '' : 's'} combined` : ''}${separateWorkbookSheets.length ? ` · ${separateWorkbookSheets.length} sheet${separateWorkbookSheets.length === 1 ? '' : 's'} left separate` : ''} · ${nextAudit?.errorCount ?? 0} audit error(s) · ${nextTaxonomy?.unmappedCount ?? 0} taxonomy exception(s).`;

      if (canAppend) {
        const decisionSummary = summarizeAppendColumnDecisions(appendColumnDecisions);
        setPendingAppendReview({
          sessionId: result.sessionId!,
          currentParsedFile: parsedFile!,
          currentSchema: schema!,
          currentRows: rows,
          incomingParsedFile: prepared.parsedFile,
          incomingSchema: prepared.schema,
          incomingRows: prepared.rows,
          columnDecisions: appendColumnDecisions,
          guardrails: result.guardrails,
          blockingIssues: result.blockingIssues ?? [],
          summary: {
            sourceFile: payload.fileName,
            appendedRows: prepared.rows.length,
            combinedColumns: decisionSummary.mergedColumns.length,
            newColumns: decisionSummary.newColumns,
            fuzzyMerges: decisionSummary.fuzzyMerges,
          },
        });
        setPendingIngestPayload(result.status === 'blocked' ? payload : null);
        setMessage(`Review the merge plan for ${payload.fileName} before applying it to the current table.`);
        jumpToSection('th-ingest');
        return;
      }

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
      applySession(session, nextMessage);
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

  async function handleResolvePendingColumnMerge(merge: PendingColumnMerge, action: 'merge' | 'keep_separate' | 'drop') {
    if (!parsedFile) return;
    const nextParsedFile = resolvePendingColumnMergeInParsedFile(parsedFile, merge, action);
    setParsedFile(nextParsedFile);

    if (!sessionId) {
      setMessage(action === 'merge' ? 'Fuzzy column merge confirmed.' : action === 'drop' ? 'Column deleted from the merged table.' : 'Fuzzy column kept separate.');
      return;
    }

    setIsResolvingPendingMerge(true);
    try {
      const nextStatus = deriveSessionStatus(rows, preflight, receipts);
      const session = await saveSession(sessionId, rows, nextStatus, preflight, personResult, householdResult, nextParsedFile, schema, taxonomyState);
      applySession(session, action === 'merge' ? 'Fuzzy column merge confirmed.' : action === 'drop' ? 'Column deleted from the merged table.' : 'Fuzzy column kept separate.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update the pending column merge.');
    } finally {
      setIsResolvingPendingMerge(false);
    }
  }

  function updatePendingAppendDecision(decisionId: string, patch: Partial<AppendColumnDecision>) {
    setPendingAppendReview((current) => {
      if (!current) return current;
      const columnDecisions = current.columnDecisions.map((decision: AppendColumnDecision) => {
        if (decision.id !== decisionId) return decision;
        return { ...decision, ...patch };
      });
      const decisionSummary = summarizeAppendColumnDecisions(columnDecisions);
      return {
        ...current,
        columnDecisions,
        summary: {
          ...current.summary,
          combinedColumns: decisionSummary.mergedColumns.length,
          newColumns: decisionSummary.newColumns,
          fuzzyMerges: decisionSummary.fuzzyMerges,
        },
      };
    });
  }

  async function handleApplyPendingAppendReview() {
    if (!pendingAppendReview) return;
    const appliedMerge = mergeUploadIntoExisting({
      currentParsedFile: pendingAppendReview.currentParsedFile,
      currentSchema: pendingAppendReview.currentSchema,
      currentRows: pendingAppendReview.currentRows,
      incomingParsedFile: pendingAppendReview.incomingParsedFile,
      incomingSchema: pendingAppendReview.incomingSchema,
      incomingRows: pendingAppendReview.incomingRows,
      sourceFile: pendingAppendReview.summary.sourceFile,
      columnDecisions: pendingAppendReview.columnDecisions,
    });
    const nextStatus: TransformSessionStatus = 'review';
    startTransition(() => {
      setPendingAppendReview(null);
      setSessionId(pendingAppendReview.sessionId);
      setSessionStatus(nextStatus);
      setSessionUpdatedAt(new Date().toISOString());
      setParsedFile(appliedMerge.parsedFile);
      setSchema(appliedMerge.schema);
      setGuardrails(pendingAppendReview.guardrails);
      setBlockingIssues(pendingAppendReview.blockingIssues);
      setRows(appliedMerge.rows);
      setTaxonomyResult(null);
      setAuditResult(null);
      setMessage(`Applied merge plan for ${pendingAppendReview.summary.sourceFile}. Run duplicate check after reviewing column decisions.`);
    });

    try {
      const session = await saveSession(
        pendingAppendReview.sessionId,
        appliedMerge.rows,
        nextStatus,
        null,
        null,
        null,
        appliedMerge.parsedFile,
        appliedMerge.schema,
        taxonomyState,
      );
      applySession(session, `Applied merge plan for ${pendingAppendReview.summary.sourceFile}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to apply the merge plan.');
    }
  }

  function handleCancelPendingAppendReview() {
    if (!pendingAppendReview) return;
    const sourceFile = pendingAppendReview.summary.sourceFile;
    setPendingAppendReview(null);
    setMessage(`Discarded merge plan for ${sourceFile}. Current table was left unchanged.`);
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
      if (!isLedgerFile && supportsDuplicateWorkflow) {
        const result = await resolvePersonsBackend(buildPreviewIdentityRows(), undefined, sessionId ?? undefined, {
          usePersistentIdentityMemory: true,
          forceReviewOnAutoMatches: true,
          seedExistingPersonsFromDb: true,
          baselinePlatform: platform,
          baselineFileClass: fileClass,
          persistIdentityMemory: false,
          includeAiSuggestions: false,
        });
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
        forceReviewOnAutoMatches: false,
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
      setMessage(`Duplicate check: ${result.autoMatched} auto-matched, ${result.needsReview} need review, ${result.separated} new.`);
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
    const pendingMatches = matches.filter((match) => !deriveReviewDecision(match, mergeDecisions));
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

      if (sessionId) {
        const nextStatus = deriveSessionStatus(nextRows, preflight, receipts);
        const session = await saveSession(sessionId, nextRows, nextStatus, preflight, nextPersonResult, null);
        applySession(session, `Merged ${pendingMatches.length} review item${pendingMatches.length === 1 ? '' : 's'}.`);
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

      if (sessionId) {
        setIsLoading(true);
        try {
          const nextStatus = deriveSessionStatus(nextRows, preflight, receipts);
          const session = await saveSession(sessionId, nextRows, nextStatus, preflight, nextPersonResult, null);
          applySession(session, action === "confirmed" ? "Merge decision saved to the backend session." : "Separate decision saved to the backend session.");
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
      const result = await persistMergeDecisionBackend(sessionId, match.inputRef, action, match.matchedPersonId);
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

  function csvCell(value: unknown) {
    const cell = String(value ?? "");
    const quote = String.fromCharCode(34);
    const escaped = cell.split(quote).join(quote + quote);
    return /[",]/.test(cell) || cell.includes("\n") ? quote + escaped + quote : cell;
  }

  function buildPreviewCsv() {
    if (!preview || previewRecords.length === 0) return "";
    if (fileClass === "constituent") return [
      "SourceRowRef,DisplayName,ConstituentType,FirstName,LastName,OrganizationName,HouseholdName,AttributionMode,PrimaryPersonId,SecondaryPersonId,OrganizationCredit,SplitPercent,AttributionNotes,Email,Phone,City,State,Country,AssignedStaff,CreatedAt,UpdatedAt",
      ...displayedPreviewRecords.map((record) => {
        const attribution = getPreviewRecordAttribution(record);
        return [record.sourceRowRef, record.displayName, record.constituentType, record.firstName, record.lastName, record.organizationName, record.householdName, attribution?.mode || '', attribution?.primaryPersonId || '', attribution?.secondaryPersonId || '', attribution?.organizationName || '', attribution?.splitPercent ?? '', attribution?.notes || '', record.email, record.phone, record.city, record.state, record.country, record.assignedStaff, record.createdAt, record.updatedAt].map(csvCell).join(",");
      }),
    ].join("\n");
    if (fileClass === "donor") return [
      "SourceRowRef,DonorName,Date,Amount,Fund,Appeal,AttributionMode,PrimaryPersonId,SecondaryPersonId,OrganizationCredit,SplitPercent,AttributionNotes,Email,Memo,Currency",
      ...displayedPreviewRecords.map((record) => {
        const attribution = getPreviewRecordAttribution(record);
        return [record.sourceRowRef, record.donorName, record.date, record.amount, record.fund, record.appeal, attribution?.mode || '', attribution?.primaryPersonId || '', attribution?.secondaryPersonId || '', attribution?.organizationName || '', attribution?.splitPercent ?? '', attribution?.notes || '', record.email, record.memo, record.currency].map(csvCell).join(",");
      }),
    ].join("\n");
    if (fileClass === "campaign") return [
      "SourceRowRef,Code,CampaignName,StartDate,EndDate,Status,GoalAmount",
      ...displayedPreviewRecords.map((record) => [record.sourceRowRef, record.code, record.campaignName, record.startDate, record.endDate, record.status, record.goalAmount].map(csvCell).join(",")),
    ].join("\n");
    if (fileClass === "coa") return [
      "SourceRowRef,AccountCode,AccountName,AccountType,Balance",
      ...displayedPreviewRecords.map((record) => [record.sourceRowRef, record.accountCode, record.accountName, record.accountType, record.balance].map(csvCell).join(",")),
    ].join("\n");
    return ["SourceRowRef,Preview", ...displayedPreviewRecords.map((record) => [record.sourceRowRef, record.preview ?? ""].map(csvCell).join(","))].join("\n");
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
    const csv = buildPreviewCsv();
    if (!csv) {
      setMessage("Nothing to export from this file class yet.");
      return;
    }
    downloadCsv("transformhub-" + fileClass + "-" + new Date().toISOString().slice(0, 10) + ".csv", csv);
    setMessage("Exported " + displayedPreviewRecords.length + " " + fileClass + " record" + (displayedPreviewRecords.length === 1 ? "" : "s") + ".");
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
        setNonLedgerReviewPanel('household');
      } else if (node.id === 'guardrails') {
        setNonLedgerReviewPanel('taxonomy');
      }
    }
    scrollToSection(node.target);
  }

  type NodeStatus = 'idle' | 'ok' | 'warning' | 'error';

  const uploadedFileCount = ((parsedFile as ParsedFileWithOptionalMergeState | null)?.mergeState?.uploadedFiles?.length ?? (parsedFile ? 1 : 0));
  const combineStepComplete = Boolean(parsedFile) && !pendingAppendReview;

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
            status: (!parsedFile ? 'idle' : pendingAppendReview ? 'warning' : combineStepComplete ? 'ok' : 'idle') as NodeStatus,
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
            status: (!parsedFile ? 'idle' : pendingAppendReview ? 'warning' : combineStepComplete ? 'ok' : 'idle') as NodeStatus,
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
            </div>
            {pendingWorkbookSheetReview && (
              <div className="th-stack" style={{ marginTop: 12 }}>
                <div className="th-panel-head"><span>Combine sheets</span><span>{pendingWorkbookSheetReview.workbookSheets.length} workbook tab{pendingWorkbookSheetReview.workbookSheets.length === 1 ? '' : 's'}</span></div>
                <div className="th-mini-block">
                  <strong>Select which workbook tabs to combine</strong>
                  <p>Compatible tabs are preselected. Keep incompatible tabs separate or ignore them. Row refs will preserve the sheet name for audit tracing.</p>
                </div>
                <div className="th-workbook-sheet-list">
                  {pendingWorkbookSheetReview.workbookSheets.map((sheet) => {
                    const baseSheet = pendingWorkbookSheetReview.workbookSheets[0];
                    const compatibility = describeWorkbookSheetCompatibility(sheet, baseSheet);
                    const currentAction = pendingWorkbookSheetReview.actionsBySheet[sheet.sheetName] ?? 'ignore';
                    return (
                      <div key={sheet.sheetName} className="th-workbook-sheet-card">
                        <div className="th-workbook-sheet-head">
                          <div>
                            <strong>{sheet.sheetName}</strong>
                            <p>{sheet.structureAnalysis.dataRowCount} row{sheet.structureAnalysis.dataRowCount === 1 ? '' : 's'} · {sheet.fileClass}</p>
                          </div>
                          <select
                            className="th-select"
                            value={currentAction}
                            onChange={(event) => {
                              const nextAction = event.target.value as WorkbookSheetAction;
                              setPendingWorkbookSheetReview((current) => current ? {
                                ...current,
                                actionsBySheet: { ...current.actionsBySheet, [sheet.sheetName]: nextAction },
                              } : current);
                            }}
                          >
                            <option value="append">Append into current table</option>
                            <option value="separate">Keep separate</option>
                            <option value="ignore">Ignore</option>
                          </select>
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
            {deferredWorkbookSheetReview && deferredWorkbookSheetReview.workbookSheets.length > 0 && (
              <div className="th-stack" style={{ marginTop: 12 }}>
                <div className="th-panel-head"><span>Separate workbook tabs</span><span>{deferredWorkbookSheetReview.workbookSheets.length} waiting</span></div>
                <div className="th-mini-block">
                  <strong>Open these tabs as standalone reviews</strong>
                  <p>Tabs marked separate were not merged into the current table. Open any one to start its own classified review workspace.</p>
                </div>
                <div className="th-workbook-sheet-list">
                  {deferredWorkbookSheetReview.workbookSheets.map((sheet) => (
                    <div key={`deferred-${sheet.sheetName}`} className="th-workbook-sheet-card">
                      <div className="th-workbook-sheet-head">
                        <div>
                          <strong>{sheet.sheetName}</strong>
                          <p>{sheet.structureAnalysis.dataRowCount} row{sheet.structureAnalysis.dataRowCount === 1 ? '' : 's'} · {sheet.fileClass}</p>
                        </div>
                        <div className="th-review-match-actions">
                          <button type="button" className="th-button th-button-secondary" onClick={() => void handleOpenDeferredWorkbookSheet(sheet.sheetName)}>Open separately</button>
                          <button
                            type="button"
                            className="th-button th-button-secondary"
                            onClick={() => setDeferredWorkbookSheetReview((current) => current ? {
                              ...current,
                              workbookSheets: current.workbookSheets.filter((item) => item.sheetName !== sheet.sheetName),
                            } : current)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                      <div className="th-cell-chip-row">
                        <span className="th-cell-chip">{sheet.headers.length} columns</span>
                        {sheet.schema?.reportType && <span className="th-cell-chip">{sheet.schema.reportType}</span>}
                      </div>
                      <p className="th-helper">{sheet.headers.slice(0, 6).join(' · ')}{sheet.headers.length > 6 ? ' …' : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {pendingAppendReview && (
              <div className="th-stack" style={{ marginTop: 12 }}>
                <div className="th-panel-head"><span>Append review</span><span>{pendingAppendReview.summary.appendedRows} rows pending</span></div>
                <div className="th-mini-block th-append-preview-block">
                  <strong>{pendingAppendReview.summary.sourceFile}</strong>
                  {(() => {
                    const previewCols = buildAppendPreviewColumns(pendingAppendReview.currentParsedFile.headers, pendingAppendReview.columnDecisions);
                    const unchangedCount = previewCols.filter((column) => column.status === 'existing').length;
                    const mergedCount = previewCols.filter((column) => column.status === 'merge-target').length;
                    const newCount = previewCols.filter((column) => column.status === 'new').length;
                    const deletedCount = previewCols.filter((column) => column.status === 'drop').length;
                    return (
                      <>
                        <p className="th-helper">{unchangedCount} unchanged · <span style={{ color: 'var(--th-blue)' }}>{mergedCount} merged</span> · <span style={{ color: 'var(--th-green)' }}>{newCount} new</span>{deletedCount > 0 ? <> · <span style={{ color: 'var(--th-red)' }}>{deletedCount} deleted</span></> : null}</p>
                        <p className="th-helper">Edit each box directly. Blue boxes merge into an existing column. Green boxes stay as new columns. Nothing is appended until you click confirm.</p>
                        <div className="th-append-preview-grid">
                          {previewCols.map((column) => (
                            <div key={column.key} className={`th-append-preview-col is-${column.status}`}>
                              <div className="th-append-preview-head">
                                <strong>{column.header}</strong>
                                {column.status !== 'existing' && (
                                  <span className="th-append-preview-badge">
                                    {column.status === 'merge-target' ? 'Merged' : column.status === 'drop' ? 'Delete' : 'New'}
                                  </span>
                                )}
                              </div>
                              {column.editors.length > 0 && (
                                <div className="th-append-preview-editors">
                                  {column.editors.map((decision: AppendColumnDecision) => (
                                    <label key={decision.id} className="th-append-preview-editor">
                                      <span>{column.status === 'new' ? decision.incomingHeader : `${decision.incomingHeader} -> ${column.header}`}</span>
                                      {(() => {
                                        const selectValue = decision.action === 'drop' ? '__drop__' : (decision.targetHeader ?? '');
                                        return (
                                          <select
                                            className="th-select th-append-preview-select"
                                            value={selectValue}
                                            onChange={(event) => {
                                              const nextValue = event.target.value;
                                              updatePendingAppendDecision(
                                                decision.id,
                                                nextValue === '__drop__'
                                                  ? { targetHeader: null, action: 'drop' }
                                                  : { targetHeader: nextValue || null, action: nextValue ? 'merge' : 'keep_separate' },
                                              );
                                            }}
                                          >
                                            <option value="">Add as new column</option>
                                            <option value="__drop__">Delete column</option>
                                            {pendingAppendReview.currentParsedFile.headers.map((header: string) => (
                                              <option key={`${decision.id}-${header}`} value={header}>{header}</option>
                                            ))}
                                          </select>
                                        );
                                      })()}
                                    </label>
                                  ))}
                                </div>
                              )}
                              {column.mergedFrom.length > 0 && (
                                <p className="th-helper">From: {column.mergedFrom.join(' · ')}</p>
                              )}
                              <div className="th-append-preview-cells" aria-hidden="true">
                                <span />
                                <span />
                                <span />
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="th-review-match-actions">
                  <button type="button" className="th-button th-button-primary" onClick={() => void handleApplyPendingAppendReview()}>Confirm append</button>
                  <button type="button" className="th-button th-button-secondary" onClick={handleCancelPendingAppendReview}>Discard</button>
                </div>
              </div>
            )}
            {pendingColumnMerges.length > 0 && (
              <div className="th-stack" style={{ marginTop: 12 }}>
                <div className="th-panel-head"><span>Pending column merges</span><span>{pendingColumnMerges.length} fuzzy match{pendingColumnMerges.length === 1 ? '' : 'es'}</span></div>
                {pendingColumnMerges.map((merge) => (
                  <div key={merge.id} className="th-guardrail is-warning" style={{ alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <strong>{merge.sourceFile}</strong>
                      <p>{merge.incomingHeader} looks close to {merge.suggestedHeader}</p>
                      <p className="th-helper">Fuzzy column match · {Math.round(merge.score * 100)}%</p>
                    </div>
                    <div className="th-review-match-actions">
                      <button type="button" className="th-button th-button-primary" onClick={() => void handleResolvePendingColumnMerge(merge, 'merge')} disabled={isResolvingPendingMerge}>Merge columns</button>
                      <button type="button" className="th-button th-button-secondary" onClick={() => void handleResolvePendingColumnMerge(merge, 'keep_separate')} disabled={isResolvingPendingMerge}>Keep separate</button>
                      <button type="button" className="th-button th-button-secondary" style={{ borderColor: 'rgba(166,64,52,0.28)', color: 'var(--th-red)' }} onClick={() => void handleResolvePendingColumnMerge(merge, 'drop')} disabled={isResolvingPendingMerge}>Delete column</button>
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
                      <div className="th-grid th-grid-3" style={{ marginBottom: 10 }}>
                        <div className="th-stat-chip th-band-auto"><strong>{personResult.autoMatched}</strong><span>Auto merged</span></div>
                        <div className="th-stat-chip th-band-review"><strong>{personResult.needsReview}</strong><span>Pending review</span></div>
                        <div className="th-stat-chip th-band-separate"><strong>{personResult.separated}</strong><span>New records</span></div>
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
                        <button type="button" className="th-button th-button-primary" style={{ minHeight: 34 }} onClick={() => void handleMergeAllPeopleReviews(filteredLedgerReviewMatches)} disabled={isLoading}>Merge all shown ({mergeableLedgerReviewMatches.length})</button>
                      )}
                      <span>{filteredLedgerReviewMatches.length} shown</span>
                    </div>
                  </div>
                  <div className="th-review-filter-row" style={{ marginBottom: 10 }}>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'pending' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('pending')}>Pending {ledgerReviewCounts.pending}</button>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'merged' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('merged')}>Merged {ledgerReviewCounts.merged}</button>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'separated' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('separated')}>Separated {ledgerReviewCounts.separated}</button>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'all' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('all')}>All {ledgerReviewCounts.all}</button>
                  </div>
                  {filteredLedgerReviewMatches.length === 0 ? (
                    <div className="th-mini-block">
                      <strong>No items in this view</strong>
                      <p>{peopleReviewFilter === 'pending' ? 'All pending review items are cleared.' : `No ${peopleReviewFilter} review items are visible right now.`}</p>
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
                              {row.needs_person_resolve && <span className="th-person-tag">needs person resolve</span>}
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
        {!isLedgerFile && !pendingAppendReview && preview && previewRecords.length > 0 && (
          <section className="th-section" id="th-review">
            <div className="th-panel">
              <div className="th-panel-head">
                <span><span className="th-layer-badge">09</span> Review {fileClass}</span>
                <span>{preview.summary.rowCount} records · {preview.canonicalModel}</span>
              </div>
              <p className="th-helper">This file was classified as <strong>{fileClass}</strong>. It stays out of the ledger posting flow and is reviewed in its own canonical table.</p>
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
                {supportsDuplicateWorkflow && <button type="button" className={`th-chip th-review-tab${nonLedgerReviewPanel === 'duplicate' ? ' is-active' : ''}`} onClick={() => setNonLedgerReviewPanel('duplicate')}>Duplicate review</button>}
                {supportsHouseholdWorkflow && <button type="button" className={`th-chip th-review-tab${nonLedgerReviewPanel === 'household' ? ' is-active' : ''}`} onClick={() => setNonLedgerReviewPanel('household')}>Household review</button>}
                <button type="button" className={"th-chip th-review-tab" + (nonLedgerReviewPanel === "taxonomy" ? " is-active" : "")} onClick={() => setNonLedgerReviewPanel("taxonomy")}>Taxonomy review</button>
                {supportsHouseholdWorkflow && (
                  <button
                    type="button"
                    className={`th-chip th-review-tab${nonLedgerReviewPanel === 'final' ? ' is-active' : ''}`}
                    onClick={() => setNonLedgerReviewPanel('final')}
                    disabled={!finalReviewReady}
                  >
                    Final review
                  </button>
                )}
              </div>
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
              {supportsDuplicateWorkflow && (nonLedgerReviewPanel === 'duplicate' || nonLedgerReviewPanel === 'household') && (
                <div className="th-grid th-main-grid" style={{ marginBottom: 14 }}>
                  {nonLedgerReviewPanel === 'duplicate' && (
                    <article className="th-panel th-inner-panel">
                      <div className="th-panel-head"><span>Check duplicates</span><span>{personResult ? `${canonicalPeople.length} resolved` : "not run"}</span></div>
                      <p className="th-helper">Run duplicate check before review. Any pending duplicate review blocks the next step.</p>
                      <div className="th-grid th-grid-3" style={{ marginBottom: 10 }}>
                        <div className="th-stat-chip th-band-auto"><strong>{personResult?.autoMergedCount ?? 0}</strong><span>Auto merged</span></div>
                        <div className="th-stat-chip th-band-review"><strong>{pendingPeopleReviews}</strong><span>Pending review</span></div>
                        <div className="th-stat-chip th-band-separate"><strong>{personResult?.separated ?? 0}</strong><span>New records</span></div>
                      </div>
                      <div className="th-action-row">
                        <button type="button" className="th-button th-button-primary" onClick={handleRunPersonResolver} disabled={isRunningPersonResolver || isResettingPeople || isRunningHouseholdResolver}>
                          <Users size={14} /> {isRunningPersonResolver ? 'Running duplicate check…' : personResult ? 'Rerun duplicate check' : 'Run duplicate check'}
                        </button>
                        <button type="button" className="th-button th-button-secondary" onClick={handleResetPeopleState} disabled={(!personResult && !householdResult) || isRunningPersonResolver || isResettingPeople || isRunningHouseholdResolver}>
                          <RefreshCcw size={14} /> {isResettingPeople ? 'Resetting duplicate check…' : 'Reset duplicate check'}
                        </button>
                      </div>
                      {isRunningPersonResolver && (
                        <div className="th-review-loader" style={{ marginTop: 12 }}>
                          <div className="th-review-loader-spinner" aria-hidden="true" />
                          <div>
                            <strong>Running duplicate check</strong>
                            <p>Scoring people records and rebuilding the manual review queue.</p>
                          </div>
                        </div>
                      )}
                    </article>
                  )}
                  {supportsHouseholdWorkflow && nonLedgerReviewPanel === 'household' && (
                    <article className="th-panel th-inner-panel">
                      <div className="th-panel-head"><span>Build households</span><span>{isRunningHouseholdResolver ? 'running' : householdResult ? `${householdResult.households.length} formed` : "blocked"}</span></div>
                      <p className="th-helper">Households unlock only after all duplicate matches are resolved.</p>
                      <div className="th-action-row">
                        <button type="button" className="th-button th-button-primary" onClick={handleRunHouseholdResolver} disabled={!peopleStepReady || isRunningHouseholdResolver}>
                          <Building2 size={14} /> {isRunningHouseholdResolver ? 'Building households…' : 'Build households'}
                        </button>
                      </div>
                      {isRunningHouseholdResolver ? (
                        <div className="th-review-loader" style={{ marginTop: 12 }}>
                          <div className="th-review-loader-spinner" aria-hidden="true" />
                          <div>
                            <strong>Building households</strong>
                            <p>Grouping resolved records into households and preparing the relationship review.</p>
                          </div>
                        </div>
                      ) : !peopleStepReady && (
                        <p className="th-helper">Resolve {pendingPeopleReviews} pending duplicate review{pendingPeopleReviews === 1 ? "" : "s"} to unlock households.</p>
                      )}
                    </article>
                  )}
                </div>
              )}              {supportsHouseholdWorkflow && nonLedgerReviewPanel === 'household' && (
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
                                <div className="th-household-expanded-topline">
                                  <div>
                                    <strong>{view.communication.addressee}</strong>
                                    <p>{view.draft.label} · {view.householdId}</p>
                                  </div>
                                  <span className={`th-status-pill is-${view.status.tone}`}>{view.status.label}</span>
                                </div>
                                {view.alerts.length > 0 && (
                                  <div className="th-household-alert">
                                    <AlertTriangle size={14} />
                                    <span>{view.alerts[0]}</span>
                                  </div>
                                )}
                                <div className="th-household-expanded-meta">
                                  <div className="th-household-expanded-metric is-primary">
                                    <strong>{view.communication.addressee}</strong>
                                    <p>Household label</p>
                                  </div>
                                  <div className="th-household-expanded-metric">
                                    <strong>{view.reporting.householdTotal > 0 ? formatCurrencyAmount(view.reporting.householdTotal) : 'No gifts'}</strong>
                                    <span>Household total</span>
                                  </div>
                                  <div className="th-household-expanded-metric">
                                    <strong>{view.reporting.giftCount}</strong>
                                    <span>Gifts</span>
                                  </div>
                                  <div className="th-household-expanded-metric">
                                    <strong>{view.reporting.yearsGiving || '—'}</strong>
                                    <span>Years giving</span>
                                  </div>
                                  <div className="th-household-expanded-metric">
                                    <strong>{view.communication.primaryLabel}</strong>
                                    <span>Primary</span>
                                  </div>
                                  <div className="th-household-expanded-metric">
                                    <strong>{view.communication.formalSalutation}</strong>
                                    <span>Formal</span>
                                  </div>
                                </div>
                                <div className="th-household-expanded-grid">
                                  <section className="th-mini-block th-household-detail-section">
                                    <strong>Members</strong>
                                    <div className="th-stack" style={{ marginTop: 10 }}>
                                      {view.members.map((member) => (
                                        <div key={member.id} className="th-household-member-row">
                                          <div className="th-household-member-ident">
                                            <span className="th-household-member-avatar">{getPersonInitials(member)}</span>
                                            <div>
                                              <strong>{formatPersonName(member)}</strong>
                                              <p>{member.id}</p>
                                            </div>
                                          </div>
                                          <span>{member.id === view.draft.primaryPersonId ? 'primary' : 'member'}</span>
                                        </div>
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
                                {view.attributionPreview.length > 0 && (
                                  <section className="th-mini-block th-household-detail-section">
                                    <strong>Attribution</strong>
                                    <div className="th-stack" style={{ marginTop: 10 }}>
                                      {view.attributionPreview.map((item) => (
                                        <div key={`${view.householdId}-${item.sourceRowRef}`} className="th-household-attribution-row">
                                          <div>
                                            <strong>{item.label}</strong>
                                            <p>{item.summary}</p>
                                          </div>
                                          <span>{item.amount !== null ? formatCurrencyAmount(item.amount) : '—'}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </section>
                                )}
                                <div className="th-household-expanded-actions">
                                  <button
                                    type="button"
                                    className="th-button th-button-secondary"
                                    onClick={() => {
                                      const firstGroup = ambiguousAttributionGroups.find((group) => group.householdId === view.householdId) ?? null;
                                      setAttributionTableTab('needs_attribution');
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
                                      setNonLedgerReviewPanel('final');
                                      setExpandedFinalHouseholdId(view.householdId);
                                    }}
                                  >
                                    Edit salutation ↗
                                  </button>
                                  <button
                                    type="button"
                                    className="th-button th-button-secondary"
                                    onClick={handleExportPreview}
                                    disabled={!nonLedgerExportReady}
                                  >
                                    Export ↗
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
              {supportsHouseholdWorkflow && nonLedgerReviewPanel === 'final' && (
                <div className="th-stack" style={{ marginBottom: 14 }}>
                  <div className="th-panel th-inner-panel">
                    <div className="th-panel-head">
                      <span>Final relationship review</span>
                      <div className="th-review-match-actions">
                        <span>{householdLayerViews.length} household draft{householdLayerViews.length === 1 ? '' : 's'}</span>
                        <button type="button" className="th-button th-button-primary" onClick={() => void handleApplyFinalHouseholdEdits()} disabled={!finalReviewReady || isLoading}>
                          <Save size={14} /> Apply final edits
                        </button>
                      </div>
                    </div>
                    <p className="th-helper">Edit the final household object before it updates the reviewed preview. Applying this step preserves person identity and writes the household-facing fields back into the saved session.</p>
                    <div className="th-review-match-actions" style={{ marginTop: 10 }}>
                      <button type="button" className="th-button th-button-secondary" onClick={() => void handleRefreshEntityModel(false)} disabled={isRefreshingEntityModel || !finalReviewReady}>
                        <Database size={14} /> {isRefreshingEntityModel ? 'Loading entity model…' : 'Preview persisted model'}
                      </button>
                    </div>
                  </div>
                  {!finalReviewReady ? (
                    <div className="th-mini-block">
                      <strong>Final review unlocks after householding</strong>
                      <p>Run duplicate review, build households, then edit the final relationship layer here before applying it.</p>
                    </div>
                  ) : null}
                  {entityModelResult && (
                    <article className="th-panel th-inner-panel">
                      <div className="th-panel-head">
                        <span>Persisted entity model</span>
                        <span>{entityModelResult.persisted ? 'session-backed' : 'preview only'}</span>
                      </div>
                      <div className="th-grid th-grid-4" style={{ marginBottom: 12 }}>
                        <div className="th-stat-chip th-band-auto"><strong>{entityModelResult.summary.personCount}</strong><span>Persons</span></div>
                        <div className="th-stat-chip th-band-review"><strong>{entityModelResult.summary.householdCount}</strong><span>Households</span></div>
                        <div className="th-stat-chip th-band-separate"><strong>{entityModelResult.summary.donationCount}</strong><span>Donations</span></div>
                        <div className="th-stat-chip"><strong>{entityModelResult.summary.organizationCount}</strong><span>Organizations</span></div>
                      </div>
                      <div className="th-review-match-actions" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                        {entityGraphViews.map((view) => (
                          <button key={`entity-final-${view}`} type="button" className={`th-chip${entityGraphView === view ? ' is-active' : ''}`} onClick={() => setEntityGraphView(view)}>
                            {view}
                          </button>
                        ))}
                        <input
                          className="th-input th-entity-search"
                          placeholder="Filter entity graph…"
                          value={entityGraphSearch}
                          onChange={(event) => setEntityGraphSearch(event.target.value)}
                        />
                        {entityGraphSelection && (
                          <button type="button" className="th-chip is-active" onClick={() => setEntityGraphSelection(null)}>
                            Clear drill-down: {entityGraphSelection.type} {entityGraphSelection.id}
                          </button>
                        )}
                      </div>
                      <div className="th-table-wrap">
                        <EntityGraphTable
                          entityGraphView={entityGraphView}
                          filteredEntityGraphRows={filteredEntityGraphRows}
                          entityGraphSelection={entityGraphSelection}
                          setEntityGraphSelection={setEntityGraphSelection}
                          entityModelResult={entityModelResult}
                          formatPersonName={formatPersonName}
                          formatCurrencyAmount={formatCurrencyAmount}
                        />
                      </div>
                      <EntityGraphEditors
                        variant="final"
                        selectedEntityGraphDonationContext={selectedEntityGraphDonationContext}
                        selectedEntityGraphHouseholdContext={selectedEntityGraphHouseholdContext}
                        selectedEntityGraphPersonContext={selectedEntityGraphPersonContext}
                        selectedEntityGraphOrganizationContext={selectedEntityGraphOrganizationContext}
                        finalReviewReady={finalReviewReady}
                        isLoading={isLoading}
                        formatPersonName={formatPersonName}
                        formatCurrencyAmount={formatCurrencyAmount}
                        previewRecordLabel={previewRecordLabel}
                        summarizeAttributionDraft={summarizeAttributionDraft}
                        getCompactSourceRef={getCompactSourceRef}
                        updateFinalHouseholdDraft={updateFinalHouseholdDraft}
                        updateFinalAttributionDraft={updateFinalAttributionDraft}
                        handleApplyFinalHouseholdEdits={handleApplyFinalHouseholdEdits}
                        assignPersonToHouseholdDraft={assignPersonToHouseholdDraft}
                        setPersonAsHouseholdPrimary={setPersonAsHouseholdPrimary}
                        organizationGraphDraftsSetter={setOrganizationGraphDrafts}
                        updateOrganizationDrafts={updateOrganizationDrafts}
                      />
                    </article>
                  )}
                </div>
              )}
              {supportsDuplicateWorkflow && previewReviewMatches.length > 0 && nonLedgerReviewPanel === 'duplicate' && (
                <div id="th-identity-review-queue" className="th-stack" style={{ marginBottom: 14 }}>
                  <div className="th-panel-head">
                    <span>Duplicate review queue</span>
                    <div className="th-review-match-actions">
                      {mergeablePreviewReviewMatches.length > 0 && (
                        <button type="button" className="th-button th-button-primary" style={{ minHeight: 34 }} onClick={() => void handleMergeAllPeopleReviews(filteredPreviewReviewMatches)} disabled={isLoading}>Merge all shown ({mergeablePreviewReviewMatches.length})</button>
                      )}
                      <span>{filteredPreviewReviewMatches.length} shown</span>
                    </div>
                  </div>
                  <div className="th-review-filter-row">
                    <button type="button" className={`th-chip${peopleReviewFilter === 'pending' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('pending')}>Pending {previewReviewCounts.pending}</button>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'merged' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('merged')}>Merged {previewReviewCounts.merged}</button>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'separated' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('separated')}>Separated {previewReviewCounts.separated}</button>
                    <button type="button" className={`th-chip${peopleReviewFilter === 'all' ? ' is-active' : ''}`} onClick={() => setPeopleReviewFilter('all')}>All {previewReviewCounts.all}</button>
                  </div>
                  {filteredPreviewReviewMatches.length === 0 ? (
                    <div className="th-mini-block">
                      <strong>No items in this view</strong>
                      <p>{peopleReviewFilter === 'pending' ? 'All pending review items are cleared.' : `No ${peopleReviewFilter} review items are visible right now.`}</p>
                    </div>
                  ) : (
                  filteredPreviewReviewMatches.map((match) => {
                    const decision = deriveReviewDecision(match, mergeDecisions);
                    const incomingRecord = previewRecords.find((record) => record.sourceRowRef === match.inputRef) ?? null;
                    const candidateEvidence = match.reviewPayload?.matchedEvidence?.filter(Boolean) ?? [];
                    const matchedRecordRef = match.reviewPayload?.matchedInputRef ?? null;
                    const siblingMatch = !matchedRecordRef && match.matchedPersonId
                      ? (personResult?.matches ?? []).find((candidate) => candidate.inputRef !== match.inputRef && candidate.matchedPersonId === match.matchedPersonId)
                      : null;
                    const matchedPreviewRecord = matchedRecordRef
                      ? previewRecords.find((record) => record.sourceRowRef === matchedRecordRef) ?? null
                      : siblingMatch
                        ? previewRecords.find((record) => record.sourceRowRef === siblingMatch.inputRef) ?? null
                        : null;
                    const matchedPerson = !matchedPreviewRecord && match.matchedPersonId
                      ? canonicalPeople.find((person: CanonicalPerson) => person.id === match.matchedPersonId) ?? null
                      : null;
                    const matchedRecord = matchedPreviewRecord ?? buildMatchedPersonCompareRecord(matchedPerson);
                    const matchedLabel = matchedPreviewRecord
                      ? previewRecordLabel(matchedPreviewRecord)
                      : formatPersonLabel(matchedPerson);
                    const isExpanded = expandedPeopleReviewRef === match.inputRef;
                    if (!matchedRecord) return null;
                    return (
                      <div key={match.inputRef} className="th-guardrail is-warning th-review-match-card" style={{ gap: 14 }}>
                        <div className="th-review-match-head">
                          <div style={{ flex: 1 }}>
                            <strong>{getCompactSourceRef(match.inputRef).primary} ↔ {matchedPreviewRecord ? getCompactSourceRef(matchedRecord.sourceRowRef).primary : 'existing record'}</strong>
                            <p>{incomingRecord ? previewRecordLabel(incomingRecord) : match.inputRef} → {matchedLabel}</p>
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
                              <span className={`th-status ${decision === "confirmed" ? "is-ready" : "is-rejected"}`}>
                                {decision === "confirmed" ? "Merged" : "Separated"}
                              </span>
                            ) : (
                              <div className="th-review-match-actions">
                                <button type="button" className="th-button th-button-primary" style={{ minHeight: 34 }} onClick={() => handleMergeDecision(match, "confirmed")}>Confirm merge</button>
                                <button type="button" className="th-button th-button-secondary" style={{ minHeight: 34 }} onClick={() => handleMergeDecision(match, "separated")}>Keep separate</button>
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
                            <div className="th-mini-block">
                              <strong>Why this was flagged</strong>
                              <p className="th-helper" style={{ padding: 0, marginTop: 8 }}>
                                {candidateEvidence.length > 0
                                  ? candidateEvidence.join(' · ')
                                  : 'No matching evidence was returned for this review item.'}
                              </p>
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
                      <strong>Edit merged result</strong>
                      <span className="th-helper">Representative row {editingMergedRecordRef}</span>
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
                      <button type="button" className="th-button th-button-primary" onClick={() => void handleSaveMergedRecordEdit()}>Save merged result</button>
                      <button type="button" className="th-button th-button-secondary" onClick={() => { setEditingMergedRecordRef(null); setEditingMergedDraft({}); }}>Cancel</button>
                    </div>
                  </div>
                )}
                {householdResult && (
                  <div className="th-review-tab-row" style={{ marginBottom: 14 }}>
                    <button type="button" className={`th-chip th-review-tab${attributionTableTab === 'needs_attribution' ? ' is-active' : ''}`} onClick={() => setAttributionTableTab('needs_attribution')}>
                      Needs attribution {ambiguousAttributionRefs.size}
                    </button>
                    <button type="button" className={`th-chip th-review-tab${attributionTableTab === 'all' ? ' is-active' : ''}`} onClick={() => setAttributionTableTab('all')}>
                      All rows {filteredDisplayedPreviewRecords.length}
                    </button>
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
                      <th className="th-resizable-header">
                        <div className="th-resizable-header-inner">
                          <span>Source</span>
                          <button type="button" className="th-column-resizer" aria-label="Resize Source column" onPointerDown={(event) => startNonLedgerColumnResize('__source__', event)} />
                        </div>
                      </th>
                      {visibleNonLedgerTableHeaders.map((header) => (
                        <th
                          key={header}
                          draggable
                          className={`th-resizable-header${selectedPreviewHeaders.includes(header) ? ' is-selected' : ''}${previewHeaderDropTarget === header ? ' is-drop-target' : ''}`}
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
                            <button type="button" className="th-column-resizer" aria-label={`Resize ${formatPreviewHeaderLabel(header)} column`} onPointerDown={(event) => startNonLedgerColumnResize(header, event)} />
                          </div>
                        </th>
                      ))}
                      {householdResult && (
                        <>
                          <th className="th-resizable-header">
                            <div className="th-resizable-header-inner">
                              <span>Role</span>
                              <button type="button" className="th-column-resizer" aria-label="Resize Role column" onPointerDown={(event) => startNonLedgerColumnResize('__role__', event)} />
                            </div>
                          </th>
                          <th className="th-resizable-header">
                            <div className="th-resizable-header-inner">
                              <span>Attribution type</span>
                              <button type="button" className="th-column-resizer" aria-label="Resize Attribution type column" onPointerDown={(event) => startNonLedgerColumnResize('__attribution_type__', event)} />
                            </div>
                          </th>
                          <th className="th-resizable-header">
                            <div className="th-resizable-header-inner">
                              <span>Credit amount</span>
                              <button type="button" className="th-column-resizer" aria-label="Resize Credit amount column" onPointerDown={(event) => startNonLedgerColumnResize('__credit_amount__', event)} />
                            </div>
                          </th>
                          <th className="th-resizable-header">
                            <div className="th-resizable-header-inner">
                              <span>Household</span>
                              <button type="button" className="th-column-resizer" aria-label="Resize Household column" onPointerDown={(event) => startNonLedgerColumnResize('__household__', event)} />
                            </div>
                          </th>
                          <th className="th-resizable-header">
                            <div className="th-resizable-header-inner">
                              <span>Notes</span>
                              <button type="button" className="th-column-resizer" aria-label="Resize Notes column" onPointerDown={(event) => startNonLedgerColumnResize('__notes__', event)} />
                            </div>
                          </th>
                        </>
                      )}
                      {(fileClass === 'constituent' || fileClass === 'donor') && (
                        <th className="th-resizable-header">
                          <div className="th-resizable-header-inner">
                            <span>Actions</span>
                            <button type="button" className="th-column-resizer" aria-label="Resize Actions column" onPointerDown={(event) => startNonLedgerColumnResize('__actions__', event)} />
                          </div>
                        </th>
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
                            {record.needs_person_resolve && <div className="th-inline-note">needs person resolve</div>}
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
                                {isEditingRow ? (
                                  <select
                                    className="th-table-cell-input"
                                    value={recordRole}
                                    onChange={(event) => updateRecordRole(record, attributionDraft, matchedPerson, assignedHouseholdId, event.target.value as 'primary' | 'secondary' | 'organization' | 'unassigned')}
                                  >
                                    <option value="primary">Primary</option>
                                    <option value="secondary">Secondary</option>
                                    <option value="organization">Organization</option>
                                    <option value="unassigned">Unassigned</option>
                                  </select>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className={`th-role-pill is-${getRoleTone(recordRole)} th-role-pill-button`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        cycleRecordRole(record, attributionDraft, matchedPerson, assignedHouseholdId);
                                      }}
                                      title="Click to change role"
                                    >
                                      {recordRole}
                                    </button>
                                    <div className="th-inline-note">{getBestPersonDisplayLabel(matchedPerson, record)}</div>
                                  </>
                                )}
                              </td>
                              <td>
                                {isEditingRow ? (
                                  <select
                                    className="th-table-cell-input"
                                    value={attributionDraft.mode}
                                    onChange={(event) => updateFinalAttributionDraft(record.sourceRowRef, { mode: event.target.value as PreviewAttributionDraft['mode'] })}
                                  >
                                    <option value="person">Hard credit</option>
                                    <option value="soft_credit">Soft credit</option>
                                    <option value="joint_split">Joint gift</option>
                                    <option value="org_match">Org match</option>
                                  </select>
                                ) : (
                                  <button
                                    type="button"
                                    className={`th-attribution-chip${needsAttributionReview ? ' is-review' : ''} th-attribution-chip-button`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      cycleAttributionMode(record, attributionDraft);
                                    }}
                                    title="Click to change attribution type"
                                  >
                                    {getAttributionTagLabel(attributionDraft.mode, needsAttributionReview)}
                                  </button>
                                )}
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
                                    onChange={(event) => updateFinalAttributionDraft(record.sourceRowRef, { householdId: event.target.value || null })}
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
                          {(fileClass === 'constituent' || fileClass === 'donor') && (
                            <td>
                              {isEditingRow ? (
                                <div className="th-review-match-actions">
                                  <button type="button" className="th-button th-button-primary" style={{ minHeight: 32 }} onClick={() => void handleSaveMergedRecordEdit()}>Save</button>
                                  <button type="button" className="th-button th-button-secondary" style={{ minHeight: 32 }} onClick={() => { setEditingMergedRecordRef(null); setEditingMergedDraft({}); }}>Cancel</button>
                                </div>
                              ) : (
                                <button type="button" className="th-button th-button-secondary" style={{ minHeight: 32 }} onClick={() => startMergedRecordEdit(record)}>Edit row</button>
                              )}
                              {(mergedSourceRefsByRepresentative.get(record.sourceRowRef)?.length ?? 0) > 0 && <div className="th-inline-note">Merged {mergedSourceRefsByRepresentative.get(record.sourceRowRef)?.join(', ')}</div>}
                            </td>
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

        {!isLedgerFile && !pendingAppendReview && preview && previewRecords.length > 0 && (
          <section className="th-section" id="th-export">
            <div className="th-panel">
              <div className="th-panel-head">
                <span><span className="th-layer-badge">10</span> Outputs</span>
              </div>
              <div className="th-grid th-grid-3">
                <article className="th-output-card">
                  <div className="th-card-head"><FileSpreadsheet size={16} /><strong>{fileClass} export</strong></div>
                  <p>Export the class-specific canonical view without forcing this file through the ledger posting flow.</p>
                  {supportsDuplicateWorkflow && !nonLedgerExportReady && (
                    <p className="th-helper">Complete duplicate review and households before export unlocks.</p>
                  )}
                  <button type="button" className="th-button th-button-primary" onClick={handleExportPreview} disabled={!nonLedgerExportReady}>
                    <FileSpreadsheet size={14} /> Export
                  </button>
                </article>
                <article className="th-output-card">
                  <div className="th-card-head"><Database size={16} /><strong>Classifier summary</strong></div>
                  <p>{preview.summary.primaryLabel} · {Object.keys(schema?.fieldMap ?? {}).length} mapped field{Object.keys(schema?.fieldMap ?? {}).length === 1 ? '' : 's'} · {Math.round((schema?.confidence ?? 0) * 100)}% confidence.</p>
                </article>
                <article className="th-output-card">
                  <div className="th-card-head"><Database size={16} /><strong>Entity model</strong></div>
                  <p>Inspect the persisted household, donation, attribution, and relationship graph built from Final review.</p>
                  <button type="button" className="th-button th-button-primary" onClick={() => void handleRefreshEntityModel(false)} disabled={!finalReviewReady || isRefreshingEntityModel}>
                    <Database size={14} /> {isRefreshingEntityModel ? 'Loading…' : 'Inspect'}
                  </button>
                </article>
              </div>
              {entityModelResult && (
                <div className="th-stack" style={{ marginTop: 16 }}>
                  <div className="th-panel-head">
                    <span>Entity model readout</span>
                    <span>{entityModelResult.summary.donationCount} donation node{entityModelResult.summary.donationCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="th-grid th-grid-4">
                    <div className="th-stat-chip th-band-auto"><strong>{entityModelResult.summary.personCount}</strong><span>Persons</span></div>
                    <div className="th-stat-chip th-band-review"><strong>{entityModelResult.summary.householdCount}</strong><span>Households</span></div>
                    <div className="th-stat-chip th-band-separate"><strong>{entityModelResult.summary.organizationCount}</strong><span>Organizations</span></div>
                    <div className="th-stat-chip"><strong>{entityModelResult.attributions.length}</strong><span>Attributions</span></div>
                  </div>
                  <div className="th-review-match-actions" style={{ flexWrap: 'wrap' }}>
                    {entityGraphViews.map((view) => (
                      <button key={`entity-output-${view}`} type="button" className={`th-chip${entityGraphView === view ? ' is-active' : ''}`} onClick={() => setEntityGraphView(view)}>
                        {view}
                      </button>
                    ))}
                    <input
                      className="th-input th-entity-search"
                      placeholder="Filter entity graph…"
                      value={entityGraphSearch}
                      onChange={(event) => setEntityGraphSearch(event.target.value)}
                    />
                    {entityGraphSelection && (
                      <button type="button" className="th-chip is-active" onClick={() => setEntityGraphSelection(null)}>
                        Clear drill-down: {entityGraphSelection.type} {entityGraphSelection.id}
                      </button>
                    )}
                  </div>
                  <div className="th-table-wrap">
                    <EntityGraphTable
                      entityGraphView={entityGraphView}
                      filteredEntityGraphRows={filteredEntityGraphRows}
                      entityGraphSelection={entityGraphSelection}
                      setEntityGraphSelection={setEntityGraphSelection}
                      entityModelResult={entityModelResult}
                      formatPersonName={formatPersonName}
                      formatCurrencyAmount={formatCurrencyAmount}
                      keyPrefix="output-"
                    />
                  </div>
                  <EntityGraphEditors
                    variant="output"
                    selectedEntityGraphDonationContext={selectedEntityGraphDonationContext}
                    selectedEntityGraphHouseholdContext={selectedEntityGraphHouseholdContext}
                    selectedEntityGraphPersonContext={selectedEntityGraphPersonContext}
                    selectedEntityGraphOrganizationContext={selectedEntityGraphOrganizationContext}
                    finalReviewReady={finalReviewReady}
                    isLoading={isLoading}
                    formatPersonName={formatPersonName}
                    formatCurrencyAmount={formatCurrencyAmount}
                    previewRecordLabel={previewRecordLabel}
                    summarizeAttributionDraft={summarizeAttributionDraft}
                    getCompactSourceRef={getCompactSourceRef}
                    updateFinalHouseholdDraft={updateFinalHouseholdDraft}
                    updateFinalAttributionDraft={updateFinalAttributionDraft}
                    handleApplyFinalHouseholdEdits={handleApplyFinalHouseholdEdits}
                    assignPersonToHouseholdDraft={assignPersonToHouseholdDraft}
                    setPersonAsHouseholdPrimary={setPersonAsHouseholdPrimary}
                    organizationGraphDraftsSetter={setOrganizationGraphDrafts}
                    updateOrganizationDrafts={updateOrganizationDrafts}
                  />
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
              <TransformHubAuditModePanel rows={rows} taxonomyResult={taxonomyResult} auditResult={auditResult} activeAction={activeOperatorIntent} onAction={handleOperatorAction} />
              {!auditResult ? (
                <p className="th-helper">
                  Check for donor tag gaps, wrong GL accounts, LYBUNT/SYBUNT, and more.
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
    </div>
  );
}
