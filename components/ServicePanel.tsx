'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import DashboardHeader, { KPI, ActionItem } from './DashboardHeader';
import FilterBar, { FilterChip, SortOption } from '@/components/shared/FilterBar';
import ServiceIntake from '@/components/ServiceIntake';
import QuoteBuilder from '@/components/QuoteBuilder';
import WODetailPanel from '@/components/WODetailPanel';
import WOEstimatePanel, { EstimateTotals } from '@/components/WOEstimatePanel';

type WorkOrder = {
  id: string; name: string; description: string;
  status: string; rawStatus: string; island: string; area_of_island?: string;
  assignedTo: string; dateReceived: string; dueDate: string;
  scheduledDate: string; startDate: string;
  hoursEstimated: string; hoursActual: string; hoursToMeasure: string;
  men: string; done: boolean;
  comments: string; contact: string; address: string; lane: string;
  // Separate contact + customer fields
  contact_person?: string; contact_phone?: string; contact_email?: string;
  customer_name?: string;
  folderUrl?: string;
  systemType?: string;
};

type ServiceData = {
  workOrders: WorkOrder[];
  byStatus: Record<string, WorkOrder[]>;
  stats: { active: number; completed: number; needsScheduling: number; inProgress: number };
  error?: string;
};

type CrewMember = { user_id: string; name: string; role: string; island: string };

const STAGES: { key: string; label: string; color: string; bg: string; border: string }[] = [
  { key: 'lead',               label: 'New Lead',           color: '#3b82f6', bg: 'rgba(239,246,255,0.96)', border: '1px solid rgba(59,130,246,0.2)' },
  { key: 'quoted',             label: 'Quoted',             color: '#3b82f6', bg: 'rgba(239,246,255,0.96)', border: '1px solid rgba(59,130,246,0.2)' },
  { key: 'accepted',           label: 'Accepted',           color: '#0f766e', bg: 'rgba(240,253,250,0.96)', border: '1px solid rgba(15,118,110,0.2)' },
  { key: 'approved',           label: 'Accepted',           color: '#0f766e', bg: 'rgba(240,253,250,0.96)', border: '1px solid rgba(15,118,110,0.2)' },
  { key: 'deposit_received',   label: 'Deposit Received',   color: '#0f766e', bg: 'rgba(240,253,250,0.96)', border: '1px solid rgba(15,118,110,0.2)' },
  { key: 'materials_ordered',  label: 'Materials Ordered',  color: '#d97706', bg: 'rgba(255,251,235,0.96)', border: '1px solid rgba(217,119,6,0.2)' },
  { key: 'materials_received', label: 'Materials In',       color: '#d97706', bg: 'rgba(255,251,235,0.96)', border: '1px solid rgba(217,119,6,0.2)' },
  { key: 'ready_to_schedule',  label: 'Ready to Schedule',  color: '#7c3aed', bg: 'rgba(245,243,255,0.96)', border: '1px solid rgba(124,58,237,0.2)' },
  { key: 'scheduled',          label: 'Scheduled',          color: '#7c3aed', bg: 'rgba(245,243,255,0.96)', border: '1px solid rgba(124,58,237,0.2)' },
  { key: 'in_progress',        label: 'In Progress',        color: '#7c3aed', bg: 'rgba(245,243,255,0.96)', border: '1px solid rgba(124,58,237,0.2)' },
  { key: 'work_complete',      label: 'Work Complete',      color: '#16a34a', bg: 'rgba(240,253,244,0.96)', border: '1px solid rgba(22,163,74,0.22)' },
  { key: 'completed',          label: 'Completed',          color: '#16a34a', bg: 'rgba(240,253,244,0.96)', border: '1px solid rgba(22,163,74,0.22)' },
  { key: 'invoiced',           label: 'Invoiced',           color: '#16a34a', bg: 'rgba(240,253,244,0.96)', border: '1px solid rgba(22,163,74,0.22)' },
  { key: 'paid',               label: 'Paid',               color: '#16a34a', bg: 'rgba(240,253,244,0.96)', border: '1px solid rgba(22,163,74,0.22)' },
  { key: 'closed',             label: 'Closed',             color: '#64748b', bg: 'rgba(248,250,252,0.96)', border: '1px solid rgba(148,163,184,0.2)' },
  { key: 'lost',               label: 'Declined',           color: '#dc2626', bg: 'rgba(254,242,242,0.96)', border: '1px solid rgba(220,38,38,0.2)' }, // stored literal 'lost' preserved
];

