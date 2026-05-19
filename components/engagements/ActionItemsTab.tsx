'use client';
/**
 * BAN-344 PM-V1.0-E — Action Items surface.
 *
 * Reads /api/action-items/by-kid/[kid]; rows expose status, priority,
 * source-entity linkage, and inline complete/defer/cancel actions.  PMs
 * add new manual action items via the inline form.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

type ActionItemRow = {
  action_item_id: string;
  engagement_id: string | null;
  source_event_type: string;
  source_entity_type: string;
  source_entity_id: string;
  title: string;
  description: string | null;
  action_required: string | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  auto_closed_reason: string | null;
  created_at: string;
  completed_at: string | null;
  notes: string | null;
};

type ApiResponse = {
  kIDFound: boolean;
  engagement: { engagement_id: string; kid: string; is_test_project: boolean } | null;
  items: ActionItemRow[];
  summary: {
    total: number;
    open_count: number;
    overdue_count: number;
    by_status: Record<string, number>;
    by_source: Record<string, number>;
  };
};

const SOURCE_LABELS: Record<string, string> = {
  SUBMITTAL: 'Submittal',
  RFI: 'RFI',
  VERBAL_AGREEMENT: 'Verbal Agreement',
  MEETING: 'Meeting',
  PAY_APP: 'Pay App',
  TM_TICKET: 'T&M Ticket',
  CHANGE_ORDER: 'Change Order',
  PUNCH_LIST_ITEM: 'Punch List',
  EXTERNAL_WAIVER: 'External Waiver',
  GC_REQUIRED_DOC: 'GC Req. Doc',
  WARRANTY_CLAIM: 'Warranty',
  MANUAL: 'Manual',
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  OPEN:        { bg: '#eff6ff', fg: '#1d4ed8' },
  IN_PROGRESS: { bg: '#fef3c7', fg: '#92400e' },
  COMPLETED:   { bg: '#f0fdf4', fg: '#15803d' },
  DEFERRED:    { bg: '#f1f5f9', fg: '#475569' },
  CANCELLED:   { bg: '#f1f5f9', fg: '#64748b' },
  AUTO_CLOSED: { bg: '#f5f3ff', fg: '#6d28d9' },
};

const PRIORITY_COLORS: Record<string, { bg: string; fg: string }> = {
  URGENT: { bg: '#fee2e2', fg: '#b91c1c' },
  HIGH:   { bg: '#ffedd5', fg: '#c2410c' },
  MEDIUM: { bg: '#fef9c3', fg: '#854d0e' },
  LOW:    { bg: '#f1f5f9', fg: '#475569' },
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(it: ActionItemRow): boolean {
  if (!it.due_date) return false;
  if (it.status !== 'OPEN' && it.status !== 'IN_PROGRESS') return false;
  const today = new Date().toISOString().slice(0, 10);
  return it.due_date < today;
}

export default function ActionItemsTab({ kID }: { kID: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN_ACTIONABLE' | string>('OPEN_ACTIONABLE');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('MEDIUM');
  const [newDueDate, setNewDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/action-items/by-kid/${encodeURIComponent(kID)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      setData(await r.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kID]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const items = data?.items ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter === 'OPEN_ACTIONABLE') {
        if (it.status !== 'OPEN' && it.status !== 'IN_PROGRESS') return false;
      } else if (statusFilter !== 'ALL') {
        if (it.status !== statusFilter) return false;
      }
      if (priorityFilter !== 'ALL' && it.priority !== priorityFilter) return false;
      if (sourceFilter !== 'ALL' && it.source_entity_type !== sourceFilter) return false;
      if (overdueOnly && !isOverdue(it)) return false;
      if (q) {
        const hay = `${it.title} ${it.description ?? ''} ${it.action_required ?? ''} ${it.notes ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, priorityFilter, sourceFilter, overdueOnly]);

  const handleAction = useCallback(async (id: string, action: 'complete' | 'defer' | 'cancel', extra: Record<string, unknown> = {}) => {
    const body = action === 'complete' ? extra
      : action === 'defer' ? { reason: (extra.reason as string) ?? 'Deferred', ...extra }
      : { reason: (extra.reason as string) ?? 'Cancelled', ...extra };
    const r = await fetch(`/api/action-items/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error || `Failed to ${action}: HTTP ${r.status}`);
      return;
    }
    await fetchList();
  }, [fetchList]);

  const handleAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/action-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          priority: newPriority,
          source_entity_type: 'MANUAL',
          engagement_kid: kID,
          due_date: newDueDate || null,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error || `Create failed: HTTP ${r.status}`);
        return;
      }
      setNewTitle('');
      setNewDueDate('');
      setNewPriority('MEDIUM');
      setShowAdd(false);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  }, [newTitle, newPriority, newDueDate, kID, fetchList]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading action items...</div>;
  }
  if (err) {
    return <div style={{ padding: 24, color: '#b91c1c', background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>Failed to load action items: {err}</div>;
  }
  if (!data?.kIDFound) {
    return <div style={{ padding: 24, color: '#64748b', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>Action Items requires this project to be migrated to Postgres.</div>;
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          ['Total', data.summary.total],
          ['Open', data.summary.open_count],
          ['Overdue', data.summary.overdue_count],
          ['Auto-closed', data.summary.by_status.AUTO_CLOSED ?? 0],
        ].map(([label, value]) => (
          <div key={label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: label === 'Overdue' && Number(value) > 0 ? '#b91c1c' : '#0f172a', marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, description..." style={inputStyle} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="OPEN_ACTIONABLE">Open + In Progress</option>
          <option value="ALL">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="DEFERRED">Deferred</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="AUTO_CLOSED">Auto-closed</option>
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All priorities</option>
          {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All sources</option>
          {Object.entries(SOURCE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <label style={toggleStyle}><input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue only</label>
        <button type="button" onClick={() => setShowAdd((s) => !s)} style={{ marginLeft: 'auto', padding: '8px 12px', borderRadius: 10, border: 'none', background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>+ Add Action Item</button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 120px 160px auto', gap: 8 }}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="What needs to happen?" style={inputStyle} required maxLength={300} />
          <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} style={selectStyle}>
            {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} style={inputStyle} />
          <button type="submit" disabled={submitting || !newTitle.trim()} style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', background: 'white', border: '1px solid #e2e8f0', borderRadius: 12 }}>
            No action items match the current filters.
          </div>
        ) : filtered.map((it) => {
          const status = STATUS_COLORS[it.status] ?? STATUS_COLORS.OPEN;
          const priority = PRIORITY_COLORS[it.priority] ?? PRIORITY_COLORS.MEDIUM;
          const overdue = isOverdue(it);
          const actionable = it.status === 'OPEN' || it.status === 'IN_PROGRESS';
          return (
            <div key={it.action_item_id} style={{ background: 'white', border: overdue ? '1px solid #fca5a5' : '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) 120px 110px 130px 200px', gap: 10, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.action_required ?? '—'} · {SOURCE_LABELS[it.source_entity_type] ?? it.source_entity_type}
                  </div>
                </div>
                <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, color: priority.fg, background: priority.bg, justifySelf: 'start' }}>{it.priority}</span>
                <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, color: status.fg, background: status.bg, justifySelf: 'start' }}>{it.status.replace(/_/g, ' ')}</span>
                <div style={{ fontSize: 11, fontWeight: 700, color: overdue ? '#b91c1c' : '#334155' }}>
                  {it.due_date ? `Due ${formatDate(it.due_date)}` : 'No due date'}
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                  {actionable && (
                    <>
                      <button type="button" onClick={() => handleAction(it.action_item_id, 'complete')} style={actionBtnStyle('#0f766e')}>Complete</button>
                      <button type="button" onClick={() => {
                        const reason = window.prompt('Defer reason:');
                        if (reason) handleAction(it.action_item_id, 'defer', { reason });
                      }} style={actionBtnStyle('#475569')}>Defer</button>
                      <button type="button" onClick={() => {
                        const reason = window.prompt('Cancel reason:');
                        if (reason) handleAction(it.action_item_id, 'cancel', { reason });
                      }} style={actionBtnStyle('#b91c1c')}>Cancel</button>
                    </>
                  )}
                </div>
              </div>
              {(it.description || it.notes || it.auto_closed_reason) && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                  {it.auto_closed_reason && <div>Auto-closed: {it.auto_closed_reason}</div>}
                  {it.description && <div>{it.description}</div>}
                  {it.notes && <div style={{ fontStyle: 'italic' }}>{it.notes}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, color: '#0f172a', background: 'white',
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };
const toggleStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#475569', cursor: 'pointer',
};
function actionBtnStyle(color: string): React.CSSProperties {
  return {
    padding: '5px 9px', borderRadius: 8, border: `1px solid ${color}33`, background: `${color}10`,
    color, fontSize: 11, fontWeight: 800, cursor: 'pointer',
  };
}
