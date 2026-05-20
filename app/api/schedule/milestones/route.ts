/**
 * BAN-374 Scheduling Spine — /api/schedule/milestones
 *
 *   GET ?engagement_kid=...   list milestones for a project
 *   POST                      create a milestone
 */

import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import {
  db,
  engagements,
  schedule_milestones,
  SCHEDULE_MILESTONE_KINDS,
  SCHEDULE_MILESTONE_STATUSES,
  SCHEDULE_MILESTONE_TYPES,
} from '@/db';
import { passScheduleReadGate, passScheduleWriteGate } from '@/lib/schedule/api-gate';

function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: Request) {
  const gate = await passScheduleReadGate();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementKid = (url.searchParams.get('engagement_kid') ?? '').trim();
  if (!engagementKid) {
    return NextResponse.json({ error: 'engagement_kid is required' }, { status: 400 });
  }

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
    .from(schedule_milestones)
    .where(
      and(
        eq(schedule_milestones.tenant_id, gate.tenantId),
        eq(schedule_milestones.engagement_id, eng[0].engagement_id),
      ),
    )
    .orderBy(asc(schedule_milestones.planned_date), asc(schedule_milestones.created_at));

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
  const type = typeof body.type === 'string' ? body.type : '';
  if (!engagementKid) {
    return NextResponse.json({ error: 'engagement_kid is required' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!SCHEDULE_MILESTONE_TYPES.includes(type as typeof SCHEDULE_MILESTONE_TYPES[number])) {
    return NextResponse.json({ error: `invalid type: ${type}` }, { status: 400 });
  }

  const status = typeof body.status === 'string' ? body.status : 'pending';
  if (!SCHEDULE_MILESTONE_STATUSES.includes(status as typeof SCHEDULE_MILESTONE_STATUSES[number])) {
    return NextResponse.json({ error: `invalid status: ${status}` }, { status: 400 });
  }

  const plannedDate = typeof body.planned_date === 'string' && body.planned_date
    ? body.planned_date
    : null;

  // BAN-374 P6 — Permit-field body extension.  milestone_kind defaults to
  // 'standard' for backward compatibility; permit_* fields are optional
  // ISO-date strings only validated when milestone_kind = 'permit'.
  const milestoneKindRaw = typeof body.milestone_kind === 'string' && body.milestone_kind
    ? body.milestone_kind
    : 'standard';
  if (!SCHEDULE_MILESTONE_KINDS.includes(milestoneKindRaw as typeof SCHEDULE_MILESTONE_KINDS[number])) {
    return NextResponse.json({ error: `invalid milestone_kind: ${milestoneKindRaw}` }, { status: 400 });
  }
  const milestoneKind = milestoneKindRaw as typeof SCHEDULE_MILESTONE_KINDS[number];

  const permitAuthority = typeof body.permit_authority === 'string' && body.permit_authority.trim()
    ? body.permit_authority.trim()
    : null;

  const permitDateFields = [
    'permit_application_date',
    'permit_estimated_approval_date',
    'permit_actual_approval_date',
  ] as const;
  const permitDates: Record<typeof permitDateFields[number], string | null> = {
    permit_application_date: null,
    permit_estimated_approval_date: null,
    permit_actual_approval_date: null,
  };
  for (const field of permitDateFields) {
    const raw = body[field];
    if (raw == null || raw === '') continue;
    if (typeof raw !== 'string' || !isISODate(raw)) {
      return NextResponse.json({ error: `${field} must be ISO YYYY-MM-DD` }, { status: 400 });
    }
    permitDates[field] = raw;
  }

  const eng = await db
    .select({ engagement_id: engagements.engagement_id })
    .from(engagements)
    .where(and(eq(engagements.tenant_id, gate.tenantId), eq(engagements.kid, engagementKid)))
    .limit(1);

  if (eng.length === 0) {
    return NextResponse.json(
      { error: `engagement not found for kid: ${engagementKid}` },
      { status: 404 },
    );
  }

  const inserted = await db
    .insert(schedule_milestones)
    .values({
      tenant_id: gate.tenantId,
      engagement_id: eng[0].engagement_id,
      name,
      type: type as typeof SCHEDULE_MILESTONE_TYPES[number],
      planned_date: plannedDate,
      status: status as typeof SCHEDULE_MILESTONE_STATUSES[number],
      milestone_kind: milestoneKind,
      permit_authority: permitAuthority,
      permit_application_date: permitDates.permit_application_date,
      permit_estimated_approval_date: permitDates.permit_estimated_approval_date,
      permit_actual_approval_date: permitDates.permit_actual_approval_date,
    })
    .returning();

  return NextResponse.json({ ok: true, milestone: inserted[0] }, { status: 201 });
}
