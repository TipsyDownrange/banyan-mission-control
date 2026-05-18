/**
 * BAN-340 PM-V1.0-A — POST /api/submittals/[id]/submit
 *
 * Drives the submittal from REQUIRED / IN_PROGRESS into SUBMITTED. The
 * caller must supply `submitted_to` (GC / ARCHITECT / ENGINEER / OWNER);
 * `submitted_date` defaults to today HST date if not provided. The Pattern
 * B field_events emit fires in the same Drizzle transaction as the UPDATE.
 *
 * If the submittal is currently in REQUIRED, the executor short-circuits
 * because REQUIRED → SUBMITTED is not directly allowed (lifecycle requires
 * REQUIRED → IN_PROGRESS → SUBMITTED). The route handles that by performing
 * the intermediate REQUIRED → IN_PROGRESS step automatically inside the
 * outer caller — a common ergonomic pattern, but kept explicit here so the
 * state machine remains the only source of truth.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, submittals } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executeSubmittalTransition } from '@/lib/pm/submittals/execute-transition';

const ROUTE_PATH = '/api/submittals/[id]/submit';
const SUBMITTED_TO_VALUES = new Set(['GC', 'ARCHITECT', 'ENGINEER', 'OWNER']);

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: { submitted_to?: string; submitted_date?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const submittedTo = (body.submitted_to ?? '').trim();
  if (!SUBMITTED_TO_VALUES.has(submittedTo)) {
    return NextResponse.json(
      { error: 'submitted_to must be one of GC, ARCHITECT, ENGINEER, OWNER' },
      { status: 400 },
    );
  }
  const submittedDate = (body.submitted_date ?? '').trim() || new Date().toISOString().slice(0, 10);

  // If currently REQUIRED, advance REQUIRED → IN_PROGRESS first so the
  // canonical state machine drives the path. Each step emits its own
  // SUBMITTAL_STATE_CHANGED event, preserving the audit trail.
  const existing = await db
    .select({ status: submittals.status })
    .from(submittals)
    .where(
      and(
        eq(submittals.submittal_id, id),
        eq(submittals.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: 'submittal not found' }, { status: 404 });
  }

  const intermediates: Array<{ from_state: string; to_state: string; event_id: string }> = [];
  if (existing[0].status === 'REQUIRED') {
    const step = await executeSubmittalTransition({
      submittalId: id,
      tenantId: gate.tenantId,
      toState: 'IN_PROGRESS',
      actorEmail: gate.actorEmail,
    });
    if (!step.ok) {
      return NextResponse.json(
        { error: step.message, code: step.code },
        { status: step.status },
      );
    }
    intermediates.push({ from_state: step.from_state, to_state: step.to_state, event_id: step.event_id });
  }

  const result = await executeSubmittalTransition({
    submittalId: id,
    tenantId: gate.tenantId,
    toState: 'SUBMITTED',
    actorEmail: gate.actorEmail,
    reason: body.reason ?? null,
    extraUpdates: {
      submitted_to: submittedTo,
      submitted_date: submittedDate,
    },
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
    intermediate_transitions: intermediates,
    submittal: result.submittal,
  });
}
