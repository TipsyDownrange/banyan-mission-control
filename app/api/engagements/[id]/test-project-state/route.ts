/**
 * BAN-309 Pass 3a.2 PR 2 — PATCH /api/engagements/{id}/test-project-state
 *
 * Flips engagements.is_test_project. Pattern B emit: TEST_PROJECT_STATE_CHANGED
 * with from_state / to_state mapped per the BAN-309 dispatch suggestion:
 *   - is_test_project = false  ↔  from_state/to_state = 'production'
 *   - is_test_project = true   ↔  from_state/to_state = 'test_project'
 *
 * The dispatch flags this mapping as pending explicit confirmation against
 * TPA v1.0 §11 spec wording; if the spec dictates different strings (e.g.
 * 'PRODUCTION' / 'TEST' or 'real' / 'test'), the strings here must change.
 * No spec contradiction surfaced during PR 2 build.
 *
 * Idempotent: re-PATCHing the same value (no-op) returns 200 with
 * { unchanged: true } and emits nothing per dispatch.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';

const ROUTE_PATH = '/api/engagements/[id]/test-project-state';

export const TEST_PROJECT_STATE_LABELS = {
  production: 'production',
  test_project: 'test_project',
} as const;

interface FlipBody {
  is_test_project?: boolean;
  test_project_created_by?: string;
  reason?: string;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  let body: FlipBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.is_test_project !== 'boolean') {
    return NextResponse.json(
      { error: 'is_test_project (boolean) is required' },
      { status: 400 },
    );
  }
  const desired = body.is_test_project;

  const lookup = await db
    .select({
      engagement_id: engagements.engagement_id,
      is_test_project: engagements.is_test_project,
      test_project_created_by: engagements.test_project_created_by,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagement_id, id),
        eq(engagements.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (lookup.length === 0) {
    return NextResponse.json(
      { error: `engagement ${id} not found` },
      { status: 404 },
    );
  }

  const current = lookup[0];
  const currentBool = current.is_test_project === true;

  if (currentBool === desired) {
    return NextResponse.json({
      ok: true,
      engagement_id: id,
      is_test_project: currentBool,
      unchanged: true,
    });
  }

  // CHECK constraint: when is_test_project=true, test_project_created_by must be set.
  if (desired && !current.test_project_created_by && !body.test_project_created_by) {
    return NextResponse.json(
      {
        error:
          'test_project_created_by (user_id) is required when flipping to test_project',
        code: 'TEST_PROJECT_CREATED_BY_REQUIRED',
      },
      { status: 400 },
    );
  }

  const fromState = currentBool
    ? TEST_PROJECT_STATE_LABELS.test_project
    : TEST_PROJECT_STATE_LABELS.production;
  const toState = desired
    ? TEST_PROJECT_STATE_LABELS.test_project
    : TEST_PROJECT_STATE_LABELS.production;

  try {
    const result = await db.transaction(async (tx) => {
      const updateValues: Record<string, unknown> = {
        is_test_project: desired,
        updated_at: new Date(),
      };
      if (desired && body.test_project_created_by) {
        updateValues.test_project_created_by = body.test_project_created_by;
      }
      if (!desired) {
        // Clearing the test flag also clears the test_project_created_by
        // attribution so the CHECK constraint stays satisfied on future flips.
        updateValues.test_project_created_by = null;
      }
      await tx
        .update(engagements)
        .set(updateValues)
        .where(
          and(
            eq(engagements.engagement_id, id),
            eq(engagements.tenant_id, gate.tenantId),
          ),
        );

      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'TEST_PROJECT_STATE_CHANGED',
        entity_type: 'project',
        entity_id: id,
        aia_entity_kind: 'engagement',
        aia_entity_id: id,
        notes: body.reason ?? null,
        test_data: desired,
        metadata: {
          from_state: fromState,
          to_state: toState,
          reason: body.reason ?? null,
          actor: gate.actorEmail,
        },
      });

      return { event_id: emit.event_id };
    });

    return NextResponse.json({
      ok: true,
      engagement_id: id,
      is_test_project: desired,
      from_state: fromState,
      to_state: toState,
      event_id: result.event_id,
    });
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
