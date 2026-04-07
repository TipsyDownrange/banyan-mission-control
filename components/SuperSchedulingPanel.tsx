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

interface UnscheduledJob {
  type: 'wo' | 'project';
  id: string;
  kID: string;
  name: string;
  customer: string;
  island: string;
  assigned_crew: string;
  hours_est: string;
  status: string;
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

interface CrewListItem {
  user_id: string;
  name: string;
  island: string;
  role: string;
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
  week_start: string;
  week_offset: number;
  week_slots: DispatchSlot[];
  crew: CrewMember[];
  crew_list: CrewListItem[];
  manpower_forecast: ForecastWeek[];
  unscheduled_jobs: UnscheduledJob[];
  fetched_at: string;
}

// ─── Island color coding ──────────────────────────────────────────────────────

function islandColor(island: string): { bg: string; border: string; text: string; dot: string } {
  const i = (island || '').toLowerCase().trim();
  if (i.includes('maui'))   return { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', text: '#93c5fd', dot: '#3b82f6' };
  if (i.includes('kauai'))  return { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', text: '#d8b4fe', dot: '#a855f7' };
  if (i.includes('big') || i.includes('hawaii')) return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', text: '#fca5a5', dot: '#ef4444' };
  // Oahu default
  return { bg: 'rgba(20,184,166,0.12)', border: 'rgba(20,184,166,0.3)', text: '#5eead4', dot: '#14b8a6' };
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

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
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

// ─── Quick Schedule Modal ─────────────────────────────────────────────────────

interface QuickScheduleModalProps {
  job: UnscheduledJob | null;
  crewList: CrewListItem[];
  onClose: () => void;
  onScheduled: () => void;
}

function QuickScheduleModal({ job, crewList, onClose, onScheduled }: QuickScheduleModalProps) {
  const [date, setDate] = useState(tomorrow());
  const [selectedCrew, setSelectedCrew] = useState<string[]>([]);
  const [island, setIsland] = useState('');
  const [hoursEst, setHoursEst] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!job) return;
    setIsland(job.island || '');
    setHoursEst(job.hours_est || '');
    setNotes('');
    setDate(tomorrow());
    // Pre-select assigned crew
    if (job.assigned_crew) {
      const names = job.assigned_crew.split(',').map(n => n.trim()).filter(Boolean);
      setSelectedCrew(names);
    } else {
      setSelectedCrew([]);
    }
  }, [job]);

  if (!job) return null;

  const colors = islandColor(island);

  function toggleCrew(name: string) {
    setSelectedCrew(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  }

  async function handleSchedule() {
    if (!job) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/superintendent-scheduling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kID: job.kID,
          project_name: job.name,
          date,
          assigned_crew: selectedCrew,
          island,
          men_required: String(selectedCrew.length),
          hours_estimated: hoursEst,
          notes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onScheduled();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // Group crew by island
  const crewByIsland: Record<string, CrewListItem[]> = {};
  crewList.forEach(c => {
    const key = c.island || 'Other';
    if (!crewByIsland[key]) crewByIsland[key] = [];
    crewByIsland[key].push(c);
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: '100%', maxWidth: 540,
        background: 'linear-gradient(180deg, #0d1f2d 0%, #071722 100%)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderBottom: 'none',
        borderRadius: '20px 20px 0 0',
        padding: '24px 20px 40px',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(251,191,36,0.7)', marginBottom: 4 }}>
              Schedule Job
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.3, maxWidth: 340 }}>
              {job.name}
            </div>
            {job.customer && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{job.customer}</div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '6px 10px', color: '#94a3b8', fontSize: 14, cursor: 'pointer', flexShrink: 0,
          }}>✕</button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', color: '#fca5a5', fontSize: 12, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Date */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, color: '#f1f5f9', fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Island */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
            Island
          </label>
          <select
            value={island}
            onChange={e => setIsland(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, color: '#f1f5f9', fontSize: 14,
              boxSizing: 'border-box',
            }}
          >
            <option value="">Select island…</option>
            <option value="Oahu">Oahu</option>
            <option value="Maui">Maui</option>
            <option value="Kauai">Kauai</option>
            <option value="Big Island">Big Island</option>
          </select>
        </div>

        {/* Hours */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
            Hours Estimated
          </label>
          <input
            type="number"
            placeholder="e.g. 8"
            value={hoursEst}
            onChange={e => setHoursEst(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, color: '#f1f5f9', fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Crew */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
            Assign Crew ({selectedCrew.length} selected)
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
            {Object.entries(crewByIsland).map(([islandName, members]) => (
              <div key={islandName}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 0 3px' }}>
                  {islandName}
                </div>
                {members.map(m => {
                  const checked = selectedCrew.includes(m.name);
                  return (
                    <label key={m.user_id || m.name} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      background: checked ? 'rgba(20,184,166,0.1)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${checked ? 'rgba(20,184,166,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      marginBottom: 3,
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                        background: checked ? '#14b8a6' : 'rgba(255,255,255,0.06)',
                        border: `1.5px solid ${checked ? '#14b8a6' : 'rgba(255,255,255,0.2)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {checked && <span style={{ fontSize: 11, color: '#fff', fontWeight: 900 }}>✓</span>}
                      </div>
                      <input type="checkbox" checked={checked} onChange={() => toggleCrew(m.name)} style={{ display: 'none' }} />
                      <span style={{ fontSize: 13, color: checked ? '#e2e8f0' : '#94a3b8', fontWeight: checked ? 700 : 400 }}>
                        {m.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
            Notes (optional)
          </label>
          <textarea
            placeholder="Any special instructions…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            style={{
              width: '100%', padding: '10px 12px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, color: '#f1f5f9', fontSize: 14, resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          onClick={handleSchedule}
          disabled={saving || !date}
          style={{
            width: '100%', padding: '14px',
            background: saving ? 'rgba(20,184,166,0.3)' : 'linear-gradient(135deg, #0d9488, #14b8a6)',
            border: 'none', borderRadius: 12,
            color: '#fff', fontSize: 15, fontWeight: 800,
            cursor: saving ? 'not-allowed' : 'pointer',
            letterSpacing: '0.01em',
          }}
        >
          {saving ? '⏳ Scheduling…' : '✓ Schedule This Job'}
        </button>
      </div>
    </div>
  );
}

// ─── Edit Slot Modal ──────────────────────────────────────────────────────────

interface EditSlotModalProps {
  slot: DispatchSlot | null;
  crewList: CrewListItem[];
  onClose: () => void;
  onSaved: () => void;
}

function EditSlotModal({ slot, crewList, onClose, onSaved }: EditSlotModalProps) {
  const [date, setDate] = useState('');
  const [selectedCrew, setSelectedCrew] = useState<string[]>([]);
  const [hours, setHours] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slot) return;
    setDate(slot.date);
    setHours(slot.hours_estimated || '');
    setNotes(slot.notes || '');
    setConfirmDelete(false);
    setError('');
    if (slot.assigned_crew) {
      setSelectedCrew(slot.assigned_crew.split(',').map(n => n.trim()).filter(Boolean));
    } else {
      setSelectedCrew([]);
    }
  }, [slot]);

  if (!slot) return null;

  function toggleCrew(name: string) {
    setSelectedCrew(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  }

  async function handleSave() {
    if (!slot) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/superintendent-scheduling', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_id: slot.slot_id,
          date,
          assigned_crew: selectedCrew,
          hours_estimated: hours,
          notes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!slot) return;
    setDeleting(true);
    setError('');
    try {
      const res = await fetch('/api/superintendent-scheduling', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slot.slot_id }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  const crewByIsland: Record<string, CrewListItem[]> = {};
  crewList.forEach(c => {
    const key = c.island || 'Other';
    if (!crewByIsland[key]) crewByIsland[key] = [];
    crewByIsland[key].push(c);
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: '100%', maxWidth: 540,
        background: 'linear-gradient(180deg, #0d1f2d 0%, #071722 100%)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderBottom: 'none',
        borderRadius: '20px 20px 0 0',
        padding: '24px 20px 40px',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(125,211,252,0.7)', marginBottom: 4 }}>
              Edit Slot
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.3, maxWidth: 300 }}>
              {slot.project_name}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
              {slot.slot_id}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '6px 10px', color: '#94a3b8', fontSize: 14, cursor: 'pointer', flexShrink: 0,
          }}>✕</button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', color: '#fca5a5', fontSize: 12, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Date */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' }} />
        </div>

        {/* Hours */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Hours Estimated</label>
          <input type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 8" style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' }} />
        </div>

        {/* Crew */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Crew ({selectedCrew.length})</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
            {Object.entries(crewByIsland).map(([islandName, members]) => (
              <div key={islandName}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 0 3px' }}>{islandName}</div>
                {members.map(m => {
                  const checked = selectedCrew.includes(m.name);
                  return (
                    <label key={m.user_id || m.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: checked ? 'rgba(20,184,166,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${checked ? 'rgba(20,184,166,0.3)' : 'rgba(255,255,255,0.06)'}`, marginBottom: 3 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, background: checked ? '#14b8a6' : 'rgba(255,255,255,0.06)', border: `1.5px solid ${checked ? '#14b8a6' : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {checked && <span style={{ fontSize: 11, color: '#fff', fontWeight: 900 }}>✓</span>}
                      </div>
                      <input type="checkbox" checked={checked} onChange={() => toggleCrew(m.name)} style={{ display: 'none' }} />
                      <span style={{ fontSize: 13, color: checked ? '#e2e8f0' : '#94a3b8', fontWeight: checked ? 700 : 400 }}>{m.name}</span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
        </div>

        <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: '13px', background: saving ? 'rgba(20,184,166,0.3)' : 'linear-gradient(135deg, #0d9488, #14b8a6)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 15, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 10 }}>
          {saving ? '⏳ Saving…' : '✓ Save Changes'}
        </button>

        {/* Delete */}
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} style={{ width: '100%', padding: '11px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 12, color: '#fca5a5', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Delete from Schedule
          </button>
        ) : (
          <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)' }}>
            <div style={{ fontSize: 13, color: '#fca5a5', fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>
              Remove this slot from the schedule?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#94a3b8', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '10px', background: '#dc2626', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 800, cursor: deleting ? 'not-allowed' : 'pointer' }}>
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section: Unscheduled Queue ───────────────────────────────────────────────

interface UnscheduledQueueProps {
  jobs: UnscheduledJob[];
  onSchedule: (job: UnscheduledJob) => void;
}

function UnscheduledQueue({ jobs, onSchedule }: UnscheduledQueueProps) {
  const [expanded, setExpanded] = useState(true);

  if (jobs.length === 0) {
    return (
      <div style={{ padding: '16px 0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
        All jobs are scheduled ✓
      </div>
    );
  }

  const visible = expanded ? jobs : jobs.slice(0, 3);

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(job => {
          const colors = islandColor(job.island);
          return (
            <div key={job.id} style={{
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(251,191,36,0.05)',
              border: '1px solid rgba(251,191,36,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                    {job.name}
                  </span>
                  {job.island && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
                      background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text,
                      whiteSpace: 'nowrap',
                    }}>
                      {job.island}
                    </span>
                  )}
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
                    background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24',
                  }}>
                    {job.status || 'active'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {[job.customer, job.assigned_crew && `→ ${job.assigned_crew.split(',')[0]}`, job.hours_est && `${job.hours_est}h`].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button
                onClick={() => onSchedule(job)}
                style={{
                  padding: '8px 14px', borderRadius: 9, flexShrink: 0,
                  background: 'rgba(251,191,36,0.12)',
                  border: '1px solid rgba(251,191,36,0.3)',
                  color: '#fbbf24', fontSize: 12, fontWeight: 800,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                Schedule →
              </button>
            </div>
          );
        })}
      </div>
      {jobs.length > 3 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: 8, width: '100%', padding: '8px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8, color: '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {expanded ? `Show less ↑` : `Show all ${jobs.length} ↓`}
        </button>
      )}
    </div>
  );
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
                    height: '100%', width: `${pct}%`,
                    background: pct >= 100 ? '#22c55e' : '#14b8a6',
                    borderRadius: 3, transition: 'width 0.4s',
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
            <button style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.1)', color: '#fde68a', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Reassign
            </button>
            <button style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(148,163,184,0.08)', color: '#94a3b8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Notify PM
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section: Week Matrix ─────────────────────────────────────────────────────

interface WeekMatrixProps {
  weekDays: string[];
  weekSlots: DispatchSlot[];
  crewList: CrewListItem[];
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  onEditSlot: (slot: DispatchSlot) => void;
  onRefresh: () => void;
}

function WeekMatrix({ weekDays, weekSlots, crewList, weekOffset, onWeekChange, onEditSlot }: WeekMatrixProps) {
  const projectSet = new Set(weekSlots.map(s => s.project_name));
  const projects = Array.from(projectSet);

  const weekLabel = (() => {
    if (weekOffset === 0) return 'This Week';
    if (weekOffset === 1) return 'Next Week';
    if (weekOffset === -1) return 'Last Week';
    return `Week ${weekOffset > 0 ? '+' : ''}${weekOffset}`;
  })();

  return (
    <div>
      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 12px', justifyContent: 'space-between' }}>
        <button
          onClick={() => onWeekChange(weekOffset - 1)}
          style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          ← Prev
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          {[-1, 0, 1, 2].map(w => (
            <button
              key={w}
              onClick={() => onWeekChange(w)}
              style={{
                padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: weekOffset === w ? 'rgba(20,184,166,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${weekOffset === w ? 'rgba(20,184,166,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: weekOffset === w ? '#5eead4' : '#64748b',
              }}
            >
              {w === 0 ? 'Now' : w === -1 ? '-1' : w === 1 ? '+1' : '+2'}
            </button>
          ))}
        </div>
        <button
          onClick={() => onWeekChange(weekOffset + 1)}
          style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          Next →
        </button>
      </div>

      {/* Week date range label */}
      {weekDays.length > 0 && (
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, textAlign: 'center' }}>
          {weekLabel} · {fmtShort(weekDays[0])} – {fmtShort(weekDays[weekDays.length - 1])}
        </div>
      )}

      {projects.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          No dispatch slots this week
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px' }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', minWidth: 140 }}>
                  Project
                </th>
                {weekDays.map(date => (
                  <th key={date} style={{
                    padding: '6px 8px', textAlign: 'center',
                    fontSize: 11, fontWeight: isToday(date) ? 800 : 600,
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
                  {weekDays.map(date => {
                    const slot = weekSlots.find(s => s.date === date && s.project_name === project);
                    const todayCol = isToday(date);
                    if (!slot) {
                      return (
                        <td key={date} style={{ padding: 4 }}>
                          <div style={{
                            height: 54, borderRadius: 8,
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
                          onClick={() => onEditSlot(slot)}
                          style={{
                            width: '100%', height: 54, borderRadius: 8,
                            background: todayCol
                              ? 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(56,189,248,0.1))'
                              : 'linear-gradient(135deg, rgba(20,184,166,0.15), rgba(15,118,110,0.08))',
                            border: `1px solid ${todayCol ? 'rgba(56,189,248,0.3)' : 'rgba(20,184,166,0.2)'}`,
                            cursor: 'pointer', textAlign: 'left', padding: '6px 8px',
                            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
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
      )}
    </div>
  );
}

// ─── Section: Crew Availability ───────────────────────────────────────────────

function CrewAvailability({ crew, weekDays }: { crew: CrewMember[]; weekDays: string[] }) {
  if (crew.length === 0) {
    return <div style={{ padding: '16px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No crew data</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px 2px' }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', minWidth: 140 }}>Name</th>
            <th style={{ padding: '4px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', minWidth: 70 }}>Island</th>
            {weekDays.map(date => (
              <th key={date} style={{ padding: '4px 8px', textAlign: 'center', fontSize: 10, fontWeight: isToday(date) ? 800 : 600, color: isToday(date) ? '#38bdf8' : '#64748b', minWidth: 44 }}>
                {fmtDayLabel(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {crew.map(member => (
            <tr key={member.user_id || member.name}>
              <td style={{ padding: '3px 10px', fontSize: 12, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap' }}>{member.name}</td>
              <td style={{ padding: '3px 8px', fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>{member.island || '—'}</td>
              {weekDays.map(date => {
                const day = member.booked_days.find(d => d.date === date);
                const booked = day?.booked ?? false;
                const todayCol = isToday(date);
                return (
                  <td key={date} style={{ padding: '3px 4px', textAlign: 'center' }}>
                    <div style={{ width: 32, height: 22, borderRadius: 5, margin: '0 auto', background: booked ? (todayCol ? 'rgba(56,189,248,0.3)' : 'rgba(20,184,166,0.25)') : 'rgba(255,255,255,0.04)', border: booked ? `1px solid ${todayCol ? 'rgba(56,189,248,0.4)' : 'rgba(20,184,166,0.35)'}` : '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {booked && <div style={{ width: 8, height: 8, borderRadius: '50%', background: todayCol ? '#38bdf8' : '#14b8a6' }} />}
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
        <div key={wk.week_start} style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
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
              <span style={{ fontSize: 14, fontWeight: 900, color: bufferColor(wk.buffer), padding: '2px 8px', borderRadius: 6, background: bufferBg(wk.buffer) }}>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: accent || '#e2e8f0', letterSpacing: '0.02em' }}>{title}</span>
      {count !== undefined && (
        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: count > 0 ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.06)', color: count > 0 ? '#fca5a5' : '#64748b', border: `1px solid ${count > 0 ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
          {count}
        </span>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
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
  const [weekOffset, setWeekOffset] = useState(0);

  // Modals
  const [scheduleJob, setScheduleJob] = useState<UnscheduledJob | null>(null);
  const [editSlot, setEditSlot] = useState<DispatchSlot | null>(null);

  const load = useCallback(async (offset?: number) => {
    setLoading(true);
    setError('');
    const wo = offset !== undefined ? offset : weekOffset;
    try {
      const res = await fetch(`/api/superintendent-scheduling?week_offset=${wo}`);
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setData(d);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [weekOffset]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const t = setInterval(() => load(), 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  function handleWeekChange(newOffset: number) {
    setWeekOffset(newOffset);
    load(newOffset);
  }

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
        position: 'sticky', top: 0, zIndex: 10,
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
                {data.unscheduled_jobs?.length > 0 && (
                  <span style={{ color: '#fbbf24', fontWeight: 700, marginRight: 8 }}>
                    ⚠ {data.unscheduled_jobs.length} need scheduling
                  </span>
                )}
                {lastRefresh && <span>Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
              </div>
            )}
          </div>
          <button
            onClick={() => load()}
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

          {/* 0: Unscheduled Queue — TOP */}
          {(data.unscheduled_jobs?.length ?? 0) > 0 && (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 10px', borderBottom: '1px solid rgba(251,191,36,0.12)', background: 'rgba(251,191,36,0.04)' }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24', letterSpacing: '0.02em' }}>Needs Scheduling</span>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
                  {data.unscheduled_jobs.length}
                </span>
              </div>
              <CardBody>
                <UnscheduledQueue
                  jobs={data.unscheduled_jobs}
                  onSchedule={(job) => setScheduleJob(job)}
                />
              </CardBody>
            </Card>
          )}

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
            <SectionHeader icon="📅" title="Week Matrix" accent="#7dd3fc" />
            <CardBody>
              <WeekMatrix
                weekDays={data.week_days}
                weekSlots={data.week_slots}
                crewList={data.crew_list || []}
                weekOffset={weekOffset}
                onWeekChange={handleWeekChange}
                onEditSlot={(slot) => setEditSlot(slot)}
                onRefresh={() => load()}
              />
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

      {/* Modals */}
      {scheduleJob && (
        <QuickScheduleModal
          job={scheduleJob}
          crewList={data?.crew_list || []}
          onClose={() => setScheduleJob(null)}
          onScheduled={() => load()}
        />
      )}

      {editSlot && (
        <EditSlotModal
          slot={editSlot}
          crewList={data?.crew_list || []}
          onClose={() => setEditSlot(null)}
          onSaved={() => load()}
        />
      )}
    </div>
  );
}
