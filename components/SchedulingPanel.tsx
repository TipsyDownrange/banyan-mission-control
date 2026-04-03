'use client';
import { useEffect, useState } from 'react';

type WeekData = { week_ending: string; date: string; men: number };
type ForecastJob = {
  job_number: string; job_name: string; pm: string; notes: string;
  island: string; weeks: WeekData[]; total_men_weeks: number;
};
type IslandForecast = { island: string; jobs: ForecastJob[]; totals: WeekData[] };

const ISLAND_COLOR: Record<string, string> = {
  Maui: '#0f766e', MAUI: '#0f766e',
  Oahu: '#0369a1', OAHU: '#0369a1',
  Kauai: '#6d28d9', KAUAI: '#6d28d9',
  'Outer Islands': '#92400e', OUTER: '#92400e',
};

function menColor(men: number): string {
  if (!men) return 'transparent';
  if (men >= 8) return '#b91c1c';
  if (men >= 6) return '#c2410c';
  if (men >= 4) return '#0369a1';
  if (men >= 2) return '#0f766e';
  return '#64748b';
}

function menBg(men: number): string {
  if (!men) return 'transparent';
  if (men >= 8) return 'rgba(185,28,28,0.1)';
  if (men >= 6) return 'rgba(194,65,12,0.1)';
  if (men >= 4) return 'rgba(3,105,161,0.1)';
  if (men >= 2) return 'rgba(15,118,110,0.1)';
  return 'rgba(100,116,139,0.08)';
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return iso; }
}

function isCurrentWeek(date: string): boolean {
  const d = new Date(date);
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return d >= weekStart && d <= weekEnd;
}

