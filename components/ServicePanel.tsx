'use client';
import { useEffect, useState, useCallback } from 'react';
import ServiceIntake from '@/components/ServiceIntake';

type WorkOrder = {
  id: string; name: string; description: string;
  status: string; rawStatus: string; island: string;
  assignedTo: string; dateReceived: string; dueDate: string;
  scheduledDate: string; hoursEstimated: string; hoursActual: string;
  comments: string; contact: string; address: string; lane: string;
};

type ServiceData = {
  workOrders: WorkOrder[];
  byStatus: Record<string, WorkOrder[]>;
  stats: { active: number; completed: number; needsScheduling: number; inProgress: number };
  error?: string;
};

type CrewMember = { user_id: string; name: string; role: string; island: string };

const STAGES: { key: string; label: string; color: string; bg: string; border: string }[] = [
  { key: 'lead',        label: 'New Lead',        color: '#64748b', bg: 'rgba(248,250,252,0.96)', border: '1px solid rgba(148,163,184,0.2)' },
  { key: 'quote',       label: 'Quote Requested', color: '#0369a1', bg: 'rgba(239,246,255,0.96)', border: '1px solid rgba(59,130,246,0.22)' },
  { key: 'approved',    label: 'Need to Schedule',color: '#92400e', bg: 'rgba(255,251,235,0.96)', border: '1px solid rgba(245,158,11,0.25)' },
  { key: 'scheduled',   label: 'Scheduled',        color: '#4338ca', bg: 'rgba(238,242,255,0.96)', border: '1px solid rgba(99,102,241,0.22)' },
  { key: 'in_progress', label: 'In Progress',      color: '#0f766e', bg: 'rgba(240,253,250,0.96)', border: '1px solid rgba(13,148,136,0.25)' },
  { key: 'closed',      label: 'Completed',        color: '#15803d', bg: 'rgba(240,253,244,0.96)', border: '1px solid rgba(34,197,94,0.22)' },
];

const ISLAND_COLOR: Record<string, string> = {
  Oahu: '#0369a1', Maui: '#0f766e', Kauai: '#6d28d9', Hawaii: '#92400e', Kauai: '#6d28d9',
};

