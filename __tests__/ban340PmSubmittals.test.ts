/**
 * BAN-340 PM-V1.0-A — Unit tests for the Submittal Log v1.0 trunk.
 *
 * Covers:
 *  - CSI coordinate validation
 *  - Submittal number assembly
 *  - State machine validation
 *  - Ball-in-court derivation
 *  - Outstanding submittals KPI (§5.4 logic)
 *  - Activity Spine event-type registration
 *  - Schema + migration sanity
 *
 * The route-layer integration tests live in the existing Pattern B test
 * harness style; this file targets the pure-library logic + contract shape.
 */

import fs from 'fs';
import path from 'path';

import {
  validateCsiCoordinate,
  assembleSubmittalNumber,
  deriveCsiDivisionFromSpec,
  CSI_SPEC_SECTION_RE,
  CSI_SUBSECTION_RE,
  CSI_SUB_SUBSECTION_RE,
} from '@/lib/pm/submittals/csi';
import {
  SUBMITTAL_STATES,
  SUBMITTAL_ALLOWED_TRANSITIONS,
  validateSubmittalTransition,
  deriveBallInCourt,
  isOutstandingSubmittal,
  isSubmittalState,
} from '@/lib/pm/submittals/state-machine';
import {
  ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES,
  isActivitySpineEventType,
  validateActivitySpinePayload,
} from '@/lib/activity-spine/event-contract';

describe('BAN-340 CSI coordinate validation', () => {
  it('accepts 5-digit MF95 spec sections', () => {
    expect(CSI_SPEC_SECTION_RE.test('08410')).toBe(true);
    expect(validateCsiCoordinate({
      csi_spec_section: '08410',
      csi_subsection: '1.3',
      csi_sub_subsection: 'A',
    })).toEqual([]);
  });

  it('accepts 6-digit MF18 spec sections', () => {
    expect(CSI_SPEC_SECTION_RE.test('084113')).toBe(true);
    expect(validateCsiCoordinate({
      csi_spec_section: '084113',
      csi_subsection: '2.10',
      csi_sub_subsection: '5',
    })).toEqual([]);
  });

  it('rejects non-numeric or wrong-length spec sections', () => {
    expect(CSI_SPEC_SECTION_RE.test('8410')).toBe(false);
    expect(CSI_SPEC_SECTION_RE.test('084113A')).toBe(false);
    expect(CSI_SPEC_SECTION_RE.test('abcde')).toBe(false);
    const errs = validateCsiCoordinate({
      csi_spec_section: '8410',
      csi_subsection: '1.3',
      csi_sub_subsection: 'A',
    });
    expect(errs).toHaveLength(1);
    expect(errs[0].field).toBe('csi_spec_section');
  });

  it('enforces N.N for subsection', () => {
    expect(CSI_SUBSECTION_RE.test('1.3')).toBe(true);
    expect(CSI_SUBSECTION_RE.test('10.25')).toBe(true);
    expect(CSI_SUBSECTION_RE.test('1')).toBe(false);
    expect(CSI_SUBSECTION_RE.test('1.')).toBe(false);
    expect(CSI_SUBSECTION_RE.test('1.A')).toBe(false);
  });

  it('enforces single A-Z or 1-9 for sub-subsection', () => {
    expect(CSI_SUB_SUBSECTION_RE.test('A')).toBe(true);
    expect(CSI_SUB_SUBSECTION_RE.test('Z')).toBe(true);
    expect(CSI_SUB_SUBSECTION_RE.test('5')).toBe(true);
    expect(CSI_SUB_SUBSECTION_RE.test('0')).toBe(false);
    expect(CSI_SUB_SUBSECTION_RE.test('AA')).toBe(false);
    expect(CSI_SUB_SUBSECTION_RE.test('a')).toBe(false);
  });

  it('accumulates multiple validation errors', () => {
    const errs = validateCsiCoordinate({
      csi_spec_section: 'bad',
      csi_subsection: 'bad',
      csi_sub_subsection: 'bad',
    });
    expect(errs).toHaveLength(3);
  });

  it('derives CSI division from spec section', () => {
    expect(deriveCsiDivisionFromSpec('08410')).toBe('08');
    expect(deriveCsiDivisionFromSpec('084113')).toBe('08');
    expect(deriveCsiDivisionFromSpec('26')).toBe(null);
  });
});

