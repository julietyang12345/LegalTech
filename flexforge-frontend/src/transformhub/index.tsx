import { startTransition, type ChangeEvent, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FolderTree,
  PlayCircle,
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
  reviewFieldSuggestionBackend,
  reviewTaxonomySuggestionBackend,
  fetchAuditDashboard,
  fetchAuditRuleCatalog,
  fetchCampaignPerformanceReport,
  fetchChartOfAccounts,
  fetchCrmSyncExport,
  fetchDonorReport,
  fetchSample,
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
  CampaignPerformanceReport,
  CanonicalHousehold,
  CanonicalLedgerRow,
  CanonicalPerson,
  CrmSyncExport,
  DonorReport,
  GuardrailFinding,
  HouseholdResolverResult,
  HouseholdReviewSuggestion,
  LegacyMapping,
  ParsedFile,
  PersonMatch,
  PersonResolverResult,
  PostingReceipt,
  PreflightResult,
  ResolvedSchema,
  SourcePlatform,
  TaxonomyCode,
  TaxonomyGovernanceResult,
  TransformSession,
  TransformSessionStatus,
} from './types';
import { TransformHubAuditModePanel, TransformHubMappingLayerPanel } from './product-panels';


const PLATFORM_GROUPS: Record<string, SourcePlatform[]> = {
  'Accounting': ['AppFolio', 'Buildium', 'Xero'],
  'Commerce': ['Shopify', 'Stripe', 'TikTok'],
  'CRM': ['Bloomerang', 'Salesforce', 'NeonOne'],
  'Donation': ['GiveButter'],
};

