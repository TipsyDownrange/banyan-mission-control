/**
 * BAN-311 Pass 3b.2 PR 1 — POST /api/closeout/engagements/{id}/lifecycle-transition
 *
 * Pattern B project_lifecycle_state transition. Event-sourced via the
 * project_lifecycle_states audit log (NOT a column on engagements):
 *
 *   1. Look up the current open row (exited_at IS NULL).
 *   2. Validate (from_state, to_state) — first transition allowed only when
 *      to_state === PROJECT_LIFECYCLE_ENTRY_STATE ('IN_CLOSEOUT'). Reopen
 *      target operator-specified per Closeout v1.1 §5.3.
 *   3. Enforce reopen_pair invariant: a reopen (regression to earlier state)
 *      must supply reopen_reason + reopen_by.
 *   4. Delegate to executeProjectLifecycleTransition (extracted in PR 2 so
 *      the cert co-fire route can reuse the in-tx core).
 *
 * Atomicity: the helper wraps the writes + emit in a single Drizzle tx.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  executeProjectLifecycleTransition,
  lookupCurrentLifecycleRow,
  PROJECT_LIFECYCLE_STATES,
} from '@/lib/closeout/execute-state-transition';
import type { ProjectLifecycleState } from '@/lib/closeout/state-transitions';

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

  const current = await lookupCurrentLifecycleRow(gate.tenantId, engagementId);

  const result = await executeProjectLifecycleTransition({
    tenantId: gate.tenantId,
    engagementId,
    toState,
    currentState: current?.state ?? null,
    currentRowId: current?.lifecycle_state_id ?? null,
    reopenReason: body.reopen_reason,
    reopenBy: body.reopen_by,
    reason: body.reason,
    actorEmail: gate.actorEmail,
    testData: engagementLookup[0].is_test_project === true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    engagement_id: engagementId,
    from_state: result.from_state,
    to_state: result.to_state,
    lifecycle_state_id: result.lifecycle_state_id,
    event_id: result.event_id,
  });
}
