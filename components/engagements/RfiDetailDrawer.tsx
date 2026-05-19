'use client';
/**
 * BAN-341 PM-V1.0-B — Detail drawer for a single RFI.
 *
 * Loads /api/rfis/[id], renders the full record + lifecycle controls
 * (Submit / Log Response / Resolve / Close / Void) and the response
 * capture form. Mirrors the SubmittalDetailDrawer pattern.
 */

import { useCallback, useEffect, useState } from 'react';
import LinkedDocumentsPanel from './LinkedDocumentsPanel';

type Rfi = {
  rfi_id: string;
  rfi_number: string;
  subject: string;
  question: string;
  reason_for_rfi: string | null;
  cost_or_schedule_impact_anticipated: boolean;
  cost_impact_estimate: string | null;
  schedule_impact_days: number | null;
  submitted_to: string | null;
  submitted_date: string | null;
  required_response_by_date: string | null;
  status: string;
  ball_in_court: string | null;
  response_received_date: string | null;
  response_text: string | null;
  response_documents: string[];
  generates_change_order: boolean;
  linked_change_order_id: string | null;
  rfi_pdf_drive_id: string | null;
  submitted_attachments: string[];
};

export default function RfiDetailDrawer({ rfiId, kID, onClose, onChanged }: {
  rfiId: string;
  kID?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [r, setR] = useState<Rfi | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submittedTo, setSubmittedTo] = useState<'GC' | 'ARCHITECT' | 'ENGINEER' | 'OWNER'>('GC');
  const [responseText, setResponseText] = useState('');
  const [generatesCo, setGeneratesCo] = useState(false);
  const [linkedCoId, setLinkedCoId] = useState('');

  const fetchOne = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/rfis/${encodeURIComponent(rfiId)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = await res.json();
      setR(j.rfi);
      if (j.rfi?.submitted_to) setSubmittedTo(j.rfi.submitted_to);
      if (typeof j.rfi?.generates_change_order === 'boolean') setGeneratesCo(j.rfi.generates_change_order);
      if (j.rfi?.linked_change_order_id) setLinkedCoId(j.rfi.linked_change_order_id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [rfiId]);

  useEffect(() => { fetchOne(); }, [fetchOne]);

  const callRoute = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/rfis/${encodeURIComponent(rfiId)}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 250, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '92%', maxWidth: 560, background: '#f8fafc', height: '100%', overflowY: 'auto', boxShadow: '-4px 0 16px rgba(0,0,0,0.15)' }}
      >
        <div style={{ background: '#0c2330', color: 'white', padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: '#5eead4', textTransform: 'uppercase' }}>RFI</div>
              <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                {r?.rfi_number || '—'}
              </div>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>Close</button>
          </div>
        </div>

        {err && (
          <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: 8, margin: 20, fontSize: 12 }}>{err}</div>
        )}

        {!r ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : (
          <div style={{ padding: '20px 24px' }}>
            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>Status</h3>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{r.status.replace(/_/g, ' ')}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Ball: <strong>{r.ball_in_court || '—'}</strong>
                {r.submitted_to ? ` · Submitted to ${r.submitted_to}` : ''}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                <div>Submitted: {r.submitted_date || '—'}</div>
                <div>Required By: {r.required_response_by_date || '—'}</div>
                <div>Responded: {r.response_received_date || '—'}</div>
              </div>
            </section>

            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>Details</h3>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>{r.subject}</div>
              {r.reason_for_rfi && (
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                  Reason: {r.reason_for_rfi.replace(/_/g, ' ')}
                </div>
              )}
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#475569', whiteSpace: 'pre-wrap' }}>
                {r.question}
              </div>
              {r.cost_or_schedule_impact_anticipated && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#fffbeb', borderRadius: 8, fontSize: 11, color: '#92400e', border: '1px solid #fde68a' }}>
                  <div style={{ fontWeight: 800, marginBottom: 2 }}>Cost / schedule impact anticipated</div>
                  {r.cost_impact_estimate && <div>Cost: ${Number(r.cost_impact_estimate).toLocaleString()}</div>}
                  {r.schedule_impact_days !== null && <div>Schedule: {r.schedule_impact_days} days</div>}
                </div>
              )}
            </section>

            {r.response_text && (
              <section style={cardStyle}>
                <h3 style={sectionTitleStyle}>Response</h3>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{r.response_received_date || ''}</div>
                <div style={{ fontSize: 12, color: '#0f172a', whiteSpace: 'pre-wrap' }}>{r.response_text}</div>
              </section>
            )}

            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>Lifecycle</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(r.status === 'DRAFT' || r.status === 'ANSWERED') && (
                  <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: '#f0fdfa', padding: '4px 8px', borderRadius: 8 }}>
                    <select value={submittedTo} onChange={(e) => setSubmittedTo(e.target.value as typeof submittedTo)} style={selectStyle}>
                      <option value="GC">GC</option>
                      <option value="ARCHITECT">Architect</option>
                      <option value="ENGINEER">Engineer</option>
                      <option value="OWNER">Owner</option>
                    </select>
                    <button type="button" disabled={busy} onClick={() => callRoute('/submit', { submitted_to: submittedTo })} style={actionBtn('#0f766e')}>
                      {r.status === 'DRAFT' ? 'Submit →' : 'Re-submit (follow-up) →'}
                    </button>
                  </div>
                )}

                {(r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                    <textarea
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      rows={3}
                      placeholder="Paste the response received from the reviewer..."
                      style={{ ...selectStyle, width: '100%', resize: 'vertical', padding: '8px 10px', fontSize: 12 }}
                    />
                    <button
                      type="button"
                      disabled={busy || !responseText.trim()}
                      onClick={() => callRoute('/log-response', { response_text: responseText.trim() })}
                      style={actionBtn('#0f766e')}
                    >
                      Log Response →
                    </button>
                  </div>
                )}

                {r.status === 'ANSWERED' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', fontWeight: 700 }}>
                      <input type="checkbox" checked={generatesCo} onChange={(e) => setGeneratesCo(e.target.checked)} />
                      This RFI generates a Change Order
                    </label>
                    {generatesCo && (
                      <input
                        value={linkedCoId}
                        onChange={(e) => setLinkedCoId(e.target.value)}
                        placeholder="Linked CO id (optional)"
                        style={{ ...selectStyle, padding: '6px 10px', fontSize: 12 }}
                      />
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => callRoute('/resolve', {
                        generates_change_order: generatesCo,
                        linked_change_order_id: generatesCo && linkedCoId.trim() ? linkedCoId.trim() : null,
                      })}
                      style={actionBtn('#0f766e')}
                    >
                      {generatesCo ? 'Resolve & Link CO →' : 'Resolve →'}
                    </button>
                  </div>
                )}

                {r.status === 'RESOLVED' && (
                  <button type="button" disabled={busy} onClick={() => callRoute('/close', {})} style={actionBtn('#475569')}>
                    Close
                  </button>
                )}

                {r.status !== 'CLOSED' && r.status !== 'VOID' && (
                  <button type="button" disabled={busy} onClick={() => callRoute('/void', {})} style={actionBtn('#b91c1c')}>
                    Void
                  </button>
                )}

                {r.status === 'CLOSED' && <span style={{ fontSize: 12, color: '#64748b' }}>RFI is closed.</span>}
                {r.status === 'VOID' && <span style={{ fontSize: 12, color: '#b91c1c' }}>RFI is voided.</span>}
              </div>
            </section>

            <section style={cardStyle}>
              <h3 style={sectionTitleStyle}>Documents</h3>
              <DocList label="RFI PDF" ids={r.rfi_pdf_drive_id ? [r.rfi_pdf_drive_id] : []} />
              <DocList label="Attachments" ids={r.submitted_attachments} />
              <DocList label="Response documents" ids={r.response_documents} />
              {r.linked_change_order_id && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                  Linked CO: <strong>{r.linked_change_order_id}</strong>
                </div>
              )}
            </section>

            <section style={cardStyle}>
              <LinkedDocumentsPanel
                linkedEntityType="RFI"
                linkedEntityId={r.rfi_id}
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
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>{label} ({ids.length})</div>
      {ids.length === 0 ? (
        <div style={{ fontSize: 11, color: '#cbd5e1' }}>None</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {ids.map((id) => (
            <a key={id} href={`https://drive.google.com/file/d/${id}/view`} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: '#0f766e', background: '#f0fdfa', padding: '2px 6px', borderRadius: 6, textDecoration: 'none', border: '1px solid rgba(15,118,110,0.2)', fontFamily: 'monospace' }}>
              {id.length > 14 ? `${id.slice(0, 10)}…` : id}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 14,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px',
};

const selectStyle: React.CSSProperties = {
  padding: '4px 6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, background: 'white',
};

const actionBtn = (color: string): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 8, border: 'none', background: color, color: 'white', fontSize: 11, fontWeight: 800, cursor: 'pointer',
});
