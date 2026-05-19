/**
 * BAN-346 PM-V1.0-G — PM Handoff Receipt unit tests.
 *
 * Pure-library logic only: types, parsers, state machine, subscriber wire
 * planner, Activity Spine event registration, and migration shape.  Route
 * integration tests live in ban346PmHandoffReceiptsRoutes.test.ts.
 */

import fs from 'fs';
import path from 'path';

import {
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  isActivitySpineEventType,
  validateActivitySpinePayload,
} from '@/lib/activity-spine/event-contract';
import {
  PM_HANDOFF_STATES,
  PM_HANDOFF_TERMINAL_STATES,
  PM_HANDOFF_OPEN_STATES,
  CRITICAL_GAP_STATUSES,
  hasUnresolvedGaps,
  isCriticalGapStatus,
  isOpenState,
  isPmHandoffState,
  isTerminalState,
  unresolvedGapCount,
  type CriticalGap,
} from '@/lib/pm/handoff-receipts/types';
import {
  isPatchField,
  isUuid,
  optionalString,
  parseCriticalGaps,
  parseCriticalGapStatus,
  parsePmHandoffState,
  trimString,
} from '@/lib/pm/handoff-receipts/route-utils';
import {
  isAllowedTransition,
  TERMINAL_STATES,
} from '@/lib/pm/handoff-receipts/state-transitions';
import { planHandoffSubscriberAction } from '@/lib/pm/handoff-receipts/spine-subscriber-wire';

describe('BAN-346 handoff state enum', () => {
  it('defines the canonical 5-state lifecycle', () => {
    expect(PM_HANDOFF_STATES).toEqual([
      'pending_review',
      'reviewed_complete',
      'accepted',
      'rejected_with_gaps',
      'accepted_with_gaps',
    ]);
  });

  it('classifies the three terminal states', () => {
    expect(PM_HANDOFF_TERMINAL_STATES).toEqual([
      'accepted',
      'rejected_with_gaps',
      'accepted_with_gaps',
    ]);
    for (const s of PM_HANDOFF_TERMINAL_STATES) {
      expect(isTerminalState(s)).toBe(true);
      expect(isOpenState(s)).toBe(false);
    }
  });

  it('classifies pending_review + reviewed_complete as open', () => {
    expect(PM_HANDOFF_OPEN_STATES).toEqual(['pending_review', 'reviewed_complete']);
    for (const s of PM_HANDOFF_OPEN_STATES) {
      expect(isOpenState(s)).toBe(true);
      expect(isTerminalState(s)).toBe(false);
    }
  });

  it('rejects unknown values via the state guard', () => {
    expect(isPmHandoffState('pending_review')).toBe(true);
    expect(isPmHandoffState('accepted')).toBe(true);
    expect(isPmHandoffState('rejected')).toBe(false);
    expect(isPmHandoffState('ACCEPTED')).toBe(false);
    expect(isPmHandoffState(null)).toBe(false);
    expect(isPmHandoffState(undefined)).toBe(false);
    expect(isPmHandoffState(42)).toBe(false);
  });

  it('TERMINAL_STATES constant in state-transitions matches the type module', () => {
    expect([...TERMINAL_STATES].sort()).toEqual([...PM_HANDOFF_TERMINAL_STATES].sort());
  });
});

describe('BAN-346 critical gap enum', () => {
  it('defines the four statuses', () => {
    expect(CRITICAL_GAP_STATUSES).toEqual(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'WAIVED']);
  });

  it('isCriticalGapStatus rejects unknown values', () => {
    expect(isCriticalGapStatus('OPEN')).toBe(true);
    expect(isCriticalGapStatus('RESOLVED')).toBe(true);
    expect(isCriticalGapStatus('open')).toBe(false);
    expect(isCriticalGapStatus('DONE')).toBe(false);
    expect(isCriticalGapStatus(undefined)).toBe(false);
  });
});

describe('BAN-346 unresolved-gap accounting (Q6=A always-allow policy)', () => {
  it('counts OPEN + ACKNOWLEDGED as unresolved', () => {
    const gaps: CriticalGap[] = [
      { gap_id: 'g1', gap_type: 'SCOPE', description: 'x', status: 'OPEN' },
      { gap_id: 'g2', gap_type: 'SCOPE', description: 'y', status: 'ACKNOWLEDGED' },
      { gap_id: 'g3', gap_type: 'SCOPE', description: 'z', status: 'RESOLVED' },
      { gap_id: 'g4', gap_type: 'SCOPE', description: 'w', status: 'WAIVED' },
    ];
    expect(unresolvedGapCount(gaps)).toBe(2);
    expect(hasUnresolvedGaps(gaps)).toBe(true);
  });

  it('returns zero for empty or null inputs', () => {
    expect(unresolvedGapCount([])).toBe(0);
    expect(unresolvedGapCount(null)).toBe(0);
    expect(unresolvedGapCount(undefined)).toBe(0);
    expect(hasUnresolvedGaps([])).toBe(false);
  });

  it('returns zero when all gaps are resolved/waived', () => {
    const allDone: CriticalGap[] = [
      { gap_id: 'g1', gap_type: 'SCOPE', description: 'x', status: 'RESOLVED' },
      { gap_id: 'g2', gap_type: 'BUDGET', description: 'y', status: 'WAIVED' },
    ];
    expect(unresolvedGapCount(allDone)).toBe(0);
    expect(hasUnresolvedGaps(allDone)).toBe(false);
  });
});

