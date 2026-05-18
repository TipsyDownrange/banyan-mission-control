/**
 * BAN-336 Pay App Core — POST /api/pay-apps/[id]/reject
 *
 * Records a rejection_reason / rejection_at / rejection_actor_id stamp
 * then drives the canonical PENDING_DRAFT branch (any-state → REJECTED →
 * PENDING_DRAFT) using the executor.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  pay_applications,
  engagements,
  users as usersTable,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executePatternBTransition } from '@/lib/aia/execute-state-transition';

interface Body {
  reason: string;
  return_to_pending?: boolean;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, '/api/pay-apps/[id]/reject', 'project:edit');
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: Body;
  try { body = await req.json(); } catch { body = { reason: '' }; }
  if (!body.reason || body.reason.trim().length === 0) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 });
  }

  const row = await db
    .select()
    .from(pay_applications)
    .where(and(
      eq(pay_applications.pay_app_id, id),
      eq(pay_applications.tenant_id, gate.tenantId),
    ))
    .limit(1);
  if (row.length === 0) {
    return NextResponse.json({ error: 'pay app not found' }, { status: 404 });
  }

  const eng = await db
    .select({ is_test: engagements.is_test_project })
    .from(engagements)
    .where(eq(engagements.engagement_id, row[0].engagement_id))
    .limit(1);

  let actorUserId: string | null = null;
  if (gate.actorEmail) {
    const u = await db
      .select({ id: usersTable.user_id })
      .from(usersTable)
      .where(eq(usersTable.email, gate.actorEmail))
      .limit(1);
    actorUserId = u[0]?.id ?? null;
  }

  // Step 1: any-state → REJECTED
  const toRejected = await executePatternBTransition({
    entity: 'pay_application',
    table: pay_applications,
    pkColumn: pay_applications.pay_app_id,
    pkValue: id,
    tenantColumn: pay_applications.tenant_id,
    tenantId: gate.tenantId,
    stateColumn: pay_applications.state,
    toState: 'REJECTED',
    reason: body.reason,
    actorEmail: gate.actorEmail,
    testData: !!eng[0]?.is_test,
    engagementId: row[0].engagement_id,
  });
  if (!toRejected.ok) {
    return NextResponse.json(
      { error: toRejected.message, code: toRejected.code },
      { status: toRejected.status },
    );
  }

  await db
    .update(pay_applications)
    .set({
      rejection_reason: body.reason,
      rejection_at: new Date(),
      rejection_actor_id: actorUserId,
      rejected_at: new Date(),
    })
    .where(and(
      eq(pay_applications.pay_app_id, id),
      eq(pay_applications.tenant_id, gate.tenantId),
    ));

  if (body.return_to_pending === false) {
    return NextResponse.json({ ok: true, state: 'REJECTED' });
  }

  // Step 2: REJECTED → PENDING_DRAFT (per spec — rejection branch returns to draft)
  const toDraft = await executePatternBTransition({
    entity: 'pay_application',
    table: pay_applications,
    pkColumn: pay_applications.pay_app_id,
    pkValue: id,
    tenantColumn: pay_applications.tenant_id,
    tenantId: gate.tenantId,
    stateColumn: pay_applications.state,
    toState: 'PENDING_DRAFT',
    reason: `Returned to draft after rejection: ${body.reason}`,
    actorEmail: gate.actorEmail,
    testData: !!eng[0]?.is_test,
    engagementId: row[0].engagement_id,
  });
  if (!toDraft.ok) {
    return NextResponse.json(
      { ok: true, state: 'REJECTED', warning: `Returned-to-draft step failed: ${toDraft.message}` },
    );
  }

  return NextResponse.json({ ok: true, state: 'PENDING_DRAFT', rejection_reason: body.reason });
}
