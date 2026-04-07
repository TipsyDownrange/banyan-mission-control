'use client';
import { useEffect, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DispatchSlot {
  slot_id: string;
  date: string;
  kID: string;
  project_name: string;
  island: string;
  men_required: string;
  hours_estimated: string;
  assigned_crew: string;
  created_by: string;
  status: string;
  confirmations: string;
  work_type: string;
  notes: string;
  start_time: string;
  end_time: string;
  progress?: { total: number; completed: number; in_progress: number } | null;
}

interface Blocker {
  step_completion_id: string;
  install_step_id: string;
  mark_id: string;
  date: string;
  crew_lead: string;
  notes: string;
  status: string;
  step_name: string;
  job_id: string;
  project_location: string;
  plan_system_type: string;
}

interface CrewMember {
  user_id: string;
  name: string;
  role: string;
  island: string;
  booked_days: { date: string; booked: boolean }[];
}

interface ForecastWeek {
  week_start: string;
  week_end: string;
  needed: number;
  available: number;
  buffer: number;
}

interface SchedulingData {
  today: string;
  today_slots: DispatchSlot[];
  blockers: Blocker[];
  week_days: string[];
  week_slots: DispatchSlot[];
  crew: CrewMember[];
  manpower_forecast: ForecastWeek[];
  fetched_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
  } catch { return iso; }
}

function fmtShort(iso: string): string {
  try {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  } catch { return iso; }
}

function fmtDayLabel(iso: string): string {
  try {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  } catch { return iso; }
}

function isToday(iso: string): boolean {
  return iso === new Date().toISOString().slice(0, 10);
}

function progressPct(p: DispatchSlot['progress']): number {
  if (!p || p.total === 0) return 0;
  return Math.round((p.completed / p.total) * 100);
}

function bufferColor(buffer: number): string {
  if (buffer >= 3) return '#15803d';
  if (buffer >= 1) return '#d97706';
  return '#dc2626';
}

function bufferBg(buffer: number): string {
  if (buffer >= 3) return 'rgba(21,128,61,0.12)';
  if (buffer >= 1) return 'rgba(217,119,6,0.12)';
  return 'rgba(220,38,38,0.12)';
}

// ─── Section: Today's Crews ───────────────────────────────────────────────────

