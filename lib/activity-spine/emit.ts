/**
 * BAN-309 Pass 3a.2 — Canonical Postgres Activity Spine emission helper.
 *
 * Routes that mutate AIA / TPA entities must call this helper inside a
 * Drizzle transaction so the field_events INSERT commits / rolls back
 * atomically with the entity write. See
 * docs/adr/ADR-014_AMENDMENT_1_POSTGRES_EMISSION_HELPER_2026-05-17.md for
 * the rationale and the scope boundary with Packet 005.5
 * (lib/events.ts:emitMCEvent stays Sheets-only until the 005.5 cutover).
 *
 * Failure modes are by design opposite of emitMCEvent: this helper THROWS
 * (an ActivitySpineEmitError) when validation or the INSERT fails, so the
 * surrounding tx aborts the entity write.
 */

import { db, field_events } from '@/db';
import {
  isActivitySpineEventType,
  validateActivitySpinePayload,
  type ActivitySpineEventType,
} from './event-contract';

// AIA / TPA entities are all project-scoped per the field_events
// coreEntityTypeEnum (project, service_work_order, service_request, estimate,
// internal). The concrete AIA entity id and table are recorded in
// metadata.aia_entity_kind + metadata.aia_entity_id so consumers can
// resolve the row without changing the enum.
export type ActivitySpineEntityType =
  | 'project'
  | 'service_work_order'
  | 'service_request'
  | 'estimate'
  | 'internal';

export type ActivitySpineAiaEntityKind =
  | 'engagement'
  | 'pay_application'
  | 'sov_version'
  | 'schedule_of_values'
  | 'tm_authorization'
  | 'tm_ticket'
  | 'lien_waiver'
  | 'retainage_holding'
  | 'handoff_validation'
  | 'test_project_reset'
  | 'notarization_session'
  | 'cash_receipt';

export interface ActivitySpineEmitInput {
  event_type: ActivitySpineEventType | string;
  entity_type: ActivitySpineEntityType;
  entity_id: string;
  aia_entity_kind: ActivitySpineAiaEntityKind;
  aia_entity_id: string;
  kid?: string | null;
  description?: string | null;
  notes?: string | null;
  reported_by?: string | null;
  test_data: boolean;
  metadata?: Record<string, unknown>;
}

export class ActivitySpineEmitError extends Error {
  readonly code:
    | 'UNKNOWN_EVENT_TYPE'
    | 'INVALID_PAYLOAD'
    | 'INSERT_FAILED'
    | 'EMPTY_RETURNING';
  constructor(
    code: ActivitySpineEmitError['code'],
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ActivitySpineEmitError';
    this.code = code;
  }
}

// The Drizzle tx handle shares the same insert/update API as `db`. We
// derive the exact type from db.transaction so the helper accepts whatever
// shape Drizzle's node-postgres driver hands callers.
type DbType = typeof db;
export type ActivitySpineTx = Parameters<Parameters<DbType['transaction']>[0]>[0];

export async function emitActivitySpineEvent(
  tx: ActivitySpineTx,
  input: ActivitySpineEmitInput,
): Promise<{ event_id: string }> {
  if (!isActivitySpineEventType(input.event_type)) {
    throw new ActivitySpineEmitError(
      'UNKNOWN_EVENT_TYPE',
      `Unknown Activity Spine event_type: ${String(input.event_type)}`,
    );
  }

  const metadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    aia_entity_kind: input.aia_entity_kind,
    aia_entity_id: input.aia_entity_id,
  };

  const validation = validateActivitySpinePayload(input.event_type, metadata);
  if (!validation.ok) {
    throw new ActivitySpineEmitError(
      'INVALID_PAYLOAD',
      `Activity Spine payload validation failed for ${input.event_type}: ${validation.errors.join('; ')}`,
      validation.errors,
    );
  }

  let inserted: { event_id: string }[];
  try {
    inserted = await tx
      .insert(field_events)
      .values({
        event_type: input.event_type,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        kid: input.kid ?? null,
        description: input.description ?? null,
        notes: input.notes ?? null,
        reported_by: input.reported_by ?? null,
        test_data: input.test_data,
        metadata,
      })
      .returning({ event_id: field_events.event_id });
  } catch (err) {
    throw new ActivitySpineEmitError(
      'INSERT_FAILED',
      `field_events INSERT failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  if (!inserted[0]?.event_id) {
    throw new ActivitySpineEmitError(
      'EMPTY_RETURNING',
      'field_events INSERT returned no rows',
    );
  }

  return { event_id: inserted[0].event_id };
}
