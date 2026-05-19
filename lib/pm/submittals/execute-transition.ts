/**
 * BAN-340 PM-V1.0-A — Shared executor for submittal Pattern B transitions.
 *
 * Wraps the entity UPDATE + ball-in-court derivation + lifecycle date
 * stamps + Pattern B field_events emit in a single Drizzle transaction,
 * mirroring the structure of lib/closeout/execute-state-transition.ts but
 * scoped to submittals only.
 *
 * Callers pass an optional `extraUpdates` patch (e.g. submitted_to /
 * submitted_date on the SUBMITTED transition); the executor merges those
 * with the always-applied status + ball_in_court + updated_at fields.
 */

import { and, eq } from 'drizzle-orm';
import { db, submittals, engagements } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import {
  validateSubmittalTransition,
  deriveBallInCourt,
  type SubmittalState,
  type SubmittalSubmittedTo,
} from './state-machine';
import { dispatchSourceEvent } from '@/lib/pm/action-items/spine-subscriber';

export type ExecuteSubmittalTransitionInput = {
  submittalId: string;
  tenantId: string;
  toState: SubmittalState;
  reason?: string | null;
  actorEmail: string;
  /**
   * Optional patch to merge into the UPDATE — used by /submit to set
   * submitted_to + submitted_date, by /log-review to set reviewed_date /
   * approved_date / closed_date.
   */
  extraUpdates?: Record<string, unknown>;
  /** If true, the derived ball_in_court value should NOT be applied (caller
   *  supplies its own via extraUpdates). */
  skipBallInCourtDerive?: boolean;
};

export type ExecuteSubmittalTransitionResult =
  | {
      ok: true;
      from_state: SubmittalState;
      to_state: SubmittalState;
      event_id: string;
      submittal: Record<string, unknown>;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

export async function executeSubmittalTransition(
  input: ExecuteSubmittalTransitionInput,
): Promise<ExecuteSubmittalTransitionResult> {
  const txResult = await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        submittal_id: submittals.submittal_id,
        engagement_id: submittals.engagement_id,
        submittal_number: submittals.submittal_number,
        status: submittals.status,
        submitted_to: submittals.submitted_to,
        is_test_project: engagements.is_test_project,
        engagement_kid: engagements.kid,
      })
      .from(submittals)
      .innerJoin(engagements, eq(submittals.engagement_id, engagements.engagement_id))
      .where(
        and(
          eq(submittals.submittal_id, input.submittalId),
          eq(submittals.tenant_id, input.tenantId),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return {
        ok: false as const,
        status: 404,
        code: 'SUBMITTAL_NOT_FOUND',
        message: `submittal ${input.submittalId} not found`,
      };
    }
    const row = rows[0];
    const fromState = row.status as SubmittalState;
    const toState = input.toState;

    const validation = validateSubmittalTransition(fromState, toState);
    if (!validation.ok) {
      return {
        ok: false as const,
        status: 400,
        code: validation.reason,
        message: validation.message,
      };
    }

    // Resolve the effective submitted_to for ball-in-court derivation: prefer
    // an explicit value in extraUpdates (set by /submit), fall back to the
    // existing column value.
    const effectiveSubmittedTo = (input.extraUpdates?.submitted_to as SubmittalSubmittedTo | undefined)
      ?? (row.submitted_to as SubmittalSubmittedTo | null | undefined)
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
      .update(submittals)
      .set(updates)
      .where(
        and(
          eq(submittals.submittal_id, input.submittalId),
          eq(submittals.tenant_id, input.tenantId),
        ),
      )
      .returning();

    const emit = await emitActivitySpineEvent(tx, {
      event_type: 'SUBMITTAL_STATE_CHANGED',
      scope_entity_type: 'project',
      scope_entity_id: row.engagement_id,
      entity_kind: 'submittal',
      entity_id: row.submittal_id,
      kid: row.engagement_kid ?? null,
      test_data: row.is_test_project === true,
      metadata: {
        from_state: fromState,
        to_state: toState,
        submittal_number: row.submittal_number,
        ball_in_court: updates.ball_in_court ?? null,
        actor: input.actorEmail,
        reason: input.reason ?? null,
      },
    });

    return {
      ok: true as const,
      from_state: fromState,
      to_state: toState,
      event_id: emit.event_id,
      submittal: updated[0] as Record<string, unknown>,
      _subscriber: {
        engagement_id: row.engagement_id,
        engagement_kid: row.engagement_kid ?? null,
        is_test_project: row.is_test_project === true,
        submittal_number: row.submittal_number,
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
      eventType: 'SUBMITTAL_STATE_CHANGED',
      entityKind: 'submittal',
      entityId: input.submittalId,
      tenantId: input.tenantId,
      engagementId: ctx.engagement_id,
      kid: ctx.engagement_kid,
      isTestProject: ctx.is_test_project,
      metadata: {
        from_state: txResult.from_state,
        to_state: txResult.to_state,
        submittal_number: ctx.submittal_number,
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
