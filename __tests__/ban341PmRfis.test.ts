/**
 * BAN-341 PM-V1.0-B — Unit tests for the RFI Log v1.0 trunk.
 *
 * Covers:
 *  - RFI per-project number assembly + sequence parsing
 *  - State machine validation (DRAFT/SUBMITTED/UNDER_REVIEW/ANSWERED/RESOLVED/CLOSED/VOID)
 *  - Ball-in-court derivation per §6.4
 *  - Overdue tracking per §6.5
 *  - Activity Spine event-type registration (RFI_STATE_CHANGED + RFI_GENERATED_CO)
 *  - Schema + migration sanity
 */

import fs from 'fs';
import path from 'path';

import {
  assembleRfiNumber,
  parseRfiSequence,
  RFI_NUMBER_RE,
} from '@/lib/pm/rfis/numbering';
import {
  RFI_STATES,
  RFI_ALLOWED_TRANSITIONS,
  validateRfiTransition,
  deriveBallInCourt,
  isOverdueRfi,
  isRfiState,
} from '@/lib/pm/rfis/state-machine';
import {
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES,
  isActivitySpineEventType,
  validateActivitySpinePayload,
} from '@/lib/activity-spine/event-contract';

describe('BAN-341 RFI number assembly', () => {
  it('assembles the canonical PRJ-YY-NNNN-RFI-NNN format with 3-digit padding', () => {
    expect(assembleRfiNumber('PRJ-26-0001', 1)).toBe('PRJ-26-0001-RFI-001');
    expect(assembleRfiNumber('PRJ-26-0001', 12)).toBe('PRJ-26-0001-RFI-012');
    expect(assembleRfiNumber('PRJ-26-0042', 245)).toBe('PRJ-26-0042-RFI-245');
  });

  it('throws when projectKid is missing', () => {
    expect(() => assembleRfiNumber('', 1)).toThrow();
  });

  it('throws on non-positive sequence', () => {
    expect(() => assembleRfiNumber('PRJ-26-0001', 0)).toThrow();
    expect(() => assembleRfiNumber('PRJ-26-0001', -1)).toThrow();
  });

  it('throws when sequence exceeds 999 (3-digit limit)', () => {
    expect(() => assembleRfiNumber('PRJ-26-0001', 1000)).toThrow();
  });

  it('parses the sequence back out of a canonical number', () => {
    expect(parseRfiSequence('PRJ-26-0001-RFI-001')).toBe(1);
    expect(parseRfiSequence('PRJ-26-0042-RFI-245')).toBe(245);
  });

  it('returns null for non-canonical input', () => {
    expect(parseRfiSequence('PRJ-26-0001-SUB-08410-1.3-A')).toBeNull();
    expect(parseRfiSequence('garbage')).toBeNull();
  });

  it('regex requires exactly 3 digits', () => {
    expect(RFI_NUMBER_RE.test('PRJ-26-0001-RFI-001')).toBe(true);
    expect(RFI_NUMBER_RE.test('PRJ-26-0001-RFI-1')).toBe(false);
    expect(RFI_NUMBER_RE.test('PRJ-26-0001-RFI-1000')).toBe(false);
  });
});

