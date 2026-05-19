/**
 * BAN-374 Scheduling Spine — /api/schedule/milestones/[id]
 *
 *   PATCH   update milestone (esp. actual_date, status)
 *   DELETE  remove milestone
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  schedule_milestones,
  SCHEDULE_MILESTONE_STATUSES,
  SCHEDULE_MILESTONE_TYPES,
} from '@/db';
import { passScheduleWriteGate } from '@/lib/schedule/api-gate';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passScheduleWriteGate();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (typeof body.name === 'string') updates.name = body.name.trim();
  if (typeof body.type === 'string') {
    if (!SCHEDULE_MILESTONE_TYPES.includes(body.type as typeof SCHEDULE_MILESTONE_TYPES[number])) {
      return NextResponse.json({ error: `invalid type: ${body.type}` }, { status: 400 });
    }
    updates.type = body.type;
  }
  if (typeof body.status === 'string') {
    if (!SCHEDULE_MILESTONE_STATUSES.includes(body.status as typeof SCHEDULE_MILESTONE_STATUSES[number])) {
      return NextResponse.json({ error: `invalid status: ${body.status}` }, { status: 400 });
    }
    updates.status = body.status;
  }
  if ('planned_date' in body) {
    updates.planned_date = typeof body.planned_date === 'string' && body.planned_date
      ? body.planned_date
      : null;
  }
  if ('actual_date' in body) {
    updates.actual_date = typeof body.actual_date === 'string' && body.actual_date
      ? body.actual_date
      : null;
  }

  const updated = await db
    .update(schedule_milestones)
    .set(updates)
    .where(
      and(
        eq(schedule_milestones.tenant_id, gate.tenantId),
        eq(schedule_milestones.id, id),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: 'milestone not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, milestone: updated[0] });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passScheduleWriteGate();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const deleted = await db
    .delete(schedule_milestones)
    .where(
      and(
        eq(schedule_milestones.tenant_id, gate.tenantId),
        eq(schedule_milestones.id, id),
      ),
    )
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'milestone not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
