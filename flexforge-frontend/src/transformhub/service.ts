import api from '@/services/api';
import type {
  AuditDashboard,
  AuditRuleCatalogResponse,
  AuditRuleResult,
  CampaignPerformanceReport,
  CanonicalHousehold,
  CanonicalLedgerRow,
  CanonicalPerson,
  CrmSyncExport,
  DonorReport,
  EntityModelResult,
  BlockingIssue,
  GuardrailFinding,
  HouseholdResolverResult,
  LegacyMapping,
  ParsedFile,
  SessionTaxonomyState,
  PersonResolverResult,
  PostingReceipt,
  PreflightResult,
  PreviewRecord,
  TaxonomyException,
  ResolvedSchema,
  SourcePlatform,
  TaxonomyCode,
  TaxonomyGovernanceResult,
  PersistedMergeDecision,
  TransformSession,
  TransformSessionStatus,
} from './types';

type IngestPayload = {
  platform: SourcePlatform;
  fileName: string;
  kind: 'text' | 'xlsx';
  contents?: string;
  contentsBase64?: string;
  sessionId?: string;
  forceIngest?: boolean;
  selectedWorkbookSheets?: string[];
};

type IngestResponse = {
  sessionId: string | null;
  parsedFile: ParsedFile;
  schema: ResolvedSchema | null;
  status: TransformSessionStatus;
  guardrails: GuardrailFinding[];
  blockingIssues: BlockingIssue[];
  rows: CanonicalLedgerRow[];
  taxonomy?: TaxonomyGovernanceResult;
  audit?: AuditRuleResult;
};

type PostResponse = {
  rows: CanonicalLedgerRow[];
  receipts: PostingReceipt[];
  preflight: PreflightResult;
  audit?: AuditRuleResult;
};

type SampleResponse = {
  name: string;
  contents: string;
};

type ChartOfAccountsResponse = {
  chartOfAccounts: Array<{ id: string; code: string; name: string }>;
};

type TaxonomyResponse = {
  registry: TaxonomyCode[];
  legacyMappings: LegacyMapping[];
};

type CsvFallbackResponse = {
  fileName: string;
  csv: string;
  rowCount: number;
  preflight: PreflightResult;
  audit?: AuditRuleResult;
};

type ShareLinkResponse = {
  token: string;
  shareUrl: string;
  expiresAt: string;
};

type SharedSessionResponse = {
  expiresAt: string;
};

export async function fetchSample(platform: SourcePlatform): Promise<SampleResponse> {
  const response = await api.get<SampleResponse>('/transformhub/sample', { params: { platform } });
  return response.data;
}

export async function fetchChartOfAccounts(): Promise<ChartOfAccountsResponse['chartOfAccounts']> {
  const response = await api.get<ChartOfAccountsResponse>('/transformhub/chart-of-accounts');
  return response.data.chartOfAccounts;
}

export async function fetchTaxonomy(): Promise<TaxonomyResponse> {
  const response = await api.get<TaxonomyResponse>('/transformhub/taxonomy');
  return response.data;
}

export async function ingestFile(payload: IngestPayload): Promise<IngestResponse> {
  const response = await api.post<IngestResponse>('/transformhub/ingest', payload);
  return response.data;
}

export async function runBackendPreflight(rows: CanonicalLedgerRow[], sessionId?: string): Promise<PreflightResult & { audit?: AuditRuleResult }> {
  const response = await api.post<PreflightResult & { audit?: AuditRuleResult }>('/transformhub/preflight', { rows, sessionId });
  return response.data;
}

export async function simulateBackendPost(rows: CanonicalLedgerRow[], sessionId?: string): Promise<PostResponse> {
  const response = await api.post<PostResponse>('/transformhub/post-simulate', { rows, sessionId });
  return response.data;
}

export async function fetchSession(sessionId: string): Promise<TransformSession> {
  const response = await api.get<TransformSession>(`/transformhub/session/${sessionId}`);
  return response.data;
}

export async function createSessionShareLink(sessionId: string): Promise<ShareLinkResponse> {
  const response = await api.post<ShareLinkResponse>(`/transformhub/session/${sessionId}/share-link`);
  return response.data;
}

export async function fetchSharedSession(token: string): Promise<SharedSessionResponse> {
  const response = await api.get<SharedSessionResponse>(`/transformhub/share/${token}`);
  return response.data;
}

