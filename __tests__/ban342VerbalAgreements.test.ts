import fs from 'fs';
import path from 'path';

import {
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  isActivitySpineEventType,
  validateActivitySpinePayload,
} from '@/lib/activity-spine/event-contract';
import {
  addBusinessDays,
  buildVerbalAgreementFollowupEmail,
} from '@/lib/pm/verbal-agreements/followup-email';
import {
  FORMAL_DOCUMENTATION_TYPES,
  isFormalDocumentationType,
  isVerbalAgreementStatus,
  isVerbalAgreementType,
  validateVerbalAgreementTransition,
  VERBAL_AGREEMENT_ALLOWED_TRANSITIONS,
  VERBAL_AGREEMENT_STATUSES,
  VERBAL_AGREEMENT_TYPES,
} from '@/lib/pm/verbal-agreements/state-machine';

describe('BAN-342 verbal agreement state machine', () => {
  it('defines the canon status set', () => {
    expect(VERBAL_AGREEMENT_STATUSES).toEqual(['LOGGED', 'FOLLOWED_UP', 'FORMALIZED', 'DISPUTED', 'RESOLVED']);
  });

  it('defines the canon agreement type set', () => {
    expect(VERBAL_AGREEMENT_TYPES).toContain('T_M_AUTHORIZATION');
    expect(VERBAL_AGREEMENT_TYPES).toContain('DELIVERY_COMMITMENT');
    expect(VERBAL_AGREEMENT_TYPES).toHaveLength(7);
  });

  it('defines the allowed formal documentation targets', () => {
    expect(FORMAL_DOCUMENTATION_TYPES).toEqual(['CHANGE_ORDER', 'TM_TICKET', 'RFI']);
  });

  it('recognizes valid status values', () => {
    expect(isVerbalAgreementStatus('LOGGED')).toBe(true);
    expect(isVerbalAgreementStatus('CLOSED')).toBe(false);
  });

  it('recognizes valid type values', () => {
    expect(isVerbalAgreementType('SCOPE_CHANGE')).toBe(true);
    expect(isVerbalAgreementType('PHONE_CALL')).toBe(false);
  });

  it('recognizes valid formal doc types', () => {
    expect(isFormalDocumentationType('CHANGE_ORDER')).toBe(true);
    expect(isFormalDocumentationType('PAY_APP')).toBe(false);
  });

  it('allows LOGGED to FOLLOWED_UP', () => {
    expect(validateVerbalAgreementTransition('LOGGED', 'FOLLOWED_UP')).toEqual({ ok: true });
  });

  it('allows FOLLOWED_UP to FORMALIZED', () => {
    expect(validateVerbalAgreementTransition('FOLLOWED_UP', 'FORMALIZED')).toEqual({ ok: true });
  });

  it('allows LOGGED to DISPUTED', () => {
    expect(validateVerbalAgreementTransition('LOGGED', 'DISPUTED')).toEqual({ ok: true });
  });

  it('allows DISPUTED to RESOLVED', () => {
    expect(validateVerbalAgreementTransition('DISPUTED', 'RESOLVED')).toEqual({ ok: true });
  });

  it('allows FORMALIZED to RESOLVED', () => {
    expect(validateVerbalAgreementTransition('FORMALIZED', 'RESOLVED')).toEqual({ ok: true });
  });

  it('rejects no-op transitions', () => {
    expect(validateVerbalAgreementTransition('LOGGED', 'LOGGED')).toMatchObject({ ok: false, reason: 'NO_OP' });
  });

  it('rejects backward transitions', () => {
    expect(validateVerbalAgreementTransition('FORMALIZED', 'FOLLOWED_UP')).toMatchObject({ ok: false, reason: 'TRANSITION_NOT_ALLOWED' });
  });

  it('keeps terminal RESOLVED closed', () => {
    expect(VERBAL_AGREEMENT_ALLOWED_TRANSITIONS.RESOLVED).toEqual([]);
  });
});

