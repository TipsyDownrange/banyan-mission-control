/**
 * BAN-309 Pass 3a.2 — Shared executor for Pattern B state transitions.
 *
 * Wraps the (validate → fetch → update state → emit field_events row → return)
 * sequence in a single Drizzle transaction so the row update and the
 * Activity Spine emit commit or roll back together. The caller passes the
 * Drizzle table + columns it owns, and this executor stays generic.
 */

import { and, eq, type AnyColumn } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';
import {
  validatePatternBTransition,
  patternBEventTypeFor,
  patternBEntityKindFor,
  type AiaPatternBEntity,
} from './state-transitions';
import {
  dispatchSourceEvent,
  resolveEngagementContext,
} from '@/lib/pm/action-items/spine-subscriber';

export interface ExecutePatternBTransitionInput {
  entity: AiaPatternBEntity;
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

export type ExecutePatternBTransitionResult =
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

export async function executePatternBTransition(
  input: ExecutePatternBTransitionInput,
): Promise<ExecutePatternBTransitionResult> {
  let txResult: ExecutePatternBTransitionResult;
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

      const validation = validatePatternBTransition(
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
        event_type: patternBEventTypeFor(input.entity),
        scope_entity_type: 'project',
        scope_entity_id: input.engagementId,
        entity_kind: patternBEntityKindFor(input.entity),
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
  // Pattern B emit. Event types without a rule (sov_version, lien_waiver,
  // tm_authorization) return { skipped: true, reason: 'no-rule-match' }.
  if (txResult.ok) {
    try {
      const engCtx = await resolveEngagementContext(input.tenantId, input.engagementId);
      await dispatchSourceEvent({
        eventType: patternBEventTypeFor(input.entity),
        entityKind: patternBEntityKindFor(input.entity),
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
