/**
 * BAN-374 Scheduling Spine P4 — /api/schedule/freight-calendar/[id]
 *
 *   PATCH   update sailing/arrival/cutoff/route/notes
 *   DELETE  soft-delete (sets deleted_at)
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db, tenant_freight_calendar } from '@/db';
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
  if (typeof body.carrier === 'string' && body.carrier.trim()) updates.carrier = body.carrier.trim();
  if (typeof body.route === 'string' && body.route.trim()) updates.route = body.route.trim();
  if (typeof body.sailing_date === 'string') {
    if (!isISODate(body.sailing_date)) {
      return NextResponse.json({ error: 'sailing_date must be ISO YYYY-MM-DD' }, { status: 400 });
    }
    updates.sailing_date = body.sailing_date;
  }
  if (typeof body.arrival_date === 'string') {
    if (!isISODate(body.arrival_date)) {
      return NextResponse.json({ error: 'arrival_date must be ISO YYYY-MM-DD' }, { status: 400 });
    }
    updates.arrival_date = body.arrival_date;
  }
  if (typeof body.cutoff_date === 'string') {
    if (!isISODate(body.cutoff_date)) {
      return NextResponse.json({ error: 'cutoff_date must be ISO YYYY-MM-DD' }, { status: 400 });
    }
    updates.cutoff_date = body.cutoff_date;
  }
  if ('notes' in body) {
    updates.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
  }

  const updated = await db
    .update(tenant_freight_calendar)
    .set(updates)
    .where(
      and(
        eq(tenant_freight_calendar.tenant_id, gate.tenantId),
        eq(tenant_freight_calendar.freight_calendar_id, id),
        isNull(tenant_freight_calendar.deleted_at),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: 'freight calendar entry not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, entry: updated[0] });
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
    .update(tenant_freight_calendar)
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where(
      and(
        eq(tenant_freight_calendar.tenant_id, gate.tenantId),
        eq(tenant_freight_calendar.freight_calendar_id, id),
        isNull(tenant_freight_calendar.deleted_at),
      ),
    )
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'freight calendar entry not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
