/**
 * BAN-341 PM-V1.0-B — Shared executor for RFI Pattern B transitions.
 *
 * Wraps the entity UPDATE + ball-in-court derivation + lifecycle date stamps
 * + Pattern B field_events emit in a single Drizzle transaction. Mirrors
 * lib/pm/submittals/execute-transition.ts but scoped to rfis.
 *
 * Callers pass an optional `extraUpdates` patch (e.g. submitted_to /
 * submitted_date on SUBMITTED; response_received_date / response_text on
 * ANSWERED; generates_change_order / linked_change_order_id on RESOLVED).
 *
 * When `generates_change_order` is set true on a transition INTO RESOLVED,
 * an additional Pattern A RFI_GENERATED_CO event is emitted inside the same
 * transaction, recording the RFI → CO linkage in the activity spine. The
 * CO entity itself is owned by the AIA Billing trunk; v1.0 only records
 * the linkage, not the CO creation.
 */

import { and, eq } from 'drizzle-orm';
import { db, rfis, engagements } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import {
  validateRfiTransition,
  deriveBallInCourt,
  type RfiState,
  type RfiSubmittedTo,
} from './state-machine';
import { dispatchSourceEvent } from '@/lib/pm/action-items/spine-subscriber';

export type ExecuteRfiTransitionInput = {
  rfiId: string;
  tenantId: string;
  toState: RfiState;
  reason?: string | null;
  actorEmail: string;
  /**
   * Optional patch to merge into the UPDATE — used by /submit to set
   * submitted_to + submitted_date; by /log-response to set
   * response_received_date / response_text; by /resolve to set
   * generates_change_order / linked_change_order_id.
   */
  extraUpdates?: Record<string, unknown>;
  /** If true, derived ball_in_court should NOT be applied (caller supplies
   *  its own via extraUpdates). */
  skipBallInCourtDerive?: boolean;
};

export type ExecuteRfiTransitionResult =
  | {
      ok: true;
      from_state: RfiState;
      to_state: RfiState;
      event_id: string;
      co_event_id?: string;
      rfi: Record<string, unknown>;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

export async function executeRfiTransition(
  input: ExecuteRfiTransitionInput,
): Promise<ExecuteRfiTransitionResult> {
  const txResult = await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        rfi_id: rfis.rfi_id,
        engagement_id: rfis.engagement_id,
        rfi_number: rfis.rfi_number,
        status: rfis.status,
        submitted_to: rfis.submitted_to,
        generates_change_order: rfis.generates_change_order,
        linked_change_order_id: rfis.linked_change_order_id,
        is_test_project: engagements.is_test_project,
        engagement_kid: engagements.kid,
      })
      .from(rfis)
      .innerJoin(engagements, eq(rfis.engagement_id, engagements.engagement_id))
      .where(
        and(
          eq(rfis.rfi_id, input.rfiId),
          eq(rfis.tenant_id, input.tenantId),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return {
        ok: false as const,
        status: 404,
        code: 'RFI_NOT_FOUND',
        message: `rfi ${input.rfiId} not found`,
      };
    }
    const row = rows[0];
    const fromState = row.status as RfiState;
    const toState = input.toState;

    const validation = validateRfiTransition(fromState, toState);
    if (!validation.ok) {
      return {
        ok: false as const,
        status: 400,
        code: validation.reason,
        message: validation.message,
      };
    }

    const effectiveSubmittedTo = (input.extraUpdates?.submitted_to as RfiSubmittedTo | undefined)
      ?? (row.submitted_to as RfiSubmittedTo | null | undefined)
      ?? null;

    const updates: Record<string, unknown> = {
      status: toState,
      updated_at: new Date(),
      ...(input.extraUpdates ?? {}),
    };
    if (!input.skipBallInCourtDerive) {
      updates.ball_in_court = deriveBallInCourt(toState, effectiveSubmittedTo);
    }

    const updated = await tx
      .update(rfis)
      .set(updates)
      .where(
        and(
          eq(rfis.rfi_id, input.rfiId),
          eq(rfis.tenant_id, input.tenantId),
        ),
      )
      .returning();

    const emit = await emitActivitySpineEvent(tx, {
      event_type: 'RFI_STATE_CHANGED',
      scope_entity_type: 'project',
      scope_entity_id: row.engagement_id,
      entity_kind: 'rfi',
      entity_id: row.rfi_id,
      kid: row.engagement_kid ?? null,
      test_data: row.is_test_project === true,
      metadata: {
        from_state: fromState,
        to_state: toState,
        rfi_number: row.rfi_number,
        ball_in_court: updates.ball_in_court ?? null,
        actor: input.actorEmail,
        reason: input.reason ?? null,
      },
    });

    // Pattern A linkage emit: when an RFI is resolved with the CO flag set
    // (either inherited from the row or set via this transition's extras),
    // record the RFI → CO linkage on the activity spine. The CO entity row
    // itself is owned by the AIA Billing trunk; v1.0 only records the link.
    let coEventId: string | undefined;
    const generatesCo = (input.extraUpdates?.generates_change_order as boolean | undefined)
      ?? row.generates_change_order
      ?? false;
    if (toState === 'RESOLVED' && generatesCo === true) {
      const linkedCoId = (input.extraUpdates?.linked_change_order_id as string | undefined)
        ?? (row.linked_change_order_id as string | null | undefined)
        ?? null;
      const coEmit = await emitActivitySpineEvent(tx, {
        event_type: 'RFI_GENERATED_CO',
        scope_entity_type: 'project',
        scope_entity_id: row.engagement_id,
        entity_kind: 'rfi',
        entity_id: row.rfi_id,
        kid: row.engagement_kid ?? null,
        test_data: row.is_test_project === true,
        metadata: {
          rfi_number: row.rfi_number,
          linked_change_order_id: linkedCoId,
          actor: input.actorEmail,
        },
      });
      coEventId = coEmit.event_id;
    }

    return {
      ok: true as const,
      from_state: fromState,
      to_state: toState,
      event_id: emit.event_id,
      co_event_id: coEventId,
      rfi: updated[0] as Record<string, unknown>,
      _subscriber: {
        engagement_id: row.engagement_id,
        engagement_kid: row.engagement_kid ?? null,
        is_test_project: row.is_test_project === true,
        rfi_number: row.rfi_number,
        ball_in_court: updates.ball_in_court ?? null,
      },
    };
  });

  // BAN-344 PM-V1.0-E — Action Item Tracker subscriber.  Runs AFTER the
  // source tx commits; dispatchSourceEvent swallows its own failures so
  // the source event is never rolled back by subscriber-side issues.
  if (txResult.ok) {
    const ctx = txResult._subscriber;
    await dispatchSourceEvent({
      eventType: 'RFI_STATE_CHANGED',
      entityKind: 'rfi',
      entityId: input.rfiId,
      tenantId: input.tenantId,
      engagementId: ctx.engagement_id,
      kid: ctx.engagement_kid,
      isTestProject: ctx.is_test_project,
      metadata: {
        from_state: txResult.from_state,
        to_state: txResult.to_state,
        rfi_number: ctx.rfi_number,
        ball_in_court: ctx.ball_in_court,
      },
      actorEmail: input.actorEmail,
    });
    const { _subscriber, ...publicResult } = txResult;
    void _subscriber;
    return publicResult;
  }
  return txResult;
}