export async function saveSession(
  sessionId: string,
  rows: CanonicalLedgerRow[],
  status: TransformSessionStatus,
  preflight: PreflightResult | null,
  personResult?: PersonResolverResult | null,
  householdResult?: HouseholdResolverResult | null,
  parsedFile?: ParsedFile | null,
  schema?: ResolvedSchema | null,
  taxonomyState?: SessionTaxonomyState | null,
  reviewAction?: Record<string, unknown> | null,
): Promise<TransformSession> {
  const response = await api.put<TransformSession>(`/transformhub/session/${sessionId}`, {
    rows,
    status,
    preflight,
    personResult,
    householdResult,
    parsedFile,
    schema,
    taxonomyState,
    reviewAction,
  });
  return response.data;
}

export async function exportCsvFallback(rows: CanonicalLedgerRow[], sessionId?: string): Promise<CsvFallbackResponse> {
  const response = await api.post<CsvFallbackResponse>('/transformhub/csv-fallback', { rows, sessionId });
  return response.data;
}

// Layer 03

export async function resolvePersonsBackend(
  rows: CanonicalLedgerRow[],
  existingPersons?: CanonicalPerson[],
  sessionId?: string,
  options: { usePersistentIdentityMemory?: boolean; forceReviewOnAutoMatches?: boolean; seedExistingPersonsFromDb?: boolean; baselinePlatform?: string; baselineFileClass?: string; matchMode?: string; persistIdentityMemory?: boolean; includeAiSuggestions?: boolean } = {},
): Promise<PersonResolverResult> {
  const response = await api.post<PersonResolverResult>('/transformhub/person-resolve', {
    rows,
    existingPersons,
    sessionId,
    ...options,
  });
  return response.data;
}

export async function resolveHouseholdsBackend(
  persons: CanonicalPerson[],
  sessionId?: string,
): Promise<HouseholdResolverResult> {
  const response = await api.post<HouseholdResolverResult>('/transformhub/household-resolve', { persons, sessionId });
  return response.data;
}

export async function persistMergeDecisionBackend(
  sessionId: string,
  inputRef: string,
  action: 'confirmed' | 'separated',
  matchedPersonId?: string | null,
  reason?: string,
  confidence?: number,
  entityName?: string,
  inputKey?: string | null,
): Promise<{ updatedRows: CanonicalLedgerRow[]; audit?: AuditRuleResult; auditDecisions: PersistedMergeDecision[] }> {
  const response = await api.post<{ updatedRows: CanonicalLedgerRow[]; audit?: AuditRuleResult; auditDecisions: PersistedMergeDecision[] }>('/transformhub/merge-decision', {
    sessionId,
    inputRef,
    action,
    matchedPersonId: matchedPersonId ?? undefined,
    reason,
    confidence,
    entityName,
    inputKey,
  });
  return response.data;
}

// Layer 04

export async function evaluateTaxonomyBackend(
  rows: CanonicalLedgerRow[],
  sessionId?: string,
): Promise<TaxonomyGovernanceResult> {
  const response = await api.post<TaxonomyGovernanceResult>('/transformhub/taxonomy-evaluate', { rows, sessionId });
  return response.data;
}

export async function suggestTaxonomyGroupsBackend(
  values: Array<{ id: string; rawValue: string; objectType: string }>,
): Promise<Array<{ memberIds: string[]; confidence: 'high' | 'medium' | 'low' }>> {
  if (values.length < 2) return [];
  try {
    const response = await api.post<{ groups: Array<{ memberIds: string[]; confidence: 'high' | 'medium' | 'low' }> }>(
      '/transformhub/taxonomy-group-suggest',
      { values },
    );
    return response.data.groups ?? [];
  } catch {
    return [];
  }
}

export async function reviewFieldSuggestionBackend(
  sessionId: string,
  suggestionId: string,
  action: 'approve' | 'reject',
  payload: { reviewedBy?: string; notes?: string } = {},
): Promise<{ session: TransformSession; schema: ResolvedSchema; updatedRows: CanonicalLedgerRow[]; taxonomy?: TaxonomyGovernanceResult | null; audit?: AuditRuleResult | null }> {
  const response = await api.post<{ session: TransformSession; schema: ResolvedSchema; updatedRows: CanonicalLedgerRow[]; taxonomy?: TaxonomyGovernanceResult | null; audit?: AuditRuleResult | null }>(
    '/transformhub/session/' + sessionId + '/field-suggestions/' + suggestionId + '/review',
    {
      action,
      ...payload,
    },
  );
  return response.data;
}

