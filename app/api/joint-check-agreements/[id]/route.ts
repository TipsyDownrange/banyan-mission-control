/**
 * BAN-338 Pay Apps v2c — GET + PATCH /api/joint-check-agreements/[id]
 *
 * PATCH lifts the row's lifecycle through PROPOSED → EXECUTED → ACTIVE →
 * CLOSED (with DISPUTED side-branch). Every status change emits a
 * JOINT_CHECK_AGREEMENT_STATE_CHANGED event with from/to_state in metadata.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, joint_check_agreements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PROPOSED: ['EXECUTED', 'CLOSED', 'DISPUTED'],
  EXECUTED: ['ACTIVE', 'DISPUTED', 'CLOSED'],
  ACTIVE: ['CLOSED', 'DISPUTED'],
  DISPUTED: ['EXECUTED', 'ACTIVE', 'CLOSED'],
  CLOSED: [],
};

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const rows = await db
    .select()
    .from(joint_check_agreements)
    .where(and(eq(joint_check_agreements.tenant_id, gate.tenantId), eq(joint_check_agreements.joint_check_id, id)))
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'joint check agreement not found' }, { status: 404 });
  }
  return NextResponse.json({ joint_check_agreement: rows[0] });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaApiGate(req, '/api/joint-check-agreements/[id]', 'project:edit');
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let body: {
    status?: string;
    execution_date?: string;
    execution_evidence_drive_id?: string;
    start_date?: string;
    end_date?: string;
    notes?: string;
    scope?: string;
    manufacturer_contact_name?: string;
    manufacturer_contact_email?: string;
    manufacturer_contact_phone?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const lookup = await db
    .select()
    .from(joint_check_agreements)
    .where(and(eq(joint_check_agreements.tenant_id, gate.tenantId), eq(joint_check_agreements.joint_check_id, id)))
    .limit(1);
  if (lookup.length === 0) {
    return NextResponse.json({ error: 'joint check agreement not found' }, { status: 404 });
  }
  const row = lookup[0];

  if (body.status && body.status !== row.status) {
    const allowed = ALLOWED_TRANSITIONS[row.status] ?? [];
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        {
          error: `joint check agreement transition ${row.status} → ${body.status} not allowed`,
          code: 'INVALID_TRANSITION',
        },
        { status: 409 },
      );
    }
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date(),
  };
  if (body.status) patch.status = body.status;
  if (body.execution_date !== undefined) patch.execution_date = body.execution_date;
  if (body.execution_evidence_drive_id !== undefined) patch.execution_evidence_drive_id = body.execution_evidence_drive_id;
  if (body.start_date !== undefined) patch.start_date = body.start_date;
  if (body.end_date !== undefined) patch.end_date = body.end_date;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.scope !== undefined) patch.scope = body.scope;
  if (body.manufacturer_contact_name !== undefined) patch.manufacturer_contact_name = body.manufacturer_contact_name;
  if (body.manufacturer_contact_email !== undefined) patch.manufacturer_contact_email = body.manufacturer_contact_email;
  if (body.manufacturer_contact_phone !== undefined) patch.manufacturer_contact_phone = body.manufacturer_contact_phone;

  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(joint_check_agreements)
      .set(patch)
      .where(and(
        eq(joint_check_agreements.tenant_id, gate.tenantId),
        eq(joint_check_agreements.joint_check_id, id),
      ))
      .returning();
    const newRow = updated[0];

    let eventId: string | null = null;
    if (body.status && body.status !== row.status) {
      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'JOINT_CHECK_AGREEMENT_STATE_CHANGED',
        scope_entity_type: 'project',
        scope_entity_id: newRow.engagement_id,
        entity_kind: 'joint_check_agreement',
        entity_id: id,
        notes: `Joint check agreement ${row.status} → ${body.status}`,
        reported_by: gate.actorEmail || null,
        test_data: false,
        metadata: {
          from_state: row.status,
          to_state: body.status,
        },
      });
      eventId = emit.event_id;
    }

    return { newRow, eventId };
  });

  return NextResponse.json({
    ok: true,
    joint_check_agreement: result.newRow,
    event_id: result.eventId,
  });
}
