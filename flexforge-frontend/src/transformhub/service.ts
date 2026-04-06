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
): Promise<{ updatedRows: CanonicalLedgerRow[]; audit?: AuditRuleResult; auditDecisions: PersistedMergeDecision[] }> {
  const response = await api.post<{ updatedRows: CanonicalLedgerRow[]; audit?: AuditRuleResult; auditDecisions: PersistedMergeDecision[] }>('/transformhub/merge-decision', {
    sessionId,
    inputRef,
    action,
    matchedPersonId: matchedPersonId ?? undefined,
    reason,
    confidence,
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