export async function reviewTaxonomySuggestionBackend(
  exceptionId: string,
  action: 'approve' | 'reject',
  payload: { resolvedCode?: string; notes?: string; reviewedBy?: string } = {},
): Promise<{ exception: TaxonomyException; updatedRows: CanonicalLedgerRow[]; audit?: AuditRuleResult | null }> {
  const response = await api.post<{ exception: TaxonomyException; updatedRows: CanonicalLedgerRow[]; audit?: AuditRuleResult | null }>(
    "/transformhub/taxonomy-exceptions/" + exceptionId + "/review",
    {
      action,
      ...payload,
    },
  );
  return response.data;
}

// Layer 08

export async function runAuditRulesBackend(
  rows: CanonicalLedgerRow[],
  sessionId?: string,
): Promise<AuditRuleResult> {
  const response = await api.post<AuditRuleResult>('/transformhub/audit-rules', { rows, sessionId });
  return response.data;
}

export async function fetchAuditRuleCatalog(): Promise<AuditRuleCatalogResponse> {
  const response = await api.get<AuditRuleCatalogResponse>('/transformhub/audit-rules/catalog');
  return response.data;
}

// Layer 10

export async function fetchDonorReport(
  rows: CanonicalLedgerRow[],
  persons: CanonicalPerson[] = [],
  households: CanonicalHousehold[] = [],
  previewRecords: PreviewRecord[] = [],
): Promise<DonorReport> {
  const response = await api.post<DonorReport>('/transformhub/donor-report', { rows, persons, households, previewRecords });
  return response.data;
}

export async function fetchAuditDashboard(
  rows: CanonicalLedgerRow[],
  sessionId?: string,
): Promise<AuditDashboard> {
  const response = await api.post<AuditDashboard>('/transformhub/audit-dashboard', { rows, sessionId });
  return response.data;
}

export async function fetchCampaignPerformanceReport(rows: CanonicalLedgerRow[]): Promise<CampaignPerformanceReport> {
  const response = await api.post<CampaignPerformanceReport>('/transformhub/campaign-performance-report', { rows });
  return response.data;
}

export async function fetchCrmSyncExport(
  rows: CanonicalLedgerRow[],
  persons: CanonicalPerson[] = [],
  households: CanonicalHousehold[] = [],
  previewRecords: PreviewRecord[] = [],
): Promise<CrmSyncExport> {
  const response = await api.post<CrmSyncExport>('/transformhub/crm-sync-export', { rows, persons, households, previewRecords });
  return response.data;
}

export async function fetchReviewAnalytics(
  rows: CanonicalLedgerRow[],
  persons: CanonicalPerson[] = [],
  households: CanonicalHousehold[] = [],
  previewRecords: PreviewRecord[] = [],
  taxonomyState?: SessionTaxonomyState | null,
  finalAttributionDrafts?: Record<string, unknown>,
  fileClass?: string,
  sessionId?: string,
  postReviewReady?: boolean,
): Promise<{ generatedAt: string; cards: any[]; items: any[]; suggestedViews: any[]; provenance?: any }> {
  const response = await api.post<{ generatedAt: string; cards: any[]; items: any[]; suggestedViews: any[]; provenance?: any }>('/transformhub/review-analytics', {
    rows,
    persons,
    households,
    previewRecords,
    taxonomyState,
    finalAttributionDrafts,
    fileClass,
    sessionId,
    postReviewReady,
  });
  return response.data;
}

// ─── Applied automatically ────────────────────────────────────────────────────

export type AppliedDecision = {
  id: string;
  inputKey: string | null;
  matchedPersonId: string | null;
  merge: boolean;
  split: boolean;
  permanent: boolean;
  disabled: boolean;
  made_by: string;
  createdAt: string;
  updatedAt: string;
};

export type AppliedDecisionsResponse = {
  decisions: AppliedDecision[];
  total: number;
  page: number;
  pageSize: number;
};

