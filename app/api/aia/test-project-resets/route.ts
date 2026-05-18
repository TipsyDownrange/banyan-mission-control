/**
 * BAN-309 Pass 3a.2 PR 2 — POST /api/aia/test-project-resets
 *
 * Creates a test_project_resets audit row + emits TEST_PROJECT_RESET in the
 * same Drizzle tx. The actual deletion of child records is OUT OF SCOPE for
 * this PR — this route only records that a reset occurred and what was
 * deleted (caller passes child_records_deleted summary).
 *
 * Validates the target engagement is a test project (is_test_project=true)
 * per TPA v1.0 §11 — production engagements cannot be reset.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, test_project_resets, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';

const ROUTE_PATH = '/api/aia/test-project-resets';

interface ResetBody {
  engagement_id?: string;
  reset_by?: string;
  reason?: string;
  child_records_deleted?: Record<string, unknown>;
}

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: ResetBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const engagementId = (body.engagement_id ?? '').trim();
  const resetBy = (body.reset_by ?? '').trim();

  if (!engagementId) {
    return NextResponse.json(
      { error: 'engagement_id is required' },
      { status: 400 },
    );
  }
  if (!resetBy) {
    return NextResponse.json(
      { error: 'reset_by (user_id) is required' },
      { status: 400 },
    );
  }

  const engagementLookup = await db
    .select({
      engagement_id: engagements.engagement_id,
      is_test_project: engagements.is_test_project,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagement_id, engagementId),
        eq(engagements.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (engagementLookup.length === 0) {
    return NextResponse.json(
      { error: `engagement ${engagementId} not found` },
      { status: 404 },
    );
  }

  if (!engagementLookup[0].is_test_project) {
    return NextResponse.json(
      {
        error: `engagement ${engagementId} is not a test project; production engagements cannot be reset`,
        code: 'NOT_A_TEST_PROJECT',
      },
      { status: 409 },
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(test_project_resets)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagementId,
          reset_by: resetBy,
          reason: body.reason ?? null,
          child_records_deleted: body.child_records_deleted ?? {},
        })
        .returning({
          reset_id: test_project_resets.reset_id,
          reset_at: test_project_resets.reset_at,
        });

      const reset = inserted[0];

      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'TEST_PROJECT_RESET',
        scope_entity_type: 'project',
        scope_entity_id: engagementId,
        entity_kind: 'test_project_reset',
        entity_id: reset.reset_id,
        test_data: true,
        metadata: {
          test_project_reset_id: reset.reset_id,
          engagement_id: engagementId,
          reset_by: resetBy,
          reason: body.reason ?? null,
          child_records_deleted: body.child_records_deleted ?? {},
          actor: gate.actorEmail,
        },
      });

      return {
        reset_id: reset.reset_id,
        reset_at: reset.reset_at?.toISOString() ?? null,
        event_id: emit.event_id,
      };
    });

    return NextResponse.json({ ok: true, engagement_id: engagementId, ...result });
  } catch (err) {
    if (err instanceof ActivitySpineEmitError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), code: 'INTERNAL' },
      { status: 500 },
    );
  }
}