const ISLAND_COLORS: Record<string, string> = {
  'Maui': '#3b82f6',
  'Oahu': '#0f766e',
  'Kauai': '#7c3aed',
  'Hawaii': '#16a34a',
  'Molokai': '#ea580c',
  'Lanai': '#dc2626',
  'Hana': '#d97706',
};

// Normalize raw Smartsheet statuses to display stages
function normalizeStatus(raw: string): string {
  switch (raw) {
    case 'quote':
    case 'quote_requested': return 'lead';
    case 'accepted':        return 'approved';
    default:                return raw || 'lead';
  }
}

const AREA_COLOR: Record<string, string> = {
  // Maui areas
  lahaina: '#0f766e', kahului: '#0369a1', kihei: '#6d28d9',
  wailea: '#15803d', wailuku: '#92400e', maalaea: '#0369a1',
  makawao: '#64748b', paia: '#0f766e', kapalua: '#15803d',
  // Oahu
  honolulu: '#0369a1', kapolei: '#6d28d9', kailua: '#0f766e',
  kaneohe: '#15803d', 'hawaii kai': '#92400e', aiea: '#64748b',
  // Kauai
  lihue: '#6d28d9', kapaa: '#0f766e', poipu: '#15803d',
  // Big Island
  hilo: '#92400e', kona: '#0369a1', waimea: '#6d28d9',
};

function areaColor(area: string): string {
  return AREA_COLOR[area?.toLowerCase()] || '#64748b';
}

// Normalize ALL CAPS strings from Smartsheet to Title Case
function toTitleCase(str: string): string {
  if (!str) return str;
  // If string is all uppercase (ignoring spaces/numbers/punctuation), convert it
  const letters = str.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 2 && letters === letters.toUpperCase()) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  return str;
}

