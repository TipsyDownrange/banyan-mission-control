'use client';
import { useEffect, useState } from 'react';

type WOResult = {
  wo_id: string; wo_number: string; name: string; status: string; kID_used: string;
  plans: { count: number; job_ids: string[]; format_mismatch: boolean; ok: boolean };
  steps: { count: number; ok: boolean };
  completions: { count: number; job_ids: string[]; format_mismatch: boolean };
  dispatch: { count: number; kIDs: string[]; format_mismatch: boolean };
  has_mismatch: boolean;
};

type HealthData = {
  summary: { total_wos: number; wos_with_plans: number; wos_with_steps: number; wos_with_completions: number; wos_with_dispatch: number; wos_with_mismatches: number };
  results: WOResult[];
};

const DOT = (ok: boolean, warn = false) => (
  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: ok ? '#22c55e' : warn ? '#f59e0b' : '#ef4444', marginRight: 4, flexShrink: 0 }} />
);

export default function HealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mismatch' | 'no_plans'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/health-check').then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  const filtered = (data?.results || []).filter(r => {
    if (filter === 'mismatch' && !r.has_mismatch) return false;
    if (filter === 'no_plans' && r.plans.count > 0) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.wo_id.includes(search) && !r.wo_number.includes(search)) return false;
    return true;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>System Health Check</h1>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>Cross-table kID consistency audit. First 100 WOs. Green = consistent, Red = missing/mismatched.</p>

        {loading && <div style={{ color: '#64748b' }}>Loading… reading all tables from sheet…</div>}

        {data && (
          <>
            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
              {[
                ['Total WOs', data.summary.total_wos, true],
                ['Have Plans', data.summary.wos_with_plans, data.summary.wos_with_plans > 0],
                ['Have Steps', data.summary.wos_with_steps, data.summary.wos_with_steps > 0],
                ['Have Completions', data.summary.wos_with_completions, true],
                ['Have Dispatch', data.summary.wos_with_dispatch, true],
                ['Have Mismatches', data.summary.wos_with_mismatches, data.summary.wos_with_mismatches === 0],
              ].map(([label, val, ok]) => (
                <div key={String(label)} style={{ padding: '14px 16px', borderRadius: 12, background: '#1e293b', border: `1px solid ${ok ? '#334155' : '#7f1d1d'}` }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: ok ? '#f1f5f9' : '#ef4444' }}>{String(val)}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{String(label)}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              {(['all', 'mismatch', 'no_plans'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: filter === f ? '#0f766e' : '#1e293b', color: filter === f ? '#fff' : '#64748b' }}>
                  {f === 'all' ? 'All WOs' : f === 'mismatch' ? '⚠ Mismatches Only' : '❌ No Plans'}
                </button>
              ))}
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search WO ID or name…"
                style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 12, outline: 'none', minWidth: 200 }} />
              <span style={{ fontSize: 12, color: '#475569' }}>{filtered.length} results</span>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1e293b', textAlign: 'left' }}>
                    {['WO', 'Name', 'Status', 'kID Used', 'Plans', 'Plan Job_ID', 'Steps', 'Completions', 'Dispatch kID', 'Issues'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', color: '#64748b', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.wo_id} style={{ background: i % 2 === 0 ? '#0f172a' : '#111827', borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#7dd3fc', whiteSpace: 'nowrap' }}>{r.wo_number || r.wo_id}</td>
                      <td style={{ padding: '7px 10px', color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</td>
                      <td style={{ padding: '7px 10px', color: '#64748b' }}>{r.status}</td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#cbd5e1', fontSize: 11 }}>{r.kID_used}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                          {DOT(r.plans.ok)}{r.plans.count}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 10, color: r.plans.format_mismatch ? '#fbbf24' : '#64748b' }}>
                        {r.plans.job_ids.join(', ') || '—'}
                        {r.plans.format_mismatch && ' ⚠'}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                          {DOT(r.steps.ok)}{r.steps.count}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                          {DOT(true)}{r.completions.count}
                          {r.completions.format_mismatch && <span style={{ color: '#fbbf24', marginLeft: 4 }}>⚠</span>}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 10, color: r.dispatch.format_mismatch ? '#fbbf24' : '#64748b' }}>
                        {r.dispatch.kIDs.join(', ') || '—'}
                        {r.dispatch.format_mismatch && ' ⚠'}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        {r.has_mismatch ? (
                          <span style={{ color: '#fbbf24', fontWeight: 700 }}>⚠ kID format mismatch</span>
                        ) : r.plans.count === 0 ? (
                          <span style={{ color: '#475569' }}>no plans</span>
                        ) : (
                          <span style={{ color: '#22c55e' }}>✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
