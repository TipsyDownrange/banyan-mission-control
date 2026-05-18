import {
  ACTIVITY_SPINE_EVENT_TYPE_COUNT,
  ACTIVITY_SPINE_EXISTING_EVENT_TYPE_COUNT,
  ACTIVITY_SPINE_LEGACY_EVENT_TYPE_COUNT,
  ACTIVITY_SPINE_NEW_EVENT_TYPE_COUNT,
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES,
  isActivitySpineEventType,
  validateActivitySpinePayload,
} from '@/lib/activity-spine/event-contract';

describe('BAN-293 Activity Spine event contract', () => {
  it('contains 11 existing + 1 legacy transitional + 38 ratified new event types', () => {
    // BAN-337 v2b and BAN-341 combine to Pattern A 16
    // (PAY_APP_NOTARIZATION_SKIPPED, PAY_APP_SUBMITTED,
    // CASH_RECEIPT_RECORDED, RFI_GENERATED_CO) and Pattern B 12
    // (SUBMITTAL_STATE_CHANGED, RFI_STATE_CHANGED).
    // BAN-342 adds 4 Pattern A verbal agreement events.
    // BAN-338 v2c adds 4 Pattern A lien waiver / joint check / GC docs events.
    // BAN-343 adds 2 Pattern A meeting events (MEETING_LOGGED,
    // MEETING_SUMMARY_UPDATED).
    expect(ACTIVITY_SPINE_EXISTING_EVENT_TYPE_COUNT).toBe(11);
    expect(ACTIVITY_SPINE_LEGACY_EVENT_TYPE_COUNT).toBe(1);
    expect(ACTIVITY_SPINE_NEW_EVENT_TYPE_COUNT).toBe(38);
    expect(ACTIVITY_SPINE_EVENT_TYPE_COUNT).toBe(50);
  });

  it('retains wo_completion as a legacy transitional event outside Pattern A/B', () => {
    expect(isActivitySpineEventType('wo_completion')).toBe(true);
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).not.toContain('wo_completion');
    expect(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES).not.toContain('wo_completion');
    expect(validateActivitySpinePayload('wo_completion', {})).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('keeps the corrected Pattern A / Pattern B split', () => {
    // BAN-337 v2b plus BAN-341/BAN-342/BAN-338/BAN-343 grow Pattern A 12 → 26.
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toHaveLength(26);
    // BAN-340 plus BAN-341 grow Pattern B 10 → 12.
    expect(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES).toHaveLength(12);
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('SOV_MODIFIED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('HANDOFF_PROCESSED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('PAY_APP_NOTARIZATION_SKIPPED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('PAY_APP_SUBMITTED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('CASH_RECEIPT_RECORDED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('RFI_GENERATED_CO');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('VERBAL_AGREEMENT_LOGGED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('VERBAL_AGREEMENT_FOLLOWUP_SENT');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('VERBAL_AGREEMENT_FORMALIZED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('VERBAL_AGREEMENT_RESOLVED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('LIEN_WAIVER_GENERATED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('JOINT_CHECK_AGREEMENT_STATE_CHANGED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('EXTERNAL_LIEN_WAIVER_STATE_CHANGED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('GC_REQUIRED_DOCS_CHECKLIST_UPDATED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('MEETING_LOGGED');
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('MEETING_SUMMARY_UPDATED');
    expect(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES).toContain('PROJECT_STATE_CHANGED');
    expect(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES).toContain('SUBMITTAL_STATE_CHANGED');
    expect(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES).toContain('RFI_STATE_CHANGED');
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
