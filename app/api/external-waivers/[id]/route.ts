/**
 * BAN-338 Pay Apps v2c — GET + PATCH /api/external-waivers/[id]
 *
 * PATCH lifts the row's lifecycle through REQUESTED → RECEIVED → UPLOADED →
 * DELIVERED_TO_GC (VOIDED side branch). Every status change emits an
 * EXTERNAL_LIEN_WAIVER_STATE_CHANGED event.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, external_lien_waiver_requests } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['RECEIVED', 'VOIDED'],
  RECEIVED: ['UPLOADED', 'VOIDED'],
  UPLOADED: ['DELIVERED_TO_GC', 'VOIDED'],
  DELIVERED_TO_GC: ['VOIDED'],
  VOIDED: [],
};

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const rows = await db
    .select()
    .from(external_lien_waiver_requests)
    .where(and(
      eq(external_lien_waiver_requests.tenant_id, gate.tenantId),
      eq(external_lien_waiver_requests.external_waiver_id, id),
    ))
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'external waiver not found' }, { status: 404 });
  }
  return NextResponse.json({ external_waiver: rows[0] });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaApiGate(req, '/api/external-waivers/[id]', 'project:edit');
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let body: {
    status?: string;
    notes?: string;
    manufacturer_contact_name?: string;
    manufacturer_contact_email?: string;
    request_method?: string;
    request_evidence_drive_id?: string;
    received_evidence_drive_id?: string;
    delivered_to_gc_evidence_drive_id?: string;
    pay_app_id?: string;
    joint_check_agreement_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const lookup = await db
    .select()
    .from(external_lien_waiver_requests)
    .where(and(
      eq(external_lien_waiver_requests.tenant_id, gate.tenantId),
      eq(external_lien_waiver_requests.external_waiver_id, id),
    ))
    .limit(1);
  if (lookup.length === 0) {
    return NextResponse.json({ error: 'external waiver not found' }, { status: 404 });
  }
  const row = lookup[0];

  if (body.status && body.status !== row.status) {
    const allowed = ALLOWED_TRANSITIONS[row.status] ?? [];
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        {
          error: `external waiver transition ${row.status} → ${body.status} not allowed`,
          code: 'INVALID_TRANSITION',
        },
        { status: 409 },
      );
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (body.status) patch.status = body.status;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.manufacturer_contact_name !== undefined) patch.manufacturer_contact_name = body.manufacturer_contact_name;
  if (body.manufacturer_contact_email !== undefined) patch.manufacturer_contact_email = body.manufacturer_contact_email;
  if (body.request_method !== undefined) patch.request_method = body.request_method;
  if (body.request_evidence_drive_id !== undefined) patch.request_evidence_drive_id = body.request_evidence_drive_id;
  if (body.received_evidence_drive_id !== undefined) patch.received_evidence_drive_id = body.received_evidence_drive_id;
  if (body.delivered_to_gc_evidence_drive_id !== undefined) patch.delivered_to_gc_evidence_drive_id = body.delivered_to_gc_evidence_drive_id;
  if (body.pay_app_id !== undefined) patch.pay_app_id = body.pay_app_id;
  if (body.joint_check_agreement_id !== undefined) patch.joint_check_agreement_id = body.joint_check_agreement_id;

  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(external_lien_waiver_requests)
      .set(patch)
      .where(and(
        eq(external_lien_waiver_requests.tenant_id, gate.tenantId),
        eq(external_lien_waiver_requests.external_waiver_id, id),
      ))
      .returning();
    const newRow = updated[0];

    let eventId: string | null = null;
    if (body.status && body.status !== row.status) {
      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'EXTERNAL_LIEN_WAIVER_STATE_CHANGED',
        scope_entity_type: 'project',
        scope_entity_id: newRow.engagement_id,
        entity_kind: 'external_lien_waiver_request',
        entity_id: id,
        notes: `External waiver ${row.status} → ${body.status}`,
        reported_by: gate.actorEmail || null,
        test_data: false,
        metadata: {
          from_state: row.status,
          to_state: body.status,
          waiver_type: row.waiver_type,
          manufacturer_org_id: row.manufacturer_org_id,
        },
      });
      eventId = emit.event_id;
    }
    return { newRow, eventId };
  });

  return NextResponse.json({
    ok: true,
    external_waiver: result.newRow,
    event_id: result.eventId,
  });
}
