/**
 * BAN-376 Customer Pipeline — /api/inquiries/[id]/convert-to-work-order
 *
 *   POST  Promote an inquiry to a sheets-backed Service Work Order.
 *
 * Per ADR-026 service WOs live in Google Sheets, not Postgres.  We do NOT
 * create the WO row here — the operator must already have an SRV-YY-NNNN id
 * (either from the ServicePanel "New Lead" flow or hand-entered).  We
 * record that id on the inquiry as a text reference, transition state to
 * CONVERTED, and audit the transition.  No reverse FK is created because
 * service_work_orders is sheets-only.
 *
 * Dispatch STOP-condition: if the SRV-id is missing, return 400 instead of
 * trying to generate one server-side.  Operator-supplied input only in P0+1.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  inquiries,
  inquiry_state_transitions,
  type InquiryState,
} from '@/db';
import { passInquiryWriteGate } from '@/lib/inquiries/api-gate';
import { canTransition, isValidServiceWorkOrderId } from '@/lib/inquiries/helpers';

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

  const woId = typeof body.work_order_id === 'string' ? body.work_order_id.trim() : '';
  if (!woId) {
    return NextResponse.json(
      { error: 'work_order_id is required (operator-supplied SRV-YY-NNNN per ADR-026)' },
      { status: 400 },
    );
  }
  if (!isValidServiceWorkOrderId(woId)) {
    return NextResponse.json(
      { error: 'work_order_id must match SRV-YY-NNNN format' },
      { status: 400 },
    );
  }

  const current = await db
    .select({
      inquiry_id: inquiries.inquiry_id,
      state: inquiries.state,
    })
    .from(inquiries)
    .where(and(eq(inquiries.tenant_id, gate.tenantId), eq(inquiries.inquiry_id, id)))
    .limit(1);
  if (current.length === 0) {
    return NextResponse.json({ error: 'inquiry not found' }, { status: 404 });
  }
  const fromState = current[0].state as InquiryState;
  if (!canTransition(fromState, 'CONVERTED')) {
    return NextResponse.json(
      { error: `cannot convert from state ${fromState}` },
      { status: 400 },
    );
  }

  const now = new Date();
  const updated = await db
    .update(inquiries)
    .set({
      state: 'CONVERTED',
      state_changed_at: now,
      state_reason: typeof body.reason === 'string' ? body.reason : 'promoted to work order',
      converted_to_work_order_id: woId,
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
    reason: typeof body.reason === 'string' ? body.reason : 'promoted to work order',
  });

  return NextResponse.json({
    ok: true,
    inquiry: updated[0],
    work_order_id: woId,
    from_state: fromState,
    to_state: 'CONVERTED',
  });
}
