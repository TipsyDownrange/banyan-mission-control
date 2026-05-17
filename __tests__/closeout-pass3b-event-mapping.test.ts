import {
  ACTIVITY_SPINE_EVENT_TYPES,
  ACTIVITY_SPINE_EVENT_TYPE_COUNT,
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES,
  isActivitySpineEventType,
  isPatternBActivitySpineEventType,
} from '@/lib/activity-spine/event-contract';

// Per BAN-304 D5 + D6: every Closeout-emitted event maps to canonical 34.
// Spec §34 / §5 references PROJECT_LIFECYCLE_STATE_CHANGED — that is spec drift
// (filed as BAN-305); canonical name is PROJECT_STATE_CHANGED Pattern B.
const CLOSEOUT_EVENTS_PATTERN_A: ReadonlyArray<string> = [
  'PUNCH_LIST_CLEARED',
  'DELIVERABLE_PRODUCED',
  'NOTICE_OF_COMPLETION_FILED',
  'JOB_COST_RECONCILED',
  'GOLD_DATASET_ENTRY_WRITTEN',
];

const CLOSEOUT_EVENTS_PATTERN_B: ReadonlyArray<string> = [
  'PROJECT_STATE_CHANGED',
  'PUNCH_LIST_ITEM_STATE_CHANGED',
  'WARRANTY_STATE_CHANGED',
];

describe('BAN-304 Pass 3b — Activity Spine event mapping (D5 + D6)', () => {
  it('canonical 34-value contract is intact (BAN-293 protected surface)', () => {
    expect(ACTIVITY_SPINE_EVENT_TYPE_COUNT).toBe(34);
  });

  it.each(CLOSEOUT_EVENTS_PATTERN_A)('Closeout Pattern A event %s is in the canonical 34', (event) => {
    expect(isActivitySpineEventType(event)).toBe(true);
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain(event);
  });

  it.each(CLOSEOUT_EVENTS_PATTERN_B)('Closeout Pattern B event %s is in the canonical 34', (event) => {
    expect(isActivitySpineEventType(event)).toBe(true);
    expect(isPatternBActivitySpineEventType(event)).toBe(true);
    expect(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES).toContain(event);
  });

  it('PROJECT_LIFECYCLE_STATE_CHANGED (spec drift name) is NOT canonical (per D5)', () => {
    expect(ACTIVITY_SPINE_EVENT_TYPES as readonly string[]).not.toContain('PROJECT_LIFECYCLE_STATE_CHANGED');
    expect(isActivitySpineEventType('PROJECT_LIFECYCLE_STATE_CHANGED')).toBe(false);
  });

  it('exactly 8 Closeout-emitted events all map to canonical 34 (D6 inventory)', () => {
    const all = [...CLOSEOUT_EVENTS_PATTERN_A, ...CLOSEOUT_EVENTS_PATTERN_B];
    expect(all).toHaveLength(8);
    for (const e of all) {
      expect(isActivitySpineEventType(e)).toBe(true);
    }
  });
});
