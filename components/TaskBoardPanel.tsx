'use client';
import { useState, useEffect, useCallback } from 'react';

type TaskStatus = 'queued' | 'in_progress' | 'waiting' | 'done' | 'blocked';
type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

type Task = {
  id: string;
  title: string;
  detail: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  blockedBy?: string;
  parentTaskId?: string;
  phase?: string;
  source?: string;
};

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  queued:      { color: '#64748b', bg: '#f1f5f9', label: 'Queued' },
  in_progress: { color: '#0f766e', bg: '#f0fdfa', label: 'In Progress' },
  waiting:     { color: '#d97706', bg: '#fffbeb', label: 'Waiting' },
  blocked:     { color: '#b91c1c', bg: '#fef2f2', label: 'Blocked' },
  done:        { color: '#15803d', bg: '#f0fdf4', label: 'Done' },
};
const PRIORITY_COLORS: Record<string, { color: string; bg: string }> = {
  critical: { color: '#7f1d1d', bg: '#fef2f2' },
  high:     { color: '#b91c1c', bg: '#fef2f2' },
  medium:   { color: '#92400e', bg: '#fffbeb' },
  low:      { color: '#64748b', bg: '#f1f5f9' },
};
const SOURCE_ICONS: Record<string, string> = {
  BUG: '🐛', FEATURE: '💡', QUESTION: '❓', FEEDBACK: '💬',
};

