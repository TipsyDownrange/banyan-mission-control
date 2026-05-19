/**
 * BAN-374 Scheduling Spine — /api/schedule/phases
 *
 *   GET  ?engagement_kid=...   list phases for a project (kid required)
 *   POST                       create a phase
 *
 * Both are tenant-scoped and use the canonical RolePermission gate
 * (SCHEDULE_VIEW for reads, SCHEDULE_WRITE for writes).
 */

import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db, engagements, schedule_phases, SCHEDULE_PHASE_STATUSES } from '@/db';
import { passScheduleReadGate, passScheduleWriteGate } from '@/lib/schedule/api-gate';

export async function GET(req: Request) {
  const gate = await passScheduleReadGate();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementKid = (url.searchParams.get('engagement_kid') ?? '').trim();
  if (!engagementKid) {
    return NextResponse.json({ error: 'engagement_kid is required' }, { status: 400 });
  }

  const engagementRow = await db
    .select({ engagement_id: engagements.engagement_id })
    .from(engagements)
    .where(and(eq(engagements.tenant_id, gate.tenantId), eq(engagements.kid, engagementKid)))
    .limit(1);

  if (engagementRow.length === 0) {
    return NextResponse.json({ kIDFound: false, items: [] });
  }

  const rows = await db
    .select()
    .from(schedule_phases)
    .where(
      and(
        eq(schedule_phases.tenant_id, gate.tenantId),
        eq(schedule_phases.engagement_id, engagementRow[0].engagement_id),
      ),
    )
    .orderBy(asc(schedule_phases.sort_order), asc(schedule_phases.created_at));

  return NextResponse.json({ kIDFound: true, items: rows });
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

  const engagementKid = typeof body.engagement_kid === 'string' ? body.engagement_kid.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!engagementKid) {
    return NextResponse.json({ error: 'engagement_kid is required' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const status = typeof body.status === 'string' ? body.status : 'planned';
  if (!SCHEDULE_PHASE_STATUSES.includes(status as typeof SCHEDULE_PHASE_STATUSES[number])) {
    return NextResponse.json({ error: `invalid status: ${status}` }, { status: 400 });
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

  const engagementRow = await db
    .select({ engagement_id: engagements.engagement_id })
    .from(engagements)
    .where(and(eq(engagements.tenant_id, gate.tenantId), eq(engagements.kid, engagementKid)))
    .limit(1);

  if (engagementRow.length === 0) {
    return NextResponse.json(
      { error: `engagement not found for kid: ${engagementKid}` },
      { status: 404 },
    );
  }

  const inserted = await db
    .insert(schedule_phases)
    .values({
      tenant_id: gate.tenantId,
      engagement_id: engagementRow[0].engagement_id,
      name,
      sort_order: sortOrder,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      status: status as typeof SCHEDULE_PHASE_STATUSES[number],
    })
    .returning();

  return NextResponse.json({ ok: true, phase: inserted[0] }, { status: 201 });
}
