'use client';

/**
 * BAN-376 Customer Pipeline — Unified Intake Inbox (spec §7.1).
 *
 * Default filter excludes terminal states (LOST + CONVERTED) and
 * is_test_project=true.  Operators can widen the filter via the chips.
 * Selecting a row hands off to <InquiryDetailPanel> via onSelect.
 */

import { useEffect, useMemo, useState } from 'react';

export type InquiryRow = {
  inquiry_id: string;
  inquiry_number: string;
  source: string;
  customer_name: string;
  inquiry_type_initial: string;
  estimated_value_band: string;
  assigned_to_user_id: string | null;
  assigned_role: string | null;
  state: string;
  created_at: string;
};

export const STATE_FILTERS = ['NEW', 'IN_DISCUSSION', 'QUOTED', 'AWARDED', 'LOST', 'DEFERRED', 'CONVERTED'] as const;
export const SOURCE_FILTERS = ['', 'PHONE', 'EMAIL', 'WALK_IN', 'RFP', 'OTHER'] as const;

type Props = {
  fetchInquiries?: (params: URLSearchParams) => Promise<{ items: InquiryRow[] }>;
  onSelect?: (row: InquiryRow) => void;
  onCreateNew?: () => void;
};

async function defaultFetch(params: URLSearchParams) {
  const res = await fetch(`/api/inquiries?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ items: InquiryRow[] }>;
}

export default function InquiryInboxList({ fetchInquiries, onSelect, onCreateNew }: Props) {
  const [states, setStates] = useState<Set<string>>(new Set(['NEW', 'IN_DISCUSSION', 'QUOTED']));
  const [source, setSource] = useState<string>('');
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    for (const s of states) p.append('state', s);
    if (source) p.set('source', source);
    return p;
  }, [states, source]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (fetchInquiries ?? defaultFetch)(params)
      .then(data => { if (!cancelled) setRows(data.items || []); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params, fetchInquiries]);

  function toggleState(s: string) {
    setStates(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  return (
    <section aria-label="Customer Pipeline inbox" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Customer Pipeline</h2>
        {onCreateNew && (
          <button onClick={onCreateNew} style={{ padding: '6px 12px', background: '#0d1f2d', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' }}>
            + New inquiry
          </button>
        )}
      </header>

      <div role="group" aria-label="State filter" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STATE_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => toggleState(s)}
            aria-pressed={states.has(s)}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              border: '1px solid var(--bos-color-ink-tertiary)',
              background: states.has(s) ? '#0d1f2d' : 'white',
              color: states.has(s) ? 'white' : '#0d1f2d',
              cursor: 'pointer',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <label style={{ fontSize: 12 }}>
        Source filter{' '}
        <select aria-label="Source filter" value={source} onChange={e => setSource(e.target.value)}>
          {SOURCE_FILTERS.map(s => <option key={s || 'any'} value={s}>{s || 'Any source'}</option>)}
        </select>
      </label>

      {loading && <div role="status">Loading…</div>}
      {error && <div role="alert" style={{ color: '#b91c1c' }}>{error}</div>}

      {!loading && !error && (
        <table aria-label="Inquiry list" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
              <th style={{ textAlign: 'left', padding: 6 }}>#</th>
              <th style={{ textAlign: 'left', padding: 6 }}>Customer</th>
              <th style={{ textAlign: 'left', padding: 6 }}>Source</th>
              <th style={{ textAlign: 'left', padding: 6 }}>State</th>
              <th style={{ textAlign: 'left', padding: 6 }}>Assigned</th>
              <th style={{ textAlign: 'left', padding: 6 }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: 'var(--bos-color-ink-disabled)', textAlign: 'center' }}>
                  No inquiries match the current filter.
                </td>
              </tr>
            )}
            {rows.map(r => (
              <tr
                key={r.inquiry_id}
                onClick={() => onSelect?.(r)}
                style={{ cursor: onSelect ? 'pointer' : 'default', borderBottom: '1px solid var(--color-surface-border)' }}
              >
                <td style={{ padding: 6, fontFamily: 'monospace' }}>{r.inquiry_number}</td>
                <td style={{ padding: 6 }}>{r.customer_name}</td>
                <td style={{ padding: 6 }}>{r.source}</td>
                <td style={{ padding: 6 }}>{r.state}</td>
                <td style={{ padding: 6 }}>{r.assigned_role || '—'}</td>
                <td style={{ padding: 6 }}>{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
