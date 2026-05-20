/**
 * BAN-375 Closeout v1.1.1 Phase 1 — Subcontractors admin table.
 *
 * Tab-filtered list of subs (Framers / Waterproofers). Read-only display in
 * this phase; create/edit modals are deferred to Phase 2 once Sean confirms
 * the desired entry-flow shape. The page can still be reached and proves the
 * API surface end-to-end.
 *
 * Inline-style hex per existing engagement-surface convention (RF1).
 */

'use client';

import { useEffect, useState, type CSSProperties } from 'react';

export type SubcontractorRow = {
  subcontractor_id: string;
  company_name: string;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  trade: string;
  island: string | null;
  active: boolean;
  notes: string | null;
};

export const SUBS_TRADES = ['framer', 'waterproofer'] as const;
export type SubsTrade = typeof SUBS_TRADES[number];

const TRADE_TAB_LABEL: Record<SubsTrade, string> = {
  framer: 'Framers',
  waterproofer: 'Waterproofers',
};

const TAB_BASE: CSSProperties = {
  padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 800,
  letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none',
  border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569',
};
const TAB_ACTIVE: CSSProperties = {
  ...TAB_BASE,
  background: '#0f766e',
  borderColor: '#0f766e',
  color: 'white',
};

const CELL: CSSProperties = {
  padding: '10px 12px', fontSize: 13, color: '#0f172a',
  borderBottom: '1px solid #f1f5f9', verticalAlign: 'top',
};
const HEADER_CELL: CSSProperties = {
  padding: '10px 12px', fontSize: 10, fontWeight: 800,
  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bos-color-ink-tertiary)',
  textAlign: 'left',
};

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rows: SubcontractorRow[] };

export function SubcontractorsTableView({
  state, activeTrade, onSelectTrade,
}: {
  state: FetchState;
  activeTrade: SubsTrade;
  onSelectTrade: (t: SubsTrade) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8 }} data-testid="subs-trade-tabs">
        {SUBS_TRADES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onSelectTrade(t)}
            style={t === activeTrade ? TAB_ACTIVE : TAB_BASE}
          >
            {TRADE_TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {state.kind === 'loading' && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', fontSize: 13 }}>
          Loading subcontractors…
        </div>
      )}

      {state.kind === 'error' && (
        <div style={{
          padding: '14px 16px', borderRadius: 12, background: '#fef2f2',
          color: '#b91c1c', fontSize: 13, fontWeight: 700,
        }}>
          Could not load subcontractors: {state.message}
        </div>
      )}

      {state.kind === 'ready' && state.rows.length === 0 && (
        <div style={{
          padding: '40px 24px', borderRadius: 14, border: '1px solid #e2e8f0',
          background: 'white', textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
            No {TRADE_TAB_LABEL[activeTrade].toLowerCase()} on file
          </div>
          <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>
            POST to <code>/api/closeout/subcontractors</code> to add one (business_admin).
          </div>
        </div>
      )}

      {state.kind === 'ready' && state.rows.length > 0 && (
        <div style={{
          background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={HEADER_CELL}>Company</th>
                <th style={HEADER_CELL}>Primary contact</th>
                <th style={HEADER_CELL}>Island</th>
                <th style={HEADER_CELL}>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.subcontractor_id} data-testid="subs-row">
                  <td style={CELL}>
                    <div style={{ fontWeight: 700 }}>{row.company_name}</div>
                    {row.notes && (
                      <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 4 }}>
                        {row.notes}
                      </div>
                    )}
                  </td>
                  <td style={CELL}>
                    <div>{row.primary_contact_name || '—'}</div>
                    {row.primary_contact_email && (
                      <div style={{ fontSize: 11, color: '#475569' }}>{row.primary_contact_email}</div>
                    )}
                    {row.primary_contact_phone && (
                      <div style={{ fontSize: 11, color: '#475569' }}>{row.primary_contact_phone}</div>
                    )}
                  </td>
                  <td style={CELL}>{row.island ?? '—'}</td>
                  <td style={CELL}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                      background: row.active ? '#dcfce7' : '#fee2e2',
                      color: row.active ? '#166534' : '#b91c1c',
                    }}>
                      {row.active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SubcontractorsTable() {
  const [activeTrade, setActiveTrade] = useState<SubsTrade>('framer');
  const [state, setState] = useState<FetchState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    fetch(`/api/closeout/subcontractors?trade=${activeTrade}&active=true`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${r.status})`);
        }
        return r.json() as Promise<{ subcontractors: SubcontractorRow[] }>;
      })
      .then((payload) => {
        if (cancelled) return;
        setState({ kind: 'ready', rows: payload.subcontractors });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ kind: 'error', message: err.message || 'Failed to load subcontractors' });
      });
    return () => { cancelled = true; };
  }, [activeTrade]);

  return (
    <SubcontractorsTableView
      state={state}
      activeTrade={activeTrade}
      onSelectTrade={setActiveTrade}
    />
  );
}

export { type FetchState as _FetchState };
