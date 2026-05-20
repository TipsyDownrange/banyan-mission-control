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
import { Button, Card, EmptyState, StatusPill, type StatusPillVariant } from '@/components/design-system';

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

const STATE_LABELS: Record<string, { fg: string; bg: string; label: string; variant: StatusPillVariant }> = {
  pending_review:    { fg: 'var(--bos-color-accent-data-bright)', bg: 'var(--color-blue-50)', label: 'Pending Review', variant: 'info' },
  reviewed_complete: { fg: 'var(--color-amber-800)', bg: '#fef3c7', label: 'Reviewed',       variant: 'warn' },
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
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bos-color-brand-primary-deep)' }}>
            Handoffs Awaiting Review
          </div>
          <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
            Estimating → PM packets pending acceptance
          </div>
        </div>
        <span style={{ fontSize: 22, fontWeight: 900, color: items.length > 0 ? 'var(--color-red-700)' : '#15803d' }}>{items.length}</span>
      </div>

      {loading ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', fontSize: 12 }}>Loading…</div>
      ) : err ? (
        <div style={{ padding: 12, background: 'var(--color-red-50)', border: '1px solid #fecaca', borderRadius: 10, color: 'var(--color-red-700)', fontSize: 12 }}>{err}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<span style={{ fontSize: 20, color: '#15803d' }}>✓</span>}
          heading="No handoffs awaiting your review."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((r) => {
            const s = STATE_LABELS[r.state] ?? { fg: 'var(--bos-color-ink-tertiary)', bg: '#f1f5f9', label: r.state, variant: 'info' as StatusPillVariant };
            const unresolved = (r.critical_gaps ?? []).filter((g) => g.status !== 'RESOLVED' && g.status !== 'WAIVED').length;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--color-surface)', borderRadius: 10, border: '1px solid var(--color-surface-border)', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    if (r.engagement_kid && onNavigate) onNavigate(r.engagement_kid);
                  }}
                  style={{ background: 'none', border: 'none', cursor: r.engagement_kid && onNavigate ? 'pointer' : 'default', textAlign: 'left', padding: 0, flex: 1, minWidth: 0 }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-primary)' }}>
                    {r.engagement_kid ?? r.kid ?? '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
                    Submitted {new Date(r.submitted_at).toLocaleDateString()}
                    {unresolved > 0 && (
                      <span style={{ color: 'var(--color-red-700)', fontWeight: 700, marginLeft: 8 }}>
                        {unresolved} unresolved {unresolved === 1 ? 'gap' : 'gaps'}
                      </span>
                    )}
                  </div>
                </button>
                <StatusPill variant={s.variant ?? 'info'}>{s.label}</StatusPill>
                <Button variant="primary" onClick={() => setOpenId(r.id)}>
                  Review
                </Button>
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
    </Card>
  );
}
