'use client';
import { useEffect, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  step_ids: string;
  hours_actual: string;
  last_modified: string;
  focus_step_ids: string;
}

interface IslandMovement {
  crew_name: string;
  home_island: string;
  dispatch_island: string;
  slot_id: string;
  date: string;
  project_name: string;
  travel_booked: boolean;
}

interface TravelEntry {
  crew_name: string;
  travel_date: string;
  type: string;
  from_code: string;
  to_code: string;
  flight_number: string;
  depart_time: string;
  status: string;
}

interface LogisticsData {
  slots: DispatchSlot[];
  travelRecords: TravelEntry[];
  islandMovements: IslandMovement[];
  blockers: IslandMovement[];
  covered: IslandMovement[];
  meta: {
    from: string;
    days: number;
    slotCount: number;
    movementCount: number;
    blockerCount: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function islandColor(island: string): string {
  const i = (island || '').toLowerCase();
  if (i.includes('oahu'))  return '#0ea5e9';
  if (i.includes('maui'))  return '#10b981';
  if (i.includes('kauai')) return '#a78bfa';
  return '#94a3b8';
}

function IslandBadge({ island }: { island: string }) {
  const color = islandColor(island);
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: color + '22', color, border: `1px solid ${color}55`,
      letterSpacing: '0.03em', whiteSpace: 'nowrap',
    }}>
      {island || '—'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  const color = s === 'confirmed' ? '#22c55e' : s === 'open' ? '#f59e0b' : s === 'complete' ? '#64748b' : '#94a3b8';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: color + '22', color, border: `1px solid ${color}55`,
      letterSpacing: '0.03em', textTransform: 'capitalize',
    }}>
      {status || 'open'}
    </span>
  );
}

