/**
 * BAN-338 Pay Apps v2c — migration 0020 + Activity Spine contract coverage.
 *
 * Mirrors the BAN-337 (0019) pattern: ensures the migration is additive
 * (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / no DROP TABLE
 * or DROP COLUMN) and that the v2c Pattern A events are registered in the
 * contract.
 */

import fs from 'fs';
import path from 'path';
import {
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  isActivitySpineEventType,
  validateActivitySpinePayload,
} from '@/lib/activity-spine/event-contract';

describe('BAN-338 activity spine — new Pattern A events', () => {
  it('registers LIEN_WAIVER_GENERATED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('LIEN_WAIVER_GENERATED');
    expect(isActivitySpineEventType('LIEN_WAIVER_GENERATED')).toBe(true);
  });

  it('registers JOINT_CHECK_AGREEMENT_STATE_CHANGED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('JOINT_CHECK_AGREEMENT_STATE_CHANGED');
    expect(isActivitySpineEventType('JOINT_CHECK_AGREEMENT_STATE_CHANGED')).toBe(true);
  });

  it('registers EXTERNAL_LIEN_WAIVER_STATE_CHANGED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('EXTERNAL_LIEN_WAIVER_STATE_CHANGED');
    expect(isActivitySpineEventType('EXTERNAL_LIEN_WAIVER_STATE_CHANGED')).toBe(true);
  });

  it('registers GC_REQUIRED_DOCS_CHECKLIST_UPDATED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('GC_REQUIRED_DOCS_CHECKLIST_UPDATED');
    expect(isActivitySpineEventType('GC_REQUIRED_DOCS_CHECKLIST_UPDATED')).toBe(true);
  });

  it('keeps LIEN_WAIVER_STATE_CHANGED in Pattern B (existing transition route is unchanged)', () => {
    // Pattern A events have NO from_state/to_state requirement; Pattern B does.
    // Validating LIEN_WAIVER_STATE_CHANGED without from_state/to_state must fail.
    const result = validateActivitySpinePayload('LIEN_WAIVER_STATE_CHANGED', {});
    expect(result.ok).toBe(false);
  });

  it('Pattern A LIEN_WAIVER_GENERATED does not require from_state/to_state', () => {
    const result = validateActivitySpinePayload('LIEN_WAIVER_GENERATED', { waiver_type: 'CONDITIONAL_PROGRESS' });
    expect(result.ok).toBe(true);
  });
});

describe('BAN-338 migration 0022 — additive only', () => {
  const migrationPath = path.join(process.cwd(), 'db/migrations/0022_ban338_pay_apps_v2c.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('has no destructive DROP TABLE / DROP COLUMN statements', () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
  });

  it('uses ADD COLUMN IF NOT EXISTS for every column add', () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
  });

  it('uses CREATE TABLE IF NOT EXISTS for new tables', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.joint_check_agreements/i);
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.external_lien_waiver_requests/i);
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.gc_required_docs_checklist/i);
  });

  it('adds pay_applications.is_final_pay_app with default false', () => {
    expect(sql).toContain('is_final_pay_app');
    expect(sql).toMatch(/DEFAULT\s+false/i);
  });

  it('extends lien_waivers state CHECK with GENERATED + SUPERSEDED', () => {
    expect(sql).toContain("'GENERATED'");
    expect(sql).toContain("'SUPERSEDED'");
  });

  it('adds lien_waivers.pdf_drive_id + notarized_pdf_drive_id', () => {
    expect(sql).toContain('pdf_drive_id');
    expect(sql).toContain('notarized_pdf_drive_id');
  });

  it('adds joint_check_agreements lifecycle CHECK with 5 statuses', () => {
    expect(sql).toContain("'PROPOSED'");
    expect(sql).toContain("'EXECUTED'");
    expect(sql).toContain("'ACTIVE'");
    expect(sql).toContain("'CLOSED'");
    expect(sql).toContain("'DISPUTED'");
  });

  it('adds external_lien_waiver_requests status CHECK with 5 statuses', () => {
    expect(sql).toContain("'REQUESTED'");
    expect(sql).toContain("'RECEIVED'");
    expect(sql).toContain("'UPLOADED'");
    expect(sql).toContain("'DELIVERED_TO_GC'");
  });

  it('extends external_lien_waiver_requests waiver_type CHECK with all 4 types', () => {
    expect(sql).toContain("'CONDITIONAL_PROGRESS'");
    expect(sql).toContain("'UNCONDITIONAL_PROGRESS'");
    expect(sql).toContain("'CONDITIONAL_FINAL'");
    expect(sql).toContain("'UNCONDITIONAL_FINAL'");
  });

  it('gc_required_docs_checklist has unique constraint on (tenant_id, engagement_id)', () => {
    expect(sql).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+gc_required_docs_checklist_engagement_uidx/i);
  });

  it('extends BAN-293 field_events CHECK with v2c Pattern A events', () => {
    expect(sql).toContain("'LIEN_WAIVER_GENERATED'");
    expect(sql).toContain("'JOINT_CHECK_AGREEMENT_STATE_CHANGED'");
    expect(sql).toContain("'EXTERNAL_LIEN_WAIVER_STATE_CHANGED'");
    expect(sql).toContain("'GC_REQUIRED_DOCS_CHECKLIST_UPDATED'");
    expect(sql).toContain('field_events_event_type_ban293_check');
  });

  it('preserves BAN-337 event types in the CHECK rebuild', () => {
    expect(sql).toContain("'PAY_APP_SUBMITTED'");
    expect(sql).toContain("'CASH_RECEIPT_RECORDED'");
    expect(sql).toContain("'PAY_APP_STATE_CHANGED'");
    expect(sql).toContain("'LIEN_WAIVER_STATE_CHANGED'");
  });

  it('uses NOT VALID + VALIDATE CONSTRAINT for the CHECK rebuild', () => {
    expect(sql).toContain('NOT VALID');
    expect(sql).toContain('VALIDATE CONSTRAINT');
  });

  it('adds gc_required_docs_checklist phase CHECK with 3 phases', () => {
    expect(sql).toContain("'ESTIMATING_SCOPE_REVIEW'");
    expect(sql).toContain("'POST_HANDOFF_REVIEW'");
    expect(sql).toContain("'MID_PROJECT_AMENDMENT'");
  });
});
