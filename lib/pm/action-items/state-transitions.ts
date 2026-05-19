/**
 * BAN-344a PM-V1.0-E (CORE) — Action item state transition executor.
 *
 * Wraps the row UPDATE + ACTION_ITEM_STATE_CHANGED emission in a single
 * Drizzle transaction.  Mirrors lib/pm/rfis/execute-transition.ts.
 *
 * 344a allowed transitions:
 *   OPEN/IN_PROGRESS/DEFERRED → COMPLETED  (via /complete)
 *   OPEN/IN_PROGRESS         → DEFERRED   (via /defer)
 *   OPEN/IN_PROGRESS/DEFERRED → CANCELLED  (via /cancel)
 *   OPEN/DEFERRED            → IN_PROGRESS (via /assign)
 *   IN_PROGRESS              → IN_PROGRESS (via /assign re-assign)
 *
 * Terminal states (COMPLETED, CANCELLED) cannot transition further.  344b
 * adds AUTO_CLOSED as an additional terminal state.
 */

import { and, eq } from 'drizzle-orm';
import { db, action_items } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { OPEN_ACTIONABLE_STATUSES, type ActionItemStatus } from './types';
import { getActionItemForTenant } from './route-utils';

export type ActionItemTransitionInput = {
  actionItemId: string;
  tenantId: string;
  toState: Extract<ActionItemStatus, 'IN_PROGRESS' | 'COMPLETED' | 'DEFERRED' | 'CANCELLED'>;
  actorEmail: string;
  actorUserId: string | null;
  reason?: string | null;
  /** Optional patch (e.g. due_date for defer; assigned_to for assign). */
  extraUpdates?: Record<string, unknown>;
  /** Allow the from === to transition (used by /assign for re-assignment). */
  allowSameState?: boolean;
};

export type ActionItemTransitionResult =
  | { ok: true; from_state: string; to_state: string; event_id: string; action_item: Record<string, unknown> }
  | { ok: false; status: number; code: string; message: string };

const TERMINAL_STATES = new Set<ActionItemStatus>(['COMPLETED', 'CANCELLED']);

function isAllowed(from: string, to: ActionItemStatus, allowSameState: boolean): boolean {
  if (TERMINAL_STATES.has(from as ActionItemStatus)) return false;
  if (from === to) return allowSameState;
  if (to === 'IN_PROGRESS') return from === 'OPEN' || from === 'DEFERRED';
  if (to === 'DEFERRED') return OPEN_ACTIONABLE_STATUSES.includes(from as ActionItemStatus);
  if (to === 'COMPLETED' || to === 'CANCELLED') {
    return OPEN_ACTIONABLE_STATUSES.includes(from as ActionItemStatus) || from === 'DEFERRED';
  }
  return false;
}

export async function executeActionItemTransition(
  input: ActionItemTransitionInput,
): Promise<ActionItemTransitionResult> {
  const existing = await getActionItemForTenant(input.tenantId, input.actionItemId);
  if (!existing) {
    return { ok: false as const, status: 404, code: 'ACTION_ITEM_NOT_FOUND', message: 'action item not found' };
  }
  const fromState = existing.status as ActionItemStatus;
  const toState = input.toState;
  if (!isAllowed(fromState, toState, input.allowSameState === true)) {
    return {
      ok: false as const,
      status: 400,
      code: 'INVALID_TRANSITION',
      message: `cannot transition from ${fromState} to ${toState}`,
    };
  }

  return db.transaction(async (tx) => {
    const updates: Record<string, unknown> = {
      status: toState,
      ...(input.extraUpdates ?? {}),
    };
    if (toState === 'COMPLETED') {
      updates.completed_at = new Date();
      updates.completed_by = input.actorUserId;
    }

    const updated = await tx
      .update(action_items)
      .set(updates)
      .where(
        and(
          eq(action_items.action_item_id, input.actionItemId),
          eq(action_items.tenant_id, input.tenantId),
        ),
      )
      .returning();

    const emit = await emitActivitySpineEvent(tx, {
      event_type: 'ACTION_ITEM_STATE_CHANGED',
      scope_entity_type: existing.engagement_id ? 'project' : 'internal',
      scope_entity_id: existing.engagement_id ?? input.actionItemId,
      entity_kind: 'action_item',
      entity_id: input.actionItemId,
      kid: existing.kid ?? null,
      test_data: existing.is_test_project === true,
      metadata: {
        from_state: fromState,
        to_state: toState,
        actor: input.actorEmail,
        reason: input.reason ?? null,
        patched_fields: Object.keys(updates),
      },
    });

    return {
      ok: true as const,
      from_state: fromState,
      to_state: toState,
      event_id: emit.event_id,
      action_item: updated[0] as Record<string, unknown>,
    };
  });
}
