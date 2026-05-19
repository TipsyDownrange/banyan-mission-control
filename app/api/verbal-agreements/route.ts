/**
 * BAN-342 PM-V1.0-C — POST /api/verbal-agreements
 *
 * Logs a verbal agreement against a project engagement and emits the
 * VERBAL_AGREEMENT_LOGGED Pattern A event in the same transaction.
 */

import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db, engagements, verbal_agreements } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { dispatchSourceEvent } from '@/lib/pm/action-items/spine-subscriber';
import { passVerbalAgreementWriteGate } from '@/lib/pm/verbal-agreements/api-gate';
import {
  optionalInteger,
  optionalNumberString,
  optionalString,
  optionalStringArray,
  parseAgreementType,
  SUBJECT_MAX,
  trimString,
} from '@/lib/pm/verbal-agreements/route-utils';

const ROUTE_PATH = '/api/verbal-agreements';

export async function POST(req: Request) {
  const gate = await passVerbalAgreementWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const engagementKid = trimString(body.engagement_kid);
  const subject = trimString(body.subject);
  const externalPartyOrg = trimString(body.external_party_org);
  const agreementSummary = trimString(body.agreement_summary);
  const occurredAt = trimString(body.occurred_at) || new Date().toISOString();

  if (!engagementKid) return NextResponse.json({ error: 'engagement_kid is required' }, { status: 400 });
  if (!subject) return NextResponse.json({ error: 'subject is required' }, { status: 400 });
  if (subject.length > SUBJECT_MAX) {
    return NextResponse.json({ error: `subject must be ${SUBJECT_MAX} characters or fewer` }, { status: 400 });
  }
  if (!externalPartyOrg) return NextResponse.json({ error: 'external_party_org is required' }, { status: 400 });
  if (!agreementSummary) return NextResponse.json({ error: 'agreement_summary is required' }, { status: 400 });

  try {
    const result = await db.transaction(async (tx) => {
      const engagementRows = await tx
        .select({
          engagement_id: engagements.engagement_id,
          kid: engagements.kid,
          is_test_project: engagements.is_test_project,
        })
        .from(engagements)
        .where(
          and(
            eq(engagements.tenant_id, gate.tenantId),
            eq(engagements.kid, engagementKid),
          ),
        )
        .limit(1);

      if (engagementRows.length === 0) return { kind: 'not_found' as const };
      const engagement = engagementRows[0];

      const inserted = await tx
        .insert(verbal_agreements)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagement.engagement_id,
          occurred_at: new Date(occurredAt),
          subject,
          external_party_org: externalPartyOrg,
          external_party_contact_name: optionalString(body.external_party_contact_name),
          external_party_contact_role: optionalString(body.external_party_contact_role),
          external_party_contact_email: optionalString(body.external_party_contact_email),
          external_party_contact_phone: optionalString(body.external_party_contact_phone),
          agreement_type: parseAgreementType(body.agreement_type),
          cost_impact_estimate: optionalNumberString(body.cost_impact_estimate),
          schedule_impact_days: optionalInteger(body.schedule_impact_days),
          agreement_summary: agreementSummary,
          context_or_circumstances: optionalString(body.context_or_circumstances),
          audio_recording_drive_id: optionalString(body.audio_recording_drive_id),
          photo_documentation_drive_ids: optionalStringArray(body.photo_documentation_drive_ids),
          written_followup_email_drive_id: optionalString(body.written_followup_email_drive_id),
          external_visible: body.external_visible === true,
          status: 'LOGGED',
        })
        .returning();

      const agreement = inserted[0];
      const event = await emitActivitySpineEvent(tx, {
        event_type: 'VERBAL_AGREEMENT_LOGGED',
        scope_entity_type: 'project',
        scope_entity_id: engagement.engagement_id,
        entity_kind: 'verbal_agreement',
        entity_id: agreement.verbal_agreement_id,
        kid: engagement.kid ?? null,
        test_data: engagement.is_test_project === true,
        metadata: {
          subject,
          external_party_org: externalPartyOrg,
          agreement_type: agreement.agreement_type,
          actor: gate.actorEmail,
        },
      });

      return {
        kind: 'ok' as const,
        agreement,
        event_id: event.event_id,
        engagement_id: engagement.engagement_id,
        engagement_kid: engagement.kid ?? null,
        is_test_project: engagement.is_test_project === true,
        subject,
      };
    });

    if (result.kind === 'not_found') {
      return NextResponse.json({ error: `engagement not found for kid: ${engagementKid}` }, { status: 404 });
    }

    // BAN-344 PM-V1.0-E — Action Item Tracker subscriber.  A new verbal
    // agreement triggers a CONFIRM action item to send written follow-up.
    await dispatchSourceEvent({
      eventType: 'VERBAL_AGREEMENT_LOGGED',
      entityKind: 'verbal_agreement',
      entityId: result.agreement.verbal_agreement_id,
      tenantId: gate.tenantId,
      engagementId: result.engagement_id,
      kid: result.engagement_kid,
      isTestProject: result.is_test_project,
      metadata: { summary: result.subject },
      actorEmail: gate.actorEmail,
    });

    return NextResponse.json({ ok: true, verbal_agreement: result.agreement, event_id: result.event_id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
