/**
 * BAN-311 Pass 3b.2 PR 1 — POST /api/closeout/warranties/{id}/transition
 *
 * Pattern B state transition for warranties.status. Emits
 * WARRANTY_STATE_CHANGED in the same Drizzle tx as the status UPDATE.
 *
 * State machine: ACTIVE → PARTIALLY_EXPIRED → EXPIRED; EXPIRED terminal.
 * warranty_claims state changes do NOT flip parent warranty state through
 * this route — claim lifecycle is its own concern (PR 3 CRUD).
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, warranties, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executeCloseoutPatternBTransition } from '@/lib/closeout/execute-state-transition';

const ROUTE_PATH = '/api/closeout/warranties/[id]/transition';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  let body: { to_state?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const toState = (body.to_state ?? '').trim();
  if (!toState) {
    return NextResponse.json({ error: 'to_state is required' }, { status: 400 });
  }

  const lookup = await db
    .select({
      warranty_id: warranties.warranty_id,
      engagement_id: warranties.engagement_id,
      is_test_project: engagements.is_test_project,
    })
    .from(warranties)
    .innerJoin(
      engagements,
      eq(warranties.engagement_id, engagements.engagement_id),
    )
    .where(
      and(
        eq(warranties.warranty_id, id),
        eq(warranties.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (lookup.length === 0) {
    return NextResponse.json(
      { error: `warranty ${id} not found` },
      { status: 404 },
    );
  }

  const result = await executeCloseoutPatternBTransition({
    entity: 'warranty',
    table: warranties,
    pkColumn: warranties.warranty_id,
    pkValue: id,
    tenantColumn: warranties.tenant_id,
    tenantId: gate.tenantId,
    stateColumn: warranties.status,
    toState,
    reason: body.reason,
    actorEmail: gate.actorEmail,
    testData: lookup[0].is_test_project === true,
    engagementId: lookup[0].engagement_id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    warranty_id: id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
  });
}
