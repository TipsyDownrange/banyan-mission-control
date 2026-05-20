'use client';
/**
 * BAN-374 Scheduling Spine — Gantt view.
 *
 * P3 wired one bar per schedule_tasks row with dependency arrows; P4 layers
 * the three Hawaii overlays previously stubbed in HAWAII_OVERLAY_HOOKS:
 *
 *   1. Inter-island travel factor (lib/schedule/hawaii-overlays.ts) inflates
 *      outer-island task durations by 1.15× (configurable per tenant) and
 *      decorates the bar with a "+travel" suffix + lighter shade.
 *   2. Permit timeline overlay — translucent band rendered ABOVE the Gantt
 *      from schedule_milestones rows where milestone_kind = 'permit'.  Band
 *      color encodes status: yellow (pending), green (approved), red (overdue).
 *   3. Matson freight calendar overlay — SVG markers rendered BELOW the
 *      Gantt: hash at sailing_date, container icon at arrival_date, dashed
 *      vertical at cutoff_date.
 *
 * Each overlay is gated by its own boolean prop; ScheduleTab owns the
 * sub-toggle UI.  When all three are off the component degrades back to
 * the P3 baseline render.
 */

import { useMemo, useState } from 'react';
import { Gantt, ViewMode, type Task } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import type {
  SchedulePhase,
  ScheduleTask,
  ScheduleDependency,
  ScheduleMilestone,
  FreightCalendarEntry,
  TaskResourceSummary,
} from './ScheduleTab';
import {
  applyTravelFactorToTasks,
  type TenantOverlayConfig,
  type TravelEnrichedTask,
  formatTravelTooltip,
} from '@/lib/schedule/hawaii-overlays';
import type { ScheduleTaskIsland } from '@/db';

const STATUS_COLORS: Record<ScheduleTask['status'], string> = {
  planned: '#1e3a8a',       // navy
  in_progress: '#d97706',   // amber
  complete: '#059669',      // green
  blocked: '#dc2626',       // red
  on_hold: 'var(--bos-color-ink-disabled)',       // gray
};

const STATUS_PROGRESS_COLORS: Record<ScheduleTask['status'], string> = {
  planned: '#3b82f6',
  in_progress: '#f59e0b',
  complete: '#10b981',
  blocked: '#ef4444',
  on_hold: 'var(--bos-color-ink-tertiary)',
};

// Outer-island bars are rendered with a chevron-suggestive lighter shade so
// the reader can spot at a glance that the bar's duration has been inflated.
const OUTER_ISLAND_COLORS: Record<ScheduleTask['status'], string> = {
  planned: '#3b5cb8',
  in_progress: '#f59e0b',
  complete: '#10b981',
  blocked: '#ef4444',
  on_hold: 'var(--bos-color-ink-tertiary)',
};

type ZoomMode = 'Week' | 'Month' | 'Quarter';

