/**
 * BAN-374 P5 — /api/schedule/tasks/[id]/resources
 *
 *   GET    list current + historical resources for a task
 *   POST   assign a user (body: user_id, role_on_task?, allocation_percent?,
 *          notes?, ack_conflict?).  Returns 409 on duplicate active assignment.
 *          When a conflict (date overlap with allocation > 100%) is detected
 *          the route returns 409 with the conflict report unless
 *          body.ack_conflict === true AND body.notes is non-empty.
 */

import { NextResponse } from 'next/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  db,
  schedule_task_resources,
  schedule_tasks,
  users,
} from '@/db';
import { passScheduleReadGate, passScheduleWriteGate } from '@/lib/schedule/api-gate';
import { detectConflicts } from '@/lib/schedule/resource-conflicts';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passScheduleReadGate();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'invalid task id' }, { status: 400 });
  }

  const rows = await db
    .select({
      task_resource_id: schedule_task_resources.task_resource_id,
      schedule_task_id: schedule_task_resources.schedule_task_id,
      user_id: schedule_task_resources.user_id,
      role_on_task: schedule_task_resources.role_on_task,
      allocation_percent: schedule_task_resources.allocation_percent,
      assigned_at: schedule_task_resources.assigned_at,
      assigned_by: schedule_task_resources.assigned_by,
      removed_at: schedule_task_resources.removed_at,
      removed_by: schedule_task_resources.removed_by,
      notes: schedule_task_resources.notes,
      user_name: users.name,
      user_email: users.email,
      user_active: users.active,
    })
    .from(schedule_task_resources)
    .leftJoin(users, eq(schedule_task_resources.user_id, users.user_id))
    .where(
      and(
        eq(schedule_task_resources.tenant_id, gate.tenantId),
        eq(schedule_task_resources.schedule_task_id, id),
      ),
    )
    .orderBy(asc(schedule_task_resources.removed_at), desc(schedule_task_resources.assigned_at));

  return NextResponse.json({ items: rows });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passScheduleWriteGate();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'invalid task id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
  if (!userId || !isUuid(userId)) {
    return NextResponse.json({ error: 'valid user_id is required' }, { status: 400 });
  }

  const roleOnTask =
    typeof body.role_on_task === 'string' && body.role_on_task.trim()
      ? body.role_on_task.trim()
      : null;

  let allocationPercent = 100;
  if ('allocation_percent' in body) {
    const raw = body.allocation_percent;
    if (!Number.isFinite(raw as number)) {
      return NextResponse.json(
        { error: 'allocation_percent must be a number between 1 and 100' },
        { status: 400 },
      );
    }
    allocationPercent = Math.trunc(raw as number);
    if (allocationPercent < 1 || allocationPercent > 100) {
      return NextResponse.json(
        { error: 'allocation_percent must be between 1 and 100' },
        { status: 400 },
      );
    }
  }

  const notes = typeof body.notes === 'string' ? body.notes : null;
  const ackConflict = body.ack_conflict === true;

  // Resolve assigned_by from the authed actor's email.
  const actor = await db
    .select({ user_id: users.user_id })
    .from(users)
    .where(eq(users.email, gate.actorEmail))
    .limit(1);
  if (actor.length === 0) {
    return NextResponse.json({ error: 'actor user not found' }, { status: 403 });
  }
  const assignedBy = actor[0].user_id;

  // Confirm task exists in the tenant + grab its date range for conflict math.
  const taskRow = await db
    .select({
      id: schedule_tasks.id,
      planned_start: schedule_tasks.planned_start,
      planned_end: schedule_tasks.planned_end,
    })
    .from(schedule_tasks)
    .where(and(eq(schedule_tasks.tenant_id, gate.tenantId), eq(schedule_tasks.id, id)))
    .limit(1);
  if (taskRow.length === 0) {
    return NextResponse.json({ error: 'task not found' }, { status: 404 });
  }

  // Duplicate-active guard.
  const existing = await db
    .select({ task_resource_id: schedule_task_resources.task_resource_id })
    .from(schedule_task_resources)
    .where(
      and(
        eq(schedule_task_resources.tenant_id, gate.tenantId),
        eq(schedule_task_resources.schedule_task_id, id),
        eq(schedule_task_resources.user_id, userId),
      ),
    );
  const hasActiveDuplicate = existing.some(
    (r) => (r as { removed_at?: unknown }).removed_at == null,
  );
  // The select projects only the ID; re-query for removed_at when needed.
  if (existing.length > 0) {
    const activeCheck = await db
      .select({
        task_resource_id: schedule_task_resources.task_resource_id,
        removed_at: schedule_task_resources.removed_at,
      })
      .from(schedule_task_resources)
      .where(
        and(
          eq(schedule_task_resources.tenant_id, gate.tenantId),
          eq(schedule_task_resources.schedule_task_id, id),
          eq(schedule_task_resources.user_id, userId),
        ),
      );
    if (activeCheck.some((r) => r.removed_at == null)) {
      return NextResponse.json(
        { error: 'user already actively assigned to this task', code: 'DUPLICATE_ACTIVE' },
        { status: 409 },
      );
    }
    // suppress unused warning when only soft-removed rows exist
    void hasActiveDuplicate;
  }

  // Conflict detection (date overlap with allocation sum > 100).
  const report = await detectConflicts(
    gate.tenantId,
    userId,
    taskRow[0].planned_start as string | null,
    taskRow[0].planned_end as string | null,
    allocationPercent,
    null,
  );

  if (report.exceedsAllocation && !(ackConflict && notes && notes.trim().length > 0)) {
    return NextResponse.json(
      {
        error: 'overlapping assignments exceed 100% allocation',
        code: 'ALLOCATION_CONFLICT',
        report,
      },
      { status: 409 },
    );
  }

  const inserted = await db
    .insert(schedule_task_resources)
    .values({
      tenant_id: gate.tenantId,
      schedule_task_id: id,
      user_id: userId,
      role_on_task: roleOnTask,
      allocation_percent: allocationPercent,
      assigned_by: assignedBy,
      notes,
    })
    .returning();

  return NextResponse.json(
    { ok: true, resource: inserted[0], conflictReport: report },
    { status: 201 },
  );
}