const PHASE_ORDER = ['Phase 0', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6', 'Inbox'];

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Task Card ──────────────────────────────────────────────────────────────
function TaskCard({ task, onUpdate, inboxMode = false, archiveMode = false }: {
  task: Task;
  onUpdate: (id: string, fields: Partial<Task>) => Promise<void>;
  inboxMode?: boolean;
  archiveMode?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [responding, setResponding] = useState(false);
  const [response, setResponse] = useState('');
  const [promotingPhase, setPromotingPhase] = useState('');
  const [showPhase, setShowPhase] = useState(false);
  const [saving, setSaving] = useState(false);

  const sc = STATUS_COLORS[task.status] || STATUS_COLORS.queued;
  const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  const feedbackType = task.title.match(/^\[(\w+)\]/)?.[1] || '';
  const feedbackIcon = SOURCE_ICONS[feedbackType] || '💬';

  const cardBg = archiveMode ? '#f8fafc' : inboxMode ? 'rgba(254,243,199,0.4)' : 'white';
  const cardOpacity = archiveMode ? 0.75 : 1;

  async function save(fields: Partial<Task>) {
    setSaving(true);
    await onUpdate(task.id, fields).catch(e => console.error('[TaskCard save]', e));
    setSaving(false);
  }

  return (
    <div style={{ background: cardBg, borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 14px', opacity: cardOpacity }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        {inboxMode && <span style={{ fontSize: 18, flexShrink: 0 }}>{feedbackIcon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: sc.bg, color: sc.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sc.label}</span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: pc.bg, color: pc.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{task.priority}</span>
            {task.category && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: '#f1f5f9', color: '#64748b' }}>{task.category}</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: archiveMode ? '#64748b' : '#0f172a', lineHeight: 1.3 }}>{task.title}</div>
        </div>
        {!archiveMode && !inboxMode && (
          <select value={task.status} onChange={e => save({ status: e.target.value as TaskStatus })} disabled={saving}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', flexShrink: 0, color: '#334155' }}>
            {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        )}
      </div>

      {/* Detail */}
      {task.detail && (
        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, marginBottom: 6,
          display: expanded ? 'block' : '-webkit-box', WebkitLineClamp: expanded ? undefined : 2,
          WebkitBoxOrient: 'vertical', overflow: expanded ? 'visible' : 'hidden',
        } as React.CSSProperties}>
          {task.detail}
        </div>
      )}

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8', flexWrap: 'wrap', marginBottom: 4 }}>
        {task.assignedTo && <span>→ {task.assignedTo}</span>}
        {task.dueDate && <span>📅 {task.dueDate}</span>}
        {task.updatedAt && <span>{relativeTime(task.updatedAt)}</span>}
        {task.phase && <span style={{ color: '#0891b2', fontWeight: 600 }}>{task.phase}</span>}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        {task.detail && task.detail.length > 100 && (
          <button onClick={() => setExpanded(e => !e)} style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}

        {inboxMode && !archiveMode && (<>
          <button onClick={() => setShowPhase(p => !p)} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(15,118,110,0.3)', background: '#f0fdfa', color: '#0f766e', cursor: 'pointer' }}>
            ✅ Promote to Roadmap
          </button>
          {showPhase && (
            <select value={promotingPhase} onChange={e => setPromotingPhase(e.target.value)}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>
              <option value="">Pick phase…</option>
              {PHASE_ORDER.filter(p => p !== 'Inbox').map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {showPhase && promotingPhase && (
            <button onClick={() => save({ source: 'manual', phase: promotingPhase })} disabled={saving}
              style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, border: 'none', background: '#0f766e', color: 'white', cursor: 'pointer' }}>
              Move
            </button>
          )}
          <button onClick={() => save({ status: 'done', detail: task.detail + '\n\n— Dismissed by Sean' })}
            style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer' }}>
            🗑️ Dismiss
          </button>
          <button onClick={() => setResponding(r => !r)}
            style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#334155', cursor: 'pointer' }}>
            📝 Respond
          </button>
        </>)}
      </div>

      {/* Respond inline */}
      {responding && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <input value={response} onChange={e => setResponse(e.target.value)} placeholder="Your response…"
            style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none' }} />
          <button onClick={async () => {
            if (!response.trim()) return;
            await save({ detail: task.detail + `\n\n--- Sean's response: ${response}` });
            setResponding(false); setResponse('');
          }} style={{ padding: '6px 12px', borderRadius: 8, background: '#0f766e', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function TaskBoardPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'roadmap' | 'inbox' | 'archive'>('roadmap');
  const [filterPill, setFilterPill] = useState('all');
  const [archiveFilter, setArchiveFilter] = useState('all');
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [newPhase, setNewPhase] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newCategory, setNewCategory] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.tasks) setTasks(data.tasks);
    } catch (e) { console.error('[TaskBoard] fetch error:', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => {
    const interval = setInterval(fetchTasks, 60000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  async function handleUpdate(id: string, fields: Partial<Task>) {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t));
    await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: id, ...fields }) })
      .catch(e => console.error('[TaskBoard] patch error:', e));
  }

  async function createTask() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const now = new Date().toISOString();
    const id = `TSK-${Date.now()}`;
    const task: Task = { id, title: newTitle, detail: newDetail, status: 'queued', priority: newPriority as TaskPriority, category: newCategory, assignedTo: 'Sean', createdAt: now, updatedAt: now, phase: newPhase, source: 'manual' };
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks: [task] }) })
      .catch(e => console.error('[createTask]', e));
    setTasks(prev => [...prev, task]);
    setNewTitle(''); setNewDetail(''); setNewPhase(''); setNewCategory(''); setNewPriority('medium');
    setShowNewTask(false); setCreating(false);
  }

  // Derived counts
  const roadmapTasks = tasks.filter(t => t.source !== 'feedback' && t.status !== 'done');
  const inboxTasks = tasks.filter(t => (t.source === 'feedback' || t.source === 'suggestion') && t.status !== 'done');
  const archiveTasks = tasks.filter(t => t.status === 'done');

  // Filter roadmap
  const filteredRoadmap = roadmapTasks.filter(t => {
    if (filterPill === 'critical') return t.priority === 'critical' || t.priority === 'high';
    if (filterPill === 'in_progress') return t.status === 'in_progress';
    if (filterPill === 'waiting') return t.status === 'waiting' || t.status === 'blocked';
    return true;
  });

  // Group roadmap by phase
  const phaseGroups = new Map<string, Task[]>();
  for (const t of filteredRoadmap) {
    const ph = t.phase || 'Unassigned';
    if (!phaseGroups.has(ph)) phaseGroups.set(ph, []);
    phaseGroups.get(ph)!.push(t);
  }
  const sortedPhases = [...phaseGroups.keys()].sort((a, b) => {
    const ai = PHASE_ORDER.indexOf(a); const bi = PHASE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1; if (bi === -1) return -1;
    return ai - bi;
  });

  // Phase progress (all roadmap tasks, not just filtered)
  function phaseProgress(ph: string) {
    const all = tasks.filter(t => (t.phase || 'Unassigned') === ph && t.source !== 'feedback');
    const done = all.filter(t => t.status === 'done').length;
    return { total: all.length, done };
  }

  // Archive filter
  const filteredArchive = archiveTasks.filter(t => {
    if (archiveFilter === 'roadmap') return t.source !== 'feedback';
    if (archiveFilter === 'feedback') return t.source === 'feedback';
    return true;
  });

  const TABS = [
    { key: 'roadmap', label: 'Roadmap', count: roadmapTasks.length },
    { key: 'inbox', label: 'Kai Inbox', count: inboxTasks.length },
    { key: 'archive', label: 'Completed', count: archiveTasks.length },
  ] as const;

  const INP: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: 'white' };

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4 }}>AI Command</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em', marginBottom: 6 }}>Command Center</div>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          {roadmapTasks.length} open · {inboxTasks.length} inbox · {archiveTasks.length} done
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => setShowNewTask(p => !p)} style={{ padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ New Task</button>
          <button onClick={fetchTasks} style={{ padding: '8px 14px', borderRadius: 10, background: 'white', border: '1px solid #e2e8f0', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>↻ Refresh</button>
        </div>
      </div>

      {/* New Task Form */}
      {showNewTask && (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input style={INP} placeholder="Task title *" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
          <textarea style={{ ...INP, resize: 'none' }} rows={2} placeholder="Detail (optional)" value={newDetail} onChange={e => setNewDetail(e.target.value)} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <select style={INP} value={newPhase} onChange={e => setNewPhase(e.target.value)}>
              <option value="">Phase…</option>
              {PHASE_ORDER.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select style={INP} value={newPriority} onChange={e => setNewPriority(e.target.value)}>
              {['critical','high','medium','low'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input style={INP} placeholder="Category" value={newCategory} onChange={e => setNewCategory(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowNewTask(false)} style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button onClick={createTask} disabled={!newTitle.trim() || creating} style={{ flex: 2, padding: '9px', borderRadius: 10, border: 'none', background: '#0f766e', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{creating ? 'Creating…' : 'Create Task'}</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#f1f5f9', borderRadius: 12, padding: 4 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '8px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
            background: tab === t.key ? '#0f766e' : 'transparent',
            color: tab === t.key ? 'white' : '#64748b',
          }}>
            {t.label}
            {t.count > 0 && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: tab === t.key ? 'rgba(255,255,255,0.25)' : '#e2e8f0', fontSize: 10 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>Loading…</div>}

      {/* ROADMAP TAB */}
      {!loading && tab === 'roadmap' && (
        <>
          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {[['all', `All Active · ${roadmapTasks.length}`], ['critical', `Critical/High · ${roadmapTasks.filter(t=>t.priority==='critical'||t.priority==='high').length}`], ['in_progress', `In Progress · ${roadmapTasks.filter(t=>t.status==='in_progress').length}`], ['waiting', `Waiting · ${roadmapTasks.filter(t=>t.status==='waiting'||t.status==='blocked').length}`]].map(([k, label]) => (
              <button key={k} onClick={() => setFilterPill(k)} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: filterPill === k ? '1.5px solid #0f766e' : '1px solid #e2e8f0', background: filterPill === k ? '#f0fdfa' : 'white', color: filterPill === k ? '#0f766e' : '#64748b' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Phase groups */}
          {sortedPhases.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>No tasks match this filter.</div>}
          {sortedPhases.map(ph => {
            const phaseTasks = phaseGroups.get(ph) || [];
            const { total, done } = phaseProgress(ph);
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const isCollapsed = collapsedPhases.has(ph);
            return (
              <div key={ph} style={{ marginBottom: 20 }}>
                <button onClick={() => setCollapsedPhases(prev => { const n = new Set(prev); n.has(ph) ? n.delete(ph) : n.add(ph); return n; })}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', textAlign: 'left' }}>
                  <span style={{ fontSize: 13, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{isCollapsed ? '▶' : '▼'} {ph}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{done}/{total} done</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{phaseTasks.length} showing</span>
                </button>
                {/* Progress bar */}
                <div style={{ height: 3, background: '#f1f5f9', borderRadius: 999, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#15803d' : '#14b8a6', borderRadius: 999, transition: 'width 0.3s' }} />
                </div>
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {phaseTasks.map(t => <TaskCard key={t.id} task={t} onUpdate={handleUpdate} />)}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* INBOX TAB */}
      {!loading && tab === 'inbox' && (
        <>
          {inboxTasks.length === 0
            ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: '60px 0', fontSize: 14 }}>No new feedback — everything&apos;s been triaged.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[...inboxTasks].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map(t => (
                  <TaskCard key={t.id} task={t} onUpdate={handleUpdate} inboxMode />
                ))}
              </div>
          }
        </>
      )}

      {/* ARCHIVE TAB */}
      {!loading && tab === 'archive' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {[['all', `All Completed · ${archiveTasks.length}`], ['roadmap', `Roadmap · ${archiveTasks.filter(t=>t.source!=='feedback').length}`], ['feedback', `Feedback · ${archiveTasks.filter(t=>t.source==='feedback').length}`]].map(([k, label]) => (
              <button key={k} onClick={() => setArchiveFilter(k)} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: archiveFilter === k ? '1.5px solid #0f766e' : '1px solid #e2e8f0', background: archiveFilter === k ? '#f0fdfa' : 'white', color: archiveFilter === k ? '#0f766e' : '#64748b' }}>
                {label}
              </button>
            ))}
          </div>
          {filteredArchive.length === 0
            ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>No completed tasks yet.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...filteredArchive].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map(t => (
                  <TaskCard key={t.id} task={t} onUpdate={handleUpdate} archiveMode />
                ))}
              </div>
          }
        </>
      )}
    </div>
  );
}