export default function SchedulingPanel() {
  const [data, setData] = useState<{ weeks: WeekData[]; islands: IslandForecast[]; master_totals: WeekData[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'forecast' | 'lookahead'>('forecast');
  const [expandedIslands, setExpandedIslands] = useState<Set<string>>(new Set(['MAUI', 'OAHU']));
  const [weeksAhead, setWeeksAhead] = useState(12);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/scheduling?weeks=${weeksAhead}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [weeksAhead]);

  function toggleIsland(island: string) {
    setExpandedIslands(prev => {
      const next = new Set(prev);
      if (next.has(island)) next.delete(island);
      else next.add(island);
      return next;
    });
  }

  // For lookahead: only show next 3 weeks
  const displayWeeks = view === 'lookahead'
    ? (data?.weeks || []).filter(w => {
        const d = new Date(w.date);
        const today = new Date();
        return d >= today && d <= new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000);
      }).slice(0, 3)
    : (data?.weeks || []).slice(0, weeksAhead);

  return (
    <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>People & Assets</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Manpower Scheduling</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Live from Manpower Schedule sheet · Men per week by job and island</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['forecast', 'lookahead'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', border: view === v ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0', background: view === v ? 'rgba(240,253,250,0.96)' : 'white', color: view === v ? '#0f766e' : '#64748b', cursor: 'pointer' }}>
                {v === 'forecast' ? 'Forecast' : '3-Week Lookahead'}
              </button>
            ))}
            {view === 'forecast' && (
              <select value={weeksAhead} onChange={e => setWeeksAhead(parseInt(e.target.value))}
                style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 11, color: '#334155', cursor: 'pointer', outline: 'none' }}>
                <option value={8}>8 weeks</option>
                <option value={12}>12 weeks</option>
                <option value={24}>24 weeks</option>
                <option value={52}>52 weeks</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {error && <div style={{ padding: '12px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', marginBottom: 16 }}>{error}</div>}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading manpower schedule...</div>
        </div>
      )}

      {!loading && data && (
        <>
          {/* Master totals bar — all islands combined */}
          <div style={{ marginBottom: 20, padding: 16, borderRadius: 16, background: 'linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,249,255,0.92))', border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 2px 12px rgba(15,23,42,0.04)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b', marginBottom: 12 }}>Company Total — All Islands</div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {displayWeeks.map(w => {
                const total = data.master_totals.find(t => t.date === w.date);
                const men = total?.men || 0;
                const current = isCurrentWeek(w.date);
                return (
                  <div key={w.date} style={{ flexShrink: 0, textAlign: 'center', minWidth: 52 }}>
                    <div style={{ fontSize: 9, color: current ? '#0369a1' : '#94a3b8', fontWeight: current ? 800 : 600, marginBottom: 4 }}>{fmtDate(w.date)}</div>
                    <div style={{ width: 48, height: 48, borderRadius: 10, background: men ? menBg(men) : '#f8fafc', border: `1.5px solid ${current ? '#0369a1' : (men ? menColor(men) + '44' : '#e2e8f0')}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                      <span style={{ fontSize: men >= 10 ? 14 : 18, fontWeight: 900, color: men ? menColor(men) : '#cbd5e1', letterSpacing: '-0.04em' }}>{men || '—'}</span>
                    </div>
                    {men > 0 && <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 3 }}>men</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-island sections */}
          {data.islands.map(island => {
            const isExpanded = expandedIslands.has(island.island);
            const color = ISLAND_COLOR[island.island] || '#64748b';
            const activeJobs = island.jobs.filter(j => j.total_men_weeks > 0);
            return (
              <div key={island.island} style={{ marginBottom: 12, borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', background: 'white' }}>
                {/* Island header */}
                <button onClick={() => toggleIsland(island.island)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: `${color}08`, border: 'none', cursor: 'pointer', borderBottom: isExpanded ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{island.island}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{activeJobs.length} active job{activeJobs.length !== 1 ? 's' : ''}</span>
                  </div>
                  {/* Current week total for this island */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {(() => {
                      const currWeek = displayWeeks.find(w => isCurrentWeek(w.date));
                      const curr = currWeek ? island.totals.find(t => t.date === currWeek.date) : null;
                      return curr?.men ? (
                        <span style={{ fontSize: 12, fontWeight: 800, color, padding: '3px 10px', borderRadius: 999, background: `${color}15`, border: `1px solid ${color}33` }}>
                          {curr.men} men this week
                        </span>
                      ) : null;
                    })()}
                    <span style={{ fontSize: 12, color: '#94a3b8', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>▾</span>
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1, minWidth: 220 }}>Job</th>
                          <th style={{ padding: '8px 8px', textAlign: 'left', fontWeight: 700, fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', minWidth: 60 }}>PM</th>
                          {displayWeeks.map(w => (
                            <th key={w.date} style={{ padding: '8px 4px', textAlign: 'center', fontWeight: isCurrentWeek(w.date) ? 800 : 700, fontSize: 9, color: isCurrentWeek(w.date) ? '#0369a1' : '#94a3b8', whiteSpace: 'nowrap', minWidth: 44, borderLeft: isCurrentWeek(w.date) ? '2px solid rgba(3,105,161,0.3)' : '1px solid #f1f5f9' }}>
                              {fmtDate(w.date)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {island.jobs.map((job, ji) => (
                          <tr key={job.job_number} style={{ borderBottom: '1px solid #f8fafc', background: ji % 2 === 1 ? '#fafafa' : 'white' }}>
                            <td style={{ padding: '8px 12px', position: 'sticky', left: 0, background: ji % 2 === 1 ? '#fafafa' : 'white', zIndex: 1 }}>
                              <div style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                                {job.job_name.includes('WORK ORDER') ? '🔧 ' : ''}{job.job_name.length > 28 ? job.job_name.substring(0, 28) + '...' : job.job_name}
                              </div>
                              <div style={{ fontSize: 9, color: '#94a3b8' }}>{job.job_number}</div>
                            </td>
                            <td style={{ padding: '8px 8px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{job.pm}</td>
                            {displayWeeks.map(w => {
                              const week = job.weeks.find(wk => wk.date === w.date);
                              const men = week?.men || 0;
                              return (
                                <td key={w.date} style={{ padding: '6px 4px', textAlign: 'center', borderLeft: isCurrentWeek(w.date) ? '2px solid rgba(3,105,161,0.2)' : '1px solid #f8fafc' }}>
                                  {men > 0 && (
                                    <div style={{ width: 32, height: 24, borderRadius: 6, background: menBg(men), border: `1px solid ${menColor(men)}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                                      <span style={{ fontSize: 12, fontWeight: 800, color: menColor(men) }}>{men}</span>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        {/* Island total row */}
                        {island.totals.length > 0 && (
                          <tr style={{ background: `${color}08`, borderTop: `2px solid ${color}33` }}>
                            <td style={{ padding: '8px 12px', fontWeight: 800, fontSize: 11, color, position: 'sticky', left: 0, background: `${color}08`, zIndex: 1 }} colSpan={2}>
                              {island.island} TOTAL
                            </td>
                            {displayWeeks.map(w => {
                              const total = island.totals.find(t => t.date === w.date);
                              const men = total?.men || 0;
                              return (
                                <td key={w.date} style={{ padding: '6px 4px', textAlign: 'center', borderLeft: isCurrentWeek(w.date) ? `2px solid ${color}55` : `1px solid ${color}22` }}>
                                  <span style={{ fontSize: 13, fontWeight: 900, color: men ? color : '#cbd5e1' }}>{men || '—'}</span>
                                </td>
                              );
                            })}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Legend */}
          <div style={{ marginTop: 16, padding: '10px 16px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8' }}>Men on site:</span>
            {[[1,'1-2','#0f766e'],[2,'3-4','#0f766e'],[4,'4-5','#0369a1'],[6,'6-7','#c2410c'],[8,'8+','#b91c1c']].map(([n,label,color]) => (
              <div key={String(n)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 20, height: 16, borderRadius: 4, background: menBg(Number(n)), border: `1px solid ${String(color)}44` }} />
                <span style={{ fontSize: 10, color: '#64748b' }}>{String(label)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 16, borderRadius: 4, border: '2px solid rgba(3,105,161,0.4)', background: 'rgba(239,246,255,0.5)' }} />
              <span style={{ fontSize: 10, color: '#64748b' }}>Current week</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
