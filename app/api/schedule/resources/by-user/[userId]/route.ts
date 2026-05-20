/**
 * BAN-374 P5 — /api/schedule/resources/by-user/[userId]
 *
 *   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *     Returns active assignments for the given user where the task's
 *     planned date range intersects the supplied window.  If from/to
 *     are omitted, every active assignment for the user is returned.
 *
 *     Each row joins schedule_tasks fields the consumer needs to render
 *     a per-user calendar / dispatch view:
 *       task_id, task_name, planned_start, planned_end, status,
 *       phase_id, phase_name, engagement_id, plus the resource row.
 *
 *     Soft-removed assignments (removed_at IS NOT NULL) are excluded.
 */

import { NextResponse } from 'next/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  db,
  schedule_phases,
  schedule_task_resources,
  schedule_tasks,
} from '@/db';
import { passScheduleReadGate } from '@/lib/schedule/api-gate';
import { rangesOverlap } from '@/lib/schedule/resource-conflicts';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const gate = await passScheduleReadGate();
  if (!gate.ok) return gate.response;

  const { userId } = await context.params;
  if (!isUuid(userId)) {
    return NextResponse.json({ error: 'invalid user_id' }, { status: 400 });
  }

  const url = new URL(req.url);
  const from = (url.searchParams.get('from') ?? '').trim();
  const to = (url.searchParams.get('to') ?? '').trim();
  if (from && !isIsoDate(from)) {
    return NextResponse.json({ error: 'from must be YYYY-MM-DD' }, { status: 400 });
  }
  if (to && !isIsoDate(to)) {
    return NextResponse.json({ error: 'to must be YYYY-MM-DD' }, { status: 400 });
  }

  const rows = await db
    .select({
      task_resource_id: schedule_task_resources.task_resource_id,
      schedule_task_id: schedule_task_resources.schedule_task_id,
      user_id: schedule_task_resources.user_id,
      role_on_task: schedule_task_resources.role_on_task,
      allocation_percent: schedule_task_resources.allocation_percent,
      assigned_at: schedule_task_resources.assigned_at,
      notes: schedule_task_resources.notes,
      task_name: schedule_tasks.name,
      task_planned_start: schedule_tasks.planned_start,
      task_planned_end: schedule_tasks.planned_end,
      task_status: schedule_tasks.status,
      phase_id: schedule_tasks.phase_id,
      engagement_id: schedule_tasks.engagement_id,
      phase_name: schedule_phases.name,
    })
    .from(schedule_task_resources)
    .innerJoin(schedule_tasks, eq(schedule_task_resources.schedule_task_id, schedule_tasks.id))
    .innerJoin(schedule_phases, eq(schedule_tasks.phase_id, schedule_phases.id))
    .where(
      and(
        eq(schedule_task_resources.tenant_id, gate.tenantId),
        eq(schedule_task_resources.user_id, userId),
        isNull(schedule_task_resources.removed_at),
      ),
    )
    .orderBy(asc(schedule_tasks.planned_start), asc(schedule_tasks.name));

  const filtered =
    from || to
      ? rows.filter((r) =>
          rangesOverlap(
            r.task_planned_start as string | null,
            r.task_planned_end as string | null,
            from || '0001-01-01',
            to || '9999-12-31',
          ),
        )
      : rows;

  return NextResponse.json({ items: filtered });
}
