/**
 * BAN-340 PM-V1.0-A — POST /api/submittals/[id]/log-review
 *
 * Records a review outcome on a submittal — drives the lifecycle from
 * SUBMITTED or UNDER_REVIEW into one of:
 *   APPROVED, APPROVED_AS_NOTED, REVISE_RESUBMIT, REJECTED
 *
 * APPROVED / APPROVED_AS_NOTED also stamp `approved_date`; all four stamp
 * `reviewed_date` (defaults to today). Closing the submittal after delivery
 * is a separate manual step (APPROVED → CLOSED).
 *
 * The Pattern B SUBMITTAL_STATE_CHANGED emit fires inside the same Drizzle
 * transaction as the UPDATE via executeSubmittalTransition.
 */

import { NextResponse } from 'next/server';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executeSubmittalTransition } from '@/lib/pm/submittals/execute-transition';
import type { SubmittalState } from '@/lib/pm/submittals/state-machine';

const ROUTE_PATH = '/api/submittals/[id]/log-review';

const REVIEW_OUTCOMES = new Set<SubmittalState>([
  'APPROVED',
  'APPROVED_AS_NOTED',
  'REVISE_RESUBMIT',
  'REJECTED',
]);

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: { outcome?: string; reviewed_date?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const outcome = (body.outcome ?? '').trim() as SubmittalState;
  if (!REVIEW_OUTCOMES.has(outcome)) {
    return NextResponse.json(
      { error: 'outcome must be one of APPROVED, APPROVED_AS_NOTED, REVISE_RESUBMIT, REJECTED' },
      { status: 400 },
    );
  }
  const reviewedDate = (body.reviewed_date ?? '').trim() || new Date().toISOString().slice(0, 10);

  const extraUpdates: Record<string, unknown> = { reviewed_date: reviewedDate };
  if (outcome === 'APPROVED' || outcome === 'APPROVED_AS_NOTED') {
    extraUpdates.approved_date = reviewedDate;
  }

  const result = await executeSubmittalTransition({
    submittalId: id,
    tenantId: gate.tenantId,
    toState: outcome,
    actorEmail: gate.actorEmail,
    reason: body.reason ?? null,
    extraUpdates,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    submittal_id: id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
    submittal: result.submittal,
  });
}
