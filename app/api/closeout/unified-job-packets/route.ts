/**
 * BAN-311 Pass 3b.2 PR 2 — POST /api/closeout/unified-job-packets
 *
 * Closeout v1.1 §12.4 step 5 — INSERTs a unified_job_packets row + emits
 * DELIVERABLE_PRODUCED (Pattern A) with payload {deliverable_type:
 * UNIFIED_JOB_PACKET, drive_id, template_version, packet_id}.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, unified_job_packets, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';

const ROUTE_PATH = '/api/closeout/unified-job-packets';

interface CreateBody {
  engagement_id?: string;
  template_version?: string;
  drive_file_id?: string;
  generated_by?: string;
  sections_included?: unknown[];
}

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const engagementId = (body.engagement_id ?? '').trim();
  const templateVersion = (body.template_version ?? '').trim();
  const driveFileId = (body.drive_file_id ?? '').trim();

  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
  }
  if (!templateVersion) {
    return NextResponse.json({ error: 'template_version is required' }, { status: 400 });
  }
  if (!driveFileId) {
    return NextResponse.json({ error: 'drive_file_id is required' }, { status: 400 });
  }

  const eng = await db
    .select({ engagement_id: engagements.engagement_id, is_test_project: engagements.is_test_project })
    .from(engagements)
    .where(and(eq(engagements.engagement_id, engagementId), eq(engagements.tenant_id, gate.tenantId)))
    .limit(1);
  if (eng.length === 0) {
    return NextResponse.json({ error: `engagement ${engagementId} not found` }, { status: 404 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(unified_job_packets)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagementId,
          template_version: templateVersion,
          drive_file_id: driveFileId,
          generated_by: body.generated_by ?? null,
          sections_included: body.sections_included ?? [],
        })
        .returning({ packet_id: unified_job_packets.packet_id });

      const packet = inserted[0];
      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'DELIVERABLE_PRODUCED',
        scope_entity_type: 'project',
        scope_entity_id: engagementId,
        entity_kind: 'unified_job_packet',
        entity_id: packet.packet_id,
        test_data: eng[0].is_test_project === true,
        metadata: {
          deliverable_type: 'UNIFIED_JOB_PACKET',
          packet_id: packet.packet_id,
          drive_file_id: driveFileId,
          template_version: templateVersion,
          actor: gate.actorEmail,
        },
      });

      return { packet_id: packet.packet_id, event_id: emit.event_id };
    });

    return NextResponse.json(
      { ok: true, engagement_id: engagementId, ...result },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ActivitySpineEmitError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), code: 'INTERNAL' },
      { status: 500 },
    );
  }
}