describe('BAN-340 submittal number assembly', () => {
  it('assembles the canonical PRJ-YY-NNNN-SUB-{spec}-{sub}-{subsub} format', () => {
    expect(assembleSubmittalNumber('PRJ-26-0001', {
      csi_spec_section: '08410',
      csi_subsection: '1.3',
      csi_sub_subsection: 'A',
    })).toBe('PRJ-26-0001-SUB-08410-1.3-A');
  });

  it('uppercases lowercase sub-subsection letters', () => {
    expect(assembleSubmittalNumber('PRJ-26-0042', {
      csi_spec_section: '084113',
      csi_subsection: '2.10',
      csi_sub_subsection: 'a',
    })).toBe('PRJ-26-0042-SUB-084113-2.10-A');
  });

  it('throws when projectKid is missing', () => {
    expect(() => assembleSubmittalNumber('', {
      csi_spec_section: '08410',
      csi_subsection: '1.3',
      csi_sub_subsection: 'A',
    })).toThrow();
  });
});

describe('BAN-340 submittal state machine', () => {
  it('exposes the full 9-state set', () => {
    expect(SUBMITTAL_STATES).toHaveLength(9);
    expect(SUBMITTAL_STATES).toContain('REQUIRED');
    expect(SUBMITTAL_STATES).toContain('CLOSED');
  });

  it('isSubmittalState narrows to known values', () => {
    expect(isSubmittalState('REQUIRED')).toBe(true);
    expect(isSubmittalState('UNKNOWN_STATE')).toBe(false);
    expect(isSubmittalState(null)).toBe(false);
  });

  it('drives the canonical happy path REQUIRED→IN_PROGRESS→SUBMITTED→UNDER_REVIEW→APPROVED→CLOSED', () => {
    const path = ['REQUIRED','IN_PROGRESS','SUBMITTED','UNDER_REVIEW','APPROVED','CLOSED'] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(validateSubmittalTransition(path[i], path[i + 1]).ok).toBe(true);
    }
  });

  it('allows REVISE_RESUBMIT → IN_PROGRESS loop', () => {
    expect(validateSubmittalTransition('SUBMITTED', 'REVISE_RESUBMIT').ok).toBe(true);
    expect(validateSubmittalTransition('REVISE_RESUBMIT', 'IN_PROGRESS').ok).toBe(true);
  });

  it('allows SUBMITTED → APPROVED short-circuit (skipping UNDER_REVIEW)', () => {
    expect(validateSubmittalTransition('SUBMITTED', 'APPROVED').ok).toBe(true);
    expect(validateSubmittalTransition('SUBMITTED', 'APPROVED_AS_NOTED').ok).toBe(true);
    expect(validateSubmittalTransition('SUBMITTED', 'REJECTED').ok).toBe(true);
  });

  it('rejects illegal transitions', () => {
    const bad = validateSubmittalTransition('REQUIRED', 'APPROVED');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('TRANSITION_NOT_ALLOWED');
  });

  it('rejects unknown from_state / to_state', () => {
    const a = validateSubmittalTransition('FOO', 'BAR');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('UNKNOWN_FROM_STATE');

    const b = validateSubmittalTransition('REQUIRED', 'NOPE');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('UNKNOWN_TO_STATE');
  });

  it('rejects no-op transitions', () => {
    const r = validateSubmittalTransition('REQUIRED', 'REQUIRED');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NO_OP');
  });

  it('terminal CLOSED has no outbound transitions', () => {
    expect(SUBMITTAL_ALLOWED_TRANSITIONS.CLOSED).toEqual([]);
  });
});

