'use client';
import { useEffect, useState } from 'react';
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

const STAGES: { key: string; label: string; color: string; bg: string; border: string }[] = [
  { key: 'lead',        label: 'New Lead',       color: '#64748b', bg: 'rgba(248,250,252,0.96)', border: '1px solid rgba(148,163,184,0.2)' },
  { key: 'quote',       label: 'Quote Requested', color: '#0369a1', bg: 'rgba(239,246,255,0.96)', border: '1px solid rgba(59,130,246,0.22)' },
  { key: 'approved',    label: 'Need to Schedule', color: '#92400e', bg: 'rgba(255,251,235,0.96)', border: '1px solid rgba(245,158,11,0.25)' },
  { key: 'scheduled',   label: 'Scheduled',       color: '#4338ca', bg: 'rgba(238,242,255,0.96)', border: '1px solid rgba(99,102,241,0.22)' },
  { key: 'in_progress', label: 'In Progress',     color: '#0f766e', bg: 'rgba(240,253,250,0.96)', border: '1px solid rgba(13,148,136,0.25)' },
  { key: 'closed',      label: 'Completed',       color: '#15803d', bg: 'rgba(240,253,244,0.96)', border: '1px solid rgba(34,197,94,0.22)' },
];

const ISLAND_COLOR: Record<string, string> = {
  Lahaina: '#0369a1', Kahului: '#0f766e', Wailuku: '#6d28d9',
  Kihei: '#92400e', Wailea: '#15803d', Makawao: '#64748b',
};

