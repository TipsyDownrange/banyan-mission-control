'use client';
import { useEffect, useState, useRef, useCallback } from 'react';

type Slot = {
  slot_id: string; date: string; kID: string; project_name: string;
  island: string; men_required: string; hours_estimated: string;
  assigned_crew: string; created_by: string; status: string; confirmations: string;
  work_type: string; notes: string;
};

const WORK_TYPES = [
  'Site Visit / Assessment',
  'Measurement',
  'Installation',
  'Service / Repair',
  'Punch List / Warranty',
  'Pickup / Delivery',
  'Other',
];

const WORK_TYPE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Site Visit / Assessment': { color: '#0369a1', bg: '#eff6ff', border: '#bfdbfe' },
  'Measurement':             { color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
  'Installation':            { color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  'Service / Repair':        { color: '#0e7490', bg: '#ecfeff', border: '#a5f3fc' },
  'Punch List / Warranty':   { color: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
  'Pickup / Delivery':       { color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
  'Other':                   { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
};

function WorkTypeBadge({ type, compact }: { type: string; compact?: boolean }) {
  if (!type) return null;
  const s = WORK_TYPE_STYLE[type] || WORK_TYPE_STYLE['Other'];
  const label = compact ? (type === 'Site Visit / Assessment' ? 'Site Visit' : type === 'Punch List / Warranty' ? 'Punch List' : type === 'Pickup / Delivery' ? 'Pickup' : type) : type;
  return (
    <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 999, color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {label}
    </span>
  );
}

function parseConfirmations(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  (raw || '').split(',').forEach(entry => {
    const [n, s] = entry.trim().split(':');
    if (n?.trim()) map[n.trim()] = s?.trim() || 'pending';
  });
  return map;
}

const CONF_STYLE: Record<string, { icon: string; color: string }> = {
  confirmed: { icon: '✓', color: '#0f766e' },
  declined:  { icon: '✗', color: '#b91c1c' },
  pending:   { icon: '?', color: '#94a3b8' },
};

type CrewMember = { user_id: string; name: string; role: string; island: string };
type WorkOrder = { id: string; name: string; island: string; status: string; contact: string };

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  open:      { color: '#b91c1c', bg: '#fef2f2', label: 'Open' },
  partial:   { color: '#92400e', bg: '#fffbeb', label: 'Partial' },
  filled:    { color: '#0f766e', bg: '#f0fdfa', label: 'Filled' },
  completed: { color: '#64748b', bg: '#f8fafc', label: 'Done' },
};

const ISLAND_COLOR: Record<string, string> = {
  Maui: '#0f766e', Oahu: '#0369a1', Kauai: '#6d28d9', Hawaii: '#92400e',
};

function getWeekDates(startDate: Date): Date[] {
  const dates = [];
  const monday = new Date(startDate);
  monday.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isToday(d: Date): boolean {
  return new Date().toDateString() === d.toDateString();
}

export default function DispatchBoard() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return d;
  });
  const [islandFilter, setIslandFilter] = useState('All');
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [addDate, setAddDate] = useState('');
  const [addProject, setAddProject] = useState('');
  const [addIsland, setAddIsland] = useState('Maui');
  const [addMen, setAddMen] = useState('2');
  const [addHours, setAddHours] = useState('');
  const [addKID, setAddKID] = useState('');
  const [addWorkType, setAddWorkType] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState<{ crewId: string; crewName: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ kID: string; name: string; island: string }[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [showWOPicker, setShowWOPicker] = useState(false);
  const [woSearchQuery, setWoSearchQuery] = useState('');
  const [woIslandFilter, setWoIslandFilter] = useState('All');
  const [woPickerList, setWoPickerList] = useState<WorkOrder[]>([]);
  const [woPickerLoading, setWoPickerLoading] = useState(false);

  const weekDates = getWeekDates(weekStart);
  const fromDate = dateStr(weekDates[0]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/dispatch-schedule?from=${fromDate}&days=28`).then(r => r.json()),
      fetch('/api/crew').then(r => r.json()),
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/service').then(r => r.json()),
    ]).then(([sd, cd, pd, wd]) => {
      setSlots(sd.slots || []);
      setCrew(cd.all || []);
      setProjects(pd.projects || []);
      const activeWOs = (wd.workOrders || []).filter(
        (w: WorkOrder) => w.status !== 'closed' && w.status !== 'lost' && w.name
      );
      setWorkOrders(activeWOs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [fromDate]);

  useEffect(() => { load(); }, [load]);

  function slotsForDay(date: Date): Slot[] {
    const d = dateStr(date);
    return slots.filter(s => s.date === d && (islandFilter === 'All' || s.island === islandFilter));
  }

  function crewForIsland(island: string): CrewMember[] {
    const fieldRoles = ['Superintendent','Journeyman','Apprentice'];
    return crew.filter(c => fieldRoles.some(r => c.role.includes(r)) && (island === 'All' || c.island === island));
  }

  // Touch / tap-to-assign: tap a crew member to select, tap a slot to assign
  // Works alongside drag-and-drop for desktop
  const [tapped, setTapped] = useState<{ crewId: string; crewName: string } | null>(null);

  async function onTapCrew(member: CrewMember) {
    if (tapped?.crewId === member.user_id) {
      setTapped(null); // deselect
    } else {
      setTapped({ crewId: member.user_id, crewName: member.name });
    }
  }

  async function onTapSlot(slotId: string) {
    if (!tapped) return;
    await onAssignCrewToSlot(slotId, tapped.crewName);
    setTapped(null);
  }

  // Drag and drop handlers
  function onDragStartCrew(crewMember: CrewMember) {
    setDragging({ crewId: crewMember.user_id, crewName: crewMember.name });
  }

  async function onAssignCrewToSlot(slotId: string, crewName: string) {
    const slot = slots.find(s => s.slot_id === slotId);
    if (!slot) return;
    const current = slot.assigned_crew ? slot.assigned_crew.split(', ').filter(Boolean) : [];
    if (current.includes(crewName)) return;
    const newCrew = [...current, crewName];
    const required = parseInt(slot.men_required) || 1;
    const newStatus = newCrew.length >= required ? 'filled' : 'partial';
    setSlots(prev => prev.map(s => s.slot_id === slotId ? { ...s, assigned_crew: newCrew.join(', '), status: newStatus } : s));
    await fetch('/api/dispatch-schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot_id: slotId, assigned_crew: newCrew, status: newStatus }),
    });
  }

  async function onDropToSlot(slotId: string) {
    if (!dragging) return;
    await onAssignCrewToSlot(slotId, dragging.crewName);
    setDragging(null);
    setDropTarget(null);
  }

  async function removeCrewFromSlot(slotId: string, crewName: string) {
    const slot = slots.find(s => s.slot_id === slotId);
    if (!slot) return;
    const newCrew = (slot.assigned_crew || '').split(', ').filter(n => n && n !== crewName);
    const required = parseInt(slot.men_required) || 1;
    const newStatus = newCrew.length === 0 ? 'open' : newCrew.length >= required ? 'filled' : 'partial';
    setSlots(prev => prev.map(s => s.slot_id === slotId ? { ...s, assigned_crew: newCrew.join(', '), status: newStatus } : s));
    await fetch('/api/dispatch-schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot_id: slotId, assigned_crew: newCrew, status: newStatus }),
    });
  }

  async function deleteSlot(slotId: string) {
    setSlots(prev => prev.filter(s => s.slot_id !== slotId));
    await fetch(`/api/dispatch-schedule?slot_id=${slotId}`, { method: 'DELETE' });
  }

  async function addSlot() {
    setSaving(true);
    const res = await fetch('/api/dispatch-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: addDate, kID: addKID, project_name: addProject, island: addIsland, men_required: addMen, hours_estimated: addHours, created_by: 'Mission Control', work_type: addWorkType, notes: addNotes }),
    });
    const data = await res.json();
    if (data.ok) {
      setShowAddSlot(false);
      setAddProject(''); setAddDate(''); setAddKID(''); setAddHours('');
      setAddWorkType(''); setAddNotes('');
      setShowWOPicker(false); setWoSearchQuery(''); setWoIslandFilter('All');
      load();
    }
    setSaving(false);
  }

  const availableCrew = crewForIsland(islandFilter);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>People & Assets</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 3 }}>Dispatch Board</h1>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Drag crew members onto job slots · Tap to expand</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Island filter */}
            {['All','Maui','Oahu','Kauai'].map(isl => (
              <button key={isl} onClick={() => setIslandFilter(isl)}
                style={{ padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, border: islandFilter === isl ? `1px solid ${ISLAND_COLOR[isl] || '#0f766e'}` : '1px solid #e2e8f0', background: islandFilter === isl ? `${ISLAND_COLOR[isl] || '#0f766e'}12` : 'white', color: islandFilter === isl ? (ISLAND_COLOR[isl] || '#0f766e') : '#64748b', cursor: 'pointer' }}>
                {isl}
              </button>
            ))}
            {/* Week nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 14, color: '#64748b' }}>‹</button>
              <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setWeekStart(d); }}
                style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', fontSize: 11, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>This Week</button>
              <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 14, color: '#64748b' }}>›</button>
            </div>
            <button onClick={() => setShowAddSlot(true)}
              style={{ padding: '7px 16px', borderRadius: 999, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,118,110,0.3)' }}>
              + Add Slot
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 16 }}>
        {/* Week grid */}
        <div>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
            {weekDates.map(date => (
              <div key={dateStr(date)} style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 8, background: isToday(date) ? 'rgba(3,105,161,0.08)' : 'transparent', border: isToday(date) ? '1px solid rgba(3,105,161,0.2)' : '1px solid transparent' }}>
                <div style={{ fontSize: 11, fontWeight: isToday(date) ? 800 : 600, color: isToday(date) ? '#0369a1' : '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: isToday(date) ? '#0369a1' : '#0f172a' }}>
                  {date.getDate()}
                </div>
                <div style={{ fontSize: 9, color: '#94a3b8' }}>{date.toLocaleDateString('en-US', { month: 'short' })}</div>
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, minHeight: 400 }}>
            {weekDates.map(date => {
              const daySlots = slotsForDay(date);
              const isTarget = dropTarget === dateStr(date);
              return (
                <div key={dateStr(date)}
                  onDragOver={e => { e.preventDefault(); setDropTarget(dateStr(date)); }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={() => setDropTarget(null)}
                  style={{ minHeight: 120, background: isTarget ? 'rgba(15,118,110,0.04)' : isToday(date) ? 'rgba(3,105,161,0.02)' : '#fafafa', borderRadius: 10, border: isTarget ? '2px dashed #14b8a6' : isToday(date) ? '1px solid rgba(3,105,161,0.15)' : '1px solid #f0f0f0', padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {daySlots.length === 0 && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 10, color: '#e2e8f0' }}>—</span>
                    </div>
                  )}
                  {daySlots.map(slot => {
                    const ss = STATUS_STYLE[slot.status] || STATUS_STYLE.open;
                    const assignedNames = slot.assigned_crew ? slot.assigned_crew.split(', ').filter(Boolean) : [];
                    const required = parseInt(slot.men_required) || 1;
                    const isExpanded = expandedSlot === slot.slot_id;
                    const confMap = parseConfirmations(slot.confirmations);

                    return (
                      <div key={slot.slot_id}
                        onDragOver={e => { e.preventDefault(); setDropTarget(slot.slot_id); }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={e => { e.stopPropagation(); onDropToSlot(slot.slot_id); }}
                        onClick={() => tapped ? onTapSlot(slot.slot_id) : setExpandedSlot(isExpanded ? null : slot.slot_id)}
                        style={{ borderRadius: 8, border: `1px solid ${ss.color}33`, background: tapped ? 'rgba(99,102,241,0.08)' : ss.bg, padding: '6px 8px', cursor: tapped ? 'copy' : 'pointer', boxShadow: dropTarget === slot.slot_id || tapped ? `0 0 0 2px ${tapped ? '#6366f1' : (ISLAND_COLOR[slot.island] || '#0f766e')}` : 'none' }}>
                        {/* Slot header */}
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#0f172a', lineHeight: 1.3, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {slot.project_name.length > 20 ? slot.project_name.substring(0,20)+'...' : slot.project_name}
                        </div>
                        {/* Work type badge — compact */}
                        {slot.work_type && (
                          <div style={{ marginBottom: 3 }}>
                            <WorkTypeBadge type={slot.work_type} compact />
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
                          {slot.project_name.startsWith('[WO]') && (
                            <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 999, color: '#0d9488', background: '#ccfbf1', border: '1px solid #5eead4' }}>WO</span>
                          )}
                          {slot.island && <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 999, color: ISLAND_COLOR[slot.island] || '#64748b', background: `${ISLAND_COLOR[slot.island] || '#64748b'}18`, border: `1px solid currentColor` }}>{slot.island}</span>}
                          <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 999, color: ss.color, background: 'white' }}>{ss.label}</span>
                        </div>
                        {/* Crew progress */}
                        <div style={{ fontSize: 9, color: ss.color, fontWeight: 700, marginBottom: 3 }}>
                          {assignedNames.length}/{required} men
                        </div>
                        {/* Assigned crew chips with confirmation status */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {assignedNames.map(name => {
                            // Match by first name (partial match)
                            const firstName = name.split(' ')[0];
                            const confKey = Object.keys(confMap).find(k => k.includes(firstName)) || '';
                            const confStatus = confMap[confKey] || 'pending';
                            const cs = CONF_STYLE[confStatus] || CONF_STYLE.pending;
                            return (
                              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8.5, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: 'white', border: `1px solid ${confStatus === 'confirmed' ? '#0f766e33' : confStatus === 'declined' ? '#b91c1c33' : '#e2e8f0'}`, color: '#334155' }}>
                                <span style={{ fontSize: 7, fontWeight: 900, color: cs.color }}>{cs.icon}</span>
                                {name.split(' ').map(n => n[0]).join('').slice(0,2)}
                                {isExpanded && (
                                  <button onClick={e => { e.stopPropagation(); removeCrewFromSlot(slot.slot_id, name); }}
                                    style={{ width: 12, height: 12, borderRadius: '50%', background: '#fef2f2', border: 'none', cursor: 'pointer', fontSize: 8, color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
                                )}
                              </div>
                            );
                          })}
                          {assignedNames.length < required && (
                            <div style={{ fontSize: 8, padding: '2px 5px', borderRadius: 6, background: 'rgba(15,23,42,0.04)', color: '#94a3b8', border: '1px dashed #e2e8f0' }}>
                              +{required - assignedNames.length}
                            </div>
                          )}
                        </div>
                        {/* Expanded: full name, confirmations, delete */}
                        {isExpanded && (
                          <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: 9, color: '#475569', marginBottom: 4 }}>{slot.project_name}</div>
                            {slot.work_type && <div style={{ marginBottom: 4 }}><WorkTypeBadge type={slot.work_type} /></div>}
                            {slot.hours_estimated && <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 3 }}>{slot.hours_estimated}h est.</div>}
                            {slot.notes && <div style={{ fontSize: 9, color: '#475569', marginBottom: 4, fontStyle: 'italic', background: '#f8fafc', borderRadius: 6, padding: '4px 6px', border: '1px solid #e2e8f0' }}>📋 {slot.notes}</div>}
                            {/* Confirmation breakdown */}
                            {assignedNames.length > 0 && (
                              <div style={{ marginBottom: 4 }}>
                                {assignedNames.map(name => {
                                  const firstName = name.split(' ')[0];
                                  const confKey = Object.keys(confMap).find(k => k.includes(firstName)) || '';
                                  const confStatus = confMap[confKey] || 'pending';
                                  const cs = CONF_STYLE[confStatus] || CONF_STYLE.pending;
                                  return (
                                    <div key={name} style={{ fontSize: 8, color: cs.color, fontWeight: 700 }}>
                                      {cs.icon} {name.split(' ')[0]} — {confStatus}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <button onClick={e => { e.stopPropagation(); deleteSlot(slot.slot_id); }}
                              style={{ marginTop: 2, fontSize: 8, color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700 }}>
                              Remove slot
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Drop hint */}
                  {dragging && (
                    <div style={{ border: '1px dashed #14b8a6', borderRadius: 8, padding: '8px 4px', textAlign: 'center', fontSize: 9, color: '#14b8a6', fontWeight: 700 }}>
                      Drop here
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Crew panel — drag from here */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
            {islandFilter === 'All' ? 'All Islands' : islandFilter} Crew
          </div>
          <div style={{ fontSize: 10, color: tapped ? '#6366f1' : '#94a3b8', marginBottom: 10, fontWeight: tapped ? 700 : 400 }}>
            {tapped ? `${tapped.crewName.split(' ')[0]} selected — tap a slot to assign` : 'Drag onto a slot, or tap to select then tap a slot'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {availableCrew.map(member => {
              const isTapped = tapped?.crewId === member.user_id;
              return (
                <div key={member.user_id}
                  draggable
                  onDragStart={() => { onDragStartCrew(member); setTapped(null); }}
                  onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                  onClick={() => onTapCrew(member)}
                  style={{ padding: '8px 10px', borderRadius: 10, background: isTapped ? 'rgba(99,102,241,0.08)' : 'white', border: isTapped ? '1px solid #6366f1' : `1px solid ${ISLAND_COLOR[member.island] || '#e2e8f0'}33`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: isTapped ? '0 0 0 2px #6366f1' : '0 1px 3px rgba(15,23,42,0.06)', userSelect: 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: isTapped ? 'rgba(99,102,241,0.2)' : `${ISLAND_COLOR[member.island] || '#64748b'}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: isTapped ? '#6366f1' : (ISLAND_COLOR[member.island] || '#64748b'), flexShrink: 0 }}>
                    {member.name.split(' ').map(n => n[0]).join('').slice(0,2)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isTapped ? '#4338ca' : '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name.split(' ')[0]}</div>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>{member.role.replace('Journeyman','J-man').replace('Apprentice','Appr.')}</div>
                  </div>
                  <div style={{ fontSize: 10, color: isTapped ? '#6366f1' : '#cbd5e1', marginLeft: 'auto', flexShrink: 0 }}>{isTapped ? '✓' : '⋮⋮'}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Slot modal */}
      {showAddSlot && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 24, width: '100%', maxWidth: 500, padding: 28, boxShadow: '0 24px 64px rgba(15,23,42,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 18 }}>Add Job Slot</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Project *</label>
                {addProject.startsWith('[WO]') ? (
                  <div style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #0f766e44', background: '#f0fdfa', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#0f766e', fontWeight: 700 }}>{addProject}</span>
                    <button type="button" onClick={() => { setAddProject(''); setAddKID(''); }} style={{ fontSize: 10, color: '#64748b', background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontWeight: 700 }}>Change</button>
                  </div>
                ) : (
                <select value={addKID} onChange={e => {
                  const val = e.target.value;
                  setAddKID(val);
                  if (val === '__WO_PICKER__') {
                    setShowWOPicker(true);
                    setWoSearchQuery('');
                    setWoIslandFilter('All');
                    setAddProject('');
                    if (workOrders.length > 0) {
                      setWoPickerList(workOrders);
                    } else {
                      setWoPickerLoading(true);
                      fetch('/api/service/wo-list').then(r => r.json()).then(d => {
                        setWoPickerList(d.workOrders || []);
                        setWoPickerLoading(false);
                      }).catch(() => setWoPickerLoading(false));
                    }
                    return;
                  }
                  setShowWOPicker(false);
                  setWoSearchQuery('');
                  const proj = projects.find(p => p.kID === val);
                  if (proj) { setAddProject(proj.name); setAddIsland(proj.island); return; }
                  const wo = workOrders.find(w => w.id === val);
                  if (wo) { setAddProject('[WO] ' + wo.name); if (wo.island) setAddIsland(wo.island); }
                }}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, cursor: 'pointer' }}>
                  <option value="">Select project or type below...</option>
                  <optgroup label="── PROJECTS ──">
                    {projects.map(p => <option key={p.kID} value={p.kID}>{p.name} ({p.island})</option>)}
                  </optgroup>
                  <option value="__WO_PICKER__">Service — Work Orders →</option>
                </select>
                )}
              </div>
              {/* Secondary WO Picker */}
              {showWOPicker && (
                <div style={{ border: '1px solid #ccfbf1', borderRadius: 12, padding: 12, background: '#f0fdfa' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                    Select Work Order
                  </div>
                  {/* Island filter pills */}
                  <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
                    {['All', 'Maui', 'Oahu', 'Kauai', 'Hawaii'].map(isl => (
                      <button
                        key={isl}
                        type="button"
                        onClick={() => setWoIslandFilter(isl)}
                        style={{ padding: '5px 11px', borderRadius: 999, fontSize: 10, fontWeight: 800, border: woIslandFilter === isl ? `1.5px solid ${ISLAND_COLOR[isl] || '#0f766e'}` : '1px solid #e2e8f0', background: woIslandFilter === isl ? `${ISLAND_COLOR[isl] || '#0f766e'}15` : 'white', color: woIslandFilter === isl ? (ISLAND_COLOR[isl] || '#0f766e') : '#94a3b8', cursor: 'pointer', minHeight: 30, touchAction: 'manipulation' }}
                      >
                        {isl}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={woSearchQuery}
                    onChange={e => setWoSearchQuery(e.target.value)}
                    placeholder="Search by name, customer..."
                    autoFocus
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, marginBottom: 8 }}
                  />
                  {woPickerLoading && <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 12 }}>Loading work orders…</div>}
                  {!woPickerLoading && woPickerList.length === 0 && (
                    <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 12 }}>No work orders found</div>
                  )}
                  {!woPickerLoading && woPickerList.length > 0 && (
                    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {woPickerList
                        .filter(wo => {
                          const matchIsland = woIslandFilter === 'All' || wo.island === woIslandFilter;
                          const q = woSearchQuery.toLowerCase();
                          const matchSearch = !q || wo.name.toLowerCase().includes(q) || (wo.contact || '').toLowerCase().includes(q);
                          return matchIsland && matchSearch;
                        })
                        .slice(0, 50)
                        .map(wo => (
                          <button
                            key={wo.id}
                            type="button"
                            onClick={() => {
                              setAddProject('[WO] ' + wo.name);
                              if (wo.island) setAddIsland(wo.island);
                              setAddKID(wo.id);
                              setShowWOPicker(false);
                              setWoSearchQuery('');
                              setWoIslandFilter('All');
                            }}
                            style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 12, color: '#0f172a', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                          >
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.name}</span>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              {wo.island && (
                                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, color: ISLAND_COLOR[wo.island] || '#64748b', background: `${ISLAND_COLOR[wo.island] || '#64748b'}18` }}>{wo.island}</span>
                              )}
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
                  {addProject.startsWith('[WO]') && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#0f766e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>✓ {addProject}</span>
                      <button type="button" onClick={() => { setAddProject(''); setAddKID(''); setShowWOPicker(true); }} style={{ fontSize: 9, color: '#0f766e', background: 'none', border: '1px solid #0f766e44', borderRadius: 6, padding: '1px 6px', cursor: 'pointer', fontWeight: 700 }}>Change</button>
                    </div>
                  )}
                </div>
              )}
              {!addKID && (
                <div>
                  <label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Or type job name</label>
                  <input value={addProject} onChange={e => setAddProject(e.target.value)} placeholder="Job name..." style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Date *</label>
                  <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Men Needed</label>
                  <input type="number" value={addMen} onChange={e => setAddMen(e.target.value)} min="1" max="12" style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Est. Hours</label>
                  <input type="number" value={addHours} onChange={e => setAddHours(e.target.value)} placeholder="8" style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Island</label>
                <select value={addIsland} onChange={e => setAddIsland(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, cursor: 'pointer' }}>
                  <option>Maui</option><option>Oahu</option><option>Kauai</option><option>Hawaii</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Work Type *</label>
                <select value={addWorkType} onChange={e => setAddWorkType(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: addWorkType ? '1px solid #e2e8f0' : '1px solid #fca5a5', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, cursor: 'pointer', background: addWorkType ? 'white' : '#fff5f5' }}>
                  <option value="">Select work type…</option>
                  {WORK_TYPES.map(wt => <option key={wt} value={wt}>{wt}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>Notes / Instructions</label>
                <textarea value={addNotes} onChange={e => setAddNotes(e.target.value)}
                  placeholder="e.g. Measure all openings on 2nd floor · Bring silicone and backer rod"
                  rows={2}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical', fontFamily: 'inherit', color: '#334155' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setShowAddSlot(false); setShowWOPicker(false); setWoSearchQuery(''); setWoIslandFilter('All'); setAddKID(''); setAddProject(''); setAddWorkType(''); setAddNotes(''); }} style={{ flex: 1, padding: 11, borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addSlot} disabled={!addDate || (!addKID && !addProject) || showWOPicker || !addWorkType || saving}
                style={{ flex: 2, padding: 11, borderRadius: 12, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Adding...' : 'Add Slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