describe('BAN-341 RFI state machine', () => {
  it('exposes the full 7-state set', () => {
    expect(RFI_STATES).toHaveLength(7);
    expect(RFI_STATES).toContain('DRAFT');
    expect(RFI_STATES).toContain('VOID');
  });

  it('isRfiState narrows to known values', () => {
    expect(isRfiState('DRAFT')).toBe(true);
    expect(isRfiState('SUBMITTED')).toBe(true);
    expect(isRfiState('UNKNOWN')).toBe(false);
    expect(isRfiState(null)).toBe(false);
  });

  it('drives the canonical happy path DRAFT→SUBMITTED→UNDER_REVIEW→ANSWERED→RESOLVED→CLOSED', () => {
    const happy = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ANSWERED', 'RESOLVED', 'CLOSED'] as const;
    for (let i = 0; i < happy.length - 1; i++) {
      expect(validateRfiTransition(happy[i], happy[i + 1]).ok).toBe(true);
    }
  });

  it('allows ANSWERED → SUBMITTED follow-up loop (ball returns to reviewer)', () => {
    expect(validateRfiTransition('ANSWERED', 'SUBMITTED').ok).toBe(true);
  });

  it('allows SUBMITTED → ANSWERED short-circuit (skipping UNDER_REVIEW)', () => {
    expect(validateRfiTransition('SUBMITTED', 'ANSWERED').ok).toBe(true);
  });

  it('allows any non-terminal state → VOID', () => {
    expect(validateRfiTransition('DRAFT', 'VOID').ok).toBe(true);
    expect(validateRfiTransition('SUBMITTED', 'VOID').ok).toBe(true);
    expect(validateRfiTransition('UNDER_REVIEW', 'VOID').ok).toBe(true);
    expect(validateRfiTransition('ANSWERED', 'VOID').ok).toBe(true);
    expect(validateRfiTransition('RESOLVED', 'VOID').ok).toBe(true);
  });

  it('rejects illegal transitions', () => {
    const bad = validateRfiTransition('DRAFT', 'RESOLVED');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('rejects unknown from_state / to_state', () => {
    const a = validateRfiTransition('FOO', 'BAR');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('UNKNOWN_FROM_STATE');

    const b = validateRfiTransition('DRAFT', 'NOPE');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('UNKNOWN_TO_STATE');
  });

  it('rejects no-op transitions', () => {
    const r = validateRfiTransition('DRAFT', 'DRAFT');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NO_OP');
  });

  it('terminal CLOSED + VOID have no outbound transitions', () => {
    expect(RFI_ALLOWED_TRANSITIONS.CLOSED).toEqual([]);
    expect(RFI_ALLOWED_TRANSITIONS.VOID).toEqual([]);
  });
});

describe('BAN-341 ball-in-court derivation (§6.4)', () => {
  it('DRAFT → SUBCONTRACTOR', () => {
    expect(deriveBallInCourt('DRAFT', null)).toBe('SUBCONTRACTOR');
  });

  it('SUBMITTED / UNDER_REVIEW → submitted_to party', () => {
    expect(deriveBallInCourt('SUBMITTED', 'GC')).toBe('GC');
    expect(deriveBallInCourt('UNDER_REVIEW', 'ARCHITECT')).toBe('ARCHITECT');
    expect(deriveBallInCourt('SUBMITTED', 'ENGINEER')).toBe('ENGINEER');
    expect(deriveBallInCourt('SUBMITTED', 'OWNER')).toBe('OWNER');
  });

  it('falls back to GC when SUBMITTED without submitted_to', () => {
    expect(deriveBallInCourt('SUBMITTED', null)).toBe('GC');
  });

  it('ANSWERED → SUBCONTRACTOR (ball returns for PM follow-up / resolve)', () => {
    expect(deriveBallInCourt('ANSWERED', 'GC')).toBe('SUBCONTRACTOR');
    expect(deriveBallInCourt('ANSWERED', 'ARCHITECT')).toBe('SUBCONTRACTOR');
  });

  it('RESOLVED / CLOSED / VOID → null', () => {
    expect(deriveBallInCourt('RESOLVED', 'GC')).toBeNull();
    expect(deriveBallInCourt('CLOSED', 'GC')).toBeNull();
    expect(deriveBallInCourt('VOID', 'GC')).toBeNull();
  });
});

describe('BAN-341 overdue tracking (§6.5)', () => {
  const now = new Date('2026-05-18T00:00:00Z');

  it('counts SUBMITTED RFIs past required_response_by_date', () => {
    expect(isOverdueRfi(
      { status: 'SUBMITTED', required_response_by_date: '2026-05-01' },
      { now },
    )).toBe(true);
  });

  it('counts UNDER_REVIEW RFIs past required_response_by_date', () => {
    expect(isOverdueRfi(
      { status: 'UNDER_REVIEW', required_response_by_date: '2026-05-01' },
      { now },
    )).toBe(true);
  });

  it('does not count future-due RFIs', () => {
    expect(isOverdueRfi(
      { status: 'SUBMITTED', required_response_by_date: '2026-12-01' },
      { now },
    )).toBe(false);
  });

  it('does not count states outside SUBMITTED / UNDER_REVIEW', () => {
    expect(isOverdueRfi(
      { status: 'DRAFT', required_response_by_date: '2026-05-01' },
      { now },
    )).toBe(false);
    expect(isOverdueRfi(
      { status: 'ANSWERED', required_response_by_date: '2026-05-01' },
      { now },
    )).toBe(false);
    expect(isOverdueRfi(
      { status: 'RESOLVED', required_response_by_date: '2026-05-01' },
      { now },
    )).toBe(false);
    expect(isOverdueRfi(
      { status: 'CLOSED', required_response_by_date: '2026-05-01' },
      { now },
    )).toBe(false);
    expect(isOverdueRfi(
      { status: 'VOID', required_response_by_date: '2026-05-01' },
      { now },
    )).toBe(false);
  });

  it('does not count RFIs with no required_response_by_date', () => {
    expect(isOverdueRfi(
      { status: 'SUBMITTED', required_response_by_date: null },
      { now },
    )).toBe(false);
  });
});

describe('BAN-341 Activity Spine registration', () => {
  it('registers RFI_STATE_CHANGED in Pattern B', () => {
    expect(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES).toContain('RFI_STATE_CHANGED');
    expect(isActivitySpineEventType('RFI_STATE_CHANGED')).toBe(true);
  });

  it('registers RFI_GENERATED_CO in Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('RFI_GENERATED_CO');
    expect(isActivitySpineEventType('RFI_GENERATED_CO')).toBe(true);
  });

  it('enforces from_state / to_state for RFI_STATE_CHANGED payloads', () => {
    expect(validateActivitySpinePayload('RFI_STATE_CHANGED', {}).ok).toBe(false);
    expect(validateActivitySpinePayload('RFI_STATE_CHANGED', { from_state: 'DRAFT' }).ok).toBe(false);
    expect(validateActivitySpinePayload('RFI_STATE_CHANGED', { from_state: 'DRAFT', to_state: 'SUBMITTED' }).ok).toBe(true);
  });

  it('does not enforce from_state / to_state for the Pattern A RFI_GENERATED_CO event', () => {
    expect(validateActivitySpinePayload('RFI_GENERATED_CO', { rfi_number: 'PRJ-26-0001-RFI-001' }).ok).toBe(true);
  });
});

describe('BAN-341 migration shape', () => {
  const migrationPath = path.join(process.cwd(), 'db/migrations/0020_ban341_pm_rfis.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('creates the rfis table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.rfis');
  });

  it('declares the four new enums', () => {
    expect(sql).toContain('CREATE TYPE public.rfi_reason');
    expect(sql).toContain('CREATE TYPE public.rfi_status');
    expect(sql).toContain('CREATE TYPE public.rfi_submitted_to');
    expect(sql).toContain('CREATE TYPE public.rfi_ball_in_court');
  });

  it('enforces a unique index on rfi_number', () => {
    expect(sql).toContain('rfis_number_uidx');
  });

  it('enforces RFI number format at the DB level (3-digit suffix)', () => {
    expect(sql).toContain('rfis_number_format');
    expect(sql).toContain("'-RFI-[0-9]{3}$'");
  });

  it('extends the BAN-293 event_type CHECK with RFI_STATE_CHANGED and RFI_GENERATED_CO', () => {
    expect(sql).toContain('field_events_event_type_ban293_check');
    expect(sql).toContain("'RFI_STATE_CHANGED'");
    expect(sql).toContain("'RFI_GENERATED_CO'");
  });
});
