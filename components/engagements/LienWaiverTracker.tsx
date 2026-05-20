/**
 * BAN-338 Pay Apps v2c — Lien Waiver Tracker sub-section for the PM Panel.
 *
 * Renders per-type status counts + outstanding lien exposure for an
 * engagement. Loads from /api/lien-waivers/by-kid/[kid]. Exposes the
 * "Generate Waiver" manual fallback button when there's a pay app awaiting
 * its auto-generated waiver.
 *
 * Inline-style hex per RF1 (existing convention in PayAppsTab.tsx etc.).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

interface WaiverRow {
  waiver_id: string;
  waiver_type: string;
  state: string;
  pay_app_id: string | null;
  waiver_amount: string | null;
  through_date: string | null;
  trigger_source: string | null;
  generated_at: string | null;
  notarized_at: string | null;
  filed_at: string | null;
}

interface CountsByType {
  total: number;
  generated: number;
  notarized: number;
  filed: number;
  superseded: number;
}

interface TrackerPayload {
  engagement: { engagement_id: string; kid: string; is_test_project: boolean } | null;
  waivers: WaiverRow[];
  counts: Record<string, CountsByType>;
  exposure: number;
}

const TYPE_LABELS: Record<string, string> = {
  CONDITIONAL_PROGRESS: 'Conditional Progress',
  UNCONDITIONAL_PROGRESS: 'Unconditional Progress',
  CONDITIONAL_FINAL: 'Conditional Final',
  UNCONDITIONAL_FINAL: 'Unconditional Final',
};

export default function LienWaiverTracker({ kID }: { kID: string }) {
  const [data, setData] = useState<TrackerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterState, setFilterState] = useState<string>('ALL');

  const refresh = useCallback(() => {
    if (!kID) return;
    setLoading(true);
    setError(null);
    fetch(`/api/lien-waivers/by-kid/${encodeURIComponent(kID)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json() as Promise<TrackerPayload>;
      })
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load lien waivers');
        setLoading(false);
      });
  }, [kID]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div style={{ padding: 20, color: 'var(--bos-color-ink-tertiary)', fontSize: 13 }}>
        Loading lien waivers…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fef2f2', color: 'var(--color-red-700)', fontSize: 12 }}>
        Could not load lien waivers: {error}
      </div>
    );
  }
  if (!data?.engagement) return null;

  const filtered = data.waivers.filter((w) => {
    if (filterType !== 'ALL' && w.waiver_type !== filterType) return false;
    if (filterState !== 'ALL' && w.state !== filterState) return false;
    return true;
  });

  return (
    <div style={{
      background: 'white', borderRadius: 14, border: '1px solid var(--color-surface-border)', padding: 18,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-ink-primary)' }}>Lien Waiver Tracker</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: data.exposure > 0 ? '#b45309' : '#16a34a' }}>
          Outstanding exposure: ${data.exposure.toLocaleString()}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {Object.entries(TYPE_LABELS).map(([type, label]) => {
          const c = data.counts[type] ?? { total: 0, generated: 0, notarized: 0, filed: 0, superseded: 0 };
          return (
            <div key={type} style={{
              padding: 12, borderRadius: 10, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-ink-primary)', marginTop: 4 }}>{c.total}</div>
              <div style={{ fontSize: 10, color: 'var(--bos-color-ink-disabled)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span>Generated: {c.generated}</span>
                <span>Notarized: {c.notarized}</span>
                <span>Filed: {c.filed}</span>
                {c.superseded > 0 && <span>Superseded: {c.superseded}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={selectStyle}>
          <option value="ALL">All types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={filterState} onChange={(e) => setFilterState(e.target.value)} style={selectStyle}>
          <option value="ALL">All states</option>
          <option value="GENERATED">Generated</option>
          <option value="PENDING">Pending</option>
          <option value="NOTARIZED">Notarized</option>
          <option value="FILED">Filed</option>
          <option value="DELIVERED">Delivered</option>
          <option value="RELEASED">Released</option>
          <option value="SUPERSEDED">Superseded</option>
          <option value="VOIDED">Voided</option>
        </select>
        <ManualGenerateButton onGenerated={refresh} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)', padding: '8px 0' }}>No waivers match the current filter.</div>
        ) : (
          filtered.map((w) => (
            <div key={w.waiver_id} style={{
              display: 'grid', gridTemplateColumns: '160px 100px 120px 100px 1fr',
              gap: 10, alignItems: 'center', padding: '8px 10px',
              background: 'var(--color-surface)', borderRadius: 8, fontSize: 12,
            }}>
              <span style={{ fontWeight: 700 }}>{TYPE_LABELS[w.waiver_type] ?? w.waiver_type}</span>
              <span>{w.state}</span>
              <span>${Number(w.waiver_amount ?? 0).toLocaleString()}</span>
              <span style={{ color: 'var(--bos-color-ink-disabled)' }}>{w.through_date ?? '—'}</span>
              <span style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 10 }}>
                {w.trigger_source ?? 'manual'}
                {w.generated_at && ` · gen ${formatDate(w.generated_at)}`}
                {w.notarized_at && ` · not ${formatDate(w.notarized_at)}`}
                {w.filed_at && ` · filed ${formatDate(w.filed_at)}`}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ManualGenerateButton({ onGenerated }: { onGenerated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [payAppId, setPayAppId] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
      <input
        placeholder="pay_app_id (manual gen)"
        value={payAppId}
        onChange={(e) => setPayAppId(e.target.value)}
        style={{ ...selectStyle, width: 220 }}
      />
      <button
        onClick={async () => {
          if (!payAppId.trim()) return;
          setBusy(true);
          setError(null);
          try {
            const res = await fetch('/api/lien-waivers/generate', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ pay_app_id: payAppId.trim() }),
            });
            const body = await res.json();
            if (!res.ok) {
              setError(body.error ?? `Failed (${res.status})`);
            } else {
              onGenerated();
              setPayAppId('');
            }
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy || !payAppId.trim()}
        style={{
          padding: '6px 12px', borderRadius: 8, border: '1px solid #0c2330',
          background: busy ? 'var(--bos-color-ink-tertiary)' : '#0c2330', color: 'white', fontSize: 11, fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? 'Generating…' : 'Generate Waiver'}
      </button>
      {error && <span style={{ color: 'var(--color-red-700)', fontSize: 11 }}>{error}</span>}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 11,
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}
