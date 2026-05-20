/**
 * BAN-374 Scheduling Spine P4 — /api/schedule/freight-calendar
 *
 * Tenant-scoped Matson / Pasha / Young Brothers sailing calendar feeding
 * the Gantt freight overlay (sailing date hashes, arrival container icons,
 * cutoff dashed lines).
 *
 *   GET ?route=...&from=YYYY-MM-DD&to=YYYY-MM-DD   list filtered, soft-deleted excluded
 *   POST                                            create a sailing entry
 *
 * Gated by SCHEDULE_VIEW for reads and SCHEDULE_WRITE for writes (the same
 * permission union BAN-374 added in lib/permissions.ts:200-202).
 */

import { NextResponse } from 'next/server';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { db, tenant_freight_calendar } from '@/db';
import { passScheduleReadGate, passScheduleWriteGate } from '@/lib/schedule/api-gate';

function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: Request) {
  const gate = await passScheduleReadGate();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const route = (url.searchParams.get('route') ?? '').trim();
  const from = (url.searchParams.get('from') ?? '').trim();
  const to = (url.searchParams.get('to') ?? '').trim();

  const conditions = [
    eq(tenant_freight_calendar.tenant_id, gate.tenantId),
    isNull(tenant_freight_calendar.deleted_at),
  ];
  if (route) conditions.push(eq(tenant_freight_calendar.route, route));
  if (from && isISODate(from)) conditions.push(gte(tenant_freight_calendar.sailing_date, from));
  if (to && isISODate(to)) conditions.push(lte(tenant_freight_calendar.sailing_date, to));

  const rows = await db
    .select()
    .from(tenant_freight_calendar)
    .where(and(...conditions))
    .orderBy(asc(tenant_freight_calendar.sailing_date));

  return NextResponse.json({ items: rows });
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

  const route = typeof body.route === 'string' ? body.route.trim() : '';
  const sailing = typeof body.sailing_date === 'string' ? body.sailing_date.trim() : '';
  const arrival = typeof body.arrival_date === 'string' ? body.arrival_date.trim() : '';
  const cutoff = typeof body.cutoff_date === 'string' ? body.cutoff_date.trim() : '';
  const carrier = typeof body.carrier === 'string' && body.carrier.trim()
    ? body.carrier.trim()
    : 'Matson';
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

  if (!route) {
    return NextResponse.json({ error: 'route is required' }, { status: 400 });
  }
  if (!isISODate(sailing) || !isISODate(arrival) || !isISODate(cutoff)) {
    return NextResponse.json(
      { error: 'sailing_date, arrival_date, cutoff_date are required ISO YYYY-MM-DD' },
      { status: 400 },
    );
  }
  if (cutoff > sailing) {
    return NextResponse.json(
      { error: 'cutoff_date must be on or before sailing_date' },
      { status: 400 },
    );
  }
  if (arrival < sailing) {
    return NextResponse.json(
      { error: 'arrival_date must be on or after sailing_date' },
      { status: 400 },
    );
  }

  const inserted = await db
    .insert(tenant_freight_calendar)
    .values({
      tenant_id: gate.tenantId,
      carrier,
      route,
      sailing_date: sailing,
      arrival_date: arrival,
      cutoff_date: cutoff,
      notes,
    })
    .returning();

  return NextResponse.json({ ok: true, entry: inserted[0] }, { status: 201 });
}
