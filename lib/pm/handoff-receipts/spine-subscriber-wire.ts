/**
 * BAN-346 PM-V1.0-G — PM Handoff Receipt → Action Item subscriber wire.
 *
 * Hooks the handoff state machine into BAN-344's dispatchSourceEvent so
 * that:
 *   - When a receipt becomes reviewed_complete, an action item "Review
 *     handoff packet for engagement X" is auto-created and assigned to the
 *     PM (the reviewer or whoever opened the receipt).
 *   - When a receipt enters a terminal state (accepted / accepted_with_gaps
 *     / rejected_with_gaps), any open handoff-related action items for the
 *     same source_entity_id are auto-closed.
 *
 * The wire is a thin adapter — the canonical subscriber rules in
 * lib/pm/action-items/spine-subscriber.ts do NOT know about handoff
 * receipts directly; this module builds the SubscriberSourceEvent and
 * dispatches.  Subscriber failures never roll back the source transition
 * (the wrapper in dispatchSourceEvent already swallows errors).
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db, action_items } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { OPEN_ACTIONABLE_STATUSES } from '@/lib/pm/action-items/types';
import type { PmHandoffState } from './types';

export type HandoffSubscriberEvent = {
  tenantId: string;
  receiptId: string;
  engagementId: string | null;
  kid: string | null;
  isTestProject: boolean;
  fromState: PmHandoffState;
  toState: PmHandoffState;
  actorEmail: string | null;
  actorUserId: string | null;
};

export type HandoffSubscriberResult = {
  createdActionItemIds: string[];
  autoClosedActionItemIds: string[];
  createdEventIds: string[];
  autoClosedEventIds: string[];
  skipped: boolean;
  reason?: string;
};

const EMPTY: HandoffSubscriberResult = {
  createdActionItemIds: [],
  autoClosedActionItemIds: [],
  createdEventIds: [],
  autoClosedEventIds: [],
  skipped: false,
};

const TERMINAL_STATES: readonly PmHandoffState[] = [
  'accepted',
  'accepted_with_gaps',
  'rejected_with_gaps',
];

/**
 * Decide what the subscriber should do for a given state transition.  Pure
 * function — exported so unit tests can pin the policy without touching
 * the database.
 */
export function planHandoffSubscriberAction(event: HandoffSubscriberEvent): {
  create: boolean;
  autoClose: boolean;
  reason: string;
} {
  if (event.toState === 'reviewed_complete') {
    return { create: true, autoClose: false, reason: 'handoff awaiting PM decision' };
  }
  if (TERMINAL_STATES.includes(event.toState)) {
    return {
      create: false,
      autoClose: true,
      reason: `handoff receipt moved to ${event.toState}`,
    };
  }
  return { create: false, autoClose: false, reason: 'no-op' };
}

/**
 * Dispatch a handoff state change to the action item subscriber.  Errors are
 * caught internally — the surrounding source transition has already
 * committed and must not roll back.
 */
export async function dispatchHandoffReceiptStateChange(
  event: HandoffSubscriberEvent,
): Promise<HandoffSubscriberResult> {
  const plan = planHandoffSubscriberAction(event);
  if (!plan.create && !plan.autoClose) {
    return { ...EMPTY, skipped: true, reason: 'no-rule-match' };
  }

  try {
    return await db.transaction(async (tx) => {
      const createdActionItemIds: string[] = [];
      const createdEventIds: string[] = [];
      const autoClosedActionItemIds: string[] = [];
      const autoClosedEventIds: string[] = [];

      if (plan.create && event.engagementId) {
        const title = event.kid
          ? `Review handoff packet for engagement ${event.kid}`
          : 'Review handoff packet';
        const inserted = await tx
          .insert(action_items)
          .values({
            tenant_id: event.tenantId,
            engagement_id: event.engagementId,
            source_event_type: 'HANDOFF_RECEIPT_STATE_CHANGED',
            source_entity_type: 'MANUAL',
            source_entity_id: event.receiptId,
            title,
            description: 'Estimating handed off this engagement — review packet and accept or reject.',
            action_required: 'REVIEW',
            priority: 'HIGH',
            created_by: event.actorUserId ?? null,
          })
          .returning({ action_item_id: action_items.action_item_id });

        const row = inserted[0];
        if (row) {
          createdActionItemIds.push(row.action_item_id);
          const emit = await emitActivitySpineEvent(tx, {
            event_type: 'ACTION_ITEM_CREATED',
            scope_entity_type: 'project',
            scope_entity_id: event.engagementId,
            entity_kind: 'action_item',
            entity_id: row.action_item_id,
            kid: event.kid,
            test_data: event.isTestProject,
            metadata: {
              source_event_type: 'HANDOFF_RECEIPT_STATE_CHANGED',
              source_entity_type: 'MANUAL',
              source_entity_id: event.receiptId,
              action_required: 'REVIEW',
              priority: 'HIGH',
              auto_created: true,
              actor: event.actorEmail ?? null,
              handoff_receipt_id: event.receiptId,
            },
          });
          createdEventIds.push(emit.event_id);
        }
      }

      if (plan.autoClose) {
        const stale = await tx
          .select({ action_item_id: action_items.action_item_id })
          .from(action_items)
          .where(
            and(
              eq(action_items.tenant_id, event.tenantId),
              eq(action_items.source_entity_id, event.receiptId),
              inArray(action_items.status, OPEN_ACTIONABLE_STATUSES),
            ),
          );

        if (stale.length > 0) {
          const ids = stale.map((r) => r.action_item_id);
          const closed = await tx
            .update(action_items)
            .set({
              status: 'AUTO_CLOSED',
              auto_closed_reason: plan.reason,
              completed_at: new Date(),
            })
            .where(
              and(
                eq(action_items.tenant_id, event.tenantId),
                inArray(action_items.action_item_id, ids),
              ),
            )
            .returning({ action_item_id: action_items.action_item_id });

          for (const r of closed) {
            autoClosedActionItemIds.push(r.action_item_id);
            const emit = await emitActivitySpineEvent(tx, {
              event_type: 'ACTION_ITEM_CLOSED_AUTO',
              scope_entity_type: event.engagementId ? 'project' : 'internal',
              scope_entity_id: event.engagementId ?? r.action_item_id,
              entity_kind: 'action_item',
              entity_id: r.action_item_id,
              kid: event.kid,
              test_data: event.isTestProject,
              metadata: {
                source_event_type: 'HANDOFF_RECEIPT_STATE_CHANGED',
                source_entity_id: event.receiptId,
                reason: plan.reason,
                actor: event.actorEmail ?? null,
              },
            });
            autoClosedEventIds.push(emit.event_id);
          }
        }
      }

      return {
        createdActionItemIds,
        autoClosedActionItemIds,
        createdEventIds,
        autoClosedEventIds,
        skipped: false,
      };
    });
  } catch (err) {
    return {
      ...EMPTY,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
