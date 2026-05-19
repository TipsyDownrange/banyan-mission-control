/**
 * BAN-374 Scheduling Spine — /api/schedule/phases/[id]
 *
 *   PATCH   update name/dates/status/sort_order
 *   DELETE  remove phase (CASCADE removes its tasks; their deps cascade)
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schedule_phases, SCHEDULE_PHASE_STATUSES } from '@/db';
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
  if (typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) {
    updates.sort_order = Math.trunc(body.sort_order);
  }
  if ('planned_start' in body) {
    updates.planned_start = typeof body.planned_start === 'string' && body.planned_start
      ? body.planned_start
      : null;
  }
  if ('planned_end' in body) {
    updates.planned_end = typeof body.planned_end === 'string' && body.planned_end
      ? body.planned_end
      : null;
  }
  if ('actual_start' in body) {
    updates.actual_start = typeof body.actual_start === 'string' && body.actual_start
      ? body.actual_start
      : null;
  }
  if ('actual_end' in body) {
    updates.actual_end = typeof body.actual_end === 'string' && body.actual_end
      ? body.actual_end
      : null;
  }
  if (typeof body.status === 'string') {
    if (!SCHEDULE_PHASE_STATUSES.includes(body.status as typeof SCHEDULE_PHASE_STATUSES[number])) {
      return NextResponse.json({ error: `invalid status: ${body.status}` }, { status: 400 });
    }
    updates.status = body.status;
  }

  const updated = await db
    .update(schedule_phases)
    .set(updates)
    .where(and(eq(schedule_phases.tenant_id, gate.tenantId), eq(schedule_phases.id, id)))
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: 'phase not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, phase: updated[0] });
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
    .delete(schedule_phases)
    .where(and(eq(schedule_phases.tenant_id, gate.tenantId), eq(schedule_phases.id, id)))
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'phase not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
