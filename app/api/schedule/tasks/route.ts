/**
 * BAN-374 Scheduling Spine — /api/schedule/tasks
 *
 *   GET ?phase_id=...           list tasks under a phase
 *   GET ?engagement_kid=...     list every task in a project (any phase)
 *   POST                        create a task under an existing phase
 */

import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import {
  db,
  engagements,
  schedule_phases,
  schedule_tasks,
  SCHEDULE_TASK_STATUSES,
} from '@/db';
import { passScheduleReadGate, passScheduleWriteGate } from '@/lib/schedule/api-gate';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function GET(req: Request) {
  const gate = await passScheduleReadGate();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const phaseId = (url.searchParams.get('phase_id') ?? '').trim();
  const engagementKid = (url.searchParams.get('engagement_kid') ?? '').trim();

  if (phaseId) {
    if (!isUuid(phaseId)) {
      return NextResponse.json({ error: 'invalid phase_id' }, { status: 400 });
    }
    const rows = await db
      .select()
      .from(schedule_tasks)
      .where(
        and(
          eq(schedule_tasks.tenant_id, gate.tenantId),
          eq(schedule_tasks.phase_id, phaseId),
        ),
      )
      .orderBy(asc(schedule_tasks.sort_order), asc(schedule_tasks.created_at));
    return NextResponse.json({ items: rows });
  }

  if (engagementKid) {
    const eng = await db
      .select({ engagement_id: engagements.engagement_id })
      .from(engagements)
      .where(and(eq(engagements.tenant_id, gate.tenantId), eq(engagements.kid, engagementKid)))
      .limit(1);

    if (eng.length === 0) {
      return NextResponse.json({ kIDFound: false, items: [] });
    }

    const rows = await db
      .select()
      .from(schedule_tasks)
      .where(
        and(
          eq(schedule_tasks.tenant_id, gate.tenantId),
          eq(schedule_tasks.engagement_id, eng[0].engagement_id),
        ),
      )
      .orderBy(asc(schedule_tasks.sort_order), asc(schedule_tasks.created_at));

    return NextResponse.json({ kIDFound: true, items: rows });
  }

  return NextResponse.json(
    { error: 'phase_id or engagement_kid is required' },
    { status: 400 },
  );
}

export async function POST(req: Request) {
  const gate = await passScheduleWriteGate();
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const phaseId = typeof body.phase_id === 'string' ? body.phase_id.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!phaseId || !isUuid(phaseId)) {
    return NextResponse.json({ error: 'valid phase_id is required' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const status = typeof body.status === 'string' ? body.status : 'planned';
  if (!SCHEDULE_TASK_STATUSES.includes(status as typeof SCHEDULE_TASK_STATUSES[number])) {
    return NextResponse.json({ error: `invalid status: ${status}` }, { status: 400 });
  }

  const percentComplete = Number.isFinite(body.percent_complete as number)
    ? Math.trunc(body.percent_complete as number)
    : 0;
  if (percentComplete < 0 || percentComplete > 100) {
    return NextResponse.json(
      { error: 'percent_complete must be between 0 and 100' },
      { status: 400 },
    );
  }

  const phaseRow = await db
    .select({
      phase_id: schedule_phases.id,
      engagement_id: schedule_phases.engagement_id,
    })
    .from(schedule_phases)
    .where(and(eq(schedule_phases.tenant_id, gate.tenantId), eq(schedule_phases.id, phaseId)))
    .limit(1);

  if (phaseRow.length === 0) {
    return NextResponse.json({ error: 'phase not found' }, { status: 404 });
  }

  const sortOrder = Number.isFinite(body.sort_order as number)
    ? Math.trunc(body.sort_order as number)
    : 0;
  const plannedStart = typeof body.planned_start === 'string' && body.planned_start
    ? body.planned_start
    : null;
  const plannedEnd = typeof body.planned_end === 'string' && body.planned_end
    ? body.planned_end
    : null;
  const plannedDurationDays = Number.isFinite(body.planned_duration_days as number)
    ? Math.trunc(body.planned_duration_days as number)
    : null;
  const description = typeof body.description === 'string' ? body.description : null;
  const assignedTo = typeof body.assigned_to_user_id === 'string' && isUuid(body.assigned_to_user_id)
    ? body.assigned_to_user_id
    : null;

  const inserted = await db
    .insert(schedule_tasks)
    .values({
      tenant_id: gate.tenantId,
      phase_id: phaseRow[0].phase_id,
      engagement_id: phaseRow[0].engagement_id,
      name,
      description,
      sort_order: sortOrder,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      planned_duration_days: plannedDurationDays,
      percent_complete: percentComplete,
      status: status as typeof SCHEDULE_TASK_STATUSES[number],
      assigned_to_user_id: assignedTo,
    })
    .returning();

  return NextResponse.json({ ok: true, task: inserted[0] }, { status: 201 });
}
