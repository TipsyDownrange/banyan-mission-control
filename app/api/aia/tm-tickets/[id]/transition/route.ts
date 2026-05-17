/**
 * BAN-309 Pass 3a.2 PR 4 — POST /api/aia/tm-tickets/{id}/transition
 *
 * Final Pattern B entity in the AIA stack. Emits TM_TICKET_STATE_CHANGED
 * in the same Drizzle transaction as the tm_tickets.status UPDATE.
 *
 * Schema drift (Charter Rule 12): tm_tickets uses `status` as its lifecycle
 * column (same as tm_authorizations); executor consumes the explicit
 * stateColumn handle so the canonical Pattern B machinery applies unchanged.
 *
 * Auth stack: passAiaApiGate (PR 2 helper). State-machine + emit: executor
 * from PR 1.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, tm_tickets, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executePatternBTransition } from '@/lib/aia/execute-state-transition';

const ROUTE_PATH = '/api/aia/tm-tickets/[id]/transition';

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

  const ticketLookup = await db
    .select({
      ticket_id: tm_tickets.ticket_id,
      engagement_id: tm_tickets.engagement_id,
      is_test_project: engagements.is_test_project,
    })
    .from(tm_tickets)
    .innerJoin(
      engagements,
      eq(tm_tickets.engagement_id, engagements.engagement_id),
    )
    .where(
      and(
        eq(tm_tickets.ticket_id, id),
        eq(tm_tickets.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (ticketLookup.length === 0) {
    return NextResponse.json(
      { error: `tm_ticket ${id} not found` },
      { status: 404 },
    );
  }

  const result = await executePatternBTransition({
    entity: 'tm_ticket',
    table: tm_tickets,
    pkColumn: tm_tickets.ticket_id,
    pkValue: id,
    tenantColumn: tm_tickets.tenant_id,
    tenantId: gate.tenantId,
    stateColumn: tm_tickets.status,
    toState,
    reason: body.reason,
    actorEmail: gate.actorEmail,
    testData: ticketLookup[0].is_test_project === true,
    engagementId: ticketLookup[0].engagement_id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    ticket_id: id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
  });
}