describe('BAN-340 ball-in-court derivation', () => {
  it('returns SUBCONTRACTOR for sub-side states', () => {
    expect(deriveBallInCourt('REQUIRED', null)).toBe('SUBCONTRACTOR');
    expect(deriveBallInCourt('IN_PROGRESS', null)).toBe('SUBCONTRACTOR');
    expect(deriveBallInCourt('REVISE_RESUBMIT', null)).toBe('SUBCONTRACTOR');
  });

  it('returns the submitted_to party for SUBMITTED / UNDER_REVIEW', () => {
    expect(deriveBallInCourt('SUBMITTED', 'GC')).toBe('GC');
    expect(deriveBallInCourt('UNDER_REVIEW', 'ARCHITECT')).toBe('ARCHITECT');
    expect(deriveBallInCourt('SUBMITTED', 'OWNER')).toBe('OWNER');
  });

  it('falls back to GC when SUBMITTED without submitted_to', () => {
    expect(deriveBallInCourt('SUBMITTED', null)).toBe('GC');
  });

  it('returns SUBCONTRACTOR after review outcomes (APPROVED / APPROVED_AS_NOTED / REJECTED)', () => {
    expect(deriveBallInCourt('APPROVED', 'ARCHITECT')).toBe('SUBCONTRACTOR');
    expect(deriveBallInCourt('APPROVED_AS_NOTED', 'GC')).toBe('SUBCONTRACTOR');
    expect(deriveBallInCourt('REJECTED', 'OWNER')).toBe('SUBCONTRACTOR');
  });

  it('returns null on CLOSED', () => {
    expect(deriveBallInCourt('CLOSED', 'GC')).toBeNull();
  });
});

describe('BAN-340 outstanding submittals KPI (§5.4)', () => {
  const now = new Date('2026-05-18T00:00:00Z');

  it('counts ACTION submittals as outstanding until APPROVED/APPROVED_AS_NOTED/CLOSED', () => {
    expect(isOutstandingSubmittal(
      { submittal_type: 'ACTION', status: 'IN_PROGRESS' },
      { engagementInCloseout: false, now },
    )).toBe(true);
    expect(isOutstandingSubmittal(
      { submittal_type: 'ACTION', status: 'APPROVED' },
      { engagementInCloseout: false, now },
    )).toBe(false);
    expect(isOutstandingSubmittal(
      { submittal_type: 'ACTION', status: 'APPROVED_AS_NOTED' },
      { engagementInCloseout: false, now },
    )).toBe(false);
    expect(isOutstandingSubmittal(
      { submittal_type: 'ACTION', status: 'CLOSED' },
      { engagementInCloseout: false, now },
    )).toBe(false);
    expect(isOutstandingSubmittal(
      { submittal_type: 'ACTION', status: 'REJECTED' },
      { engagementInCloseout: false, now },
    )).toBe(true);
  });

  it('counts PHYSICAL submittals only when past due AND not CLOSED', () => {
    expect(isOutstandingSubmittal(
      { submittal_type: 'PHYSICAL', status: 'IN_PROGRESS', required_by_date: '2026-04-01' },
      { engagementInCloseout: false, now },
    )).toBe(true);
    // Future due date — not outstanding even if not closed.
    expect(isOutstandingSubmittal(
      { submittal_type: 'PHYSICAL', status: 'IN_PROGRESS', required_by_date: '2026-12-01' },
      { engagementInCloseout: false, now },
    )).toBe(false);
    // CLOSED never counts.
    expect(isOutstandingSubmittal(
      { submittal_type: 'PHYSICAL', status: 'CLOSED', required_by_date: '2026-04-01' },
      { engagementInCloseout: false, now },
    )).toBe(false);
    // Missing due date — not outstanding.
    expect(isOutstandingSubmittal(
      { submittal_type: 'PHYSICAL', status: 'IN_PROGRESS', required_by_date: null },
      { engagementInCloseout: false, now },
    )).toBe(false);
  });

  it('counts CLOSEOUT submittals only when engagement is in closeout', () => {
    expect(isOutstandingSubmittal(
      { submittal_type: 'CLOSEOUT', status: 'REQUIRED' },
      { engagementInCloseout: true, now },
    )).toBe(true);
    expect(isOutstandingSubmittal(
      { submittal_type: 'CLOSEOUT', status: 'REQUIRED' },
      { engagementInCloseout: false, now },
    )).toBe(false);
    expect(isOutstandingSubmittal(
      { submittal_type: 'CLOSEOUT', status: 'CLOSED' },
      { engagementInCloseout: true, now },
    )).toBe(false);
  });

  it('mixed sample matches spec §5.4 illustration: 1 action open, 1 physical overdue, 1 closeout open', () => {
    const sample = [
      { submittal_type: 'ACTION' as const, status: 'IN_PROGRESS' as const },
      { submittal_type: 'PHYSICAL' as const, status: 'IN_PROGRESS' as const, required_by_date: '2026-04-01' },
      { submittal_type: 'CLOSEOUT' as const, status: 'REQUIRED' as const },
    ];
    const counted = sample.filter((s) => isOutstandingSubmittal(s, { engagementInCloseout: true, now })).length;
    expect(counted).toBe(3);
  });
});

