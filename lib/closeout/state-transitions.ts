/**
 * BAN-311 Pass 3b.2 — Pattern B state-machine transition helpers for
 * Closeout lifecycle entities (engagement project lifecycle,
 * punch_list_items, warranties).
 *
 * Mirrors lib/aia/state-transitions.ts shape so the executor + validator
 * stay symmetric across trunks. AIA module is PROTECTED — Closeout lives
 * in its own module per BAN-311 dispatch.
 *
 * Pattern B canon: every transition emits a *_STATE_CHANGED event with
 * from_state + to_state in metadata (per
 * lib/activity-spine/event-contract.ts:93-100).
 *
 * Graphs derived from schema CHECK / native pgEnum + lifecycle inference;
 * Closeout v1.1 spec not directly accessible from this execution
 * environment — graphs marked UNVERIFIED against spec (see PR description).
 */

import type { ActivitySpineEventType } from '@/lib/activity-spine/event-contract';

export type CloseoutPatternBEntity =
  | 'project_lifecycle'
  | 'punch_list_item'
  | 'warranty';

/**
 * Closeout-specific entity-kind tag for `metadata.closeout_entity_kind`.
 *
 * Closeout entities are NOT in the `ActivitySpineAiaEntityKind` union in
 * lib/activity-spine/emit.ts (that union is AIA-scoped per the field's
 * docstring). emit.ts is consume-only per BAN-309 D8 contract. So Closeout
 * emits set `aia_entity_kind: 'engagement'` (faithful — every Closeout row
 * FKs to an engagement, and `aia_entity_id` carries the engagement_id) and
 * stash the concrete Closeout entity kind + id in metadata under
 * `closeout_entity_kind` + `closeout_entity_id` for consumer resolution.
 */
export type CloseoutEntityKind =
  | 'engagement'
  | 'punch_list_item'
  | 'warranty';

// ── Engagement project lifecycle (event-sourced via project_lifecycle_states
// audit log — NOT a column on engagements). States mirror the
// projectLifecycleStateEnum: IN_CLOSEOUT, SUBSTANTIALLY_COMPLETE,
// FINAL_COMPLETE, ARCHIVED. "Reopen" edges return to IN_CLOSEOUT from a
// later state; the schema's project_lifecycle_states_reopen_pair_check
// CHECK forces (reopen_reason, reopen_by) to be both-null or both-non-null.

export const PROJECT_LIFECYCLE_STATES = [
  'IN_CLOSEOUT',
  'SUBSTANTIALLY_COMPLETE',
  'FINAL_COMPLETE',
  'ARCHIVED',
] as const;
export type ProjectLifecycleState = typeof PROJECT_LIFECYCLE_STATES[number];

export const PROJECT_LIFECYCLE_ALLOWED_TRANSITIONS: Record<ProjectLifecycleState, ProjectLifecycleState[]> = {
  IN_CLOSEOUT: ['SUBSTANTIALLY_COMPLETE'],
  SUBSTANTIALLY_COMPLETE: ['FINAL_COMPLETE', 'IN_CLOSEOUT'],
  FINAL_COMPLETE: ['ARCHIVED', 'IN_CLOSEOUT'],
  ARCHIVED: ['IN_CLOSEOUT'],
};

/** Initial-entry state — used when an engagement has no prior lifecycle row. */
export const PROJECT_LIFECYCLE_ENTRY_STATE: ProjectLifecycleState = 'IN_CLOSEOUT';

/**
 * True iff a transition is a reopen (going back to IN_CLOSEOUT from any
 * non-initial state). The route uses this to enforce the reopen_pair
 * invariant (reason + by both required).
 */
export function isProjectLifecycleReopen(
  fromState: ProjectLifecycleState | null,
  toState: ProjectLifecycleState,
): boolean {
  return toState === 'IN_CLOSEOUT' && fromState !== null && fromState !== 'IN_CLOSEOUT';
}

// ── punch_list_items.status (7 states; native pgEnum punch_list_item_status)

export const PUNCH_LIST_ITEM_STATES = [
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'SIGNED_OFF',
  'DISPUTED',
  'DEFERRED_TO_WARRANTY',
] as const;
export type PunchListItemState = typeof PUNCH_LIST_ITEM_STATES[number];

