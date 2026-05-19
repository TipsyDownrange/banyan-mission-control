/**
 * BAN-344a PM-V1.0-E (CORE) — Action Item Tracker canonical enumerations.
 *
 * PM Trunk v1.0 §9.  CORE-ONLY scope: manual creation + state transitions.
 * The subscriber pattern that folds source-trunk events into action_items
 * rows lands in 344b; AUTO_CLOSED status is intentionally absent from this
 * package and will be added then.
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

// 344a: AUTO_CLOSED is intentionally NOT here.  344b adds it.
export const ACTION_ITEM_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'DEFERRED',
  'CANCELLED',
] as const;

export type ActionItemStatus = typeof ACTION_ITEM_STATUSES[number];

// Canon action_required vocabulary.  Stored as text on the row (not an enum)
// so 344b's subscriber can extend without a migration.
export const ACTION_ITEM_ACTION_REQUIRED = [
  'REVIEW',
  'RESPOND',
  'APPROVE',
  'SUBMIT',
  'FOLLOW_UP',
  'CLOSE_OUT',
  'OTHER',
] as const;

export type ActionItemActionRequired = typeof ACTION_ITEM_ACTION_REQUIRED[number];

export const TITLE_MAX = 300;

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
