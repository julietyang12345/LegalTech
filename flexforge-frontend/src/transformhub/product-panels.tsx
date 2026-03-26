import { AlertTriangle, CheckCircle2, Database } from 'lucide-react';
import type {
  AuditRuleResult,
  CanonicalLedgerRow,
  LegacyMapping,
  ResolvedSchema,
  SourcePlatform,
  TaxonomyGovernanceResult,
} from './types';

type OperatorAction = 'run-audit' | 'review-donors' | 'resolve-identities' | 'open-mapping';

type MappingLayerPanelProps = {
  platform: SourcePlatform;
  schema: ResolvedSchema | null;
  rows: CanonicalLedgerRow[];
  legacyMap: LegacyMapping[];
};

type AuditModePanelProps = {
  rows: CanonicalLedgerRow[];
  taxonomyResult: TaxonomyGovernanceResult | null;
  auditResult: AuditRuleResult | null;
  activeAction: OperatorAction | null;
  onAction: (action: OperatorAction) => void;
};

export function TransformHubMappingLayerPanel({ platform, schema, rows, legacyMap }: MappingLayerPanelProps) {
  const sourceFieldPreview = Object.entries(schema?.fieldMap ?? {}).filter(([, value]) => Boolean(value)).slice(0, 6);
  const canonicalFieldPreview = [
    { label: 'Transaction date', key: 'date' },
    { label: 'Entity / donor', key: 'entity_name' },
    { label: 'Ledger account', key: 'account_name' },
    { label: 'Account code', key: 'account_code' },
    { label: 'Fund', key: 'fund' },
    { label: 'Appeal / campaign', key: 'appeal' },
  ] as const;
  const mappingRulePreview = rows
    .filter((row) => row.raw_fund || row.raw_appeal || row.normalized_fund || row.normalized_appeal)
    .slice(0, 4)
    .map((row) => ({
      source: row.raw_fund || row.raw_appeal || row.account_name || row.entity_name || row.source_row_ref,
      destination: row.normalized_fund || row.normalized_appeal || row.account_code || row.account_name,
      note: row.raw_fund
        ? `If fund contains ${row.raw_fund} -> ${row.normalized_fund || 'review canonical fund'}`
        : row.raw_appeal
          ? `If campaign contains ${row.raw_appeal} -> ${row.normalized_appeal || 'review canonical appeal'}`
          : 'Default mapped to ledger account',
    }));
  const traceabilityPreview = rows.slice(0, 4).map((row) => ({
    id: row.id,
    source: `${row.source_platform} / ${row.source_row_ref}`,
    destination: row.journal_id || row.account_code || row.account_name || 'Awaiting ledger destination',
    status: row.review_status === 'approved' ? 'Approved' : row.review_status === 'rejected' ? 'Rejected' : 'Pending',
  }));

  return (
    <section className="th-section" id="th-mapping-layer">
      <div className="th-panel">
        <div className="th-panel-head">
          <span><span className="th-layer-badge">04</span> Mapping layer</span>
          <span className="th-audit-meta-pill">Source in to canonical ledger to export out</span>
        </div>
        <div className="th-grid th-main-grid">
          <article className="th-panel th-inner-panel">
            <div className="th-panel-head"><span>Source fields</span><span>{platform}</span></div>
            <p className="th-helper">Left side keeps the original export visible so operators never lose the incoming context.</p>
            <div className="th-stack">
              {sourceFieldPreview.length === 0 ? (
                <p className="th-helper">Upload a file to inspect source fields.</p>
              ) : (
                sourceFieldPreview.map(([targetField, sourceField]) => (
                  <div key={targetField} className="th-map-row">
                    <strong>{String(sourceField)}</strong>
                    <span>{targetField.replace(/_/g, ' ')}</span>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="th-panel th-inner-panel">
            <div className="th-panel-head"><span>Canonical ledger</span><span>{rows.length} rows</span></div>
            <p className="th-helper">Center panel is the system of record. Show final truth first, then let users trace each row back to source.</p>
            <div className="th-stack">
              {canonicalFieldPreview.map((field) => (
                <div key={field.key} className="th-map-row th-map-row-ledger">
                  <div>
                    <strong>{field.label}</strong>
                    <span>{schema?.fieldMap?.[field.key as keyof typeof schema.fieldMap] ? 'Mapped from source' : 'Awaiting source rule'}</span>
                  </div>
                  <span className="th-map-pill">{schema?.fieldMap?.[field.key as keyof typeof schema.fieldMap] ? 'Final field' : 'Pending'}</span>
                </div>
              ))}
              {mappingRulePreview.length > 0 ? (
                mappingRulePreview.map((rule, index) => (
                  <div key={`${rule.source}-${index}`} className="th-map-rule">
                    <div className="th-map-pill">Rule {index + 1}</div>
                    <strong>{rule.note}</strong>
                    <p>{rule.source} {'->'} {rule.destination}</p>
                  </div>
                ))
              ) : legacyMap.length > 0 ? (
                legacyMap.slice(0, 4).map((mapping) => (
                  <div key={`${mapping.type}-${mapping.legacyValue}`} className="th-map-rule">
                    <div className="th-map-pill">Default</div>
                    <strong>{mapping.type} normalization</strong>
                    <p>{mapping.legacyValue} {'->'} {mapping.canonicalCode}</p>
                  </div>
                ))
              ) : (
                <p className="th-helper">No rule previews yet. Upload source data or evaluate taxonomy to generate the first ledger paths.</p>
              )}
            </div>
          </article>

          <article className="th-panel th-inner-panel">
            <div className="th-panel-head"><span>Traceability</span><span>{traceabilityPreview.length} visible</span></div>
            <p className="th-helper">Every canonical row should explain where it came from and where it will post next.</p>
            <div className="th-stack">
              {traceabilityPreview.length > 0 ? (
                traceabilityPreview.map((item) => (
                  <div key={item.id} className="th-map-rule">
                    <div className="th-map-pill">{item.status}</div>
                    <strong>{item.source}</strong>
                    <p>{item.source} {'->'} {item.destination}</p>
                  </div>
                ))
              ) : legacyMap.length > 0 ? (
                legacyMap.slice(0, 4).map((mapping) => (
                  <div key={`${mapping.type}-${mapping.legacyValue}`} className="th-map-rule">
                    <div className="th-map-pill">Default</div>
                    <strong>{mapping.type} normalization</strong>
                    <p>{mapping.legacyValue} {'->'} {mapping.canonicalCode}</p>
                  </div>
                ))
              ) : (
                <p className="th-helper">Traceability appears once rows exist in the canonical ledger.</p>
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function TransformHubAuditModePanel({ rows, taxonomyResult, auditResult, activeAction, onAction }: AuditModePanelProps) {
  const checks: Array<{ label: string; status: 'pending' | 'review' | 'pass'; detail: string; action: OperatorAction; actionLabel: string }> = [
    {
      label: 'All monthly donors tagged?',
      status: !auditResult ? 'pending' : auditResult.errorCount > 0 ? 'review' : 'pass',
      detail: !auditResult
        ? 'Run audit to verify recurring donor tagging before CRM sync.'
        : auditResult.findings.find((finding) => /monthly|recurring|tag/i.test(finding.message + ' ' + finding.label))?.message || 'Recurring donor coverage looks clean in the current audit run.',
      action: !auditResult ? 'run-audit' : 'review-donors',
      actionLabel: !auditResult ? 'Run audit' : 'Review donor rows',
    },
    {
      label: 'Missing development owner?',
      status: rows.some((row) => row.needs_review && !row.canonical_person_id) ? 'review' : 'pass',
      detail: rows.some((row) => row.needs_review && !row.canonical_person_id)
        ? 'Rows still need ownership or person resolution before handoff.'
        : 'No unresolved ownership gaps in the current row set.',
      action: 'resolve-identities',
      actionLabel: 'Resolve identities',
    },
    {
      label: 'Mismatch between CRM and finance?',
      status: taxonomyResult?.unmappedCount || auditResult?.warningCount ? 'review' : 'pass',
      detail: taxonomyResult?.unmappedCount
        ? `${taxonomyResult.unmappedCount} taxonomy exceptions still need mapping.`
        : auditResult?.warningCount
          ? `${auditResult.warningCount} audit warning(s) still need reconciliation.`
          : 'CRM and ledger mappings currently reconcile cleanly.',
      action: 'open-mapping',
      actionLabel: 'Open mapping layer',
    },
  ];

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="th-panel-head" style={{ marginBottom: 10 }}>
        <span>Operator checklist</span>
        <span>Pass / fail / click to fix</span>
      </div>
      <div className="th-audit-checklist">
        {checks.map((check) => {
          const Icon = check.status === 'review' ? AlertTriangle : check.status === 'pass' ? CheckCircle2 : Database;
          return (
            <div key={check.label} className={`th-audit-check ${check.status === 'review' ? 'is-review' : check.status === 'pass' ? 'is-pass' : 'is-pending'}${activeAction === check.action ? ' is-active' : ''}`}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Icon size={16} />
                <div>
                  <strong>{check.label}</strong>
                  <p>{check.detail}</p>
                </div>
              </div>
              <button type="button" className={`th-map-action${activeAction === check.action ? ' is-active' : ''}`} onClick={() => onAction(check.action)}>
                {check.actionLabel}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
