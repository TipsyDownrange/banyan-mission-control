/**
 * BAN-311 Pass 3b.2 — Shared executor for Closeout Pattern B column-based
 * state transitions (punch_list_items.status, warranties.status) PLUS the
 * specialized engagement project_lifecycle executor (event-sourced via the
 * project_lifecycle_states audit log).
 *
 * PR 2 extensions:
 *   - `executeCloseoutPatternBTransition` accepts an optional
 *     `afterEntityUpdate` hook that fires inside the same tx (between the
 *     entity UPDATE and the entity's Pattern B emit) — used by the
 *     punch_list_items route to detect terminal-state clearance and co-fire
 *     PUNCH_LIST_CLEARED in the same Drizzle transaction.
 *   - `executeProjectLifecycleTransitionInTx` extracts PR 1's lifecycle
 *     route core into a tx-aware helper so the substantial completion cert
 *     route can co-fire `PROJECT_STATE_CHANGED` (IN_CLOSEOUT →
 *     SUBSTANTIALLY_COMPLETE) inside its own tx alongside DELIVERABLE_PRODUCED.
 *   - `executeProjectLifecycleTransition` wraps the in-tx helper with
 *     db.transaction so PR 1's lifecycle route keeps an own-tx call site.
 *
 * Mirrors lib/aia/execute-state-transition.ts. AIA module is PROTECTED;
 * Closeout has its own executor to avoid touching AIA scope.
 *
 * ADR-014 Amendment 2 (2026-05-17): the Amendment 1 workaround
 * (`aia_entity_kind: 'engagement'` plus `metadata.closeout_entity_kind` /
 * `closeout_entity_id` stash) has been retired. Closeout kinds are
 * first-class members of `ActivitySpineEntityKind`; emissions pass
 * `entity_kind` / `entity_id` for the real Closeout entity directly,
 * with `scope_entity_type: 'project'` + `scope_entity_id: engagementId`
 * carrying the project scope.
 */

import { and, eq, isNull, type AnyColumn } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db, project_lifecycle_states } from '@/db';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
  type ActivitySpineTx,
} from '@/lib/activity-spine/emit';
import {
  validateCloseoutPatternBTransition,
  closeoutPatternBEventTypeFor,
  closeoutPatternBEntityKindFor,
  PROJECT_LIFECYCLE_STATES,
  PROJECT_LIFECYCLE_ENTRY_STATE,
  isProjectLifecycleReopen,
  type CloseoutPatternBEntity,
  type ProjectLifecycleState,
} from './state-transitions';
import {
  dispatchSourceEvent,
  resolveEngagementContext,
} from '@/lib/pm/action-items/spine-subscriber';

// ─── Column-update executor (punch_list_items, warranties) ──────────────────

export interface ExecuteCloseoutPatternBTransitionInput {
  entity: Exclude<CloseoutPatternBEntity, 'project_lifecycle'>;
  table: PgTable;
  pkColumn: AnyColumn;
  pkValue: string;
  tenantColumn: AnyColumn;
  tenantId: string;
  stateColumn: AnyColumn;
  toState: string;
  reason?: string;
  actorEmail: string;
  testData: boolean;
  engagementId: string;
  fromStateOverride?: string;
  /**
   * Optional in-tx hook fired AFTER the entity UPDATE + Pattern B emit, but
   * still inside the same Drizzle transaction. Throws abort the tx and roll
   * back the entity write. Use for co-fire emissions (e.g.,
   * PUNCH_LIST_CLEARED on terminal-state clearance).
   */
  afterEntityUpdate?: (tx: ActivitySpineTx, ctx: {
    fromState: string;
    toState: string;
    engagementId: string;
    tenantId: string;
    testData: boolean;
    actorEmail: string;
  }) => Promise<void>;
}

