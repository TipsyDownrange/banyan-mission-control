/**
 * BAN-309 Pass 3a.2 — Canonical Postgres Activity Spine emission helper.
 *
 * Routes that mutate AIA, TPA, or Closeout entities must call this helper
 * inside a Drizzle transaction so the field_events INSERT commits / rolls
 * back atomically with the entity write. See
 * docs/adr/ADR-014_AMENDMENT_1_POSTGRES_EMISSION_HELPER_2026-05-17.md for
 * the original rationale and the scope boundary with Packet 005.5
 * (lib/events.ts:emitMCEvent stays Sheets-only until the 005.5 cutover).
 *
 * ADR-014 Amendment 2 (2026-05-17) generalizes the helper for Closeout:
 *   - Type `ActivitySpineAiaEntityKind` renamed to `ActivitySpineEntityKind`
 *     and extended additively from 12 AIA kinds to 19 (adds 7 Closeout
 *     kinds: punch_list_item, warranty, notice_of_completion,
 *     deliverable_document, unified_job_packet, substantial_completion_cert,
 *     gold_dataset_entry; `engagement` already present from the AIA set is
 *     reused by Closeout project_lifecycle emissions).
 *   - Input field rename: `entity_type`/`entity_id` (project scope) →
 *     `scope_entity_type`/`scope_entity_id`; `aia_entity_kind`/`aia_entity_id`
 *     (entity being acted on) → `entity_kind`/`entity_id`. The renamed
 *     `entity_kind`/`entity_id` are stored in metadata under the same keys
 *     (the prior `aia_entity_kind`/`aia_entity_id` metadata keys are
 *     retired for new emits). field_events.entity_type/entity_id columns
 *     are unchanged — `scope_entity_type`/`scope_entity_id` map to them.
 *   - Closeout routes no longer set the metadata.closeout_entity_kind /
 *     closeout_entity_id workaround stash; the canonical entity_kind /
 *     entity_id metadata keys carry that information directly.
 *
 * See docs/adr/ADR-014_AMENDMENT_2_ENTITY_KIND_GENERALIZATION.md.
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

// AIA / TPA / Closeout entities are all project-scoped per the field_events
// coreEntityTypeEnum (project, service_work_order, service_request, estimate,
// internal). The concrete entity id and table are recorded in
// metadata.entity_kind + metadata.entity_id so consumers can resolve the
// row without changing the enum.
export type ActivitySpineEntityType =
  | 'project'
  | 'service_work_order'
  | 'service_request'
  | 'estimate'
  | 'internal';

// ADR-014 Amendment 2 — 19-member additive union.
// AIA (12, unchanged from Amendment 1):
//   engagement, pay_application, sov_version, schedule_of_values,
//   tm_authorization, tm_ticket, lien_waiver, retainage_holding,
//   handoff_validation, test_project_reset, notarization_session,
//   cash_receipt.
// Closeout (7 new; engagement is reused from the AIA set for
// project_lifecycle emissions):
//   punch_list_item, warranty, notice_of_completion, deliverable_document,
//   unified_job_packet, substantial_completion_cert, gold_dataset_entry.
export type ActivitySpineEntityKind =
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
  | 'cash_receipt'
  | 'punch_list_item'
  | 'warranty'
  | 'notice_of_completion'
  | 'deliverable_document'
  | 'unified_job_packet'
  | 'substantial_completion_cert'
  | 'gold_dataset_entry'
  | 'submittal'
  | 'rfi'
  | 'verbal_agreement'
  // BAN-338 v2c — joint check + external waivers + GC-required docs
  | 'joint_check_agreement'
  | 'external_lien_waiver_request'
  | 'gc_required_docs_checklist'
  // BAN-343 PM-V1.0-D — meeting log
  | 'meeting'
  // BAN-344a PM-V1.0-E (CORE) — action item tracker (manual creation surface
  // in 344a; subscriber pattern lands in 344b without changing this kind).
  | 'action_item';

export interface ActivitySpineEmitInput {
  event_type: ActivitySpineEventType | string;
  // Scope — maps to field_events.entity_type / field_events.entity_id
  // (typically 'project' + engagement_id for AIA/TPA/Closeout rows).
  scope_entity_type: ActivitySpineEntityType;
  scope_entity_id: string;
  // The entity being acted upon — recorded in metadata.entity_kind /
  // metadata.entity_id so consumers can resolve the concrete row without
  // changing the field_events.entity_type enum.
  entity_kind: ActivitySpineEntityKind;
  entity_id: string;
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
    entity_kind: input.entity_kind,
    entity_id: input.entity_id,
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
        entity_type: input.scope_entity_type,
        entity_id: input.scope_entity_id,
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
