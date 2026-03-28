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

export type FileClass = 'ledger' | 'constituent' | 'donor' | 'campaign' | 'coa' | 'unknown';

export type ReportType =
  | 'general-ledger'
  | 'payout-export'
  | 'sales-export'
  | 'ad-spend'
  | 'donation-export'
  | 'crm-export'
  | 'constituent-export'
  | 'donor-export'
  | 'campaign-export'
  | 'chart-of-accounts'
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

export type ConstituentPreviewRecord = {
  id: string;
  sourceRowRef: string;
  displayName: string;
  constituentType: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  householdName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  tags: string[];
  assignedStaff: string;
  createdAt: string;
  updatedAt: string;
  rawValues?: Record<string, string>;
};

export type DonorPreviewRecord = {
  id: string;
  sourceRowRef: string;
  donorName: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  householdName: string;
  date: string;
  amount: string;
  fund: string;
  appeal: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  tags: string[];
  assignedStaff: string;
  memo: string;
  currency: string;
  rawValues?: Record<string, string>;
};

export type CampaignPreviewRecord = {
  id: string;
  sourceRowRef: string;
  code: string;
  campaignName: string;
  startDate: string;
  endDate: string;
  status: string;
  goalAmount: string;
};

export type CoaPreviewRecord = {
  id: string;
  sourceRowRef: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  balance: string;
};

export type UnknownPreviewRecord = {
  id: string;
  sourceRowRef: string;
  preview: string;
  values: Record<string, string>;
};

export type ClassifiedPreview = {
  fileClass: FileClass;
  canonicalModel: string;
  summary: {
    rowCount: number;
    populatedFields: number;
    primaryLabel: string;
  };
  records: Array<
    ConstituentPreviewRecord | DonorPreviewRecord | CampaignPreviewRecord | CoaPreviewRecord | UnknownPreviewRecord
  >;
};

export type ParsedFile = {
  fileName: string;
  delimiter: string;
  headers: string[];
  rows: ParsedSourceRow[];
  platform: SourcePlatform;
  structureAnalysis: StructureAnalysis;
  preview?: ClassifiedPreview;
};

export type SchemaRuleEvidence = {
  source: 'rule';
  key: string;
  value: string | null;
};

export type SchemaFieldSuggestion = {
  id: string;
  rawKey: string;
  cleanedKey: string;
  strippedKey: string;
  canonicalHint: string | null;
  suggestedTarget: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  evidence: string[];
  ruleEvidence: SchemaRuleEvidence[];
  sampleValues: string[];
  model: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt: string | null;
  reviewedBy: string | null;
  notes: string | null;
  generatedAt: string;
};

export type SchemaHeaderDiagnostic = {
  rawKey: string;
  cleanedKey: string;
  strippedKey: string;
  canonicalHint: string | null;
  mappedCanonicalFields: string[];
  status: 'mapped' | 'covered_variant' | 'candidate' | 'unknown';
};

export type ResolvedSchema = {
  reportType: ReportType;
  fileClass: FileClass;
  canonicalModel: string;
  expectedFields: string[];
  confidence: number;
  fieldMap: Partial<
    Record<
      CanonicalFieldKey | 'amount' | 'gl_account' | 'fund' | 'appeal' | 'email' | 'phone' | 'address' | 'constituent_type' | 'first_name' | 'last_name' | 'organization_name' | 'household_name' | 'city' | 'state' | 'postal_code' | 'country' | 'created_at' | 'updated_at' | 'tags' | 'assigned_staff' | 'donor_name' | 'campaign_name' | 'start_date' | 'end_date' | 'status' | 'goal_amount' | 'code' | 'account_type' | 'balance',
      string
    >
  >;
  unresolvedFields: string[];
  fingerprint: string;
  fromTemplateCache: boolean;
  aiSuggested?: boolean;
  aiSuggestedFieldMap?: Record<string, string>;
  aiReasoning?: string | null;
  requiresHumanApproval?: boolean;
  headerDiagnostics?: SchemaHeaderDiagnostic[];
  normalizedFieldAlerts?: SchemaHeaderDiagnostic[];
  fieldSuggestions?: SchemaFieldSuggestion[];
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
  canonical_person_id: string | null;
  canonical_household_id: string | null;
  raw_fund: string | null;
  raw_appeal: string | null;
  taxonomy_exception_id: string | null;
  canonical_org_id: string | null;
  attribution_entry_id: string | null;
  normalized_fund: string | null;
  normalized_appeal: string | null;
  resolution_source?: 'direct' | 'reused_resolved_exception' | null;
};

export type BlockingIssue = {
  code: string;
  severity: 'error';
  scope: 'file' | 'row' | 'field';
  reason: string;
  detail: string;
  rowRef?: string | null;
  column?: string | null;
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

export type TransformSessionStatus = 'blocked' | 'review' | 'ready' | 'posted';

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
  blockingIssues: BlockingIssue[];
  preflight: PreflightResult | null;
  receipts: PostingReceipt[];
  status: TransformSessionStatus;
  forcedFromStatus?: TransformSessionStatus | null;
  forcedBlockingIssuesSnapshot?: BlockingIssue[] | null;
  forcedAt?: string | null;
  personResult?: PersonResolverResult | null;
  householdResult?: HouseholdResolverResult | null;
  auditDecisions?: PersistedMergeDecision[];
};

