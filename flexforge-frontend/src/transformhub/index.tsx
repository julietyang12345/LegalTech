import { startTransition, type ChangeEvent, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FolderTree,
  PlayCircle,
  Receipt,
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

const SOURCE_PLATFORMS: SourcePlatform[] = [
  'AppFolio', 'Buildium', 'Shopify', 'Stripe', 'TikTok',
  'Bloomerang', 'Salesforce', 'NeonOne', 'GiveButter', 'Xero',
];

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
      if (nextMessage) setMessage(nextMessage);
    });
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
    setRows(updateCanonicalRow(rows, rowId, { [field]: value }));
    setReceipts([]);
    setPreflight(null);
    setFallbackFileName(null);
    setSessionStatus('review');
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
      setMessage(result.valid ? 'Pre-flight passed. Batch is ready to post.' : 'Pre-flight found issues that need review.');
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
    setIsLoading(true);
    try {
      const result = await resolvePersonsBackend(rows, personResult?.persons ?? [], sessionId ?? undefined);
      setPersonResult(result);
      if (result.updatedRows) setRows(result.updatedRows);
      if (result.audit) setAuditResult(result.audit);
      setSessionUpdatedAt(new Date().toISOString());
      setMessage(`PersonResolver: ${result.autoMatched} auto-matched, ${result.needsReview} need review, ${result.separated} new.`);
    } catch (error) {
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
    setIsLoading(true);
    try {
      const result = await evaluateTaxonomyBackend(rows, sessionId ?? undefined);
      setTaxonomyResult(result);
      setMessage(`Taxonomy: ${result.resolvedCount} resolved, ${result.unmappedCount} unknown → exception queue.`);
    } catch (error) {
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

  return (
    <div className="th-shell">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="th-hero">
        <div className="th-hero-copy th-panel">
          <div className="th-eyebrow">
            <WandSparkles size={16} />
            TransformHub
          </div>
          <h1>App-to-app data transformation with identity resolution and taxonomy governance.</h1>
          <p>
            Ingests CSV/XLSX from CRM, donation, and accounting platforms. Resolves person identity,
            groups households, enforces canonical taxonomy, and produces clean finance + donor outputs.
          </p>
          <div className="th-note-row">
            <span><BadgeCheck size={15} /> Canonical ledger</span>
            <span><ShieldAlert size={15} /> 7 hard-stop guardrails</span>
            <span><Users size={15} /> PersonResolver</span>
            <span><FolderTree size={15} /> Taxonomy governance</span>
          </div>
        </div>

        <div className="th-panel th-uploader">
          <div className="th-panel-head">
            <span>Ingestion controls</span>
            <span>{isLoading ? 'Processing…' : message}</span>
          </div>
          <div className="th-stack" style={{ gap: 8 }}>
            {Object.entries(PLATFORM_GROUPS).map(([group, platforms]) => (
              <div key={group}>
                <div className="th-platform-group-label">{group}</div>
                <div className="th-chip-row">
                  {platforms.map((item) => (
                    <button key={item} type="button" className={`th-chip ${item === platform ? 'is-active' : ''}`} onClick={() => setPlatform(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="th-upload-actions">
            <label className="th-file-input">
              <Upload size={16} />
              Upload CSV/XLSX
              <input type="file" accept=".csv,.txt,.tsv,.xlsx" onChange={handleFileChange} />
            </label>
            <button type="button" className="th-button th-button-secondary" onClick={loadSample}>
              <PlayCircle size={16} />
              Load {platform} sample
            </button>
          </div>
          <div className="th-mini-block">
            <strong>Session state</strong>
            <p>
              {sessionId
                ? `${sessionStatus} · ${sessionId.slice(0, 12)}…${sessionId.slice(-6)}${sessionUpdatedAt ? ` · updated ${new Date(sessionUpdatedAt).toLocaleString()}` : ''}`
                : 'No backend session yet'}
            </p>
          </div>
          <div className="th-action-row">
            <button type="button" className="th-button th-button-secondary" onClick={handleSaveSession} disabled={!sessionId || rows.length === 0}>
              <Save size={16} />
              Save review state
            </button>
            <button type="button" className="th-button th-button-secondary" onClick={handleReloadSession} disabled={!sessionId}>
              <RefreshCcw size={16} />
              Reload saved state
            </button>
          </div>
        </div>
      </section>

      {/* ── Layer 02 stats ──────────────────────────────────────────────── */}
      <section className="th-section">
        <div className="th-grid th-grid-4">
          <article className="th-card">
            <div className="th-card-head"><FileSpreadsheet size={18} /><h3>Parser</h3></div>
            <strong>{parsedFile ? parsedFile.fileName : 'No file loaded'}</strong>
            <p>{parsedFile ? `${structureAnalysis?.dataRowCount ?? parsedFile.rows.length} data rows · ${parsedFile.platform}` : 'Parser idle'}</p>
          </article>
          <article className="th-card">
            <div className="th-card-head"><BrainCircuit size={18} /><h3>Schema</h3></div>
            <strong>{schema ? schema.reportType : 'Unknown'}</strong>
            <p>{schema ? `${Math.round(schema.confidence * 100)}% confidence${templateMatched ? ' · template match' : ''}` : 'Awaiting file'}</p>
          </article>
          <article className="th-card">
            <div className="th-card-head"><Database size={18} /><h3>Canonical rows</h3></div>
            <strong>{rows.length}</strong>
            <p>{readyRows} approved · {reviewRows} pending · {rejectedRows} rejected</p>
          </article>
          <article className="th-card">
            <div className="th-card-head"><Receipt size={18} /><h3>Posting</h3></div>
            <strong>{receipts.length}</strong>
            <p>{receipts.length ? 'Simulated receipts created' : 'No posted journals yet'}</p>
          </article>
        </div>
      </section>

      {/* ── Layer 05: Guardrails ─────────────────────────────────────────── */}
      <section className="th-section th-grid th-main-grid">
        <article className="th-panel">
          <div className="th-panel-head">
            <span><span className="th-layer-badge">05</span> Guardrails</span>
            <span>{guardrails.filter((item) => item.triggered).length} of {guardrails.length} triggered</span>
          </div>
          <div className="th-stack">
            {guardrails.length === 0 ? (
              <div className="th-empty">Upload or load a sample to evaluate guardrails.</div>
            ) : (
              guardrails.map((item) => (
                <div key={item.code} className={`th-guardrail ${item.triggered ? 'is-triggered' : 'is-clear'}`}>
                  {item.triggered ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="th-panel">
          <div className="th-panel-head">
            <span>Canonical contract</span>
            <span>{schema?.fingerprint ? 'fingerprint ready' : 'no schema'}</span>
          </div>
          <div className="th-mini-block">
            <strong>Report type</strong>
            <p>{schema?.reportType ?? '—'} · {schema ? `${Math.round(schema.confidence * 100)}% confidence` : 'no schema'}</p>
          </div>
          <div className="th-mini-block">
            <strong>Template fingerprint</strong>
            <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>{schema?.fingerprint ?? 'No fingerprint yet'}</p>
          </div>
          <div className="th-mini-block">
            <strong>Structure analyzer</strong>
            <p>
              {structureAnalysis
                ? `Skipped ${structureAnalysis.skippedTopRows} top row(s) · removed ${structureAnalysis.removedRows} non-data row(s)`
                : 'No structural analysis yet'}
            </p>
          </div>
          <div className="th-mini-block">
            <strong>Chart of accounts</strong>
            <p>{coa.map((item) => `${item.code} ${item.name}`).join(' · ')}</p>
          </div>
        </article>
      </section>

      {/* ── Layer 03: Identity + Household Resolution ────────────────────── */}
      <section className="th-section">
        <div className="th-panel">
          <div className="th-panel-head">
            <span><span className="th-layer-badge">03</span> Identity + Household Resolution</span>
            <span className="th-phase-badge">Phase 1</span>
          </div>
          <div className="th-action-row" style={{ marginBottom: 16 }}>
            <button type="button" className="th-button th-button-primary" onClick={handleRunPersonResolver} disabled={rows.length === 0}>
              <Users size={16} />
              Run PersonResolver
            </button>
            <button type="button" className="th-button th-button-secondary" onClick={handleRunHouseholdResolver} disabled={!personResult}>
              <Building2 size={16} />
              Run HouseholdResolver
            </button>
          </div>
          <div className="th-grid th-main-grid">
            <article className="th-panel" style={{ boxShadow: 'none', background: 'rgba(255,255,255,0.42)' }}>
              <div className="th-panel-head"><span>PersonResolver</span><span>{personResult ? `${personResult.persons.length} persons` : 'not run'}</span></div>
              {!personResult ? (
                <div className="th-empty">Run PersonResolver to extract and deduplicate donor identities from canonical rows.</div>
              ) : (
                <>
                  <div className="th-grid th-grid-3" style={{ marginBottom: 12 }}>
                    <div className="th-stat-chip th-band-auto">
                      <strong>{personResult.autoMatched}</strong>
                      <span>Auto-matched ≥85</span>
                    </div>
                    <div className="th-stat-chip th-band-review">
                      <strong>{personResult.needsReview}</strong>
                      <span>Review 60–84</span>
                    </div>
                    <div className="th-stat-chip th-band-separate">
                      <strong>{personResult.separated}</strong>
                      <span>New &lt;60</span>
                    </div>
                  </div>
                  <div className="th-stack" style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {personResult.persons.slice(0, 10).map((person) => (
                      <div key={person.id} className="th-person-card">
                        <div className="th-person-id">{person.id}</div>
                        <strong>{person.firstName} {person.lastName}</strong>
                        <span>{person.sourceRowRefs.length} source row{person.sourceRowRefs.length === 1 ? '' : 's'}</span>
                      </div>
                    ))}
                    {personResult.persons.length > 10 && (
                      <div className="th-empty">…and {personResult.persons.length - 10} more persons</div>
                    )}
                  </div>
                </>
              )}
            </article>

            <article className="th-panel" style={{ boxShadow: 'none', background: 'rgba(255,255,255,0.42)' }}>
              <div className="th-panel-head"><span>HouseholdResolver</span><span>{householdResult ? `${householdResult.households.length} households` : 'not run'}</span></div>
              {!householdResult ? (
                <div className="th-empty">Run HouseholdResolver after PersonResolver to group members by last name + address.</div>
              ) : (
                <div className="th-stack" style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {householdResult.households.length === 0 ? (
                    <div className="th-empty">No multi-person households found. All persons grouped individually.</div>
                  ) : (
                    householdResult.households.map((hh) => (
                      <div key={hh.id} className="th-household-card">
                        <div className="th-person-id">{hh.id}</div>
                        <strong>{hh.salutationText}</strong>
                        <span>{hh.memberIds.length} member{hh.memberIds.length === 1 ? '' : 's'} · {hh.salutation}</span>
                      </div>
                    ))
                  )}
                  {householdResult.ungroupedPersonIds.length > 0 && (
                    <div className="th-mini-block">
                      <strong>Ungrouped</strong>
                      <p>{householdResult.ungroupedPersonIds.length} person{householdResult.ungroupedPersonIds.length === 1 ? '' : 's'} without a household match.</p>
                    </div>
                  )}
                </div>
              )}
            </article>
          </div>
          {/* Merge / split review panel — shows review-band matches only */}
          {personResult && personResult.matches.filter((m) => m.band === 'review').length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="th-panel-head" style={{ marginBottom: 10 }}>
                <span>Identity review decisions</span>
                <span>{personResult.matches.filter((m) => m.band === 'review').length} match{personResult.matches.filter((m) => m.band === 'review').length === 1 ? '' : 'es'} need confirmation</span>
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
                          <p>Matched on: {match.matchedFields.join(', ') || 'name similarity'} · candidate ID: {match.matchedPersonId ?? 'new person'}</p>
                        </div>
                        {decision ? (
                          <span className={`th-status ${decision === 'confirmed' ? 'is-ready' : 'is-rejected'}`}>
                            {decision === 'confirmed' ? 'Merged' : 'Separated'}
                          </span>
                        ) : (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" className="th-button th-button-primary" style={{ minHeight: 34 }} onClick={() => handleMergeDecision(match, 'confirmed')}>
                              Confirm merge
                            </button>
                            <button type="button" className="th-button th-button-secondary" style={{ minHeight: 34 }} onClick={() => handleMergeDecision(match, 'separated')}>
                              Keep separate
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          {!isCrmPlatform && (
            <p className="th-helper" style={{ marginTop: 12 }}>
              PersonResolver works best with CRM/donation platforms (Bloomerang, Salesforce, NeonOne, GiveButter) that export constituent names. Try loading a Bloomerang sample to see it in action.
            </p>
          )}
        </div>
      </section>

      {/* ── Layer 04: Taxonomy Governance ───────────────────────────────── */}
      <section className="th-section">
        <div className="th-panel">
          <div className="th-panel-head">
            <span><span className="th-layer-badge">04</span> Taxonomy Governance</span>
            <span className="th-phase-badge">Phase 1</span>
          </div>
          <div className="th-action-row" style={{ marginBottom: 16 }}>
            <button type="button" className="th-button th-button-primary" onClick={handleRunTaxonomy} disabled={rows.length === 0}>
              <FolderTree size={16} />
              Evaluate taxonomy
            </button>
          </div>
          <div className="th-grid th-main-grid">
            <article className="th-panel" style={{ boxShadow: 'none', background: 'rgba(255,255,255,0.42)' }}>
              <div className="th-panel-head"><span>Canonical registry</span><span>{registry.length} codes</span></div>
              <div className="th-taxonomy-grid">
                {registry.map((code) => (
                  <div key={code.code} className={`th-taxonomy-item th-taxonomy-${code.type}`}>
                    <span className="th-taxonomy-type">{code.type}</span>
                    <strong>{code.code}</strong>
                    <span>{code.label}</span>
                    {code.retiredAt && <span className="th-taxonomy-retired">Retires {code.retiredAt}</span>}
                  </div>
                ))}
              </div>
              <div className="th-mini-block" style={{ marginTop: 12 }}>
                <strong>Legacy mappings ({legacyMap.length})</strong>
                <p>{legacyMap.slice(0, 5).map((m) => `"${m.legacyValue}" → ${m.canonicalCode}`).join(' · ')}{legacyMap.length > 5 ? ` … +${legacyMap.length - 5} more` : ''}</p>
              </div>
            </article>

            <article className="th-panel" style={{ boxShadow: 'none', background: 'rgba(255,255,255,0.42)' }}>
              <div className="th-panel-head">
                <span>Exception queue</span>
                <span>{taxonomyResult ? `${taxonomyResult.unmappedCount} unmapped` : 'not evaluated'}</span>
              </div>
              {!taxonomyResult ? (
                <div className="th-empty">Run taxonomy evaluation to check fund/appeal codes against the canonical registry.</div>
              ) : taxonomyResult.violations.length === 0 ? (
                <div className="th-guardrail is-clear">
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>All codes resolved</strong>
                    <p>{taxonomyResult.resolvedCount} fund/appeal code{taxonomyResult.resolvedCount === 1 ? '' : 's'} resolved via registry or legacy mapping.</p>
                  </div>
                </div>
              ) : (
                <div className="th-stack">
                  {taxonomyResult.violations.map((v, i) => (
                    <div key={i} className="th-guardrail is-triggered">
                      <AlertTriangle size={16} />
                      <div>
                        <strong>Row {v.rowRef} · {v.field}</strong>
                        <p>"{v.rawValue}" not in registry{v.suggestedCode ? ` — suggested: ${v.suggestedCode}` : ' — no suggestion'}</p>
                      </div>
                    </div>
                  ))}
                  <div className="th-mini-block">
                    <strong>{taxonomyResult.resolvedCount} resolved · {taxonomyResult.unmappedCount} in exception queue</strong>
                    <p>Unknown codes are held pending staff mapping or rejection.</p>
                  </div>
                </div>
              )}
            </article>
          </div>
        </div>
      </section>

      {/* ── Layer 09: Human review table ─────────────────────────────────── */}
      <section className="th-section">
        <div className="th-panel">
          <div className="th-panel-head">
            <span><span className="th-layer-badge">09</span> Human review checkpoint</span>
            <span>Edit rows, then run pre-flight</span>
          </div>
          {rows.length === 0 ? (
            <div className="th-empty">No canonical rows yet.</div>
          ) : (
            <div className="th-table-wrap">
              <table className="th-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Date</th>
                    <th>Entity</th>
                    <th>Account code</th>
                    <th>Account name</th>
                    <th>Debit</th>
                    <th>Credit</th>
                    <th>Fund / Appeal</th>
                    <th>Journal</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="th-source-cell">
                          <strong>{row.source_platform}</strong>
                          <span>{row.source_row_ref}</span>
                          {row.canonical_person_id && <span className="th-person-tag">{row.canonical_person_id}</span>}
                        </div>
                      </td>
                      <td><input value={row.date} onChange={(e) => handleRowChange(row.id, 'date', e.target.value)} /></td>
                      <td><input value={row.entity_name} onChange={(e) => handleRowChange(row.id, 'entity_name', e.target.value)} /></td>
                      <td><input value={row.account_code} onChange={(e) => handleRowChange(row.id, 'account_code', e.target.value)} /></td>
                      <td><input value={row.account_name} onChange={(e) => handleRowChange(row.id, 'account_name', e.target.value)} /></td>
                      <td><input value={row.debit} onChange={(e) => handleRowChange(row.id, 'debit', e.target.value)} /></td>
                      <td><input value={row.credit} onChange={(e) => handleRowChange(row.id, 'credit', e.target.value)} /></td>
                      <td>
                        <div className="th-source-cell">
                          {row.raw_fund && <span className="th-taxonomy-tag">{row.raw_fund}</span>}
                          {row.raw_appeal && <span className="th-taxonomy-tag">{row.raw_appeal}</span>}
                          {!row.raw_fund && !row.raw_appeal && <span style={{ color: 'var(--th-muted)', fontSize: '0.8rem' }}>—</span>}
                        </div>
                      </td>
                      <td><input value={row.journal_id} onChange={(e) => handleRowChange(row.id, 'journal_id', e.target.value)} /></td>
                      <td>
                        <span className={`th-status ${row.review_status === 'rejected' ? 'is-rejected' : row.review_status === 'approved' ? 'is-ready' : 'is-review'}`}>
                          {row.review_status === 'rejected' ? 'Rejected' : row.review_status === 'approved' ? 'Approved' : 'Pending'}
                        </span>
                        {row.suggested_fix && <p className="th-inline-note">{row.suggested_fix}</p>}
                      </td>
                      <td>
                        <button type="button" className="th-link-button" onClick={() => handleAddBalancingRow(row.id)}>Balance</button>
                        <button type="button" className="th-link-button" onClick={() => handleReviewAction(row.id, 'approved')}>Approve</button>
                        <button type="button" className="th-link-button" onClick={() => handleReviewAction(row.id, 'rejected')}>Reject</button>
                        {row.review_status === 'rejected' && (
                          <button type="button" className="th-link-button" onClick={() => handleReviewAction(row.id, 'pending')}>Reopen</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Layer 08: Operational Audit Rules ───────────────────────────── */}
      <section className="th-section">
        <div className="th-panel">
          <div className="th-panel-head">
            <span><span className="th-layer-badge">08</span> Operational Audit Rules</span>
            <span className="th-phase-badge">Phase 1</span>
          </div>
          <div className="th-action-row" style={{ marginBottom: 16 }}>
            <button type="button" className="th-button th-button-primary" onClick={handleRunAuditRules} disabled={rows.length === 0}>
              <ShieldAlert size={16} />
              Run audit rules
            </button>
          </div>
          {!auditResult ? (
            <div className="th-empty">
              Run audit rules to check for donor tag gaps, wrong GL accounts, major gifts without donor IDs, LYBUNT/SYBUNT, and more.
              {activeAuditCatalog.length > 0 && (
                <p className="th-inline-note">
                  Catalog ready: {activeAuditCatalog.length} rules loaded from engine {activeAuditEngineVersion ?? 'unknown'}.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="th-grid th-grid-3" style={{ marginBottom: 16 }}>
                <div className="th-stat-chip" style={{ background: 'var(--th-red-bg)', color: 'var(--th-red)' }}>
                  <strong>{auditResult.errorCount}</strong><span>Errors</span>
                </div>
                <div className="th-stat-chip" style={{ background: 'rgba(255,183,60,0.18)', color: '#c07800' }}>
                  <strong>{auditResult.warningCount}</strong><span>Warnings</span>
                </div>
                <div className="th-stat-chip" style={{ background: 'var(--th-green-bg)', color: 'var(--th-green)' }}>
                  <strong>{auditResult.infoCount}</strong><span>Info</span>
                </div>
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
                      {finding.severity === 'error' ? <ShieldAlert size={16} /> : finding.severity === 'warning' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                      <div>
                        <strong>
                          {finding.label} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {finding.count}</span>
                        </strong>
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
        </div>
      </section>

      {/* ── Layer 09: Pre-flight + posting ───────────────────────────────── */}
      <section className="th-section th-grid th-main-grid">
        <article className="th-panel">
          <div className="th-panel-head">
            <span><span className="th-layer-badge">09</span> Pre-flight</span>
            <span>Balance + CoA + audit rules must pass</span>
          </div>
          <div className="th-action-row" style={{ marginBottom: 16 }}>
            <button type="button" className="th-button th-button-primary" onClick={handleRunPreflight} disabled={rows.length === 0}>
              <RefreshCcw size={16} />
              Run pre-flight
            </button>
            <button type="button" className="th-button th-button-secondary" onClick={handleSimulatePost} disabled={rows.length === 0 || !preflight?.valid}>
              <ArrowRight size={16} />
              Simulate post to QBO
            </button>
            <button type="button" className="th-button th-button-secondary" onClick={handleExportCsvFallback} disabled={rows.length === 0}>
              <FileSpreadsheet size={16} />
              Export CSV fallback
            </button>
          </div>
          <div className="th-stack">
            {!preflight ? (
              <div className="th-empty">Run pre-flight to validate journal balance, chart-of-accounts matches, taxonomy, and audit rules.</div>
            ) : preflight.issues.length === 0 ? (
              <div className="th-guardrail is-clear"><CheckCircle2 size={16} /><div><strong>Pre-flight passed</strong><p>Debit equals credit, all accounts resolve, and audit rules are clear.</p></div></div>
            ) : (
              preflight.issues.map((issue, index) => (
                <div key={`${issue.message}-${index}`} className={`th-guardrail ${issue.severity === 'error' ? 'is-triggered' : 'is-clear'}`}>
                  {issue.severity === 'error' ? <ShieldAlert size={16} /> : <CheckCircle2 size={16} />}
                  <div>
                    <strong>{issue.journalId ?? issue.rowId ?? 'Pipeline issue'}</strong>
                    <p>{issue.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="th-panel">
          <div className="th-panel-head">
            <span>Posting receipts</span>
            <span>{receipts.length} receipt{receipts.length === 1 ? '' : 's'}</span>
          </div>
          <div className="th-stack">
            {fallbackFileName && (
              <div className="th-mini-block">
                <strong>CSV fallback ready</strong>
                <p>{fallbackFileName}</p>
              </div>
            )}
            {receipts.length === 0 ? (
              <div className="th-empty">No posted journals yet.</div>
            ) : (
              receipts.map((receipt) => (
                <div key={receipt.qboTxnId} className="th-receipt">
                  <div className="th-card-head"><Building2 size={16} /><strong>{receipt.qboTxnId}</strong></div>
                  <p>Journal: {receipt.journalId}</p>
                  <p>Idempotency: {receipt.idempotencyKey}</p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      {/* ── Layer 06: Entity Model ────────────────────────────────────────── */}
      <section className="th-section">
        <div className="th-panel">
          <div className="th-panel-head">
            <span><span className="th-layer-badge">06</span> Entity Model</span>
            <span className="th-phase-badge">Target defined · persistence missing</span>
          </div>
          <div className="th-grid th-grid-3">
            <article className="th-entity-card">
              <div className="th-card-head"><Users size={16} /><strong>Person</strong></div>
              <p>{personResult ? `${personResult.persons.length} demo person${personResult.persons.length === 1 ? '' : 's'} resolved` : 'Run PersonResolver'}</p>
              <span className="th-status is-partial">Derived only</span>
            </article>
            <article className="th-entity-card">
              <div className="th-card-head"><Building2 size={16} /><strong>Household</strong></div>
              <p>{householdResult ? `${householdResult.households.length} demo household${householdResult.households.length === 1 ? '' : 's'} formed` : 'Run HouseholdResolver'}</p>
              <span className="th-status is-partial">Derived only</span>
            </article>
            <article className="th-entity-card">
              <div className="th-card-head"><Receipt size={16} /><strong>Donation</strong></div>
              <p>{rows.filter((r) => r.raw_fund || r.raw_appeal).length} donation row{rows.filter((r) => r.raw_fund || r.raw_appeal).length === 1 ? '' : 's'} with fund/appeal</p>
              <span className="th-status is-partial">Row-level only</span>
            </article>
            <article className="th-entity-card th-entity-future">
              <div className="th-card-head"><Database size={16} /><strong>Organization</strong></div>
              <p>Corporate donors, employer entities, foundations.</p>
              <span className="th-entity-future-tag">Missing</span>
            </article>
            <article className="th-entity-card th-entity-future">
              <div className="th-card-head"><ArrowRight size={16} /><strong>Attribution</strong></div>
              <p>Links donations to campaigns, appeals, and solicitation channels.</p>
              <span className="th-entity-future-tag">Missing</span>
            </article>
            <article className="th-entity-card th-entity-future">
              <div className="th-card-head"><FolderTree size={16} /><strong>Campaign / Fund</strong></div>
              <p>Goal tracking, campaign hierarchy, multi-year rollup.</p>
              <span className="th-entity-future-tag">Missing</span>
            </article>
          </div>
          <div className="th-inline-note" style={{ marginTop: 14 }}>
            PersonResolver and HouseholdResolver currently improve review and export flows, but the first-class entity layer in the target architecture is not persisted yet.
          </div>
        </div>
      </section>

      {/* ── Layer 07: Multi-axis Source of Truth ─────────────────────────── */}
      <section className="th-section">
        <div className="th-panel">
          <div className="th-panel-head">
            <span><span className="th-layer-badge">07</span> Multi-axis Source of Truth</span>
            <span className="th-phase-badge">Concept present · not yet authoritative</span>
          </div>
          <div className="th-grid th-grid-4">
            <article className="th-axis-card">
              <div className="th-axis-number">1</div>
              <strong>Constituent identity</strong>
              <p>CRM — Bloomerang, Salesforce, NeonOne, GiveButter</p>
              <div className="th-mini-block" style={{ marginTop: 8 }}>
                <strong>{personResult ? personResult.persons.length : '—'}</strong>
                <p>persons resolved</p>
              </div>
            </article>
            <article className="th-axis-card">
              <div className="th-axis-number">2</div>
              <strong>Fundraising events</strong>
              <p>Donation platform — gift records, recurring, appeals</p>
              <div className="th-mini-block" style={{ marginTop: 8 }}>
                <strong>{rows.filter((r) => r.raw_fund || r.raw_appeal).length}</strong>
                <p>donation rows</p>
              </div>
            </article>
            <article className="th-axis-card">
              <div className="th-axis-number">3</div>
              <strong>Finance posting</strong>
              <p>QBO / Xero — journal entries, GL codes, debit/credit</p>
              <div className="th-mini-block" style={{ marginTop: 8 }}>
                <strong>{receipts.length}</strong>
                <p>posted receipt{receipts.length === 1 ? '' : 's'}</p>
              </div>
            </article>
            <article className="th-axis-card">
              <div className="th-axis-number">4</div>
              <strong>Reporting layer</strong>
              <p>TransformHub — canonical ledger, audit trail, donor report</p>
              <div className="th-mini-block" style={{ marginTop: 8 }}>
                <strong>{rows.length}</strong>
                <p>canonical rows</p>
              </div>
            </article>
          </div>
          <div className="th-inline-note" style={{ marginTop: 14 }}>
            The four axes are visible in the UI, but ownership, export formatting, and sync behavior are not yet driven by a real multi-axis configuration model.
          </div>
        </div>
      </section>

      {/* ── Layer 10: Outputs ─────────────────────────────────────────────── */}
      <section className="th-section">
        <div className="th-panel">
          <div className="th-panel-head">
            <span><span className="th-layer-badge">10</span> Outputs</span>
            <span>Download finance and donor exports</span>
          </div>
          <div className="th-grid th-grid-3">
            <article className="th-output-card">
              <div className="th-card-head"><FileSpreadsheet size={18} /><strong>Finance-ready CSV</strong></div>
              <p>Approved canonical rows formatted for QBO / Xero import. Requires pre-flight pass.</p>
              <button type="button" className="th-button th-button-primary" style={{ marginTop: 12 }} onClick={handleExportCsvFallback} disabled={rows.length === 0}>
                <FileSpreadsheet size={15} />
                Export finance CSV
              </button>
            </article>
            <article className="th-output-card">
              <div className="th-card-head"><Users size={18} /><strong>Clean donor report</strong></div>
              <p>Resolved persons and households with giving totals, lifecycle stage, and salutation text.</p>
              <button type="button" className="th-button th-button-primary" style={{ marginTop: 12 }} onClick={handleExportDonorReport} disabled={rows.length === 0}>
                <Users size={15} />
                Export donor report
              </button>
            </article>
            <article className="th-output-card">
              <div className="th-card-head"><ShieldAlert size={18} /><strong>Audit dashboard CSV</strong></div>
              <p>Summary of all rule findings with severity, count, and recommended action per finding code.</p>
              <button type="button" className="th-button th-button-primary" style={{ marginTop: 12 }} onClick={handleExportAuditDashboard} disabled={rows.length === 0}>
                <ShieldAlert size={15} />
                Export audit dashboard
              </button>
            </article>
            <article className="th-output-card">
              <div className="th-card-head"><FolderTree size={18} /><strong>Campaign performance</strong></div>
              <p>Rolls up normalized fund and appeal activity into campaign-level totals and retention buckets.</p>
              <button type="button" className="th-button th-button-primary" style={{ marginTop: 12 }} onClick={handleExportCampaignPerformanceReport} disabled={rows.length === 0}>
                <FolderTree size={15} />
                Export campaign report
              </button>
            </article>
            <article className="th-output-card">
              <div className="th-card-head"><Database size={18} /><strong>CRM sync export</strong></div>
              <p>Exports resolved person and household mappings for CRM import and downstream sync pipelines.</p>
              <button type="button" className="th-button th-button-primary" style={{ marginTop: 12 }} onClick={handleExportCrmSyncExport} disabled={rows.length === 0}>
                <Database size={15} />
                Export CRM sync
              </button>
            </article>
          </div>
        </div>
      </section>

      {/* ── Implementation status ─────────────────────────────────────────── */}
      <section className="th-section">
        <div className="th-panel">
          <div className="th-panel-head">
            <span>Implementation status</span>
            <span>Updated to match current build state</span>
          </div>
          <div className="th-status-board">
            <article className="th-status-section is-exists">
              <div className="th-card-head">
                <strong>Built or already usable</strong>
                <span className="th-status-pill is-exists">Exists</span>
              </div>
              <p>Layers 01, 02, 05, 09, and the CSV-first parts of 10 are the strongest parts of the system today.</p>
              <div className="th-status-list">
                <div className="th-status-row"><Bot size={16} /><span>Data sources and ingest normalize: CSV/XLSX import, parse and detect, schema resolution, canonical row output.</span></div>
                <div className="th-status-row"><ShieldAlert size={16} /><span>Guardrails and preflight: 6 existing guardrails plus taxonomy audit, balance and CoA checks before post-simulate.</span></div>
                <div className="th-status-row"><FileSpreadsheet size={16} /><span>Review table and outputs: editable review flow, finance-ready CSV, QBO post-simulate, donor report, audit dashboard.</span></div>
              </div>
            </article>

            <article className="th-status-section is-partial">
              <div className="th-card-head">
                <strong>Partially built and needs wiring</strong>
                <span className="th-status-pill is-partial">Partial</span>
              </div>
              <p>The endpoints or demo logic exist, but the full target behavior from the architecture diagrams is not finished.</p>
              <div className="th-status-list">
                <div className="th-status-row"><Users size={16} /><span>Layer 03 PersonResolver: endpoint exists, but fuzzy scoring, confidence bands, canonical person assignment, and merge-split workflow are still thin.</span></div>
                <div className="th-status-row"><Users size={16} /><span>Layer 03 HouseholdResolver: endpoint exists, but grouping rules, salutation generation, primary address selection, rollup, and versioning are incomplete.</span></div>
                <div className="th-status-row"><FolderTree size={16} /><span>Layer 04 Taxonomy governance: registry and lookup work, but legacy mapping depth, version history, and the exception-queue governance model are still shallow.</span></div>
                <div className="th-status-row"><ShieldAlert size={16} /><span>Layer 08 Audit rules: the endpoint exists, but the named versioned rule engine and automatic rerun-on-import behavior are not complete yet.</span></div>
              </div>
            </article>

            <article className="th-status-section is-missing">
              <div className="th-card-head">
                <strong>Not built yet</strong>
                <span className="th-status-pill is-missing">Missing</span>
              </div>
              <p>These are the actual gaps that still separate the current product from the target TransformationHub architecture.</p>
              <div className="th-status-list">
                <div className="th-status-row"><Database size={16} /><span>Layer 06 Entity model: no persisted Person, Household, Organization, Donation, Attribution, Relationship, Campaign, Appeal, or AuditDecision object model yet.</span></div>
                <div className="th-status-row"><FolderTree size={16} /><span>Layer 07 Multi-axis source of truth: the concept exists, but no authoritative axis configuration drives exports, sync rules, or ownership boundaries.</span></div>
                <div className="th-status-row"><AlertTriangle size={16} /><span>Taxonomy legacy mapping table and exception queue: more governance structure is needed so unknown codes queue for staff resolution instead of only hard-blocking.</span></div>
                <div className="th-status-row"><ShieldAlert size={16} /><span>Audit auto-rerun and delta reporting: post-ingest hooks, improvement tracking, and surfaced batch deltas are still missing.</span></div>
                <div className="th-status-row"><Building2 size={16} /><span>SemanticInferenceEngine and QuickBooksGateway: interfaces are defined, but the real implementation seam is still interface-only.</span></div>
              </div>
            </article>

            <article className="th-status-section is-next">
              <div className="th-card-head">
                <strong>Recommended build order</strong>
                <span className="th-status-pill is-next">Start here</span>
              </div>
              <p>The target-state diagrams imply a strict dependency order. Building out of order will keep creating shallow seams.</p>
              <div className="th-status-list">
                <div className="th-status-row"><span className="th-step-index">1</span><span>Define the Layer 06 entity types first. Everything downstream depends on having real resolved objects, not only decorated rows.</span></div>
                <div className="th-status-row"><span className="th-step-index">2</span><span>Deepen PersonResolver and wire it into the semantic-inference seam so canonical person IDs become durable.</span></div>
                <div className="th-status-row"><span className="th-step-index">3</span><span>Implement HouseholdResolver fully so salutation, primary address, rollups, and version history behave like the target model.</span></div>
                <div className="th-status-row"><span className="th-step-index">4</span><span>Expand taxonomy into a real governance layer with legacy mappings, version history, and an exception queue.</span></div>
                <div className="th-status-row"><span className="th-step-index">5</span><span>Finish the named AuditRuleEngine with all rule types, automatic reruns, and delta reporting after each import.</span></div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}
