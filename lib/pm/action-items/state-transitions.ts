/**
 * BAN-344 PM-V1.0-E — Action item state transition executor.
 *
 * Wraps the row update + ACTION_ITEM_STATE_CHANGED emission in a single
 * Drizzle transaction.  Mirrors lib/pm/rfis/execute-transition.ts.
 *
 * Allowed transitions:
 *   OPEN/IN_PROGRESS → COMPLETED  (via /complete)
 *   OPEN/IN_PROGRESS → DEFERRED   (via /defer)
 *   OPEN/IN_PROGRESS → CANCELLED  (via /cancel)
 *   OPEN            → IN_PROGRESS (via /assign with assignment context)
 *   COMPLETED/AUTO_CLOSED → terminal (no re-open in v1.0)
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
  /** Optional override of the canon transition rule (e.g. for /assign which
   *  may transition to IN_PROGRESS from OPEN or no-op if already IN_PROGRESS). */
  allowSameState?: boolean;
};

export type ActionItemTransitionResult =
  | { ok: true; from_state: string; to_state: string; event_id: string; action_item: Record<string, unknown> }
  | { ok: false; status: number; code: string; message: string };

const TERMINAL_STATES = new Set<ActionItemStatus>(['COMPLETED', 'CANCELLED', 'AUTO_CLOSED']);

function isAllowed(from: string, to: ActionItemStatus, allowSameState: boolean): boolean {
  if (TERMINAL_STATES.has(from as ActionItemStatus)) return false;
  if (from === to) return allowSameState;
  if (to === 'IN_PROGRESS') return from === 'OPEN' || from === 'DEFERRED';
  if (to === 'COMPLETED' || to === 'DEFERRED' || to === 'CANCELLED') {
    return OPEN_ACTIONABLE_STATUSES.includes(from as ActionItemStatus) || from === 'DEFERRED';
  }
  return false;
}

export async function executeActionItemTransition(
  input: ActionItemTransitionInput,
): Promise<ActionItemTransitionResult> {
  const existing = await getActionItemForTenant(input.tenantId, input.actionItemId);
  if (!existing) {
    return { ok: false, status: 404, code: 'ACTION_ITEM_NOT_FOUND', message: 'action item not found' };
  }
  const fromState = existing.status as ActionItemStatus;
  const toState = input.toState;
  if (!isAllowed(fromState, toState, input.allowSameState === true)) {
    return {
      ok: false,
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
      ok: true,
      from_state: fromState,
      to_state: toState,
      event_id: emit.event_id,
      action_item: updated[0] as Record<string, unknown>,
    };
  });
}
