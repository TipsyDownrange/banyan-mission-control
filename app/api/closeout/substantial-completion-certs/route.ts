/**
 * BAN-311 Pass 3b.2 PR 2 — POST /api/closeout/substantial-completion-certs
 *
 * Closeout v1.1 §7.3 + §11.4 — INSERTs a substantial_completion_certs row
 * and CO-FIRES two events in the same Drizzle transaction:
 *
 *   (a) DELIVERABLE_PRODUCED with metadata {deliverable_type:
 *       'SUBSTANTIAL_COMPLETION_CERT', drive_file_id, cert_id}
 *   (b) PROJECT_STATE_CHANGED advancing engagement from IN_CLOSEOUT →
 *       SUBSTANTIALLY_COMPLETE via executeProjectLifecycleTransitionInTx,
 *       with metadata.trigger='SUBSTANTIAL_COMPLETION_CERTIFICATE' and
 *       metadata.evidence=drive_file_id
 *
 * Pre-condition: engagement must currently be in lifecycle state
 * IN_CLOSEOUT. If not, 409 ILLEGAL_LIFECYCLE_STATE — cert creation rejected
 * before any DB writes.
 *
 * Both emissions + both row writes commit/roll-back atomically. If either
 * emission fails, the cert row is rolled back.
 *
 * Note: substantial_completion_certs.deliverable_type is NOT a column on
 * the table (the table is its own type); the DELIVERABLE_PRODUCED payload
 * carries the deliverable_type tag as a free-form metadata string —
 * deliverableTypeEnum in db/schema.ts is a different domain (applies to
 * deliverable_documents). This is intentional; event-contract.ts does NOT
 * validate the payload's deliverable_type field.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, substantial_completion_certs, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';
import {
  executeProjectLifecycleTransitionInTx,
  lookupCurrentLifecycleRow,
} from '@/lib/closeout/execute-state-transition';

const ROUTE_PATH = '/api/closeout/substantial-completion-certs';

interface CreateBody {
  engagement_id?: string;
  walkthrough_date?: string;
  attendees?: unknown[];
  per_system_completion?: Record<string, unknown>;
  cert_evidence_drive_id?: string;
  gc_signoff_evidence_drive_id?: string;
  signed_at?: string;
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
  const walkthroughDate = (body.walkthrough_date ?? '').trim();
  const driveFileId = (body.cert_evidence_drive_id ?? '').trim();

  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
  }
  if (!walkthroughDate) {
    return NextResponse.json({ error: 'walkthrough_date is required (YYYY-MM-DD)' }, { status: 400 });
  }
  if (!driveFileId) {
    return NextResponse.json({ error: 'cert_evidence_drive_id is required' }, { status: 400 });
  }

  const eng = await db
    .select({ engagement_id: engagements.engagement_id, is_test_project: engagements.is_test_project })
    .from(engagements)
    .where(and(eq(engagements.engagement_id, engagementId), eq(engagements.tenant_id, gate.tenantId)))
    .limit(1);
  if (eng.length === 0) {
    return NextResponse.json({ error: `engagement ${engagementId} not found` }, { status: 404 });
  }

  // §7.3 pre-condition: engagement must be in IN_CLOSEOUT before substantial
  // completion can be certified. Pre-check outside tx to avoid wasted writes
  // and surface a clean 409 to the caller.
  const current = await lookupCurrentLifecycleRow(gate.tenantId, engagementId);
  if (!current) {
    return NextResponse.json(
      {
        error: 'engagement has no project_lifecycle_states row; cannot certify substantial completion before lifecycle entry',
        code: 'NO_LIFECYCLE_STATE',
      },
      { status: 409 },
    );
  }
  if (current.state !== 'IN_CLOSEOUT') {
    return NextResponse.json(
      {
        error: `engagement must be in IN_CLOSEOUT to certify substantial completion (currently ${current.state})`,
        code: 'ILLEGAL_LIFECYCLE_STATE',
      },
      { status: 409 },
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(substantial_completion_certs)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagementId,
          walkthrough_date: walkthroughDate,
          attendees: body.attendees ?? [],
          per_system_completion: body.per_system_completion ?? {},
          cert_evidence_drive_id: driveFileId,
          gc_signoff_evidence_drive_id: body.gc_signoff_evidence_drive_id ?? null,
          signed_at: body.signed_at ? new Date(body.signed_at) : null,
        })
        .returning({ cert_id: substantial_completion_certs.cert_id });
      const cert = inserted[0];

      // (a) DELIVERABLE_PRODUCED
      const deliverableEmit = await emitActivitySpineEvent(tx, {
        event_type: 'DELIVERABLE_PRODUCED',
        entity_type: 'project',
        entity_id: engagementId,
        aia_entity_kind: 'engagement',
        aia_entity_id: engagementId,
        test_data: eng[0].is_test_project === true,
        metadata: {
          deliverable_type: 'SUBSTANTIAL_COMPLETION_CERT',
          cert_id: cert.cert_id,
          drive_file_id: driveFileId,
          actor: gate.actorEmail,
          closeout_entity_kind: 'engagement',
          closeout_entity_id: engagementId,
        },
      });

      // (b) PROJECT_STATE_CHANGED IN_CLOSEOUT → SUBSTANTIALLY_COMPLETE
      // via the lifecycle helper, with §7.3 trigger + evidence metadata.
      const lifecycle = await executeProjectLifecycleTransitionInTx(tx, {
        tenantId: gate.tenantId,
        engagementId,
        toState: 'SUBSTANTIALLY_COMPLETE',
        currentState: 'IN_CLOSEOUT',
        currentRowId: current.lifecycle_state_id,
        actorEmail: gate.actorEmail,
        testData: eng[0].is_test_project === true,
        metadataExtra: {
          trigger: 'SUBSTANTIAL_COMPLETION_CERTIFICATE',
          evidence: driveFileId,
          cert_id: cert.cert_id,
        },
      });

      return {
        cert_id: cert.cert_id,
        deliverable_event_id: deliverableEmit.event_id,
        project_state_event_id: lifecycle.event_id,
        lifecycle_state_id: lifecycle.lifecycle_state_id,
      };
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