describe('BAN-346 route-utils parsers', () => {
  it('trimString returns empty for non-strings', () => {
    expect(trimString('  hello ')).toBe('hello');
    expect(trimString(undefined)).toBe('');
    expect(trimString(null)).toBe('');
    expect(trimString(42)).toBe('');
  });

  it('optionalString collapses blanks to null', () => {
    expect(optionalString(' x ')).toBe('x');
    expect(optionalString('   ')).toBeNull();
    expect(optionalString(undefined)).toBeNull();
  });

  it('parsePmHandoffState rejects unknown values', () => {
    expect(parsePmHandoffState('accepted')).toBe('accepted');
    expect(parsePmHandoffState('rejected_with_gaps')).toBe('rejected_with_gaps');
    expect(parsePmHandoffState('REJECTED')).toBeNull();
    expect(parsePmHandoffState('done')).toBeNull();
  });

  it('parseCriticalGapStatus rejects unknown values', () => {
    expect(parseCriticalGapStatus('OPEN')).toBe('OPEN');
    expect(parseCriticalGapStatus('FOO')).toBeNull();
  });

  it('isUuid matches v4 uuid format', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it('isPatchField allows the three editable fields only', () => {
    expect(isPatchField('reviewer_notes')).toBe(true);
    expect(isPatchField('critical_gaps')).toBe(true);
    expect(isPatchField('packet_drive_file_id')).toBe(true);
    expect(isPatchField('state')).toBe(false);
    expect(isPatchField('accepted_at')).toBe(false);
    expect(isPatchField('id')).toBe(false);
  });
});

describe('BAN-346 parseCriticalGaps', () => {
  it('accepts null/undefined as empty array', () => {
    expect(parseCriticalGaps(undefined)).toEqual([]);
    expect(parseCriticalGaps(null)).toEqual([]);
  });

  it('accepts a valid array', () => {
    const input = [
      { gap_id: 'g1', gap_type: 'SCOPE', description: 'missing geotech', status: 'OPEN' },
      { gap_id: 'g2', gap_type: 'BUDGET', description: 'allowance unclear', status: 'ACKNOWLEDGED' },
    ];
    expect(parseCriticalGaps(input)).toEqual(input);
  });

  it('defaults status to OPEN if status field is missing', () => {
    const input = [{ gap_id: 'g1', gap_type: 'SCOPE', description: 'x' }];
    expect(parseCriticalGaps(input)).toEqual([
      { gap_id: 'g1', gap_type: 'SCOPE', description: 'x', status: 'OPEN' },
    ]);
  });

  it('trims string fields', () => {
    const input = [{ gap_id: ' g1 ', gap_type: ' SCOPE ', description: ' x ', status: 'OPEN' }];
    expect(parseCriticalGaps(input)).toEqual([
      { gap_id: 'g1', gap_type: 'SCOPE', description: 'x', status: 'OPEN' },
    ]);
  });

  it('returns null for non-array input', () => {
    expect(parseCriticalGaps('not an array')).toBeNull();
    expect(parseCriticalGaps({ gap_id: 'x' })).toBeNull();
    expect(parseCriticalGaps(42)).toBeNull();
  });

  it('returns null when a gap is missing required fields', () => {
    expect(parseCriticalGaps([{ gap_id: '', gap_type: 'x', description: 'y' }])).toBeNull();
    expect(parseCriticalGaps([{ gap_id: 'g', gap_type: '', description: 'y' }])).toBeNull();
    expect(parseCriticalGaps([{ gap_id: 'g', gap_type: 'x', description: '' }])).toBeNull();
  });

  it('returns null when status value is unknown', () => {
    expect(parseCriticalGaps([
      { gap_id: 'g', gap_type: 'x', description: 'y', status: 'WHATEVER' },
    ])).toBeNull();
  });
});

describe('BAN-346 state machine transitions', () => {
  it('pending_review → reviewed_complete is allowed', () => {
    expect(isAllowedTransition('pending_review', 'reviewed_complete')).toBe(true);
  });

  it('pending_review → accepted is allowed (skip review)', () => {
    expect(isAllowedTransition('pending_review', 'accepted')).toBe(true);
    expect(isAllowedTransition('pending_review', 'accepted_with_gaps')).toBe(true);
  });

  it('pending_review → rejected_with_gaps is allowed', () => {
    expect(isAllowedTransition('pending_review', 'rejected_with_gaps')).toBe(true);
  });

  it('reviewed_complete → accepted is allowed', () => {
    expect(isAllowedTransition('reviewed_complete', 'accepted')).toBe(true);
    expect(isAllowedTransition('reviewed_complete', 'accepted_with_gaps')).toBe(true);
  });

  it('reviewed_complete → rejected_with_gaps is allowed', () => {
    expect(isAllowedTransition('reviewed_complete', 'rejected_with_gaps')).toBe(true);
  });

  it('reviewed_complete → reviewed_complete is rejected (no-op)', () => {
    expect(isAllowedTransition('reviewed_complete', 'reviewed_complete')).toBe(false);
  });

  it('terminal states never transition', () => {
    for (const term of PM_HANDOFF_TERMINAL_STATES) {
      for (const dest of PM_HANDOFF_STATES) {
        expect(isAllowedTransition(term, dest)).toBe(false);
      }
    }
  });

  it('reviewed_complete cannot go back to pending_review', () => {
    expect(isAllowedTransition('reviewed_complete', 'pending_review')).toBe(false);
  });

  it('pending_review cannot self-loop', () => {
    expect(isAllowedTransition('pending_review', 'pending_review')).toBe(false);
  });
});

describe('BAN-346 subscriber wire planner', () => {
  const base = {
    tenantId: 't',
    receiptId: 'r',
    engagementId: 'e',
    kid: 'K001',
    isTestProject: false,
    actorEmail: 'pm@example.com',
    actorUserId: null,
  };

  it('reviewed_complete triggers action item creation', () => {
    const plan = planHandoffSubscriberAction({
      ...base,
      fromState: 'pending_review',
      toState: 'reviewed_complete',
    });
    expect(plan.create).toBe(true);
    expect(plan.autoClose).toBe(false);
  });

  it('accepted triggers auto-close', () => {
    const plan = planHandoffSubscriberAction({
      ...base,
      fromState: 'reviewed_complete',
      toState: 'accepted',
    });
    expect(plan.create).toBe(false);
    expect(plan.autoClose).toBe(true);
    expect(plan.reason).toContain('accepted');
  });

  it('accepted_with_gaps triggers auto-close', () => {
    const plan = planHandoffSubscriberAction({
      ...base,
      fromState: 'pending_review',
      toState: 'accepted_with_gaps',
    });
    expect(plan.autoClose).toBe(true);
    expect(plan.reason).toContain('accepted_with_gaps');
  });

  it('rejected_with_gaps triggers auto-close', () => {
    const plan = planHandoffSubscriberAction({
      ...base,
      fromState: 'pending_review',
      toState: 'rejected_with_gaps',
    });
    expect(plan.autoClose).toBe(true);
    expect(plan.reason).toContain('rejected_with_gaps');
  });

  it('returns no-op for unmatched transitions', () => {
    const plan = planHandoffSubscriberAction({
      ...base,
      fromState: 'pending_review',
      toState: 'pending_review',
    });
    expect(plan.create).toBe(false);
    expect(plan.autoClose).toBe(false);
  });
});

describe('BAN-346 Activity Spine registration', () => {
  it('registers HANDOFF_RECEIPT_CREATED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('HANDOFF_RECEIPT_CREATED');
    expect(isActivitySpineEventType('HANDOFF_RECEIPT_CREATED')).toBe(true);
  });

  it('registers HANDOFF_RECEIPT_STATE_CHANGED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('HANDOFF_RECEIPT_STATE_CHANGED');
    expect(isActivitySpineEventType('HANDOFF_RECEIPT_STATE_CHANGED')).toBe(true);
  });

  it('does not enforce Pattern B payload fields for HANDOFF_RECEIPT_* events', () => {
    expect(validateActivitySpinePayload('HANDOFF_RECEIPT_CREATED', {}).ok).toBe(true);
    expect(validateActivitySpinePayload('HANDOFF_RECEIPT_STATE_CHANGED', {}).ok).toBe(true);
  });

  it('preserves prior canonical Pattern A events alongside HANDOFF_RECEIPT_*', () => {
    for (const prior of [
      'ACTION_ITEM_CREATED',
      'ACTION_ITEM_STATE_CHANGED',
      'ACTION_ITEM_CLOSED_AUTO',
      'DOCUMENT_UPLOADED',
      'MEETING_LOGGED',
    ]) {
      expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain(prior);
    }
  });
});

