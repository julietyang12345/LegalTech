import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchIdentityHubPersons, fetchIdentityHubProfile, resolveReviewQueueItem, type IdentityPerson, type IdentityProfile } from './service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fullName(person: IdentityPerson): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || '(no name)';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

// ─── Profile drawer ───────────────────────────────────────────────────────────

type ProfileDrawerProps = {
  personId: string;
  onClose: () => void;
};

function ProfileDrawer({ personId, onClose }: ProfileDrawerProps) {
  const [profile, setProfile] = useState<IdentityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchIdentityHubProfile(personId)
      .then(setProfile)
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, [personId]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,35,0.4)', zIndex: 300 }}
      />
      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 520,
          maxWidth: '92vw',
          background: 'var(--th-bg)',
          borderLeft: '1px solid var(--th-line)',
          zIndex: 301,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(15,23,35,0.12)',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--th-line)', position: 'sticky', top: 0, background: 'var(--th-bg)', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              {profile && (
                <>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--th-ink)' }}>{fullName(profile.person)}</div>
                  {profile.person.email && (
                    <div style={{ fontSize: 13, color: 'var(--th-muted)', marginTop: 2 }}>{profile.person.email}</div>
                  )}
                </>
              )}
              {!profile && !loading && <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--th-ink)' }}>Profile</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--th-muted)', fontSize: 20, lineHeight: 1, padding: 4 }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {loading && <div style={{ color: 'var(--th-muted)', fontSize: 14 }}>Loading…</div>}
          {error && <div style={{ color: 'var(--th-red)', fontSize: 14 }}>{error}</div>}

          {profile && (
            <>
              {/* Suspicious profile warning */}
              {profile.isSuspicious && (
                <section style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, color: '#dc2626' }}>⚠</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>Suspicious profile detected</span>
                  </div>
                  <ul style={{ margin: '0 0 10px', padding: '0 0 0 18px', fontSize: 12, color: 'var(--th-ink)' }}>
                    {profile.suspiciousReasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                  {profile.openQueueItems.filter((item) => item.inputKey?.startsWith('suspicious:')).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={async () => {
                        await resolveReviewQueueItem(item.id, 'approved');
                        setProfile((prev) => prev ? { ...prev, isSuspicious: false, suspiciousReasons: [], openQueueItems: prev.openQueueItems.filter((i) => i.id !== item.id) } : prev);
                      }}
                      style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(220,38,38,0.4)', background: 'none', color: '#dc2626', cursor: 'pointer' }}
                    >
                      Mark as reviewed
                    </button>
                  ))}
                </section>
              )}

              {/* Contact info */}
              <section>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Contact</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: 'Phone', value: profile.person.phone },
                    { label: 'Address', value: [profile.person.addressLine1, profile.person.city, profile.person.state, profile.person.zip].filter(Boolean).join(', ') },
                    { label: 'Platform', value: profile.person.sourcePlatform },
                    { label: 'File class', value: profile.person.sourceFileClass },
                    { label: 'Lifecycle', value: profile.person.lifecycle },
                  ].filter((row) => row.value).map((row) => (
                    <div key={row.label} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                      <span style={{ color: 'var(--th-muted)', minWidth: 72 }}>{row.label}</span>
                      <span style={{ color: 'var(--th-ink)' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Giving summary */}
              <section>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Giving</div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ background: 'var(--th-bg-soft)', border: '1px solid var(--th-line)', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--th-ink)' }}>{formatCurrency(profile.totalGiving)}</div>
                    <div style={{ fontSize: 12, color: 'var(--th-muted)', marginTop: 2 }}>Total giving</div>
                  </div>
                  <div style={{ background: 'var(--th-bg-soft)', border: '1px solid var(--th-line)', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--th-ink)' }}>{profile.donationCount}</div>
                    <div style={{ fontSize: 12, color: 'var(--th-muted)', marginTop: 2 }}>Donations</div>
                  </div>
                </div>

                {profile.donations.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {profile.donations.slice(0, 8).map((d) => (
                      <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--th-line)', fontSize: 13 }}>
                        <span style={{ color: 'var(--th-muted)' }}>{d.date ?? '—'} · {d.fund ?? 'no fund'}</span>
                        <span style={{ fontWeight: 600, color: 'var(--th-ink)' }}>{formatCurrency(d.amount)}</span>
                      </div>
                    ))}
                    {profile.donations.length > 8 && (
                      <div style={{ fontSize: 12, color: 'var(--th-muted)', paddingTop: 4 }}>+{profile.donations.length - 8} more</div>
                    )}
                  </div>
                )}
              </section>

              {/* Source crosswalk */}
              {profile.crosswalk && profile.crosswalk.length > 0 && (
                <section>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Source crosswalk</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {profile.crosswalk.map((cw) => (
                      <div key={cw.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--th-bg-soft)', border: '1px solid var(--th-line)', borderRadius: 8, fontSize: 13 }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--th-ink)' }}>{cw.platform}{cw.fileClass ? ` · ${cw.fileClass}` : ''}</div>
                          {cw.rawKey && <div style={{ fontSize: 11, color: 'var(--th-muted)', marginTop: 1 }}>{cw.rawKey}</div>}
                          <div style={{ fontSize: 11, color: 'var(--th-muted)', marginTop: 1 }}>
                            {cw.donationCount} gift{cw.donationCount !== 1 ? 's' : ''}
                            {cw.firstSeenAt ? ` · first seen ${new Date(cw.firstSeenAt).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: 700, color: 'var(--th-ink)' }}>{formatCurrency(cw.totalGiving)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Household */}
              {profile.households.length > 0 && (
                <section>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Household</div>
                  {profile.households.map((h) => (
                    <div key={h.id} style={{ background: 'var(--th-bg-soft)', border: '1px solid var(--th-line)', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--th-ink)' }}>{h.lastName ?? 'Household'}</div>
                        <div style={{ color: 'var(--th-muted)', marginTop: 2 }}>{h.memberIds.length} member{h.memberIds.length !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600, color: 'var(--th-ink)' }}>{formatCurrency(h.jointGivingTotal)}</div>
                        <div style={{ color: 'var(--th-muted)', marginTop: 2 }}>joint giving</div>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Open review items */}
              {profile.openQueueItems.length > 0 && (
                <section>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Pending review ({profile.openQueueItems.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {profile.openQueueItems.map((item) => (
                      <div key={item.id} style={{ background: 'rgba(20,99,255,0.04)', border: '1px solid rgba(20,99,255,0.14)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                        <span style={{ color: 'var(--th-ink)', fontWeight: 500 }}>{item.displayNameA ?? '?'}</span>
                        <span style={{ color: 'var(--th-muted)' }}> may be the same as </span>
                        <span style={{ color: 'var(--th-ink)', fontWeight: 500 }}>{item.displayNameB ?? '?'}</span>
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--th-blue)', fontWeight: 600 }}>{Math.round(item.score)}%</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Merge history */}
              {profile.decisions.length > 0 && (
                <section>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Decision history ({profile.decisions.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {profile.decisions.slice(0, 10).map((d) => (
                      <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--th-line)', fontSize: 12 }}>
                        <span style={{ color: d.merge ? 'var(--th-green)' : 'var(--th-red)', fontWeight: 600 }}>
                          {d.merge ? 'Merged' : 'Kept separate'}
                        </span>
                        <span style={{ color: 'var(--th-muted)' }}>{new Date(d.updatedAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Fingerprints */}
              {profile.person.fingerprints.length > 0 && (
                <section>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--th-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Identity signals</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {profile.person.fingerprints.map((fp) => (
                      <span
                        key={fp}
                        style={{ fontSize: 11, fontFamily: 'monospace', background: 'rgba(106,119,133,0.1)', color: 'var(--th-muted)', borderRadius: 4, padding: '2px 8px' }}
                      >
                        {fp}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function IdentityHubPanel() {
  const [persons, setPersons] = useState<IdentityPerson[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true);
    try {
      const data = await fetchIdentityHubPersons({ q: q || undefined, page: p, pageSize: 20 });
      setPersons(data.persons);
      setTotal(data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(debouncedQuery, page);
  }, [load, debouncedQuery, page]);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
      setPage(1);
    }, 300);
  }, []);

  const pageCount = Math.ceil(total / 20);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 16px', borderBottom: '1px solid var(--th-line)' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--th-ink)' }}>Profiles</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--th-muted)' }}>{total} canonical records</p>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 32px', borderBottom: '1px solid var(--th-line)' }}>
        <input
          type="search"
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: 13,
            border: '1px solid var(--th-line)',
            borderRadius: 8,
            background: 'var(--th-bg-soft)',
            color: 'var(--th-ink)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--th-muted)', fontSize: 14 }}>Loading…</div>
        )}
        {!loading && persons.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--th-muted)', fontSize: 14 }}>No records found.</div>
        )}
        {!loading && persons.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => setSelectedPersonId(person.id)}
            style={{
              display: 'flex',
              width: '100%',
              padding: '14px 32px',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid var(--th-line)',
              cursor: 'pointer',
              textAlign: 'left',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--th-ink)' }}>{fullName(person)}</div>
              <div style={{ fontSize: 12, color: 'var(--th-muted)', marginTop: 2 }}>
                {[person.email, person.sourcePlatform].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--th-muted)', flexShrink: 0 }}>
              {new Date(person.updatedAt).toLocaleDateString()}
            </span>
          </button>
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

      {/* Profile drawer */}
      {selectedPersonId && (
        <ProfileDrawer personId={selectedPersonId} onClose={() => setSelectedPersonId(null)} />
      )}
    </div>
  );
}