function zoomToViewMode(z: ZoomMode): ViewMode {
  if (z === 'Week') return ViewMode.Week;
  if (z === 'Month') return ViewMode.Month;
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

function todayISO(): string {
  return isoDateFromDate(new Date());
}

interface Props {
  phases: SchedulePhase[];
  tasks: ScheduleTask[];
  dependencies: ScheduleDependency[];
  canWrite: boolean;
  onTaskReschedule: (taskId: string, plannedStart: string, plannedEnd: string) => Promise<void> | void;
  onTaskProgress: (taskId: string, percent: number) => Promise<void> | void;
  // BAN-374 P4 Hawaii overlays
  milestones?: ScheduleMilestone[];
  freightCalendar?: FreightCalendarEntry[];
  projectIsland?: ScheduleTaskIsland | null;
  tenantOverlayConfig?: TenantOverlayConfig;
  showTravelFactor?: boolean;
  showPermits?: boolean;
  showFreight?: boolean;
  // BAN-374 P5 — Crew assignments shown as initials beside each task bar.
  resourcesByTask?: Map<string, TaskResourceSummary[]>;
}

export default function ScheduleGanttView({
  phases,
  tasks,
  dependencies,
  canWrite,
  onTaskReschedule,
  onTaskProgress,
  milestones = [],
  freightCalendar = [],
  projectIsland = null,
  tenantOverlayConfig,
  showTravelFactor = false,
  showPermits = false,
  showFreight = false,
  resourcesByTask,
}: Props) {
  const [zoom, setZoom] = useState<ZoomMode>('Month');

  const enrichedTasks = useMemo<TravelEnrichedTask<ScheduleTask>[]>(
    () => applyTravelFactorToTasks(tasks, projectIsland, tenantOverlayConfig),
    [tasks, projectIsland, tenantOverlayConfig],
  );

  const ganttTasks = useMemo<Task[]>(() => {
    if (tasks.length === 0 && phases.length === 0) return [];

    const today = new Date();
    const fallbackStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const fallbackEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);

    const out: Task[] = [];

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
          backgroundColor: 'var(--color-ink-primary)',
          backgroundSelectedColor: 'var(--color-ink-primary)',
          progressColor: '#1e293b',
          progressSelectedColor: '#1e293b',
        },
        isDisabled: true,
        hideChildren: false,
      });
    }

    const depsByTaskId = new Map<string, ScheduleDependency[]>();
    for (const d of dependencies) {
      const arr = depsByTaskId.get(d.successor_task_id) ?? [];
      arr.push(d);
      depsByTaskId.set(d.successor_task_id, arr);
    }

    for (const enriched of enrichedTasks) {
      const t: ScheduleTask = enriched.task;
      const start = parseISODate(t.planned_start, fallbackStart);
      let end = parseISODate(t.planned_end, fallbackEnd);
      if (showTravelFactor && enriched.isOuterIsland && enriched.adjustedDurationDays != null && enriched.baseDurationDays != null) {
        const extraDays = Math.ceil(enriched.adjustedDurationDays - enriched.baseDurationDays);
        if (extraDays > 0) {
          end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + extraDays);
        }
      }
      const taskDeps = (depsByTaskId.get(t.id) ?? []).map((d) => `task:${d.predecessor_task_id}`);
      const useTravelStyle = showTravelFactor && enriched.isOuterIsland;
      const barColor = useTravelStyle ? OUTER_ISLAND_COLORS[t.status] : STATUS_COLORS[t.status];
      const progressColor = STATUS_PROGRESS_COLORS[t.status];
      const resourceRows = resourcesByTask?.get(t.id) ?? [];
      const initials = resourceInitialsFromRows(resourceRows);
      const baseName = useTravelStyle ? `${t.name} +travel` : t.name;
      const displayName = initials ? `${baseName}  ${initials}` : baseName;
      out.push({
        id: `task:${t.id}`,
        type: 'task',
        name: displayName,
        start,
        end,
        progress: t.percent_complete,
        styles: {
          backgroundColor: barColor,
          backgroundSelectedColor: barColor,
          progressColor,
          progressSelectedColor: progressColor,
        },
        isDisabled: !canWrite,
        project: `phase:${t.phase_id}`,
        dependencies: taskDeps,
      });
    }

    return out;
  }, [phases, enrichedTasks, dependencies, canWrite, showTravelFactor, tasks.length]);

  const dateRange = useMemo(() => computeDateRange(phases, tasks), [phases, tasks]);

  const permitMilestones = useMemo(
    () => milestones.filter((m) => m.milestone_kind === 'permit'),
    [milestones],
  );

  const activeFreight = useMemo(
    () => (freightCalendar ?? []).filter((f) => !f.deleted_at),
    [freightCalendar],
  );

  if (ganttTasks.length === 0) {
    return (
      <div data-bos-schedule-gantt-empty style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)' }}>
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
              color: zoom === z ? 'var(--color-ink-primary)' : 'var(--bos-color-ink-disabled)',
              boxShadow: zoom === z ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
            }}
          >
            {z}
          </button>
        ))}
      </div>

      <div data-bos-gantt-chart style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 12, overflow: 'auto' }}>
        {showPermits && permitMilestones.length > 0 && dateRange ? (
          <PermitBand permits={permitMilestones} range={dateRange} />
        ) : null}

        <Gantt
          tasks={ganttTasks}
          viewMode={zoomToViewMode(zoom)}
          listCellWidth=""
          columnWidth={zoom === 'Quarter' ? 100 : zoom === 'Month' ? 80 : 60}
          headerHeight={42}
          rowHeight={32}
          barCornerRadius={4}
          arrowColor="var(--bos-color-ink-tertiary)"
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

        {showFreight && activeFreight.length > 0 && dateRange ? (
          <FreightStrip entries={activeFreight} range={dateRange} />
        ) : null}

        {showTravelFactor ? (
          <TravelFactorLegend enriched={enrichedTasks} />
        ) : null}

        {resourcesByTask && resourcesByTask.size > 0 ? (
          <ResourceLegend tasks={tasks} resourcesByTask={resourcesByTask} />
        ) : null}
      </div>
    </div>
  );
}

