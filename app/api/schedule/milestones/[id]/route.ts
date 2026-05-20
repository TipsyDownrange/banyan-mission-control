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
  SCHEDULE_MILESTONE_KINDS,
  SCHEDULE_MILESTONE_STATUSES,
  SCHEDULE_MILESTONE_TYPES,
} from '@/db';
import { passScheduleWriteGate } from '@/lib/schedule/api-gate';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
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

  // BAN-374 P6 — milestone_kind + permit_* fields editable; enum-validated.
  if (typeof body.milestone_kind === 'string') {
    if (!SCHEDULE_MILESTONE_KINDS.includes(body.milestone_kind as typeof SCHEDULE_MILESTONE_KINDS[number])) {
      return NextResponse.json({ error: `invalid milestone_kind: ${body.milestone_kind}` }, { status: 400 });
    }
    updates.milestone_kind = body.milestone_kind;
  }
  if ('permit_authority' in body) {
    updates.permit_authority = typeof body.permit_authority === 'string' && body.permit_authority.trim()
      ? body.permit_authority.trim()
      : null;
  }
  const permitDateFields = [
    'permit_application_date',
    'permit_estimated_approval_date',
    'permit_actual_approval_date',
  ] as const;
  for (const field of permitDateFields) {
    if (!(field in body)) continue;
    const raw = body[field];
    if (raw == null || raw === '') {
      updates[field] = null;
      continue;
    }
    if (typeof raw !== 'string' || !isISODate(raw)) {
      return NextResponse.json({ error: `${field} must be ISO YYYY-MM-DD` }, { status: 400 });
    }
    updates[field] = raw;
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
