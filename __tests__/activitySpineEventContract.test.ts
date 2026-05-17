import {
  ACTIVITY_SPINE_EVENT_TYPE_COUNT,
  ACTIVITY_SPINE_EXISTING_EVENT_TYPE_COUNT,
  ACTIVITY_SPINE_NEW_EVENT_TYPE_COUNT,
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES,
  isActivitySpineEventType,
  validateActivitySpinePayload,
} from '@/lib/activity-spine/event-contract';

describe('BAN-293 Activity Spine event contract', () => {
  it('contains 11 existing + 22 ratified new event types', () => {
    expect(ACTIVITY_SPINE_EXISTING_EVENT_TYPE_COUNT).toBe(11);
    expect(ACTIVITY_SPINE_NEW_EVENT_TYPE_COUNT).toBe(22);
    expect(ACTIVITY_SPINE_EVENT_TYPE_COUNT).toBe(33);
  });

  it('keeps the corrected Pattern A / Pattern B split', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toHaveLength(12);
    expect(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES).toHaveLength(10);
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('SOV_MODIFIED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('HANDOFF_PROCESSED');
    expect(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES).toContain('PROJECT_STATE_CHANGED');
    expect(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES).not.toContain('PROJECT_LIFECYCLE_STATE_CHANGED');
  });

  it('recognizes ratified event types and rejects unknown values', () => {
    expect(isActivitySpineEventType('PAY_APP_STATE_CHANGED')).toBe(true);
    expect(isActivitySpineEventType('PROJECT_LIFECYCLE_STATE_CHANGED')).toBe(false);
    expect(isActivitySpineEventType('PAY_APP_APPROVED')).toBe(false);
  });

  it('requires from_state and to_state for Pattern B payloads', () => {
    expect(validateActivitySpinePayload('PAY_APP_STATE_CHANGED', { from_state: 'CREATED' })).toEqual({
      ok: false,
      errors: ['PAY_APP_STATE_CHANGED payload requires to_state'],
    });
    expect(validateActivitySpinePayload('PAY_APP_STATE_CHANGED', { from_state: 'CREATED', to_state: 'SUBMITTED' })).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('validates GOLD_DATASET_ENTRY_WRITTEN write target semantics', () => {
    expect(validateActivitySpinePayload('GOLD_DATASET_ENTRY_WRITTEN', { write_target: 'TEST_BLOCKED' })).toEqual({
      ok: true,
      errors: [],
    });
    expect(validateActivitySpinePayload('GOLD_DATASET_ENTRY_WRITTEN', { write_target: 'SANDBOX' })).toEqual({
      ok: false,
      errors: ['GOLD_DATASET_ENTRY_WRITTEN payload requires write_target PRODUCTION or TEST_BLOCKED'],
    });
  });
});