describe('BAN-342 verbal agreement follow-up email', () => {
  it('adds three business days across a normal week', () => {
    expect(addBusinessDays(new Date('2026-05-18T12:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2026-05-21');
  });

  it('skips weekends when computing deadline', () => {
    expect(addBusinessDays(new Date('2026-05-22T12:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2026-05-27');
  });

  it('drafts a confirming email with substitutions', () => {
    const draft = buildVerbalAgreementFollowupEmail({
      subject: 'Parking lot T&M authorization',
      external_party_org: 'Good GC',
      external_party_contact_name: 'Kai',
      agreement_summary: 'Good GC authorized Kula to proceed with added sealant work as T&M.',
      occurred_at: '2026-05-18T20:00:00Z',
    }, { now: new Date('2026-05-18T21:00:00Z') });
    expect(draft.subject).toBe('Follow-up: Parking lot T&M authorization');
    expect(draft.response_deadline).toBe('2026-05-21');
    expect(draft.body).toContain('Hi Kai');
    expect(draft.body).toContain('Good GC authorized Kula');
    expect(draft.body).toContain('May 21, 2026');
  });

  it('includes cost and schedule impacts when present', () => {
    const draft = buildVerbalAgreementFollowupEmail({
      subject: 'Scope adjustment',
      external_party_org: 'Good GC',
      agreement_summary: 'Add glass guards at level 2.',
      cost_impact_estimate: '1250',
      schedule_impact_days: 2,
    }, { now: new Date('2026-05-18T21:00:00Z') });
    expect(draft.body).toContain('Cost impact noted: $1,250.00');
    expect(draft.body).toContain('Schedule impact noted: 2 days');
  });
});

describe('BAN-342 Activity Spine registration and migration shape', () => {
  const migrationPath = path.join(process.cwd(), 'db/migrations/0021_ban342_verbal_agreements.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('registers VERBAL_AGREEMENT_LOGGED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('VERBAL_AGREEMENT_LOGGED');
    expect(isActivitySpineEventType('VERBAL_AGREEMENT_LOGGED')).toBe(true);
  });

  it('registers VERBAL_AGREEMENT_FOLLOWUP_SENT as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('VERBAL_AGREEMENT_FOLLOWUP_SENT');
    expect(isActivitySpineEventType('VERBAL_AGREEMENT_FOLLOWUP_SENT')).toBe(true);
  });

  it('registers VERBAL_AGREEMENT_FORMALIZED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('VERBAL_AGREEMENT_FORMALIZED');
    expect(isActivitySpineEventType('VERBAL_AGREEMENT_FORMALIZED')).toBe(true);
  });

  it('registers VERBAL_AGREEMENT_RESOLVED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('VERBAL_AGREEMENT_RESOLVED');
    expect(isActivitySpineEventType('VERBAL_AGREEMENT_RESOLVED')).toBe(true);
  });

  it('does not enforce Pattern B payload fields for verbal agreement events', () => {
    expect(validateActivitySpinePayload('VERBAL_AGREEMENT_FORMALIZED', {}).ok).toBe(true);
  });

  it('creates the verbal_agreements table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.verbal_agreements');
  });

  it('creates required enums', () => {
    expect(sql).toContain('CREATE TYPE public.verbal_agreement_type');
    expect(sql).toContain('CREATE TYPE public.verbal_agreement_status');
  });

  it('enforces subject length', () => {
    expect(sql).toContain('verbal_agreements_subject_length');
    expect(sql).toContain('char_length(subject) <= 200');
  });

  it('extends the field_events CHECK with all verbal agreement events', () => {
    expect(sql).toContain("'VERBAL_AGREEMENT_LOGGED'");
    expect(sql).toContain("'VERBAL_AGREEMENT_FOLLOWUP_SENT'");
    expect(sql).toContain("'VERBAL_AGREEMENT_FORMALIZED'");
    expect(sql).toContain("'VERBAL_AGREEMENT_RESOLVED'");
  });
});
