/**
 * BAN-337 Pay Apps v2b — POST /api/pay-apps/[id]/log-textura-upload
 *
 * PM records that they manually uploaded the assembled Textura bundle into
 * the Textura web portal. Updates the most recent textura_submissions row
 * (status GENERATED → UPLOADED_TO_TEXTURA), stamps the external Textura
 * submission id (when provided), transitions the pay app
 * READY_FOR_SUBMISSION → SUBMITTED, and emits PAY_APP_SUBMITTED with
 * method=TEXTURA_MANUAL_UPLOAD.
 *
 * IMPORTANT: zero outbound Textura API calls — this is a logging endpoint
 * for the manual portal handoff.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import {
  db,
  pay_applications,
  engagements,
  textura_submissions,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executePatternBTransition } from '@/lib/aia/execute-state-transition';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, '/api/pay-apps/[id]/log-textura-upload', 'project:edit');
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let body: { textura_submission_id_external?: string; note?: string } = {};
  try { body = await req.json(); } catch { /* optional */ }

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

  if (payApp.state !== 'READY_FOR_SUBMISSION') {
    return NextResponse.json(
      {
        error: `pay app must be READY_FOR_SUBMISSION (current: ${payApp.state})`,
        code: 'INVALID_STATE',
      },
      { status: 409 },
    );
  }

  // Latest textura_submissions row for this pay app (typically the GENERATED bundle).
  const latest = await db
    .select({
      submission_id: textura_submissions.submission_id,
      submission_status: textura_submissions.submission_status,
    })
    .from(textura_submissions)
    .where(and(
      eq(textura_submissions.tenant_id, gate.tenantId),
      eq(textura_submissions.pay_app_id, id),
    ))
    .orderBy(desc(textura_submissions.submitted_at))
    .limit(1);

  let submissionId: string;
  if (latest.length > 0) {
    submissionId = latest[0].submission_id;
    await db
      .update(textura_submissions)
      .set({
        submission_status: 'UPLOADED_TO_TEXTURA',
        textura_submission_id_external: body.textura_submission_id_external ?? null,
        submitted_at: new Date(),
        updated_at: new Date(),
      })
      .where(and(
        eq(textura_submissions.submission_id, submissionId),
        eq(textura_submissions.tenant_id, gate.tenantId),
      ));
  } else {
    // No prior bundle row — still record the manual upload event.
    const inserted = await db
      .insert(textura_submissions)
      .values({
        tenant_id: gate.tenantId,
        engagement_id: payApp.engagement_id,
        pay_app_id: id,
        submission_status: 'UPLOADED_TO_TEXTURA',
        textura_submission_id_external: body.textura_submission_id_external ?? null,
      })
      .returning({ submission_id: textura_submissions.submission_id });
    submissionId = inserted[0].submission_id;
  }

  // PAY_APP_SUBMITTED Pattern A emit + state transition.
  await db.transaction(async (tx) => {
    await emitActivitySpineEvent(tx, {
      event_type: 'PAY_APP_SUBMITTED',
      scope_entity_type: 'project',
      scope_entity_id: payApp.engagement_id,
      entity_kind: 'pay_application',
      entity_id: id,
      notes: body.note ?? 'Textura manual upload',
      test_data: !!payApp.is_test,
      metadata: {
        method: 'TEXTURA_MANUAL_UPLOAD',
        textura_submission_id: submissionId,
        textura_submission_id_external: body.textura_submission_id_external ?? null,
        pay_app_number: payApp.pay_app_number,
        actor: gate.actorEmail,
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
    reason: 'Textura manual upload logged',
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

  await db
    .update(pay_applications)
    .set({ submitted_at: new Date(), updated_at: new Date() })
    .where(and(
      eq(pay_applications.pay_app_id, id),
      eq(pay_applications.tenant_id, gate.tenantId),
    ));

  return NextResponse.json({
    ok: true,
    method: 'TEXTURA_MANUAL_UPLOAD',
    textura_submission_id: submissionId,
    textura_submission_id_external: body.textura_submission_id_external ?? null,
    state: transition.to_state,
    from_state: transition.from_state,
    event_id: transition.event_id,
  });
}
