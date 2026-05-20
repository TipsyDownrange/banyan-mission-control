'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type ForecastWeek = { week_start: string; week_end: string; needed: number; available: number; buffer: number };
type UnscheduledJob = { id: string; kID: string; name: string; customer: string; island: string; hours_est: string; status: string; total_steps?: number; unscheduled_steps?: number };
type ForecastData = { manpower_forecast?: ForecastWeek[]; unscheduled_jobs?: UnscheduledJob[]; fetched_at?: string };

function fmtDate(iso: string): string {
  try { return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return iso; }
}

function bufferColor(buffer: number) {
  if (buffer >= 3) return '#16a34a';
  if (buffer >= 1) return '#f59e0b';
  return '#ef4444';
}

function horizonLabel(index: number) {
  if (index <= 2) return 'Scheduling window';
  return 'Forecast window';
}

export default function ForecastingPanel() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/superintendent-scheduling?week_offset=0');
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const weeks = data?.manpower_forecast || [];
  const futureJobs = useMemo(() => (data?.unscheduled_jobs || [])
    .slice()
    .sort((a, b) => Number(b.hours_est || 0) - Number(a.hours_est || 0)), [data]);
  const constrainedWeeks = weeks.filter(w => Number(w.buffer) < 1).length;
  const forecastHours = futureJobs.reduce((sum, job) => sum + (Number(job.hours_est) || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #071722 0%, #0c2330 100%)', paddingBottom: 40 }}>
      <div style={{ background: 'linear-gradient(180deg, #0d1f2d 0%, rgba(13,31,45,0.95) 100%)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '20px 24px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(20,184,166,0.5)', marginBottom: 4 }}>Operations</div>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--color-surface)', margin: 0 }}>Forecasting</h1>
            <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)', marginTop: 5, maxWidth: 760, lineHeight: 1.5 }}>
              Long-range capacity and pipeline view. Work inside the next three weeks belongs in Scheduling Matrix; later demand stays here until it is close enough to schedule.
            </div>
          </div>
          <button onClick={() => load()} disabled={loading} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(20,184,166,0.3)', background: 'rgba(20,184,166,0.08)', color: 'var(--bos-color-brand-primary)', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
            {loading ? '↻ Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && <div style={{ margin: '16px 24px', padding: '12px 16px', borderRadius: 10, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', color: '#fca5a5', fontSize: 12 }}>{error}</div>}
      {loading && !data && <div style={{ textAlign: 'center', padding: 64, color: 'var(--bos-color-ink-disabled)' }}>Loading forecasting data…</div>}

      {data && (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {[
              ['Forecast weeks', weeks.length, 'Capacity windows loaded'],
              ['Constrained weeks', constrainedWeeks, 'Buffer below 1 crew'],
              ['Unscheduled jobs', futureJobs.length, 'Pipeline items needing plan'],
              ['Forecast hours', forecastHours, 'Estimated unscheduled work'],
            ].map(([label, value, sub]) => (
              <div key={String(label)} style={{ background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(226,232,240,0.14)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--bos-color-ink-disabled)' }}>{label}</div>
                <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900, color: 'var(--color-ink-primary)' }}>{value}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--bos-color-ink-disabled)' }}>{sub}</div>
              </div>
            ))}
          </div>

          <section style={{ background: 'rgba(15,23,42,0.54)', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(148,163,184,0.12)', fontSize: 13, fontWeight: 900, color: 'var(--color-surface)' }}>Capacity horizon</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, padding: 14 }}>
              {weeks.map((week, index) => (
                <div key={week.week_start} style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 14, padding: 14, background: index <= 2 ? 'rgba(14,165,233,0.08)' : 'rgba(20,184,166,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--color-surface)' }}>{fmtDate(week.week_start)} – {fmtDate(week.week_end)}</div>
                    <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: index <= 2 ? '#7dd3fc' : '#5eead4' }}>{horizonLabel(index)}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 12 }}>
                    <div><div style={{ fontSize: 9, color: 'var(--bos-color-ink-disabled)', fontWeight: 800 }}>Needed</div><div style={{ color: 'var(--color-surface)', fontWeight: 900 }}>{week.needed}</div></div>
                    <div><div style={{ fontSize: 9, color: 'var(--bos-color-ink-disabled)', fontWeight: 800 }}>Avail.</div><div style={{ color: 'var(--color-surface)', fontWeight: 900 }}>{week.available}</div></div>
                    <div><div style={{ fontSize: 9, color: 'var(--bos-color-ink-disabled)', fontWeight: 800 }}>Buffer</div><div style={{ color: bufferColor(Number(week.buffer)), fontWeight: 900 }}>{week.buffer}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ background: 'rgba(15,23,42,0.54)', border: '1px solid rgba(148,163,184,0.16)', borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(148,163,184,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--color-surface)' }}>Pipeline work not yet scheduled</div>
              {lastRefresh && <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)' }}>Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>}
            </div>
            <div style={{ display: 'grid', gap: 8, padding: 14 }}>
              {futureJobs.length === 0 && <div style={{ color: 'var(--bos-color-ink-disabled)', fontSize: 13, padding: 20, textAlign: 'center' }}>No unscheduled pipeline work returned.</div>}
              {futureJobs.slice(0, 18).map(job => (
                <div key={`${job.id}-${job.kID}`} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 90px 120px', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(148,163,184,0.12)' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>{job.kID}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)', marginTop: 2 }}>{[job.customer, job.island].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#fbbf24', textAlign: 'right' }}>{job.hours_est || '—'}h</div>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5eead4', textAlign: 'right' }}>{job.status || 'Unscheduled'}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
