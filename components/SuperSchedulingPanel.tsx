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
  step_ids?: string;
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
  total_steps?: number;
  unscheduled_steps?: number;
}

interface InstallStep {
  install_step_id: string;
  install_plan_id: string;
  step_name: string;
  allotted_hours: number;
  category: string;
  planned_start_date?: string;
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

/** Format 24h "HH:MM" to "H:MM AM/PM" */
function fmtTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Generate time options for full 24 hours in 30-min increments (12:00 AM to 11:30 PM) */
function genTimeOptions(): { label: string; value: string }[] {
  const opts: { label: string; value: string }[] = [];
  for (let h = 0; h <= 23; h++) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const label = fmtTime(value);
      opts.push({ label, value });
    }
  }
  return opts;
}

const TIME_OPTIONS = genTimeOptions();

/** Add hours to a HH:MM time string */
function addHoursToTime(startTime: string, hours: number): string {
  if (!startTime || !hours) return '';
  const [h, m] = startTime.split(':').map(Number);
  const totalMinutes = h * 60 + m + Math.round(hours * 60);
  const endH = Math.floor(totalMinutes / 60);
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

// ─── Quick Schedule Modal ─────────────────────────────────────────────────────

interface QuickScheduleModalProps {
  job: UnscheduledJob | null;
  crewList: CrewListItem[];
  onClose: () => void;
  onScheduled: () => void;
}

// Map area_of_island / city names to canonical island
function areaToIsland(area: string): string {
  const a = (area || '').toLowerCase();
  if (['oahu','honolulu','kapolei','kailua','kaneohe','pearl city','aiea','ewa','hawaii kai','waipahu','mililani'].some(c => a.includes(c))) return 'Oahu';
  if (['maui','kahului','kihei','lahaina','wailuku','wailea','kapalua','paia','makawao','haiku','maalaea','pukalani','kaanapali'].some(c => a.includes(c))) return 'Maui';
  if (['kauai','lihue','kapaa','poipu','princeville','koloa','waimea'].some(c => a.includes(c))) return 'Kauai';
  if (['big island','hawaii','hilo','kona','waimea','kohala','kailua-kona','volcano'].some(c => a.includes(c))) return 'Hawaii';
  if (['lanai','molokai'].some(c => a.includes(c))) return 'Outer Islands';
  return area; // fallback
}

function QuickScheduleModal({ job, crewList, onClose, onScheduled }: QuickScheduleModalProps) {
  const [date, setDate] = useState(tomorrow());
  const [startTime, setStartTime] = useState('07:00');
  const [selectedCrew, setSelectedCrew] = useState<string[]>([]);
  const [island, setIsland] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [steps, setSteps] = useState<InstallStep[]>([]);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);

  useEffect(() => {
    if (!job) return;
    const resolvedIsland = areaToIsland((job as any).area_of_island || job.island || '');
    setIsland(resolvedIsland);
    setNotes('');
    setDate(tomorrow());
    setStartTime('07:00');
    setSelectedStepIds([]);
    if (job.assigned_crew) {
      setSelectedCrew(job.assigned_crew.split(',').map(n => n.trim()).filter(Boolean));
    } else {
      setSelectedCrew([]);
    }
    // Fetch steps for this WO
    setLoadingSteps(true);
    fetch(`/api/work-breakdown/${job.kID}`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => {
        const allSteps: InstallStep[] = (data.steps || []).filter((s: InstallStep) => s.install_step_id);
        setSteps(allSteps);
        // Pre-select unscheduled steps
        setSelectedStepIds(allSteps.filter(s => !s.planned_start_date).map(s => s.install_step_id));
      })
      .catch(() => setSteps([]))
      .finally(() => setLoadingSteps(false));
  }, [job]);

  if (!job) return null;

  function toggleCrew(name: string) {
    setSelectedCrew(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  }

  function toggleStep(id: string) {
    setSelectedStepIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  const selectedSteps = steps.filter(s => selectedStepIds.includes(s.install_step_id));
  const totalHours = selectedSteps.reduce((sum, s) => sum + (s.allotted_hours || 0), 0);
  const endTime = addHoursToTime(startTime, totalHours);

  const stepNames = selectedSteps.map(s => s.step_name).join(', ');
  const projectNameWithSteps = stepNames ? `${job.name} — ${stepNames}` : job.name;

  async function handleSchedule() {
    if (!job) return;
    if (selectedStepIds.length === 0) { setError('Select at least one step to schedule'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/superintendent-scheduling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kID: job.kID,
          project_name: projectNameWithSteps,
          date,
          assigned_crew: selectedCrew,
          island,
          men_required: String(selectedCrew.length),
          hours_estimated: String(totalHours),
          notes,
          start_time: startTime,
          step_ids: selectedStepIds,
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

  const crewByIsland: Record<string, CrewListItem[]> = {};
  crewList.forEach(c => {
    const key = c.island || 'Other';
    if (!crewByIsland[key]) crewByIsland[key] = [];
    crewByIsland[key].push(c);
  });

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, color: '#f1f5f9', fontSize: 14,
    boxSizing: 'border-box' as const,
  };

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
        maxHeight: '92vh',
        overflowY: 'auto',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(251,191,36,0.7)', marginBottom: 4 }}>
              Schedule Steps
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

        {/* Steps */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
            Install Steps ({selectedStepIds.length} selected · {totalHours.toFixed(1)}h total)
          </label>
          {loadingSteps ? (
            <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>Loading steps…</div>
          ) : steps.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: 12, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.1)' }}>
              No install steps found for this WO
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {steps.map(step => {
                const checked = selectedStepIds.includes(step.install_step_id);
                const isScheduled = !!step.planned_start_date;
                return (
                  <label key={step.install_step_id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                    background: checked ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${checked ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    marginBottom: 2, opacity: isScheduled && !checked ? 0.6 : 1,
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                      background: checked ? '#fbbf24' : 'rgba(255,255,255,0.06)',
                      border: `1.5px solid ${checked ? '#fbbf24' : 'rgba(255,255,255,0.2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked && <span style={{ fontSize: 11, color: '#000', fontWeight: 900 }}>✓</span>}
                    </div>
                    <input type="checkbox" checked={checked} onChange={() => toggleStep(step.install_step_id)} style={{ display: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: checked ? '#f1f5f9' : '#94a3b8', fontWeight: checked ? 700 : 400 }}>
                        {step.step_name}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                        {step.allotted_hours}h{isScheduled ? ' · already scheduled' : ''}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Date + Time row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Start Time</label>
            <select value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...inputStyle, appearance: 'none' as const }}>
              {TIME_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Calculated end time */}
        {totalHours > 0 && (
          <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.15)' }}>
            <div style={{ fontSize: 12, color: '#5eead4' }}>
              ⏱ {fmtTime(startTime)} → {fmtTime(endTime)} &nbsp;·&nbsp; {totalHours.toFixed(1)} hours
            </div>
          </div>
        )}

        {/* Island */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
            Island {(job as any)?.area_of_island ? `— ${(job as any).area_of_island}` : ''}
          </label>
          <div style={{
            padding: '10px 12px',
            background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)',
            borderRadius: 10, color: '#5eead4', fontSize: 14, fontWeight: 700,
          }}>
            {island || 'Not set'}
          </div>
        </div>

        {/* Crew */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
            Assign Crew ({selectedCrew.length} selected)
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
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
          disabled={saving || !date || selectedStepIds.length === 0}
          style={{
            width: '100%', padding: '14px',
            background: (saving || selectedStepIds.length === 0) ? 'rgba(20,184,166,0.3)' : 'linear-gradient(135deg, #0d9488, #14b8a6)',
            border: 'none', borderRadius: 12,
            color: '#fff', fontSize: 15, fontWeight: 800,
            cursor: (saving || selectedStepIds.length === 0) ? 'not-allowed' : 'pointer',
            letterSpacing: '0.01em',
          }}
        >
          {saving ? '⏳ Scheduling…' : `✓ Schedule ${selectedStepIds.length} Step${selectedStepIds.length !== 1 ? 's' : ''}`}
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
  const [startTime, setStartTime] = useState('07:00');
  const [selectedCrew, setSelectedCrew] = useState<string[]>([]);
  const [hours, setHours] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  // Step picker
  const [availableSteps, setAvailableSteps] = useState<InstallStep[]>([]);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);

  // Fetch steps when slot changes
  useEffect(() => {
    if (!slot?.kID) return;
    setLoadingSteps(true);
    console.log('[EditSlotModal] Fetching steps for kID:', slot.kID);
    fetch(`/api/work-breakdown/${encodeURIComponent(slot.kID)}`)
      .then(r => {
        console.log('[EditSlotModal] work-breakdown response status:', r.status);
        return r.ok ? r.json() : Promise.reject(r.status);
      })
      .then(data => {
        console.log('[EditSlotModal] steps received:', (data.steps || []).length);
        const steps: InstallStep[] = (data.steps || []).filter((s: InstallStep) => s.install_step_id);
        setAvailableSteps(steps);
        // Pre-select steps already assigned to this slot
        if (slot.step_ids) {
          const ids = slot.step_ids.split(',').map((s: string) => s.trim()).filter(Boolean);
          setSelectedStepIds(ids);
        } else {
          setSelectedStepIds([]);
        }
      })
      .catch((err) => {
        console.warn('[EditSlotModal] step fetch failed:', err);
        setAvailableSteps([]);
      })
      .finally(() => setLoadingSteps(false));
  }, [slot?.kID]);

  useEffect(() => {
    if (!slot) return;
    setDate(slot.date);
    setHours(slot.hours_estimated || '');
    setNotes(slot.notes || '');
    setConfirmDelete(false);
    setError('');
    // Initialize start_time — snap to nearest 30-min slot if needed
    if (slot.start_time) {
      const [h, m] = slot.start_time.split(':').map(Number);
      const snapped = `${String(h).padStart(2, '0')}:${m < 30 ? '00' : '30'}`;
      setStartTime(snapped);
    } else {
      setStartTime('07:00');
    }
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

  const endTime = addHoursToTime(startTime, parseFloat(hours) || 0);

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
          start_time: startTime,
          step_ids: selectedStepIds,
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

        {/* Date + Time */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' as const }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Start Time</label>
            <select value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' as const, appearance: 'none' as const }}>
              {TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>

        {parseFloat(hours) > 0 && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.15)' }}>
            <span style={{ fontSize: 12, color: '#5eead4' }}>⏱ {fmtTime(startTime)} → {fmtTime(endTime)} · {hours}h</span>
          </div>
        )}

        {/* Hours */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Hours Estimated</label>
          <input type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 8" style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' as const }} />
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

        {/* Step Picker */}
        {(availableSteps.length > 0 || loadingSteps) && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
              Install Steps ({selectedStepIds.length} selected)
            </label>
            {loadingSteps ? (
              <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>Loading steps…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                {availableSteps.map(step => {
                  const checked = selectedStepIds.includes(step.install_step_id);
                  return (
                    <label key={step.install_step_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: checked ? 'rgba(20,184,166,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${checked ? 'rgba(20,184,166,0.3)' : 'rgba(255,255,255,0.06)'}`, marginBottom: 3 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, background: checked ? '#14b8a6' : 'rgba(255,255,255,0.06)', border: `1.5px solid ${checked ? '#14b8a6' : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {checked && <span style={{ fontSize: 11, color: '#fff', fontWeight: 900 }}>✓</span>}
                      </div>
                      <input type="checkbox" checked={checked} onChange={() => setSelectedStepIds(prev => checked ? prev.filter(id => id !== step.install_step_id) : [...prev, step.install_step_id])} style={{ display: 'none' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: checked ? '#e2e8f0' : '#94a3b8', fontWeight: checked ? 700 : 400 }}>{step.step_name}</div>
                        {step.allotted_hours > 0 && <div style={{ fontSize: 11, color: '#475569' }}>{step.allotted_hours}h allotted</div>}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

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

const ISLAND_FILTERS = ['Maui', 'Oahu', 'Kauai', 'Hawaii'];
const STATUS_FILTERS = ['approved', 'in_progress', 'scheduled'];

function UnscheduledQueue({ jobs, onSchedule }: UnscheduledQueueProps) {
  const [expanded, setExpanded] = useState(true);
  const [search, setSearch] = useState('');
  const [islandFilters, setIslandFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);

  function toggleFilter<T>(arr: T[], val: T, set: (a: T[]) => void) {
    set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  }

  const filtered = jobs.filter(job => {
    if (search) {
      const q = search.toLowerCase();
      const matches = job.name.toLowerCase().includes(q) ||
        (job.customer || '').toLowerCase().includes(q) ||
        (job.kID || '').toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (islandFilters.length > 0 && !islandFilters.some(f => (job.island || '').toLowerCase().includes(f.toLowerCase()))) return false;
    if (statusFilters.length > 0 && !statusFilters.includes(job.status)) return false;
    return true;
  });

  if (jobs.length === 0) {
    return (
      <div style={{ padding: '16px 0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
        All jobs are scheduled ✓
      </div>
    );
  }

  const visible = expanded ? filtered : filtered.slice(0, 3);

  return (
    <div>
      {/* Search + Filter controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search by job name, customer, WO#…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.05)',
            color: '#f1f5f9', fontSize: 12, outline: 'none', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ISLAND_FILTERS.map(isl => {
            const active = islandFilters.includes(isl);
            const c = islandColor(isl);
            return (
              <button key={isl} onClick={() => toggleFilter(islandFilters, isl, setIslandFilters)}
                style={{
                  padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                  background: active ? c.bg : 'rgba(255,255,255,0.04)',
                  border: active ? `1px solid ${c.border}` : '1px solid rgba(255,255,255,0.1)',
                  color: active ? c.text : '#64748b',
                }}>{isl}</button>
            );
          })}
          <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />
          {STATUS_FILTERS.map(st => {
            const active = statusFilters.includes(st);
            return (
              <button key={st} onClick={() => toggleFilter(statusFilters, st, setStatusFilters)}
                style={{
                  padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                  background: active ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.04)',
                  border: active ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  color: active ? '#fbbf24' : '#64748b',
                  textTransform: 'capitalize',
                }}>{st.replace('_', ' ')}</button>
            );
          })}
          {(islandFilters.length > 0 || statusFilters.length > 0 || search) && (
            <button onClick={() => { setIslandFilters([]); setStatusFilters([]); setSearch(''); }}
              style={{ padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 800, cursor: 'pointer', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
              Clear
            </button>
          )}
        </div>
        {filtered.length !== jobs.length && (
          <div style={{ fontSize: 10, color: '#64748b' }}>
            Showing {filtered.length} of {jobs.length} jobs
          </div>
        )}
      </div>
      {/* Compact table layout */}
      <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', minWidth: 80 }}>WO #</th>
              <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Name</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Island</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>Steps</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((job, i) => {
              const colors = islandColor(job.island);
              const hasSteps = job.total_steps !== undefined && job.total_steps > 0;
              const allScheduled = hasSteps && job.unscheduled_steps === 0;
              return (
                <tr key={job.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                  <td style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>{job.kID}</td>
                  <td style={{ padding: '6px 10px', fontSize: 12, color: '#e2e8f0', maxWidth: 200 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</div>
                    {job.customer && <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.customer}</div>}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    {job.island && (
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 99, background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, whiteSpace: 'nowrap' }}>
                        {job.island}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {hasSteps ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: allScheduled ? '#86efac' : '#fbbf24' }}>
                        {allScheduled ? `✓ all ${job.total_steps}` : `${job.unscheduled_steps}/${job.total_steps} unsched`}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: '#475569' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    <button
                      onClick={() => onSchedule(job)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, flexShrink: 0,
                        background: 'rgba(251,191,36,0.12)',
                        border: '1px solid rgba(251,191,36,0.3)',
                        color: '#fbbf24', fontSize: 11, fontWeight: 800,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      Schedule →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
  // Sort slots within each day by start_time
  const sortedSlots = [...weekSlots].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.start_time || '').localeCompare(b.start_time || '');
  });
  const projectSet = new Set(sortedSlots.map(s => s.project_name));
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
          {[-2, -1, 0, 1, 2].map(w => (
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
              {w === 0 ? 'Now' : w === -2 ? '-2w' : w === -1 ? '-1w' : w === 1 ? '+1w' : '+2w'}
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
                    const slot = sortedSlots.find(s => s.date === date && s.project_name === project);
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
                    const colors = islandColor(slot.island);
                    return (
                      <td key={date} style={{ padding: 4 }}>
                        <button
                          onClick={() => onEditSlot(slot)}
                          style={{
                            width: '100%', minHeight: 64, borderRadius: 8,
                            background: todayCol
                              ? `linear-gradient(135deg, rgba(14,165,233,0.2), rgba(56,189,248,0.1))`
                              : colors.bg,
                            border: `1px solid ${todayCol ? 'rgba(56,189,248,0.3)' : colors.border}`,
                            cursor: 'pointer', textAlign: 'left', padding: '6px 8px',
                            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                          }}
                        >
                          {slot.start_time && (
                            <div style={{ fontSize: 9, fontWeight: 800, color: colors.text, marginBottom: 2 }}>
                              {fmtTime(slot.start_time)}{slot.end_time ? ` – ${fmtTime(slot.end_time)}` : ''}
                            </div>
                          )}
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.2, overflow: 'hidden', flex: 1 }}>
                            {slot.project_name.split('—')[1]?.trim() || slot.work_type || slot.project_name.slice(0, 24)}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                            <span style={{ fontSize: 9, color: '#94a3b8' }}>
                              {crew.length > 0 ? crew[0].split(' ')[0] : 'No crew'}{crew.length > 1 ? ` +${crew.length - 1}` : ''}
                            </span>
                            <span style={{ fontSize: 9, color: '#64748b' }}>
                              {slot.hours_estimated ? `${slot.hours_estimated}h` : ''}
                            </span>
                          </div>
                          {pct > 0 && (
                            <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#22c55e' : '#14b8a6', borderRadius: 2 }} />
                            </div>
                          )}
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

          {/* A: Today's KPIs / Crews */}
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

          {/* E: Unscheduled Queue */}
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

          {/* F: Manpower Forecast */}
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
