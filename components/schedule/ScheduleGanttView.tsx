'use client';
/**
 * BAN-374 Scheduling Spine — Gantt view (Packet 3).
 *
 * Wraps gantt-task-react with our schedule data model:
 *   - one task bar per schedule_tasks row
 *   - dependency arrows derived from schedule_dependencies (FS/SS/FF/SF)
 *   - color-coded by task status (planned/in_progress/complete/blocked/on_hold)
 *   - drag-to-reschedule fires onTaskReschedule (PATCH planned_start + planned_end)
 *   - drag the progress handle fires onTaskProgress (PATCH percent_complete)
 *   - Week / Month / Quarter zoom toggle, today marker visible
 *
 * Hawaii-specific overlay hooks (deferred to P4–P6):
 *   - Matson freight calendar overlay (P6)
 *   - Permit timeline highlighting (already supported via schedule_milestones)
 *   - Inter-island travel factor (P4)
 *
 * These overlays are intentionally not implemented yet; the hook points are
 * called out in HAWAII_OVERLAY_HOOKS below so a future packet can layer
 * them in without restructuring the component.
 */

import { useMemo, useState } from 'react';
import { Gantt, ViewMode, type Task } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import type { SchedulePhase, ScheduleTask, ScheduleDependency } from './ScheduleTab';

// HAWAII_OVERLAY_HOOKS (BAN-374 P3 → P4-P6):
//   - matsonFreightOverlay     (P6) — Matson sailing dates as colored bands
//   - permitTimelineOverlay    (P4) — milestone bars from schedule_milestones
//   - interIslandTravelFactor  (P4) — inflate task durations for off-Oahu work
// Each will receive (phases, tasks, milestones, dependencies) and return a
// transformed Task[] array.  None implemented in P3.

const STATUS_COLORS: Record<ScheduleTask['status'], string> = {
  planned: '#1e3a8a',       // navy
  in_progress: '#d97706',   // amber
  complete: '#059669',      // green
  blocked: '#dc2626',       // red
  on_hold: '#64748b',       // gray
};

const STATUS_PROGRESS_COLORS: Record<ScheduleTask['status'], string> = {
  planned: '#3b82f6',
  in_progress: '#f59e0b',
  complete: '#10b981',
  blocked: '#ef4444',
  on_hold: '#94a3b8',
};

type ZoomMode = 'Week' | 'Month' | 'Quarter';

function zoomToViewMode(z: ZoomMode): ViewMode {
  if (z === 'Week') return ViewMode.Week;
  if (z === 'Month') return ViewMode.Month;
  // gantt-task-react has no "Quarter" view; Month with wider columns is the
  // closest approximation.  The columnWidth styling option compensates.
  return ViewMode.Month;
}

function parseISODate(s: string | null, fallback: Date): Date {
  if (!s) return fallback;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return fallback;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isoDateFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface Props {
  phases: SchedulePhase[];
  tasks: ScheduleTask[];
  dependencies: ScheduleDependency[];
  canWrite: boolean;
  onTaskReschedule: (taskId: string, plannedStart: string, plannedEnd: string) => Promise<void> | void;
  onTaskProgress: (taskId: string, percent: number) => Promise<void> | void;
}

export default function ScheduleGanttView({
  phases,
  tasks,
  dependencies,
  canWrite,
  onTaskReschedule,
  onTaskProgress,
}: Props) {
  const [zoom, setZoom] = useState<ZoomMode>('Month');

  const ganttTasks = useMemo<Task[]>(() => {
    if (tasks.length === 0 && phases.length === 0) return [];

    const today = new Date();
    const fallbackStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const fallbackEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);

    const out: Task[] = [];

    // Phase bars (project-type) — these render above their child tasks.
    for (const phase of phases) {
      const start = parseISODate(phase.planned_start, fallbackStart);
      const end = parseISODate(phase.planned_end, fallbackEnd);
      out.push({
        id: `phase:${phase.id}`,
        type: 'project',
        name: phase.name,
        start,
        end,
        progress: 0,
        styles: {
          backgroundColor: '#0f172a',
          backgroundSelectedColor: '#0f172a',
          progressColor: '#1e293b',
          progressSelectedColor: '#1e293b',
        },
        isDisabled: true,
        hideChildren: false,
      });
    }

    // Task bars
    const depsByTaskId = new Map<string, ScheduleDependency[]>();
    for (const d of dependencies) {
      const arr = depsByTaskId.get(d.successor_task_id) ?? [];
      arr.push(d);
      depsByTaskId.set(d.successor_task_id, arr);
    }

    for (const t of tasks) {
      const start = parseISODate(t.planned_start, fallbackStart);
      const end = parseISODate(t.planned_end, fallbackEnd);
      const taskDeps = (depsByTaskId.get(t.id) ?? []).map((d) => `task:${d.predecessor_task_id}`);
      out.push({
        id: `task:${t.id}`,
        type: 'task',
        name: t.name,
        start,
        end,
        progress: t.percent_complete,
        styles: {
          backgroundColor: STATUS_COLORS[t.status],
          backgroundSelectedColor: STATUS_COLORS[t.status],
          progressColor: STATUS_PROGRESS_COLORS[t.status],
          progressSelectedColor: STATUS_PROGRESS_COLORS[t.status],
        },
        isDisabled: !canWrite,
        project: `phase:${t.phase_id}`,
        dependencies: taskDeps,
      });
    }

    return out;
  }, [phases, tasks, dependencies, canWrite]);

  if (ganttTasks.length === 0) {
    return (
      <div data-bos-schedule-gantt-empty style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
        No phases or tasks to chart yet.
      </div>
    );
  }

  return (
    <div data-bos-schedule-gantt style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div data-bos-gantt-zoom role="tablist" style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 10, alignSelf: 'flex-end' }}>
        {(['Week', 'Month', 'Quarter'] as const).map((z) => (
          <button
            key={z}
            type="button"
            role="tab"
            aria-selected={zoom === z}
            data-bos-gantt-zoom-option={z}
            onClick={() => setZoom(z)}
            style={{
              padding: '4px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 700,
              background: zoom === z ? 'white' : 'transparent',
              color: zoom === z ? '#0f172a' : '#64748b',
              boxShadow: zoom === z ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
            }}
          >
            {z}
          </button>
        ))}
      </div>
      <div data-bos-gantt-chart style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 12, overflow: 'auto' }}>
        <Gantt
          tasks={ganttTasks}
          viewMode={zoomToViewMode(zoom)}
          listCellWidth=""
          columnWidth={zoom === 'Quarter' ? 100 : zoom === 'Month' ? 80 : 60}
          headerHeight={42}
          rowHeight={32}
          barCornerRadius={4}
          arrowColor="#94a3b8"
          fontFamily="inherit"
          fontSize="12"
          onDateChange={(task) => {
            if (!canWrite) return false;
            if (!task.id.startsWith('task:')) return false;
            const id = task.id.slice('task:'.length);
            const start = isoDateFromDate(task.start);
            const end = isoDateFromDate(task.end);
            void onTaskReschedule(id, start, end);
            return true;
          }}
          onProgressChange={(task) => {
            if (!canWrite) return false;
            if (!task.id.startsWith('task:')) return false;
            const id = task.id.slice('task:'.length);
            void onTaskProgress(id, Math.max(0, Math.min(100, Math.round(task.progress))));
            return true;
          }}
        />
      </div>
    </div>
  );
}