export type PersonMatchDecision = 'auto' | 'review' | 'new';

export type PersonMatch = {
  inputRef: string;
  score: number;
  band: ConfidenceBand;
  decision: PersonMatchDecision;
  matchedPersonId: string | null;
  matchedFields: string[];
  reviewPayload?: {
    rowRef: string;
    rawValues: Record<string, string> | null;
    matchedInputRef?: string | null;
    input: {
      name: string;
      email: string;
      phone: string;
      address: string;
      zip: string;
      householdName: string;
      city: string;
      state: string;
    };
    matchedEvidence: string[];
    aiSuggestion?: {
      suggestedAction: 'confirm_merge' | 'keep_separate';
      confidence: 'high' | 'medium' | 'low';
      reason: string;
      evidence: string[];
      model: string;
    } | null;
    candidate: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      addressLine1: string;
      city: string;
      state: string;
      zip: string;
    } | null;
  };
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


export type HouseholdReviewSuggestion = {
  id: string;
  proposedMemberIds: string[];
  proposedMembers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    addressLine1: string;
    city: string;
    state: string;
    zip: string;
  }>;
  matchedEvidence: string[];
  aiSuggestion: {
    suggestedAction: 'confirm_merge' | 'keep_separate';
    confidence: 'high' | 'medium' | 'low';
    reason: string;
    evidence: string[];
    model: string;
  } | null;
};

export type PersonResolverResult = {
  persons: CanonicalPerson[];
  canonicalPersons: CanonicalPerson[];
  matches: PersonMatch[];
  autoMatched: number;
  autoMergedCount: number;
  needsReview: number;
  pendingReviewCount: number;
  separated: number;
  updatedRows?: CanonicalLedgerRow[];
  audit?: AuditRuleResult;
};

export type HouseholdResolverResult = {
  households: CanonicalHousehold[];
  ungroupedPersonIds: string[];
  reviewSuggestions?: HouseholdReviewSuggestion[];
  updatedRows?: CanonicalLedgerRow[];
  audit?: AuditRuleResult;
};

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

export type TaxonomyRuleEvidence = {
  source: 'rule';
  key: string;
  value: string | null;
};

export type TaxonomyAiSuggestion = {
  code: string | null;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  model: string;
  generatedAt: string;
  ruleEvidence?: TaxonomyRuleEvidence[];
  sampleValues?: string[];
};

export type TaxonomyException = {
  id: string;
  rawValue: string;
  type: TaxonomyCodeType;
  sourceRowRef: string;
  createdAt: string;
  resolvedCode: string | null;
  resolvedAt: string | null;
  status?: 'open' | 'resolved';
  aiSuggested?: boolean;
  aiReasoning?: string | null;
  aiSuggestion?: TaxonomyAiSuggestion | null;
  aiReviewStatus?: 'pending' | 'approved' | 'rejected' | null;
  aiRejectedReason?: string | null;
  ruleEvidence?: TaxonomyRuleEvidence[];
  sampleValues?: string[];
};

export type TaxonomyViolation = {
  rowRef: string;
  field: string;
  rawValue: string;
  exceptionId?: string | null;
  suggestedCode?: string | null;
  suggestionSource?: 'rule' | 'ai' | null;
  aiSuggested?: boolean;
  aiReviewStatus?: 'pending' | 'approved' | 'rejected' | null;
  aiReasoning?: string | null;
  aiConfidence?: 'high' | 'medium' | 'low' | null;
  aiEvidence?: string[];
  ruleEvidence?: TaxonomyRuleEvidence[];
};

export type TaxonomyGovernanceResult = {
  violations: TaxonomyViolation[];
  exceptions: TaxonomyException[];
  resolvedCount: number;
  unmappedCount: number;
};

export type AuditRuleCatalogEntry = {
  code: string;
  label: string;
  severity: 'error' | 'warning' | 'info';
  version?: number;
  description?: string;
};

export type AuditRuleCatalogResponse = {
  engineVersion: string;
  ruleCatalog: AuditRuleCatalogEntry[];
};

export type AuditRuleFinding = {
  ruleCode: string;
  ruleVersion?: number;
  label: string;
  severity: 'error' | 'warning' | 'info';
  count: number;
  message: string;
  detail?: string;
  rowIds: string[];
};

export type AuditRuleResult = {
  findings: AuditRuleFinding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  generatedAt?: string;
  engineVersion?: string;
  deltaTrend?: string;
  latestPersistedRunId?: string | null;
  delta?: { trend?: string };
  ruleCatalog?: AuditRuleCatalogEntry[];
};

export type DonorReport = {
  generatedAt: string;
  donationCount: number;
  totalDebit: number;
  totalCredit: number;
  persons: CanonicalPerson[];
  households: CanonicalHousehold[];
};

export type AuditDashboard = AuditRuleResult;

export type CampaignPerformanceReport = {
  generatedAt: string;
  campaigns: Array<{
    canonicalCode: string;
    totalRaised: number;
    donationCount: number;
    retentionBucket: string;
  }>;
};

export type CrmSyncExport = {
  generatedAt: string;
  persons: CanonicalPerson[];
  households: CanonicalHousehold[];
  rows: Array<{
    canonical_person_id: string | null;
    canonical_household_id: string | null;
    canonical_org_id: string | null;
    name: string;
    formatted_for: string;
    source_row_ref: string;
  }>;
};