export type ExecuteCloseoutPatternBTransitionResult =
  | {
      ok: true;
      event_id: string;
      from_state: string;
      to_state: string;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

export async function executeCloseoutPatternBTransition(
  input: ExecuteCloseoutPatternBTransitionInput,
): Promise<ExecuteCloseoutPatternBTransitionResult> {
  let txResult: ExecuteCloseoutPatternBTransitionResult;
  try {
    txResult = await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(input.table)
        .where(
          and(
            eq(input.pkColumn, input.pkValue),
            eq(input.tenantColumn, input.tenantId),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        return {
          ok: false as const,
          status: 404,
          code: 'NOT_FOUND',
          message: `${input.entity} ${input.pkValue} not found in tenant ${input.tenantId}`,
        };
      }

      const row = existing[0] as Record<string, unknown>;
      const currentState =
        input.fromStateOverride ?? String(row[input.stateColumn.name] ?? '');

      const validation = validateCloseoutPatternBTransition(
        input.entity,
        currentState,
        input.toState,
      );
      if (!validation.ok) {
        const status = validation.reason === 'TRANSITION_NOT_ALLOWED' ? 409 : 400;
        return {
          ok: false as const,
          status,
          code: validation.reason,
          message: validation.message,
        };
      }

      const updateValues: Record<string, unknown> = {};
      updateValues[input.stateColumn.name] = input.toState;
      updateValues['updated_at'] = new Date();

      await tx
        .update(input.table)
        .set(updateValues)
        .where(
          and(
            eq(input.pkColumn, input.pkValue),
            eq(input.tenantColumn, input.tenantId),
          ),
        );

      const emitResult = await emitActivitySpineEvent(tx, {
        event_type: closeoutPatternBEventTypeFor(input.entity),
        scope_entity_type: 'project',
        scope_entity_id: input.engagementId,
        entity_kind: closeoutPatternBEntityKindFor(input.entity),
        entity_id: input.pkValue,
        notes: input.reason ?? null,
        test_data: input.testData,
        metadata: {
          from_state: currentState,
          to_state: input.toState,
          reason: input.reason ?? null,
          actor: input.actorEmail,
        },
      });

      if (input.afterEntityUpdate) {
        await input.afterEntityUpdate(tx, {
          fromState: currentState,
          toState: input.toState,
          engagementId: input.engagementId,
          tenantId: input.tenantId,
          testData: input.testData,
          actorEmail: input.actorEmail,
        });
      }

      return {
        ok: true as const,
        event_id: emitResult.event_id,
        from_state: currentState,
        to_state: input.toState,
      };
    });
  } catch (err) {
    if (err instanceof ActivitySpineEmitError) {
      return {
        ok: false,
        status: 500,
        code: err.code,
        message: err.message,
      };
    }
    return {
      ok: false,
      status: 500,
      code: 'INTERNAL',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // BAN-354 PM-V1.0-E.b — Action Item Tracker subscriber. Fires AFTER the
  // source tx commits; wrapped in try/catch so a subscriber-side error
  // (including the engagement-kid lookup) never rolls back the canonical
  // Pattern B emit.
  if (txResult.ok) {
    try {
      const engCtx = await resolveEngagementContext(input.tenantId, input.engagementId);
      await dispatchSourceEvent({
        eventType: closeoutPatternBEventTypeFor(input.entity),
        entityKind: closeoutPatternBEntityKindFor(input.entity),
        entityId: input.pkValue,
        tenantId: input.tenantId,
        engagementId: input.engagementId,
        kid: engCtx?.kid ?? null,
        isTestProject: input.testData,
        metadata: {
          from_state: txResult.from_state,
          to_state: txResult.to_state,
          reason: input.reason ?? null,
        },
        actorEmail: input.actorEmail,
      });
    } catch {
      // Subscriber failure must never propagate back to the source path.
    }
  }

  return txResult;
}

// ─── Project lifecycle executor (engagement audit log) ──────────────────────

export interface ExecuteProjectLifecycleTransitionInput {
  tenantId: string;
  engagementId: string;
  toState: ProjectLifecycleState;
  /**
   * Pre-resolved current open lifecycle row, supplied by the caller. The
   * caller looks this up before opening its tx so it can short-circuit on
   * 404 cases. null means "no prior lifecycle row" (initial entry).
   */
  currentState: ProjectLifecycleState | null;
  currentRowId: string | null;
  reopenReason?: string;
  reopenBy?: string;
  reason?: string;
  actorEmail: string;
  testData: boolean;
  /**
   * Extra metadata fields merged into the PROJECT_STATE_CHANGED emission's
   * metadata blob — used by co-fires (e.g., substantial completion cert
   * co-fire sets trigger='SUBSTANTIAL_COMPLETION_CERTIFICATE' + evidence=drive_file_id).
   */
  metadataExtra?: Record<string, unknown>;
}

export type ExecuteProjectLifecycleTransitionResult =
  | {
      ok: true;
      event_id: string;
      lifecycle_state_id: string;
      from_state: ProjectLifecycleState | null;
      to_state: ProjectLifecycleState;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

/**
 * Validates the transition + reopen-pair invariant. Returns a failure
 * outcome if validation fails; callers should return immediately. Does NOT
 * touch the database.
 */
export function validateProjectLifecycleTransitionInputs(input: {
  toState: ProjectLifecycleState;
  currentState: ProjectLifecycleState | null;
  reopenReason?: string;
  reopenBy?: string;
}): { ok: true; isReopen: boolean } | { ok: false; status: number; code: string; message: string } {
  if (input.currentState === null) {
    if (input.toState !== PROJECT_LIFECYCLE_ENTRY_STATE) {
      return {
        ok: false,
        status: 409,
        code: 'INVALID_INITIAL_STATE',
        message: `engagement has no prior lifecycle state; initial entry must be ${PROJECT_LIFECYCLE_ENTRY_STATE}`,
      };
    }
    return { ok: true, isReopen: false };
  }
  const validation = validateCloseoutPatternBTransition('project_lifecycle', input.currentState, input.toState);
  if (!validation.ok) {
    const status = validation.reason === 'TRANSITION_NOT_ALLOWED' ? 409 : 400;
    return { ok: false, status, code: validation.reason, message: validation.message };
  }
  const isReopen = isProjectLifecycleReopen(input.currentState, input.toState);
  if (isReopen) {
    const rr = (input.reopenReason ?? '').trim();
    const rb = (input.reopenBy ?? '').trim();
    if (!rr || !rb) {
      return {
        ok: false,
        status: 400,
        code: 'REOPEN_PAIR_REQUIRED',
        message: 'reopen_reason and reopen_by are both required when transitioning to an earlier state',
      };
    }
  }
  return { ok: true, isReopen };
}

/**
 * In-tx lifecycle executor — close prior open row's exited_at, insert new
 * row, emit PROJECT_STATE_CHANGED. Does NOT open its own tx; caller is
 * responsible for the surrounding db.transaction(). Throws ActivitySpineEmitError
 * on emit failure (caller's tx aborts).
 */
export async function executeProjectLifecycleTransitionInTx(
  tx: ActivitySpineTx,
  input: ExecuteProjectLifecycleTransitionInput,
): Promise<{ event_id: string; lifecycle_state_id: string }> {
  const validated = validateProjectLifecycleTransitionInputs({
    toState: input.toState,
    currentState: input.currentState,
    reopenReason: input.reopenReason,
    reopenBy: input.reopenBy,
  });
  if (!validated.ok) {
    // Caller should have already validated; if reached here, surface as an
    // emit-style failure to bail the surrounding tx.
    throw new ActivitySpineEmitError('INVALID_PAYLOAD', validated.message);
  }
  const { isReopen } = validated;

  if (input.currentRowId) {
    await tx
      .update(project_lifecycle_states)
      .set({ exited_at: new Date(), updated_at: new Date() })
      .where(
        and(
          eq(project_lifecycle_states.lifecycle_state_id, input.currentRowId),
          eq(project_lifecycle_states.tenant_id, input.tenantId),
        ),
      );
  }

  const insertValues = {
    tenant_id: input.tenantId,
    engagement_id: input.engagementId,
    state: input.toState,
    reopen_reason: isReopen ? input.reopenReason!.trim() : null,
    reopen_by: isReopen ? input.reopenBy!.trim() : null,
  };
  const inserted = await tx
    .insert(project_lifecycle_states)
    .values(insertValues)
    .returning({ lifecycle_state_id: project_lifecycle_states.lifecycle_state_id });

  const emit = await emitActivitySpineEvent(tx, {
    event_type: 'PROJECT_STATE_CHANGED',
    scope_entity_type: 'project',
    scope_entity_id: input.engagementId,
    entity_kind: 'engagement',
    entity_id: input.engagementId,
    notes: input.reason ?? null,
    test_data: input.testData,
    metadata: {
      from_state: input.currentState ?? '(none)',
      to_state: input.toState,
      reason: input.reason ?? null,
      actor: input.actorEmail,
      lifecycle_state_id: inserted[0].lifecycle_state_id,
      reopen: isReopen,
      reopen_reason: isReopen ? input.reopenReason!.trim() : null,
      reopen_by: isReopen ? input.reopenBy!.trim() : null,
      ...(input.metadataExtra ?? {}),
    },
  });

  return { event_id: emit.event_id, lifecycle_state_id: inserted[0].lifecycle_state_id };
}

/**
 * Wrapper around executeProjectLifecycleTransitionInTx that opens its own
 * db.transaction(). Used by the PR 1 lifecycle-transition route.
 */
export async function executeProjectLifecycleTransition(
  input: ExecuteProjectLifecycleTransitionInput,
): Promise<ExecuteProjectLifecycleTransitionResult> {
  const validated = validateProjectLifecycleTransitionInputs({
    toState: input.toState,
    currentState: input.currentState,
    reopenReason: input.reopenReason,
    reopenBy: input.reopenBy,
  });
  if (!validated.ok) {
    return validated;
  }
  try {
    const result = await db.transaction(async (tx) =>
      executeProjectLifecycleTransitionInTx(tx, input),
    );
    return {
      ok: true,
      event_id: result.event_id,
      lifecycle_state_id: result.lifecycle_state_id,
      from_state: input.currentState,
      to_state: input.toState,
    };
  } catch (err) {
    if (err instanceof ActivitySpineEmitError) {
      return { ok: false, status: 500, code: err.code, message: err.message };
    }
    return {
      ok: false,
      status: 500,
      code: 'INTERNAL',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Look up the current open lifecycle row (exited_at IS NULL) for an
 * engagement, outside any tx. Used by both PR 1's lifecycle route and PR 2's
 * substantial completion cert co-fire path.
 */
export async function lookupCurrentLifecycleRow(
  tenantId: string,
  engagementId: string,
): Promise<{ lifecycle_state_id: string; state: ProjectLifecycleState } | null> {
  const rows = await db
    .select({
      lifecycle_state_id: project_lifecycle_states.lifecycle_state_id,
      state: project_lifecycle_states.state,
    })
    .from(project_lifecycle_states)
    .where(
      and(
        eq(project_lifecycle_states.engagement_id, engagementId),
        eq(project_lifecycle_states.tenant_id, tenantId),
        isNull(project_lifecycle_states.exited_at),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  return {
    lifecycle_state_id: rows[0].lifecycle_state_id,
    state: rows[0].state as ProjectLifecycleState,
  };
}

// Re-export for callers that just need the validator shape.
export { PROJECT_LIFECYCLE_STATES };
