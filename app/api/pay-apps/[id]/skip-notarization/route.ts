/**
 * BAN-337 Pay Apps v2b — POST /api/pay-apps/[id]/skip-notarization
 *
 * Allowed only when the engagement's billing_format_config has
 * notarization_required=false (sticky bypass). Transitions PENDING_DRAFT or
 * READY_FOR_NOTARIZATION → READY_FOR_SUBMISSION directly and emits the
 * PAY_APP_NOTARIZATION_SKIPPED Pattern A event.
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
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, '/api/pay-apps/[id]/skip-notarization', 'project:edit');
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let reason = 'Notarization not required per engagement billing config';
  try {
    const body = await req.json() as { reason?: string };
    if (body?.reason && typeof body.reason === 'string') reason = body.reason;
  } catch {
    // body is optional
  }

  const lookup = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      state: pay_applications.state,
      engagement_id: pay_applications.engagement_id,
      pay_app_notarization_required: pay_applications.notarization_required,
      is_test: engagements.is_test_project,
    })
    .from(pay_applications)
    .innerJoin(engagements, eq(pay_applications.engagement_id, engagements.engagement_id))
    .where(and(
      eq(pay_applications.pay_app_id, id),
      eq(pay_applications.tenant_id, gate.tenantId),
    ))
    .limit(1);
  if (lookup.length === 0) {
    return NextResponse.json({ error: 'pay app not found' }, { status: 404 });
  }
  const payApp = lookup[0];

  const cfg = await db
    .select({ notarization_required: billing_format_config.notarization_required })
    .from(billing_format_config)
    .where(and(
      eq(billing_format_config.tenant_id, gate.tenantId),
      eq(billing_format_config.engagement_id, payApp.engagement_id),
    ))
    .limit(1);
  const cfgRequired = cfg[0]?.notarization_required;
  // Sticky bypass — the config row, when present, is canon. Fall back to the
  // pay-app's snapshot value when no config is provisioned.
  const required = cfgRequired ?? payApp.pay_app_notarization_required ?? true;

  if (required) {
    return NextResponse.json(
      {
        error: 'notarization_required is true for this engagement; cannot skip',
        code: 'NOTARIZATION_REQUIRED',
      },
      { status: 409 },
    );
  }

  if (payApp.state !== 'PENDING_DRAFT' && payApp.state !== 'READY_FOR_NOTARIZATION') {
    return NextResponse.json(
      {
        error: `pay app must be in PENDING_DRAFT or READY_FOR_NOTARIZATION (current: ${payApp.state})`,
        code: 'INVALID_STATE',
      },
      { status: 409 },
    );
  }

  try {
    await db.transaction(async (tx) => {
      await emitActivitySpineEvent(tx, {
        event_type: 'PAY_APP_NOTARIZATION_SKIPPED',
        scope_entity_type: 'project',
        scope_entity_id: payApp.engagement_id,
        entity_kind: 'pay_application',
        entity_id: id,
        notes: reason,
        test_data: !!payApp.is_test,
        metadata: {
          pay_app_id: id,
          reason,
          actor: gate.actorEmail,
        },
      });
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  const transition = await executePatternBTransition({
    entity: 'pay_application',
    table: pay_applications,
    pkColumn: pay_applications.pay_app_id,
    pkValue: id,
    tenantColumn: pay_applications.tenant_id,
    tenantId: gate.tenantId,
    stateColumn: pay_applications.state,
    toState: 'READY_FOR_SUBMISSION',
    reason,
    actorEmail: gate.actorEmail,
    testData: !!payApp.is_test,
    engagementId: payApp.engagement_id,
  });

  if (!transition.ok) {
    return NextResponse.json(
      { error: transition.message, code: transition.code },
      { status: transition.status },
    );
  }

  return NextResponse.json({
    ok: true,
    skipped: true,
    state: transition.to_state,
    from_state: transition.from_state,
    event_id: transition.event_id,
  });
}
