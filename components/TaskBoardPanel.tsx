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
  // ── COMPLETED ────────────────────────────────────────────────────────────
  { id: 'TSK-001', title: 'BanyanOS Bid Log v1 — create + populate', detail: '300 bids, 426 GC quotes migrated from Smartsheet. kID schema, island detection, bid platform URLs populated.', status: 'done', priority: 'high', category: 'Data', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-04-01' },
  { id: 'TSK-002', title: 'Mission Control — full build + live data', detail: 'All panels built: Today, Inbox (live Gmail), Calendar (live Google Cal), Bid Queue, Estimator Workspace, Crew, Issues, Projects, Overview, Approvals, Workflows, Cost, Task Board. All API routes in Node.js.', status: 'done', priority: 'high', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-04-01' },
  { id: 'TSK-003', title: 'Field app — full light-mode rebuild', detail: '8 capture modes, photo picker, Ask Kai on every page, INSTALLED/WORK STARTED/NOT STARTED QA statuses, ASTM test standards, split Punch/Warranty, mobile responsive.', status: 'done', priority: 'high', category: 'Field App', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-04-01' },
  { id: 'TSK-004', title: 'Gmail + Calendar + Sheets — all connected', detail: 'Domain-wide delegation set. Gmail read access confirmed. Google Calendar live (10 events this week). Sheets read/write working. All credential paths moved to Vercel env vars.', status: 'done', priority: 'high', category: 'Integrations', assignedTo: 'Kai', createdAt: '2026-04-01', updatedAt: '2026-04-01' },
  { id: 'TSK-005', title: 'Estimator Workspace — Hunter card design', detail: 'My Bids view with Hunter full card architecture. Role preview toggle. Status buttons (Won/Lost/No Bid/Submitted). Bid Platform URL links. Island detection. New assignment alerts.', status: 'done', priority: 'high', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-04-01', updatedAt: '2026-04-01' },
  { id: 'TSK-006', title: 'Crew panel — all islands, full names', detail: 'All 35 crew members with full names from org chart. Grouped by island: Oahu (13), Maui (7), Kauai (5). Superintendents separated. Users_Roles sheet updated.', status: 'done', priority: 'medium', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-04-01', updatedAt: '2026-04-01' },
  { id: 'TSK-007', title: 'Whitepaper — full synthesis (810+ lines)', detail: 'V1.0 evolution history, 15 governance decisions, service module spec, estimating module spec (GPT system prompt ingested), PM module spec, 5-trunk architecture locked.', status: 'done', priority: 'medium', category: 'Documentation', assignedTo: 'Kai', createdAt: '2026-04-01', updatedAt: '2026-04-01' },
  { id: 'TSK-008', title: 'BanyanOS Drive — 6 islands, 12 projects', detail: 'All project folders created with 09 standard subfolders + 10 - AI Project Documents [Kai] with 12 AI subfolders. Hawaii, Molokai, Lanai islands added.', status: 'done', priority: 'medium', category: 'Drive', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-04-01' },

  // ── WAITING — BLOCKED ON THIRD PARTY ────────────────────────────────────
  { id: 'TSK-009', title: 'Google OAuth — field app login', detail: 'Code complete, NextAuth wired, credentials in Vercel. Blocked on Google OAuth credential propagation delay (up to 24hrs). Try again tomorrow morning.', status: 'waiting', priority: 'high', category: 'Field App', assignedTo: 'Kai + Google', createdAt: '2026-04-01', updatedAt: '2026-04-01' },
  { id: 'TSK-010', title: 'QuickBooks — production OAuth', detail: 'Production keys set. Intuit app name "BanyanOS" saved. Redirect URI correct. Blocked on Intuit app name propagation. Try connect URL again tomorrow. Jenny to authorize.', status: 'waiting', priority: 'high', category: 'Finance', assignedTo: 'Kai + Jenny', createdAt: '2026-04-01', updatedAt: '2026-04-01' },

  // ── IN PROGRESS ──────────────────────────────────────────────────────────
  { id: 'TSK-011', title: 'Island data enrichment — bid log', detail: 'Island detection from ZIP codes and city names now standard in inbox API. 300 bids populated with island data via keyword matching. Ongoing: verify accuracy, add project address field to intake flow.', status: 'in_progress', priority: 'medium', category: 'Data', assignedTo: 'Kai', createdAt: '2026-04-01', updatedAt: '2026-04-01' },

  // ── QUEUED — READY TO BUILD ──────────────────────────────────────────────
  { id: 'TSK-012', title: 'Service Module — full build', detail: 'Joey Kanban-style board for work orders. Lead → Quote → Approved → Scheduled → In Progress → Invoiced → Closed. T&M capture, drive time tracking, shared manpower with PM. Based on whitepaper section 12.1 + Joey 4 Smartsheet sheets.', status: 'queued', priority: 'high', category: 'Service', assignedTo: 'Kai', createdAt: '2026-04-01', updatedAt: '2026-04-01' },
  { id: 'TSK-013', title: 'Photo upload — wire Drive integration', detail: 'Build /api/upload route. Upload photos from field app directly to project AI shadow folder. Store Drive file ID in Google Sheet event row. Currently photos are selected but not saved.', status: 'queued', priority: 'high', category: 'Field App', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-04-01' },
  { id: 'TSK-014', title: 'Daily report PDF — auto-assembly', detail: 'Generate PDF on submit. Auto-attach QA steps completed that day. Email to assigned PM. Store in Drive 05 - Field Reports & QA / Daily Reports. Triggered at 3:30 PM if not submitted.', status: 'queued', priority: 'high', category: 'Field App', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-04-01' },
  { id: 'TSK-015', title: 'Estimator bid actions — save to Bid Log', detail: 'Status updates in Estimator Workspace (Won/Lost/Submitted) currently only local state. Need to write back to BanyanOS Bid Log Google Sheet. Assign from Bid Queue also needs write-back.', status: 'queued', priority: 'high', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-04-01', updatedAt: '2026-04-01' },
  { id: 'TSK-016', title: 'Superintendent QA setup workflow', detail: 'Mission Control panel for Nate/Karl Sr. to define areas, elevations, window marks, critical QA steps, photo requirements per step before mobilization. Pushes scheduled work to glaziers in field app.', status: 'queued', priority: 'medium', category: 'Project Management', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-04-01' },
  { id: 'TSK-017', title: 'Live Projects/Issues/Events in Mission Control', detail: 'Overview, Event Feed, Issues, Projects panels still showing mock data. Wire to live Google Sheets Field_Events_V1, Core_Entities, and Google Sheets backend.', status: 'queued', priority: 'medium', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-04-01', updatedAt: '2026-04-01' },
  { id: 'TSK-018', title: 'Estimating dashboard — management KPIs', detail: 'Win rate, pipeline value by estimator, average bid cycle, revenue forecast from submitted bids. Management-only view. Separate from estimator workspace.', status: 'queued', priority: 'medium', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-04-01', updatedAt: '2026-04-01' },
  { id: 'TSK-019', title: 'Gold Dataset — historical backfill', detail: 'Read 2015–2023 estimating folders (read-only). 8 completed job cost PDFs in Estimating Standards. Normalize into Gold Dataset template tabs: System_Quantities, Labor_By_Activity, Change_Order_Impact.', status: 'queued', priority: 'medium', category: 'Data', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-04-01' },
  { id: 'TSK-020', title: '3:30 PM daily report reminder cron', detail: 'Check Field_Events_V1 for missing daily reports. Email field lead if not submitted by 3:30 PM HST. Configure in Workflows panel.', status: 'queued', priority: 'medium', category: 'Automation', assignedTo: 'Kai', createdAt: '2026-03-31', updatedAt: '2026-04-01' },
  { id: 'TSK-021', title: 'Move island folders out of AI Command Center', detail: 'Kauai/Maui/Oahu project folders still exist in AI Command Center archive from earlier mistake. Needs cleanup — rename or move to be clear they are not active.', status: 'queued', priority: 'low', category: 'Drive', assignedTo: 'Kai + Sean', createdAt: '2026-03-31', updatedAt: '2026-04-01' },
  { id: 'TSK-022', title: 'Ball-in-court email tracking', detail: 'Kai watches outbound emails with commitments. If deliverable not received by promised date, surfaces in PM Today view. Core PM intelligence feature from whitepaper section 12.3.', status: 'queued', priority: 'low', category: 'Project Management', assignedTo: 'Kai', createdAt: '2026-04-01', updatedAt: '2026-04-01' },
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
