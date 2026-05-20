'use client';
/**
 * BAN-374 P5 — User schedule view (read-only).
 *
 * Selectable from ScheduleTab's header tabs (not default).  Shows users on
 * the Y-axis and the project date range on the X-axis, with task
 * assignments rendered as horizontal bars.  Clicking a bar fires the
 * onDrillToTask callback so the parent can open the task detail or
 * scroll to the row in the list view.
 */

import { useMemo } from 'react';
import type { ScheduleTask } from './ScheduleTab';

export interface UserScheduleAssignment {
  task_resource_id: string;
  schedule_task_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  role_on_task: string | null;
  allocation_percent: number;
}

interface Props {
  tasks: ScheduleTask[];
  assignments: UserScheduleAssignment[];
  onDrillToTask: (taskId: string) => void;
}

const DAY_MS = 86400000;
const MIN_PIXELS_PER_DAY = 6;

function isoToMs(iso: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function dateLabel(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function UserScheduleView({ tasks, assignments, onDrillToTask }: Props) {
  const tasksById = useMemo(() => {
    const m = new Map<string, ScheduleTask>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const range = useMemo(() => {
    let earliest: number | null = null;
    let latest: number | null = null;
    for (const a of assignments) {
      const t = tasksById.get(a.schedule_task_id);
      if (!t) continue;
      const s = isoToMs(t.planned_start);
      const e = isoToMs(t.planned_end);
      if (s != null && (earliest == null || s < earliest)) earliest = s;
      if (e != null && (latest == null || e > latest)) latest = e;
    }
    if (earliest == null || latest == null) return null;
    if (latest <= earliest) latest = earliest + DAY_MS;
    return { startMs: earliest, endMs: latest };
  }, [assignments, tasksById]);

  const byUser = useMemo(() => {
    const m = new Map<
      string,
      { name: string; rows: Array<{ assignment: UserScheduleAssignment; task: ScheduleTask }> }
    >();
    for (const a of assignments) {
      const t = tasksById.get(a.schedule_task_id);
      if (!t) continue;
      const key = a.user_id;
      const display = a.user_name ?? a.user_email ?? 'Unknown';
      const entry = m.get(key) ?? { name: display, rows: [] };
      entry.rows.push({ assignment: a, task: t });
      m.set(key, entry);
    }
    return Array.from(m.entries())
      .map(([user_id, value]) => ({ user_id, ...value }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, tasksById]);

  if (byUser.length === 0 || !range) {
    return (
      <div data-bos-user-schedule-empty style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', fontSize: 12 }}>
        No crew assignments to chart yet.
      </div>
    );
  }

  const totalDays = Math.max(1, Math.ceil((range.endMs - range.startMs) / DAY_MS) + 1);
  const pxPerDay = MIN_PIXELS_PER_DAY;
  const totalWidth = totalDays * pxPerDay;

  return (
    <div data-bos-user-schedule-view style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, overflowX: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--bos-color-ink-tertiary)', marginBottom: 8 }}>
        <span>{dateLabel(range.startMs)}</span>
        <span>{dateLabel(range.endMs)}</span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody>
          {byUser.map((u) => (
            <tr key={u.user_id} data-bos-user-schedule-row={u.user_id}>
              <td style={{ padding: '8px 12px', width: 180, color: 'var(--color-ink-primary)', fontWeight: 600 }}>
                {u.name}
                <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)', fontWeight: 400 }}>
                  {u.rows.length} task{u.rows.length === 1 ? '' : 's'}
                </div>
              </td>
              <td style={{ padding: '8px 0' }}>
                <div style={{ position: 'relative', height: 28, minWidth: totalWidth, background: '#f8fafc', borderRadius: 4 }}>
                  {u.rows.map(({ assignment, task }) => {
                    const s = isoToMs(task.planned_start);
                    const e = isoToMs(task.planned_end);
                    if (s == null || e == null) return null;
                    const leftDays = Math.max(0, Math.round((s - range.startMs) / DAY_MS));
                    const widthDays = Math.max(1, Math.round((e - s) / DAY_MS) + 1);
                    return (
                      <button
                        type="button"
                        key={assignment.task_resource_id}
                        data-bos-user-schedule-bar={task.id}
                        onClick={() => onDrillToTask(task.id)}
                        title={`${task.name} (${assignment.allocation_percent}%${assignment.role_on_task ? ` · ${assignment.role_on_task}` : ''})`}
                        style={{
                          position: 'absolute',
                          left: leftDays * pxPerDay,
                          width: widthDays * pxPerDay,
                          top: 4,
                          height: 20,
                          background: '#1e3a8a',
                          color: 'white',
                          borderRadius: 4,
                          border: 'none',
                          padding: '0 6px',
                          fontSize: 10,
                          fontWeight: 600,
                          textAlign: 'left',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer',
                        }}
                      >
                        {task.name}
                      </button>
                    );
                  })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
