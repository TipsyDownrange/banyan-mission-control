/**
 * BAN-346 PM-V1.0-G — PM Handoff Receipt state machine executor.
 *
 * Wraps row update + HANDOFF_RECEIPT_STATE_CHANGED emission in a single
 * Drizzle transaction.  Mirrors lib/pm/action-items/state-transitions.ts.
 *
 * State machine (Q6=A — always-allow accept):
 *   pending_review   → reviewed_complete   (via /review)
 *   pending_review   → accepted | accepted_with_gaps (via /accept)
 *   pending_review   → rejected_with_gaps  (via /reject)
 *   reviewed_complete → accepted | accepted_with_gaps (via /accept)
 *   reviewed_complete → rejected_with_gaps (via /reject)
 *   accepted / accepted_with_gaps / rejected_with_gaps → terminal (no re-open)
 *
 * The /accept handler picks accepted vs accepted_with_gaps based on whether
 * any critical_gap has unresolved status (Q6=A policy).
 */

import { and, eq } from 'drizzle-orm';
import { db, pm_handoff_receipts } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import {
  isTerminalState,
  type CriticalGap,
  type PmHandoffState,
} from './types';
import { getHandoffReceiptForTenant } from './route-utils';

export const TERMINAL_STATES: readonly PmHandoffState[] = [
  'accepted',
  'rejected_with_gaps',
  'accepted_with_gaps',
] as const;

export type HandoffTransitionInput = {
  receiptId: string;
  tenantId: string;
  toState: PmHandoffState;
  actorEmail: string;
  actorUserId: string | null;
  reason?: string | null;
  /** Optional patch (e.g. critical_gaps snapshot at accept time). */
  extraUpdates?: Record<string, unknown>;
};

export type HandoffTransitionResult =
  | {
      ok: true;
      from_state: PmHandoffState;
      to_state: PmHandoffState;
      event_id: string;
      receipt: Record<string, unknown>;
    }
  | { ok: false; status: number; code: string; message: string };

/**
 * Allowed transitions per Q6=A.  Note: accept is allowed from BOTH
 * pending_review and reviewed_complete (PM may accept without an explicit
 * review step).
 */
export function isAllowedTransition(
  from: PmHandoffState,
  to: PmHandoffState,
): boolean {
  if (isTerminalState(from)) return false;
  if (to === 'reviewed_complete') return from === 'pending_review';
  if (to === 'accepted' || to === 'accepted_with_gaps') {
    return from === 'pending_review' || from === 'reviewed_complete';
  }
  if (to === 'rejected_with_gaps') {
    return from === 'pending_review' || from === 'reviewed_complete';
  }
  return false;
}

export async function executeHandoffTransition(
  input: HandoffTransitionInput,
): Promise<HandoffTransitionResult> {
  const existing = await getHandoffReceiptForTenant(input.tenantId, input.receiptId);
  if (!existing) {
    return {
      ok: false,
      status: 404,
      code: 'HANDOFF_RECEIPT_NOT_FOUND',
      message: 'handoff receipt not found',
    };
  }
  const fromState = existing.state as PmHandoffState;
  const toState = input.toState;
  if (!isAllowedTransition(fromState, toState)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_TRANSITION',
      message: `cannot transition from ${fromState} to ${toState}`,
    };
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    const updates: Record<string, unknown> = {
      state: toState,
      updated_at: now,
      ...(input.extraUpdates ?? {}),
    };
    if (toState === 'reviewed_complete') {
      updates.reviewed_at = now;
      updates.reviewed_by_user_id = input.actorUserId;
    } else if (toState === 'accepted' || toState === 'accepted_with_gaps') {
      updates.accepted_at = now;
      // Set reviewed_at if PM is skipping the explicit review step.
      if (!existing.reviewed_at) {
        updates.reviewed_at = now;
        updates.reviewed_by_user_id = input.actorUserId;
      }
    } else if (toState === 'rejected_with_gaps') {
      updates.rejected_at = now;
      if (!existing.reviewed_at) {
        updates.reviewed_at = now;
        updates.reviewed_by_user_id = input.actorUserId;
      }
    }

    const updated = await tx
      .update(pm_handoff_receipts)
      .set(updates)
      .where(
        and(
          eq(pm_handoff_receipts.id, input.receiptId),
          eq(pm_handoff_receipts.tenant_id, input.tenantId),
        ),
      )
      .returning();

    const gaps = (existing.critical_gaps ?? []) as CriticalGap[];
    const emit = await emitActivitySpineEvent(tx, {
      event_type: 'HANDOFF_RECEIPT_STATE_CHANGED',
      scope_entity_type: existing.engagement_id ? 'project' : 'internal',
      scope_entity_id: existing.engagement_id ?? input.receiptId,
      entity_kind: 'handoff_receipt',
      entity_id: input.receiptId,
      kid: existing.kid ?? null,
      test_data: existing.is_test_project === true,
      metadata: {
        from_state: fromState,
        to_state: toState,
        actor: input.actorEmail,
        reason: input.reason ?? null,
        critical_gap_count: gaps.length,
        unresolved_gap_count: gaps.filter(
          (g) => g.status !== 'RESOLVED' && g.status !== 'WAIVED',
        ).length,
      },
    });

    return {
      ok: true,
      from_state: fromState,
      to_state: toState,
      event_id: emit.event_id,
      receipt: updated[0] as Record<string, unknown>,
    };
  });
}
