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
};

// ─── Real current tasks (used to seed the sheet if empty) ─────────────────────
const SEED_TASKS: Task[] = [
  // CRITICAL / IN PROGRESS
  { id: 'TSK-001', title: 'Estimating Module Architecture', detail: 'Architecture doc completing, full build plan in docs/ESTIMATING_MODULE_ARCHITECTURE.md', status: 'done', priority: 'critical', category: 'Estimating', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-07' },
  { id: 'TSK-002', title: 'Whitepaper v4.1/v5.0 Update', detail: 'Incorporating estimating system, Golden Kai, compliance engine', status: 'in_progress', priority: 'critical', category: 'Documentation', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  // HIGH / QUEUED
  { id: 'TSK-003', title: 'Estimating Module Phase 0-1: Data Layer', detail: 'New schema tables, API routes, backend sheet tabs per architecture doc', status: 'done', priority: 'high', category: 'Estimating', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-07' },
  { id: 'TSK-004', title: 'Estimating Module Phase 2: UI Workspace', detail: 'Card view + tabbed workspace with accordion rows', status: 'done', priority: 'high', category: 'Estimating', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-07' },
  { id: 'TSK-005', title: 'Estimating Module Phase 3: Estimating Kai', detail: 'Department-specific AI with GPT prompt + compliance engine', status: 'done', priority: 'high', category: 'Estimating', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-07' },
  { id: 'TSK-006', title: 'Smartsheet → Drive Data Dump', detail: 'All 30 projects, RFIs, submittals, COs, photos. DATA PRESERVATION EMERGENCY', status: 'queued', priority: 'high', category: 'Data Migration', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-007', title: 'Historical Data Ingestion', detail: "Mark Olson's estimating files 2015-present for Gold Data", status: 'queued', priority: 'high', category: 'Data', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-008', title: 'Public Bid Data Scraper', detail: 'Hawaii Public Works bid results for market comparison', status: 'queued', priority: 'high', category: 'Data', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-009', title: "Carl's Method Digitization", detail: "Replicate Jody's 1988 Lotus sheet as Tab 1 in new workbook", status: 'done', priority: 'high', category: 'Estimating', assignedTo: 'Kai+Sean', createdAt: '2026-04-05', updatedAt: '2026-04-07' },
  { id: 'TSK-010', title: "Joey's Freight Calculator", detail: 'Find and build into estimating system', status: 'queued', priority: 'high', category: 'Estimating', assignedTo: 'Sean+Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-011', title: 'QuickBooks Authorization', detail: 'Connected via OAuth. 500 invoices synced.', status: 'done', priority: 'high', category: 'Finance', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-07' },
  { id: 'TSK-012', title: 'Dashboards Build', detail: 'Operations + Estimating + Projects in one focused session', status: 'queued', priority: 'high', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-013', title: 'PM Panels', detail: 'Wire Budget, Schedule, Submittals from real data', status: 'queued', priority: 'high', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-014', title: 'Cost & Usage Panel Fix', detail: 'CostPanel expects different data shape than API returns, crashes', status: 'queued', priority: 'high', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  // MEDIUM / QUEUED
  { id: 'TSK-015', title: 'Golden Kai Easter Egg', detail: 'Tailscale tunnel + OpenClaw HTTP API + UI unlock animation', status: 'queued', priority: 'medium', category: 'Feature', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-016', title: 'Golden Kai Button Design', detail: 'Brief sent to Hunter, awaiting concepts', status: 'waiting', priority: 'medium', category: 'Design', assignedTo: 'Hunter', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-017', title: 'Field App Capture Mode Rebuild', detail: '6 modes, currently basic — needs full rebuild', status: 'queued', priority: 'medium', category: 'Field App', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-018', title: 'Photo Upload to Drive', detail: 'Wire field app photos to project folders in Drive', status: 'queued', priority: 'medium', category: 'Field App', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-019', title: 'Daily Report PDF Assembly', detail: 'Auto-generate, email to PM at 3:30 PM if not submitted', status: 'queued', priority: 'medium', category: 'Field App', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-020', title: 'Fix OpenClaw CLI Pairing', detail: 'Scope-upgrade issue blocking cron scheduling', status: 'queued', priority: 'medium', category: 'Infrastructure', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-021', title: 'Manufacturer Product Library', detail: 'Scrape glazing manufacturer websites for compliance data', status: 'queued', priority: 'medium', category: 'Estimating', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-022', title: 'Service Concurrent Transition', detail: 'Joey read/write during Smartsheet wind-down', status: 'queued', priority: 'medium', category: 'Service', assignedTo: 'Kai+Joey', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-023', title: 'Workload Intelligence System', detail: 'Effort-weighted capacity model for team planning', status: 'queued', priority: 'medium', category: 'Feature', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-024', title: 'Drive Folder Structure', detail: 'Remaining per-project folders in BanyanOS drive', status: 'queued', priority: 'medium', category: 'Data Migration', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-025', title: 'macOS Firewall', detail: 'Sean needs to toggle ON in System Settings > Network > Firewall', status: 'waiting', priority: 'medium', category: 'Infrastructure', assignedTo: 'Sean', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  // DONE
  { id: 'TSK-026', title: 'Security Hardening', detail: 'OAuth required all routes, groupPolicy allowlist', status: 'done', priority: 'high', category: 'Infrastructure', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-027', title: 'Ask Kai Model Swap', detail: 'GPT 5.4 for all sub-agents', status: 'done', priority: 'medium', category: 'Infrastructure', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-028', title: 'Project Data Population', detail: '30 active projects in Core_Entities', status: 'done', priority: 'high', category: 'Data', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-029', title: 'QA/Install Tracking Module', detail: 'Install_Tracking tab + panel', status: 'done', priority: 'high', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-030', title: 'Crew Department Fix', detail: 'Multi-department model working', status: 'done', priority: 'medium', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-031', title: 'Jenny Bug Fix', detail: 'OnboardingFlow localStorage issue resolved', status: 'done', priority: 'high', category: 'Mission Control', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-032', title: 'ERD Generated', detail: '21-table Mermaid ERD for Sean\'s stepdad', status: 'done', priority: 'medium', category: 'Documentation', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-033', title: 'Tailscale Installed', detail: 'On Mac mini, connected to network', status: 'done', priority: 'medium', category: 'Infrastructure', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-034', title: 'Whitepaper v4.0', detail: 'Updated with QA/Install, departments, security', status: 'done', priority: 'high', category: 'Documentation', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-035', title: 'Smartsheet File Migration Started', detail: 'Downloading attachments to Drive (ongoing)', status: 'done', priority: 'high', category: 'Data Migration', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-036', title: 'Drive Folder Structure Created', detail: '30 project folders with template structure', status: 'done', priority: 'medium', category: 'Data Migration', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-037', title: 'Backend Data Population', detail: '659 submittals, 317 COs, 8 RFIs from Smartsheet', status: 'done', priority: 'high', category: 'Data', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-038', title: 'Golden Kai Design Brief', detail: 'Uploaded to Drive, forwarded to Hunter', status: 'done', priority: 'medium', category: 'Design', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  { id: 'TSK-039', title: 'Estimating Dev Docs Discovery', detail: 'Found full dev library in AI Command Center Archive', status: 'done', priority: 'medium', category: 'Data', assignedTo: 'Kai', createdAt: '2026-04-05', updatedAt: '2026-04-05' },
  // Added April 7
  { id: 'TSK-040', title: 'Takeoff Pipeline — Document Content Extraction', detail: 'Download PDFs from Drive, extract text/tables, feed to GPT-5.4 for real takeoff generation.', status: 'queued', priority: 'high', category: 'Estimating', assignedTo: 'Kai', createdAt: '2026-04-07', updatedAt: '2026-04-07' },
  { id: 'TSK-041', title: 'Full System Debug Walkthrough', detail: 'Click through every page, every button as a real user. Fix all broken flows.', status: 'in_progress', priority: 'high', category: 'QA', assignedTo: 'Kai', createdAt: '2026-04-07', updatedAt: '2026-04-07' },
  { id: 'TSK-042', title: 'Golden Kai Easter Egg', detail: 'Build the Golden Kai button with unlock animation. Brief at docs/GOLDEN_KAI_BUTTON_BRIEF.md', status: 'queued', priority: 'medium', category: 'Feature', assignedTo: 'Kai', createdAt: '2026-04-07', updatedAt: '2026-04-07' },
  { id: 'TSK-043', title: 'Invoicing Module', detail: 'Generate invoices from completed WOs, push to QBO, track payment. Click-to-pay links.', status: 'queued', priority: 'medium', category: 'Admin/Finance', assignedTo: 'Kai', createdAt: '2026-04-07', updatedAt: '2026-04-07' },
  { id: 'TSK-044', title: 'RFI Tab in Estimating', detail: 'Auto-populate RFIs from takeoff analysis. Track open/resolved per bid.', status: 'queued', priority: 'medium', category: 'Estimating', assignedTo: 'Kai', createdAt: '2026-04-07', updatedAt: '2026-04-07' },
];

// ─── Design tokens ─────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<TaskPriority, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: '#dc2626', bg: 'rgba(254,242,242,0.97)', border: '1px solid rgba(220,38,38,0.2)',  label: 'Critical' },
  high:     { color: '#ea580c', bg: 'rgba(255,247,237,0.97)', border: '1px solid rgba(234,88,12,0.2)',  label: 'High' },
  medium:   { color: '#2563eb', bg: 'rgba(239,246,255,0.97)', border: '1px solid rgba(37,99,235,0.18)', label: 'Medium' },
  low:      { color: '#64748b', bg: 'rgba(248,250,252,0.97)', border: '1px solid rgba(148,163,184,0.2)', label: 'Low' },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; dot: string }> = {
  queued:      { label: 'Queued',      color: '#64748b', bg: 'rgba(100,116,139,0.1)',  dot: '#94a3b8' },
  in_progress: { label: 'In Progress', color: '#0f766e', bg: 'rgba(15,118,110,0.12)', dot: '#14b8a6' },
  waiting:     { label: 'Waiting',     color: '#b45309', bg: 'rgba(180,83,9,0.12)',    dot: '#f59e0b' },
  blocked:     { label: 'Blocked',     color: '#dc2626', bg: 'rgba(220,38,38,0.1)',    dot: '#ef4444' },
  done:        { label: 'Done',        color: '#15803d', bg: 'rgba(21,128,61,0.1)',    dot: '#4ade80' },
};

const PRIORITY_ORDER: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const po = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (po !== 0) return po;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

// ─── Task Card Component ────────────────────────────────────────────────────────
function TaskCard({
  task, expanded, onToggle, onStatusChange, onSave,
}: {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (id: string, status: TaskStatus) => Promise<void>;
  onSave: (id: string, fields: Partial<Task>) => Promise<void>;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState('');

  const [editDraft, setEditDraft] = useState({
    title: task.title,
    detail: task.detail,
    priority: task.priority,
    category: task.category,
    assignedTo: task.assignedTo,
    dueDate: task.dueDate || '',
    blockedBy: task.blockedBy || '',
  });

  const pc = PRIORITY_CONFIG[task.priority];
  const sc = STATUS_CONFIG[task.status];

  const INP: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid rgba(15,118,110,0.25)', background: 'rgba(255,255,255,0.8)',
    fontSize: 12, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
  };

  async function handleEditSave() {
    setSaving(true);
    await onSave(task.id, { ...editDraft });
    setSaving(false);
    setMode('view');
  }

  async function handleStatusChange(status: TaskStatus) {
    setStatusSaving(status);
    await onStatusChange(task.id, status);
    setStatusSaving('');
  }

  const nextStatuses: { key: TaskStatus; label: string; color: string; bg: string }[] = [];
  if (task.status === 'queued') {
    nextStatuses.push({ key: 'in_progress', label: 'Start', color: '#0f766e', bg: 'rgba(15,118,110,0.1)' });
  }
  if (task.status === 'in_progress') {
    nextStatuses.push({ key: 'waiting', label: 'Waiting', color: '#b45309', bg: 'rgba(180,83,9,0.1)' });
    nextStatuses.push({ key: 'done', label: 'Done ✓', color: '#15803d', bg: 'rgba(21,128,61,0.1)' });
  }
  if (task.status === 'waiting' || task.status === 'blocked') {
    nextStatuses.push({ key: 'in_progress', label: 'Resume', color: '#0f766e', bg: 'rgba(15,118,110,0.1)' });
    nextStatuses.push({ key: 'done', label: 'Done ✓', color: '#15803d', bg: 'rgba(21,128,61,0.1)' });
  }
  if (task.status === 'done') {
    nextStatuses.push({ key: 'queued', label: 'Reopen', color: '#64748b', bg: 'rgba(100,116,139,0.1)' });
  }

  return (
    <article style={{
      borderRadius: 16,
      background: pc.bg,
      border: pc.border,
      boxShadow: '0 4px 16px rgba(15,23,42,0.05)',
      position: 'relative',
      overflow: 'hidden',
      opacity: task.status === 'done' ? 0.75 : 1,
    }}>
      {/* Left priority border */}
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 4, background: pc.color, opacity: 0.85 }} />

      {/* Card header */}
      <div onClick={onToggle} style={{ padding: '12px 14px 12px 18px', cursor: 'pointer' }}>

        {/* Row 1: ID + badges + action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#94a3b8', fontFamily: 'monospace', flexShrink: 0 }}>{task.id}</span>

          {/* Status badge */}
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999, color: sc.color, background: sc.bg, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
            {sc.label}
          </span>

          {/* Category tag */}
          {task.category && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 999, color: '#475569', background: 'rgba(100,116,139,0.1)', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>
              {task.category}
            </span>
          )}

          <div style={{ flex: 1 }} />

          {/* Priority indicator */}
          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: pc.color, flexShrink: 0 }}>
            {pc.label}
          </span>

          {/* Edit button */}
          <div onClick={e => e.stopPropagation()}>
            <button
              title="Edit task"
              onClick={() => { setMode(mode === 'edit' ? 'view' : 'edit'); if (!expanded) onToggle(); }}
              style={{ width: 26, height: 26, borderRadius: 7, border: mode === 'edit' ? '1px solid rgba(15,118,110,0.4)' : '1px solid rgba(203,213,225,0.7)', background: mode === 'edit' ? 'rgba(240,253,250,0.96)' : 'rgba(255,255,255,0.7)', color: mode === 'edit' ? '#0f766e' : '#94a3b8', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              ✎
            </button>
          </div>
        </div>

        {/* Row 2: Title */}
        <div style={{ fontSize: 13, fontWeight: 700, color: task.status === 'done' ? '#64748b' : '#0f172a', lineHeight: 1.35, letterSpacing: '-0.01em', marginBottom: 4, textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
          {task.title}
        </div>

        {/* Row 3: Brief detail (truncated) */}
        {task.detail && (
          <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {task.detail}
          </div>
        )}

        {/* Row 4: Meta */}
        <div style={{ display: 'flex', gap: 10, marginTop: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          {task.assignedTo && (
            <span style={{ fontSize: 10, fontWeight: 600, color: '#4338ca' }}>→ {task.assignedTo}</span>
          )}
          {task.dueDate && (
            <span style={{ fontSize: 10, fontWeight: 600, color: '#b45309' }}>Due {task.dueDate}</span>
          )}
          {task.updatedAt && (
            <span style={{ fontSize: 10, color: '#94a3b8' }}>Updated {task.updatedAt}</span>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ paddingLeft: 22, paddingRight: 16, paddingBottom: 16, borderTop: '1px solid rgba(226,232,240,0.5)', paddingTop: 14, display: 'grid', gap: 14 }}>

          {/* EDIT MODE */}
          {mode === 'edit' && (
            <div style={{ display: 'grid', gap: 10, padding: '14px 16px', borderRadius: 14, background: 'rgba(240,253,250,0.5)', border: '1px solid rgba(15,118,110,0.15)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0f766e' }}>Edit Task</div>

              <div>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4 }}>Title</div>
                <input value={editDraft.title} onChange={e => setEditDraft(p => ({ ...p, title: e.target.value }))} style={INP} />
              </div>

              <div>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4 }}>Detail</div>
                <textarea value={editDraft.detail} onChange={e => setEditDraft(p => ({ ...p, detail: e.target.value }))} rows={3} style={{ ...INP, resize: 'vertical' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4 }}>Priority</div>
                  <select value={editDraft.priority} onChange={e => setEditDraft(p => ({ ...p, priority: e.target.value as TaskPriority }))} style={INP}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4 }}>Category</div>
                  <input value={editDraft.category} onChange={e => setEditDraft(p => ({ ...p, category: e.target.value }))} style={INP} />
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4 }}>Assigned To</div>
                  <input value={editDraft.assignedTo} onChange={e => setEditDraft(p => ({ ...p, assignedTo: e.target.value }))} style={INP} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4 }}>Due Date</div>
                  <input type="date" value={editDraft.dueDate} onChange={e => setEditDraft(p => ({ ...p, dueDate: e.target.value }))} style={INP} />
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4 }}>Blocked By</div>
                  <input value={editDraft.blockedBy} onChange={e => setEditDraft(p => ({ ...p, blockedBy: e.target.value }))} placeholder="TSK-XXX or note" style={INP} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setMode('view')}
                  style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleEditSave} disabled={saving}
                  style={{ padding: '8px 20px', borderRadius: 10, background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: saving ? '#94a3b8' : 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', boxShadow: saving ? 'none' : '0 2px 8px rgba(15,118,110,0.3)' }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* VIEW MODE — full detail */}
          {mode === 'view' && (
            <div style={{ display: 'grid', gap: 8 }}>
              {task.detail && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>Detail</div>
                  <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.55 }}>{task.detail}</div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {task.assignedTo && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>Assigned</div>
                    <div style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>{task.assignedTo}</div>
                  </div>
                )}
                {task.dueDate && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>Due</div>
                    <div style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>{task.dueDate}</div>
                  </div>
                )}
                {task.createdAt && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>Created</div>
                    <div style={{ fontSize: 12, color: '#334155' }}>{task.createdAt}</div>
                  </div>
                )}
              </div>

              {task.blockedBy && (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.15)' }}>
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#dc2626', marginBottom: 2 }}>Blocked By</div>
                  <div style={{ fontSize: 12, color: '#334155' }}>{task.blockedBy}</div>
                </div>
              )}
            </div>
          )}

          {/* Status pipeline — always at bottom */}
          {nextStatuses.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(226,232,240,0.5)', paddingTop: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Move to</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {nextStatuses.map(ns => (
                  <button key={ns.key}
                    onClick={e => { e.stopPropagation(); handleStatusChange(ns.key); }}
                    disabled={!!statusSaving}
                    style={{ padding: '7px 14px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', cursor: statusSaving ? 'default' : 'pointer', border: `1px solid ${ns.color}44`, background: statusSaving === ns.key ? '#f1f5f9' : ns.bg, color: ns.color, opacity: statusSaving && statusSaving !== ns.key ? 0.5 : 1 }}>
                    {statusSaving === ns.key ? '...' : ns.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Add Task Form ─────────────────────────────────────────────────────────────
function AddTaskForm({ onAdd, onCancel, taskCount }: { onAdd: (task: Task) => void; onCancel: () => void; taskCount: number }) {
  const [draft, setDraft] = useState({
    title: '', detail: '', priority: 'high' as TaskPriority, category: '', assignedTo: 'Kai', dueDate: '',
  });

  const INP: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: '1px solid rgba(15,118,110,0.25)', background: 'rgba(255,255,255,0.9)',
    fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
  };

  function handleAdd() {
    if (!draft.title.trim()) return;
    const num = String(taskCount + 1).padStart(3, '0');
    const id = `TSK-${num}`;
    const now = new Date().toISOString().split('T')[0];
    onAdd({
      id, title: draft.title, detail: draft.detail,
      status: 'queued', priority: draft.priority,
      category: draft.category || 'General',
      assignedTo: draft.assignedTo, dueDate: draft.dueDate,
      createdAt: now, updatedAt: now,
    });
  }

  return (
    <article style={{ borderRadius: 16, background: 'rgba(240,253,250,0.97)', border: '1px solid rgba(15,118,110,0.25)', boxShadow: '0 4px 20px rgba(15,118,110,0.1)', position: 'relative', overflow: 'hidden', padding: '18px 20px' }}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 4, background: '#14b8a6' }} />
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0f766e', marginBottom: 14 }}>New Task</div>
      <div style={{ display: 'grid', gap: 10 }}>
        <input placeholder="Task title *" value={draft.title} onChange={e => setDraft(p => ({ ...p, title: e.target.value }))} style={INP} autoFocus />
        <textarea placeholder="Detail / description" value={draft.detail} onChange={e => setDraft(p => ({ ...p, detail: e.target.value }))} rows={2} style={{ ...INP, resize: 'none' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          <select value={draft.priority} onChange={e => setDraft(p => ({ ...p, priority: e.target.value as TaskPriority }))} style={INP}>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input placeholder="Category" value={draft.category} onChange={e => setDraft(p => ({ ...p, category: e.target.value }))} style={INP} />
          <input placeholder="Assigned to" value={draft.assignedTo} onChange={e => setDraft(p => ({ ...p, assignedTo: e.target.value }))} style={INP} />
          <input type="date" value={draft.dueDate} onChange={e => setDraft(p => ({ ...p, dueDate: e.target.value }))} style={INP} title="Due date (optional)" />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}
            style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleAdd} disabled={!draft.title.trim()}
            style={{ padding: '9px 22px', borderRadius: 10, background: draft.title.trim() ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0', color: draft.title.trim() ? 'white' : '#94a3b8', border: 'none', fontSize: 12, fontWeight: 800, cursor: draft.title.trim() ? 'pointer' : 'default', boxShadow: draft.title.trim() ? '0 2px 8px rgba(15,118,110,0.3)' : 'none' }}>
            Add Task
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Filter tabs definition ─────────────────────────────────────────────────────
type FilterKey = 'active' | 'critical' | 'in_progress' | 'waiting' | 'done';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'active',      label: 'All Active' },
  { key: 'critical',    label: 'Critical / High' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'waiting',     label: 'Waiting / Blocked' },
  { key: 'done',        label: 'Done' },
];

function applyFilter(tasks: Task[], filter: FilterKey): Task[] {
  switch (filter) {
    case 'active':      return tasks.filter(t => t.status !== 'done');
    case 'critical':    return tasks.filter(t => (t.priority === 'critical' || t.priority === 'high') && t.status !== 'done');
    case 'in_progress': return tasks.filter(t => t.status === 'in_progress');
    case 'waiting':     return tasks.filter(t => t.status === 'waiting' || t.status === 'blocked');
    case 'done':        return tasks.filter(t => t.status === 'done');
  }
}

// ─── Main Panel ────────────────────────────────────────────────────────────────
export default function TaskBoardPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterKey>('active');
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setTasks(SEED_TASKS);
        return;
      }
      if (data.empty) {
        setTasks(SEED_TASKS);
        // Seed the sheet in background
        fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasks: SEED_TASKS }),
        }).catch(() => {});
      } else {
        setTasks(data.tasks as Task[]);
      }
    } catch (e) {
      setError(String(e));
      setTasks(SEED_TASKS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function handleStatusChange(id: string, status: TaskStatus) {
    const now = new Date().toISOString().split('T')[0];
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status, updatedAt: now } : t));
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: id, status }),
      });
    } catch { /* optimistic, non-fatal */ }
  }

  async function handleSave(id: string, fields: Partial<Task>) {
    const now = new Date().toISOString().split('T')[0];
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...fields, updatedAt: now } : t));
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: id, ...fields }),
      });
    } catch { /* optimistic, non-fatal */ }
  }

  async function handleAddTask(task: Task) {
    setTasks(prev => [task, ...prev]);
    setShowNew(false);
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [task] }),
      });
    } catch { /* non-fatal */ }
  }

  // Counts
  const counts = {
    active:      tasks.filter(t => t.status !== 'done').length,
    critical:    tasks.filter(t => (t.priority === 'critical' || t.priority === 'high') && t.status !== 'done').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    waiting:     tasks.filter(t => t.status === 'waiting' || t.status === 'blocked').length,
    done:        tasks.filter(t => t.status === 'done').length,
  };

  const filtered = sortTasks(applyFilter(tasks, filter));

  const criticalCount = tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length;
  const inProgCount = tasks.filter(t => t.status === 'in_progress').length;
  const waitCount = tasks.filter(t => t.status === 'waiting' || t.status === 'blocked').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  return (
    <div style={{ padding: '32px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>AI Command</div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Task Board</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{tasks.filter(t => t.status !== 'done').length} open · {doneCount} done</p>
          </div>
          <div style={{ display: 'flex', gap: 8, paddingBottom: 4 }}>
            <button onClick={() => setShowNew(v => !v)}
              style={{ padding: '8px 20px', borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', background: showNew ? 'rgba(15,118,110,0.12)' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: showNew ? '#0f766e' : 'white', border: showNew ? '1px solid rgba(15,118,110,0.25)' : 'none', cursor: 'pointer', boxShadow: showNew ? 'none' : '0 4px 16px rgba(15,118,110,0.3)' }}>
              {showNew ? '✕ Cancel' : '+ New Task'}
            </button>
            <button onClick={fetchTasks}
              style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer' }}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 22, padding: 16, borderRadius: 20, background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)', border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
          {[
            { label: 'Critical', value: criticalCount, color: '#dc2626', helper: 'Needs immediate action' },
            { label: 'In Progress', value: inProgCount, color: '#0f766e', helper: 'Being worked on now' },
            { label: 'Waiting', value: waitCount, color: '#b45309', helper: 'Blocked or waiting' },
            { label: 'Done', value: doneCount, color: '#15803d', helper: 'Completed' },
          ].map(s => (
            <div key={s.label} style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
              <div style={{ marginTop: 5, fontSize: 26, fontWeight: 900, letterSpacing: '-0.05em', color: s.value > 0 ? s.color : '#94a3b8', lineHeight: 1 }}>{s.value}</div>
              <div style={{ marginTop: 4, fontSize: 10, color: '#94a3b8' }}>{s.helper}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>
          ⚠️ {error} — showing cached data
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          const count = counts[f.key];
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', border: active ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0', background: active ? 'rgba(240,253,250,0.96)' : 'white', color: active ? '#0f766e' : '#64748b', cursor: 'pointer', transition: 'all 0.15s' }}>
              {f.label} · {count}
            </button>
          );
        })}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', padding: 48, textAlign: 'center' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading tasks...</div>
        </div>
      )}

      {/* Task list */}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* New task form at top */}
          {showNew && (
            <AddTaskForm
              onAdd={handleAddTask}
              onCancel={() => setShowNew(false)}
              taskCount={tasks.length}
            />
          )}

          {filtered.length === 0 && !showNew && (
            <div style={{ padding: 40, textAlign: 'center', borderRadius: 16, background: 'white', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Nothing here</div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>
                {filter === 'done' ? 'No completed tasks yet' : 'No tasks in this view'}
              </div>
            </div>
          )}

          {filtered.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              expanded={expanded === task.id}
              onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
              onStatusChange={handleStatusChange}
              onSave={handleSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
