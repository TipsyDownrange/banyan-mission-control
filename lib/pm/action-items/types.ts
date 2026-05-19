/**
 * BAN-344 PM-V1.0-E — Action Item Tracker canonical enumerations.
 *
 * PM Trunk v1.0 §9.  Subscriber-pattern aggregator: a source-trunk Pattern A
 * or Pattern B event triggers auto-creation of an action_items row.  Kai
 * integration is OPTIONAL (Charter Amendment 2): the subscriber rules are
 * pure functions of event_type + metadata; Kai may layer urgency scoring,
 * suggested assignees, and clustering on top without changing the canon.
 */

export const ACTION_ITEM_SOURCE_ENTITY_TYPES = [
  'SUBMITTAL',
  'RFI',
  'VERBAL_AGREEMENT',
  'MEETING',
  'PAY_APP',
  'TM_TICKET',
  'CHANGE_ORDER',
  'PUNCH_LIST_ITEM',
  'EXTERNAL_WAIVER',
  'GC_REQUIRED_DOC',
  'WARRANTY_CLAIM',
  'MANUAL',
] as const;

export type ActionItemSourceEntityType = typeof ACTION_ITEM_SOURCE_ENTITY_TYPES[number];

export const ACTION_ITEM_PRIORITIES = [
  'URGENT',
  'HIGH',
  'MEDIUM',
  'LOW',
] as const;

export type ActionItemPriority = typeof ACTION_ITEM_PRIORITIES[number];

export const ACTION_ITEM_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'DEFERRED',
  'CANCELLED',
  'AUTO_CLOSED',
] as const;

export type ActionItemStatus = typeof ACTION_ITEM_STATUSES[number];

// Canon action_required vocabulary.  Stored as text on the row (not an enum)
// so future trunks can extend without a migration; this list documents the
// values the subscriber rules emit.
export const ACTION_ITEM_ACTION_REQUIRED = [
  'REVIEW',
  'RESPOND',
  'APPROVE',
  'SUBMIT',
  'FOLLOW_UP',
  'CLOSE_OUT',
  'CONFIRM',
  'TRIAGE',
] as const;

export type ActionItemActionRequired = typeof ACTION_ITEM_ACTION_REQUIRED[number];

export const TITLE_MAX = 300;

// Statuses that count as "still actionable" — used by My Open Actions and by
// the auto-close pass when a source entity resolves.
export const OPEN_ACTIONABLE_STATUSES: ActionItemStatus[] = ['OPEN', 'IN_PROGRESS'];

export function isActionItemSourceEntityType(value: unknown): value is ActionItemSourceEntityType {
  return typeof value === 'string'
    && (ACTION_ITEM_SOURCE_ENTITY_TYPES as readonly string[]).includes(value);
}

export function isActionItemPriority(value: unknown): value is ActionItemPriority {
  return typeof value === 'string'
    && (ACTION_ITEM_PRIORITIES as readonly string[]).includes(value);
}

export function isActionItemStatus(value: unknown): value is ActionItemStatus {
  return typeof value === 'string'
    && (ACTION_ITEM_STATUSES as readonly string[]).includes(value);
}