function WOCard({
  wo, onDetail,
}: {
  wo: WorkOrder;
  onDetail: (wo: WorkOrder) => void;
}) {
  const statusStage = STAGES.find(s => s.key === wo.status) || STAGES.find(s => s.key === 'lead')!;
  const islandColor = ISLAND_COLORS[wo.island || ''] || '#64748b';

  return (
    <article data-wo-id={wo.id || wo.name} style={{ borderRadius: 10, background: 'white', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 8px rgba(15,23,42,0.04)', position: 'relative', overflow: 'hidden', marginBottom: 0, borderLeft: `4px solid ${statusStage.color}` }}>

      {/* Simplified card — click anywhere to open detail panel */}
      <div onClick={() => onDetail(wo)} style={{ padding: '10px 12px', cursor: 'pointer' }}>
        {/* Row 1: WO# + island badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{wo.id || ''}</span>
          {wo.island && (
            <span style={{ fontSize: 10, color: islandColor, background: `${islandColor}15`, padding: '1px 6px', borderRadius: 999, fontWeight: 700 }}>{wo.island}</span>
          )}
        </div>

        {/* Row 2: WO name — bold, 2 lines max */}
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {toTitleCase(wo.name) || wo.id}
        </div>

        {/* Row 3: Assigned to */}
        {wo.assignedTo && (
          <div style={{ fontSize: 11, color: '#64748b' }}>→ {toTitleCase(wo.assignedTo.split(',')[0])}{wo.assignedTo.split(',').length > 1 ? ` +${wo.assignedTo.split(',').length - 1}` : ''}</div>
        )}

        {/* Folder link — small icon if present */}
        {wo.folderUrl && (
          <div style={{ marginTop: 4 }} onClick={e => e.stopPropagation()}>
            <a href={wo.folderUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#0369a1', textDecoration: 'none' }} title="Open Drive folder">📁</a>
          </div>
        )}
      </div>
    </article>
  );
}

const READ_ONLY_BANNER = (
  <div style={{ margin: '0 32px 16px', padding: '10px 16px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, fontSize: 12, color: '#92400e', fontWeight: 600 }}>
    👁 View only — contact Joey or Sean to make changes
  </div>
);

export default function ServicePanel({ readOnly = false, focusWoId }: { readOnly?: boolean; focusWoId?: string | null }) {
  const { data: session } = useSession();
  const userRole = (session?.user as { email?: string; role?: string } | undefined)?.role || 'field';
  // Superintendent defaults to 'approved' (Need to Schedule) — their actionable view
  const defaultFilter = userRole === 'super' ? 'approved' : 'all';
  // GM and service_pm can create new leads; supers and others cannot
  const canCreateLeads = ['gm', 'owner', 'service_pm', 'super'].includes(userRole);

  const [data, setData] = useState<ServiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [showIntake, setShowIntake] = useState(false);
  const [quoteWO, setQuoteWO] = useState<string | null>(null);
  const [quoteEstimateData, setQuoteEstimateData] = useState<EstimateTotals | undefined>(undefined);
  const [estimateWO, setEstimateWO] = useState<WorkOrder | null>(null);
  const [estimateProcurementOrders, setEstimateProcurementOrders] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(focusWoId || null);
  const [detailWO, setDetailWO] = useState<WorkOrder | null>(null);
  const deepLinkRef = useRef<string | null>(null);
  const urlSetRef = useRef(false);

  // MC-017: capture ?wo= deep-link on mount
  useEffect(() => {
    const woParam = new URLSearchParams(window.location.search).get('wo');
    if (woParam) deepLinkRef.current = woParam;
  }, []);

  // Scroll to focused WO when navigating from Org panel
  useEffect(() => {
    if (!focusWoId) return;
    setExpanded(focusWoId);
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-wo-id="${focusWoId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
    return () => clearTimeout(timer);
  }, [focusWoId]);
  const [filter, setFilter] = useState(defaultFilter);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [showCompleted, setShowCompleted] = useState(false); // off by default — keeps board clean
  const [showDeclined, setShowDeclined] = useState(false);
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

  // MC-017: when data loads, open WO from deep-link
  useEffect(() => {
    if (!data) return;
    const targetId = deepLinkRef.current;
    if (!targetId) return;
    const wo = data.workOrders.find(w => w.id === targetId || w.id === `WO-${targetId}` || `WO-${w.id}` === targetId);
    if (wo) {
      deepLinkRef.current = null;
      setDetailWO(wo);
      urlSetRef.current = true;
    }
  }, [data]);

  // MC-017: sync URL when detailWO changes
  useEffect(() => {
    if (detailWO) {
      urlSetRef.current = true;
      window.history.replaceState(null, '', `?wo=${encodeURIComponent(detailWO.id)}`);
    } else if (urlSetRef.current) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [detailWO]);

  useEffect(() => {
    fetch('/api/crew')
      .then(r => r.json())
      .then(d => setAllCrew(d.all || []))
      .catch(() => {});
  }, []);

  // Merge local overrides into work orders for optimistic UI
  // Also normalize raw statuses (quote/quote_requested→lead, accepted→approved)
  const mergedWorkOrders = (data?.workOrders || []).map(wo => {
    const key = wo.id || wo.name;
    const base = localOverrides[key] ? { ...wo, ...localOverrides[key] } : wo;
    // Normalize status unless a local override already set it to a valid stage
    const normalizedStatus = normalizeStatus(base.status);
    return normalizedStatus !== base.status ? { ...base, rawStatus: base.status, status: normalizedStatus } : base;
  });

  const mergedByStatus: Record<string, WorkOrder[]> = {};
  for (const stage of STAGES) {
    mergedByStatus[stage.key] = mergedWorkOrders.filter(w => w.status === stage.key);
  }

  async function handleStageChange(woId: string, stage: string, reason?: string) {
    // Optimistic update
    setLocalOverrides(prev => ({ ...prev, [woId]: { ...prev[woId], status: stage } }));
    try {
      await fetch('/api/service/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ woNumber: woId, stage, reason }),
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

  async function handleLinkFolder(woId: string, woName: string, folderUrl: string) {
    // Optimistic update
    setLocalOverrides(prev => ({ ...prev, [woId]: { ...prev[woId], folderUrl } }));
    try {
      await fetch('/api/service/folder-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ woName, folderUrl }),
      });
    } catch {
      // Non-fatal: optimistic update stays, will be confirmed on next refresh
    }
  }

  async function handleSave(woId: string, fields: Partial<WorkOrder> & { hoursEstimated?: string; hoursActual?: string; _woName?: string; _island?: string; }) {
    // Optimistic update
    setLocalOverrides(prev => ({ ...prev, [woId]: { ...prev[woId], ...fields } }));
    try {
      await fetch('/api/service/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          woNumber: woId,
          woName: fields._woName,
          island: fields._island,
          description: fields.description,
          assignedTo: fields.assignedTo,
          scheduledDate: fields.scheduledDate,
          notes: fields.comments,
          hoursEstimated: fields.hoursEstimated,
          hoursActual: fields.hoursActual,
          // Separate contact + customer fields from WODetailPanel
          contactPerson: (fields as WorkOrder & { contact_person?: string }).contact_person,
          contactPhone:  (fields as WorkOrder & { contact_phone?: string }).contact_phone,
          contactEmail:  (fields as WorkOrder & { contact_email?: string }).contact_email,
          customerName:  (fields as WorkOrder & { customer_name?: string }).customer_name,
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

  // Search + filter + sort applied to all views
  const searchLower = search.toLowerCase();
  const completedStatuses = new Set(['closed', 'completed', 'work_complete']);
  const filteredWOs = mergedWorkOrders.filter(wo => {
    if (wo.status === 'lost' && !showDeclined && !search && filter === 'all') return false;
    // Hide completed unless showCompleted is on OR we're actively filtering/searching for them
    if (completedStatuses.has(wo.status) && !showCompleted && !search && filter === 'all') return false;
    if (filter !== 'all' && wo.status !== filter) return false;
    if (search) {
      const q = searchLower;
      if (!(
        wo.name.toLowerCase().includes(q) ||
        wo.description.toLowerCase().includes(q) ||
        wo.contact.toLowerCase().includes(q) ||
        wo.island.toLowerCase().includes(q) ||
        wo.address.toLowerCase().includes(q) ||
        wo.id.toLowerCase().includes(q) ||
        wo.assignedTo.toLowerCase().includes(q)
      )) return false;
    }
    return true;
  });

  const sortedWOs = [...filteredWOs].sort((a, b) => {
    switch (sort) {
      case 'name': return a.name.localeCompare(b.name);
      case 'status': {
        const ai = STAGES.findIndex(s => s.key === a.status);
        const bi = STAGES.findIndex(s => s.key === b.status);
        return ai - bi;
      }
      case 'date_asc': return (a.dateReceived || '').localeCompare(b.dateReceived || '');
      case 'date_desc': return (b.dateReceived || '').localeCompare(a.dateReceived || '');
      default: return 0;
    }
  });

  const filteredByStatus: Record<string, WorkOrder[]> = {};
  for (const stage of STAGES) {
    filteredByStatus[stage.key] = sortedWOs.filter(w => w.status === stage.key);
  }

  // Keep 'filtered' alias for list view
  const filtered = sortedWOs;

  return (
    <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
      {readOnly && READ_ONLY_BANNER}
      {/* Dashboard */}
      {(() => {
        const needsAction = mergedWorkOrders.filter(w => w.status === 'lead');
        const scheduled = mergedWorkOrders.filter(w => w.status === 'scheduled' || w.status === 'in_progress');
        const completed = mergedWorkOrders.filter(w => w.status === 'closed' || w.status === 'completed');
        const kpis: KPI[] = [
          { label: 'Open Work Orders', value: mergedWorkOrders.length - completed.length, subtitle: `${completed.length} completed` },
          { label: 'Needs Action', value: needsAction.length, subtitle: 'New leads', color: needsAction.length > 5 ? '#d97706' : '#059669' },
          { label: 'Scheduled', value: scheduled.length, subtitle: 'In the pipeline', color: '#0369a1' },
          { label: 'Completed', value: completed.length, color: '#059669' },
        ];
        const ai: ActionItem[] = [];
        const leads = mergedWorkOrders.filter(w => w.status === 'lead');
        if (leads.length > 0) ai.push({ text: 'New leads', severity: 'high', count: leads.length });
        return <DashboardHeader title="Service" subtitle={`${mergedWorkOrders.length} work orders`} kpis={kpis} actionItems={ai} />;
      })()}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Work Orders</h1>
          <div style={{ display: 'flex', gap: 8, paddingBottom: 4, alignItems: 'center' }}>
            {(!readOnly && canCreateLeads) && <button onClick={() => setShowIntake(true)}
              style={{ padding: '8px 18px', borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,118,110,0.3)' }}>
              + New Lead
            </button>}
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
            { label: 'Active WOs',      value: data.stats.active,          helper: 'Open pipeline',             filterKey: 'all' },
            { label: 'Need scheduling', value: data.stats.needsScheduling, helper: 'Waiting for date',           filterKey: 'approved' },
            { label: 'In progress',     value: data.stats.inProgress,      helper: 'Measuring or fabricating',  filterKey: 'in_progress' },
            { label: 'Completed',       value: data.stats.completed,       helper: 'All time',                  filterKey: 'closed' },
          ].map(s => {
            const isActive = filter === s.filterKey;
            return (
              <button
                key={s.label}
                onClick={() => setFilter(isActive ? 'all' : s.filterKey)}
                style={{
                  padding: '14px 16px', borderRadius: 18, textAlign: 'left',
                  background: isActive ? 'rgba(15,118,110,0.08)' : 'rgba(255,255,255,0.78)',
                  border: isActive ? '2px solid rgba(15,118,110,0.45)' : '1px solid rgba(226,232,240,0.95)',
                  cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: isActive ? '0 2px 12px rgba(15,118,110,0.12)' : 'none',
                }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: isActive ? '#0f766e' : '#64748b' }}>{s.label}</div>
                <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, letterSpacing: '-0.05em', color: isActive ? '#0f766e' : '#0f172a', lineHeight: 1 }}>{s.value}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: isActive ? '#0f766e' : '#94a3b8' }}>{s.helper}</div>
              </button>
            );
          })}
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
      {/* Show Completed / Show Declined toggles */}
      {!loading && data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <button onClick={() => setShowCompleted(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: showCompleted ? '1px solid rgba(21,128,61,0.4)' : '1px solid #e2e8f0',
            background: showCompleted ? 'rgba(240,253,244,0.9)' : 'white',
            color: showCompleted ? '#15803d' : '#64748b',
          }}>
            <span style={{ fontSize: 14 }}>{showCompleted ? '☑' : '☐'}</span>
            Show Completed
            <span style={{ padding: '1px 6px', borderRadius: 999, background: '#f1f5f9', fontSize: 11, color: '#94a3b8' }}>
              {(mergedByStatus['closed']?.length || 0) + (mergedByStatus['work_complete']?.length || 0)}
            </span>
          </button>
          <button onClick={() => setShowDeclined(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: showDeclined ? '1px solid rgba(220,38,38,0.3)' : '1px solid #e2e8f0',
            background: showDeclined ? 'rgba(254,242,242,0.9)' : 'white',
            color: showDeclined ? '#dc2626' : '#64748b',
          }}>
            <span style={{ fontSize: 14 }}>{showDeclined ? '☑' : '☐'}</span>
            Show Declined
            <span style={{ padding: '1px 6px', borderRadius: 999, background: '#f1f5f9', fontSize: 11, color: '#94a3b8' }}>
              {mergedByStatus['lost']?.length || 0}
            </span>
          </button>
        </div>
      )}

      {/* Shared FilterBar — above both kanban and list */}
      {!loading && data && (
        <FilterBar
          chips={[
            { id: 'all',         label: 'All Active',     count: mergedWorkOrders.filter(w => w.status !== 'lost' && w.status !== 'closed').length, color: '#64748b' },
            { id: 'lead',        label: 'New Leads',      count: mergedByStatus['lead']?.length || 0,        color: '#64748b' },
            { id: 'quoted',      label: 'Quoted',         count: mergedByStatus['quoted']?.length || 0,      color: '#7c3aed' },
            { id: 'approved',          label: 'Need Schedule',    count: mergedByStatus['approved']?.length || 0,          color: '#92400e' },
            { id: 'deposit_received',   label: 'Deposit Received', count: mergedByStatus['deposit_received']?.length || 0,   color: '#b45309' },
            { id: 'materials_ordered',  label: 'Materials Ordered', count: mergedByStatus['materials_ordered']?.length || 0,  color: '#9a3412' },
            { id: 'materials_received', label: 'Materials In',      count: mergedByStatus['materials_received']?.length || 0, color: '#166534' },
            { id: 'ready_to_schedule',  label: 'Ready to Schedule', count: mergedByStatus['ready_to_schedule']?.length || 0,  color: '#0369a1' },
            { id: 'scheduled',          label: 'Scheduled',         count: mergedByStatus['scheduled']?.length || 0,          color: '#4338ca' },
            { id: 'in_progress', label: 'In Progress',    count: mergedByStatus['in_progress']?.length || 0, color: '#0f766e' },
            { id: 'closed',      label: 'Completed',      count: mergedByStatus['closed']?.length || 0,      color: '#15803d' },
          ] as FilterChip[]}
          activeChip={filter}
          onChipChange={setFilter}
          sortOptions={[
            { id: 'date_desc', label: 'Date (Newest)' },
            { id: 'date_asc',  label: 'Date (Oldest)' },
            { id: 'name',      label: 'Name A→Z' },
            { id: 'status',    label: 'Status' },
          ] as SortOption[]}
          sortValue={sort}
          onSortChange={setSort}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search WOs by name, customer, island..."
          resultCount={sortedWOs.length}
        />
      )}

      {!loading && data && view === 'kanban' && !completedStatuses.has(filter) && (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'start', paddingBottom: 12, minHeight: 200 }}>
          {STAGES.filter(s => s.key !== 'lost').map(stage => {
            const isCompletedStage = completedStatuses.has(stage.key);
            // Completed stages always render in the separate section below, not in the main scroll
            if (isCompletedStage) return null;
            const wos = filteredByStatus[stage.key] || [];
            // When filtering, hide empty columns
            if (filter !== 'all' && wos.length === 0) return null;
            return (
              <div key={stage.key} style={{ minWidth: 240, flex: filter === 'all' ? '0 0 240px' : '1 1 auto', opacity: isCompletedStage ? 0.75 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{stage.label}</div>
                  <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{wos.length}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {wos.length === 0 ? (
                    <div style={{ padding: '20px 16px', borderRadius: 16, background: 'rgba(248,250,252,0.5)', border: '1px dashed rgba(226,232,240,0.8)', textAlign: 'center', fontSize: 12, color: '#cbd5e1' }}>
                      {search ? 'No matches' : 'No work orders'}
                    </div>
                  ) : wos.map(wo => (
                    <WOCard key={wo.id || wo.name} wo={wo}
                      onDetail={(w) => setDetailWO(w)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed WOs — separate row below active board when showCompleted is on */}
      {!loading && data && view === 'kanban' && (showCompleted || completedStatuses.has(filter) || (search && filteredByStatus['closed']?.length > 0)) && (() => {
        const completedWOs = [...(filteredByStatus['work_complete'] || []), ...(filteredByStatus['closed'] || [])];
        if (completedWOs.length === 0) return null;
        return (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '2px solid #f1f5f9' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>Completed Work Orders ({completedWOs.length})</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {completedWOs.map(wo => (
                <div key={wo.id} style={{ width: 240, opacity: 0.75 }}>
                  <WOCard wo={wo}
                    onDetail={(w) => setDetailWO(w)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Declined WOs — separate row below board when showDeclined is on */}
      {!loading && data && view === 'kanban' && (showDeclined || filter === 'lost' || (search && filteredByStatus['lost']?.length > 0)) && (() => {
        const declinedWOs = filteredByStatus['lost'] || [];
        if (declinedWOs.length === 0) return null;
        return (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '2px solid #fef2f2' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f87171', marginBottom: 10 }}>Declined Work Orders ({declinedWOs.length})</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {declinedWOs.map(wo => (
                <div key={wo.id} style={{ width: 240, opacity: 0.7 }}>
                  <WOCard wo={wo}
                    onDetail={(w) => setDetailWO(w)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* LIST */}
      {!loading && data && view === 'list' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(wo => (
              <WOCard key={wo.id || wo.name} wo={wo}
                onDetail={(w) => setDetailWO(w)}
              />
            ))}
            {filtered.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>{search ? `No results for "${search}"` : 'No work orders in this view'}</div>}
          </div>
        </>
      )}

      {/* Quote Builder modal */}
      {quoteWO && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 28, width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(15,23,42,0.15)' }}>
            <QuoteBuilder woNumber={quoteWO} onClose={() => {
              // "Back to Estimate" — reopen estimate form if WO exists
              const woObj = mergedWorkOrders.find(w => w.id === quoteWO);
              setQuoteWO(null);
              setQuoteEstimateData(undefined);
              if (woObj) setEstimateWO(woObj);
            }} estimatePreFill={quoteEstimateData} />
          </div>
        </div>
      )}

      {/* WO Estimate (Simple Estimate) modal */}
      {estimateWO && (
        <WOEstimatePanel
          wo={estimateWO}
          procurementOrders={estimateProcurementOrders}
          onClose={() => { setEstimateWO(null); setEstimateProcurementOrders([]); }}
          onGenerateQuote={(woId: string, totals: EstimateTotals) => {
            setEstimateWO(null);
            setEstimateProcurementOrders([]);
            setQuoteEstimateData(totals);
            setQuoteWO(woId);
          }}
        />
      )}

      {/* Full detail panel */}
      {detailWO && (
        <WODetailPanel
          wo={detailWO}
          allCrew={allCrew}
          readOnly={readOnly}
          onClose={() => setDetailWO(null)}
          onSave={async (id, fields) => { await handleSave(id, fields); setDetailWO(prev => prev ? { ...prev, ...fields, assignedTo: fields.assignedTo ?? prev.assignedTo } : null); }}
          onStageChange={async (id, stage, reason) => { await handleStageChange(id, stage, reason); setDetailWO(prev => prev ? { ...prev, status: stage } : null); }}
          onQuote={(id) => { setQuoteWO(id); setDetailWO(null); }}
          onEstimate={(wo) => {
            setEstimateWO(wo);
            setDetailWO(null);
            // Fetch procurement orders for the vendor quote banner in estimate
            fetch(`/api/procurement?wo_id=${encodeURIComponent(wo.id)}`)
              .then(r => r.json())
              .then(d => setEstimateProcurementOrders(Array.isArray(d) ? d : (d.orders || [])))
              .catch(() => setEstimateProcurementOrders([]));
          }}
        />
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
