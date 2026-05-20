'use client';
/**
 * BAN-340 PM-V1.0-A — Detail drawer for a single submittal.
 *
 * Loads /api/submittals/[id], renders the full record + lifecycle controls
 * (Submit / Log Review / Close), and a simple upload-document interface
 * for the three categories (submitted / review / approved). The intent is
 * to keep the PM workflow inside the projects panel — no separate page.
 */

import { useCallback, useEffect, useState } from 'react';
import LinkedDocumentsPanel from './LinkedDocumentsPanel';

type Submittal = {
  submittal_id: string;
  submittal_number: string;
  description: string | null;
  csi_spec_section: string;
  csi_subsection: string;
  csi_sub_subsection: string;
  submittal_type: string;
  status: string;
  ball_in_court: string | null;
  submitted_to: string | null;
  submitted_date: string | null;
  reviewed_date: string | null;
  approved_date: string | null;
  required_by_date: string | null;
  requirements_text: string | null;
  submitted_documents: string[];
  review_comments_documents: string[];
  approved_documents: string[];
  spec_document_ref: string | null;
};

export default function SubmittalDetailDrawer({ submittalId, kID, onClose, onChanged }: {
  submittalId: string;
  kID?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [s, setS] = useState<Submittal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadCat, setUploadCat] = useState<'submitted' | 'review' | 'approved'>('submitted');
  const [uploadDriveId, setUploadDriveId] = useState('');
  const [submittedTo, setSubmittedTo] = useState<'GC' | 'ARCHITECT' | 'ENGINEER' | 'OWNER'>('GC');

  const fetchOne = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch(`/api/submittals/${encodeURIComponent(submittalId)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      const j = await r.json();
      setS(j.submittal);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [submittalId]);

  useEffect(() => { fetchOne(); }, [fetchOne]);

  const callTransition = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/submittals/${encodeURIComponent(submittalId)}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  const upload = async () => {
    if (!uploadDriveId.trim()) {
      setErr('Drive file ID is required');
      return;
    }
    await callTransition('/upload-document', { category: uploadCat, drive_file_id: uploadDriveId.trim() });
    setUploadDriveId('');
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 250, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '92%', maxWidth: 560, background: 'var(--color-surface)', height: '100%', overflowY: 'auto', boxShadow: '-4px 0 16px rgba(0,0,0,0.15)' }}
      >
        <div style={{ background: '#0c2330', color: 'white', padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: '#5eead4', textTransform: 'uppercase' }}>Submittal</div>
              <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                {s?.submittal_number || '—'}
              </div>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>Close</button>
          </div>
        </div>

        {err && (
          <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: 8, margin: 20, fontSize: 12 }}>{err}</div>
        )}

        {!s ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)' }}>Loading…</div>
        ) : (
          <div style={{ padding: '20px 24px' }}>
            <section style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Status</h3>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink-primary)' }}>{s.status.replace(/_/g, ' ')}</div>
              <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)', marginTop: 4 }}>
                Ball: <strong>{s.ball_in_court || '—'}</strong>{s.submitted_to ? ` · Submitted to ${s.submitted_to}` : ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                <div>Submitted: {s.submitted_date || '—'}</div>
                <div>Reviewed: {s.reviewed_date || '—'}</div>
                <div>Approved: {s.approved_date || '—'}</div>
              </div>
            </section>

            <section style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Details</h3>
              <div style={{ fontSize: 13, color: 'var(--color-ink-primary)', marginBottom: 6 }}>{s.description || '(no description)'}</div>
              <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)' }}>Type {s.submittal_type} · CSI {s.csi_spec_section}-{s.csi_subsection}-{s.csi_sub_subsection}</div>
              {s.required_by_date && <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)', marginTop: 4 }}>Required by {s.required_by_date}</div>}
              {s.requirements_text && (
                <div style={{ background: 'var(--color-surface)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#475569', marginTop: 8, whiteSpace: 'pre-wrap' }}>{s.requirements_text}</div>
              )}
            </section>

            <section style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Lifecycle</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(s.status === 'REQUIRED' || s.status === 'IN_PROGRESS') && (
                  <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: '#f0fdfa', padding: '4px 8px', borderRadius: 8 }}>
                    <select value={submittedTo} onChange={(e) => setSubmittedTo(e.target.value as typeof submittedTo)} style={selectStyle}>
                      <option value="GC">GC</option>
                      <option value="ARCHITECT">Architect</option>
                      <option value="ENGINEER">Engineer</option>
                      <option value="OWNER">Owner</option>
                    </select>
                    <button type="button" disabled={busy} onClick={() => callTransition('/submit', { submitted_to: submittedTo })} style={actionBtn('var(--bos-color-brand-primary-deep)')}>Submit →</button>
                  </div>
                )}
                {(s.status === 'SUBMITTED' || s.status === 'UNDER_REVIEW') && (
                  <>
                    <button type="button" disabled={busy} onClick={() => callTransition('/log-review', { outcome: 'APPROVED' })} style={actionBtn('var(--bos-color-brand-primary-deep)')}>Approve</button>
                    <button type="button" disabled={busy} onClick={() => callTransition('/log-review', { outcome: 'APPROVED_AS_NOTED' })} style={actionBtn('#15803d')}>Approve as Noted</button>
                    <button type="button" disabled={busy} onClick={() => callTransition('/log-review', { outcome: 'REVISE_RESUBMIT' })} style={actionBtn('#92400e')}>Revise &amp; Resubmit</button>
                    <button type="button" disabled={busy} onClick={() => callTransition('/log-review', { outcome: 'REJECTED' })} style={actionBtn('#b91c1c')}>Reject</button>
                  </>
                )}
                {(s.status === 'APPROVED' || s.status === 'APPROVED_AS_NOTED' || s.status === 'REJECTED') && (
                  <button type="button" disabled={busy} onClick={() => callTransition('/log-review', { outcome: 'CLOSED' })} style={actionBtn('#475569')}>Close</button>
                )}
                {s.status === 'REVISE_RESUBMIT' && (
                  <span style={{ fontSize: 12, color: '#92400e' }}>Edit and resubmit when ready.</span>
                )}
                {s.status === 'CLOSED' && <span style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)' }}>Submittal is closed.</span>}
              </div>
            </section>

            <section style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Documents</h3>
              <DocList label="Spec" ids={s.spec_document_ref ? [s.spec_document_ref] : []} />
              <DocList label="Submitted" ids={s.submitted_documents} />
              <DocList label="Markup / Review" ids={s.review_comments_documents} />
              <DocList label="Approved" ids={s.approved_documents} />
              <div style={{ borderTop: '1px dashed var(--color-surface-border)', marginTop: 12, paddingTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value as typeof uploadCat)} style={selectStyle}>
                  <option value="submitted">Submitted</option>
                  <option value="review">Markup</option>
                  <option value="approved">Approved</option>
                </select>
                <input value={uploadDriveId} onChange={(e) => setUploadDriveId(e.target.value)} placeholder="Drive file ID" style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--color-surface-border)', fontSize: 12 }} />
                <button type="button" disabled={busy} onClick={upload} style={actionBtn('var(--bos-color-brand-primary-deep)')}>Attach</button>
              </div>
            </section>

            <section style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <LinkedDocumentsPanel
                linkedEntityType="SUBMITTAL"
                linkedEntityId={s.submittal_id}
                kID={kID ?? null}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function DocList({ label, ids }: { label: string; ids: string[] }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', fontWeight: 700, marginBottom: 2 }}>{label} ({ids.length})</div>
      {ids.length === 0 ? (
        <div style={{ fontSize: 11, color: '#cbd5e1' }}>None</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {ids.map((id) => (
            <a key={id} href={`https://drive.google.com/file/d/${id}/view`} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: 'var(--bos-color-brand-primary-deep)', background: '#f0fdfa', padding: '2px 6px', borderRadius: 6, textDecoration: 'none', border: '1px solid rgba(15,118,110,0.2)', fontFamily: 'monospace' }}>
              {id.length > 14 ? `${id.slice(0, 10)}…` : id}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '4px 6px', borderRadius: 6, border: '1px solid var(--color-surface-border)', fontSize: 11, background: 'white',
};

const actionBtn = (color: string): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 8, border: 'none', background: color, color: 'white', fontSize: 11, fontWeight: 800, cursor: 'pointer',
});
