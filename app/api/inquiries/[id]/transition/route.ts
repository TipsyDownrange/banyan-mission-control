/**
 * BAN-376 Customer Pipeline — /api/inquiries/[id]/transition
 *
 *   POST  change inquiry.state per spec §9 state machine and write an
 *         inquiry_state_transitions audit row.
 *
 * Conversion targets (engagement / WO ids) are NOT set here — promote uses
 * /convert-to-project or /convert-to-work-order, both of which call this
 * route internally after their own write.  Use this endpoint for
 * NEW→IN_DISCUSSION, IN_DISCUSSION→QUOTED, QUOTED→AWARDED, →LOST, →DEFERRED,
 * and DEFERRED→IN_DISCUSSION reactivations.
 *
 * Activity Spine emission deferred to P0+1.5 (G2 ADR amendment).
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  inquiries,
  inquiry_state_transitions,
  INQUIRY_STATES,
  INQUIRY_CONVERSION_EVENTS,
  type InquiryState,
  type InquiryConversionEvent,
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

  const toState = body.to_state;
  if (typeof toState !== 'string' || !(INQUIRY_STATES as ReadonlyArray<string>).includes(toState)) {
    return NextResponse.json(
      { error: `invalid to_state; expected one of ${INQUIRY_STATES.join(', ')}` },
      { status: 400 },
    );
  }
  const targetState = toState as InquiryState;

  const current = await db
    .select({
      inquiry_id: inquiries.inquiry_id,
      state: inquiries.state,
      tenant_id: inquiries.tenant_id,
    })
    .from(inquiries)
    .where(and(eq(inquiries.tenant_id, gate.tenantId), eq(inquiries.inquiry_id, id)))
    .limit(1);

  if (current.length === 0) {
    return NextResponse.json({ error: 'inquiry not found' }, { status: 404 });
  }
  const fromState = current[0].state as InquiryState;

  if (!canTransition(fromState, targetState)) {
    return NextResponse.json(
      { error: `invalid transition: ${fromState} → ${targetState}` },
      { status: 400 },
    );
  }

  // AWARDED requires a conversion_event per spec §10.
  let conversionEvent: InquiryConversionEvent | null = null;
  if (targetState === 'AWARDED') {
    const ce = body.conversion_event;
    if (typeof ce !== 'string' || !(INQUIRY_CONVERSION_EVENTS as ReadonlyArray<string>).includes(ce)) {
      return NextResponse.json(
        { error: `AWARDED requires conversion_event; expected one of ${INQUIRY_CONVERSION_EVENTS.join(', ')}` },
        { status: 400 },
      );
    }
    conversionEvent = ce as InquiryConversionEvent;
  }

  const reason = typeof body.reason === 'string' ? body.reason : null;
  const now = new Date();

  const updateSet: Record<string, unknown> = {
    state: targetState,
    state_changed_at: now,
    state_reason: reason,
    updated_at: now,
  };
  if (conversionEvent) {
    updateSet.conversion_event = conversionEvent;
    updateSet.conversion_at = now;
    if (typeof body.conversion_evidence === 'string') {
      updateSet.conversion_evidence = body.conversion_evidence;
    }
  }

  const updated = await db
    .update(inquiries)
    .set(updateSet)
    .where(and(eq(inquiries.tenant_id, gate.tenantId), eq(inquiries.inquiry_id, id)))
    .returning();

  await db.insert(inquiry_state_transitions).values({
    tenant_id: gate.tenantId,
    inquiry_id: id,
    from_state: fromState,
    to_state: targetState,
    changed_by: null,
    reason,
  });

  return NextResponse.json({
    ok: true,
    inquiry: updated[0],
    from_state: fromState,
    to_state: targetState,
  });
}
