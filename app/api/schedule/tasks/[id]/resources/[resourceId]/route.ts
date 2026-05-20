/**
 * BAN-374 P5 — /api/schedule/tasks/[id]/resources/[resourceId]
 *
 *   PATCH   update role_on_task, allocation_percent, notes.  user_id /
 *           schedule_task_id are immutable on this route.
 *   DELETE  soft-remove (sets removed_at = now() + removed_by = actor).
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  schedule_task_resources,
  users,
} from '@/db';
import { passScheduleWriteGate } from '@/lib/schedule/api-gate';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; resourceId: string }> },
) {
  const gate = await passScheduleWriteGate();
  if (!gate.ok) return gate.response;

  const { id, resourceId } = await context.params;
  if (!isUuid(id) || !isUuid(resourceId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ('role_on_task' in body) {
    updates.role_on_task =
      typeof body.role_on_task === 'string' && body.role_on_task.trim()
        ? body.role_on_task.trim()
        : null;
  }

  if ('allocation_percent' in body) {
    const raw = body.allocation_percent;
    if (!Number.isFinite(raw as number)) {
      return NextResponse.json(
        { error: 'allocation_percent must be a number between 1 and 100' },
        { status: 400 },
      );
    }
    const pct = Math.trunc(raw as number);
    if (pct < 1 || pct > 100) {
      return NextResponse.json(
        { error: 'allocation_percent must be between 1 and 100' },
        { status: 400 },
      );
    }
    updates.allocation_percent = pct;
  }

  if ('notes' in body) {
    updates.notes = typeof body.notes === 'string' ? body.notes : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no updatable fields supplied' }, { status: 400 });
  }

  const updated = await db
    .update(schedule_task_resources)
    .set(updates)
    .where(
      and(
        eq(schedule_task_resources.tenant_id, gate.tenantId),
        eq(schedule_task_resources.schedule_task_id, id),
        eq(schedule_task_resources.task_resource_id, resourceId),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: 'resource assignment not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, resource: updated[0] });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; resourceId: string }> },
) {
  const gate = await passScheduleWriteGate();
  if (!gate.ok) return gate.response;

  const { id, resourceId } = await context.params;
  if (!isUuid(id) || !isUuid(resourceId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  // Resolve actor user_id for removed_by audit trail.
  const actor = await db
    .select({ user_id: users.user_id })
    .from(users)
    .where(eq(users.email, gate.actorEmail))
    .limit(1);
  if (actor.length === 0) {
    return NextResponse.json({ error: 'actor user not found' }, { status: 403 });
  }

  const updated = await db
    .update(schedule_task_resources)
    .set({ removed_at: new Date(), removed_by: actor[0].user_id })
    .where(
      and(
        eq(schedule_task_resources.tenant_id, gate.tenantId),
        eq(schedule_task_resources.schedule_task_id, id),
        eq(schedule_task_resources.task_resource_id, resourceId),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: 'resource assignment not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, resource: updated[0] });
}