// ─── BAN-374 P5 — Resource initials / tooltip helpers ───────────────────────

function initialsForName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function resourceInitialsFromRows(rows: TaskResourceSummary[]): string {
  if (rows.length === 0) return '';
  const visible = rows
    .slice(0, 3)
    .map((r) => initialsForName(r.user_name ?? r.user_email ?? ''))
    .join('·');
  const overflow = rows.length - 3;
  return overflow > 0 ? `[${visible}+${overflow}]` : `[${visible}]`;
}

function ResourceLegend({
  tasks,
  resourcesByTask,
}: {
  tasks: ScheduleTask[];
  resourcesByTask: Map<string, TaskResourceSummary[]>;
}) {
  const tasksWithResources = tasks.filter((t) => (resourcesByTask.get(t.id) ?? []).length > 0);
  if (tasksWithResources.length === 0) return null;
  return (
    <div
      data-bos-gantt-resource-legend
      style={{
        marginTop: 12, padding: '8px 12px', background: '#f8fafc',
        borderRadius: 6, fontSize: 11, color: '#475569',
      }}
    >
      <strong style={{ display: 'block', marginBottom: 4, color: 'var(--color-ink-primary)' }}>Crew on bars</strong>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {tasksWithResources.map((t) => {
          const rows = resourcesByTask.get(t.id) ?? [];
          return (
            <li key={t.id} data-bos-gantt-resource-legend-row={t.id}>
              <strong>{t.name}</strong>:{' '}
              {rows
                .map((r) => `${r.user_name ?? r.user_email ?? 'Unknown'} (${r.role_on_task ?? 'crew'} · ${r.allocation_percent}%)`)
                .join(', ')}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Date-range helpers ─────────────────────────────────────────────────────

interface DateRange {
  startMs: number;
  endMs: number;
}

function computeDateRange(phases: SchedulePhase[], tasks: ScheduleTask[]): DateRange | null {
  let earliest: number | null = null;
  let latest: number | null = null;
  const consider = (iso: string | null) => {
    if (!iso) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return;
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (earliest == null || ms < earliest) earliest = ms;
    if (latest == null || ms > latest) latest = ms;
  };
  for (const p of phases) { consider(p.planned_start); consider(p.planned_end); }
  for (const t of tasks) { consider(t.planned_start); consider(t.planned_end); }
  if (earliest == null || latest == null) return null;
  if (latest <= earliest) latest = earliest + 86400000;
  return { startMs: earliest, endMs: latest };
}

function isoToMs(iso: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function posFraction(ms: number, range: DateRange): number {
  return Math.max(0, Math.min(1, (ms - range.startMs) / (range.endMs - range.startMs)));
}

// ─── Permit timeline band (ABOVE Gantt) ─────────────────────────────────────

function PermitBand({ permits, range }: { permits: ScheduleMilestone[]; range: DateRange }) {
  const todayMs = isoToMs(todayISO()) ?? Date.now();
  return (
    <div data-bos-permit-band style={{ position: 'relative', marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--bos-color-ink-disabled)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        Permit Timeline
      </div>
      <svg width="100%" height={26} style={{ display: 'block' }} role="img" aria-label="Permit timeline">
        {permits.map((p) => {
          const appMs = isoToMs(p.permit_application_date);
          const estMs = isoToMs(p.permit_estimated_approval_date);
          const actMs = isoToMs(p.permit_actual_approval_date);
          if (appMs == null || estMs == null) return null;
          const x1 = posFraction(appMs, range) * 100;
          const x2 = posFraction(actMs ?? estMs, range) * 100;
          const w = Math.max(0.5, x2 - x1);
          const overdue = actMs == null && estMs < todayMs;
          const fill = actMs != null ? '#bbf7d0' : overdue ? '#fecaca' : '#fef9c3';
          const stroke = actMs != null ? '#15803d' : overdue ? '#b91c1c' : '#a16207';
          const titleText = `${p.permit_authority ?? 'Permit'} — applied ${p.permit_application_date}, ` +
            `est ${p.permit_estimated_approval_date}` +
            (actMs != null ? `, approved ${p.permit_actual_approval_date}` : overdue ? ' (overdue)' : '');
          return (
            <g key={p.id} data-bos-permit-band-entry={p.id} data-bos-permit-status={actMs != null ? 'approved' : overdue ? 'overdue' : 'pending'}>
              <rect
                x={`${x1}%`}
                y={4}
                width={`${w}%`}
                height={18}
                rx={3}
                ry={3}
                fill={fill}
                stroke={stroke}
                strokeWidth={1}
              >
                <title>{titleText}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Matson freight strip (BELOW Gantt) ─────────────────────────────────────

function FreightStrip({ entries, range }: { entries: FreightCalendarEntry[]; range: DateRange }) {
  return (
    <div data-bos-freight-strip style={{ position: 'relative', marginTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--bos-color-ink-disabled)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        Matson Schedule
      </div>
      <svg width="100%" height={28} style={{ display: 'block' }} role="img" aria-label="Matson freight schedule">
        {entries.map((entry) => {
          const sailMs = isoToMs(entry.sailing_date);
          const arrMs = isoToMs(entry.arrival_date);
          const cutMs = isoToMs(entry.cutoff_date);
          if (sailMs == null || arrMs == null || cutMs == null) return null;
          const xSail = posFraction(sailMs, range) * 100;
          const xArr = posFraction(arrMs, range) * 100;
          const xCut = posFraction(cutMs, range) * 100;
          const titleText = `${entry.carrier} ${entry.route}: cutoff ${entry.cutoff_date}, sail ${entry.sailing_date}, arrive ${entry.arrival_date}`;
          return (
            <g key={entry.freight_calendar_id} data-bos-freight-strip-entry={entry.freight_calendar_id}>
              <line
                x1={`${xCut}%`}
                y1={2}
                x2={`${xCut}%`}
                y2={24}
                stroke="#7c3aed"
                strokeWidth={1.5}
                strokeDasharray="3 2"
                data-bos-freight-cutoff
              >
                <title>{titleText}</title>
              </line>
              <line
                x1={`${xSail}%`}
                y1={4}
                x2={`${xSail}%`}
                y2={22}
                stroke="#0891b2"
                strokeWidth={2}
                data-bos-freight-sailing
              >
                <title>{titleText}</title>
              </line>
              <g data-bos-freight-arrival transform={`translate(0,12)`}>
                <circle cx={`${xArr}%`} cy={0} r={5} fill="#0891b2" />
                <text x={`${xArr}%`} y={2} fill="white" fontSize={8} textAnchor="middle" fontWeight={700}>
                  □
                  <title>{titleText}</title>
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Travel factor legend (BELOW Gantt) ─────────────────────────────────────

function TravelFactorLegend({ enriched }: { enriched: TravelEnrichedTask<ScheduleTask>[] }) {
  const outerIslandTasks = enriched.filter((e) => e.isOuterIsland);
  if (outerIslandTasks.length === 0) return null;
  return (
    <div data-bos-travel-factor-legend style={{ marginTop: 12, padding: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 11, color: '#1e3a8a' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        Inter-island travel factor applied to {outerIslandTasks.length} task{outerIslandTasks.length === 1 ? '' : 's'}
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc' }}>
        {outerIslandTasks.slice(0, 6).map((e) => {
          const tooltip = formatTravelTooltip(e);
          return (
            <li key={e.task.id} data-bos-travel-task={e.task.id}>
              {e.task.name} ({e.task.task_island ?? '—'}) — {tooltip ?? `factor ${e.travelFactor}`}
            </li>
          );
        })}
        {outerIslandTasks.length > 6 ? (
          <li>… and {outerIslandTasks.length - 6} more</li>
        ) : null}
      </ul>
    </div>
  );
}
