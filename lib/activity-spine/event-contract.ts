export const EXISTING_ACTIVITY_SPINE_EVENT_TYPES = [
  'INSTALL_STEP',
  'FIELD_ISSUE',
  'DAILY_LOG',
  'FIELD_MEASUREMENT',
  'NOTE',
  'TM_CAPTURE',
  'PHOTO_ONLY',
  'PUNCH_LIST',
  'SITE_VISIT',
  'TESTING',
  'WARRANTY_CALLBACK',
] as const;

export const ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES = [
  'PAY_APP_NOTARIZED',
  'RETAINAGE_RELEASED',
  'PUNCH_LIST_CLEARED',
  'NOTICE_OF_COMPLETION_FILED',
  'JOB_COST_RECONCILED',
  'GOLD_DATASET_ENTRY_WRITTEN',
  'DELIVERABLE_PRODUCED',
  'TM_AUTHORIZATION_CONVERTED_TO_CO',
  'TEST_PROJECT_RESET',
  'BACK_CHARGE_APPLIED_CROSS_PROJECT',
  'SOV_MODIFIED',
  'HANDOFF_PROCESSED',
] as const;

export const ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES = [
  'SOV_STATE_CHANGED',
  'PAY_APP_STATE_CHANGED',
  'LIEN_WAIVER_STATE_CHANGED',
  'PROJECT_STATE_CHANGED',
  'PUNCH_LIST_ITEM_STATE_CHANGED',
  'WARRANTY_STATE_CHANGED',
  'TM_AUTHORIZATION_STATE_CHANGED',
  'TM_TICKET_STATE_CHANGED',
  'TEST_PROJECT_STATE_CHANGED',
  'BACK_CHARGE_STATE_CHANGED',
] as const;

export const ACTIVITY_SPINE_EVENT_TYPES = [
  ...EXISTING_ACTIVITY_SPINE_EVENT_TYPES,
  ...ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  ...ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES,
] as const;

export type ActivitySpineEventType = typeof ACTIVITY_SPINE_EVENT_TYPES[number];
export type ActivitySpinePatternAEventType = typeof ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES[number];
export type ActivitySpinePatternBEventType = typeof ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES[number];

export type ActivitySpinePayload = Record<string, unknown>;

export type ActivitySpinePayloadValidation = {
  ok: boolean;
  errors: string[];
};

const ACTIVITY_SPINE_EVENT_TYPE_SET = new Set<string>(ACTIVITY_SPINE_EVENT_TYPES);
const ACTIVITY_SPINE_PATTERN_B_SET = new Set<string>(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES);
const GOLD_DATASET_WRITE_TARGETS = new Set(['PRODUCTION', 'TEST_BLOCKED']);

export function isActivitySpineEventType(value: unknown): value is ActivitySpineEventType {
  return typeof value === 'string' && ACTIVITY_SPINE_EVENT_TYPE_SET.has(value);
}

export function isPatternBActivitySpineEventType(value: unknown): value is ActivitySpinePatternBEventType {
  return typeof value === 'string' && ACTIVITY_SPINE_PATTERN_B_SET.has(value);
}

function hasNonBlankString(payload: ActivitySpinePayload, key: string): boolean {
  return typeof payload[key] === 'string' && String(payload[key]).trim().length > 0;
}

export function validateActivitySpinePayload(
  eventType: unknown,
  payload: ActivitySpinePayload | null | undefined,
): ActivitySpinePayloadValidation {
  const errors: string[] = [];

  if (!isActivitySpineEventType(eventType)) {
    errors.push(`Unknown Activity Spine event_type: ${String(eventType)}`);
    return { ok: false, errors };
  }

  const safePayload = payload && typeof payload === 'object' ? payload : {};

  if (isPatternBActivitySpineEventType(eventType)) {
    if (!hasNonBlankString(safePayload, 'from_state')) {
      errors.push(`${eventType} payload requires from_state`);
    }
    if (!hasNonBlankString(safePayload, 'to_state')) {
      errors.push(`${eventType} payload requires to_state`);
    }
  }

  if (eventType === 'GOLD_DATASET_ENTRY_WRITTEN') {
    const writeTarget = String(safePayload.write_target || '').trim();
    if (!GOLD_DATASET_WRITE_TARGETS.has(writeTarget)) {
      errors.push('GOLD_DATASET_ENTRY_WRITTEN payload requires write_target PRODUCTION or TEST_BLOCKED');
    }
  }

  return { ok: errors.length === 0, errors };
}

export const ACTIVITY_SPINE_EVENT_TYPE_COUNT = ACTIVITY_SPINE_EVENT_TYPES.length;
export const ACTIVITY_SPINE_EXISTING_EVENT_TYPE_COUNT = EXISTING_ACTIVITY_SPINE_EVENT_TYPES.length;
export const ACTIVITY_SPINE_NEW_EVENT_TYPE_COUNT =
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES.length + ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES.length;
