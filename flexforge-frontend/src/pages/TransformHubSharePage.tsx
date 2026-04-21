import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Link2, ShieldAlert } from 'lucide-react';
import { fetchSharedSession } from '@/transformhub/service';
import type { PreviewRecord, TransformSession } from '@/transformhub/types';
import '@/transformhub/transformhub.css';

type SharedSessionState = {
  expiresAt: string;
  session: TransformSession;
};

function formatDateTime(value?: string | null) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

function getPreviewCellValue(record: PreviewRecord, header: string) {
  return String(record.rawValues?.[header] ?? record.values?.[header] ?? '');
}

export function TransformHubSharePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token) {
        setError('Missing share token.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const response = await fetchSharedSession(token);
        if (!cancelled) {
          setData(response);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.message || 'This share link is invalid or has expired.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const session = data?.session ?? null;
  const previewRecords = session?.parsedFile?.preview?.records ?? [];
  const visibleRecords = previewRecords.slice(0, 50);
  const headers = Array.isArray(session?.parsedFile?.headers) ? session!.parsedFile.headers : [];
  const triggeredGuardrails = (session?.guardrails ?? []).filter((guardrail) => guardrail?.triggered);
  const readyRows = (session?.rows ?? []).filter((row) => row.account_code || row.account_name);

  return (
    <div className="th-shell">
      <header className="th-topbar">
        <div className="th-topbar-inner">
          <div className="th-brand">
            <Link2 size={16} />
            TransformHub Shared Review
          </div>
          <div className="th-topbar-actions">
            <Link to="/login" className="th-button th-button-secondary" style={{ minHeight: 34, fontSize: '0.82rem', textDecoration: 'none' }}>
              Login
            </Link>
          </div>
        </div>
      </header>

      <div className="th-content">
        <section className="th-section">
          <div className="th-canonical-hero">
            <div className="th-canonical-copy">
              <span className="th-eyebrow">Shared snapshot</span>
              <h1>{session ? session.parsedFile?.fileName || 'TransformHub session' : 'Loading shared session'}</h1>
              <p>
                {isLoading
                  ? 'Loading shared review data.'
                  : error
                    ? error
                    : 'This is a read-only TransformHub share link. The main app can still remain behind login.'}
              </p>
            </div>
            <div className="th-canonical-metrics">
              <div className="th-metric-card">
                <strong>{session?.status ?? '...'}</strong>
                <span>Session status</span>
              </div>
              <div className="th-metric-card">
                <strong>{previewRecords.length}</strong>
                <span>Preview records</span>
              </div>
              <div className="th-metric-card">
                <strong>{readyRows.length}</strong>
                <span>Rows with destination</span>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <section className="th-section">
            <div className="th-panel" style={{ borderColor: 'rgba(185, 28, 28, 0.2)' }}>
              <div className="th-section-heading">
                <ShieldAlert size={16} />
                Share link unavailable
              </div>
              <p className="th-helper">{error}</p>
            </div>
          </section>
        )}

        {session && (
          <>
            <section className="th-section">
              <div className="th-panel">
                <div className="th-section-heading">
                  <CheckCircle2 size={16} />
                  Session overview
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <div className="th-metric-card">
                    <strong>{session.parsedFile?.platform || 'Unknown'}</strong>
                    <span>Source platform</span>
                  </div>
                  <div className="th-metric-card">
                    <strong>{formatDateTime(session.updatedAt)}</strong>
                    <span>Last updated</span>
                  </div>
                  <div className="th-metric-card">
                    <strong>{formatDateTime(data?.expiresAt)}</strong>
                    <span>Link expires</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="th-section">
              <div className="th-panel">
                <div className="th-section-heading">
                  <AlertTriangle size={16} />
                  Review signals
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <div className="th-metric-card">
                    <strong>{triggeredGuardrails.length}</strong>
                    <span>Triggered guardrails</span>
                  </div>
                  <div className="th-metric-card">
                    <strong>{session.blockingIssues?.length ?? 0}</strong>
                    <span>Blocking issues</span>
                  </div>
                  <div className="th-metric-card">
                    <strong>{session.structure?.reviewBuckets?.needsReview ?? 0}</strong>
                    <span>Items needing review</span>
                  </div>
                </div>
                {triggeredGuardrails.length > 0 && (
                  <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                    {triggeredGuardrails.slice(0, 6).map((guardrail, index) => (
                      <div key={`${guardrail.code}-${index}`} className="th-panel" style={{ background: 'rgba(255,255,255,0.5)' }}>
                        <strong>{guardrail.label || guardrail.code}</strong>
                        {guardrail.detail && <p className="th-helper" style={{ marginTop: 6 }}>{guardrail.detail}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="th-section">
              <div className="th-panel">
                <div className="th-section-heading">
                  <Link2 size={16} />
                  Preview records
                </div>
                <p className="th-helper" style={{ marginBottom: 16 }}>
                  Showing {visibleRecords.length} of {previewRecords.length} records from the shared session.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table className="th-table">
                    <thead>
                      <tr>
                        {headers.slice(0, 10).map((header) => (
                          <th key={header}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRecords.length === 0 ? (
                        <tr>
                          <td colSpan={Math.max(headers.slice(0, 10).length, 1)}>No preview rows are available in this shared snapshot.</td>
                        </tr>
                      ) : (
                        visibleRecords.map((record) => (
                          <tr key={record.sourceRowRef}>
                            {headers.slice(0, 10).map((header) => (
                              <td key={`${record.sourceRowRef}-${header}`}>
                                {getPreviewCellValue(record as PreviewRecord, header)}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
