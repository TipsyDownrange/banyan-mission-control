/**
 * BAN-376 Customer Pipeline — /api/inquiries/[id]/convert-to-project
 *
 *   POST  Promote an inquiry to a Project.
 *
 * Two equally valid call shapes:
 *
 *   (1) Link mode — the caller has already created the engagement via the
 *       full /api/engagements POST flow (which provisions a Drive folder
 *       per ADR-026, runs the kID generator, etc.).  We just back-link:
 *       inquiry.converted_to_project_id = body.engagement_id and stamp
 *       state = CONVERTED.
 *
 *   (2) Minimal-stub mode — for the lightweight P0+1 path where the
 *       operator doesn't want to leave the inquiry to file a full engagement.
 *       Caller supplies engagement_kid, org_id, site_id, and we insert a
 *       minimal engagement row directly with source_inquiry_id set and the
 *       inquiry's is_test_project value inherited (TPA §17).  This mode does
 *       NOT call the Drive-folder helper — that's Phase-1.5 work.
 *
 * The dispatch protect-list keeps the existing /api/engagements POST route
 * untouched, so Mode 1 is the recommended path when production Drive
 * folders are required.  Mode 2 exists for the P0 quick-promote UI flow
 * highlighted in spec §8.3.
 *
 * In both modes, the inquiry state transitions to CONVERTED via the same
 * state-machine guard used by /transition.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  engagements,
  inquiries,
  inquiry_state_transitions,
  type InquiryState,
} from '@/db';
import { passInquiryWriteGate } from '@/lib/inquiries/api-gate';
import { canTransition } from '@/lib/inquiries/helpers';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passInquiryWriteGate();
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

  const current = await db
    .select()
    .from(inquiries)
    .where(and(eq(inquiries.tenant_id, gate.tenantId), eq(inquiries.inquiry_id, id)))
    .limit(1);
  if (current.length === 0) {
    return NextResponse.json({ error: 'inquiry not found' }, { status: 404 });
  }
  const inquiry = current[0];
  const fromState = inquiry.state as InquiryState;
  if (!canTransition(fromState, 'CONVERTED')) {
    return NextResponse.json(
      { error: `cannot convert from state ${fromState}` },
      { status: 400 },
    );
  }

  let engagementId: string;

  if (typeof body.engagement_id === 'string' && body.engagement_id) {
    // Mode 1 — link mode.
    if (!isUuid(body.engagement_id)) {
      return NextResponse.json({ error: 'engagement_id must be a UUID' }, { status: 400 });
    }
    const engRows = await db
      .select({ engagement_id: engagements.engagement_id, tenant_id: engagements.tenant_id })
      .from(engagements)
      .where(and(eq(engagements.tenant_id, gate.tenantId), eq(engagements.engagement_id, body.engagement_id)))
      .limit(1);
    if (engRows.length === 0) {
      return NextResponse.json({ error: 'engagement not found' }, { status: 404 });
    }
    engagementId = engRows[0].engagement_id;

    await db
      .update(engagements)
      .set({
        source_inquiry_id: id,
        updated_at: new Date(),
      })
      .where(and(eq(engagements.tenant_id, gate.tenantId), eq(engagements.engagement_id, engagementId)));
  } else {
    // Mode 2 — minimal stub.
    const kid = typeof body.engagement_kid === 'string' ? body.engagement_kid.trim() : '';
    const orgId = typeof body.org_id === 'string' ? body.org_id : '';
    const siteId = typeof body.site_id === 'string' ? body.site_id : '';
    if (!kid) return NextResponse.json({ error: 'engagement_kid is required when engagement_id is not supplied' }, { status: 400 });
    if (!orgId) return NextResponse.json({ error: 'org_id is required when engagement_id is not supplied' }, { status: 400 });
    if (!siteId) return NextResponse.json({ error: 'site_id is required when engagement_id is not supplied' }, { status: 400 });

    const inserted = await db
      .insert(engagements)
      .values({
        kid,
        org_id: orgId,
        site_id: siteId,
        engagement_type: 'project',
        status: 'active',
        pm_handoff_state: 'estimating',
        is_test_project: inquiry.is_test_project,
        tenant_id: gate.tenantId,
        source_inquiry_id: id,
      })
      .returning({ engagement_id: engagements.engagement_id });
    engagementId = inserted[0].engagement_id;
  }

  const now = new Date();
  const updated = await db
    .update(inquiries)
    .set({
      state: 'CONVERTED',
      state_changed_at: now,
      state_reason: typeof body.reason === 'string' ? body.reason : 'promoted to project',
      converted_to_project_id: engagementId,
      updated_at: now,
    })
    .where(and(eq(inquiries.tenant_id, gate.tenantId), eq(inquiries.inquiry_id, id)))
    .returning();

  await db.insert(inquiry_state_transitions).values({
    tenant_id: gate.tenantId,
    inquiry_id: id,
    from_state: fromState,
    to_state: 'CONVERTED',
    changed_by: null,
    reason: typeof body.reason === 'string' ? body.reason : 'promoted to project',
  });

  return NextResponse.json({
    ok: true,
    inquiry: updated[0],
    engagement_id: engagementId,
    from_state: fromState,
    to_state: 'CONVERTED',
  });
}