function TodayCrews({ slots }: { slots: DispatchSlot[] }) {
  if (slots.length === 0) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        No crews dispatched today
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {slots.map(slot => {
        const crew = slot.assigned_crew.split(',').map(n => n.trim()).filter(Boolean);
        const pct = progressPct(slot.progress);
        return (
          <div key={slot.slot_id} style={{
            padding: '14px 16px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 3 }}>
                  {slot.project_name}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {crew.length > 0 ? crew.join(' · ') : 'No crew assigned'}
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 800,
                padding: '3px 8px', borderRadius: 6,
                background: slot.status === 'confirmed' ? 'rgba(21,128,61,0.2)' : 'rgba(234,179,8,0.15)',
                color: slot.status === 'confirmed' ? '#86efac' : '#fde68a',
                border: `1px solid ${slot.status === 'confirmed' ? 'rgba(21,128,61,0.3)' : 'rgba(234,179,8,0.2)'}`,
              }}>
                {slot.status || 'open'}
              </span>
            </div>

            {slot.progress && slot.progress.total > 0 ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {slot.progress.completed} of {slot.progress.total} steps done
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: pct >= 100 ? '#86efac' : '#94a3b8' }}>
                    {pct}%
                  </span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: pct >= 100 ? '#22c55e' : '#14b8a6',
                    borderRadius: 3,
                    transition: 'width 0.4s',
                  }} />
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>No install steps tracked</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Section: Blockers ────────────────────────────────────────────────────────

function BlockersSection({ blockers }: { blockers: Blocker[] }) {
  if (blockers.length === 0) {
    return (
      <div style={{ padding: '16px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        No active blockers ✓
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blockers.map(b => (
        <div key={b.step_completion_id} style={{
          padding: '12px 14px',
          borderRadius: 10,
          background: 'rgba(220,38,38,0.08)',
          border: '1px solid rgba(220,38,38,0.2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>
                ❌ {b.project_location || b.job_id} — {b.step_name}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {b.notes || 'No reason provided'}
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', marginLeft: 8 }}>
              {b.crew_lead && <span>by {b.crew_lead}</span>}
              {b.date && <span> · {b.date}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={{
              padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(234,179,8,0.3)',
              background: 'rgba(234,179,8,0.1)', color: '#fde68a', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>
              Reassign
            </button>
            <button style={{
              padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(148,163,184,0.2)',
              background: 'rgba(148,163,184,0.08)', color: '#94a3b8', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>
              Notify PM
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section: Week Matrix ─────────────────────────────────────────────────────

function WeekMatrix({ weekDays, weekSlots }: { weekDays: string[]; weekSlots: DispatchSlot[] }) {
  const [selectedCell, setSelectedCell] = useState<{ date: string; slot: DispatchSlot } | null>(null);

  // Group slots by project across the week
  const projectSet = new Set(weekSlots.map(s => s.project_name));
  const projects = Array.from(projectSet);

  if (projects.length === 0) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        No dispatch slots this week
      </div>
    );
  }

  // Limit to 5 visible days (Mon–Fri) by default
  const visibleDays = weekDays.slice(0, 5);

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', minWidth: 140 }}>
                Project
              </th>
              {visibleDays.map(date => (
                <th key={date} style={{
                  padding: '6px 8px',
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: isToday(date) ? 800 : 600,
                  color: isToday(date) ? '#38bdf8' : '#64748b',
                  minWidth: 90,
                  background: isToday(date) ? 'rgba(56,189,248,0.08)' : 'transparent',
                  borderRadius: 6,
                }}>
                  <div>{fmtDayLabel(date)}</div>
                  <div style={{ fontSize: 10, opacity: 0.7 }}>{fmtShort(date)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map(project => (
              <tr key={project}>
                <td style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#cbd5e1', maxWidth: 140 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {project}
                  </div>
                </td>
                {visibleDays.map(date => {
                  const slot = weekSlots.find(s => s.date === date && s.project_name === project);
                  const todayCol = isToday(date);
                  if (!slot) {
                    return (
                      <td key={date} style={{ padding: 4 }}>
                        <div style={{
                          height: 54,
                          borderRadius: 8,
                          background: todayCol ? 'rgba(56,189,248,0.04)' : 'rgba(255,255,255,0.02)',
                          border: `1px dashed ${todayCol ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.05)'}`,
                        }} />
                      </td>
                    );
                  }
                  const crew = slot.assigned_crew.split(',').map(n => n.trim()).filter(Boolean);
                  const pct = progressPct(slot.progress);
                  return (
                    <td key={date} style={{ padding: 4 }}>
                      <button
                        onClick={() => setSelectedCell({ date, slot })}
                        style={{
                          width: '100%',
                          height: 54,
                          borderRadius: 8,
                          background: todayCol
                            ? 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(56,189,248,0.1))'
                            : 'linear-gradient(135deg, rgba(20,184,166,0.15), rgba(15,118,110,0.08))',
                          border: `1px solid ${todayCol ? 'rgba(56,189,248,0.3)' : 'rgba(20,184,166,0.2)'}`,
                          cursor: 'pointer',
                          textAlign: 'left',
                          padding: '6px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.2, overflow: 'hidden', maxHeight: 28 }}>
                          {slot.work_type || slot.notes?.slice(0, 20) || '—'}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 9, color: '#94a3b8' }}>
                            {crew.length > 0 ? `${crew.length} crew` : 'No crew'}
                          </span>
                          {pct > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: pct >= 100 ? '#86efac' : '#7dd3fc' }}>
                              {pct}%
                            </span>
                          )}
                        </div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail flyout */}
      {selectedCell && (
        <div style={{
          marginTop: 12,
          padding: '14px 16px',
          borderRadius: 12,
          background: 'rgba(14,165,233,0.08)',
          border: '1px solid rgba(14,165,233,0.2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
                {selectedCell.slot.project_name}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDate(selectedCell.date)}</div>
            </div>
            <button onClick={() => setSelectedCell(null)} style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, padding: '4px 8px', color: '#94a3b8', fontSize: 11, cursor: 'pointer',
            }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
            <div style={{ color: '#94a3b8' }}>Crew: <span style={{ color: '#e2e8f0' }}>{selectedCell.slot.assigned_crew || '—'}</span></div>
            <div style={{ color: '#94a3b8' }}>Status: <span style={{ color: '#e2e8f0' }}>{selectedCell.slot.status || '—'}</span></div>
            <div style={{ color: '#94a3b8' }}>Island: <span style={{ color: '#e2e8f0' }}>{selectedCell.slot.island || '—'}</span></div>
            <div style={{ color: '#94a3b8' }}>Men req: <span style={{ color: '#e2e8f0' }}>{selectedCell.slot.men_required || '—'}</span></div>
            {selectedCell.slot.notes && (
              <div style={{ color: '#94a3b8', gridColumn: '1/-1' }}>Notes: <span style={{ color: '#e2e8f0' }}>{selectedCell.slot.notes}</span></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Crew Availability ───────────────────────────────────────────────

function CrewAvailability({ crew, weekDays }: { crew: CrewMember[]; weekDays: string[] }) {
  const visibleDays = weekDays.slice(0, 5);

  if (crew.length === 0) {
    return <div style={{ padding: '16px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No crew data</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px 2px' }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', minWidth: 140 }}>
              Name
            </th>
            <th style={{ padding: '4px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', minWidth: 70 }}>
              Island
            </th>
            {visibleDays.map(date => (
              <th key={date} style={{
                padding: '4px 8px', textAlign: 'center', fontSize: 10,
                fontWeight: isToday(date) ? 800 : 600,
                color: isToday(date) ? '#38bdf8' : '#64748b',
                minWidth: 44,
              }}>
                {fmtDayLabel(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {crew.map(member => (
            <tr key={member.user_id || member.name}>
              <td style={{ padding: '3px 10px', fontSize: 12, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                {member.name}
              </td>
              <td style={{ padding: '3px 8px', fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>
                {member.island || '—'}
              </td>
              {visibleDays.map(date => {
                const day = member.booked_days.find(d => d.date === date);
                const booked = day?.booked ?? false;
                const todayCol = isToday(date);
                return (
                  <td key={date} style={{ padding: '3px 4px', textAlign: 'center' }}>
                    <div style={{
                      width: 32,
                      height: 22,
                      borderRadius: 5,
                      margin: '0 auto',
                      background: booked
                        ? (todayCol ? 'rgba(56,189,248,0.3)' : 'rgba(20,184,166,0.25)')
                        : 'rgba(255,255,255,0.04)',
                      border: booked
                        ? `1px solid ${todayCol ? 'rgba(56,189,248,0.4)' : 'rgba(20,184,166,0.35)'}`
                        : '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {booked && (
                        <div style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: todayCol ? '#38bdf8' : '#14b8a6',
                        }} />
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 16, padding: '8px 10px', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(20,184,166,0.25)', border: '1px solid rgba(20,184,166,0.35)' }} />
          <span style={{ fontSize: 10, color: '#64748b' }}>Booked</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: 10, color: '#64748b' }}>Available</span>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Manpower Forecast ───────────────────────────────────────────────

function ManpowerForecast({ weeks }: { weeks: ForecastWeek[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
      {weeks.map((wk, i) => (
        <div key={wk.week_start} style={{
          padding: '14px 16px',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>
            Week {i + 1} · {fmtShort(wk.week_start)}–{fmtShort(wk.week_end)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#94a3b8' }}>Needed</span>
              <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{wk.needed}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#94a3b8' }}>Available</span>
              <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{wk.available}</span>
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Buffer</span>
              <span style={{
                fontSize: 14,
                fontWeight: 900,
                color: bufferColor(wk.buffer),
                padding: '2px 8px',
                borderRadius: 6,
                background: bufferBg(wk.buffer),
              }}>
                {wk.buffer >= 0 ? '+' : ''}{wk.buffer}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, count, accent }: { icon: string; title: string; count?: number; accent?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 16px 10px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      marginBottom: 0,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: accent || '#e2e8f0', letterSpacing: '0.02em' }}>{title}</span>
      {count !== undefined && (
        <span style={{
          fontSize: 10, fontWeight: 800,
          padding: '2px 7px', borderRadius: 99,
          background: count > 0 ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.06)',
          color: count > 0 ? '#fca5a5' : '#64748b',
          border: `1px solid ${count > 0 ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.08)'}`,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 14,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '14px 16px' }}>{children}</div>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SuperSchedulingPanel() {
  const [data, setData] = useState<SchedulingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/superintendent-scheduling');
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setData(d);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const t = setInterval(load, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #071722 0%, #0c2330 100%)',
      padding: '0 0 40px',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(180deg, #0d1f2d 0%, rgba(13,31,45,0.95) 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '20px 24px 16px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(20,184,166,0.5)', marginBottom: 4 }}>
              Operations
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: '#f8fafc', margin: 0 }}>
              Scheduling Matrix
            </h1>
            {data && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                Week of {fmtDate(data.today)}
                {lastRefresh && <span> · refreshed {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
              </div>
            )}
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: '7px 14px', borderRadius: 8,
              border: '1px solid rgba(20,184,166,0.3)',
              background: 'rgba(20,184,166,0.08)',
              color: '#14b8a6', fontSize: 12, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? '↻ Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ margin: '16px 24px', padding: '12px 16px', borderRadius: 10, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', color: '#fca5a5', fontSize: 12 }}>
          {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: 64 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(20,184,166,0.15)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#64748b' }}>Loading scheduling data…</div>
        </div>
      )}

      {data && (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1200, margin: '0 auto' }}>

          {/* A: Today's Crews */}
          <Card>
            <SectionHeader icon="⚡" title="Today's Crews" count={data.today_slots.length} accent="#fde68a" />
            <CardBody>
              <TodayCrews slots={data.today_slots} />
            </CardBody>
          </Card>

          {/* B: Blockers */}
          <Card>
            <SectionHeader icon="🚨" title="Blockers" count={data.blockers.length} accent="#fca5a5" />
            <CardBody>
              <BlockersSection blockers={data.blockers} />
            </CardBody>
          </Card>

          {/* C: Week Matrix */}
          <Card>
            <SectionHeader icon="📅" title="This Week" accent="#7dd3fc" />
            <CardBody>
              <WeekMatrix weekDays={data.week_days} weekSlots={data.week_slots} />
            </CardBody>
          </Card>

          {/* D: Crew Availability */}
          <Card>
            <SectionHeader icon="👷" title="Crew Availability" accent="#86efac" />
            <CardBody>
              <CrewAvailability crew={data.crew} weekDays={data.week_days} />
            </CardBody>
          </Card>

          {/* E: Manpower Forecast */}
          <Card>
            <SectionHeader icon="📊" title="4-Week Manpower Forecast" accent="#c4b5fd" />
            <CardBody>
              <ManpowerForecast weeks={data.manpower_forecast} />
            </CardBody>
          </Card>

        </div>
      )}
    </div>
  );
}
