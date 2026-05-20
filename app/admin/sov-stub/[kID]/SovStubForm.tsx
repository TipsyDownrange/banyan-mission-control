/**
 * BAN-336 Pay App Core — client form that drives the admin SOV-stub create
 * + lock endpoints. Reuses /api/aia/billing/by-kid/[kid] to resolve
 * kID → engagement_id, then POSTs /api/admin/sov-stub.
 */

'use client';

import { useEffect, useState } from 'react';

type Line = {
  line_number: number;
  description: string;
  scheduled_value: string;
  retainage_pct: string;
  parent_line_number?: string;
  display_item_number?: string;
};

type SovVersionRef = {
  sov_version_id: string;
  version_number: number;
  state: string;
};

interface Resolved {
  engagement_id: string | null;
  sovVersions: SovVersionRef[];
}

const EMPTY_LINE = (n: number): Line => ({
  line_number: n,
  description: '',
  scheduled_value: '',
  retainage_pct: '10',
  parent_line_number: '',
  display_item_number: String(n),
});

export default function SovStubForm({ kID }: { kID: string }) {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [resolving, setResolving] = useState(true);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([
    EMPTY_LINE(1), EMPTY_LINE(2), EMPTY_LINE(3), EMPTY_LINE(4), EMPTY_LINE(5),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdVersion, setCreatedVersion] = useState<{ sov_version_id: string; line_count: number } | null>(null);
  const [locking, setLocking] = useState(false);
  const [lockedAt, setLockedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/aia/billing/by-kid/${encodeURIComponent(kID)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.engagement?.engagement_id) {
          setResolved({
            engagement_id: data.engagement.engagement_id,
            sovVersions: data.sovVersions ?? [],
          });
        } else {
          setResolved({ engagement_id: null, sovVersions: [] });
          setResolveError(`kID ${kID} is not in the Postgres billing system yet. Create the engagement first.`);
        }
        setResolving(false);
      })
      .catch((err) => {
        setResolveError(err instanceof Error ? err.message : 'Failed to resolve engagement');
        setResolving(false);
      });
  }, [kID]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, EMPTY_LINE(prev.length + 1)]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i).map((l, idx) => ({ ...l, line_number: idx + 1 })));
  }

  async function submitCreate() {
    if (!resolved?.engagement_id) return;
    const cleaned = lines.filter((l) => l.description.trim() && Number(l.scheduled_value) > 0);
    if (cleaned.length === 0) {
      setSubmitError('Add at least one line with a description and scheduled value');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const body = {
      engagement_id: resolved.engagement_id,
      source_kind: 'MANAGER_OVERRIDE',
      lines: cleaned.map((l) => ({
        line_number: l.line_number,
        description: l.description,
        scheduled_value: Number(l.scheduled_value),
        retainage_pct: Number(l.retainage_pct || 0),
        parent_line_id: l.parent_line_number || null,
        display_item_number: l.display_item_number || null,
      })),
    };
    try {
      const res = await fetch('/api/admin/sov-stub', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? `Create failed (${res.status})`);
      } else {
        setCreatedVersion({ sov_version_id: data.sov_version_id, line_count: data.line_count });
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function lockSov() {
    if (!createdVersion) return;
    setLocking(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/sov-stub/${createdVersion.sov_version_id}/lock`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? `Lock failed (${res.status})`);
      } else {
        setLockedAt(new Date().toISOString());
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLocking(false);
    }
  }

  if (resolving) {
    return <div style={{ color: 'var(--bos-color-ink-tertiary)', padding: 40, textAlign: 'center' }}>Resolving engagement…</div>;
  }

  if (resolveError || !resolved?.engagement_id) {
    return (
      <div style={{
        padding: '16px 20px', borderRadius: 12, background: '#fef2f2',
        border: '1px solid rgba(185,28,28,0.2)', color: '#b91c1c', fontSize: 13,
      }}>
        {resolveError ?? 'No engagement for this kID'}
      </div>
    );
  }

  if (lockedAt) {
    return (
      <div style={{
        padding: '20px 24px', borderRadius: 14, background: '#ecfdf5',
        border: '1px solid #a7f3d0', color: '#065f46', fontSize: 14,
      }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>SOV created and locked ✓</div>
        <div style={{ marginTop: 6 }}>
          SOV version {createdVersion?.sov_version_id} ({createdVersion?.line_count} lines) is now LOCKED.
          You can now create a Pay App on the project workspace pay-apps tab.
        </div>
      </div>
    );
  }

  if (createdVersion) {
    return (
      <div style={{
        padding: 20, borderRadius: 14, background: '#fef3c7',
        border: '1px solid #fde68a', color: '#92400e', fontSize: 13,
      }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>
          SOV created — {createdVersion.line_count} lines (state: APPROVED_INTERNAL)
        </div>
        <div style={{ marginBottom: 12 }}>
          Lock it now to enable the Pay App create wizard. Locking is permanent
          for this version — create a new version if you need to amend.
        </div>
        <button
          onClick={lockSov}
          disabled={locking}
          style={{
            background: '#0c2330', color: '#fff', border: 'none',
            padding: '10px 20px', borderRadius: 10, fontSize: 13,
            fontWeight: 700, cursor: locking ? 'wait' : 'pointer',
          }}
        >
          {locking ? 'Locking…' : 'Lock SOV →'}
        </button>
        {submitError && <div style={{ marginTop: 10, color: '#b91c1c' }}>{submitError}</div>}
      </div>
    );
  }

  return (
    <div>
      {resolved.sovVersions.length > 0 && (
        <div style={{
          padding: '12px 16px', borderRadius: 12, background: '#fef3c7',
          border: '1px solid #fde68a', color: '#92400e', fontSize: 12, marginBottom: 14,
        }}>
          This engagement already has {resolved.sovVersions.length} SOV version
          {resolved.sovVersions.length === 1 ? '' : 's'}
          {' '}(latest state: {resolved.sovVersions[0].state}). Submitting will
          create a new version on top of the existing chain.
        </div>
      )}

      <div style={{
        background: 'white', borderRadius: 16, border: '1px solid #e2e8f0',
        padding: 18, marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>
          Line Items
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 80px 1fr 130px 80px 60px 40px', gap: 8, marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-disabled)' }}>
          <div>#</div>
          <div>Display #</div>
          <div>Description</div>
          <div>Scheduled $</div>
          <div>Retn %</div>
          <div>Parent</div>
          <div></div>
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 80px 1fr 130px 80px 60px 40px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>{l.line_number}</div>
            <input
              value={l.display_item_number ?? ''}
              onChange={(e) => updateLine(i, { display_item_number: e.target.value })}
              style={inputStyle}
            />
            <input
              value={l.description}
              onChange={(e) => updateLine(i, { description: e.target.value })}
              placeholder="Description"
              style={inputStyle}
            />
            <input
              value={l.scheduled_value}
              onChange={(e) => updateLine(i, { scheduled_value: e.target.value })}
              inputMode="decimal"
              placeholder="0.00"
              style={inputStyle}
            />
            <input
              value={l.retainage_pct}
              onChange={(e) => updateLine(i, { retainage_pct: e.target.value })}
              inputMode="decimal"
              style={inputStyle}
            />
            <input
              value={l.parent_line_number ?? ''}
              onChange={(e) => updateLine(i, { parent_line_number: e.target.value })}
              placeholder="—"
              style={inputStyle}
            />
            <button
              onClick={() => removeLine(i)}
              style={{
                background: 'transparent', color: '#b91c1c', border: 'none',
                cursor: 'pointer', fontSize: 16, fontWeight: 700,
              }}
              aria-label="Remove line"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={addLine}
          style={{
            marginTop: 10, background: '#f1f5f9', color: '#0f172a',
            border: '1px solid #cbd5e1', padding: '8px 16px',
            borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          + Add line
        </button>
      </div>

      <button
        onClick={submitCreate}
        disabled={submitting}
        style={{
          background: '#0c2330', color: '#fff', border: 'none',
          padding: '12px 24px', borderRadius: 12, fontSize: 14,
          fontWeight: 700, cursor: submitting ? 'wait' : 'pointer',
        }}
      >
        {submitting ? 'Creating SOV…' : 'Create SOV Stub'}
      </button>
      {submitError && (
        <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 13 }}>
          {submitError}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box' as const,
};
