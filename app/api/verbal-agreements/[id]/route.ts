/**
 * BAN-342 PM-V1.0-C — GET/PATCH /api/verbal-agreements/[id]
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, verbal_agreements } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { passVerbalAgreementWriteGate } from '@/lib/pm/verbal-agreements/api-gate';
import {
  getVerbalAgreementForTenant,
  optionalInteger,
  optionalNumberString,
  optionalString,
  optionalStringArray,
  parseAgreementType,
  parseStatus,
  SUBJECT_MAX,
} from '@/lib/pm/verbal-agreements/route-utils';
import { validateVerbalAgreementTransition } from '@/lib/pm/verbal-agreements/state-machine';

const ROUTE_PATH = '/api/verbal-agreements/[id]';

const PATCH_ALLOWED_FIELDS = new Set<string>([
  'occurred_at',
  'subject',
  'external_party_org',
  'external_party_contact_name',
  'external_party_contact_role',
  'external_party_contact_email',
  'external_party_contact_phone',
  'agreement_type',
  'cost_impact_estimate',
  'schedule_impact_days',
  'agreement_summary',
  'context_or_circumstances',
  'audio_recording_drive_id',
  'photo_documentation_drive_ids',
  'written_followup_email_drive_id',
  'external_visible',
  'status',
]);

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const row = await getVerbalAgreementForTenant(gate.tenantId, id);
  if (!row) return NextResponse.json({ error: 'verbal agreement not found' }, { status: 404 });
  return NextResponse.json({ verbal_agreement: row });
}

export async function PATCH(
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const existing = await getVerbalAgreementForTenant(gate.tenantId, id);
  if (!existing) return NextResponse.json({ error: 'verbal agreement not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!PATCH_ALLOWED_FIELDS.has(k)) continue;
    if (k === 'subject') {
      const subject = optionalString(v);
      if (!subject) return NextResponse.json({ error: 'subject cannot be blank' }, { status: 400 });
      if (subject.length > SUBJECT_MAX) return NextResponse.json({ error: `subject must be ${SUBJECT_MAX} characters or fewer` }, { status: 400 });
      updates.subject = subject;
    } else if (k === 'agreement_type') {
      updates.agreement_type = parseAgreementType(v);
    } else if (k === 'cost_impact_estimate') {
      updates.cost_impact_estimate = optionalNumberString(v);
    } else if (k === 'schedule_impact_days') {
      updates.schedule_impact_days = optionalInteger(v);
    } else if (k === 'photo_documentation_drive_ids') {
      updates.photo_documentation_drive_ids = optionalStringArray(v);
    } else if (k === 'external_visible') {
      updates.external_visible = v === true;
    } else if (k === 'status') {
      const toStatus = parseStatus(v);
      if (!toStatus || (toStatus !== 'DISPUTED' && toStatus !== 'RESOLVED')) {
        return NextResponse.json({ error: 'status PATCH may only set DISPUTED or RESOLVED' }, { status: 400 });
      }
      const validation = validateVerbalAgreementTransition(existing.status, toStatus);
      if (!validation.ok) return NextResponse.json({ error: validation.message, code: validation.reason }, { status: 400 });
      updates.status = toStatus;
    } else if (k === 'occurred_at') {
      const occurred = optionalString(v);
      if (occurred) updates.occurred_at = new Date(occurred);
    } else {
      updates[k] = optionalString(v);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No allowed fields provided in PATCH body' }, { status: 400 });
  }
  updates.updated_at = new Date();

  const result = await db.transaction(async (tx) => {
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

    let event_id: string | null = null;
    if (updates.status === 'RESOLVED') {
      const event = await emitActivitySpineEvent(tx, {
        event_type: 'VERBAL_AGREEMENT_RESOLVED',
        scope_entity_type: 'project',
        scope_entity_id: existing.engagement_id,
        entity_kind: 'verbal_agreement',
        entity_id: existing.verbal_agreement_id,
        kid: existing.kid ?? null,
        test_data: existing.is_test_project === true,
        metadata: {
          from_state: existing.status,
          to_state: 'RESOLVED',
          subject: existing.subject,
          actor: gate.actorEmail,
        },
      });
      event_id = event.event_id;
    }

    return { verbal_agreement: updated[0], event_id };
  });

  return NextResponse.json({ ok: true, ...result });
}
