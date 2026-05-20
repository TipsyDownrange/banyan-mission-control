/**
 * BAN-338 Pay Apps v2c — Joint Check Agreements sub-section for the PM Panel.
 *
 * Lists joint check agreements for an engagement (resolved via kid) with
 * status badges + lifecycle action buttons.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

interface AgreementRow {
  joint_check_id: string;
  manufacturer_org_id: string;
  manufacturer_name: string | null;
  manufacturer_contact_name: string | null;
  manufacturer_contact_email: string | null;
  scope: string | null;
  status: string;
  trigger_source: string;
  execution_date: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  PROPOSED: { bg: '#fef3c7', fg: 'var(--color-amber-800)' },
  EXECUTED: { bg: '#dbeafe', fg: '#1e40af' },
  ACTIVE: { bg: '#dcfce7', fg: '#166534' },
  CLOSED: { bg: '#f1f5f9', fg: 'var(--bos-color-ink-tertiary)' },
  DISPUTED: { bg: '#fee2e2', fg: 'var(--color-red-700)' },
};

const NEXT_STATES: Record<string, string[]> = {
  PROPOSED: ['EXECUTED', 'DISPUTED', 'CLOSED'],
  EXECUTED: ['ACTIVE', 'DISPUTED', 'CLOSED'],
  ACTIVE: ['CLOSED', 'DISPUTED'],
  DISPUTED: ['EXECUTED', 'ACTIVE', 'CLOSED'],
  CLOSED: [],
};

export default function JointCheckAgreementsSection({ kID }: { kID: string }) {
  const [rows, setRows] = useState<AgreementRow[] | null>(null);
  const [engagementId, setEngagementId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!kID) return;
    setLoading(true);
    setError(null);
    fetch(`/api/joint-check-agreements/by-kid/${encodeURIComponent(kID)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((payload) => {
        setRows(payload.agreements ?? []);
        setEngagementId(payload.engagement?.engagement_id ?? null);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [kID]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function transition(id: string, status: string) {
    const res = await fetch(`/api/joint-check-agreements/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) refresh();
  }

  if (loading) {
    return <div style={{ padding: 16, color: 'var(--bos-color-ink-tertiary)', fontSize: 13 }}>Loading joint check agreements…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fef2f2', color: 'var(--color-red-700)', fontSize: 12 }}>
        Could not load joint check agreements: {error}
      </div>
    );
  }

  return (
    <div style={{
      background: 'white', borderRadius: 14, border: '1px solid var(--color-surface-border)', padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-ink-primary)' }}>Joint Check Agreements</div>
        {engagementId && <CreateForm engagementId={engagementId} onCreated={refresh} />}
      </div>
      {(!rows || rows.length === 0) ? (
        <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>No joint check agreements on this project yet.</div>
      ) : (
        rows.map((r) => {
          const color = STATUS_COLORS[r.status] ?? STATUS_COLORS.PROPOSED;
          return (
            <div key={r.joint_check_id} style={{
              padding: 12, background: 'var(--color-surface)', borderRadius: 10, border: '1px solid var(--color-surface-border)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{r.manufacturer_name ?? r.manufacturer_org_id}</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                  background: color.bg, color: color.fg,
                }}>
                  {r.status}
                </span>
                <span style={{ fontSize: 10, color: 'var(--bos-color-ink-disabled)' }}>{r.trigger_source}</span>
              </div>
              {r.scope && <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>{r.scope}</div>}
              {r.manufacturer_contact_name && (
                <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)' }}>
                  {r.manufacturer_contact_name}{r.manufacturer_contact_email ? ` · ${r.manufacturer_contact_email}` : ''}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                {(NEXT_STATES[r.status] ?? []).map((next) => (
                  <button
                    key={next}
                    onClick={() => transition(r.joint_check_id, next)}
                    style={transitionButtonStyle}
                  >
                    → {next}
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function CreateForm({ engagementId, onCreated }: { engagementId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [manufacturerId, setManufacturerId] = useState('');
  const [scope, setScope] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={addButtonStyle}>+ New Agreement</button>
    );
  }
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6, padding: 10,
      background: '#f1f5f9', borderRadius: 10, width: 320,
    }}>
      <input placeholder="manufacturer org_id" value={manufacturerId} onChange={(e) => setManufacturerId(e.target.value)} style={inputStyle} />
      <input placeholder="contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} style={inputStyle} />
      <input placeholder="contact email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={inputStyle} />
      <textarea placeholder="scope" value={scope} onChange={(e) => setScope(e.target.value)} style={{ ...inputStyle, minHeight: 50 }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          disabled={busy || !manufacturerId.trim()}
          onClick={async () => {
            setBusy(true);
            const res = await fetch('/api/joint-check-agreements', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                engagement_id: engagementId,
                manufacturer_org_id: manufacturerId.trim(),
                manufacturer_contact_name: contactName || undefined,
                manufacturer_contact_email: contactEmail || undefined,
                scope: scope || undefined,
              }),
            });
            setBusy(false);
            if (res.ok) {
              setOpen(false);
              setManufacturerId('');
              setScope('');
              setContactName('');
              setContactEmail('');
              onCreated();
            }
          }}
          style={{ ...transitionButtonStyle, background: '#0c2330', color: 'white' }}
        >
          {busy ? 'Saving…' : 'Create'}
        </button>
        <button onClick={() => setOpen(false)} style={transitionButtonStyle}>Cancel</button>
      </div>
    </div>
  );
}

const transitionButtonStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
  border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer',
};
const addButtonStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
  border: '1px solid #0c2330', background: '#0c2330', color: 'white', cursor: 'pointer',
};
const inputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12,
};