describe('BAN-346 migration shape (0027_ban346_pm_handoff_receipts.sql)', () => {
  const migrationPath = path.join(process.cwd(), 'db/migrations/0027_ban346_pm_handoff_receipts.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('creates the pm_handoff_receipts table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.pm_handoff_receipts');
  });

  it('creates the pm_handoff_state enum with all 5 states', () => {
    expect(sql).toContain('CREATE TYPE public.pm_handoff_state AS ENUM');
    for (const s of PM_HANDOFF_STATES) {
      expect(sql).toContain(`'${s}'`);
    }
  });

  it('defines the canonical columns', () => {
    const tableBlock = sql.match(/CREATE TABLE IF NOT EXISTS public\.pm_handoff_receipts[\s\S]*?\);/);
    expect(tableBlock).not.toBeNull();
    const block = tableBlock![0];
    expect(block).toMatch(/id uuid PRIMARY KEY/);
    expect(block).toMatch(/tenant_id uuid NOT NULL REFERENCES public\.tenants/);
    expect(block).toMatch(/engagement_id uuid REFERENCES public\.engagements/);
    expect(block).toMatch(/estimate_version_id text/);
    expect(block).toMatch(/state public\.pm_handoff_state NOT NULL DEFAULT 'pending_review'/);
    expect(block).toMatch(/critical_gaps jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
    expect(block).toMatch(/reviewer_notes text/);
    expect(block).toMatch(/packet_drive_file_id text/);
    expect(block).toMatch(/submitted_by_user_id uuid REFERENCES public\.users/);
    expect(block).toMatch(/reviewed_by_user_id uuid REFERENCES public\.users/);
    expect(block).toMatch(/accepted_at timestamptz/);
    expect(block).toMatch(/rejected_at timestamptz/);
    expect(block).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/);
    expect(block).toMatch(/updated_at timestamptz NOT NULL DEFAULT now\(\)/);
  });

  it('makes engagement_id nullable to allow Estimating-side draft handoffs', () => {
    const tableBlock = sql.match(/CREATE TABLE IF NOT EXISTS public\.pm_handoff_receipts[\s\S]*?\);/)![0];
    expect(tableBlock).not.toMatch(/engagement_id uuid NOT NULL/);
  });

  it('makes estimate_version_id nullable text (engagement-only handoffs allowed)', () => {
    const tableBlock = sql.match(/CREATE TABLE IF NOT EXISTS public\.pm_handoff_receipts[\s\S]*?\);/)![0];
    expect(tableBlock).toMatch(/estimate_version_id text/);
    expect(tableBlock).not.toMatch(/estimate_version_id text NOT NULL/);
  });

  it('creates the three canonical indexes', () => {
    expect(sql).toContain('idx_pm_handoff_receipts_tenant_kid');
    expect(sql).toContain('idx_pm_handoff_receipts_tenant_state_pending');
    expect(sql).toContain('idx_pm_handoff_receipts_tenant_engagement');
  });

  it('state-pending index is partial on open states', () => {
    expect(sql).toMatch(/WHERE state IN \('pending_review','reviewed_complete'\)/);
  });

  it('enforces critical_gaps shape via CHECK constraint', () => {
    expect(sql).toContain('pm_handoff_receipts_critical_gaps_is_array');
    expect(sql).toContain("jsonb_typeof(critical_gaps) = 'array'");
  });

  it('extends the BAN-293 field_events CHECK with HANDOFF_RECEIPT_* events', () => {
    expect(sql).toContain("'HANDOFF_RECEIPT_CREATED'");
    expect(sql).toContain("'HANDOFF_RECEIPT_STATE_CHANGED'");
  });

  it('preserves prior canon in the CHECK rewrite', () => {
    for (const prior of [
      "'INSTALL_STEP'",
      "'wo_completion'",
      "'MEETING_LOGGED'",
      "'ACTION_ITEM_CREATED'",
      "'ACTION_ITEM_STATE_CHANGED'",
      "'ACTION_ITEM_CLOSED_AUTO'",
      "'DOCUMENT_UPLOADED'",
      "'DOCUMENT_LINKED'",
      "'DOCUMENT_SUPERSEDED'",
      "'RFI_STATE_CHANGED'",
      "'SUBMITTAL_STATE_CHANGED'",
      "'VERBAL_AGREEMENT_LOGGED'",
    ]) {
      expect(sql).toContain(prior);
    }
  });
});

describe('BAN-346 entity-kind registration (emit.ts)', () => {
  // Static-string smoke test — the union is exported as a TypeScript type,
  // so we exercise it through the emit-helper input shape and confirm the
  // string literal is accepted by the type system at compile time.
  it('handoff_receipt is a valid ActivitySpineEntityKind', () => {
    const kind: import('@/lib/activity-spine/emit').ActivitySpineEntityKind = 'handoff_receipt';
    expect(kind).toBe('handoff_receipt');
  });
});