export async function fetchAppliedDecisions(params?: { page?: number; pageSize?: number }): Promise<AppliedDecisionsResponse> {
  const response = await api.get<AppliedDecisionsResponse>('/transformhub/applied-decisions', { params });
  return response.data;
}

export async function toggleAppliedDecision(id: string): Promise<AppliedDecision> {
  const response = await api.put<AppliedDecision>(`/transformhub/applied-decisions/${id}/toggle`);
  return response.data;
}

// ─── Identity Hub ────────────────────────────────────────────────────────────

export type IdentityPerson = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  tags: string[];
  lifecycle: string;
  sourcePlatform: string | null;
  sourceFileClass: string | null;
  fingerprints: string[];
  isSuspicious: boolean;
  suspiciousReasons: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type IdentityProfile = {
  person: IdentityPerson;
  decisions: Array<{
    id: string;
    inputKey: string | null;
    matchedPersonId: string | null;
    merge: boolean;
    split: boolean;
    made_by: string;
    permanent: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  donations: Array<{
    id: string;
    amount: number;
    date: string | null;
    fund: string | null;
    appeal: string | null;
    attribution_type: string;
  }>;
  households: Array<{
    id: string;
    lastName: string | null;
    memberIds: string[];
    jointGivingTotal: number;
  }>;
  isSuspicious: boolean;
  suspiciousReasons: string[];
  openQueueItems: ReviewQueueItem[];
  crosswalk: Array<{
    id: string;
    platform: string;
    fileClass: string | null;
    rawKey: string | null;
    totalGiving: number;
    donationCount: number;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
  }>;
  totalGiving: number;
  sourcePlatforms: string[];
  donationCount: number;
};

export type IdentityListResponse = {
  persons: IdentityPerson[];
  total: number;
  page: number;
  pageSize: number;
};

export async function fetchIdentityHubPersons(params?: { q?: string; page?: number; pageSize?: number }): Promise<IdentityListResponse> {
  const response = await api.get<IdentityListResponse>('/transformhub/identity-hub/persons', { params });
  return response.data;
}

export async function fetchIdentityHubProfile(personId: string): Promise<IdentityProfile> {
  const response = await api.get<IdentityProfile>(`/transformhub/identity-hub/persons/${personId}`);
  return response.data;
}

// ─── Review Queue ────────────────────────────────────────────────────────────

export type ReviewQueueItem = {
  id: string;
  inputKey: string | null;
  candidatePersonId: string | null;
  score: number;
  isHighConfidence: boolean;
  isDriftAlert: boolean;
  displayNameA: string | null;
  displayNameB: string | null;
  evidenceFields: string[] | null;
  status: 'pending' | 'approved' | 'kept_separate';
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  source?: 'decision_log' | 'legacy_queue';
  decisionType?: string;
  decisionMode?: string;
  actorType?: string;
  targetType?: string | null;
  targetId?: string | null;
  confidence?: number | null;
};

export type ReviewQueueResponse = {
  items: ReviewQueueItem[];
  totalPending: number;
  batchedCount: number;
};

export type ReviewQueueSummary = {
  pendingCount: number;
  highConfidenceCount: number;
  driftAlertCount: number;
};

export async function fetchReviewQueue(): Promise<ReviewQueueResponse> {
  const response = await api.get<ReviewQueueResponse>('/transformhub/review-queue');
  return response.data;
}

export async function fetchReviewQueueSummary(): Promise<ReviewQueueSummary> {
  const response = await api.get<ReviewQueueSummary>('/transformhub/review-queue/summary');
  return response.data;
}

export async function resolveReviewQueueItem(
  id: string,
  action: 'approved' | 'kept_separate',
): Promise<ReviewQueueItem> {
  const response = await api.post<ReviewQueueItem>(`/transformhub/review-queue/${id}/resolve`, { action });
  return response.data;
}

export async function fetchEntityModel(
  rows: CanonicalLedgerRow[],
  persons: CanonicalPerson[] = [],
  households: CanonicalHousehold[] = [],
  previewRecords: PreviewRecord[] = [],
  sessionId?: string,
  persist = false,
): Promise<EntityModelResult> {
  const response = await api.post<EntityModelResult>('/transformhub/entity-model', {
    rows,
    existingPersons: persons,
    households,
    previewRecords,
    sessionId,
    persist,
  });
  return response.data;
}
