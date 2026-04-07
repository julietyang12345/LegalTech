import React, { useCallback, useEffect, useState } from 'react';
import { fetchAppliedDecisions, toggleAppliedDecision, type AppliedDecision } from './service';

export function AppliedDecisionsPanel() {
  const [decisions, setDecisions] = useState<AppliedDecision[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await fetchAppliedDecisions({ page: p, pageSize: 30 });
      setDecisions(data.decisions);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  const handleToggle = useCallback(async (id: string) => {
    setToggling(id);
    try {
      const updated = await toggleAppliedDecision(id);
      setDecisions((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } finally {
      setToggling(null);
    }
  }, []);

  const pageCount = Math.ceil(total / 30);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 16px', borderBottom: '1px solid var(--th-line)' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--th-ink)' }}>Applied automatically</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--th-muted)' }}>
          {total} confirmed merge decision{total !== 1 ? 's' : ''} · toggle off to stop applying in future sessions
        </p>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--th-muted)', fontSize: 14 }}>Loading…</div>
        )}
        {!loading && decisions.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--th-muted)', fontSize: 14 }}>
            No confirmed decisions yet. Approve matches in the review queue to build this list.
          </div>
        )}
        {!loading && decisions.map((d) => (
          <div
            key={d.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '14px 32px',
              borderBottom: '1px solid var(--th-line)',
              gap: 16,
              opacity: d.disabled ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--th-ink)' }}>
                {d.inputKey || '(no key)'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--th-muted)', marginTop: 2 }}>
                Confirmed · {new Date(d.updatedAt).toLocaleDateString()}
                {d.made_by === 'user' ? '' : ` · by ${d.made_by}`}
              </div>
            </div>

            {/* Toggle switch */}
            <button
              type="button"
              onClick={() => handleToggle(d.id)}
              disabled={toggling === d.id}
              title={d.disabled ? 'Click to re-enable' : 'Click to disable'}
              style={{
                position: 'relative',
                width: 40,
                height: 22,
                borderRadius: 11,
                border: 'none',
                background: d.disabled ? 'rgba(106,119,133,0.3)' : 'var(--th-green)',
                cursor: toggling === d.id ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                flexShrink: 0,
                padding: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  left: d.disabled ? 3 : 19,
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  background: '#fff',
                  transition: 'left 0.2s',
                }}
              />
            </button>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div style={{ padding: '12px 32px', borderTop: '1px solid var(--th-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ background: 'none', border: '1px solid var(--th-line)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', color: 'var(--th-ink)', opacity: page <= 1 ? 0.4 : 1 }}
          >
            ← Prev
          </button>
          <span style={{ color: 'var(--th-muted)' }}>Page {page} of {pageCount}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount}
            style={{ background: 'none', border: '1px solid var(--th-line)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', color: 'var(--th-ink)', opacity: page >= pageCount ? 0.4 : 1 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