function WOCard({ wo, expanded, onToggle }: { wo: WorkOrder; expanded: boolean; onToggle: () => void }) {
  const stage = STAGES.find(s => s.key === wo.status) || STAGES[0];
  return (
    <article onClick={onToggle} style={{
      display: 'grid', gap: 12, padding: 16, borderRadius: 20,
      background: stage.bg, border: stage.border,
      boxShadow: '0 8px 24px rgba(15,23,42,0.05)',
      position: 'relative', overflow: 'hidden', cursor: 'pointer',
    }}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 5, background: stage.color, opacity: 0.8 }} />
      <div style={{ paddingLeft: 4 }}>
        {/* Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {wo.id && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8' }}>{wo.id}</span>}
          {wo.island && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, color: ISLAND_COLOR[wo.island] || '#64748b', background: 'rgba(255,255,255,0.7)', border: `1px solid currentColor`, opacity: 0.8 }}>{wo.island}</span>}
        </div>
        {/* Name */}
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.3, marginBottom: 6, letterSpacing: '-0.01em' }}>
          {wo.name}
        </div>
        {/* Description */}
        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4, marginBottom: 8 }}>
          {wo.description}
        </div>
        {/* Meta row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#94a3b8' }}>
          {wo.assignedTo && <span>→ {wo.assignedTo.split(',')[0]}</span>}
          {wo.scheduledDate && <span>📅 {wo.scheduledDate}</span>}
          {wo.hoursEstimated && <span>⏱ {wo.hoursEstimated}h est</span>}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ paddingLeft: 4, borderTop: '1px solid rgba(226,232,240,0.7)', paddingTop: 12, display: 'grid', gap: 8 }}>
          {wo.address && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Address</div>
              <div style={{ fontSize: 12, color: '#334155' }}>{wo.address}</div>
            </div>
          )}
          {wo.contact && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>Contact</div>
              <div style={{ fontSize: 12, color: '#334155' }}>{wo.contact}</div>
            </div>
          )}
          {wo.comments && (
            <div style={{ padding: '8px 12px', borderRadius: 12, background: 'rgba(15,23,42,0.03)', border: '1px solid rgba(148,163,184,0.12)' }}>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(13,148,136,0.7)', marginBottom: 4 }}>Latest Note</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{wo.comments}</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {STAGES.filter(s => s.key !== 'closed' && s.key !== 'lost').map(s => (
              <button key={s.key} onClick={e => { e.stopPropagation(); alert(`Move to ${s.label} — write-back coming soon`); }}
                style={{ padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer',
                  border: wo.status === s.key ? `1px solid ${s.color}` : '1px solid #e2e8f0',
                  background: wo.status === s.key ? s.bg : 'white',
                  color: wo.status === s.key ? s.color : '#94a3b8' }}>
                {s.label}
              </button>
            ))}
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

  useEffect(() => {
    fetch('/api/service')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setData({ workOrders: [], byStatus: {}, stats: { active: 0, completed: 0, needsScheduling: 0, inProgress: 0 }, error: String(e) }); setLoading(false); });
  }, []);

  const filtered = data?.workOrders.filter(wo => {
    if (filter === 'all') return wo.status !== 'closed' && wo.status !== 'lost';
    if (filter === 'completed') return wo.status === 'closed';
    return wo.status === filter;
  }) || [];

  return (
    <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Service</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Work Orders</h1>
          <div style={{ display: 'flex', gap: 8, paddingBottom: 4, alignItems: 'center' }}>
            <button onClick={() => setShowIntake(true)} style={{ padding: '8px 18px', borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,118,110,0.3)' }}>
              + New Lead
            </button>
            {(['kanban','list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                border: view === v ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0',
                background: view === v ? 'rgba(240,253,250,0.96)' : 'white',
                color: view === v ? '#0f766e' : '#64748b', cursor: 'pointer',
              }}>{v === 'kanban' ? 'Kanban' : 'List'}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      {!loading && data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 24,
          padding: 18, borderRadius: 24,
          background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)',
          border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
          {[
            { label: 'Active WOs', value: data.stats.active, helper: 'Open pipeline' },
            { label: 'Need scheduling', value: data.stats.needsScheduling, helper: 'Waiting for date' },
            { label: 'In progress', value: data.stats.inProgress, helper: 'Measuring or fabricating' },
            { label: 'Completed', value: data.stats.completed, helper: 'All time' },
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

      {/* KANBAN VIEW */}
      {!loading && data && view === 'kanban' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16, alignItems: 'start' }}>
          {STAGES.slice(0, 5).map(stage => {
            const wos = data.byStatus[stage.key] || [];
            return (
              <div key={stage.key}>
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>
                    {stage.label}
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{wos.length}</div>
                </div>
                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {wos.length === 0 ? (
                    <div style={{ padding: '20px 16px', borderRadius: 16, background: 'rgba(248,250,252,0.5)', border: '1px dashed rgba(226,232,240,0.8)', textAlign: 'center', fontSize: 12, color: '#cbd5e1' }}>
                      No work orders
                    </div>
                  ) : wos.map(wo => (
                    <WOCard key={wo.id || wo.name} wo={wo}
                      expanded={expanded === (wo.id || wo.name)}
                      onToggle={() => setExpanded(expanded === (wo.id || wo.name) ? null : (wo.id || wo.name))}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LIST VIEW */}
      {!loading && data && view === 'list' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {[['all','Active'],['quote','Quote'],['approved','Need Schedule'],['in_progress','In Progress'],['completed','Completed']].map(([k,l]) => (
              <button key={k} onClick={() => setFilter(k)} style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                border: filter === k ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0',
                background: filter === k ? 'rgba(240,253,250,0.96)' : 'white',
                color: filter === k ? '#0f766e' : '#64748b', cursor: 'pointer',
              }}>{l} · {k === 'all' ? data.workOrders.filter(w=>w.status!=='closed'&&w.status!=='lost').length : k === 'completed' ? data.byStatus.closed?.length||0 : data.byStatus[k]?.length||0}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(wo => (
              <WOCard key={wo.id || wo.name} wo={wo}
                expanded={expanded === (wo.id || wo.name)}
                onToggle={() => setExpanded(expanded === (wo.id || wo.name) ? null : (wo.id || wo.name))}
              />
            ))}
            {filtered.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>No work orders in this view</div>}
          </div>
        </>
      )}

      {/* Lead Intake Modal */}
      {showIntake && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(15,23,42,0.15)' }}>
            <ServiceIntake onClose={() => setShowIntake(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
