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
import { db, punch_list_items, punch_list_item_history, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executeCloseoutPatternBTransition } from '@/lib/closeout/execute-state-transition';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';

const ROUTE_PATH = '/api/closeout/punch-list-items/[id]/transition';

// Per §6.5: terminal states for clearance purposes. DISPUTED is excluded.
// WAIVED (v1.1.1) is intentionally NOT part of the clearance set — waived
// items drop out of scope rather than counting as "cleared".
const CLEARANCE_TERMINAL_STATES = ['COMPLETED', 'SIGNED_OFF', 'DEFERRED_TO_WARRANTY'] as const;

// Map a to_state landing to the punch_list_item_history.action label per
// the action CHECK constraint (migration 0029). Defaults to 'status_changed'
// for transitions that don't have a dedicated action verb.
function historyActionFor(toState: string): string {
  switch (toState) {
    case 'COMPLETED': return 'completed';
    case 'SIGNED_OFF': return 'signed_off';
    case 'DISPUTED': return 'disputed';
    case 'WAIVED': return 'waived';
    case 'ASSIGNED': return 'assigned';
    default: return 'status_changed';
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  let body: { to_state?: string; reason?: string; waived_reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const toState = (body.to_state ?? '').trim();
  if (!toState) {
    return NextResponse.json({ error: 'to_state is required' }, { status: 400 });
  }
  // v1.1.1 Sean delta 3: waiving a punch item requires a captured reason so
  // the audit trail explains why the item left the closeout list. Validated
  // here before the tx opens to surface a clean 400.
  const waivedReason = (body.waived_reason ?? '').trim();
  if (toState === 'WAIVED' && !waivedReason) {
    return NextResponse.json(
      { error: 'waived_reason is required when transitioning to WAIVED', code: 'WAIVED_REASON_REQUIRED' },
      { status: 400 },
    );
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
      // v1.1.1: persist waived_reason in the same tx (status update already
      // happened via the generic executor; this is the column-specific extra).
      if (ctx.toState === 'WAIVED') {
        await tx
          .update(punch_list_items)
          .set({ waived_reason: waivedReason, updated_at: new Date() })
          .where(
            and(
              eq(punch_list_items.punch_item_id, id),
              eq(punch_list_items.tenant_id, gate.tenantId),
            ),
          );
      }
      // v1.1.1: write per-item history row for every status transition.
      // previous_status / new_status both carry the literal enum value;
      // 'note' carries the human reason (the existing body.reason for
      // non-WAIVED, the waived_reason for WAIVED).
      await tx
        .insert(punch_list_item_history)
        .values({
          tenant_id: ctx.tenantId,
          punch_item_id: id,
          action: historyActionFor(ctx.toState),
          previous_status: ctx.fromState as 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'SIGNED_OFF' | 'DISPUTED' | 'DEFERRED_TO_WARRANTY' | 'WAIVED',
          new_status: ctx.toState as 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'SIGNED_OFF' | 'DISPUTED' | 'DEFERRED_TO_WARRANTY' | 'WAIVED',
          note: ctx.toState === 'WAIVED' ? waivedReason : (body.reason ?? null),
        });

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
        scope_entity_type: 'project',
        scope_entity_id: ctx.engagementId,
        entity_kind: 'engagement',
        entity_id: ctx.engagementId,
        test_data: ctx.testData,
        metadata: {
          actor: ctx.actorEmail,
          triggering_punch_item_id: id,
          triggering_to_state: ctx.toState,
          total_items: row.total,
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
