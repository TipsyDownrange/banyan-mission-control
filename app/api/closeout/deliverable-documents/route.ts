/**
 * BAN-311 Pass 3b.2 PR 2 — POST /api/closeout/deliverable-documents
 *
 * Closeout v1.1 §11.4 — INSERTs a deliverable_documents row + emits
 * DELIVERABLE_PRODUCED (Pattern A) with payload {deliverable_type,
 * drive_file_id, version?}.
 *
 * deliverable_type accepted from the schema's deliverableTypeEnum minus
 * UNIFIED_JOB_PACKET (which has its own dedicated route per §12):
 *   AS_BUILT_DRAWING, OM_MANUAL_COMPONENT, OM_MANUAL_COMPLETE, OTHER.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, deliverable_documents, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';

const ROUTE_PATH = '/api/closeout/deliverable-documents';

const DELIVERABLE_TYPES = new Set([
  'AS_BUILT_DRAWING',
  'OM_MANUAL_COMPONENT',
  'OM_MANUAL_COMPLETE',
  'OTHER',
]);
const PROJECT_LIFECYCLE_STATE_VALUES = new Set([
  'IN_CLOSEOUT', 'SUBSTANTIALLY_COMPLETE', 'FINAL_COMPLETE', 'ARCHIVED',
]);

interface CreateBody {
  engagement_id?: string;
  deliverable_type?: string;
  category?: string;
  drive_file_id?: string;
  version?: number;
  uploaded_by?: string;
  required_for_state?: string;
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
  const deliverableType = (body.deliverable_type ?? '').trim();
  const driveFileId = (body.drive_file_id ?? '').trim();

  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
  }
  if (!DELIVERABLE_TYPES.has(deliverableType)) {
    return NextResponse.json(
      {
        error: `deliverable_type must be one of ${[...DELIVERABLE_TYPES].join(', ')} (UNIFIED_JOB_PACKET uses its own route)`,
        code: 'INVALID_DELIVERABLE_TYPE',
      },
      { status: 400 },
    );
  }
  if (!driveFileId) {
    return NextResponse.json({ error: 'drive_file_id is required' }, { status: 400 });
  }
  if (body.required_for_state != null && !PROJECT_LIFECYCLE_STATE_VALUES.has(body.required_for_state)) {
    return NextResponse.json(
      { error: `required_for_state must be one of ${[...PROJECT_LIFECYCLE_STATE_VALUES].join(', ')}` },
      { status: 400 },
    );
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
        .insert(deliverable_documents)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagementId,
          deliverable_type: deliverableType as 'AS_BUILT_DRAWING' | 'OM_MANUAL_COMPONENT' | 'OM_MANUAL_COMPLETE' | 'OTHER',
          category: body.category ?? null,
          drive_file_id: driveFileId,
          version: body.version ?? 1,
          uploaded_by: body.uploaded_by ?? null,
          required_for_state: body.required_for_state
            ? (body.required_for_state as 'IN_CLOSEOUT' | 'SUBSTANTIALLY_COMPLETE' | 'FINAL_COMPLETE' | 'ARCHIVED')
            : null,
        })
        .returning({ deliverable_id: deliverable_documents.deliverable_id });

      const doc = inserted[0];
      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'DELIVERABLE_PRODUCED',
        scope_entity_type: 'project',
        scope_entity_id: engagementId,
        entity_kind: 'deliverable_document',
        entity_id: doc.deliverable_id,
        test_data: eng[0].is_test_project === true,
        metadata: {
          deliverable_id: doc.deliverable_id,
          deliverable_type: deliverableType,
          drive_file_id: driveFileId,
          version: body.version ?? 1,
          actor: gate.actorEmail,
        },
      });

      return { deliverable_id: doc.deliverable_id, event_id: emit.event_id };
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
