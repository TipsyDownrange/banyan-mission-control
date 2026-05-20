'use client';
/**
 * BAN-346 PM-V1.0-G — Review / accept / reject drawer for a handoff receipt.
 *
 * Loads the receipt + critical gaps and exposes the three transition
 * actions.  Accept is always allowed (Q6=A): if unresolved gaps remain, the
 * UI surfaces a warning but the button stays enabled and the receipt
 * resolves to accepted_with_gaps.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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

const TERMINAL_STATES = new Set(['accepted', 'accepted_with_gaps', 'rejected_with_gaps']);

export default function HandoffReviewDrawer({
  receiptId,
  onClose,
  onChanged,
}: {
  receiptId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [receipt, setReceipt] = useState<HandoffReceipt | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gaps, setGaps] = useState<CriticalGap[]>([]);
  const [notes, setNotes] = useState('');

  const fetchOne = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch(`/api/handoff-receipts/${encodeURIComponent(receiptId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setReceipt(j.receipt);
      setGaps((j.receipt.critical_gaps ?? []) as CriticalGap[]);
      setNotes(j.receipt.reviewer_notes ?? '');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [receiptId]);

  useEffect(() => { fetchOne(); }, [fetchOne]);

  const isTerminal = receipt ? TERMINAL_STATES.has(receipt.state) : false;
  const unresolvedCount = useMemo(
    () => gaps.filter((g) => g.status !== 'RESOLVED' && g.status !== 'WAIVED').length,
    [gaps],
  );

  const callAction = async (action: 'review' | 'accept' | 'reject', extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/handoff-receipts/${encodeURIComponent(receiptId)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extra),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await fetchOne();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/handoff-receipts/${encodeURIComponent(receiptId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ critical_gaps: gaps, reviewer_notes: notes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await fetchOne();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 250, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 640, background: 'var(--color-surface)', height: '100%', overflowY: 'auto', boxShadow: '0 0 40px rgba(0,0,0,0.2)' }}
      >
        <div style={{ background: 'linear-gradient(135deg, #064e3b, var(--bos-color-brand-primary-deep))', padding: '20px 24px', position: 'sticky', top: 0, zIndex: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(94,234,212,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                PM Handoff Receipt
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-surface)', marginTop: 4 }}>
                {receipt?.kid ?? '—'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                State: <span style={{ fontWeight: 700 }}>{receipt?.state ?? '…'}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 12px', color: 'var(--color-surface)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              Close
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {err && (
            <div style={{ padding: 12, background: 'var(--color-red-50)', border: '1px solid #fecaca', borderRadius: 10, color: 'var(--color-red-700)', fontSize: 12, marginBottom: 14 }}>
              {err}
            </div>
          )}

          {!receipt ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--bos-color-ink-disabled)' }}>Loading…</div>
          ) : (
            <>
              <section style={{ marginBottom: 18 }}>
                <h3 style={sectionTitle}>Packet</h3>
                <div style={card}>
                  <div style={kv}><span style={kLabel}>Estimate version</span><span>{receipt.estimate_version_id ?? '—'}</span></div>
                  <div style={kv}><span style={kLabel}>Drive packet</span><span>{receipt.packet_drive_file_id ?? '—'}</span></div>
                  <div style={kv}><span style={kLabel}>Submitted</span><span>{new Date(receipt.submitted_at).toLocaleString()}</span></div>
                  <div style={kv}><span style={kLabel}>Reviewed</span><span>{receipt.reviewed_at ? new Date(receipt.reviewed_at).toLocaleString() : '—'}</span></div>
                </div>
              </section>

              <section style={{ marginBottom: 18 }}>
                <h3 style={sectionTitle}>
                  Critical gaps
                  {gaps.length > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: unresolvedCount > 0 ? 'var(--color-red-700)' : '#15803d' }}>
                      {unresolvedCount} unresolved / {gaps.length} total
                    </span>
                  )}
                </h3>
                <CriticalGapsList
                  gaps={gaps}
                  editable={!isTerminal}
                  onChange={isTerminal ? undefined : setGaps}
                />
              </section>

              <section style={{ marginBottom: 18 }}>
                <h3 style={sectionTitle}>Reviewer notes</h3>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isTerminal}
                  placeholder="Notes from PM review — what was checked, outstanding items, follow-ups…"
                  rows={5}
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit', background: isTerminal ? '#f1f5f9' : 'white' }}
                />
              </section>

              {!isTerminal && (
                <>
                  {unresolvedCount > 0 && (
                    <div style={{ padding: 10, borderRadius: 10, background: '#fffbeb', border: '1px solid #fcd34d', color: 'var(--color-amber-800)', fontSize: 12, marginBottom: 12 }}>
                      <strong>{unresolvedCount}</strong> unresolved {unresolvedCount === 1 ? 'gap' : 'gaps'}. You may still accept — acceptance will be recorded as <strong>accepted_with_gaps</strong>.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" disabled={busy} onClick={saveDraft} style={btnSecondary}>Save draft</button>
                    {receipt.state === 'pending_review' && (
                      <button type="button" disabled={busy} onClick={() => callAction('review')} style={btnTeal}>Mark Reviewed</button>
                    )}
                    <button type="button" disabled={busy} onClick={() => callAction('accept', { critical_gaps: gaps, reviewer_notes: notes })} style={btnPrimary}>
                      {unresolvedCount > 0 ? 'Accept with Gaps' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt('Reason for rejecting this handoff:');
                        if (reason && reason.trim()) {
                          callAction('reject', { reason: reason.trim(), critical_gaps: gaps, reviewer_notes: notes });
                        }
                      }}
                      style={btnDanger}
                    >
                      Reject
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: 'var(--bos-color-brand-primary-deep)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px',
};
const card: React.CSSProperties = {
  background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 10, padding: '10px 12px',
};
const kv: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, color: 'var(--color-ink-primary)',
};
const kLabel: React.CSSProperties = { color: 'var(--bos-color-ink-disabled)', fontWeight: 600 };
const btnBase: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', border: 'none',
};
const btnPrimary: React.CSSProperties = { ...btnBase, background: 'var(--bos-color-brand-primary-deep)', color: 'white' };
const btnTeal: React.CSSProperties = { ...btnBase, background: '#0e7490', color: 'white' };
const btnSecondary: React.CSSProperties = { ...btnBase, background: 'white', color: 'var(--color-ink-primary)', border: '1px solid #cbd5e1' };
const btnDanger: React.CSSProperties = { ...btnBase, background: 'var(--color-red-700)', color: 'white' };
