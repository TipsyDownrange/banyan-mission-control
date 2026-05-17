/**
 * BAN-311 Pass 3b.2 PR 1 — POST /api/closeout/engagements/{id}/lifecycle-transition
 *
 * Pattern B project_lifecycle_state transition. Event-sourced via the
 * project_lifecycle_states audit log (NOT a column on engagements):
 *
 *   1. Look up the current open row (exited_at IS NULL).
 *   2. Validate (from_state, to_state) — first transition allowed only when
 *      to_state === PROJECT_LIFECYCLE_ENTRY_STATE ('IN_CLOSEOUT').
 *   3. Enforce reopen_pair invariant: any transition to IN_CLOSEOUT from a
 *      non-IN_CLOSEOUT prior state must supply reopen_reason + reopen_by.
 *   4. In a tx: UPDATE prior row's exited_at = now; INSERT new row; emit
 *      PROJECT_STATE_CHANGED with from_state + to_state.
 *
 * Atomicity: tx aborts entirely if emit fails (no half-written audit log).
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db, project_lifecycle_states, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';
import {
  validateCloseoutPatternBTransition,
  PROJECT_LIFECYCLE_STATES,
  PROJECT_LIFECYCLE_ENTRY_STATE,
  isProjectLifecycleReopen,
  type ProjectLifecycleState,
} from '@/lib/closeout/state-transitions';

const ROUTE_PATH = '/api/closeout/engagements/[id]/lifecycle-transition';

interface LifecycleBody {
  to_state?: string;
  reason?: string;
  reopen_reason?: string;
  reopen_by?: string;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id: engagementId } = await context.params;

  let body: LifecycleBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const toStateRaw = (body.to_state ?? '').trim();
  if (!toStateRaw) {
    return NextResponse.json({ error: 'to_state is required' }, { status: 400 });
  }
  if (!(PROJECT_LIFECYCLE_STATES as readonly string[]).includes(toStateRaw)) {
    return NextResponse.json(
      {
        error: `to_state must be one of ${PROJECT_LIFECYCLE_STATES.join(', ')}`,
        code: 'UNKNOWN_TO_STATE',
      },
      { status: 400 },
    );
  }
  const toState = toStateRaw as ProjectLifecycleState;

  // Look up engagement (for is_test_project propagation + tenant scope check).
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

  // Current open lifecycle row (if any). null => initial entry.
  const currentRows = await db
    .select({
      lifecycle_state_id: project_lifecycle_states.lifecycle_state_id,
      state: project_lifecycle_states.state,
    })
    .from(project_lifecycle_states)
    .where(
      and(
        eq(project_lifecycle_states.engagement_id, engagementId),
        eq(project_lifecycle_states.tenant_id, gate.tenantId),
        isNull(project_lifecycle_states.exited_at),
      ),
    )
    .limit(1);

  const currentState: ProjectLifecycleState | null =
    currentRows.length > 0 ? (currentRows[0].state as ProjectLifecycleState) : null;
  const currentRowId = currentRows.length > 0 ? currentRows[0].lifecycle_state_id : null;

  // Initial-entry rule: with no prior row, only IN_CLOSEOUT is a valid target.
  if (currentState === null) {
    if (toState !== PROJECT_LIFECYCLE_ENTRY_STATE) {
      return NextResponse.json(
        {
          error: `engagement has no prior lifecycle state; initial entry must be ${PROJECT_LIFECYCLE_ENTRY_STATE}`,
          code: 'INVALID_INITIAL_STATE',
        },
        { status: 409 },
      );
    }
  } else {
    const validation = validateCloseoutPatternBTransition('project_lifecycle', currentState, toState);
    if (!validation.ok) {
      const status = validation.reason === 'TRANSITION_NOT_ALLOWED' ? 409 : 400;
      return NextResponse.json(
        { error: validation.message, code: validation.reason },
        { status },
      );
    }
  }

  // Reopen-pair invariant: schema CHECK requires (reopen_reason, reopen_by)
  // both-null or both-non-null. For a reopen (back to IN_CLOSEOUT from any
  // non-IN_CLOSEOUT state), both are required from the caller.
  const isReopen = isProjectLifecycleReopen(currentState, toState);
  if (isReopen) {
    const rr = (body.reopen_reason ?? '').trim();
    const rb = (body.reopen_by ?? '').trim();
    if (!rr || !rb) {
      return NextResponse.json(
        {
          error: 'reopen_reason and reopen_by are both required when transitioning to IN_CLOSEOUT from a later state',
          code: 'REOPEN_PAIR_REQUIRED',
        },
        { status: 400 },
      );
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (currentRowId) {
        await tx
          .update(project_lifecycle_states)
          .set({ exited_at: new Date(), updated_at: new Date() })
          .where(
            and(
              eq(project_lifecycle_states.lifecycle_state_id, currentRowId),
              eq(project_lifecycle_states.tenant_id, gate.tenantId),
            ),
          );
      }

      const insertValues = {
        tenant_id: gate.tenantId,
        engagement_id: engagementId,
        state: toState,
        reopen_reason: isReopen ? body.reopen_reason!.trim() : null,
        reopen_by: isReopen ? body.reopen_by!.trim() : null,
      };
      const inserted = await tx
        .insert(project_lifecycle_states)
        .values(insertValues)
        .returning({ lifecycle_state_id: project_lifecycle_states.lifecycle_state_id });

      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'PROJECT_STATE_CHANGED',
        entity_type: 'project',
        entity_id: engagementId,
        aia_entity_kind: 'engagement',
        aia_entity_id: engagementId,
        notes: body.reason ?? null,
        test_data: engagementLookup[0].is_test_project === true,
        metadata: {
          from_state: currentState ?? '(none)',
          to_state: toState,
          reason: body.reason ?? null,
          actor: gate.actorEmail,
          closeout_entity_kind: 'engagement',
          closeout_entity_id: engagementId,
          lifecycle_state_id: inserted[0].lifecycle_state_id,
          reopen: isReopen,
          reopen_reason: isReopen ? body.reopen_reason!.trim() : null,
          reopen_by: isReopen ? body.reopen_by!.trim() : null,
        },
      });

      return {
        lifecycle_state_id: inserted[0].lifecycle_state_id,
        event_id: emit.event_id,
      };
    });

    return NextResponse.json({
      ok: true,
      engagement_id: engagementId,
      from_state: currentState,
      to_state: toState,
      lifecycle_state_id: result.lifecycle_state_id,
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
