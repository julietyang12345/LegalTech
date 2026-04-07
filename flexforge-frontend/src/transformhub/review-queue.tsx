import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchReviewQueue,
  fetchReviewQueueSummary,
  resolveReviewQueueItem,
  type ReviewQueueItem,
  type ReviewQueueResponse,
  type ReviewQueueSummary,
} from './service';

// ─── Evidence field labels ───────────────────────────────────────────────────

const EVIDENCE_LABELS: Record<string, string> = {
  email: 'Same email address',
  phone: 'Same phone number',
  name_zip: 'Same name + zip code',
  name_location: 'Same name + city/state',
  address_zip: 'Same address + zip code',
  stored_decision: 'Previously confirmed',
};

function evidenceLabel(field: string): string {
  return EVIDENCE_LABELS[field] ?? field;
}

// ─── Single queue item card ──────────────────────────────────────────────────

type QueueItemCardProps = {
  item: ReviewQueueItem;
  onResolved: (id: string, action: 'approved' | 'kept_separate') => void;
};

function QueueItemCard({ item, onResolved }: QueueItemCardProps) {
  const [loading, setLoading] = useState(false);

  const handleAction = useCallback(async (action: 'approved' | 'kept_separate') => {
    if (loading) return;
    setLoading(true);
    try {
      await resolveReviewQueueItem(item.id, action);
      onResolved(item.id, action);
    } finally {
      setLoading(false);
    }
  }, [item.id, loading, onResolved]);

  const evidence = item.evidenceFields ?? [];
  const isPreviouslyConfirmed = item.isHighConfidence && (item.evidenceFields ?? []).includes('stored_decision');
  const confidenceLabel = item.isDriftAlert
    ? 'Previously separated — re-appeared'
    : isPreviouslyConfirmed
      ? 'High confidence · Previously confirmed'
      : item.isHighConfidence
        ? 'High confidence'
        : `${Math.round(item.score)}% match`;

  return (
    <div
      style={{
        background: 'var(--th-card)',
        border: '1px solid var(--th-line)',
        borderRadius: 12,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Confidence badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: item.isDriftAlert ? 'var(--th-red)' : item.isHighConfidence ? 'var(--th-blue)' : 'var(--th-muted)',
            background: item.isDriftAlert ? 'var(--th-red-bg)' : item.isHighConfidence ? 'rgba(20,99,255,0.08)' : 'rgba(106,119,133,0.1)',
            padding: '3px 8px',
            borderRadius: 6,
          }}
        >
          {confidenceLabel}
        </span>
      </div>

      {/* Name comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 20px 1fr', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            background: 'rgba(20,99,255,0.04)',
            border: '1px solid rgba(20,99,255,0.12)',
            borderRadius: 8,
            padding: '12px 16px',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Incoming record
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--th-ink)' }}>
            {item.displayNameA ?? '—'}
          </div>
        </div>

        <div style={{ textAlign: 'center', color: 'var(--th-muted)', fontSize: 16, fontWeight: 500 }}>?</div>

        <div
          style={{
            background: 'rgba(30,127,92,0.04)',
            border: '1px solid rgba(30,127,92,0.12)',
            borderRadius: 8,
            padding: '12px 16px',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Existing record
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--th-ink)' }}>
            {item.displayNameB ?? '—'}
          </div>
        </div>
      </div>

      {/* Evidence chips */}
      {evidence.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {evidence.map((field) => (
            <span
              key={field}
              style={{
                fontSize: 12,
                color: 'var(--th-ink)',
                background: 'rgba(20,99,255,0.06)',
                border: '1px solid rgba(20,99,255,0.14)',
                borderRadius: 20,
                padding: '3px 10px',
              }}
            >
              {evidenceLabel(field)}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => handleAction('approved')}
          disabled={loading}
          style={{
            flex: 1,
            padding: '10px 0',
            background: 'var(--th-green)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          Yes, same person
        </button>
        <button
          onClick={() => handleAction('kept_separate')}
          disabled={loading}
          style={{
            flex: 1,
            padding: '10px 0',
            background: 'transparent',
            color: 'var(--th-ink)',
            border: '1px solid var(--th-line)',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          Different people
        </button>
      </div>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

type ReviewQueuePanelProps = {
  onSummaryChange?: (summary: ReviewQueueSummary) => void;
};

export function ReviewQueuePanel({ onSummaryChange }: ReviewQueuePanelProps) {
  const [queueData, setQueueData] = useState<ReviewQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReviewQueue();
      setQueueData(data);
      if (onSummaryChange) {
        const summary = await fetchReviewQueueSummary();
        onSummaryChange(summary);
      }
    } catch {
      setError('Failed to load review queue. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [onSummaryChange]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolved = useCallback((id: string) => {
    setQueueData((prev) => {
      if (!prev) return prev;
      const updated = prev.items.filter((item) => item.id !== id);
      return {
        ...prev,
        items: updated,
        totalPending: Math.max(0, prev.totalPending - 1),
      };
    });
    // Refresh to pull next item from batch if queue was at cap.
    if (queueData && queueData.batchedCount > 0) {
      load();
    }
  }, [queueData, load]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--th-muted)', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--th-red)', fontSize: 14 }}>
        {error}
      </div>
    );
  }

  const items = queueData?.items ?? [];
  const totalPending = queueData?.totalPending ?? 0;
  const batchedCount = queueData?.batchedCount ?? 0;
  const highConfidenceCount = items.filter((i) => i.isHighConfidence).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '24px 32px 16px',
          borderBottom: '1px solid var(--th-line)',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--th-ink)' }}>
            Things to review
          </h2>
          {totalPending > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--th-muted)' }}>
              {totalPending} pending
              {items.filter((i) => i.isDriftAlert).length > 0 && (
                <> · <span style={{ color: 'var(--th-red)' }}>{items.filter((i) => i.isDriftAlert).length} re-appeared</span></>
              )}
              {highConfidenceCount > 0 && (
                <> · <span style={{ color: 'var(--th-blue)' }}>{highConfidenceCount} high confidence</span></>
              )}
            </p>
          )}
        </div>
        <button
          onClick={load}
          style={{
            background: 'transparent',
            border: '1px solid var(--th-line)',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--th-muted)',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 32px' }}>
        {items.length === 0 && batchedCount === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 0',
              color: 'var(--th-muted)',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--th-ink)', marginBottom: 4 }}>
              You're all caught up.
            </div>
            <div style={{ fontSize: 13 }}>No pending identity matches.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((item) => (
              <QueueItemCard
                key={item.id}
                item={item}
                onResolved={handleResolved}
              />
            ))}

            {batchedCount > 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '16px 0',
                  fontSize: 13,
                  color: 'var(--th-muted)',
                  borderTop: items.length > 0 ? '1px solid var(--th-line)' : 'none',
                  marginTop: 4,
                }}
              >
                {batchedCount} more possible match{batchedCount !== 1 ? 'es' : ''} are below the confidence threshold and will appear as you clear these.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Summary badge (for nav/tab use) ────────────────────────────────────────

export function useReviewQueueSummary() {
  const [summary, setSummary] = useState<ReviewQueueSummary | null>(null);

  useEffect(() => {
    fetchReviewQueueSummary()
      .then(setSummary)
      .catch(() => {});
  }, []);

  return summary;
}
