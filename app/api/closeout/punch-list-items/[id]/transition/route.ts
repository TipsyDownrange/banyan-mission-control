/**
 * BAN-311 Pass 3b.2 PR 1 — POST /api/closeout/punch-list-items/{id}/transition
 *
 * Pattern B state transition for punch_list_items.status. Emits
 * PUNCH_LIST_ITEM_STATE_CHANGED in the same Drizzle tx as the status UPDATE.
 *
 * Note: a separate PR 2 path emits PUNCH_LIST_CLEARED (Pattern A) when the
 * status reaches COMPLETED or SIGNED_OFF; this route does NOT co-fire that —
 * it stays Pattern B only.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, punch_list_items, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executeCloseoutPatternBTransition } from '@/lib/closeout/execute-state-transition';

const ROUTE_PATH = '/api/closeout/punch-list-items/[id]/transition';

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
      punch_item_id: punch_list_items.punch_item_id,
      engagement_id: punch_list_items.engagement_id,
      is_test_project: engagements.is_test_project,
    })
    .from(punch_list_items)
    .innerJoin(
      engagements,
      eq(punch_list_items.engagement_id, engagements.engagement_id),
    )
    .where(
      and(
        eq(punch_list_items.punch_item_id, id),
        eq(punch_list_items.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (lookup.length === 0) {
    return NextResponse.json(
      { error: `punch_list_item ${id} not found` },
      { status: 404 },
    );
  }

  const result = await executeCloseoutPatternBTransition({
    entity: 'punch_list_item',
    table: punch_list_items,
    pkColumn: punch_list_items.punch_item_id,
    pkValue: id,
    tenantColumn: punch_list_items.tenant_id,
    tenantId: gate.tenantId,
    stateColumn: punch_list_items.status,
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
    punch_item_id: id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
  });
}
