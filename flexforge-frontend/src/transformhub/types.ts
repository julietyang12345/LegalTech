export type SourcePlatform =
  | 'AppFolio'
  | 'Buildium'
  | 'Shopify'
  | 'Stripe'
  | 'TikTok'
  | 'Bloomerang'
  | 'Salesforce'
  | 'NeonOne'
  | 'GiveButter'
  | 'Xero';

export type ReportType =
  | 'general-ledger'
  | 'payout-export'
  | 'sales-export'
  | 'ad-spend'
  | 'donation-export'
  | 'crm-export'
  | 'unknown';

export type GuardrailCode =
  | 'LOW_REPORT_CONFIDENCE'
  | 'AMOUNT_COLUMN_AMBIGUITY'
  | 'MIXED_AMOUNT_SHAPES'
  | 'UNRESOLVED_KEY_FIELDS'
  | 'UNSTABLE_SUBTOTALS'
  | 'CURRENCY_DATE_CONFLICT'
  | 'TAXONOMY_VIOLATION';

export type GuardrailFinding = {
  code: GuardrailCode;
  label: string;
  triggered: boolean;
  detail: string;
};

export type ParsedSourceRow = {
  ref: string;
  values: Record<string, string>;
};

export type RowRole = 'data' | 'blank' | 'subtotal' | 'footer';

export type StructureAnalysis = {
  headerRowIndex: number;
  skippedTopRows: number;
  removedRows: number;
  rawRowCount: number;
  dataRowCount: number;
  rowRoleSummary: Record<RowRole, number>;
  warnings: string[];
};

export type ParsedFile = {
  fileName: string;
  delimiter: string;
  headers: string[];
  rows: ParsedSourceRow[];
  platform: SourcePlatform;
  structureAnalysis: StructureAnalysis;
};

export type ResolvedSchema = {
  reportType: ReportType;
  confidence: number;
  fieldMap: Partial<
    Record<
      CanonicalFieldKey | 'amount' | 'gl_account' | 'fund' | 'appeal' | 'email' | 'phone' | 'address',
      string
    >
  >;
  unresolvedFields: string[];
  fingerprint: string;
  fromTemplateCache: boolean;
};

export type CanonicalFieldKey =
  | 'date'
  | 'entity_name'
  | 'account_code'
  | 'account_name'
  | 'debit'
  | 'credit'
  | 'currency'
  | 'memo';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export type ConfidenceBand = 'auto' | 'review' | 'separate';

export type CanonicalLedgerRow = {
  id: string;
  date: string;
  entity_name: string;
  account_code: string;
  account_name: string;
  debit: string;
  credit: string;
  currency: string;
  memo: string;
  source_platform: SourcePlatform;
  source_row_ref: string;
  journal_id: string;
  mapping_confidence: number;
  review_status: ReviewStatus;
  needs_review: boolean;
  suggested_fix: string | null;
  qbo_account_id: string | null;
  qbo_txn_id: string | null;
  // Layer 03 + 04 fields
  canonical_person_id: string | null;
  canonical_household_id: string | null;
  raw_fund: string | null;
  raw_appeal: string | null;
  taxonomy_exception_id: string | null;
  // Layer 06 fields
  canonical_org_id: string | null;
  attribution_entry_id: string | null;
  normalized_fund: string | null;
  normalized_appeal: string | null;
};

export type PreflightIssue = {
  rowId?: string;
  journalId?: string;
  severity: 'error' | 'warning';
  message: string;
};

export type PreflightResult = {
  valid: boolean;
  issues: PreflightIssue[];
};

export type PostingReceipt = {
  journalId: string;
  qboTxnId: string;
  idempotencyKey: string;
};

export type TransformSessionStatus = 'review' | 'ready' | 'posted';

export type PersistedMergeDecision = {
  id: string;
  sessionId: string | null;
  rowId: string | null;
  merge: boolean;
  split: boolean;
  taxonomy_map: string | null;
  made_by: string;
  permanent: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TransformSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  parsedFile: ParsedFile;
  schema: ResolvedSchema;
  guardrails: GuardrailFinding[];
  rows: CanonicalLedgerRow[];
  preflight: PreflightResult | null;
  receipts: PostingReceipt[];
  status: TransformSessionStatus;
  auditDecisions?: PersistedMergeDecision[];
};

// ─── Layer 03: Identity + Household Resolution ───────────────────────────────

export type PersonMatchDecision = 'auto' | 'review' | 'new';

export type PersonMatch = {
  inputRef: string;
  score: number;
  band: ConfidenceBand;
  decision: PersonMatchDecision;
  matchedPersonId: string | null;
  matchedFields: string[];
};

export type CanonicalPerson = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  tags: string[];
  lifecycle: string;
  sourceRowRefs: string[];
  createdAt: string;
  updatedAt: string;
};

