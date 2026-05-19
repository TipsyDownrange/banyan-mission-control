'use client';
/**
 * BAN-346 PM-V1.0-G — My Open Handoffs panel.
 *
 * Cross-project widget showing handoffs awaiting PM review (states
 * pending_review + reviewed_complete).  Intended for the PM Dashboard
 * surface (BAN-348 will consume).
 */

import { useCallback, useEffect, useState } from 'react';
import HandoffReviewDrawer from './engagements/HandoffReviewDrawer';

type Receipt = {
  id: string;
  kid: string | null;
  engagement_id: string | null;
  estimate_version_id: string | null;
  state: string;
  submitted_at: string;
  reviewed_at: string | null;
  critical_gaps: Array<{ status: string }>;
  engagement_kid: string | null;
};

const STATE_LABELS: Record<string, { fg: string; bg: string; label: string }> = {
  pending_review:    { fg: '#1d4ed8', bg: '#eff6ff', label: 'Pending Review' },
  reviewed_complete: { fg: '#92400e', bg: '#fef3c7', label: 'Reviewed' },
};

export default function MyOpenHandoffsPanel({ onNavigate }: { onNavigate?: (kID: string) => void }) {
  const [items, setItems] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/handoff-receipts?state=OPEN&limit=100');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setItems(j.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0f766e' }}>
            Handoffs Awaiting Review
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
            Estimating → PM packets pending acceptance
          </div>
        </div>
        <span style={{ fontSize: 22, fontWeight: 900, color: items.length > 0 ? '#b91c1c' : '#15803d' }}>{items.length}</span>
      </div>

      {loading ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Loading…</div>
      ) : err ? (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#b91c1c', fontSize: 12 }}>{err}</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
          No handoffs awaiting your review.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((r) => {
            const s = STATE_LABELS[r.state] ?? { fg: '#475569', bg: '#f1f5f9', label: r.state };
            const unresolved = (r.critical_gaps ?? []).filter((g) => g.status !== 'RESOLVED' && g.status !== 'WAIVED').length;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    if (r.engagement_kid && onNavigate) onNavigate(r.engagement_kid);
                  }}
                  style={{ background: 'none', border: 'none', cursor: r.engagement_kid && onNavigate ? 'pointer' : 'default', textAlign: 'left', padding: 0, flex: 1, minWidth: 0 }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    {r.engagement_kid ?? r.kid ?? '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    Submitted {new Date(r.submitted_at).toLocaleDateString()}
                    {unresolved > 0 && (
                      <span style={{ color: '#b91c1c', fontWeight: 700, marginLeft: 8 }}>
                        {unresolved} unresolved {unresolved === 1 ? 'gap' : 'gaps'}
                      </span>
                    )}
                  </div>
                </button>
                <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, color: s.fg, background: s.bg }}>
                  {s.label}
                </span>
                <button
                  type="button"
                  onClick={() => setOpenId(r.id)}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#0f766e', color: 'white', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                >
                  Review
                </button>
              </div>
            );
          })}
        </div>
      )}

      {openId && (
        <HandoffReviewDrawer
          receiptId={openId}
          onClose={() => setOpenId(null)}
          onChanged={fetchData}
        />
      )}
    </div>
  );
}
