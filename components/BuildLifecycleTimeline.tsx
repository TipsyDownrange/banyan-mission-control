'use client';
import React, { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

type BuildPhaseStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked';

interface BuildTask {
  label: string;
  done: boolean;
  notes?: string;
}

interface BuildPhase {
  phase_number: number;
  phase_name: string;
  short_label: string;
  estimated_weeks: string;
  status: BuildPhaseStatus;
  tasks: BuildTask[];
  notes?: string;
}

interface BuildTimelineData {
  phases: BuildPhase[];
  last_updated: string;
  overall_pct_complete: number;
  current_phase_number: number;
}

type TaskStatus = 'queued' | 'in_progress' | 'waiting' | 'done' | 'blocked';
type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

type ActionLogEntry = { ts: string; action: string; by: string };

interface SheetTask {
  id: string;
  title: string;
  detail: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  assignedTo: string;
  phase?: string;
  dueDate?: string;
  blockedBy?: string;
  updatedAt?: string;
  actionLog?: ActionLogEntry[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, { color: string; bg: string; label: string }> = {
  queued:      { color: '#64748b', bg: '#f1f5f9', label: 'Queued' },
  in_progress: { color: '#0f766e', bg: '#f0fdfa', label: 'In Progress' },
  waiting:     { color: '#d97706', bg: '#fffbeb', label: 'Waiting' },
  blocked:     { color: '#b91c1c', bg: '#fef2f2', label: 'Blocked' },
  done:        { color: '#15803d', bg: '#f0fdf4', label: 'Done' },
};

const PRIORITY_DOT: Record<string, string> = {
  critical: '#b91c1c', high: '#d97706', medium: '#2563eb', low: '#94a3b8',
};

const STATUS_ORDER: TaskStatus[] = ['queued', 'in_progress', 'waiting', 'blocked', 'done'];

function phaseNumFromString(phase?: string): number {
  if (!phase) return -1;
  const m = phase.match(/(\d+)/);
  return m ? parseInt(m[1]) : -1;
}

// ── Color helpers ──────────────────────────────────────────────────────────────

function phaseColors(status: BuildPhaseStatus, isCurrent: boolean) {
  if (status === 'complete') return { bg: '#059669', text: '#fff', border: '#059669' };
  if (status === 'blocked')  return { bg: '#dc2626', text: '#fff', border: '#dc2626' };
  if (isCurrent || status === 'in_progress') return { bg: '#0f766e', text: '#fff', border: '#14b8a6' };
  return { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' };
}

// ── PhaseChip ──────────────────────────────────────────────────────────────────

function PhaseChip({
  phase, isCurrent, isExpanded, onClick,
}: {
  phase: BuildPhase;
  isCurrent: boolean;
  isExpanded: boolean;
  onClick: () => void;
}) {
  const { bg, text, border } = phaseColors(phase.status, isCurrent);
  const done = phase.tasks.filter((t) => t.done).length;
  const total = phase.tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
        background: isExpanded ? bg : bg === '#f1f5f9' ? '#fff' : bg,
        border: `1.5px solid ${border}`,
        boxShadow: isCurrent ? '0 0 0 3px rgba(20,184,166,0.2)' : 'none',
        minWidth: 72, flex: '1 1 72px', maxWidth: 90,
        transition: 'all 0.15s',
        animation: isCurrent ? 'pulseBorder 2s ease-in-out infinite' : 'none',
      }}
    >
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: isExpanded ? text : phase.status === 'not_started' ? '#94a3b8' : text, lineHeight: 1 }}>
        Ph {phase.phase_number}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: isExpanded ? text : phase.status === 'not_started' ? '#64748b' : text, lineHeight: 1.2, textAlign: 'center' as const }}>
        {phase.short_label}
      </span>
      {phase.status === 'complete' && (
        <span style={{ fontSize: 10, color: isExpanded ? 'rgba(255,255,255,0.85)' : '#059669' }}>✓</span>
      )}
      {(phase.status === 'in_progress' || isCurrent) && total > 0 && (
        <span style={{ fontSize: 9, color: isExpanded ? 'rgba(255,255,255,0.85)' : '#0f766e', fontWeight: 700 }}>{pct}%</span>
      )}
      {phase.status === 'not_started' && (
        <span style={{ fontSize: 8, color: '#94a3b8', letterSpacing: '0.04em' }}>{phase.estimated_weeks.replace('Weeks ', 'Wk ')}</span>
      )}
    </button>
  );
}

