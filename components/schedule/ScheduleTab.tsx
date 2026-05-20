'use client';
/**
 * BAN-374 Scheduling Spine — Project Detail "Schedule" tab.
 *
 * Two views toggled at the top:
 *   - "List": collapsible phase sections with task tables, inline edit,
 *     mark-complete checkbox, dependency multi-select, add-phase / add-task
 *     modals.  Default view.
 *   - "Gantt": gantt-task-react bars + dependency arrows, drag-to-reschedule
 *     fires PATCH on the task, zoom toggle (Week/Month/Quarter), today
 *     marker visible.  See ScheduleGanttView for the Hawaii-overlay hooks.
 *
 * Permission gating is server-side (passScheduleReadGate / passScheduleWriteGate).
 * On the client, `canWrite` is passed in from the parent so add/edit/delete
 * controls hide for read-only roles.  The route layer will 403 anyway, but
 * hiding the buttons avoids dead UI.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusPill, type StatusPillVariant, EmptyState, Button } from '@/components/design-system';
import { CalendarDays, Plus, Trash2, Users } from 'lucide-react';
import ScheduleGanttView from './ScheduleGanttView';
import TaskResourceAssignmentDialog, {
  type ResourceUserOption,
} from './TaskResourceAssignmentDialog';
import UserScheduleView, { type UserScheduleAssignment } from './UserScheduleView';
import type { ScheduleTaskIsland } from '@/db';

type PhaseStatus = 'planned' | 'in_progress' | 'complete' | 'on_hold';
type TaskStatus = 'planned' | 'in_progress' | 'complete' | 'blocked' | 'on_hold';

export interface SchedulePhase {
  id: string;
  engagement_id: string;
  name: string;
  sort_order: number;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: PhaseStatus;
}

export interface ScheduleTask {
  id: string;
  phase_id: string;
  engagement_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  planned_start: string | null;
  planned_end: string | null;
  planned_duration_days: number | null;
  actual_start: string | null;
  actual_end: string | null;
  percent_complete: number;
  status: TaskStatus;
  assigned_to_user_id: string | null;
  task_island?: ScheduleTaskIsland | null;
  duration_with_travel_factor?: string | number | null;
}

export interface ScheduleDependency {
  id: string;
  predecessor_task_id: string;
  successor_task_id: string;
  type: string;
  lag_days: number;
}

export interface ScheduleMilestone {
  id: string;
  engagement_id: string;
  name: string;
  type: string;
  planned_date: string | null;
  actual_date: string | null;
  status: string;
  milestone_kind: 'standard' | 'permit' | 'inspection' | 'gc_clearance' | 'matson_freight';
  permit_authority: string | null;
  permit_application_date: string | null;
  permit_estimated_approval_date: string | null;
  permit_actual_approval_date: string | null;
}

export interface FreightCalendarEntry {
  freight_calendar_id: string;
  carrier: string;
  route: string;
  sailing_date: string;
  arrival_date: string;
  cutoff_date: string;
  notes: string | null;
  deleted_at: string | null;
}

const STATUS_VARIANT: Record<TaskStatus, StatusPillVariant> = {
  planned: 'info',
  in_progress: 'warn',
  complete: 'success',
  blocked: 'error',
  on_hold: 'info',
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  complete: 'Complete',
  blocked: 'Blocked',
  on_hold: 'On Hold',
};

function fmtDate(s: string | null): string {
  if (!s) return '—';
  // Already YYYY-MM-DD from Postgres `date` columns; render without TZ
  // shifts by parsing the date parts directly.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

interface Props {
  kID: string;
  canWrite: boolean;
  projectIsland: ScheduleTaskIsland;
}

export interface TaskResourceSummary {
  task_resource_id: string;
  schedule_task_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  role_on_task: string | null;
  allocation_percent: number;
}

export default function ScheduleTab({ kID, canWrite, projectIsland }: Props) {
  const [view, setView] = useState<'list' | 'gantt' | 'crew'>('list');
  const [phases, setPhases] = useState<SchedulePhase[]>([]);
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [deps, setDeps] = useState<ScheduleDependency[]>([]);
  const [milestones, setMilestones] = useState<ScheduleMilestone[]>([]);
  const [freight, setFreight] = useState<FreightCalendarEntry[]>([]);
  const [resourcesByTask, setResourcesByTask] = useState<Map<string, TaskResourceSummary[]>>(new Map());
  const [userPool, setUserPool] = useState<ResourceUserOption[]>([]);
  const [resourceDialogTaskId, setResourceDialogTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [kIDFound, setKIDFound] = useState<boolean>(true);

  // BAN-374 P4 — Hawaii overlay toggles.  Default ON for the master toggle
  // (Kula Glass is a Hawaii tenant); freight defaults OFF for non-Hawaii
  // projects per spec §D2.
  const [showHawaiiOverlays, setShowHawaiiOverlays] = useState(true);
  const [showTravelFactor, setShowTravelFactor] = useState(true);
  const [showPermits, setShowPermits] = useState(true);
  const [showFreight, setShowFreight] = useState<boolean>(() => projectIsland !== 'unknown');

  // Modal/edit state
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [addTaskForPhase, setAddTaskForPhase] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // BAN-374 P6 — Permit milestone add (Hawaii overlay; requires canWrite +
  // master Hawaii toggle + permits sub-toggle).
  const [showAddPermit, setShowAddPermit] = useState(false);

  const fetchResourcesForTasks = useCallback(async (taskIds: string[]) => {
    if (taskIds.length === 0) {
      setResourcesByTask(new Map());
      return;
    }
    const results = await Promise.all(
      taskIds.map(async (id): Promise<[string, TaskResourceSummary[]]> => {
        try {
          const res = await fetch(`/api/schedule/tasks/${id}/resources`);
          if (!res.ok) return [id, []];
          const j = await res.json();
          const active = ((j.items as TaskResourceSummary[] | undefined) ?? []).filter(
            (r) => !(r as unknown as { removed_at?: string | null }).removed_at,
          );
          return [id, active];
        } catch {
          return [id, []];
        }
      }),
    );
    const map = new Map<string, TaskResourceSummary[]>();
    for (const [id, rows] of results) map.set(id, rows);
    setResourcesByTask(map);
  }, []);

  const fetchUserPool = useCallback(async () => {
    try {
      const res = await fetch('/api/schedule/resources/users-pool');
      if (!res.ok) return;
      const j = await res.json();
      setUserPool(j.items || []);
    } catch {
      /* non-fatal — dialog will show empty dropdown */
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [phRes, tkRes, dpRes, msRes, frRes] = await Promise.all([
        fetch(`/api/schedule/phases?engagement_kid=${encodeURIComponent(kID)}`),
        fetch(`/api/schedule/tasks?engagement_kid=${encodeURIComponent(kID)}`),
        fetch(`/api/schedule/dependencies?engagement_kid=${encodeURIComponent(kID)}`),
        fetch(`/api/schedule/milestones?engagement_kid=${encodeURIComponent(kID)}`),
        fetch(`/api/schedule/freight-calendar`),
      ]);
      const phJ = await phRes.json();
      const tkJ = await tkRes.json();
      const dpJ = await dpRes.json();
      const msJ = msRes.ok ? await msRes.json() : { items: [] };
      const frJ = frRes.ok ? await frRes.json() : { items: [] };
      if (!phRes.ok) throw new Error(phJ.error || `HTTP ${phRes.status}`);
      setKIDFound(phJ.kIDFound !== false);
      setPhases(phJ.items || []);
      setTasks(tkJ.items || []);
      setDeps(dpJ.items || []);
      setMilestones(msJ.items || []);
      setFreight(frJ.items || []);
      const taskIds = (tkJ.items as ScheduleTask[] | undefined ?? []).map((t) => t.id);
      await Promise.all([fetchResourcesForTasks(taskIds), fetchUserPool()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kID, fetchResourcesForTasks, fetchUserPool]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const tasksByPhase = useMemo(() => {
    const m = new Map<string, ScheduleTask[]>();
    for (const t of tasks) {
      const arr = m.get(t.phase_id) ?? [];
      arr.push(t);
      m.set(t.phase_id, arr);
    }
    for (const [, arr] of m) {
      arr.sort((a, b) => a.sort_order - b.sort_order);
    }
    return m;
  }, [tasks]);

  const depsBySuccessor = useMemo(() => {
    const m = new Map<string, ScheduleDependency[]>();
    for (const d of deps) {
      const arr = m.get(d.successor_task_id) ?? [];
      arr.push(d);
      m.set(d.successor_task_id, arr);
    }
    return m;
  }, [deps]);

  const crewAssignments = useMemo<UserScheduleAssignment[]>(() => {
    const out: UserScheduleAssignment[] = [];
    for (const [, rows] of resourcesByTask) {
      for (const r of rows) {
        out.push({
          task_resource_id: r.task_resource_id,
          schedule_task_id: r.schedule_task_id,
          user_id: r.user_id,
          user_name: r.user_name,
          user_email: r.user_email,
          role_on_task: r.role_on_task,
          allocation_percent: r.allocation_percent,
        });
      }
    }
    return out;
  }, [resourcesByTask]);

  const dialogTask = useMemo(
    () => (resourceDialogTaskId ? tasks.find((t) => t.id === resourceDialogTaskId) ?? null : null),
    [resourceDialogTaskId, tasks],
  );

  const toggleCollapse = (phaseId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  const markTaskComplete = async (taskId: string, complete: boolean) => {
    if (!canWrite) return;
    const body = complete
      ? { status: 'complete' }
      : { status: 'in_progress', percent_complete: 50 };
    const res = await fetch(`/api/schedule/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) fetchAll();
  };

  const deleteTask = async (taskId: string) => {
    if (!canWrite) return;
    const res = await fetch(`/api/schedule/tasks/${taskId}`, { method: 'DELETE' });
    if (res.ok) fetchAll();
  };

  const deletePhase = async (phaseId: string) => {
    if (!canWrite) return;
    const res = await fetch(`/api/schedule/phases/${phaseId}`, { method: 'DELETE' });
    if (res.ok) fetchAll();
  };

  if (loading) {
    return <div data-bos-schedule-loading style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)' }}>Loading schedule…</div>;
  }
  if (err) {
    return <div data-bos-schedule-error style={{ padding: 24, color: 'var(--color-red-700)' }}>Schedule failed to load: {err}</div>;
  }
  if (!kIDFound) {
    return (
      <div data-bos-schedule-empty>
        <EmptyState
          icon={<CalendarDays size={32} strokeWidth={1.5} />}
          heading="No schedule data"
          body="This project hasn't been migrated to Postgres yet. The schedule will appear here once it is."
        />
      </div>
    );
  }

  return (
    <div data-bos-schedule-tab style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* View toggle + add-phase button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div data-bos-schedule-view-toggle role="tablist" style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 10 }}>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'list'}
            data-bos-schedule-view="list"
            onClick={() => setView('list')}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: view === 'list' ? 'white' : 'transparent',
              color: view === 'list' ? 'var(--color-ink-primary)' : 'var(--bos-color-ink-disabled)',
              boxShadow: view === 'list' ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
            }}
          >
            List
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'gantt'}
            data-bos-schedule-view="gantt"
            onClick={() => setView('gantt')}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: view === 'gantt' ? 'white' : 'transparent',
              color: view === 'gantt' ? 'var(--color-ink-primary)' : 'var(--bos-color-ink-disabled)',
              boxShadow: view === 'gantt' ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
            }}
          >
            Gantt
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'crew'}
            data-bos-schedule-view="crew"
            onClick={() => setView('crew')}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: view === 'crew' ? 'white' : 'transparent',
              color: view === 'crew' ? 'var(--color-ink-primary)' : 'var(--bos-color-ink-disabled)',
              boxShadow: view === 'crew' ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
            }}
          >
            Crew
          </button>
        </div>
        {canWrite ? (
          <Button data-bos-schedule-add-phase variant="primary" onClick={() => setShowAddPhase(true)}>
            <Plus size={14} strokeWidth={2} /> Add Phase
          </Button>
        ) : null}
      </div>

      {view === 'gantt' ? (
        <>
          <HawaiiOverlayToggles
            showMaster={showHawaiiOverlays}
            onChangeMaster={setShowHawaiiOverlays}
            showTravelFactor={showTravelFactor}
            onChangeTravelFactor={setShowTravelFactor}
            showPermits={showPermits}
            onChangePermits={setShowPermits}
            showFreight={showFreight}
            onChangeFreight={setShowFreight}
          />
          {canWrite && showHawaiiOverlays && showPermits ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                data-bos-add-permit-milestone
                variant="secondary"
                onClick={() => setShowAddPermit(true)}
              >
                <Plus size={14} strokeWidth={2} /> Add Permit Milestone
              </Button>
            </div>
          ) : null}
          <ScheduleGanttView
            phases={phases}
            tasks={tasks}
            dependencies={deps}
            canWrite={canWrite}
            milestones={milestones}
            freightCalendar={freight}
            resourcesByTask={resourcesByTask}
            projectIsland={projectIsland}
            showTravelFactor={showHawaiiOverlays && showTravelFactor}
            showPermits={showHawaiiOverlays && showPermits}
            showFreight={showHawaiiOverlays && showFreight}
            onTaskReschedule={async (taskId, start, end) => {
              if (!canWrite) return;
              const res = await fetch(`/api/schedule/tasks/${taskId}`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ planned_start: start, planned_end: end }),
              });
              if (res.ok) fetchAll();
            }}
            onTaskProgress={async (taskId, percent) => {
              if (!canWrite) return;
              const res = await fetch(`/api/schedule/tasks/${taskId}`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ percent_complete: percent }),
              });
              if (res.ok) fetchAll();
            }}
          />
        </>
      ) : view === 'crew' ? (
        <UserScheduleView
          tasks={tasks}
          assignments={crewAssignments}
          onDrillToTask={(taskId) => {
            setView('list');
            setResourceDialogTaskId(taskId);
          }}
        />
      ) : (
        <ListView
          phases={phases}
          tasksByPhase={tasksByPhase}
          depsBySuccessor={depsBySuccessor}
          allTasks={tasks}
          canWrite={canWrite}
          collapsed={collapsed}
          editingTaskId={editingTaskId}
          resourcesByTask={resourcesByTask}
          onToggleCollapse={toggleCollapse}
          onAddTask={(phaseId) => setAddTaskForPhase(phaseId)}
          onMarkComplete={markTaskComplete}
          onDeleteTask={deleteTask}
          onDeletePhase={deletePhase}
          onEditTask={(taskId) => setEditingTaskId(taskId)}
          onOpenResources={(taskId) => setResourceDialogTaskId(taskId)}
          onSavedTask={() => { setEditingTaskId(null); fetchAll(); }}
          onCancelEdit={() => setEditingTaskId(null)}
        />
      )}

      {showAddPhase && canWrite ? (
        <AddPhaseModal
          kID={kID}
          nextSortOrder={phases.length}
          onClose={() => setShowAddPhase(false)}
          onCreated={() => { setShowAddPhase(false); fetchAll(); }}
        />
      ) : null}

      {addTaskForPhase && canWrite ? (
        <AddTaskModal
          phaseId={addTaskForPhase}
          nextSortOrder={tasksByPhase.get(addTaskForPhase)?.length ?? 0}
          onClose={() => setAddTaskForPhase(null)}
          onCreated={() => { setAddTaskForPhase(null); fetchAll(); }}
        />
      ) : null}

      {dialogTask ? (
        <TaskResourceAssignmentDialog
          taskId={dialogTask.id}
          taskName={dialogTask.name}
          users={userPool}
          canWrite={canWrite}
          onClose={() => setResourceDialogTaskId(null)}
          onChanged={() => { void fetchResourcesForTasks(tasks.map((t) => t.id)); }}
        />
      ) : null}

      {showAddPermit && canWrite ? (
        <AddPermitMilestoneModal
          kID={kID}
          onClose={() => setShowAddPermit(false)}
          onCreated={() => { setShowAddPermit(false); fetchAll(); }}
        />
      ) : null}
    </div>
  );
}

// ─── List View ──────────────────────────────────────────────────────────────

interface ListViewProps {
  phases: SchedulePhase[];
  tasksByPhase: Map<string, ScheduleTask[]>;
  depsBySuccessor: Map<string, ScheduleDependency[]>;
  allTasks: ScheduleTask[];
  canWrite: boolean;
  collapsed: Set<string>;
  editingTaskId: string | null;
  resourcesByTask: Map<string, TaskResourceSummary[]>;
  onToggleCollapse: (phaseId: string) => void;
  onAddTask: (phaseId: string) => void;
  onMarkComplete: (taskId: string, complete: boolean) => void;
  onDeleteTask: (taskId: string) => void;
  onDeletePhase: (phaseId: string) => void;
  onEditTask: (taskId: string) => void;
  onOpenResources: (taskId: string) => void;
  onSavedTask: () => void;
  onCancelEdit: () => void;
}

function ListView({
  phases,
  tasksByPhase,
  depsBySuccessor,
  allTasks,
  canWrite,
  collapsed,
  editingTaskId,
  resourcesByTask,
  onToggleCollapse,
  onAddTask,
  onMarkComplete,
  onDeleteTask,
  onDeletePhase,
  onEditTask,
  onOpenResources,
  onSavedTask,
  onCancelEdit,
}: ListViewProps) {
  if (phases.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays size={32} strokeWidth={1.5} />}
        heading="No phases yet"
        body={canWrite
          ? 'Add a phase to start building this project schedule.'
          : 'No schedule has been set up for this project yet.'}
      />
    );
  }

  return (
    <div data-bos-schedule-list style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {phases.map((phase) => {
        const tasks = tasksByPhase.get(phase.id) ?? [];
        const isCollapsed = collapsed.has(phase.id);
        return (
          <section
            key={phase.id}
            data-bos-schedule-phase={phase.id}
            style={{ background: 'white', borderRadius: 12, border: '1px solid var(--color-surface-border)', overflow: 'hidden' }}
          >
            <header
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 18px', borderBottom: isCollapsed ? 'none' : '1px solid #f1f5f9',
                cursor: 'pointer',
              }}
              onClick={() => onToggleCollapse(phase.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span data-bos-collapse-icon aria-hidden style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 11 }}>
                  {isCollapsed ? '▶' : '▼'}
                </span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-ink-primary)' }}>{phase.name}</h3>
                <StatusPill variant={STATUS_VARIANT[phase.status as TaskStatus] ?? 'info'}>
                  {STATUS_LABEL[phase.status as TaskStatus] ?? phase.status}
                </StatusPill>
                <span style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>
                  {fmtDate(phase.planned_start)} → {fmtDate(phase.planned_end)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)', fontWeight: 600 }}>
                  {tasks.length} task{tasks.length === 1 ? '' : 's'}
                </span>
              </div>
              {canWrite ? (
                <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <Button
                    data-bos-schedule-add-task
                    variant="secondary"
                    onClick={() => onAddTask(phase.id)}
                  >
                    <Plus size={12} strokeWidth={2} /> Add Task
                  </Button>
                  <Button
                    data-bos-schedule-delete-phase
                    variant="secondary"
                    onClick={() => onDeletePhase(phase.id)}
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </Button>
                </div>
              ) : null}
            </header>

            {isCollapsed ? null : (
              <div data-bos-schedule-tasks style={{ padding: '6px 0' }}>
                {tasks.length === 0 ? (
                  <p style={{ padding: '14px 18px', margin: 0, fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>
                    No tasks in this phase yet.
                  </p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: 'var(--bos-color-ink-tertiary)', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <th style={{ padding: '6px 18px', fontWeight: 700, width: 32 }}>Done</th>
                        <th style={{ padding: '6px 12px', fontWeight: 700 }}>Task</th>
                        <th style={{ padding: '6px 12px', fontWeight: 700 }}>Status</th>
                        <th style={{ padding: '6px 12px', fontWeight: 700 }}>Planned</th>
                        <th style={{ padding: '6px 12px', fontWeight: 700 }}>Actual</th>
                        <th style={{ padding: '6px 12px', fontWeight: 700 }}>% Complete</th>
                        <th style={{ padding: '6px 12px', fontWeight: 700 }}>Deps</th>
                        <th style={{ padding: '6px 12px', fontWeight: 700 }}>Resources</th>
                        {canWrite ? <th style={{ padding: '6px 12px', width: 40 }} /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((task) => (
                        editingTaskId === task.id ? (
                          <EditTaskRow
                            key={task.id}
                            task={task}
                            allTasks={allTasks}
                            currentDeps={depsBySuccessor.get(task.id) ?? []}
                            canWrite={canWrite}
                            onSaved={onSavedTask}
                            onCancel={onCancelEdit}
                          />
                        ) : (
                          <tr
                            key={task.id}
                            data-bos-schedule-task={task.id}
                            style={{ borderTop: '1px solid #f1f5f9', cursor: canWrite ? 'pointer' : 'default' }}
                            onClick={() => canWrite && onEditTask(task.id)}
                          >
                            <td style={{ padding: '8px 18px' }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                data-bos-task-complete-checkbox
                                checked={task.status === 'complete'}
                                disabled={!canWrite}
                                onChange={(e) => onMarkComplete(task.id, e.target.checked)}
                              />
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--color-ink-primary)', fontWeight: 600 }}>
                              {task.name}
                              {task.description ? (
                                <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', fontWeight: 400, marginTop: 2 }}>
                                  {task.description}
                                </div>
                              ) : null}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <StatusPill variant={STATUS_VARIANT[task.status]}>
                                {STATUS_LABEL[task.status]}
                              </StatusPill>
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--bos-color-ink-disabled)' }}>
                              {fmtDate(task.planned_start)} → {fmtDate(task.planned_end)}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--bos-color-ink-disabled)' }}>
                              {fmtDate(task.actual_start)} → {fmtDate(task.actual_end)}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--color-ink-primary)', fontWeight: 600 }}>
                              {task.percent_complete}%
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--bos-color-ink-disabled)' }}>
                              {(depsBySuccessor.get(task.id) ?? []).length}
                            </td>
                            <td
                              data-bos-task-resources={task.id}
                              style={{ padding: '8px 12px', color: 'var(--bos-color-ink-disabled)', cursor: 'pointer' }}
                              onClick={(e) => { e.stopPropagation(); onOpenResources(task.id); }}
                            >
                              <ResourcesCell rows={resourcesByTask.get(task.id) ?? []} />
                            </td>
                            {canWrite ? (
                              <td style={{ padding: '8px 12px' }} onClick={(e) => e.stopPropagation()}>
                                <button
                                  data-bos-task-delete
                                  type="button"
                                  onClick={() => onDeleteTask(task.id)}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--bos-color-ink-tertiary)', cursor: 'pointer' }}
                                  aria-label="Delete task"
                                >
                                  <Trash2 size={12} strokeWidth={2} />
                                </button>
                              </td>
                            ) : null}
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ─── Add Phase Modal ────────────────────────────────────────────────────────

function AddPhaseModal({
  kID,
  nextSortOrder,
  onClose,
  onCreated,
}: {
  kID: string;
  nextSortOrder: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setErr('Name is required');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch('/api/schedule/phases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          engagement_kid: kID,
          name: name.trim(),
          sort_order: nextSortOrder,
          planned_start: plannedStart || null,
          planned_end: plannedEnd || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Add Phase" onClose={onClose}>
      <FormRow label="Name">
        <input
          data-bos-add-phase-name
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          style={inputStyle}
        />
      </FormRow>
      <FormRow label="Planned start">
        <input
          data-bos-add-phase-start
          type="date"
          value={plannedStart}
          onChange={(e) => setPlannedStart(e.target.value)}
          style={inputStyle}
        />
      </FormRow>
      <FormRow label="Planned end">
        <input
          data-bos-add-phase-end
          type="date"
          value={plannedEnd}
          onChange={(e) => setPlannedEnd(e.target.value)}
          style={inputStyle}
        />
      </FormRow>
      {err ? <p style={{ color: 'var(--color-red-700)', fontSize: 12, margin: '8px 0 0' }}>{err}</p> : null}
      <div style={modalFooterStyle}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          data-bos-add-phase-submit
          variant="primary"
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? 'Saving…' : 'Add Phase'}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Add Task Modal ─────────────────────────────────────────────────────────

function AddTaskModal({
  phaseId,
  nextSortOrder,
  onClose,
  onCreated,
}: {
  phaseId: string;
  nextSortOrder: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setErr('Name is required');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch('/api/schedule/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phase_id: phaseId,
          name: name.trim(),
          description: description.trim() || null,
          sort_order: nextSortOrder,
          planned_start: plannedStart || null,
          planned_end: plannedEnd || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Add Task" onClose={onClose}>
      <FormRow label="Name">
        <input
          data-bos-add-task-name
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          style={inputStyle}
        />
      </FormRow>
      <FormRow label="Description">
        <textarea
          data-bos-add-task-description
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </FormRow>
      <FormRow label="Planned start">
        <input
          data-bos-add-task-start
          type="date"
          value={plannedStart}
          onChange={(e) => setPlannedStart(e.target.value)}
          style={inputStyle}
        />
      </FormRow>
      <FormRow label="Planned end">
        <input
          data-bos-add-task-end
          type="date"
          value={plannedEnd}
          onChange={(e) => setPlannedEnd(e.target.value)}
          style={inputStyle}
        />
      </FormRow>
      {err ? <p style={{ color: 'var(--color-red-700)', fontSize: 12, margin: '8px 0 0' }}>{err}</p> : null}
      <div style={modalFooterStyle}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          data-bos-add-task-submit
          variant="primary"
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? 'Saving…' : 'Add Task'}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Add Permit Milestone Modal (BAN-374 P6) ────────────────────────────────
// Surfaces the Hawaii permit overlay's write-side once milestone POST accepts
// milestone_kind + permit_* fields.  Kind is locked to 'permit'; type is also
// 'permit' so the milestone is included in any type-filtered downstream view
// alongside the kind-filtered Hawaii overlay.

function AddPermitMilestoneModal({
  kID,
  onClose,
  onCreated,
}: {
  kID: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [authority, setAuthority] = useState('');
  const [applicationDate, setApplicationDate] = useState('');
  const [estimatedDate, setEstimatedDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setErr('Name is required');
      return;
    }
    if (!plannedDate) {
      setErr('Planned date is required');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch('/api/schedule/milestones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          engagement_kid: kID,
          name: name.trim(),
          type: 'permit',
          milestone_kind: 'permit',
          planned_date: plannedDate,
          permit_authority: authority.trim() || null,
          permit_application_date: applicationDate || null,
          permit_estimated_approval_date: estimatedDate || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Add Permit Milestone" onClose={onClose}>
      <FormRow label="Name">
        <input
          data-bos-add-permit-name
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          style={inputStyle}
        />
      </FormRow>
      <FormRow label="Planned date">
        <input
          data-bos-add-permit-planned
          type="date"
          value={plannedDate}
          onChange={(e) => setPlannedDate(e.target.value)}
          style={inputStyle}
        />
      </FormRow>
      <FormRow label="Permit authority">
        <input
          data-bos-add-permit-authority
          type="text"
          placeholder="e.g. County of Maui DPW"
          value={authority}
          onChange={(e) => setAuthority(e.target.value)}
          style={inputStyle}
        />
      </FormRow>
      <FormRow label="Application date">
        <input
          data-bos-add-permit-application
          type="date"
          value={applicationDate}
          onChange={(e) => setApplicationDate(e.target.value)}
          style={inputStyle}
        />
      </FormRow>
      <FormRow label="Estimated approval date">
        <input
          data-bos-add-permit-estimated
          type="date"
          value={estimatedDate}
          onChange={(e) => setEstimatedDate(e.target.value)}
          style={inputStyle}
        />
      </FormRow>
      {err ? <p style={{ color: 'var(--color-red-700)', fontSize: 12, margin: '8px 0 0' }}>{err}</p> : null}
      <div style={modalFooterStyle}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          data-bos-add-permit-submit
          variant="primary"
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? 'Saving…' : 'Add Permit Milestone'}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Inline Task Edit Row ───────────────────────────────────────────────────

interface EditTaskRowProps {
  task: ScheduleTask;
  allTasks: ScheduleTask[];
  currentDeps: ScheduleDependency[];
  canWrite: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

function EditTaskRow({ task, allTasks, currentDeps, canWrite, onSaved, onCancel }: EditTaskRowProps) {
  const [name, setName] = useState(task.name);
  const [plannedStart, setPlannedStart] = useState(task.planned_start ?? '');
  const [plannedEnd, setPlannedEnd] = useState(task.planned_end ?? '');
  const [percentComplete, setPercentComplete] = useState(String(task.percent_complete));
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(
    new Set(currentDeps.map((d) => d.predecessor_task_id)),
  );
  const [saving, setSaving] = useState(false);

  const dependablePredecessors = useMemo(
    () => allTasks.filter((t) => t.id !== task.id && t.engagement_id === task.engagement_id),
    [allTasks, task.id, task.engagement_id],
  );

  const togglePredecessor = (predId: string) => {
    setSelectedDeps((prev) => {
      const next = new Set(prev);
      if (next.has(predId)) next.delete(predId);
      else next.add(predId);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      // 1. Patch the task fields
      const pc = Math.max(0, Math.min(100, Number.parseInt(percentComplete, 10) || 0));
      await fetch(`/api/schedule/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          planned_start: plannedStart || null,
          planned_end: plannedEnd || null,
          percent_complete: pc,
        }),
      });

      // 2. Reconcile dependencies (add new, remove removed)
      const currentSet = new Set(currentDeps.map((d) => d.predecessor_task_id));
      const toAdd = [...selectedDeps].filter((p) => !currentSet.has(p));
      const toRemoveIds = currentDeps
        .filter((d) => !selectedDeps.has(d.predecessor_task_id))
        .map((d) => d.id);
      for (const predId of toAdd) {
        await fetch('/api/schedule/dependencies', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            predecessor_task_id: predId,
            successor_task_id: task.id,
          }),
        });
      }
      for (const depId of toRemoveIds) {
        await fetch(`/api/schedule/dependencies/${depId}`, { method: 'DELETE' });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr data-bos-schedule-task-edit={task.id} style={{ background: 'var(--color-surface)', borderTop: '1px solid #f1f5f9' }}>
      <td colSpan={8} style={{ padding: '12px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
          <input
            data-bos-edit-task-name
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            placeholder="Task name"
          />
          <input
            data-bos-edit-task-start
            type="date"
            value={plannedStart}
            onChange={(e) => setPlannedStart(e.target.value)}
            style={inputStyle}
          />
          <input
            data-bos-edit-task-end
            type="date"
            value={plannedEnd}
            onChange={(e) => setPlannedEnd(e.target.value)}
            style={inputStyle}
          />
          <input
            data-bos-edit-task-pct
            type="number"
            min={0}
            max={100}
            value={percentComplete}
            onChange={(e) => setPercentComplete(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-disabled)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Depends on
          </div>
          <div data-bos-dependency-picker style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {dependablePredecessors.length === 0 ? (
              <span style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>No other tasks in this project yet.</span>
            ) : dependablePredecessors.map((pred) => {
              const checked = selectedDeps.has(pred.id);
              return (
                <label
                  key={pred.id}
                  data-bos-dependency-option={pred.id}
                  data-checked={checked}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                    border: '1px solid',
                    borderColor: checked ? 'var(--bos-color-brand-primary-deep)' : 'var(--color-surface-border)',
                    background: checked ? 'var(--color-teal-50)' : 'white',
                    color: checked ? 'var(--bos-color-brand-primary-deep)' : 'var(--bos-color-ink-tertiary)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePredecessor(pred.id)}
                    style={{ margin: 0 }}
                  />
                  {pred.name}
                </label>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button
            data-bos-edit-task-save
            variant="primary"
            disabled={saving || !canWrite}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Modal scaffolding ──────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      data-bos-schedule-modal
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white', borderRadius: 14, padding: 20, width: 420,
          maxWidth: 'calc(100vw - 32px)', boxShadow: '0 12px 40px rgba(15,23,42,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-ink-primary)' }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--bos-color-ink-tertiary)', fontSize: 18, cursor: 'pointer' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-disabled)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-surface-border)',
  fontSize: 13, color: 'var(--color-ink-primary)', background: 'white',
};

const modalFooterStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16,
  paddingTop: 12, borderTop: '1px solid #f1f5f9',
};

function ResourcesCell({ rows }: { rows: TaskResourceSummary[] }) {
  if (rows.length === 0) {
    return (
      <span data-bos-resources-cell-empty style={{ color: 'var(--bos-color-ink-tertiary)', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Users size={11} strokeWidth={2} /> Unassigned
      </span>
    );
  }
  const names = rows.map((r) => r.user_name ?? r.user_email ?? 'Unknown');
  const visible = names.slice(0, 3);
  const overflow = names.length - visible.length;
  return (
    <span data-bos-resources-cell style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Users size={11} strokeWidth={2} />
      <span>{visible.join(', ')}</span>
      {overflow > 0 ? (
        <span data-bos-resources-cell-overflow style={{ color: 'var(--bos-color-ink-tertiary)' }}>+{overflow} more</span>
      ) : null}
    </span>
  );
}

// Reference today's date to keep ESM tree-shake happy + ready for milestone work.
export { todayISO };

// ─── Hawaii Overlay Toggles (BAN-374 P4) ────────────────────────────────────

interface HawaiiOverlayTogglesProps {
  showMaster: boolean;
  onChangeMaster: (v: boolean) => void;
  showTravelFactor: boolean;
  onChangeTravelFactor: (v: boolean) => void;
  showPermits: boolean;
  onChangePermits: (v: boolean) => void;
  showFreight: boolean;
  onChangeFreight: (v: boolean) => void;
}

function HawaiiOverlayToggles({
  showMaster,
  onChangeMaster,
  showTravelFactor,
  onChangeTravelFactor,
  showPermits,
  onChangePermits,
  showFreight,
  onChangeFreight,
}: HawaiiOverlayTogglesProps) {
  return (
    <div data-bos-hawaii-overlay-toggles style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 10, border: '1px solid var(--color-surface-border)',
      fontSize: 11, color: 'var(--bos-color-ink-tertiary)',
    }}>
      <label
        data-bos-overlay-toggle="master"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--color-ink-primary)' }}
        title="Toggle the Hawaii overlay group (inter-island travel, permits, Matson schedule)"
      >
        <input
          type="checkbox"
          checked={showMaster}
          onChange={(e) => onChangeMaster(e.target.checked)}
          data-bos-overlay-toggle-input="master"
        />
        Show Hawaii overlays
      </label>
      <span style={{ color: '#cbd5e1' }}>|</span>
      <label
        data-bos-overlay-toggle="travel-factor"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: showMaster ? 1 : 0.5 }}
        title="Inflate outer-island task durations by the tenant's travel factor (default 1.15×)"
      >
        <input
          type="checkbox"
          checked={showTravelFactor}
          disabled={!showMaster}
          onChange={(e) => onChangeTravelFactor(e.target.checked)}
          data-bos-overlay-toggle-input="travel-factor"
        />
        Inter-island travel
      </label>
      <label
        data-bos-overlay-toggle="permits"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: showMaster ? 1 : 0.5 }}
        title="Show permit milestones as a colored band above the Gantt"
      >
        <input
          type="checkbox"
          checked={showPermits}
          disabled={!showMaster}
          onChange={(e) => onChangePermits(e.target.checked)}
          data-bos-overlay-toggle-input="permits"
        />
        Permit timeline
      </label>
      <label
        data-bos-overlay-toggle="freight"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: showMaster ? 1 : 0.5 }}
        title="Show Matson sailing / arrival / cutoff dates below the Gantt"
      >
        <input
          type="checkbox"
          checked={showFreight}
          disabled={!showMaster}
          onChange={(e) => onChangeFreight(e.target.checked)}
          data-bos-overlay-toggle-input="freight"
        />
        Matson schedule
      </label>
    </div>
  );
}
