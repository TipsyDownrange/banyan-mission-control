/**
 * BAN-337 Pay Apps v2b — POST /api/pay-apps/[id]/submit-direct
 *
 * Direct submission path (gc_billing_intake_platform=DIRECT). Records the
 * outbound email/handoff to the GC certifier on
 * billing_format_config.gc_certifier_email, transitions the pay app
 * READY_FOR_SUBMISSION → SUBMITTED, and emits PAY_APP_SUBMITTED with
 * method=DIRECT_EMAIL.
 *
 * Email delivery itself is queued via the existing notify pipeline (out of
 * scope for v2b — this endpoint records the intent and the recipient).
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
import { runAutoLienWaiverHook } from '@/lib/lien-waivers/post-transition-hook';
import { hasActiveJointCheckAgreement } from '@/lib/lien-waivers/joint-check-active';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, '/api/pay-apps/[id]/submit-direct', 'project:edit');
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let body: { recipient_override?: string; cc?: string[]; note?: string } = {};
  try { body = await req.json(); } catch { /* body optional */ }

  const lookup = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      pay_app_number: pay_applications.pay_app_number,
      state: pay_applications.state,
      engagement_id: pay_applications.engagement_id,
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
    .select({
      gc_certifier_email: billing_format_config.gc_certifier_email,
      gc_certifier_name: billing_format_config.gc_certifier_name,
      gc_billing_intake_platform: billing_format_config.gc_billing_intake_platform,
    })
    .from(billing_format_config)
    .where(and(
      eq(billing_format_config.tenant_id, gate.tenantId),
      eq(billing_format_config.engagement_id, payApp.engagement_id),
    ))
    .limit(1);

  const recipient = body.recipient_override ?? cfg[0]?.gc_certifier_email ?? null;
  if (!recipient || !/.+@.+\..+/.test(recipient)) {
    return NextResponse.json(
      {
        error: 'No recipient email configured (billing_format_config.gc_certifier_email)',
        code: 'MISSING_GC_CERTIFIER_EMAIL',
      },
      { status: 422 },
    );
  }

  // Block test-data submission to a real GC recipient when not on a test mailbox.
  if (payApp.is_test) {
    const looksLikeRealRecipient =
      !/test|sandbox|staging|example/i.test(recipient);
    if (looksLikeRealRecipient) {
      return NextResponse.json(
        {
          error:
            'Test-data pay app cannot be submitted to a non-test recipient. Use a test mailbox or set is_test_project=false on the engagement.',
          code: 'TEST_PROJECT_BLOCKED_REAL_RECIPIENT',
        },
        { status: 409 },
      );
    }
  }

  if (payApp.state !== 'READY_FOR_SUBMISSION') {
    return NextResponse.json(
      {
        error: `pay app must be READY_FOR_SUBMISSION (current: ${payApp.state})`,
        code: 'INVALID_STATE',
      },
      { status: 409 },
    );
  }

  // BAN-338 v2c — surface joint-check footer text when an active agreement
  // exists for the engagement. The footer is computed up-front so it lands
  // in the spine emit metadata and in the response (callers reuse it for
  // the actual outbound email body).
  const jointCheck = await hasActiveJointCheckAgreement(gate.tenantId, payApp.engagement_id);

  // Emit PAY_APP_SUBMITTED first so the event is durable even if the
  // transition fails (will roll back state-only inside the executor).
  await db.transaction(async (tx) => {
    await emitActivitySpineEvent(tx, {
      event_type: 'PAY_APP_SUBMITTED',
      scope_entity_type: 'project',
      scope_entity_id: payApp.engagement_id,
      entity_kind: 'pay_application',
      entity_id: id,
      notes: body.note ?? `Submitted direct to ${recipient}`,
      test_data: !!payApp.is_test,
      metadata: {
        method: 'DIRECT_EMAIL',
        recipient,
        cc: body.cc ?? [],
        gc_certifier_name: cfg[0]?.gc_certifier_name ?? null,
        intake_platform: cfg[0]?.gc_billing_intake_platform ?? 'DIRECT',
        pay_app_number: payApp.pay_app_number,
        actor: gate.actorEmail,
        joint_check_footer: jointCheck.footer || null,
        joint_check_agreement_ids: jointCheck.agreementIds,
      },
    });
  });

  const transition = await executePatternBTransition({
    entity: 'pay_application',
    table: pay_applications,
    pkColumn: pay_applications.pay_app_id,
    pkValue: id,
    tenantColumn: pay_applications.tenant_id,
    tenantId: gate.tenantId,
    stateColumn: pay_applications.state,
    toState: 'SUBMITTED',
    reason: `Submitted direct to ${recipient}`,
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

  // Stamp submitted_at on the row.
  await db
    .update(pay_applications)
    .set({ submitted_at: new Date(), updated_at: new Date() })
    .where(and(
      eq(pay_applications.pay_app_id, id),
      eq(pay_applications.tenant_id, gate.tenantId),
    ));

  // BAN-338 v2c — auto-generate CONDITIONAL_{PROGRESS|FINAL} waiver
  const waiverHook = await runAutoLienWaiverHook({
    tenantId: gate.tenantId,
    payAppId: id,
    toState: transition.to_state,
    actorEmail: gate.actorEmail,
  });

  return NextResponse.json({
    ok: true,
    method: 'DIRECT_EMAIL',
    recipient,
    state: transition.to_state,
    from_state: transition.from_state,
    event_id: transition.event_id,
    joint_check_footer: jointCheck.footer || null,
    joint_check_agreement_ids: jointCheck.agreementIds,
    auto_waiver: waiverHook,
  });
}