// ── TaskDirectiveInput ────────────────────────────────────────────────────────

function TaskDirectiveInput({ task, onLogUpdated }: {
  task: SheetTask;
  onLogUpdated: (taskId: string, log: ActionLogEntry[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [flash, setFlash] = React.useState<'success' | 'error' | null>(null);
  const [errorMsg, setErrorMsg] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const existingLog = (task.actionLog || [])
    .filter(e => e.action.startsWith('directive:'))
    .slice().reverse();

  const handleOpen = () => {
    setOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setFlash(null);
    const now = new Date().toISOString();
    const newEntry: ActionLogEntry = { ts: now, action: 'directive: ' + trimmed, by: 'Sean Daniels' };
    const updatedLog = [...(task.actionLog || []), newEntry];
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: task.id, actionLog: JSON.stringify(updatedLog) }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      onLogUpdated(task.id, updatedLog);
      setText('');
      setFlash('success');
      setOpen(false);
      setTimeout(() => setFlash(null), 2000);
    } catch (e) {
      console.error('[TaskDirectiveInput] submit error:', e);
      setFlash('error');
      setErrorMsg(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const hasText = text.trim().length > 0;

  if (!open) {
    return (
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={handleOpen} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: 600, color: '#94a3b8', padding: 0,
          textDecoration: 'underline dotted', textUnderlineOffset: 2,
        }}>
          + Add directive / context
        </button>
        {flash === 'success' && (
          <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>✓ Directive added</span>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      {existingLog.length > 0 && (
        <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {existingLog.map((entry, i) => (
            <div key={i} style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, padding: '4px 8px', borderRadius: 6, background: '#f8fafc', borderLeft: '2px solid #e2e8f0' }}>
              <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', marginRight: 6 }}>
                {new Date(entry.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              {entry.action.replace(/^directive:\s*/, '')}
            </div>
          ))}
        </div>
      )}
      <textarea ref={textareaRef} value={text}
        onChange={e => { setText(e.target.value); if (flash === 'error') setFlash(null); }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
        placeholder="Add directive or context for this task..."
        rows={2}
        style={{
          width: '100%', boxSizing: 'border-box' as const,
          fontSize: 13, padding: '8px 10px', borderRadius: 7,
          border: flash === 'error' ? '1.5px solid #fca5a5' : '1.5px solid #e2e8f0',
          outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit',
          color: '#0f172a', background: 'white', lineHeight: 1.5,
        }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ fontSize: 10, color: flash === 'error' ? '#dc2626' : '#94a3b8' }}>
          {flash === 'error' ? errorMsg || 'Submit failed' : 'Cmd+Enter · Esc to cancel'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => { setOpen(false); setText(''); setFlash(null); }}
            style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!hasText || submitting}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: 'none',
              background: hasText && !submitting ? '#14b8a6' : '#e2e8f0',
              color: hasText && !submitting ? 'white' : '#94a3b8',
              cursor: hasText && !submitting ? 'pointer' : 'default',
            }}>
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TaskRow ────────────────────────────────────────────────────────────────────

function TaskRow({ task, onStatusChange, saving, onLogUpdated }: {
  task: SheetTask;
  onStatusChange: (id: string, status: TaskStatus) => void;
  saving: string | null;
  onLogUpdated: (taskId: string, log: ActionLogEntry[]) => void;
}) {
  const pill = STATUS_PILL[task.status] || STATUS_PILL.queued;
  const dot = PRIORITY_DOT[task.priority] || '#94a3b8';
  const isSaving = saving === task.id;
  const nextStatuses = STATUS_ORDER.filter(s => s !== task.status);

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
      borderRadius: 9, background: task.status === 'done' ? '#fafafa' : 'white',
      border: '1px solid #f1f5f9',
    }}>
      {/* Priority dot */}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0, marginTop: 5 }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: task.status === 'done' ? '#94a3b8' : '#0f172a', lineHeight: 1.3, textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
          {task.title}
        </div>
        {task.detail && (
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>{task.detail}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color: pill.color, background: pill.bg }}>
            {isSaving ? '…' : pill.label}
          </span>
          {task.id && <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>{task.id}</span>}
        </div>
        {/* Task-level directive input */}
        <TaskDirectiveInput task={task} onLogUpdated={onLogUpdated} />
      </div>

      {/* Status change controls */}
      {task.status !== 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 3, flexShrink: 0 }}>
          {nextStatuses.slice(0, 3).map(s => (
            <button key={s} disabled={isSaving}
              onClick={() => onStatusChange(task.id, s)}
              style={{
                padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700,
                border: `1px solid ${STATUS_PILL[s].color}22`,
                background: STATUS_PILL[s].bg, color: STATUS_PILL[s].color,
                cursor: isSaving ? 'default' : 'pointer', opacity: isSaving ? 0.5 : 1,
              }}>
              → {STATUS_PILL[s].label}
            </button>
          ))}
        </div>
      )}
      {task.status === 'done' && (
        <button disabled={isSaving}
          onClick={() => onStatusChange(task.id, 'queued')}
          style={{ padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#94a3b8', cursor: 'pointer' }}>
          ↩ Reopen
        </button>
      )}
    </div>
  );
}

