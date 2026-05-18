/**
 * BAN-338 Pay Apps v2c — POST /api/joint-check-agreements
 *
 * Creates a new joint check agreement (default status PROPOSED).
 */

import { NextResponse } from 'next/server';
import { db, joint_check_agreements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';

interface CreateBody {
  engagement_id?: string;
  manufacturer_org_id?: string;
  manufacturer_contact_name?: string;
  manufacturer_contact_email?: string;
  manufacturer_contact_phone?: string;
  scope?: string;
  trigger_source?: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
}

const ALLOWED_TRIGGER = ['GC_REQUIRED', 'MANUFACTURER_REQUESTED', 'KULA_PROPOSED'];

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, '/api/joint-check-agreements', 'project:edit');
  if (!gate.ok) return gate.response;

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.engagement_id || !body.manufacturer_org_id) {
    return NextResponse.json(
      { error: 'engagement_id and manufacturer_org_id are required' },
      { status: 400 },
    );
  }
  const trigger = (body.trigger_source ?? 'KULA_PROPOSED').trim();
  if (!ALLOWED_TRIGGER.includes(trigger)) {
    return NextResponse.json(
      { error: `trigger_source must be one of ${ALLOWED_TRIGGER.join(', ')}` },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(joint_check_agreements)
      .values({
        tenant_id: gate.tenantId,
        engagement_id: body.engagement_id!,
        manufacturer_org_id: body.manufacturer_org_id!,
        manufacturer_contact_name: body.manufacturer_contact_name ?? null,
        manufacturer_contact_email: body.manufacturer_contact_email ?? null,
        manufacturer_contact_phone: body.manufacturer_contact_phone ?? null,
        scope: body.scope ?? null,
        status: 'PROPOSED',
        trigger_source: trigger,
        start_date: body.start_date ?? null,
        end_date: body.end_date ?? null,
        notes: body.notes ?? null,
      })
      .returning();

    const row = inserted[0];
    const emit = await emitActivitySpineEvent(tx, {
      event_type: 'JOINT_CHECK_AGREEMENT_STATE_CHANGED',
      scope_entity_type: 'project',
      scope_entity_id: row.engagement_id,
      entity_kind: 'joint_check_agreement',
      entity_id: row.joint_check_id,
      notes: `Joint check agreement proposed with manufacturer ${row.manufacturer_org_id}`,
      reported_by: gate.actorEmail || null,
      test_data: false,
      metadata: {
        from_state: null,
        to_state: 'PROPOSED',
        manufacturer_org_id: row.manufacturer_org_id,
        trigger_source: trigger,
      },
    });
    return { row, eventId: emit.event_id };
  });

  return NextResponse.json({
    ok: true,
    joint_check_agreement: result.row,
    event_id: result.eventId,
  }, { status: 201 });
}
