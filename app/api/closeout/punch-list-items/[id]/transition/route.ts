/**
 * BAN-311 Pass 3b.2 — POST /api/closeout/punch-list-items/{id}/transition
 *
 * Pattern B state transition for punch_list_items.status. Emits
 * PUNCH_LIST_ITEM_STATE_CHANGED in the same Drizzle tx as the status UPDATE.
 *
 * PR 2 extension: after the entity UPDATE + Pattern B emit, the
 * `afterEntityUpdate` hook checks engagement-wide clearance. Per Closeout
 * v1.1 §6.5, the list is "cleared" when every item is in a terminal state
 * (COMPLETED, SIGNED_OFF, DEFERRED_TO_WARRANTY) — DISPUTED is NOT terminal
 * for clearance purposes (DISPUTED items must be resolved to one of the
 * three terminal states first). When the post-UPDATE engagement satisfies
 * this, PUNCH_LIST_CLEARED fires in the same tx; if the engagement still
 * has any non-terminal items, no co-fire occurs.
 */

import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db, punch_list_items, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executeCloseoutPatternBTransition } from '@/lib/closeout/execute-state-transition';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';

const ROUTE_PATH = '/api/closeout/punch-list-items/[id]/transition';

// Per §6.5: terminal states for clearance purposes. DISPUTED is excluded.
const CLEARANCE_TERMINAL_STATES = ['COMPLETED', 'SIGNED_OFF', 'DEFERRED_TO_WARRANTY'] as const;

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

  let punchListClearedEventId: string | null = null;

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
    afterEntityUpdate: async (tx, ctx) => {
      // Only consider clearance when the transition LANDED on a terminal state.
      // Transitions away from a terminal (e.g., COMPLETED → IN_PROGRESS rework)
      // cannot trigger clearance, so skip the count query.
      if (!(CLEARANCE_TERMINAL_STATES as readonly string[]).includes(ctx.toState)) {
        return;
      }
      // Aggregate query (single round-trip) against the post-UPDATE state:
      // total > 0 AND non_terminal_count = 0  ⇒ engagement-wide clearance.
      const rs = await tx.execute(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE status NOT IN ('COMPLETED','SIGNED_OFF','DEFERRED_TO_WARRANTY')
          )::int AS non_terminal
        FROM punch_list_items
        WHERE engagement_id = ${ctx.engagementId}
          AND tenant_id = ${ctx.tenantId}
      `);
      const row = (rs.rows as unknown as Array<{ total: number; non_terminal: number }>)[0];
      if (!row || row.total === 0 || row.non_terminal !== 0) return;

      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'PUNCH_LIST_CLEARED',
        entity_type: 'project',
        entity_id: ctx.engagementId,
        aia_entity_kind: 'engagement',
        aia_entity_id: ctx.engagementId,
        test_data: ctx.testData,
        metadata: {
          actor: ctx.actorEmail,
          triggering_punch_item_id: id,
          triggering_to_state: ctx.toState,
          total_items: row.total,
          closeout_entity_kind: 'engagement',
          closeout_entity_id: ctx.engagementId,
        },
      });
      punchListClearedEventId = emit.event_id;
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
    punch_item_id: id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
    punch_list_cleared_event_id: punchListClearedEventId,
  });
}