export const PUNCH_LIST_ITEM_ALLOWED_TRANSITIONS: Record<PunchListItemState, PunchListItemState[]> = {
  NEW: ['ASSIGNED', 'IN_PROGRESS', 'DEFERRED_TO_WARRANTY', 'DISPUTED'],
  ASSIGNED: ['IN_PROGRESS', 'DISPUTED', 'DEFERRED_TO_WARRANTY'],
  IN_PROGRESS: ['COMPLETED', 'DISPUTED', 'DEFERRED_TO_WARRANTY'],
  COMPLETED: ['SIGNED_OFF', 'IN_PROGRESS', 'DISPUTED'],
  SIGNED_OFF: [],
  DISPUTED: ['IN_PROGRESS', 'DEFERRED_TO_WARRANTY', 'SIGNED_OFF'],
  DEFERRED_TO_WARRANTY: [],
};

// ── warranties.status (3 states; native pgEnum warranty_status)

export const WARRANTY_STATES = ['ACTIVE', 'PARTIALLY_EXPIRED', 'EXPIRED'] as const;
export type WarrantyState = typeof WARRANTY_STATES[number];

export const WARRANTY_ALLOWED_TRANSITIONS: Record<WarrantyState, WarrantyState[]> = {
  ACTIVE: ['PARTIALLY_EXPIRED', 'EXPIRED'],
  PARTIALLY_EXPIRED: ['EXPIRED'],
  EXPIRED: [],
};

// ── Per-entity metadata ─────────────────────────────────────────────────────

interface PatternBEntityMeta<S extends string> {
  event_type: ActivitySpineEventType;
  closeout_entity_kind: CloseoutEntityKind;
  states: readonly S[];
  transitions: Record<S, readonly S[]>;
}

export const CLOSEOUT_PATTERN_B_ENTITIES: {
  project_lifecycle: PatternBEntityMeta<ProjectLifecycleState>;
  punch_list_item: PatternBEntityMeta<PunchListItemState>;
  warranty: PatternBEntityMeta<WarrantyState>;
} = {
  project_lifecycle: {
    event_type: 'PROJECT_STATE_CHANGED',
    closeout_entity_kind: 'engagement',
    states: PROJECT_LIFECYCLE_STATES,
    transitions: PROJECT_LIFECYCLE_ALLOWED_TRANSITIONS,
  },
  punch_list_item: {
    event_type: 'PUNCH_LIST_ITEM_STATE_CHANGED',
    closeout_entity_kind: 'punch_list_item',
    states: PUNCH_LIST_ITEM_STATES,
    transitions: PUNCH_LIST_ITEM_ALLOWED_TRANSITIONS,
  },
  warranty: {
    event_type: 'WARRANTY_STATE_CHANGED',
    closeout_entity_kind: 'warranty',
    states: WARRANTY_STATES,
    transitions: WARRANTY_ALLOWED_TRANSITIONS,
  },
};

// ── Validation ──────────────────────────────────────────────────────────────

export type TransitionValidationResult =
  | { ok: true }
  | { ok: false; reason: 'UNKNOWN_FROM_STATE' | 'UNKNOWN_TO_STATE' | 'TRANSITION_NOT_ALLOWED' | 'NO_OP'; message: string };

export function validateCloseoutPatternBTransition(
  entity: CloseoutPatternBEntity,
  fromState: string,
  toState: string,
): TransitionValidationResult {
  const meta = CLOSEOUT_PATTERN_B_ENTITIES[entity];
  const states = meta.states as readonly string[];
  const transitions = meta.transitions as Record<string, readonly string[]>;

  if (!states.includes(fromState)) {
    return { ok: false, reason: 'UNKNOWN_FROM_STATE', message: `Unknown ${entity} from_state: ${fromState}` };
  }
  if (!states.includes(toState)) {
    return { ok: false, reason: 'UNKNOWN_TO_STATE', message: `Unknown ${entity} to_state: ${toState}` };
  }
  if (fromState === toState) {
    return { ok: false, reason: 'NO_OP', message: `${entity} transition from ${fromState} to ${toState} is a no-op` };
  }
  if (!transitions[fromState].includes(toState)) {
    return {
      ok: false,
      reason: 'TRANSITION_NOT_ALLOWED',
      message: `${entity} transition ${fromState} → ${toState} is not allowed`,
    };
  }
  return { ok: true };
}

export function closeoutPatternBEventTypeFor(entity: CloseoutPatternBEntity): ActivitySpineEventType {
  return CLOSEOUT_PATTERN_B_ENTITIES[entity].event_type;
}

export function closeoutPatternBEntityKindFor(entity: CloseoutPatternBEntity): CloseoutEntityKind {
  return CLOSEOUT_PATTERN_B_ENTITIES[entity].closeout_entity_kind;
}
