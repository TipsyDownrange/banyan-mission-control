/**
 * BAN-342 PM-V1.0-C — POST /api/verbal-agreements/[id]/mark-followup-sent
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, verbal_agreements } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { passVerbalAgreementWriteGate } from '@/lib/pm/verbal-agreements/api-gate';
import { getVerbalAgreementForTenant, optionalString } from '@/lib/pm/verbal-agreements/route-utils';
import { validateVerbalAgreementTransition } from '@/lib/pm/verbal-agreements/state-machine';

const ROUTE_PATH = '/api/verbal-agreements/[id]/mark-followup-sent';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passVerbalAgreementWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const existing = await getVerbalAgreementForTenant(gate.tenantId, id);
  if (!existing) return NextResponse.json({ error: 'verbal agreement not found' }, { status: 404 });

  const validation = validateVerbalAgreementTransition(existing.status, 'FOLLOWED_UP');
  if (!validation.ok) return NextResponse.json({ error: validation.message, code: validation.reason }, { status: 400 });

  const sentDate = optionalString(body.followup_email_sent_date) ?? new Date().toISOString().slice(0, 10);
  const followupDriveId = optionalString(body.written_followup_email_drive_id);

  const result = await db.transaction(async (tx) => {
    const updates: Record<string, unknown> = {
      followup_email_sent: true,
      followup_email_sent_date: sentDate,
      status: 'FOLLOWED_UP',
      updated_at: new Date(),
    };
    if (followupDriveId) updates.written_followup_email_drive_id = followupDriveId;

    const updated = await tx
      .update(verbal_agreements)
      .set(updates)
      .where(
        and(
          eq(verbal_agreements.verbal_agreement_id, id),
          eq(verbal_agreements.tenant_id, gate.tenantId),
        ),
      )
      .returning();

    const event = await emitActivitySpineEvent(tx, {
      event_type: 'VERBAL_AGREEMENT_FOLLOWUP_SENT',
      scope_entity_type: 'project',
      scope_entity_id: existing.engagement_id,
      entity_kind: 'verbal_agreement',
      entity_id: existing.verbal_agreement_id,
      kid: existing.kid ?? null,
      test_data: existing.is_test_project === true,
      metadata: {
        from_state: existing.status,
        to_state: 'FOLLOWED_UP',
        followup_email_sent_date: sentDate,
        written_followup_email_drive_id: followupDriveId,
        actor: gate.actorEmail,
      },
    });

    return { verbal_agreement: updated[0], event_id: event.event_id };
  });

  return NextResponse.json({ ok: true, ...result });
}
