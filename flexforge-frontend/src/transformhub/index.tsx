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

  // Layer 03 state
  const [personResult, setPersonResult] = useState<PersonResolverResult | null>(null);
  const [householdResult, setHouseholdResult] = useState<HouseholdResolverResult | null>(null);
  // merge decisions: map of inputRef → 'confirmed' | 'separated'
  const [mergeDecisions, setMergeDecisions] = useState<Map<string, 'confirmed' | 'separated'>>(new Map());

  // Layer 04 state
  const [taxonomyResult, setTaxonomyResult] = useState<TaxonomyGovernanceResult | null>(null);
  const [registry, setRegistry] = useState<TaxonomyCode[]>([]);
  const [legacyMap, setLegacyMap] = useState<LegacyMapping[]>([]);
  const [coa, setCoa] = useState<Array<{ id: string; code: string; name: string }>>([]);

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
  const templateMatched = Boolean(schema?.fromTemplateCache);
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


  function applySession(session: TransformSession, nextMessage?: string) {
    startTransition(() => {
      setSessionId(session.id);
      setSessionStatus(session.status);
      setSessionUpdatedAt(session.updatedAt);
      setParsedFile(session.parsedFile);
      setPlatform(session.parsedFile.platform);
      setSchema(session.schema);
      setGuardrails(session.guardrails);
      setRows(session.rows);
      setPreflight(session.preflight);
      setReceipts(session.receipts);
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

  async function hydrateUpload(payload: { fileName: string; kind: 'text' | 'xlsx'; contents?: string; contentsBase64?: string }) {
    setIsLoading(true);
    setReceipts([]);
    setPreflight(null);
    setFallbackFileName(null);
    setPersonResult(null);
    setHouseholdResult(null);
    setTaxonomyResult(null);
    setAuditResult(null);
    setMergeDecisions(new Map());

    try {
      const result = await ingestFile({ platform, fileName: payload.fileName, kind: payload.kind, contents: payload.contents, contentsBase64: payload.contentsBase64 });
      const nextStatus = deriveSessionStatus(result.rows, null, []);
      const nextTaxonomy = result.taxonomy ?? null;
      const nextAudit = result.audit ?? null;

      startTransition(() => {
        setSessionId(result.sessionId);
        setSessionStatus(nextStatus);
        setSessionUpdatedAt(new Date().toISOString());
        setParsedFile(result.parsedFile);
        setSchema(result.schema);
        setGuardrails(result.guardrails);
        setRows(result.rows);
        setTaxonomyResult(nextTaxonomy);
        setAuditResult(nextAudit);
        setMessage(`Loaded ${result.parsedFile.rows.length} rows · ${nextAudit?.errorCount ?? 0} audit error(s) · ${nextTaxonomy?.unmappedCount ?? 0} taxonomy exception(s).`);
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to process the file.');
      setParsedFile(null);
      setSchema(null);
      setRows([]);
      setGuardrails([]);
      setReceipts([]);
      setPreflight(null);
      setSessionId(null);
      setSessionStatus('review');
      setSessionUpdatedAt(null);
    } finally {
      setIsLoading(false);
    }
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
      const session = await saveSession(sessionId, rows, nextStatus, preflight);
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
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
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
      setMessage(`Exported ${result.rowCount} approved row${result.rowCount === 1 ? '' : 's'} to CSV fallback.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'CSV fallback export failed.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRunPersonResolver() {
    const returnRowId = activeFixRowId;
    queueReturnToActiveRow();
    setIsLoading(true);
    try {
      const result = await resolvePersonsBackend(rows, personResult?.persons ?? [], sessionId ?? undefined);
      setPersonResult(result);
      if (result.updatedRows) setRows(result.updatedRows);
      if (result.audit) setAuditResult(result.audit);
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(`PersonResolver: ${result.autoMatched} auto-matched, ${result.needsReview} need review, ${result.separated} new.`);
      restoreReturnRowFocus(returnRowId);
    } catch (error) {
      setPendingReturnRowId(null);
      setMessage(error instanceof Error ? error.message : 'PersonResolver failed.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRunHouseholdResolver() {
    if (!personResult) return;
    setIsLoading(true);
    try {
      const result = await resolveHouseholdsBackend(personResult.persons, sessionId ?? undefined);
      setHouseholdResult(result);
      if (result.updatedRows) setRows(result.updatedRows);
      if (result.audit) setAuditResult(result.audit);
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(`HouseholdResolver: ${result.households.length} household${result.households.length === 1 ? '' : 's'} formed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'HouseholdResolver failed.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMergeDecision(match: PersonMatch, action: 'confirmed' | 'separated') {
    if (!sessionId) {
      setMergeDecisions((prev) => new Map(prev).set(match.inputRef, action));
      if (action === 'confirmed' && match.matchedPersonId) {
        setRows((current) =>
          current.map((row) =>
            row.source_row_ref === match.inputRef
              ? { ...row, canonical_person_id: match.matchedPersonId }
              : row,
          ),
        );
      }
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
      'CanonicalPersonId,CanonicalHouseholdId,CanonicalOrgId,Name,FormattedFor,SourceRowRef',
      ...report.rows.map(
        (row) => `${row.canonical_person_id ?? ''},${row.canonical_household_id ?? ''},${row.canonical_org_id ?? ''},"${row.name}",${row.formatted_for},${row.source_row_ref}`,
      ),
      '',
      `GeneratedAt,${report.generatedAt}`,
      `Persons,${report.persons.length}`,
      `Households,${report.households.length}`,
    ].join('\n');
  }

  function downloadCsv(fileName: string, csv: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
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
    ...(isCrmPlatform
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
    {
      id: 'mapping',
      label: 'Mapping',
      status: rows.length === 0 ? 'idle' : highConfidenceRows >= rows.length * 0.7 ? 'ok' : rows.length > 0 ? 'warning' : 'idle',
      count: rows.length > 0 ? `${highConfidenceRows}/${rows.length} high-conf` : null,
      target: 'th-mapping-layer',
    },
    {
      id: 'taxonomy',
      label: 'Taxonomy',
      status: !taxonomyResult ? 'idle' : taxonomyResult.unmappedCount > 0 ? 'warning' : 'ok',
      count: taxonomyResult ? `${taxonomyResult.resolvedCount} resolved · ${taxonomyResult.unmappedCount} queued` : null,
      target: 'th-taxonomy',
    },
    {
      id: 'review',
      label: 'Review',
      status: rows.length === 0 ? 'idle' : reviewRows > 0 ? 'warning' : readyRows > 0 ? 'ok' : 'idle',
      count: rows.length > 0 ? `${readyRows} approved · ${reviewRows} pending` : null,
      target: 'th-review',
    },
    {
      id: 'audit',
      label: 'Audit',
      status: !auditResult ? 'idle' : auditResult.errorCount > 0 ? 'error' : auditResult.warningCount > 0 ? 'warning' : 'ok',
      count: auditResult ? `${auditResult.errorCount} errors · ${auditResult.warningCount} warnings` : null,
      target: 'th-audit',
    },
    {
      id: 'export',
      label: 'Export',
      status: receipts.length > 0 ? 'ok' : preflight?.valid ? 'ok' : 'idle',
      count: receipts.length > 0 ? `${receipts.length} posted` : preflight?.valid ? 'ready' : null,
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
            <button type="button" className="th-button th-button-secondary" onClick={handleSaveSession} disabled={!sessionId || rows.length === 0} style={{ minHeight: 34, fontSize: '0.82rem' }}>
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
              <h1>Canonical ledger in the center</h1>
              <p>Everything flows into one final ledger, and every export flows back out from the same reviewed rows.</p>
            </div>
            <div className="th-canonical-metrics">
              <div className="th-metric-card">
                <strong>{activeRows.length}</strong>
                <span>Active ledger rows</span>
              </div>
              <div className="th-metric-card">
                <strong>{rowsWithCanonicalDestination}</strong>
                <span>Rows with posting destination</span>
              </div>
              <div className="th-metric-card">
                <strong>{highConfidenceRows}</strong>
                <span>High-confidence mappings</span>
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
            </article>
          </section>
        )}

        {/* ── Identity Resolution (CRM platforms only) ────────────────────── */}
        {isCrmPlatform && rows.length > 0 && (
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
                        const decision = mergeDecisions.get(match.inputRef);
                        return (
                          <div key={match.inputRef} className="th-guardrail is-warning" style={{ alignItems: 'center', gap: 14 }}>
                            <div style={{ flex: 1 }}>
                              <strong>Ref {match.inputRef} · score {match.score}</strong>
                              <p>Matched on: {match.matchedFields.join(', ') || 'name similarity'}</p>
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

        {rows.length > 0 && (
          <TransformHubMappingLayerPanel
            platform={platform}
            schema={schema}
            rows={rows}
            legacyMap={legacyMap}
          />
        )}

        {/* ── Taxonomy ────────────────────────────────────────────────────── */}
        {rows.length > 0 && (
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
                      {taxonomyResult.violations.map((v, i) => (
                        <div key={i} className="th-guardrail is-triggered">
                          <AlertTriangle size={15} />
                          <div>
                            <strong>Row {v.rowRef} · {v.field}</strong>
                            <p>"{v.rawValue}"{v.suggestedCode ? ` → ${v.suggestedCode}` : ' — no match'}</p>
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
        {rows.length > 0 && (
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
        {rows.length > 0 && (
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
        {rows.length > 0 && (
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
