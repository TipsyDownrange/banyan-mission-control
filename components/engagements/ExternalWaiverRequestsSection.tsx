/**
 * BAN-338 Pay Apps v2c — External Waiver Requests sub-section for the PM Panel.
 *
 * Admin-primary workflow: tracks waivers we're collecting FROM manufacturers
 * and forwarding TO the GC. Renders days-outstanding badge (red/yellow/green)
 * per BAN-338 thresholds, plus upload-received + mark-delivered actions.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

interface ExternalWaiverRow {
  external_waiver_id: string;
  manufacturer_org_id: string;
  manufacturer_name: string | null;
  waiver_type: string;
  status: string;
  requested_at: string;
  received_at: string | null;
  uploaded_at: string | null;
  delivered_to_gc_at: string | null;
  request_method: string | null;
  pay_app_id: string | null;
  notes: string | null;
}

interface OverdueRow {
  external_waiver_id: string;
  days_outstanding: number;
  badge: 'GREEN' | 'YELLOW' | 'RED';
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  REQUESTED: { bg: '#fef3c7', fg: '#92400e' },
  RECEIVED: { bg: '#dbeafe', fg: '#1e40af' },
  UPLOADED: { bg: '#e0e7ff', fg: '#3730a3' },
  DELIVERED_TO_GC: { bg: '#dcfce7', fg: '#166534' },
  VOIDED: { bg: '#f1f5f9', fg: '#475569' },
};

const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  GREEN: { bg: '#dcfce7', fg: '#166534' },
  YELLOW: { bg: '#fef3c7', fg: '#92400e' },
  RED: { bg: '#fee2e2', fg: '#b91c1c' },
};

export default function ExternalWaiverRequestsSection({ kID }: { kID: string }) {
  const [rows, setRows] = useState<ExternalWaiverRow[]>([]);
  const [overdue, setOverdue] = useState<Record<string, OverdueRow>>({});
  const [engagementId, setEngagementId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!kID) return;
    setLoading(true);
    fetch(`/api/external-waivers/by-kid/${encodeURIComponent(kID)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((payload) => {
        setRows(payload.external_waivers ?? []);
        setEngagementId(payload.engagement?.engagement_id ?? null);
        const overdueMap: Record<string, OverdueRow> = {};
        for (const o of (payload.overdue ?? []) as OverdueRow[]) {
          overdueMap[o.external_waiver_id] = o;
        }
        setOverdue(overdueMap);
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

  async function uploadReceived(id: string, drive_id: string) {
    if (!drive_id.trim()) return;
    await fetch(`/api/external-waivers/${id}/upload-received`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ received_evidence_drive_id: drive_id.trim() }),
    });
    refresh();
  }

  async function markDelivered(id: string, drive_id: string) {
    if (!drive_id.trim()) return;
    await fetch(`/api/external-waivers/${id}/mark-delivered`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ delivered_to_gc_evidence_drive_id: drive_id.trim() }),
    });
    refresh();
  }

  if (loading) {
    return <div style={{ padding: 16, color: 'var(--bos-color-ink-tertiary)', fontSize: 13 }}>Loading external waivers…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', fontSize: 12 }}>
        Could not load external waivers: {error}
      </div>
    );
  }

  return (
    <div style={{
      background: 'white', borderRadius: 14, border: '1px solid var(--color-surface-border)', padding: 18,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-ink-primary)' }}>External Waiver Requests</div>
        {engagementId && <CreateExternalForm engagementId={engagementId} onCreated={refresh} />}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>No external waiver requests on this project yet.</div>
      ) : rows.map((r) => {
        const sColor = STATUS_COLORS[r.status] ?? STATUS_COLORS.REQUESTED;
        const o = overdue[r.external_waiver_id];
        return (
          <div key={r.external_waiver_id} style={{
            padding: 12, background: '#f8fafc', borderRadius: 10, border: '1px solid var(--color-surface-border)',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{r.manufacturer_name ?? r.manufacturer_org_id}</span>
              <span style={{ fontSize: 11, color: '#475569' }}>{r.waiver_type}</span>
              <span style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                background: sColor.bg, color: sColor.fg,
              }}>
                {r.status}
              </span>
              {o && (
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                  background: BADGE_COLORS[o.badge].bg, color: BADGE_COLORS[o.badge].fg,
                }}>
                  {o.days_outstanding}d {o.badge}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)' }}>
              Requested {new Date(r.requested_at).toISOString().slice(0, 10)}
              {r.request_method && ` via ${r.request_method}`}
            </div>
            {(r.status === 'REQUESTED' || r.status === 'RECEIVED') && (
              <UploadInput onSubmit={(d) => uploadReceived(r.external_waiver_id, d)} placeholder="received drive_id" buttonLabel="Upload Received" />
            )}
            {r.status === 'UPLOADED' && (
              <UploadInput onSubmit={(d) => markDelivered(r.external_waiver_id, d)} placeholder="delivered-to-GC drive_id" buttonLabel="Mark Delivered" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function UploadInput({ onSubmit, placeholder, buttonLabel }: { onSubmit: (v: string) => void; placeholder: string; buttonLabel: string }) {
  const [v, setV] = useState('');
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} style={{
        padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, flex: 1,
      }} />
      <button
        onClick={() => { onSubmit(v); setV(''); }}
        disabled={!v.trim()}
        style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
          border: '1px solid #0c2330', background: '#0c2330', color: 'white',
          cursor: v.trim() ? 'pointer' : 'not-allowed', opacity: v.trim() ? 1 : 0.5,
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function CreateExternalForm({ engagementId, onCreated }: { engagementId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [manufacturerId, setManufacturerId] = useState('');
  const [waiverType, setWaiverType] = useState('CONDITIONAL_PROGRESS');
  const [method, setMethod] = useState('EMAIL');
  const [contactEmail, setContactEmail] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
        border: '1px solid #0c2330', background: '#0c2330', color: 'white', cursor: 'pointer',
      }}>
        + New Request
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: '#f1f5f9', borderRadius: 10, width: 320 }}>
      <input placeholder="manufacturer org_id" value={manufacturerId} onChange={(e) => setManufacturerId(e.target.value)} style={inputStyle} />
      <input placeholder="contact email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={inputStyle} />
      <select value={waiverType} onChange={(e) => setWaiverType(e.target.value)} style={inputStyle}>
        <option value="CONDITIONAL_PROGRESS">Conditional Progress</option>
        <option value="UNCONDITIONAL_PROGRESS">Unconditional Progress</option>
        <option value="CONDITIONAL_FINAL">Conditional Final</option>
        <option value="UNCONDITIONAL_FINAL">Unconditional Final</option>
      </select>
      <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
        <option value="EMAIL">Email</option>
        <option value="PORTAL">Portal</option>
        <option value="MAIL">Mail</option>
        <option value="PHONE">Phone</option>
      </select>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          disabled={busy || !manufacturerId.trim()}
          onClick={async () => {
            setBusy(true);
            const res = await fetch('/api/external-waivers/request', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                engagement_id: engagementId,
                manufacturer_org_id: manufacturerId.trim(),
                manufacturer_contact_email: contactEmail || undefined,
                waiver_type: waiverType,
                request_method: method,
              }),
            });
            setBusy(false);
            if (res.ok) {
              setOpen(false);
              setManufacturerId('');
              setContactEmail('');
              onCreated();
            }
          }}
          style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            border: '1px solid #0c2330', background: '#0c2330', color: 'white', cursor: 'pointer',
          }}
        >
          {busy ? 'Saving…' : 'Request Waiver'}
        </button>
        <button onClick={() => setOpen(false)} style={{
          padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
          border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer',
        }}>Cancel</button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12,
};
