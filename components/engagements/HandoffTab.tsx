'use client';
/**
 * BAN-346 PM-V1.0-G — Handoff tab content for ProjectsPanel.
 *
 * Loads /api/handoff-receipts/by-kid/[kid] and renders the current handoff
 * receipt (most recent submitted_at) plus a history list.  Click "Review"
 * to open HandoffReviewDrawer for the accept/reject flow.
 */

import { useCallback, useEffect, useState } from 'react';
import HandoffReviewDrawer from './HandoffReviewDrawer';
import CriticalGapsList, { type CriticalGap } from './CriticalGapsList';

type HandoffReceipt = {
  id: string;
  kid: string | null;
  engagement_id: string | null;
  estimate_version_id: string | null;
  state: string;
  submitted_at: string;
  reviewed_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  critical_gaps: CriticalGap[];
  reviewer_notes: string | null;
  packet_drive_file_id: string | null;
};

type ApiResponse = {
  kIDFound: boolean;
  engagement: { engagement_id: string; kid: string; is_test_project: boolean } | null;
  items: HandoffReceipt[];
  summary: { total: number; open_count: number; current: HandoffReceipt | null };
};

const STATE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  pending_review:     { bg: 'var(--color-blue-50)', fg: 'var(--bos-color-accent-data-bright)', label: 'Pending Review' },
  reviewed_complete:  { bg: '#fef3c7', fg: 'var(--color-amber-800)', label: 'Reviewed' },
  accepted:           { bg: '#f0fdf4', fg: '#15803d', label: 'Accepted' },
  accepted_with_gaps: { bg: 'var(--color-amber-50)', fg: '#a16207', label: 'Accepted (with gaps)' },
  rejected_with_gaps: { bg: 'var(--color-red-50)', fg: 'var(--color-red-700)', label: 'Rejected' },
};

function StateBadge({ state }: { state: string }) {
  const s = STATE_COLORS[state] ?? { bg: '#f1f5f9', fg: 'var(--bos-color-ink-tertiary)', label: state };
  return (
    <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, color: s.fg, background: s.bg, border: `1px solid ${s.fg}22` }}>
      {s.label}
    </span>
  );
}

export default function HandoffTab({ kID }: { kID: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/handoff-receipts/by-kid/${encodeURIComponent(kID)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kID]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-disabled)' }}>Loading handoff…</div>;
  }
  if (err) {
    return <div style={{ padding: 24, color: 'var(--color-red-700)', background: 'var(--color-red-50)', borderRadius: 12, border: '1px solid #fecaca' }}>Failed to load handoff: {err}</div>;
  }
  if (!data?.kIDFound) {
    return (
      <div style={{ padding: 24, color: 'var(--bos-color-ink-disabled)', background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-surface-border)' }}>
        Handoff tracking requires this project to be migrated to Postgres.
      </div>
    );
  }

  const items = data.items ?? [];
  const current = data.summary.current;

  if (items.length === 0) {
    return (
      <div style={{ padding: 24, color: 'var(--bos-color-ink-disabled)', background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12 }}>
        No handoff packet has been submitted for this engagement yet.  Estimating will create one to initiate PM acceptance.
      </div>
    );
  }

  return (
    <div>
      {current && (
        <div style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 14, padding: '18px 20px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--bos-color-brand-primary-deep)' }}>Current Handoff</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-ink-primary)', marginTop: 4 }}>
                {current.estimate_version_id ? `Estimate ${current.estimate_version_id}` : 'Handoff packet'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)', marginTop: 4 }}>
                Submitted {new Date(current.submitted_at).toLocaleString()}
                {current.reviewed_at && ` · Reviewed ${new Date(current.reviewed_at).toLocaleString()}`}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              <StateBadge state={current.state} />
              <button
                type="button"
                onClick={() => setOpenReceiptId(current.id)}
                style={{ padding: '7px 14px', borderRadius: 10, border: 'none', background: 'var(--bos-color-brand-primary-deep)', color: 'white', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
              >
                {STATE_COLORS[current.state] && current.state !== 'pending_review' && current.state !== 'reviewed_complete' ? 'View' : 'Review →'}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bos-color-ink-disabled)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Critical gaps ({current.critical_gaps?.length ?? 0})
            </div>
            <CriticalGapsList gaps={current.critical_gaps ?? []} />
          </div>

          {current.reviewer_notes && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--color-surface)', borderRadius: 10, border: '1px solid var(--color-surface-border)', fontSize: 12, color: 'var(--color-ink-secondary)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-disabled)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Reviewer notes</div>
              {current.reviewer_notes}
            </div>
          )}
        </div>
      )}

      {items.length > 1 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bos-color-ink-disabled)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 8px' }}>
            History
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.slice(1).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setOpenReceiptId(r.id)}
                style={{ textAlign: 'left', background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-primary)' }}>
                    {r.estimate_version_id ?? 'Handoff packet'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
                    Submitted {new Date(r.submitted_at).toLocaleString()}
                  </div>
                </div>
                <StateBadge state={r.state} />
              </button>
            ))}
          </div>
        </div>
      )}

      {openReceiptId && (
        <HandoffReviewDrawer
          receiptId={openReceiptId}
          onClose={() => setOpenReceiptId(null)}
          onChanged={fetchData}
        />
      )}
    </div>
  );
}
