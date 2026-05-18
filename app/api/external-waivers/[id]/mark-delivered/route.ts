/**
 * BAN-338 Pay Apps v2c — POST /api/external-waivers/[id]/mark-delivered
 *
 * Marks an UPLOADED external waiver as DELIVERED_TO_GC, recording the
 * outbound evidence Drive id (typically a screenshot/email thread of the
 * forwarded waiver to the GC).
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, external_lien_waiver_requests } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaApiGate(req, '/api/external-waivers/[id]/mark-delivered', 'project:edit');
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let body: { delivered_to_gc_evidence_drive_id?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.delivered_to_gc_evidence_drive_id) {
    return NextResponse.json(
      { error: 'delivered_to_gc_evidence_drive_id is required' },
      { status: 400 },
    );
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
  if (row.status !== 'UPLOADED') {
    return NextResponse.json(
      {
        error: `mark-delivered requires status UPLOADED (current: ${row.status})`,
        code: 'INVALID_STATE',
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(external_lien_waiver_requests)
      .set({
        status: 'DELIVERED_TO_GC',
        delivered_to_gc_at: now,
        delivered_to_gc_evidence_drive_id: body.delivered_to_gc_evidence_drive_id!,
        notes: body.notes ?? row.notes,
        updated_at: now,
      })
      .where(and(
        eq(external_lien_waiver_requests.tenant_id, gate.tenantId),
        eq(external_lien_waiver_requests.external_waiver_id, id),
      ))
      .returning();
    const newRow = updated[0];

    const emit = await emitActivitySpineEvent(tx, {
      event_type: 'EXTERNAL_LIEN_WAIVER_STATE_CHANGED',
      scope_entity_type: 'project',
      scope_entity_id: newRow.engagement_id,
      entity_kind: 'external_lien_waiver_request',
      entity_id: id,
      notes: `External waiver delivered to GC`,
      reported_by: gate.actorEmail || null,
      test_data: false,
      metadata: {
        from_state: 'UPLOADED',
        to_state: 'DELIVERED_TO_GC',
        delivered_to_gc_evidence_drive_id: body.delivered_to_gc_evidence_drive_id,
        waiver_type: row.waiver_type,
      },
    });
    return { newRow, eventId: emit.event_id };
  });

  return NextResponse.json({
    ok: true,
    external_waiver: result.newRow,
    event_id: result.eventId,
  });
}
