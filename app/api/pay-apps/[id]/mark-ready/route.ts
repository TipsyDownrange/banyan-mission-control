/**
 * BAN-336 Pay App Core — POST /api/pay-apps/[id]/mark-ready
 *
 * Transitions PENDING_DRAFT → READY_FOR_SUBMISSION (or
 * READY_FOR_NOTARIZATION if billing_format_config.notarization_required is
 * true on the engagement). Pattern B executor emits PAY_APP_STATE_CHANGED.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  pay_applications,
  engagements,
  billing_format_config,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executePatternBTransition } from '@/lib/aia/execute-state-transition';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, '/api/pay-apps/[id]/mark-ready', 'project:edit');
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
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
  const payApp = row[0];

  const [eng, cfg] = await Promise.all([
    db
      .select({ is_test: engagements.is_test_project })
      .from(engagements)
      .where(eq(engagements.engagement_id, payApp.engagement_id))
      .limit(1),
    db
      .select({ notarization_required: billing_format_config.notarization_required })
      .from(billing_format_config)
      .where(and(
        eq(billing_format_config.tenant_id, gate.tenantId),
        eq(billing_format_config.engagement_id, payApp.engagement_id),
      ))
      .limit(1),
  ]);

  // Spec default: notarization_required = true
  const requireNotarization = cfg[0]?.notarization_required ?? payApp.notarization_required ?? true;
  const toState = requireNotarization ? 'READY_FOR_NOTARIZATION' : 'READY_FOR_SUBMISSION';

  const result = await executePatternBTransition({
    entity: 'pay_application',
    table: pay_applications,
    pkColumn: pay_applications.pay_app_id,
    pkValue: id,
    tenantColumn: pay_applications.tenant_id,
    tenantId: gate.tenantId,
    stateColumn: pay_applications.state,
    toState,
    actorEmail: gate.actorEmail,
    testData: !!eng[0]?.is_test,
    engagementId: payApp.engagement_id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }
  return NextResponse.json({
    ok: true,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
  });
}