describe('BAN-340 Activity Spine registration', () => {
  it('registers SUBMITTAL_STATE_CHANGED in Pattern B', () => {
    expect(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES).toContain('SUBMITTAL_STATE_CHANGED');
    expect(isActivitySpineEventType('SUBMITTAL_STATE_CHANGED')).toBe(true);
  });

  it('enforces from_state / to_state for SUBMITTAL_STATE_CHANGED payloads', () => {
    expect(validateActivitySpinePayload('SUBMITTAL_STATE_CHANGED', {}).ok).toBe(false);
    expect(validateActivitySpinePayload('SUBMITTAL_STATE_CHANGED', { from_state: 'REQUIRED' }).ok).toBe(false);
    expect(validateActivitySpinePayload('SUBMITTAL_STATE_CHANGED', { from_state: 'REQUIRED', to_state: 'IN_PROGRESS' }).ok).toBe(true);
  });
});

describe('BAN-340 migration shape', () => {
  const migrationPath = path.join(process.cwd(), 'db/migrations/0018_ban340_pm_submittals.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('creates the submittals table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.submittals');
  });

  it('declares the five new enums', () => {
    expect(sql).toContain("CREATE TYPE public.submittal_type");
    expect(sql).toContain("CREATE TYPE public.submittal_status");
    expect(sql).toContain("CREATE TYPE public.submittal_submitted_to");
    expect(sql).toContain("CREATE TYPE public.submittal_ball_in_court");
    expect(sql).toContain("CREATE TYPE public.submittal_source");
  });

  it('enforces the (engagement_id, spec, subsection, sub_subsection) uniqueness', () => {
    expect(sql).toContain('submittals_engagement_csi_uidx');
    expect(sql).toContain('engagement_id, csi_spec_section, csi_subsection, csi_sub_subsection');
  });

  it('enforces CSI regex CHECK constraints at the DB level', () => {
    expect(sql).toContain('submittals_csi_spec_section_format');
    expect(sql).toContain('submittals_csi_subsection_format');
    expect(sql).toContain('submittals_csi_sub_subsection_format');
  });

  it('extends the BAN-293 event_type CHECK with SUBMITTAL_STATE_CHANGED', () => {
    expect(sql).toContain('field_events_event_type_ban293_check');
    expect(sql).toContain(`'SUBMITTAL_STATE_CHANGED'`);
  });
});