const CRM_PLATFORMS = new Set<SourcePlatform>(['Bloomerang', 'Salesforce', 'NeonOne', 'GiveButter']);

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
  const [message, setMessage] = useState<string>('Load a sample or upload CSV/XLSX to run the backend-backed pipeline.');
  const [fallbackFileName, setFallbackFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [blockingIssues, setBlockingIssues] = useState<any[]>([]);
  const [pendingIngestPayload, setPendingIngestPayload] = useState<any | null>(null);

  // Layer 03 state
  const [personResult, setPersonResult] = useState<PersonResolverResult | null>(null);
  const [householdResult, setHouseholdResult] = useState<HouseholdResolverResult | null>(null);
  // merge decisions: map of inputRef → 'confirmed' | 'separated'
  const [mergeDecisions, setMergeDecisions] = useState<Map<string, 'confirmed' | 'separated'>>(new Map());

  // Layer 04 state
  const [taxonomyResult, setTaxonomyResult] = useState<TaxonomyGovernanceResult | null>(null);
  const [registry, setRegistry] = useState<TaxonomyCode[]>([]);
  const [legacyMap, setLegacyMap] = useState<LegacyMapping[]>([]);
  const [, setCoa] = useState<Array<{ id: string; code: string; name: string }>>([]);

  // Layer 08 state
  const [auditResult, setAuditResult] = useState<AuditRuleResult | null>(null);
  const [auditCatalog, setAuditCatalog] = useState<AuditRuleCatalogEntry[]>([]);
  const [auditEngineVersion, setAuditEngineVersion] = useState<string | null>(null);
  const [rowSpotlight, setRowSpotlight] = useState<'all' | 'donor-review' | 'identity-review' | 'mapping-review'>('all');
  const [activeOperatorIntent, setActiveOperatorIntent] = useState<'run-audit' | 'review-donors' | 'resolve-identities' | 'open-mapping' | null>(null);
  const [pendingReturnRowId, setPendingReturnRowId] = useState<string | null>(null);

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
  const fileClass = schema?.fileClass ?? preview?.fileClass ?? 'ledger';
  const isLedgerFile = fileClass === 'ledger';
  const previewRecords = preview?.records ?? [];
  const previewCount = preview?.summary.rowCount ?? parsedFile?.rows.length ?? 0;
  const isConstituentFile = fileClass === "constituent";
  const isDonorFile = fileClass === "donor";
  const supportsIdentityWorkflow = isConstituentFile || isDonorFile;
  const canonicalPersons = personResult?.canonicalPersons ?? personResult?.persons ?? [];
  const resolvedReviewDecisions = personResult?.matches.filter((match) => deriveReviewDecision(match, mergeDecisions)).length ?? 0;
  const pendingPeopleReviews = Math.max(0, (personResult?.pendingReviewCount ?? personResult?.needsReview ?? 0) - resolvedReviewDecisions);
  const peopleStepReady = !supportsIdentityWorkflow || (!!personResult && pendingPeopleReviews === 0);
  const householdsStepReady = !supportsIdentityWorkflow || (!!householdResult && peopleStepReady);
  const nonLedgerExportReady = !supportsIdentityWorkflow || householdsStepReady;
  const heroTitle = isLedgerFile ? 'Canonical ledger in the center.' : 'Canonical records in the center.';
  const heroSummary = isLedgerFile
    ? 'Everything flows into one final ledger, and every export flows back out from the same reviewed rows.'
    : 'Each upload is classified first, normalized into its own canonical model, and reviewed in a file-specific table before export.';



  function applySession(session: TransformSession, nextMessage?: string) {
    startTransition(() => {
      setSessionId(session.id);
      setSessionStatus(session.status);
      setSessionUpdatedAt(session.updatedAt);
      setParsedFile(session.parsedFile);
      setPlatform(session.parsedFile.platform);
      setSchema(session.schema);
      setGuardrails(session.guardrails);
      setBlockingIssues(session.blockingIssues ?? []);
      setRows(session.rows);
      setPreflight(session.preflight);
      setReceipts(session.receipts);
      setPersonResult(session.personResult ?? null);
      setHouseholdResult(session.householdResult ?? null);
      setMergeDecisions(buildMergeDecisionMap(session.rows, session.auditDecisions));
      setActiveOperatorIntent(null);
      if (nextMessage) setMessage(nextMessage);
    });
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
      focusReviewQueue('identity-review', 'Spotlighting rows that still need identity ownership resolution.');
      return;
    }

    setRowSpotlight('mapping-review');
    setActiveOperatorIntent('open-mapping');
    setMessage('Jumped to mapping layer and taxonomy exceptions for reconciliation.');
    jumpToSection('th-mapping-layer');
    scrollToSelector('#th-mapping-layer .th-map-rule, #th-mapping-layer .th-map-row');
  }

  async function hydrateUpload(payload: { fileName: string; kind: 'text' | 'xlsx'; contents?: string; contentsBase64?: string }, forceIngest = false) {
    setIsLoading(true);
    setBlockingIssues([]);
    setReceipts([]);
    setPreflight(null);
    setFallbackFileName(null);
    setPersonResult(null);
    setHouseholdResult(null);
    setTaxonomyResult(null);
    setAuditResult(null);
    setMergeDecisions(new Map());

    try {
      const result = await ingestFile({ platform, fileName: payload.fileName, kind: payload.kind, contents: payload.contents, contentsBase64: payload.contentsBase64, sessionId: forceIngest ? sessionId ?? undefined : undefined, forceIngest });
      const nextStatus = result.status;
      const nextTaxonomy = result.taxonomy ?? null;
      const nextAudit = result.audit ?? null;

      startTransition(() => {
        setSessionId(result.sessionId);
        setSessionStatus(nextStatus);
        setSessionUpdatedAt(new Date().toISOString());
        setParsedFile(result.parsedFile);
        setSchema(result.schema);
        setGuardrails(result.guardrails);
        setBlockingIssues(result.blockingIssues ?? []);
        setRows(result.rows);
        setTaxonomyResult(nextTaxonomy);
        setAuditResult(nextAudit);
        setPendingIngestPayload(result.status === 'blocked' ? payload : null);
        setMessage(result.status === 'blocked'
          ? `Blocked by ${result.blockingIssues.length} blocking issue${result.blockingIssues.length === 1 ? '' : 's'}. Review the report below, then force continue if intentional.`
          : `Loaded ${result.parsedFile.rows.length} rows · ${nextAudit?.errorCount ?? 0} audit error(s) · ${nextTaxonomy?.unmappedCount ?? 0} taxonomy exception(s).`);
      });
    } catch (error: any) {
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
      setIsLoading(false);
    }
  }

  async function handleForceIngest() {
    if (!pendingIngestPayload || !sessionId) return;
    await hydrateUpload(pendingIngestPayload, true);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.xlsx')) {
        const contentsBase64 = await readFileBase64(file);
        await hydrateUpload({ fileName: file.name, kind: 'xlsx', contentsBase64 });
      } else if (lowerName.endsWith('.xls')) {
        setMessage('Legacy .xls files are not supported. Save as .xlsx or CSV first.');
      } else {
        const contents = await readFileText(file);
        await hydrateUpload({ fileName: file.name, kind: 'text', contents });
      }
    } finally {
      event.target.value = '';
    }
  }

  async function loadSample() {
    setIsLoading(true);
    try {
      const sample = await fetchSample(platform);
      await hydrateUpload({ fileName: sample.name, kind: 'text', contents: sample.contents });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load the sample file.');
      setIsLoading(false);
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
      const session = await saveSession(sessionId, rows, nextStatus, preflight, personResult, householdResult);
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
  async function handleReviewFieldSuggestion(suggestionId: string, action: 'approve' | 'reject') {
    if (!sessionId) return;
    setIsLoading(true);
    setMessage(action === 'approve' ? 'Applying AI field suggestion…' : 'Rejecting AI field suggestion…');
    try {
      const result = await reviewFieldSuggestionBackend(sessionId, suggestionId, action, { reviewedBy: 'user' });
      setSchema(result.schema ?? result.session.schema);
      setRows(result.updatedRows?.length ? result.updatedRows : result.session.rows ?? []);
      if (result.taxonomy) setTaxonomyResult(result.taxonomy);
      if (result.audit) setAuditResult(result.audit);
      setSessionUpdatedAt(result.session.updatedAt ?? null);
      setMessage(action === 'approve' ? 'AI field suggestion applied.' : 'AI field suggestion rejected.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to review field suggestion.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRunPersonResolver() {
    const returnRowId = activeFixRowId;
    queueReturnToActiveRow();
    setIsLoading(true);
    try {
      if (!isLedgerFile && supportsIdentityWorkflow) {
        const result = await resolvePersonsBackend(buildPreviewIdentityRows(), undefined, sessionId ?? undefined, {
          usePersistentIdentityMemory: true,
          forceReviewOnAutoMatches: true,
          seedExistingPersonsFromDb: true,
          baselinePlatform: platform,
          baselineFileClass: fileClass,
        });
        setPersonResult(result);
        setHouseholdResult(null);
        setMergeDecisions(new Map());
        setSessionUpdatedAt(new Date().toISOString());
        setMessage(`PersonResolver: ${result.autoMergedCount} auto-merged, ${result.pendingReviewCount} pending review, ${result.separated} new.`);
        restoreReturnRowFocus(returnRowId);
        return;
      }

      const result = await resolvePersonsBackend(rows, personResult ? canonicalPersons : undefined, sessionId ?? undefined, {
        usePersistentIdentityMemory: Boolean(sessionId),
        forceReviewOnAutoMatches: false,
        seedExistingPersonsFromDb: Boolean(sessionId) && !personResult,
        baselinePlatform: platform,
        baselineFileClass: fileClass,
      });
      setPersonResult(result);
      if (result.updatedRows) setRows(result.updatedRows);
      if (result.audit) setAuditResult(result.audit);
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(`PersonResolver: ${result.autoMatched} auto-matched, ${result.needsReview} need review, ${result.separated} new.`);
      restoreReturnRowFocus(returnRowId);
    } catch (error) {
      setPendingReturnRowId(null);
      setMessage(error instanceof Error ? error.message : "PersonResolver failed.");
    } finally {
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
      setMessage('People and household state cleared. Run PersonResolver to rebuild from source rows.');
      return;
    }

    setIsLoading(true);
    try {
      const session = await saveSession(sessionId, rows, nextStatus, preflight, null, null);
      applySession(session, 'People and household state cleared. Run PersonResolver to rebuild from source rows.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to reset people state.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRunHouseholdResolver() {
    if (!personResult) return;
    if (!isLedgerFile && supportsIdentityWorkflow && pendingPeopleReviews > 0) {
      setMessage(`Resolve ${pendingPeopleReviews} pending people match${pendingPeopleReviews === 1 ? "" : "es"} before continuing to households.`);
      return;
    }

    setIsLoading(true);
    try {
      const result = await resolveHouseholdsBackend(canonicalPersons, sessionId ?? undefined);
      setHouseholdResult(result);
      if (result.updatedRows) setRows(result.updatedRows);
      if (result.audit) setAuditResult(result.audit);
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(`HouseholdResolver: ${result.households.length} household${result.households.length === 1 ? "" : "s"} formed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "HouseholdResolver failed.");
    } finally {
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
      const report = await fetchDonorReport(rows, persons, households);
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
      const report = await fetchCrmSyncExport(rows, persons, households);
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
      'PersonId,FirstName,LastName,Email,SourceRows,Lifecycle',
      ...report.persons.map(
        (p) => `${p.id},${p.firstName},${p.lastName},${p.email},${p.sourceRowRefs.length},${p.lifecycle}`,
      ),
      '',
      'HouseholdId,LastName,Members,Salutation,JointGivingTotal',
      ...report.households.map(
        (hh) => `${hh.id},${hh.lastName},${hh.memberIds.length},"${hh.salutationText}",${hh.jointGivingTotal.toFixed(2)}`,
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
      "CanonicalPersonId,CanonicalHouseholdId,CanonicalOrgId,Name,FormattedFor,SourceRowRef",
      ...report.rows.map(
        (row) => `${row.canonical_person_id ?? ""},${row.canonical_household_id ?? ""},${row.canonical_org_id ?? ""},"${row.name}",${row.formatted_for},${row.source_row_ref}`,
      ),
      "",
      `GeneratedAt,${report.generatedAt}`,
      `Persons,${report.persons.length}`,
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
      "SourceRowRef,DisplayName,ConstituentType,FirstName,LastName,OrganizationName,HouseholdName,Email,Phone,City,State,Country,AssignedStaff,CreatedAt,UpdatedAt",
      ...previewRecords.map((record: any) => [record.sourceRowRef, record.displayName, record.constituentType, record.firstName, record.lastName, record.organizationName, record.householdName, record.email, record.phone, record.city, record.state, record.country, record.assignedStaff, record.createdAt, record.updatedAt].map(csvCell).join(",")),
    ].join("\n");
    if (fileClass === "donor") return [
      "SourceRowRef,DonorName,Date,Amount,Fund,Appeal,Email,Memo,Currency",
      ...previewRecords.map((record: any) => [record.sourceRowRef, record.donorName, record.date, record.amount, record.fund, record.appeal, record.email, record.memo, record.currency].map(csvCell).join(",")),
    ].join("\n");
    if (fileClass === "campaign") return [
      "SourceRowRef,Code,CampaignName,StartDate,EndDate,Status,GoalAmount",
      ...previewRecords.map((record: any) => [record.sourceRowRef, record.code, record.campaignName, record.startDate, record.endDate, record.status, record.goalAmount].map(csvCell).join(",")),
    ].join("\n");
    if (fileClass === "coa") return [
      "SourceRowRef,AccountCode,AccountName,AccountType,Balance",
      ...previewRecords.map((record: any) => [record.sourceRowRef, record.accountCode, record.accountName, record.accountType, record.balance].map(csvCell).join(",")),
    ].join("\n");
    return ["SourceRowRef,Preview", ...previewRecords.map((record: any) => [record.sourceRowRef, record.preview ?? ""].map(csvCell).join(","))].join("\n");
  }

  function buildPreviewIdentityRows(): CanonicalLedgerRow[] {
    if (!supportsIdentityWorkflow || previewRecords.length === 0) return [];
    return previewRecords.map((record: any, index: number) => {
      const entityName = isDonorFile
        ? record.donorName || record.email || record.sourceRowRef
        : record.displayName || [record.firstName, record.lastName].filter(Boolean).join(" ") || record.organizationName || record.householdName || record.sourceRowRef;
      const rowDate = isDonorFile ? record.date || "" : record.updatedAt || record.createdAt || "";
      const memo = isDonorFile ? [record.memo, record.fund, record.appeal].filter(Boolean).join(" | ") : "";

      return {
        id: `preview-person-${index + 1}`,
        date: rowDate,
        entity_name: entityName,
        account_code: "",
        account_name: "",
        debit: "",
        credit: "",
        currency: record.currency || "",
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
        email: record.email || "",
        phone: record.phone || "",
        address: record.address || "",
        postalCode: record.postalCode || "",
        zip: record.postalCode || "",
        householdName: record.householdName || "",
        firstName: record.firstName || "",
        lastName: record.lastName || "",
        organizationName: record.organizationName || "",
        city: record.city || "",
        state: record.state || "",
        tags: record.tags || [],
        rawValues: record.rawValues || {},
      } as CanonicalLedgerRow;
    });
  }

  function handleExportPreview() {
    const csv = buildPreviewCsv();
    if (!csv) {
      setMessage("Nothing to export from this file class yet.");
      return;
    }
    downloadCsv("transformhub-" + fileClass + "-" + new Date().toISOString().slice(0, 10) + ".csv", csv);
    setMessage("Exported " + previewRecords.length + " " + fileClass + " record" + (previewRecords.length === 1 ? "" : "s") + ".");
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

  type NodeStatus = 'idle' | 'ok' | 'warning' | 'error';

  const pipelineNodes: Array<{ id: string; label: string; status: NodeStatus; count: string | null; target: string }> = [
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
    ...(isLedgerFile && isCrmPlatform
      ? [
          {
            id: 'identity',
            label: 'Identity',
            status: (!personResult ? 'idle' : personResult.needsReview > 0 ? 'warning' : 'ok') as NodeStatus,
            count: personResult ? `${personResult.persons.length} persons · ${personResult.needsReview} review` : null,
            target: 'th-identity',
          },
        ]
      : []),
    ...(isLedgerFile
      ? [
          {
            id: 'mapping',
            label: 'Mapping',
            status: (rows.length === 0 ? 'idle' : highConfidenceRows >= rows.length * 0.7 ? 'ok' : rows.length > 0 ? 'warning' : 'idle') as NodeStatus,
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
      : [
          {
            id: 'mapping',
            label: 'Canonical model',
            status: (!preview ? 'idle' : previewRecords.length > 0 ? 'ok' : schema ? 'warning' : 'idle') as NodeStatus,
            count: preview ? `${previewRecords.length}/${previewCount} previewed` : null,
            target: 'th-nonledger-review',
          },
          {
            id: 'review',
            label: 'Review',
            status: (!preview ? 'idle' : previewRecords.length > 0 ? 'ok' : 'warning') as NodeStatus,
            count: preview ? `${previewRecords.length} ${fileClass} records` : null,
            target: 'th-nonledger-review',
          },
          {
            id: 'export',
            label: 'Export',
            status: (previewRecords.length > 0 ? 'ok' : 'idle') as NodeStatus,
            count: previewRecords.length > 0 ? `${previewRecords.length} rows ready` : null,
            target: 'th-nonledger-output',
          },
        ]),
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
              <span className="th-status-msg">{isLoading ? 'Processing…' : message}</span>
            </div>
            <div className="th-platform-groups">
              {Object.entries(PLATFORM_GROUPS).map(([group, platforms]) => (
                <div key={group} className="th-platform-group">
                  <span className="th-platform-group-label">{group}</span>
                  <div className="th-chip-row">
                    {platforms.map((item) => (
                      <button key={item} type="button" className={`th-chip${item === platform ? ' is-active' : ''}`} onClick={() => setPlatform(item)}>
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="th-upload-actions">
              <label className="th-file-input">
                <Upload size={14} />
                Upload CSV / XLSX
                <input type="file" accept=".csv,.txt,.tsv,.xlsx" onChange={handleFileChange} />
              </label>
              <button type="button" className="th-button th-button-secondary" onClick={loadSample}>
                <PlayCircle size={14} />
                Load {platform} sample
              </button>
            </div>
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
                {blockingIssues.map((stop: any) => (
                  <div key={stop.code} className="th-guardrail is-triggered">
                    <AlertTriangle size={15} />
                    <div>
                      <strong>{stop.reason ?? stop.label ?? stop.code}</strong>
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
          <div className="th-pipeline-wrap">
            {pipelineNodes.map((node, i) => (
              <div key={node.id} className="th-pipeline-step">
                <button
                  type="button"
                  className={`th-pipeline-node th-pipeline-${node.status}`}
                  onClick={() => scrollToSection(node.target)}
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
        </section>

        {/* ── Guardrails ──────────────────────────────────────────────────── */}
        {guardrails.length > 0 && (
          <section className="th-section th-grid th-main-grid" id="th-guardrails">
            <article className="th-panel">
              <div className="th-panel-head">
                <span><span className="th-layer-badge">05</span> Guardrails</span>
                <span>{guardrails.filter((g) => g.triggered).length}/{guardrails.length} triggered</span>
              </div>
              <div className="th-stack">
                {guardrails.map((item) => (
                  <div key={item.code} className={`th-guardrail ${item.triggered ? 'is-triggered' : 'is-clear'}`}>
                    {item.triggered ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="th-panel">
              <div className="th-panel-head"><span>Schema</span><span>{schema?.fingerprint ? 'fingerprint ready' : 'no schema'}</span></div>
              <div className="th-mini-block">
                <strong>Report type</strong>
                <p>{schema?.reportType ?? '—'} · {schema ? `${Math.round(schema.confidence * 100)}% confidence` : 'no schema'}</p>
              </div>
              <div className="th-mini-block" style={{ marginTop: 8 }}>
                <strong>Fingerprint</strong>
                <p style={{ fontFamily: 'monospace', fontSize: '0.76rem', wordBreak: 'break-all' }}>{schema?.fingerprint ?? '—'}</p>
              </div>
              {structureAnalysis && (
                <div className="th-mini-block" style={{ marginTop: 8 }}>
                  <strong>Structure</strong>
                  <p>Skipped {structureAnalysis.skippedTopRows} header rows · removed {structureAnalysis.removedRows} non-data rows</p>
                </div>
              )}
              {schema?.normalizedFieldAlerts && schema.normalizedFieldAlerts.length > 0 && (
                <div className="th-mini-block" style={{ marginTop: 8 }}>
                  <strong>Normalized diff alerts</strong>
                  <p>
                    {schema.normalizedFieldAlerts
                      .slice(0, 4)
                      .map((item) => (item.canonicalHint ? '"' + item.rawKey + '" -> ' + item.canonicalHint : '"' + item.rawKey + '" -> unknown concept'))
                      .join(' · ')}
                    {schema.normalizedFieldAlerts.length > 4 ? ' +' + (schema.normalizedFieldAlerts.length - 4) + ' more' : ''}
                  </p>
                </div>
              )}
              {schema?.fieldSuggestions && schema.fieldSuggestions.length > 0 && (
                <div className="th-mini-block" style={{ marginTop: 8 }}>
                  <strong>AI field suggestions</strong>
                  <div className="th-stack" style={{ marginTop: 8 }}>
                    {schema.fieldSuggestions.slice(0, 4).map((item) => (
                      <div key={item.id} className="th-person-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                          <strong>{item.rawKey}</strong>
                          <span>{item.status} · {item.confidence}</span>
                        </div>
                        <span>{item.suggestedTarget ? item.suggestedTarget : 'no target suggested'}</span>
                        <p className="th-helper" style={{ marginBottom: 0 }}>{item.reasoning || 'AI suggestion pending review.'}</p>
                        {item.sampleValues.length > 0 && <p className="th-helper" style={{ marginBottom: 0 }}>Samples: {item.sampleValues.slice(0, 3).join(' · ')}</p>}
                        {item.status === 'pending' && sessionId && (
                          <div className="th-action-row" style={{ marginTop: 8 }}>
                            <button type="button" className="th-button th-button-primary" onClick={() => handleReviewFieldSuggestion(item.id, 'approve')} disabled={!item.suggestedTarget || isLoading}>Approve</button>
                            <button type="button" className="th-button th-button-secondary" onClick={() => handleReviewFieldSuggestion(item.id, 'reject')} disabled={isLoading}>Reject</button>
                          </div>
                        )}
                      </div>
                    ))}
                    {schema.fieldSuggestions.length > 4 && <p className="th-helper">+{schema.fieldSuggestions.length - 4} more suggestions</p>}
                  </div>
                </div>
              )}
              {schema?.headerDiagnostics && schema.headerDiagnostics.length > 0 && (
                <div className="th-mini-block" style={{ marginTop: 8 }}>
                  <strong>Header normalization</strong>
                  <p>
                    {schema.headerDiagnostics
                      .slice(0, 4)
                      .map((item) => '"' + item.rawKey + '" -> ' + item.strippedKey + (item.mappedCanonicalFields.length ? ' (' + item.mappedCanonicalFields.join(', ') + ')' : ''))
                      .join(' · ')}
                    {schema.headerDiagnostics.length > 4 ? ' +' + (schema.headerDiagnostics.length - 4) + ' more' : ''}
                  </p>
                </div>
              )}
            </article>
          </section>
        )}

        {/* ── Identity Resolution (CRM platforms only) ────────────────────── */}
        {isLedgerFile && isCrmPlatform && rows.length > 0 && (
          <section className="th-section" id="th-identity">
            <div className="th-panel">
              <div className="th-panel-head">
                <span><span className="th-layer-badge">03</span> Identity Resolution</span>
                <div className="th-action-row" style={{ marginBottom: 0 }}>
                  <button type="button" className="th-button th-button-primary" onClick={handleRunPersonResolver}>
                    <Users size={14} /> PersonResolver
                  </button>
                  <button type="button" className="th-button th-button-secondary" onClick={handleRunHouseholdResolver} disabled={!personResult}>
                    <Building2 size={14} /> Households
                  </button>
                </div>
              </div>
              <div className="th-grid th-main-grid">
                <article className="th-panel th-inner-panel">
                  <div className="th-panel-head">
                    <span>Persons</span>
                    <span>{personResult ? `${personResult.persons.length} resolved` : 'not run'}</span>
                  </div>
                  {!personResult ? (
                    <p className="th-helper">Deduplicate donor identities across canonical rows.</p>
                  ) : (
                    <>
                      <div className="th-grid th-grid-3" style={{ marginBottom: 10 }}>
                        <div className="th-stat-chip th-band-auto"><strong>{personResult.autoMatched}</strong><span>Auto ≥85</span></div>
                        <div className="th-stat-chip th-band-review"><strong>{personResult.needsReview}</strong><span>Review</span></div>
                        <div className="th-stat-chip th-band-separate"><strong>{personResult.separated}</strong><span>New</span></div>
                      </div>
                      <div className="th-stack" style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {personResult.persons.slice(0, 8).map((person) => (
                          <div key={person.id} className="th-person-card">
                            <div className="th-person-id">{person.id}</div>
                            <strong>{person.firstName} {person.lastName}</strong>
                            <span>{person.sourceRowRefs.length} rows</span>
                          </div>
                        ))}
                        {personResult.persons.length > 8 && (
                          <p className="th-helper">+{personResult.persons.length - 8} more persons</p>
                        )}
                      </div>
                    </>
                  )}
                </article>

                <article className="th-panel th-inner-panel">
                  <div className="th-panel-head">
                    <span>Households</span>
                    <span>{householdResult ? `${householdResult.households.length} formed` : 'not run'}</span>
                  </div>
                  {!householdResult ? (
                    <p className="th-helper">Group persons by last name and address after running PersonResolver.</p>
                  ) : householdResult.households.length === 0 ? (
                    <div className="th-guardrail is-clear">
                      <CheckCircle2 size={15} />
                      <div><strong>No multi-person households</strong><p>All persons grouped individually.</p></div>
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

              {householdResult?.reviewSuggestions && householdResult.reviewSuggestions.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="th-panel-head" style={{ marginBottom: 10 }}>
                    <span>Household suggestions</span>
                    <span>{householdResult.reviewSuggestions.length} AI suggestions</span>
                  </div>
                  <div className="th-stack">
                    {householdResult.reviewSuggestions.map((suggestion) => (
                      <div key={suggestion.id} className="th-guardrail is-warning">
                        <strong>{suggestion.proposedMembers.map((member) => [member.firstName, member.lastName].filter(Boolean).join(' ') || member.id).join(' · ')}</strong>
                        <p>Matched on: {suggestion.matchedEvidence.join(', ')}</p>
                        {describeHouseholdAiSuggestion(suggestion) && <p className="th-helper">{describeHouseholdAiSuggestion(suggestion)}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {personResult && personResult.matches.filter((m) => m.band === 'review').length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="th-panel-head" style={{ marginBottom: 10 }}>
                    <span>Review decisions</span>
                    <span>{personResult.matches.filter((m) => m.band === 'review').length} need confirmation</span>
                  </div>
                  <div className="th-stack">
                    {personResult.matches
                      .filter((m) => m.band === 'review')
                      .map((match) => {
                        const decision = deriveReviewDecision(match, mergeDecisions);
                        return (
                          <div key={match.inputRef} className="th-guardrail is-warning" style={{ alignItems: 'center', gap: 14 }}>
                            <div style={{ flex: 1 }}>
                              <strong>Ref {match.inputRef} · score {match.score}</strong>
                              <p>Matched on: {match.matchedFields.join(', ') || 'name similarity'}</p>
                              {describeAiSuggestion(match) && <p className="th-helper">{describeAiSuggestion(match)}</p>}
                            </div>
                            {decision ? (
                              <span className={`th-status ${decision === 'confirmed' ? 'is-ready' : 'is-rejected'}`}>
                                {decision === 'confirmed' ? 'Merged' : 'Separated'}
                              </span>
                            ) : (
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" className="th-button th-button-primary" style={{ minHeight: 34 }} onClick={() => handleMergeDecision(match, 'confirmed')}>Confirm merge</button>
                                <button type="button" className="th-button th-button-secondary" style={{ minHeight: 34 }} onClick={() => handleMergeDecision(match, 'separated')}>Keep separate</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
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
                  <button type="button" className={`th-chip${rowSpotlight === 'identity-review' ? ' is-active' : ''}`} onClick={() => { setRowSpotlight('identity-review'); setActiveOperatorIntent('resolve-identities'); }}>Identity gaps</button>
                  <button type="button" className={`th-chip${rowSpotlight === 'mapping-review' ? ' is-active' : ''}`} onClick={() => { setRowSpotlight('mapping-review'); setActiveOperatorIntent('open-mapping'); }}>Mapping exceptions</button>
                </div>
                <span className="th-helper">Showing {visibleRows.length} of {rows.length} rows{activeOperatorIntent ? ` · active intent ${activeOperatorIntent}` : ''}</span>
              </div>
              <div className="th-table-wrap">
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
                        entityIssue ? 'Duplicate donor / identity' : null,
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
                                      ? 'Send this row into PersonResolver or keep it pending until ownership is clear.'
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
                                      <button type="button" className="th-map-action" onClick={() => { jumpToSection('th-identity'); void handleRunPersonResolver(); }}>Run PersonResolver</button>
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
              <p className="th-helper">This file was classified as <strong>{fileClass}</strong>. It stays out of the ledger posting flow and is reviewed in its own canonical table.</p>
              {supportsIdentityWorkflow && (
                <div className="th-grid th-main-grid" style={{ marginBottom: 14 }}>
                  <article className="th-panel th-inner-panel">
                    <div className="th-panel-head"><span>People</span><span>{personResult ? `${canonicalPersons.length} resolved` : "not run"}</span></div>
                    <p className="th-helper">Run PersonResolver before households. Any pending {isDonorFile ? 'donor identity' : 'identity'} review blocks the next step.</p>
                    <div className="th-grid th-grid-3" style={{ marginBottom: 10 }}>
                      <div className="th-stat-chip th-band-auto"><strong>{personResult?.autoMergedCount ?? 0}</strong><span>Auto merged</span></div>
                      <div className="th-stat-chip th-band-review"><strong>{pendingPeopleReviews}</strong><span>Pending review</span></div>
                      <div className="th-stat-chip th-band-separate"><strong>{personResult?.separated ?? 0}</strong><span>New persons</span></div>
                    </div>
                    <div className="th-action-row">
                      <button type="button" className="th-button th-button-primary" onClick={handleRunPersonResolver}>
                        <Users size={14} /> {personResult ? 'Rebuild People' : 'Run PersonResolver'}
                      </button>
                      <button type="button" className="th-button th-button-secondary" onClick={handleResetPeopleState} disabled={!personResult && !householdResult}>
                        <RefreshCcw size={14} /> Reset People
                      </button>
                      <button type="button" className="th-button th-button-secondary" onClick={() => scrollToSection("th-identity-review-queue")} disabled={!personResult || pendingPeopleReviews === 0}>
                        <ArrowRight size={14} /> Continue To Review
                      </button>
                    </div>
                  </article>
                  <article className="th-panel th-inner-panel">
                    <div className="th-panel-head"><span>Households</span><span>{householdResult ? `${householdResult.households.length} formed` : "blocked"}</span></div>
                    <p className="th-helper">Households unlock only after all person matches are resolved.</p>
                    <div className="th-action-row">
                      <button type="button" className="th-button th-button-primary" onClick={handleRunHouseholdResolver} disabled={!peopleStepReady}>
                        <Building2 size={14} /> Run Households
                      </button>
                      <button type="button" className="th-button th-button-secondary" onClick={() => scrollToSection("th-export")} disabled={!nonLedgerExportReady}>
                        <ArrowRight size={14} /> Continue To Export
                      </button>
                    </div>
                    {!peopleStepReady && (
                      <p className="th-helper">Resolve {pendingPeopleReviews} pending {isDonorFile ? 'donor identity' : 'identity'} review{pendingPeopleReviews === 1 ? "" : "s"} to unlock households.</p>
                    )}
                  </article>
                </div>
              )}
              {supportsIdentityWorkflow && householdResult?.reviewSuggestions && householdResult.reviewSuggestions.length > 0 && (
                <div className="th-stack" style={{ marginBottom: 14 }}>
                  <div className="th-panel-head"><span>Household review queue</span><span>{householdResult.reviewSuggestions.length} AI suggestions</span></div>
                  {householdResult.reviewSuggestions.map((suggestion) => (
                    <div key={suggestion.id} className="th-guardrail is-warning" style={{ alignItems: "center", gap: 14 }}>
                      <div style={{ flex: 1 }}>
                        <strong>{suggestion.proposedMembers.map((member) => [member.firstName, member.lastName].filter(Boolean).join(' ') || member.id).join(' · ')}</strong>
                        <p>Matched on: {suggestion.matchedEvidence.join(", ")}</p>
                        {describeHouseholdAiSuggestion(suggestion) && <p className="th-helper">{describeHouseholdAiSuggestion(suggestion)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {supportsIdentityWorkflow && personResult && personResult.matches.some((match) => match.band === "review") && (
                <div id="th-identity-review-queue" className="th-stack" style={{ marginBottom: 14 }}>
                  <div className="th-panel-head"><span>People review queue</span><span>{pendingPeopleReviews} pending</span></div>
                  {personResult.matches.filter((match) => match.band === "review").map((match) => {
                    const decision = deriveReviewDecision(match, mergeDecisions);
                    return (
                      <div key={match.inputRef} className="th-guardrail is-warning" style={{ alignItems: "center", gap: 14 }}>
                        <div style={{ flex: 1 }}>
                          <strong>Ref {match.inputRef} · score {match.score}</strong>
                          <p>Matched on: {match.matchedFields.join(", ") || "name similarity"}</p>
                          {describeAiSuggestion(match) && <p className="th-helper">{describeAiSuggestion(match)}</p>}
                        </div>
                        {decision ? (
                          <span className={`th-status ${decision === "confirmed" ? "is-ready" : "is-rejected"}`}>
                            {decision === "confirmed" ? "Merged" : "Separated"}
                          </span>
                        ) : (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button type="button" className="th-button th-button-primary" style={{ minHeight: 34 }} onClick={() => handleMergeDecision(match, "confirmed")}>Confirm merge</button>
                            <button type="button" className="th-button th-button-secondary" style={{ minHeight: 34 }} onClick={() => handleMergeDecision(match, "separated")}>Keep separate</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="th-table-wrap">
                {fileClass === 'constituent' && (
                  <table className="th-table">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Location</th>
                        <th>Owner</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRecords.map((record: any) => (
                        <tr key={record.id}>
                          <td>{record.sourceRowRef}</td>
                          <td><strong>{record.displayName}</strong><div className="th-inline-note">{record.householdName || record.organizationName || record.firstName}</div></td>
                          <td>{record.constituentType || 'Unknown'}</td>
                          <td>{record.email || '—'}</td>
                          <td>{record.phone || '—'}</td>
                          <td>{[record.city, record.state, record.country].filter(Boolean).join(', ') || '—'}</td>
                          <td>{record.assignedStaff || '—'}</td>
                          <td>{record.updatedAt || record.createdAt || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {fileClass === 'donor' && (
                  <table className="th-table">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Donor</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Fund</th>
                        <th>Appeal</th>
                        <th>Contact</th>
                        <th>Location</th>
                        <th>Memo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRecords.map((record: any) => (
                        <tr key={record.id}>
                          <td>{record.sourceRowRef}</td>
                          <td><strong>{record.donorName}</strong><div className="th-inline-note">{record.householdName || record.organizationName || [record.firstName, record.lastName].filter(Boolean).join(' ') || '—'}</div></td>
                          <td>{record.date || '—'}</td>
                          <td>{record.amount || '—'} {record.currency || ''}</td>
                          <td>{record.fund || '—'}</td>
                          <td>{record.appeal || '—'}</td>
                          <td>{[record.email, record.phone].filter(Boolean).join(' · ') || '—'}</td>
                          <td>{[record.city, record.state, record.postalCode].filter(Boolean).join(', ') || '—'}</td>
                          <td>{record.memo || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {fileClass === 'campaign' && (
                  <table className="th-table">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Goal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRecords.map((record: any) => (
                        <tr key={record.id}>
                          <td>{record.sourceRowRef}</td>
                          <td>{record.code || '—'}</td>
                          <td><strong>{record.campaignName}</strong></td>
                          <td>{record.status || '—'}</td>
                          <td>{record.startDate || '—'}</td>
                          <td>{record.endDate || '—'}</td>
                          <td>{record.goalAmount || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {fileClass === 'coa' && (
                  <table className="th-table">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Account Code</th>
                        <th>Account Name</th>
                        <th>Type</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRecords.map((record: any) => (
                        <tr key={record.id}>
                          <td>{record.sourceRowRef}</td>
                          <td>{record.accountCode || '—'}</td>
                          <td><strong>{record.accountName || '—'}</strong></td>
                          <td>{record.accountType || '—'}</td>
                          <td>{record.balance || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {fileClass === 'unknown' && (
                  <table className="th-table">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRecords.map((record: any) => (
                        <tr key={record.id}>
                          <td>{record.sourceRowRef}</td>
                          <td>{record.preview || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>
        )}

        {!isLedgerFile && preview && previewRecords.length > 0 && (
          <section className="th-section" id="th-export">
            <div className="th-panel">
              <div className="th-panel-head">
                <span><span className="th-layer-badge">10</span> Outputs</span>
              </div>
              <div className="th-grid th-grid-3">
                <article className="th-output-card">
                  <div className="th-card-head"><FileSpreadsheet size={16} /><strong>{fileClass} export</strong></div>
                  <p>Export the class-specific canonical view without forcing this file through the ledger posting flow.</p>
                  {supportsIdentityWorkflow && !nonLedgerExportReady && (
                    <p className="th-helper">Complete identity review and households before export unlocks.</p>
                  )}
                  <button type="button" className="th-button th-button-primary" onClick={handleExportPreview} disabled={!nonLedgerExportReady}>
                    <FileSpreadsheet size={14} /> Export
                  </button>
                </article>
                <article className="th-output-card">
                  <div className="th-card-head"><Database size={16} /><strong>Classifier summary</strong></div>
                  <p>{preview.summary.primaryLabel} · {Object.keys(schema?.fieldMap ?? {}).length} mapped field{Object.keys(schema?.fieldMap ?? {}).length === 1 ? '' : 's'} · {Math.round((schema?.confidence ?? 0) * 100)}% confidence.</p>
                </article>
              </div>
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
      </div>
    </div>
  );
}
