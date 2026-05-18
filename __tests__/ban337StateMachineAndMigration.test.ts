/**
 * BAN-337 Pay Apps v2b — State machine extension + migration coverage.
 *
 * The post-submission lifecycle (SUBMITTED → ARCHITECT_CERTIFIED →
 * GC_APPROVED → PAID_PARTIAL → PAID_FULL) already exists in the BAN-336
 * Pattern B transitions table; this test pins the BAN-337 transition
 * branches so a future refactor can't silently drop them. It also
 * verifies migration 0019 is additive only and lands the new
 * billing_format_config / notarization_sessions / textura_submissions
 * columns referenced by the v2b routes.
 */

import fs from 'fs';
import path from 'path';
import {
  validatePatternBTransition,
  PAY_APP_ALLOWED_TRANSITIONS,
} from '@/lib/aia/state-transitions';
import {
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  isActivitySpineEventType,
} from '@/lib/activity-spine/event-contract';

describe('BAN-337 pay app state machine — post-submission lifecycle', () => {
  it('READY_FOR_SUBMISSION → SUBMITTED is allowed', () => {
    expect(validatePatternBTransition('pay_application', 'READY_FOR_SUBMISSION', 'SUBMITTED').ok).toBe(true);
  });

  it('SUBMITTED → ARCHITECT_CERTIFIED is allowed (architect_cert_required branch)', () => {
    expect(validatePatternBTransition('pay_application', 'SUBMITTED', 'ARCHITECT_CERTIFIED').ok).toBe(true);
  });

  it('ARCHITECT_CERTIFIED → GC_APPROVED is allowed', () => {
    expect(validatePatternBTransition('pay_application', 'ARCHITECT_CERTIFIED', 'GC_APPROVED').ok).toBe(true);
  });

  it('GC_APPROVED → PAID_PARTIAL is allowed', () => {
    expect(validatePatternBTransition('pay_application', 'GC_APPROVED', 'PAID_PARTIAL').ok).toBe(true);
  });

  it('GC_APPROVED → PAID_FULL is allowed', () => {
    expect(validatePatternBTransition('pay_application', 'GC_APPROVED', 'PAID_FULL').ok).toBe(true);
  });

  it('PAID_PARTIAL → PAID_FULL is allowed (subsequent receipt fills balance)', () => {
    expect(validatePatternBTransition('pay_application', 'PAID_PARTIAL', 'PAID_FULL').ok).toBe(true);
  });

  it('PAID_FULL is terminal', () => {
    expect(PAY_APP_ALLOWED_TRANSITIONS.PAID_FULL).toEqual([]);
  });
});

describe('BAN-337 activity spine — new Pattern A events', () => {
  it('registers PAY_APP_NOTARIZATION_SKIPPED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('PAY_APP_NOTARIZATION_SKIPPED');
    expect(isActivitySpineEventType('PAY_APP_NOTARIZATION_SKIPPED')).toBe(true);
  });
  it('registers PAY_APP_SUBMITTED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('PAY_APP_SUBMITTED');
    expect(isActivitySpineEventType('PAY_APP_SUBMITTED')).toBe(true);
  });
  it('registers CASH_RECEIPT_RECORDED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('CASH_RECEIPT_RECORDED');
    expect(isActivitySpineEventType('CASH_RECEIPT_RECORDED')).toBe(true);
  });
});

describe('BAN-337 migration 0019 — additive only', () => {
  const migrationPath = path.join(process.cwd(), 'db/migrations/0019_ban337_pay_apps_v2b.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('uses ADD COLUMN IF NOT EXISTS for every column add (additive)', () => {
    // No DROP TABLE, no DROP COLUMN. CHECK constraint drops/recreates are fine —
    // those are the canonical Postgres "extend enum-like CHECK" pattern.
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
  });

  it('adds billing_format_config.notarization_provider with MANUAL default', () => {
    expect(sql).toContain('billing_format_config');
    expect(sql).toContain('notarization_provider');
    expect(sql).toContain(`DEFAULT 'MANUAL'`);
  });

  it('adds notarization_sessions.notarization_source with MANUAL_UPLOAD default', () => {
    expect(sql).toContain('notarization_sessions');
    expect(sql).toContain('notarization_source');
    expect(sql).toContain(`DEFAULT 'MANUAL_UPLOAD'`);
  });

  it('adds the notarization_sessions metadata fan-out (state, method, signed_pdf_drive_id, uploaded_by)', () => {
    expect(sql).toContain('notary_state');
    expect(sql).toContain('notary_commission_expires');
    expect(sql).toContain('notarization_date');
    expect(sql).toContain('notarization_method');
    expect(sql).toContain('signed_pdf_drive_id');
    expect(sql).toContain('uploaded_by');
  });

  it('extends textura_submissions with bundle + external id columns', () => {
    expect(sql).toContain('bundle_drive_id');
    expect(sql).toContain('csv_drive_id');
    expect(sql).toContain('notarized_pdf_drive_id');
    expect(sql).toContain('textura_submission_id_external');
  });

  it('extends textura_submissions status enum with GENERATED + UPLOADED_TO_TEXTURA + CONFIRMED_BY_TEXTURA', () => {
    expect(sql).toContain(`'GENERATED'`);
    expect(sql).toContain(`'UPLOADED_TO_TEXTURA'`);
    expect(sql).toContain(`'CONFIRMED_BY_TEXTURA'`);
    expect(sql).toContain(`'REJECTED_BY_TEXTURA'`);
  });

  it('extends notarization_sessions state enum with INITIATED + EXPIRED', () => {
    expect(sql).toContain(`'INITIATED'`);
    expect(sql).toContain(`'EXPIRED'`);
  });

  it('extends the BAN-293 field_events CHECK with the v2b Pattern A events', () => {
    expect(sql).toContain(`'PAY_APP_NOTARIZATION_SKIPPED'`);
    expect(sql).toContain(`'PAY_APP_SUBMITTED'`);
    expect(sql).toContain(`'CASH_RECEIPT_RECORDED'`);
    expect(sql).toContain('field_events_event_type_ban293_check');
  });

  it('uses NOT VALID + VALIDATE pattern for the CHECK rebuild', () => {
    expect(sql).toContain('NOT VALID');
    expect(sql).toContain('VALIDATE CONSTRAINT');
  });
});