// ── DirectOrderInput ──────────────────────────────────────────────────────────

function DirectOrderInput({ phaseNumber, onAdded }: {
  phaseNumber: number;
  onAdded: (task: SheetTask) => void;
}) {
  const [text, setText] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [flash, setFlash] = React.useState<'success' | 'error' | null>(null);
  const [errorMsg, setErrorMsg] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount (fires when drill-down expands)
  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setFlash(null);
    setErrorMsg('');
    const now = new Date().toISOString();
    const taskId = 'TSK-' + Date.now();
    const newTask: SheetTask = {
      id: taskId,
      title: trimmed.slice(0, 80),
      detail: trimmed,
      status: 'queued',
      priority: 'high',
      category: 'Directive',
      assignedTo: 'Sean',
      phase: `Phase ${phaseNumber}`,
      updatedAt: now,
    };
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: [{
            id: taskId,
            title: newTask.title,
            detail: newTask.detail,
            status: 'queued',
            priority: 'high',
            category: 'Directive',
            assignedTo: 'Sean',
            createdAt: now,
            updatedAt: now,
            phase: `Phase ${phaseNumber}`,
            source: 'direct_order',
            sortOrder: '999',
          }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setText('');
      setFlash('success');
      onAdded(newTask);
      setTimeout(() => setFlash(null), 2000);
    } catch (e) {
      console.error('[DirectOrderInput] submit error:', e);
      setFlash('error');
      setErrorMsg(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const hasText = text.trim().length > 0;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>
        Direct Order
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => { setText(e.target.value); if (flash === 'error') setFlash(null); }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
        placeholder="Direct Order: type a directive for this phase..."
        rows={2}
        style={{
          width: '100%', boxSizing: 'border-box' as const,
          fontSize: 14, padding: '10px 12px', borderRadius: 9,
          border: flash === 'error' ? '1.5px solid #fca5a5' : '1.5px solid #e2e8f0',
          outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit',
          color: '#0f172a', background: 'white', lineHeight: 1.5,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <div style={{ fontSize: 11, color: flash === 'success' ? '#15803d' : flash === 'error' ? '#dc2626' : '#94a3b8' }}>
          {flash === 'success' ? '✓ Directive added' : flash === 'error' ? errorMsg || 'Submit failed' : 'Cmd+Enter to submit'}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!hasText || submitting}
          style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: 'none', cursor: hasText && !submitting ? 'pointer' : 'default',
            background: hasText && !submitting ? '#14b8a6' : '#e2e8f0',
            color: hasText && !submitting ? 'white' : '#94a3b8',
            transition: 'background 0.15s',
          }}>
          {submitting ? 'Adding…' : 'Add Directive'}
        </button>
      </div>
    </div>
  );
}

// ── PhaseCommandPanel ──────────────────────────────────────────────────────────