export type Salutation = 'formal' | 'informal' | 'joint' | 'individual';

export type CanonicalHousehold = {
  id: string;
  lastName: string;
  memberIds: string[];
  primaryAddress: string;
  salutation: Salutation;
  salutationText: string;
  jointGivingTotal: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PersonResolverResult = {
  persons: CanonicalPerson[];
  matches: PersonMatch[];
  autoMatched: number;
  needsReview: number;
  separated: number;
  updatedRows?: CanonicalLedgerRow[];
  audit?: AuditRuleResult;
};

export type HouseholdResolverResult = {
  households: CanonicalHousehold[];
  ungroupedPersonIds: string[];
  updatedRows?: CanonicalLedgerRow[];
  audit?: AuditRuleResult;
};

// ─── Layer 04: Taxonomy Governance ───────────────────────────────────────────

export type TaxonomyCodeType = 'appeal' | 'campaign' | 'fund';

export type TaxonomyCode = {
  code: string;
  label: string;
  type: TaxonomyCodeType;
  requiredFields: string[];
  effectiveFrom: string;
  retiredAt: string | null;
};

export type LegacyMapping = {
  legacyValue: string;
  canonicalCode: string;
  type: TaxonomyCodeType;
};

export type TaxonomyException = {
  id: string;
  rawValue: string;
  type: TaxonomyCodeType;
  sourceRowRef: string;
  createdAt: string;
  resolvedCode: string | null;
  resolvedAt: string | null;
};

export type TaxonomyGovernanceResult = {
  violations: Array<{ rowRef: string; field: string; rawValue: string; suggestedCode: string | null }>;
  exceptions: TaxonomyException[];
  resolvedCount: number;
  unmappedCount: number;
};

// ─── Layer 08: Operational Audit Rules ───────────────────────────────────────

export type AuditRuleCode =
  | 'MONTHLY_DONOR_TAG_GAP'
  | 'LAPSED_MONTHLY_DONOR'
  | 'DOWNGRADE_RISK'
  | 'MAJOR_GIFT_NO_DD'
  | 'SPLIT_DD_ACROSS_HOUSEHOLD'
  | 'WRONG_GL_ACCOUNT'
  | 'WORKPLACE_GIFT_NO_EMPLOYER'
  | 'UNMATCHED_MATCHING_GIFT'
  | 'CAMPAIGN_VS_GOAL'
  | 'UNKNOWN_APPEAL_CODE'
  | 'LYBUNT_SYBUNT'
  | 'AUTO_RERUN';

export type AuditRuleFinding = {
  ruleCode: AuditRuleCode;
  label: string;
  severity: 'error' | 'warning' | 'info';
  rowIds: string[];
  count: number;
  message: string;
  detail: string;
  ruleVersion?: number;
};

export type AuditRuleCatalogEntry = {
  code: AuditRuleCode;
  label: string;
  severity: 'error' | 'warning' | 'info';
  version: number;
  description: string;
};

export type AuditDelta = {
  trend: string;
  newFindings: string[];
  resolvedFindings: string[];
  issueCountChange?: number;
  errorCountChange?: number;
  warningCountChange?: number;
};

export type AuditRuleResult = {
  findings: AuditRuleFinding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  totalIssues: number;
  engineVersion?: string;
  ruleCatalog?: AuditRuleCatalogEntry[];
  delta?: AuditDelta;
  deltaTrend?: string;
  latestPersistedRunId?: string | null;
  generatedAt?: string;
};


export type AuditRuleCatalogResponse = {
  engineVersion: string;
  ruleCatalog: AuditRuleCatalogEntry[];
};

// ─── Layer 10: Outputs ────────────────────────────────────────────────────────

export type DonorReport = {
  persons: CanonicalPerson[];
  households: CanonicalHousehold[];
  donationCount: number;
  totalDebit: number;
  totalCredit: number;
  generatedAt: string;
};

export type AuditDashboard = AuditRuleResult & {
  deltaTrend: string;
  generatedAt: string;
};

export type CampaignPerformanceReportItem = {
  canonicalCode: string;
  totalRaised: number;
  donationCount: number;
  retentionBucket: string;
};

export type CampaignPerformanceReport = {
  campaigns: CampaignPerformanceReportItem[];
  generatedAt: string;
};

export type CrmSyncExportRow = {
  canonical_person_id: string | null;
  canonical_household_id: string | null;
  canonical_org_id: string | null;
  name: string;
  formatted_for: string;
  source_row_ref: string;
};

export type CrmSyncExport = {
  persons: CanonicalPerson[];
  households: CanonicalHousehold[];
  rows: CrmSyncExportRow[];
  generatedAt: string;
};
