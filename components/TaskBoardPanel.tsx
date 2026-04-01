'use client';
import { useState } from 'react';

type TaskStatus = 'queued' | 'in_progress' | 'waiting' | 'done';
type TaskPriority = 'high' | 'medium' | 'low';

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
};

const INITIAL_TASKS: Task[] = [
  { id: 'TSK-001', title: 'Gold Dataset — historical backfill', detail: 'Read through 2015–2023 estimating folders. Extract bid amounts, system types, win/loss. Cross-reference with Smartsheet actuals for completed jobs.', status: 'queued', priority: 'high', category: 'Data', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-03-31' },
  { id: 'TSK-002', title: 'Photo upload — wire Drive integration', detail: 'Build /api/upload route. Upload photos directly to project AI shadow folder on submit. Store Drive file ID in Google Sheet event row.', status: 'queued', priority: 'high', category: 'Field App', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-03-31' },
  { id: 'TSK-003', title: 'QuickBooks OAuth — complete connection', detail: 'Jenny has QB admin access. Complete OAuth flow. Wire /api/qbo/connect. Pull P&L by job, job costing, invoice history.', status: 'waiting', priority: 'high', category: 'Finance', assignedTo: 'Kai + Jenny', createdAt: '2026-03-31', updatedAt: '2026-03-31' },
  { id: 'TSK-004', title: 'Google OAuth — replace user picker', detail: 'Add NextAuth with Google provider. Restrict to @kulaglass.com. Auto-identify user on login. Remove manual who-are-you step.', status: 'queued', priority: 'high', category: 'Field App', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-03-31' },
  { id: 'TSK-005', title: 'Daily report PDF — auto-assembly', detail: 'Generate PDF on submit. Auto-attach QA steps completed that day. Email to assigned PM. Store in Drive 05 - Field Reports & QA / Daily Reports.', status: 'queued', priority: 'high', category: 'Field App', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-03-31' },
  { id: 'TSK-006', title: '3:30 PM daily report reminder', detail: 'Cron job checks Field_Events_V1 for missing daily reports. Emails field lead if not submitted by 3:30 PM HST.', status: 'queued', priority: 'medium', category: 'Automation', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-03-31' },
  { id: 'TSK-007', title: 'Wire live Google Sheets data into Mission Control', detail: 'Replace mock project/crew/event data with live API calls to Google Sheets backend. Projects, events, issues all pull from real data.', status: 'queued', priority: 'medium', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-03-31' },
  { id: 'TSK-008', title: 'Move island folders out of AI Command Center', detail: 'Kauai/Maui/Oahu project folders accidentally created in AI Command Center archive. Move them or confirm they are only in BanyanOS shared drive.', status: 'waiting', priority: 'medium', category: 'Drive', assignedTo: 'Kai + Sean', createdAt: '2026-03-31', updatedAt: '2026-03-31' },
  { id: 'TSK-009', title: 'Mission Control UI — full polish pass', detail: 'Apply BanyanOS brand assets. Tighten typography, spacing, card design. Match premium feel of field app. Add favicon.', status: 'in_progress', priority: 'medium', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-03-31' },
  { id: 'TSK-010', title: 'Superintendent QA setup workflow', detail: 'Build superintendent pre-job setup in Mission Control. Define areas, elevations, window marks, critical steps, photo requirements per step. Pushes to field app.', status: 'queued', priority: 'medium', category: 'Project Management', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-03-31' },
  { id: 'TSK-011', title: 'Whitepaper — service module notes', detail: 'Sean to send service side notes. Kai to update whitepaper with service module architecture, T&M flow, dispatch, billing.', status: 'waiting', priority: 'low', category: 'Documentation', assignedTo: 'Sean → Kai', createdAt: '2026-03-31', updatedAt: '2026-03-31' },
  { id: 'TSK-012', title: 'Mission Control sidebar — restructure to 5 trunks', detail: 'Reorganize sidebar into: Estimating, Project Management, Field, Service, Closeout. All navigation flows from the five core modules.', status: 'queued', priority: 'low', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-03-31' },
];

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; dot: string }> = {
  queued:      { label: 'Queued',      color: '#64748b', bg: 'rgba(100,116,139,0.1)', dot: '#94a3b8' },
  in_progress: { label: 'In Progress', color: '#0f766e', bg: 'rgba(15,118,110,0.12)', dot: '#14b8a6' },
  waiting:     { label: 'Waiting',     color: '#b45309', bg: 'rgba(180,83,9,0.12)',   dot: '#f59e0b' },
  done:        { label: 'Done',        color: '#1d4ed8', bg: 'rgba(29,78,216,0.1)',   dot: '#60a5fa' },
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high:   'rgba(220,38,38,0.15)',
  medium: 'rgba(146,64,14,0.15)',
  low:    'rgba(100,116,139,0.1)',
};

const PRIORITY_TEXT: Record<TaskPriority, string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#94a3b8',
};

export default function TaskBoardPanel() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  const [showNew, setShowNew] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', detail: '', priority: 'medium' as TaskPriority, category: '', assignedTo: 'Kai' });

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

  const counts = {
    all: tasks.length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    queued: tasks.filter(t => t.status === 'queued').length,
    waiting: tasks.filter(t => t.status === 'waiting').length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  function updateStatus(id: string, status: TaskStatus) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status, updatedAt: new Date().toISOString().split('T')[0] } : t));
  }

  function addTask() {
    if (!newTask.title) return;
    const id = `TSK-${String(tasks.length + 1).padStart(3, '0')}`;
    setTasks(prev => [{
      id, title: newTask.title, detail: newTask.detail,
      status: 'queued', priority: newTask.priority,
      category: newTask.category || 'General',
      assignedTo: newTask.assignedTo,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
    }, ...prev]);
    setNewTask({ title: '', detail: '', priority: 'medium', category: '', assignedTo: 'Kai' });
    setShowNew(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'white', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: '10px 14px', fontSize: 13,
    color: '#0f172a', outline: 'none',
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="label-upper text-ink-meta mb-1">AI Command</div>
          <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Task Board</h1>
          <p className="text-ink-label text-sm mt-1">What Kai is working on</p>
        </div>
        <button onClick={() => setShowNew(v => !v)}
          className="px-4 py-2 rounded-xl text-[13px] font-bold border transition-colors"
          style={{ background: 'rgba(15,118,110,0.08)', borderColor: 'rgba(15,118,110,0.2)', color: '#0f766e' }}>
          + New Task
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 flex-wrap mb-6">
        {(['all', 'in_progress', 'queued', 'waiting', 'done'] as const).map(s => {
          const cfg = s === 'all' ? null : STATUS_CONFIG[s];
          const active = filter === s;
          const count = counts[s];
          return (
            <button key={s} onClick={() => setFilter(s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-[12px] font-bold transition-all border"
              style={{
                background: active ? (cfg?.bg || 'rgba(15,118,110,0.1)') : 'white',
                borderColor: active ? (cfg?.dot || '#14b8a6') + '66' : '#e2e8f0',
                color: active ? (cfg?.color || '#0f766e') : '#64748b',
              }}>
              {cfg && <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />}
              {s === 'all' ? 'All' : cfg!.label} · {count}
            </button>
          );
        })}
      </div>

      {/* New task form */}
      {showNew && (
        <div className="card p-5 mb-5">
          <div className="label-upper text-ink-meta mb-3">New Task</div>
          <div className="flex flex-col gap-3">
            <input style={inputStyle} placeholder="Task title" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} />
            <textarea style={{ ...inputStyle, resize: 'none' }} rows={2} placeholder="Details / instructions for Kai" value={newTask.detail} onChange={e => setNewTask(p => ({ ...p, detail: e.target.value }))} />
            <div className="grid grid-cols-3 gap-2">
              <select style={inputStyle} value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value as TaskPriority }))}>
                <option value="high">High priority</option>
                <option value="medium">Medium priority</option>
                <option value="low">Low priority</option>
              </select>
              <input style={inputStyle} placeholder="Category" value={newTask.category} onChange={e => setNewTask(p => ({ ...p, category: e.target.value }))} />
              <input style={inputStyle} placeholder="Assigned to" value={newTask.assignedTo} onChange={e => setNewTask(p => ({ ...p, assignedTo: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-xl text-[12px] font-bold text-ink-label border border-surface-border">Cancel</button>
              <button onClick={addTask} className="px-4 py-2 rounded-xl text-[12px] font-bold" style={{ background: 'rgba(15,118,110,0.1)', color: '#0f766e', border: '1px solid rgba(15,118,110,0.2)' }}>Add Task</button>
            </div>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="flex flex-col gap-3">
        {filtered.map(task => {
          const cfg = STATUS_CONFIG[task.status];
          return (
            <div key={task.id} className="card p-5">
              <div className="flex items-start gap-4">
                <div className="flex flex-col gap-1.5 shrink-0 pt-0.5 w-28">
                  <span className="pill" style={{ background: cfg.bg, color: cfg.color, fontSize: 10 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, marginRight: 4, display: 'inline-block', flexShrink: 0 }} />
                    {cfg.label}
                  </span>
                  <span className="pill" style={{ background: PRIORITY_COLOR[task.priority], color: PRIORITY_TEXT[task.priority], fontSize: 10 }}>
                    {task.priority}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-mono text-ink-meta">{task.id}</span>
                    <span className="pill" style={{ background: 'rgba(100,116,139,0.08)', color: '#64748b', fontSize: 9, padding: '1px 7px' }}>{task.category}</span>
                  </div>
                  <div className="text-[15px] font-bold text-ink-heading mb-1">{task.title}</div>
                  <p className="text-[13px] text-ink-body leading-snug m-0">{task.detail}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[11px] text-ink-meta">→ <strong className="text-ink-secondary">{task.assignedTo}</strong></span>
                    <span className="text-[11px] text-ink-meta">Updated {task.updatedAt}</span>
                  </div>
                </div>

                {/* Status controls */}
                <div className="shrink-0 flex flex-col gap-1.5">
                  {task.status !== 'in_progress' && (
                    <button onClick={() => updateStatus(task.id, 'in_progress')}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
                      style={{ background: 'rgba(15,118,110,0.08)', color: '#0f766e', border: '1px solid rgba(15,118,110,0.15)' }}>
                      Start
                    </button>
                  )}
                  {task.status !== 'done' && (
                    <button onClick={() => updateStatus(task.id, 'done')}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
                      style={{ background: 'rgba(29,78,216,0.08)', color: '#1d4ed8', border: '1px solid rgba(29,78,216,0.15)' }}>
                      Done
                    </button>
                  )}
                  {task.status === 'done' && (
                    <button onClick={() => updateStatus(task.id, 'queued')}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
                      style={{ background: 'rgba(100,116,139,0.08)', color: '#64748b', border: '1px solid rgba(100,116,139,0.15)' }}>
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
