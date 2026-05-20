/**
 * BAN-374 P6 — Freight calendar admin manager.
 *
 * Mounts under /admin/freight-calendar and is the canonical operator surface
 * for the Matson / Pasha / Young Brothers sailing schedule that drives the
 * Hawaii freight overlay on project Schedule tabs.  The API gate
 * (passScheduleWriteGate / passScheduleReadGate) is the source of truth for
 * authorization; this UI hides write controls when the session lacks a known
 * write role to avoid showing buttons that will server-side 403.
 */

'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSession } from 'next-auth/react';

const SCHEDULE_WRITE_ROLES = new Set(['pm', 'business_admin', 'super_admin']);

export type FreightCalendarRow = {
  freight_calendar_id: string;
  carrier: string;
  route: string;
  sailing_date: string;
  arrival_date: string;
  cutoff_date: string;
  notes: string | null;
};

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rows: FreightCalendarRow[] };

type FormState = {
  freight_calendar_id: string | null;
  carrier: string;
  route: string;
  sailing_date: string;
  arrival_date: string;
  cutoff_date: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  freight_calendar_id: null,
  carrier: 'Matson',
  route: '',
  sailing_date: '',
  arrival_date: '',
  cutoff_date: '',
  notes: '',
};

const PAGE_WRAP: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 18,
};
const FILTER_ROW: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap',
};
const FIELD_LABEL: CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--bos-color-ink-tertiary)', marginBottom: 4,
};
const FIELD_INPUT: CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1',
  fontSize: 13, color: 'var(--color-ink-primary)', background: 'white', minWidth: 140,
};
const PRIMARY_BUTTON: CSSProperties = {
  padding: '9px 14px', borderRadius: 10, border: 'none',
  background: 'var(--bos-color-brand-primary-deep)', color: 'white', fontSize: 12, fontWeight: 800,
  letterSpacing: '0.05em', cursor: 'pointer',
};
const GHOST_BUTTON: CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1',
  background: 'white', color: 'var(--color-ink-primary)', fontSize: 11, fontWeight: 700,
  cursor: 'pointer',
};
const DANGER_BUTTON: CSSProperties = {
  ...GHOST_BUTTON, color: '#b91c1c', borderColor: '#fecaca',
};
const HEADER_CELL: CSSProperties = {
  padding: '10px 12px', fontSize: 10, fontWeight: 800,
  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bos-color-ink-tertiary)',
  textAlign: 'left',
};
const CELL: CSSProperties = {
  padding: '10px 12px', fontSize: 13, color: 'var(--color-ink-primary)',
  borderBottom: '1px solid #f1f5f9', verticalAlign: 'top',
};
const MODAL_BACKDROP: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
};
const MODAL_PANEL: CSSProperties = {
  background: 'white', borderRadius: 16, padding: '20px 22px',
  width: 'min(520px, 92vw)', display: 'flex', flexDirection: 'column', gap: 12,
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(s: string): string {
  if (!s) return '—';
  const [y, mo, d] = s.split('-');
  if (!y || !mo || !d) return s;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FreightCalendarManager() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? 'none';
  const canWrite = SCHEDULE_WRITE_ROLES.has(role);

  const [state, setState] = useState<FetchState>({ kind: 'loading' });
  const [filterCarrier, setFilterCarrier] = useState<string>('Matson');
  const [filterRoute, setFilterRoute] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState({ kind: 'loading' });
    const params = new URLSearchParams();
    if (filterRoute) params.set('route', filterRoute);
    if (filterFrom) params.set('from', filterFrom);
    if (filterTo) params.set('to', filterTo);
    const qs = params.toString();
    try {
      const r = await fetch(`/api/schedule/freight-calendar${qs ? `?${qs}` : ''}`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${r.status})`);
      }
      const payload = await r.json() as { items: FreightCalendarRow[] };
      setState({ kind: 'ready', rows: payload.items ?? [] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load freight calendar';
      setState({ kind: 'error', message: msg });
    }
  }, [filterRoute, filterFrom, filterTo]);

  useEffect(() => { void refresh(); }, [refresh]);

  const carrierFilteredRows = useMemo(() => {
    if (state.kind !== 'ready') return [];
    if (!filterCarrier) return state.rows;
    return state.rows.filter((r) => r.carrier.toLowerCase() === filterCarrier.toLowerCase());
  }, [state, filterCarrier]);

  const carriers = useMemo(() => {
    if (state.kind !== 'ready') return ['Matson'];
    const set = new Set<string>(['Matson']);
    state.rows.forEach((r) => { if (r.carrier) set.add(r.carrier); });
    return Array.from(set).sort();
  }, [state]);

  const routeSuggestions = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return Array.from(new Set(state.rows.map((r) => r.route).filter(Boolean))).sort();
  }, [state]);

  function openAddForm() {
    setForm({ ...EMPTY_FORM, sailing_date: todayISO() });
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(row: FreightCalendarRow) {
    setForm({
      freight_calendar_id: row.freight_calendar_id,
      carrier: row.carrier,
      route: row.route,
      sailing_date: row.sailing_date,
      arrival_date: row.arrival_date,
      cutoff_date: row.cutoff_date,
      notes: row.notes ?? '',
    });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (busy) return;
    setFormOpen(false);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function submitForm() {
    setBusy(true);
    setFormError(null);
    const payload: Record<string, string | null> = {
      carrier: form.carrier.trim() || 'Matson',
      route: form.route.trim(),
      sailing_date: form.sailing_date,
      arrival_date: form.arrival_date,
      cutoff_date: form.cutoff_date,
      notes: form.notes.trim() ? form.notes.trim() : null,
    };
    try {
      const isEdit = !!form.freight_calendar_id;
      const url = isEdit
        ? `/api/schedule/freight-calendar/${form.freight_calendar_id}`
        : '/api/schedule/freight-calendar';
      const r = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${r.status})`);
      }
      setFormOpen(false);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setFormError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function softDelete(id: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/schedule/freight-calendar/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${r.status})`);
      }
      setPendingDeleteId(null);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      setState({ kind: 'error', message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={PAGE_WRAP} data-testid="freight-calendar-manager">
      <div style={FILTER_ROW}>
        <div>
          <div style={FIELD_LABEL}>Carrier</div>
          <select
            data-testid="freight-filter-carrier"
            value={filterCarrier}
            onChange={(e) => setFilterCarrier(e.target.value)}
            style={FIELD_INPUT}
          >
            <option value="">All carriers</option>
            {carriers.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={FIELD_LABEL}>Route</div>
          <input
            data-testid="freight-filter-route"
            type="text"
            placeholder="e.g. Long Beach → Honolulu"
            value={filterRoute}
            onChange={(e) => setFilterRoute(e.target.value)}
            style={FIELD_INPUT}
            list="freight-route-options"
          />
          <datalist id="freight-route-options">
            {routeSuggestions.map((r) => (<option key={r} value={r} />))}
          </datalist>
        </div>
        <div>
          <div style={FIELD_LABEL}>Sailing from</div>
          <input
            data-testid="freight-filter-from"
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            style={FIELD_INPUT}
          />
        </div>
        <div>
          <div style={FIELD_LABEL}>Sailing to</div>
          <input
            data-testid="freight-filter-to"
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            style={FIELD_INPUT}
          />
        </div>
        <div style={{ flex: 1 }} />
        {canWrite ? (
          <button
            type="button"
            data-testid="freight-add-button"
            onClick={openAddForm}
            style={PRIMARY_BUTTON}
          >
            + Add Sailing
          </button>
        ) : null}
      </div>

      {state.kind === 'loading' && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', fontSize: 13 }}>
          Loading freight calendar…
        </div>
      )}

      {state.kind === 'error' && (
        <div
          data-testid="freight-error"
          style={{
            padding: '14px 16px', borderRadius: 12, background: '#fef2f2',
            color: '#b91c1c', fontSize: 13, fontWeight: 700,
          }}
        >
          Could not load freight calendar: {state.message}
        </div>
      )}

      {state.kind === 'ready' && carrierFilteredRows.length === 0 && (
        <div
          data-testid="freight-empty"
          style={{
            padding: '40px 24px', borderRadius: 14, border: '1px solid #e2e8f0',
            background: 'white', textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink-primary)', marginBottom: 6 }}>
            No sailings on file
          </div>
          <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)', maxWidth: 420, margin: '0 auto' }}>
            Add Matson sailing schedule entries here. They appear as overlays on
            project Schedule tabs so PMs can align ordering and install dates
            with arrival windows.
          </div>
        </div>
      )}

      {state.kind === 'ready' && carrierFilteredRows.length > 0 && (
        <div style={{
          background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={HEADER_CELL}>Carrier</th>
                <th style={HEADER_CELL}>Route</th>
                <th style={HEADER_CELL}>Cutoff</th>
                <th style={HEADER_CELL}>Sailing</th>
                <th style={HEADER_CELL}>Arrival</th>
                <th style={HEADER_CELL}>Notes</th>
                {canWrite ? <th style={HEADER_CELL}>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {carrierFilteredRows.map((row) => (
                <tr key={row.freight_calendar_id} data-testid="freight-row">
                  <td style={CELL}>{row.carrier}</td>
                  <td style={CELL}>{row.route}</td>
                  <td style={CELL}>{formatDate(row.cutoff_date)}</td>
                  <td style={CELL}>{formatDate(row.sailing_date)}</td>
                  <td style={CELL}>{formatDate(row.arrival_date)}</td>
                  <td style={CELL} title={row.notes ?? ''}>
                    {row.notes ? <span>{row.notes}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  {canWrite ? (
                    <td style={CELL}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          data-testid="freight-edit-button"
                          onClick={() => openEditForm(row)}
                          style={GHOST_BUTTON}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          data-testid="freight-delete-button"
                          onClick={() => setPendingDeleteId(row.freight_calendar_id)}
                          style={DANGER_BUTTON}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen ? (
        <div style={MODAL_BACKDROP} data-testid="freight-form-modal">
          <div style={MODAL_PANEL}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink-primary)' }}>
              {form.freight_calendar_id ? 'Edit sailing' : 'Add sailing'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={FIELD_LABEL}>Carrier</div>
                <input
                  data-testid="freight-form-carrier"
                  type="text"
                  value={form.carrier}
                  onChange={(e) => setForm({ ...form, carrier: e.target.value })}
                  style={FIELD_INPUT}
                />
              </div>
              <div>
                <div style={FIELD_LABEL}>Route</div>
                <input
                  data-testid="freight-form-route"
                  type="text"
                  value={form.route}
                  onChange={(e) => setForm({ ...form, route: e.target.value })}
                  style={FIELD_INPUT}
                  list="freight-route-options"
                />
              </div>
              <div>
                <div style={FIELD_LABEL}>Cutoff date</div>
                <input
                  data-testid="freight-form-cutoff"
                  type="date"
                  value={form.cutoff_date}
                  onChange={(e) => setForm({ ...form, cutoff_date: e.target.value })}
                  style={FIELD_INPUT}
                />
              </div>
              <div>
                <div style={FIELD_LABEL}>Sailing date</div>
                <input
                  data-testid="freight-form-sailing"
                  type="date"
                  value={form.sailing_date}
                  onChange={(e) => setForm({ ...form, sailing_date: e.target.value })}
                  style={FIELD_INPUT}
                />
              </div>
              <div style={{ gridColumn: '1 / span 2' }}>
                <div style={FIELD_LABEL}>Arrival date</div>
                <input
                  data-testid="freight-form-arrival"
                  type="date"
                  value={form.arrival_date}
                  onChange={(e) => setForm({ ...form, arrival_date: e.target.value })}
                  style={FIELD_INPUT}
                />
              </div>
              <div style={{ gridColumn: '1 / span 2' }}>
                <div style={FIELD_LABEL}>Notes</div>
                <input
                  data-testid="freight-form-notes"
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  style={{ ...FIELD_INPUT, width: '100%' }}
                />
              </div>
            </div>
            {formError ? (
              <div
                data-testid="freight-form-error"
                style={{
                  padding: '8px 12px', borderRadius: 8, background: '#fef2f2',
                  color: '#b91c1c', fontSize: 12, fontWeight: 700,
                }}
              >
                {formError}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                data-testid="freight-form-cancel"
                onClick={closeForm}
                style={GHOST_BUTTON}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="freight-form-submit"
                onClick={submitForm}
                style={PRIMARY_BUTTON}
                disabled={busy}
              >
                {busy ? 'Saving…' : form.freight_calendar_id ? 'Save changes' : 'Add sailing'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteId ? (
        <div style={MODAL_BACKDROP} data-testid="freight-delete-modal">
          <div style={MODAL_PANEL}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink-primary)' }}>
              Remove sailing?
            </div>
            <div style={{ fontSize: 13, color: '#475569' }}>
              This soft-deletes the entry. It will no longer overlay on project
              Schedule tabs, but its history is preserved in the audit trail.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                data-testid="freight-delete-cancel"
                onClick={() => setPendingDeleteId(null)}
                style={GHOST_BUTTON}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="freight-delete-confirm"
                onClick={() => softDelete(pendingDeleteId)}
                style={{ ...PRIMARY_BUTTON, background: '#b91c1c' }}
                disabled={busy}
              >
                {busy ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
