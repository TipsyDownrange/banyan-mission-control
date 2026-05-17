/**
 * BAN-311 Pass 3b.2 — Shared executor for Closeout Pattern B column-based
 * state transitions (punch_list_items.status, warranties.status).
 *
 * NOT used for engagement project_lifecycle_state transitions — those are
 * event-sourced via the project_lifecycle_states audit log (a different
 * write shape) and live in their own route file.
 *
 * Mirrors lib/aia/execute-state-transition.ts. AIA module is PROTECTED;
 * Closeout has its own executor to avoid touching AIA scope.
 *
 * emit.ts is consume-only per BAN-309 D8 contract; the ActivitySpineEmitInput's
 * `aia_entity_kind` field is AIA-scoped (union doesn't include closeout kinds).
 * This executor sets `aia_entity_kind: 'engagement'` (faithful — the engagement
 * is the project that owns the closeout row, and aia_entity_id carries the
 * engagement_id) and stashes the concrete closeout entity kind + id in
 * metadata under `closeout_entity_kind` + `closeout_entity_id`.
 */

import { and, eq, type AnyColumn } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';
import {
  validateCloseoutPatternBTransition,
  closeoutPatternBEventTypeFor,
  closeoutPatternBEntityKindFor,
  type CloseoutPatternBEntity,
} from './state-transitions';

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
  try {
    return await db.transaction(async (tx) => {
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
        entity_type: 'project',
        entity_id: input.engagementId,
        aia_entity_kind: 'engagement',
        aia_entity_id: input.engagementId,
        notes: input.reason ?? null,
        test_data: input.testData,
        metadata: {
          from_state: currentState,
          to_state: input.toState,
          reason: input.reason ?? null,
          actor: input.actorEmail,
          closeout_entity_kind: closeoutPatternBEntityKindFor(input.entity),
          closeout_entity_id: input.pkValue,
        },
      });

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
}