function SectionHeader({ title, count, accent }: { title: string; count?: number; accent?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
      paddingBottom: 8, borderBottom: `1px solid ${accent || 'rgba(255,255,255,0.07)'}`,
    }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: accent || '#94a3b8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {title}
      </span>
      {count !== undefined && (
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.6)',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 5, padding: '1px 7px' }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function ForecastSection({ slots }: { slots: DispatchSlot[] }) {
  const byDate = slots.reduce<Record<string, DispatchSlot[]>>((acc, s) => {
    (acc[s.date] = acc[s.date] || []).push(s);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  return (
    <div>
      <SectionHeader title="Forecast / Planning" count={slots.length} accent="#14b8a6" />
      {dates.length === 0 ? (
        <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.5)', margin: 0 }}>No slots in window.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dates.map(date => {
            const daySlots = byDate[date];
            const islands = [...new Set(daySlots.map(s => s.island).filter(Boolean))];
            const totalMen = daySlots.reduce((sum, s) => sum + (parseInt(s.men_required) || 0), 0);
            const totalHrs = daySlots.reduce((sum, s) => sum + (parseFloat(s.hours_estimated) || 0), 0);
            return (
              <div key={date} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '7px 10px', borderRadius: 8,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', minWidth: 110 }}>
                  {formatDate(date)}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.7)' }}>
                  {daySlots.length} slot{daySlots.length !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.7)' }}>
                  {totalMen} men · {totalHrs}h est.
                </span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {islands.map(isl => <IslandBadge key={isl} island={isl} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommittedDispatchSection({ slots }: { slots: DispatchSlot[] }) {
  const committed = slots.filter(s => s.assigned_crew && s.assigned_crew.trim());

  return (
    <div>
      <SectionHeader title="Committed Dispatch" count={committed.length} accent="#f97316" />
      {committed.length === 0 ? (
        <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.5)', margin: 0 }}>No committed dispatch rows in window.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {committed.slice(0, 40).map(slot => (
            <div key={slot.slot_id} style={{
              display: 'grid', gridTemplateColumns: '110px 1fr auto auto auto',
              gap: 10, alignItems: 'center',
              padding: '6px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.6)', whiteSpace: 'nowrap' }}>
                {formatDate(slot.date)}
              </span>
              <span style={{ fontSize: 12, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {slot.project_name}
              </span>
              <IslandBadge island={slot.island} />
              <StatusBadge status={slot.status} />
              <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)', whiteSpace: 'nowrap' }}>
                {slot.men_required || '?'} men
              </span>
            </div>
          ))}
          {committed.length > 40 && (
            <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', margin: '4px 0 0 10px' }}>
              +{committed.length - 40} more slots not shown.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function IslandLogisticsSection({ movements, travelRecords }: { movements: IslandMovement[]; travelRecords: TravelEntry[] }) {
  // Group by crew name for deduplication
  const byCrewDate = movements.reduce<Record<string, IslandMovement[]>>((acc, m) => {
    const key = m.crew_name + '|' + m.date;
    (acc[key] = acc[key] || []).push(m);
    return acc;
  }, {});
  const unique = Object.values(byCrewDate).map(arr => arr[0]);

  return (
    <div>
      <SectionHeader title="Crew Movement / Island Logistics" count={unique.length} accent="#a78bfa" />
      {unique.length === 0 ? (
        <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.5)', margin: 0 }}>No cross-island assignments in window.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {unique.map((m, idx) => (
            <div key={idx} style={{
              display: 'grid', gridTemplateColumns: '110px 140px auto auto 1fr auto',
              gap: 10, alignItems: 'center',
              padding: '6px 10px', borderRadius: 8,
              background: m.travel_booked ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.07)',
              border: `1px solid ${m.travel_booked ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.18)'}`,
            }}>
              <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.6)', whiteSpace: 'nowrap' }}>
                {formatDate(m.date)}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.crew_name}
              </span>
              <IslandBadge island={m.home_island} />
              <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)' }}>→</span>
              <IslandBadge island={m.dispatch_island} />
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                background: m.travel_booked ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: m.travel_booked ? '#22c55e' : '#ef4444',
                border: `1px solid ${m.travel_booked ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                whiteSpace: 'nowrap',
              }}>
                {m.travel_booked ? 'Travel booked' : 'No travel'}
              </span>
            </div>
          ))}
        </div>
      )}

      {travelRecords.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.4)', margin: '0 0 8px 2px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Travel booked ({travelRecords.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {travelRecords.slice(0, 20).map((t, idx) => (
              <div key={idx} style={{
                display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
                padding: '5px 10px', borderRadius: 7,
                background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.6)', minWidth: 80, whiteSpace: 'nowrap' }}>
                  {formatDate(t.travel_date)}
                </span>
                <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{t.crew_name}</span>
                <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>
                  {t.from_code || '?'} → {t.to_code || '?'}
                </span>
                {t.flight_number && (
                  <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)' }}>{t.flight_number}</span>
                )}
                {t.depart_time && (
                  <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)' }}>{t.depart_time}</span>
                )}
              </div>
            ))}
            {travelRecords.length > 20 && (
              <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', margin: '4px 0 0 10px' }}>
                +{travelRecords.length - 20} more travel records.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReadinessSummarySection({ blockers, covered, meta }: { blockers: IslandMovement[]; covered: IslandMovement[]; meta: LogisticsData['meta'] }) {
  return (
    <div>
      <SectionHeader title="Readiness / Blockers" count={blockers.length} accent={blockers.length > 0 ? '#ef4444' : '#22c55e'} />

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{
          flex: '0 0 auto', padding: '10px 16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          minWidth: 100, textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#e2e8f0' }}>{meta.slotCount}</div>
          <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Slots</div>
        </div>
        <div style={{
          flex: '0 0 auto', padding: '10px 16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          minWidth: 100, textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#a78bfa' }}>{meta.movementCount}</div>
          <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Movements</div>
        </div>
        <div style={{
          flex: '0 0 auto', padding: '10px 16px', borderRadius: 10,
          background: covered.length > 0 ? 'rgba(34,197,94,0.07)' : 'rgba(255,255,255,0.04)',
          border: covered.length > 0 ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,255,255,0.08)',
          minWidth: 100, textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e' }}>{covered.length}</div>
          <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Travel OK</div>
        </div>
        <div style={{
          flex: '0 0 auto', padding: '10px 16px', borderRadius: 10,
          background: blockers.length > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
          border: blockers.length > 0 ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.08)',
          minWidth: 100, textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: blockers.length > 0 ? '#ef4444' : '#64748b' }}>{blockers.length}</div>
          <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Blockers</div>
        </div>
      </div>

      {blockers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {blockers.map((b, idx) => (
            <div key={idx} style={{
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
              padding: '7px 10px', borderRadius: 8,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5' }}>{b.crew_name}</span>
              <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.6)' }}>
                dispatched to {b.dispatch_island} on {formatDate(b.date)}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>— no travel booked</span>
            </div>
          ))}
        </div>
      )}
      {blockers.length === 0 && meta.movementCount > 0 && (
        <p style={{ fontSize: 13, color: '#22c55e', margin: 0 }}>
          All cross-island crew movements have travel records on file.
        </p>
      )}
      {meta.movementCount === 0 && (
        <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.5)', margin: 0 }}>
          No cross-island crew movements in window.
        </p>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function LogisticsPanel() {
  const [data, setData] = useState<LogisticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(28);

  const load = useCallback(async (windowDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/admin/schedule?from=${today}&days=${windowDays}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #071722 0%, #0c2330 100%)',
      padding: '28px 28px 60px',
      color: '#e2e8f0',
      fontFamily: '-apple-system, SF Pro Display, Inter, system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
            Logistics
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(148,163,184,0.5)' }}>
            Admin / schedule view — read only
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Window selector */}
          <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            {[7, 14, 28, 56].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  padding: '6px 12px', fontSize: 11, fontWeight: 700,
                  background: days === d ? 'rgba(20,184,166,0.2)' : 'rgba(255,255,255,0.03)',
                  color: days === d ? '#14b8a6' : 'rgba(148,163,184,0.6)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.1s',
                  borderRight: d !== 56 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={() => load(days)}
            disabled={loading}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 700,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(148,163,184,0.7)', borderRadius: 8, cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#fca5a5', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={{ color: 'rgba(148,163,184,0.4)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
          Loading logistics data…
        </div>
      )}

      {/* Sections */}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <ReadinessSummarySection
            blockers={data.blockers}
            covered={data.covered}
            meta={data.meta}
          />
          <ForecastSection slots={data.slots} />
          <CommittedDispatchSection slots={data.slots} />
          <IslandLogisticsSection
            movements={data.islandMovements}
            travelRecords={data.travelRecords}
          />
        </div>
      )}
    </div>
  );
}