function WOCard({
  wo, expanded, onToggle, onStageChange, onSave, allCrew,
}: {
  wo: WorkOrder;
  expanded: boolean;
  onToggle: () => void;
  onStageChange: (woId: string, stage: string) => Promise<void>;
  onSave: (woId: string, fields: Partial<WorkOrder>) => Promise<void>;
  allCrew: CrewMember[];
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stageSaving, setStageSaving] = useState('');
  const [draft, setDraft] = useState({
    description: wo.description,
    assignedTo: wo.assignedTo,
    scheduledDate: wo.scheduledDate,
    notes: wo.comments || '',
  });
  const stage = STAGES.find(s => s.key === wo.status) || STAGES[0];

  const INP: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 8,
    border: '1px solid rgba(15,118,110,0.3)', background: 'rgba(240,253,250,0.5)',
    fontSize: 12, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
  };

  async function handleSave() {
    setSaving(true);
    await onSave(wo.id, {
      description: draft.description,
      assignedTo: draft.assignedTo,
      scheduledDate: draft.scheduledDate,
      comments: draft.notes,
    });
    setSaving(false);
    setEditing(false);
  }

  async function handleStageChange(stageKey: string) {
    setStageSaving(stageKey);
    await onStageChange(wo.id, stageKey);
    setStageSaving('');
  }

  // Island-filtered crew for this WO
  const islandCrew = wo.island
    ? allCrew.filter(c => c.island === wo.island || c.role.toLowerCase().includes('pm') || c.role.toLowerCase().includes('service'))
    : allCrew;

  return (
    <article style={{ display: 'grid', gap: 0, borderRadius: 20, background: stage.bg, border: stage.border, boxShadow: '0 8px 24px rgba(15,23,42,0.05)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 5, background: stage.color, opacity: 0.8 }} />

      {/* Card header */}
      <div onClick={onToggle} style={{ padding: '14px 16px', cursor: 'pointer', paddingLeft: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {wo.id && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8' }}>{wo.id}</span>}
              {wo.island && (
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999, color: ISLAND_COLOR[wo.island] || '#64748b', background: 'rgba(255,255,255,0.7)', border: '1px solid currentColor', opacity: 0.8 }}>
                  {wo.island}
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.3, marginBottom: 4, letterSpacing: '-0.01em' }}>{wo.name}</div>
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4, marginBottom: 6 }}>{wo.description}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#94a3b8' }}>
              {wo.assignedTo && <span>→ {wo.assignedTo.split(',')[0]}</span>}
              {wo.scheduledDate && <span>{wo.scheduledDate}</span>}
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); setEditing(!editing); if (!expanded) onToggle(); }}
            style={{ padding: '6px 14px', borderRadius: 10, border: `1px solid ${editing ? 'rgba(15,118,110,0.4)' : 'rgba(226,232,240,0.9)'}`, background: editing ? 'rgba(240,253,250,0.96)' : 'white', color: editing ? '#0f766e' : '#64748b', fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div style={{ paddingLeft: 20, paddingRight: 16, paddingBottom: 16, borderTop: '1px solid rgba(226,232,240,0.6)', paddingTop: 12, display: 'grid', gap: 10 }}>

          {editing ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>Description</div>
                <textarea value={draft.description} onChange={e => setDraft(p => ({ ...p, description: e.target.value }))} rows={2} style={{ ...INP, resize: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>Assigned To</div>
                  <select value={draft.assignedTo} onChange={e => setDraft(p => ({ ...p, assignedTo: e.target.value }))}
                    style={{ ...INP, cursor: 'pointer', WebkitAppearance: 'none' }}>
                    <option value="">Unassigned</option>
                    {islandCrew.filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i).map(c => (
                      <option key={c.user_id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>Scheduled Date</div>
                  <input value={draft.scheduledDate} onChange={e => setDraft(p => ({ ...p, scheduledDate: e.target.value }))} style={INP} placeholder="YYYY-MM-DD" type="date" />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>Note</div>
                <textarea value={draft.notes} onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...INP, resize: 'none' }} />
              </div>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '8px 20px', borderRadius: 12, background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: saving ? '#94a3b8' : 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', width: 'fit-content', boxShadow: saving ? 'none' : '0 2px 8px rgba(15,118,110,0.3)' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {wo.address && <div><div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>Address</div><div style={{ fontSize: 12, color: '#334155' }}>{wo.address}</div></div>}
              {wo.contact && <div><div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>Contact</div><div style={{ fontSize: 12, color: '#334155' }}>{wo.contact}</div></div>}
              {wo.comments && (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(15,23,42,0.03)', border: '1px solid rgba(148,163,184,0.1)' }}>
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(13,148,136,0.7)', marginBottom: 3 }}>Latest Note</div>
                  <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{wo.comments}</div>
                </div>
              )}
            </div>
          )}

          {/* Stage move */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>Move to stage</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STAGES.filter(s => s.key !== 'lost').map(s => (
                <button key={s.key}
                  onClick={e => { e.stopPropagation(); handleStageChange(s.key); }}
                  disabled={wo.status === s.key || !!stageSaving}
                  style={{
                    padding: '5px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '0.06em', cursor: wo.status === s.key || stageSaving ? 'default' : 'pointer',
                    border: wo.status === s.key ? `1px solid ${s.color}` : '1px solid #e2e8f0',
                    background: stageSaving === s.key ? '#f1f5f9' : wo.status === s.key ? s.bg : 'white',
                    color: wo.status === s.key ? s.color : '#94a3b8',
                    opacity: stageSaving && stageSaving !== s.key ? 0.5 : 1,
                  }}>
                  {stageSaving === s.key ? '...' : s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export default function ServicePanel() {
  const [data, setData] = useState<ServiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [showIntake, setShowIntake] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [allCrew, setAllCrew] = useState<CrewMember[]>([]);
  // Local optimistic state overrides: woId → partial WO
  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<WorkOrder>>>({});

  const loadData = useCallback(() => {
    setLoading(true);
    fetch('/api/service')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => {
        setData({ workOrders: [], byStatus: {}, stats: { active: 0, completed: 0, needsScheduling: 0, inProgress: 0 }, error: String(e) });
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    fetch('/api/crew')
      .then(r => r.json())
      .then(d => setAllCrew(d.all || []))
      .catch(() => {});
  }, []);

  // Merge local overrides into work orders for optimistic UI
  const mergedWorkOrders = (data?.workOrders || []).map(wo => {
    const key = wo.id || wo.name;
    return localOverrides[key] ? { ...wo, ...localOverrides[key] } : wo;
  });

  const mergedByStatus: Record<string, WorkOrder[]> = {};
  for (const stage of STAGES) {
    mergedByStatus[stage.key] = mergedWorkOrders.filter(w => w.status === stage.key);
  }

  async function handleStageChange(woId: string, stage: string) {
    // Optimistic update
    setLocalOverrides(prev => ({ ...prev, [woId]: { ...prev[woId], status: stage } }));
    try {
      await fetch('/api/service/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ woNumber: woId, stage }),
      });
    } catch {
      // Revert on failure
      setLocalOverrides(prev => {
        const next = { ...prev };
        delete next[woId];
        return next;
      });
    }
  }

  async function handleSave(woId: string, fields: Partial<WorkOrder>) {
    // Optimistic update
    setLocalOverrides(prev => ({ ...prev, [woId]: { ...prev[woId], ...fields } }));
    try {
      await fetch('/api/service/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          woNumber: woId,
          description: fields.description,
          assignedTo: fields.assignedTo,
          scheduledDate: fields.scheduledDate,
          notes: fields.comments,
        }),
      });
    } catch {
      setLocalOverrides(prev => {
        const next = { ...prev };
        delete next[woId];
        return next;
      });
    }
  }

  const filtered = mergedWorkOrders.filter(wo => {
    if (filter === 'all') return wo.status !== 'closed' && wo.status !== 'lost';
    if (filter === 'completed') return wo.status === 'closed';
    return wo.status === filter;
  });

  return (
    <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Service</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Work Orders</h1>
          <div style={{ display: 'flex', gap: 8, paddingBottom: 4, alignItems: 'center' }}>
            <button onClick={() => setShowIntake(true)}
              style={{ padding: '8px 18px', borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,118,110,0.3)' }}>
              + New Lead
            </button>
            <button onClick={loadData}
              style={{ padding: '7px 14px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer' }}>
              Refresh
            </button>
            {(['kanban', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', border: view === v ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0', background: view === v ? 'rgba(240,253,250,0.96)' : 'white', color: view === v ? '#0f766e' : '#64748b', cursor: 'pointer' }}>
                {v === 'kanban' ? 'Board' : 'List'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      {!loading && data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 24, padding: 18, borderRadius: 24, background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)', border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
          {[
            { label: 'Active WOs',      value: data.stats.active,          helper: 'Open pipeline' },
            { label: 'Need scheduling', value: data.stats.needsScheduling, helper: 'Waiting for date' },
            { label: 'In progress',     value: data.stats.inProgress,      helper: 'Measuring or fabricating' },
            { label: 'Completed',       value: data.stats.completed,       helper: 'All time' },
          ].map(s => (
            <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
              <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ background: 'white', borderRadius: 24, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading work orders from Smartsheet...</div>
        </div>
      )}

      {data?.error && (
        <div style={{ background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: '14px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c' }}>Error loading work orders</div>
          <div style={{ fontSize: 12, color: '#475569' }}>{data.error}</div>
        </div>
      )}

      {/* KANBAN */}
      {!loading && data && view === 'kanban' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16, alignItems: 'start' }}>
          {STAGES.slice(0, 5).map(stage => {
            const wos = mergedByStatus[stage.key] || [];
            return (
              <div key={stage.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{stage.label}</div>
                  <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{wos.length}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {wos.length === 0 ? (
                    <div style={{ padding: '20px 16px', borderRadius: 16, background: 'rgba(248,250,252,0.5)', border: '1px dashed rgba(226,232,240,0.8)', textAlign: 'center', fontSize: 12, color: '#cbd5e1' }}>
                      No work orders
                    </div>
                  ) : wos.map(wo => (
                    <WOCard key={wo.id || wo.name} wo={wo}
                      expanded={expanded === (wo.id || wo.name)}
                      onToggle={() => setExpanded(expanded === (wo.id || wo.name) ? null : (wo.id || wo.name))}
                      onStageChange={handleStageChange}
                      onSave={handleSave}
                      allCrew={allCrew}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LIST */}
      {!loading && data && view === 'list' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              ['all', 'Active', mergedWorkOrders.filter(w => w.status !== 'closed' && w.status !== 'lost').length],
              ['quote', 'Quote', mergedByStatus.quote?.length || 0],
              ['approved', 'Need Schedule', mergedByStatus.approved?.length || 0],
              ['in_progress', 'In Progress', mergedByStatus.in_progress?.length || 0],
              ['completed', 'Completed', mergedByStatus.closed?.length || 0],
            ].map(([k, l, count]) => (
              <button key={k} onClick={() => setFilter(k as string)}
                style={{ padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', border: filter === k ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0', background: filter === k ? 'rgba(240,253,250,0.96)' : 'white', color: filter === k ? '#0f766e' : '#64748b', cursor: 'pointer' }}>
                {l} · {count}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(wo => (
              <WOCard key={wo.id || wo.name} wo={wo}
                expanded={expanded === (wo.id || wo.name)}
                onToggle={() => setExpanded(expanded === (wo.id || wo.name) ? null : (wo.id || wo.name))}
                onStageChange={handleStageChange}
                onSave={handleSave}
                allCrew={allCrew}
              />
            ))}
            {filtered.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>No work orders in this view</div>}
          </div>
        </>
      )}

      {/* Intake modal */}
      {showIntake && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(15,23,42,0.15)' }}>
            <ServiceIntake
              onClose={() => setShowIntake(false)}
              onCreated={() => { setShowIntake(false); loadData(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