function PhaseCommandPanel({ phase, tasks, onStatusChange, savingId, onTaskAdded, onLogUpdated }: {
  phase: BuildPhase;
  tasks: SheetTask[];
  onStatusChange: (id: string, status: TaskStatus) => void;
  savingId: string | null;
  onTaskAdded: (task: SheetTask) => void;
  onLogUpdated: (taskId: string, log: ActionLogEntry[]) => void;
}) {
  const checkDone = phase.tasks.filter((t) => t.done).length;
  const checkTotal = phase.tasks.length;
  const pct = checkTotal > 0 ? Math.round((checkDone / checkTotal) * 100) : 0;
  const [showDone, setShowDone] = useState(false);

  const activeTasks = tasks.filter(t => t.status !== 'done');
  const doneTasks = tasks.filter(t => t.status === 'done');

  return (
    <div style={{
      marginTop: 10, borderRadius: 12,
      background: 'white', border: '1px solid #e2e8f0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
            Phase {phase.phase_number}: {phase.phase_name}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{phase.estimated_weeks}</div>
        </div>
        <div style={{ textAlign: 'right' as const }}>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', color: pct >= 75 ? '#059669' : pct >= 40 ? '#d97706' : '#94a3b8', lineHeight: 1 }}>
            {pct}%
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>{checkDone}/{checkTotal} checklist</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: '#f1f5f9' }}>
        <div style={{ height: '100%', background: pct >= 75 ? '#059669' : pct >= 40 ? '#d97706' : '#14b8a6', width: `${pct}%`, transition: 'width 0.4s' }} />
      </div>

      <div style={{ padding: '12px 18px' }}>
        {/* Section A: Phase Checklist */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>
            Phase Checklist (read-only)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
            {phase.tasks.map((task, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{
                  flexShrink: 0, width: 15, height: 15, borderRadius: '50%', marginTop: 1,
                  background: task.done ? '#059669' : 'transparent',
                  border: task.done ? 'none' : '1.5px solid #cbd5e1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {task.done && <span style={{ fontSize: 8, color: '#fff', fontWeight: 900 }}>✓</span>}
                </div>
                <span style={{ fontSize: 12, color: task.done ? '#94a3b8' : '#334155', lineHeight: 1.4, textDecoration: task.done ? 'line-through' : 'none' }}>
                  {task.label}
                </span>
              </div>
            ))}
            {phase.tasks.length === 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>No checklist items for this phase.</div>
            )}
          </div>
          {phase.notes && (
            <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 7, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 11, color: '#92400e' }}>
              {phase.notes}
            </div>
          )}
        </div>

        {/* Direct Order input — Command surface per GC-D035 v2 amendments */}
        <DirectOrderInput
          phaseNumber={phase.phase_number}
          onAdded={onTaskAdded}
        />

        {/* Direct Order input — Command surface per GC-D035 v2 amendments */}
        <DirectOrderInput
          phaseNumber={phase.phase_number}
          onAdded={onTaskAdded}
        />

        {/* Section B: Active Tasks */}
        <div style={{ marginBottom: activeTasks.length > 0 || doneTasks.length > 0 ? 12 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Active Tasks</span>
            {activeTasks.length > 0 && <span style={{ fontWeight: 600 }}>{activeTasks.length} open</span>}
          </div>
          {activeTasks.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>No active tasks for this phase.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
              {activeTasks.map(t => (
                <TaskRow key={t.id} task={t} onStatusChange={onStatusChange} saving={savingId} onLogUpdated={onLogUpdated} />
              ))}
            </div>
          )}
        </div>

        {/* Done tasks (collapsible) */}
        {doneTasks.length > 0 && (
          <div>
            <button onClick={() => setShowDone(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#94a3b8', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
              {showDone ? '▾' : '▸'} {doneTasks.length} completed task{doneTasks.length !== 1 ? 's' : ''}
            </button>
            {showDone && (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, marginTop: 6 }}>
                {doneTasks.map(t => (
                  <TaskRow key={t.id} task={t} onStatusChange={onStatusChange} saving={savingId} onLogUpdated={onLogUpdated} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Section D placeholder: Captain's Orders (S3 — pending build) */}
        {/* Future surface: DecisionQueueItems linked to this phase will mount here */}
        {/* Fetch from banyanos_decision_queue.json when S3 ships */}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BuildLifecycleTimeline() {
  const [data, setData] = useState<BuildTimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const [tasks, setTasks] = useState<SheetTask[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [stateRes, tasksRes] = await Promise.all([
        fetch('/api/build-state'),
        fetch('/api/tasks'),
      ]);
      const stateJson = await stateRes.json();
      if (stateJson.ok) {
        setData(stateJson.data);
        setError(null);
      } else {
        setError(stateJson.error || 'Failed to load build state');
      }
      if (tasksRes.ok) {
        const tasksJson = await tasksRes.json();
        setTasks((tasksJson.tasks || []) as SheetTask[]);
      }
    } catch (e) {
      console.error('[BuildLifecycleTimeline] fetch error:', e);
      setError('Network error loading build state');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    setSavingId(taskId);
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, status: newStatus }),
      });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    } catch (e) {
      console.error('[BuildLifecycleTimeline] status change error:', e);
    } finally {
      setSavingId(null);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  if (loading) {
    return (
      <div style={{ padding: '20px 24px', borderRadius: 12, background: 'white', border: '1px solid #e2e8f0', marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Loading War Room…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '16px 24px', borderRadius: 12, background: 'white', border: '1px solid #fca5a5', marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#dc2626' }}>Build state unavailable: {error}</div>
      </div>
    );
  }

  const currentPhase = data.phases.find((p) => p.phase_number === data.current_phase_number);
  const pct = data.overall_pct_complete;

  // Group tasks by phase number (0-12) + cross-phase bucket (-1)
  function tasksForPhase(phaseNum: number): SheetTask[] {
    return tasks.filter(t => {
      const n = phaseNumFromString(t.phase);
      if (phaseNum === -1) return n < 0 || n > 12; // cross-phase bucket
      return n === phaseNum;
    });
  }

  return (
    <div style={{ padding: '0 0 20px' }}>
      <style>{`
        @keyframes pulseBorder {
          0%, 100% { box-shadow: 0 0 0 2px rgba(20,184,166,0.15); }
          50% { box-shadow: 0 0 0 4px rgba(20,184,166,0.30); }
        }
      `}</style>

      {/* Header card */}
      <div style={{
        background: 'white', borderRadius: 12, border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', padding: '16px 20px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#94a3b8', marginBottom: 2 }}>
            The Chart — BanyanOS Build Progress
          </div>
          {currentPhase && (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f766e' }}>
              Currently in Phase {currentPhase.phase_number}: {currentPhase.phase_name}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            Updated {new Date(data.last_updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', color: pct >= 75 ? '#059669' : pct >= 40 ? '#d97706' : '#94a3b8', lineHeight: 1 }}>
              {pct}%
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>complete</div>
          </div>
          <div style={{ width: 120 }}>
            <div style={{ height: 6, borderRadius: 3, background: '#f1f5f9' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: pct >= 75 ? '#059669' : pct >= 40 ? '#d97706' : '#14b8a6',
                width: `${pct}%`, transition: 'width 0.5s',
              }} />
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
              {data.phases.filter((p) => p.status === 'complete').length} of {data.phases.length} phases
            </div>
          </div>
        </div>
      </div>

      {/* Phase chip row */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap',
        padding: '12px 16px', background: 'white', borderRadius: 12,
        border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        {data.phases.map((phase) => (
          <PhaseChip
            key={phase.phase_number}
            phase={phase}
            isCurrent={phase.phase_number === data.current_phase_number}
            isExpanded={expandedPhase === phase.phase_number}
            onClick={() => setExpandedPhase(expandedPhase === phase.phase_number ? null : phase.phase_number)}
          />
        ))}
      </div>

      {/* Expanded command panel */}
      {expandedPhase !== null && (() => {
        const phase = data.phases.find((p) => p.phase_number === expandedPhase);
        if (!phase) return null;
        return (
          <PhaseCommandPanel
            phase={phase}
            tasks={tasksForPhase(expandedPhase)}
            onStatusChange={handleStatusChange}
            savingId={savingId}
            onTaskAdded={(task) => setTasks(prev => [task, ...prev])}
            onLogUpdated={(taskId, log) => setTasks(prev => prev.map(t => t.id === taskId ? { ...t, actionLog: log } : t))}
          />
        );
      })()}
    </div>
  );
}
