/**
 * BAN-376 Customer Pipeline — migration 0037 + 0038 shape tests.
 *
 * Verifies the on-disk SQL for inquiries + inquiry_state_transitions matches
 * the spec §5 + §9 + §15 contract, and that 0038 is an ISOLATED column-add
 * for engagements.source_inquiry_id (no enum / CHECK / event_type touches
 * per BAN-293 protect-list rule).
 */

import fs from 'fs';
import path from 'path';

describe('BAN-376 migration 0037 — inquiries + state transitions', () => {
  const migrationDir = path.join(process.cwd(), 'db/migrations');
  const sql = fs.readFileSync(
    path.join(migrationDir, '0039_ban376_customer_pipeline_p0.sql'),
    'utf8',
  );

  it('creates the inquiries table with all spec §5 columns', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.inquiries');
    expect(sql).toContain('inquiry_id uuid PRIMARY KEY');
    expect(sql).toContain('inquiry_number text NOT NULL');
    expect(sql).toContain('tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id)');
    expect(sql).toContain('source text NOT NULL');
    expect(sql).toContain('source_detail text');
    expect(sql).toContain('source_evidence text');
    expect(sql).toContain('first_contact_user_id uuid REFERENCES public.users');
    expect(sql).toContain('first_contact_method text');
    expect(sql).toContain('customer_name text NOT NULL');
    expect(sql).toContain('customer_org_id uuid REFERENCES public.organizations');
    expect(sql).toContain('inquiry_type_initial text NOT NULL DEFAULT \'UNCLEAR\'');
    expect(sql).toContain('estimated_value_band text NOT NULL DEFAULT \'UNKNOWN\'');
    expect(sql).toContain('assigned_to_user_id uuid REFERENCES public.users');
    expect(sql).toContain('state text NOT NULL DEFAULT \'NEW\'');
    expect(sql).toContain('conversion_event text');
    expect(sql).toContain('converted_to_project_id uuid REFERENCES public.engagements (engagement_id)');
    expect(sql).toContain('converted_to_work_order_id text');
    expect(sql).toContain('is_test_project boolean NOT NULL DEFAULT false');
  });

  it('enforces every spec §5 enum via CHECK constraints', () => {
    expect(sql).toMatch(/inquiries_source_check[\s\S]*'PHONE'[\s\S]*'EMAIL'[\s\S]*'WALK_IN'[\s\S]*'RFP'[\s\S]*'WEBSITE_FORM'[\s\S]*'GBA_REVIEW'[\s\S]*'REFERRAL'[\s\S]*'OTHER'/);
    expect(sql).toMatch(/inquiries_first_contact_method_check[\s\S]*'OFFICE_FORWARD'/);
    expect(sql).toMatch(/inquiries_inquiry_type_initial_check[\s\S]*'WORK_ORDER'[\s\S]*'PROJECT'[\s\S]*'UNCLEAR'/);
    expect(sql).toMatch(/inquiries_estimated_value_band_check[\s\S]*'UNDER_5K'[\s\S]*'500K_PLUS'[\s\S]*'UNKNOWN'/);
    expect(sql).toMatch(/inquiries_assigned_role_check[\s\S]*'PM'[\s\S]*'SERVICE_PM'[\s\S]*'ESTIMATOR'[\s\S]*'GM'[\s\S]*'ADMIN'/);
    expect(sql).toMatch(/inquiries_state_check[\s\S]*'NEW'[\s\S]*'IN_DISCUSSION'[\s\S]*'QUOTED'[\s\S]*'AWARDED'[\s\S]*'LOST'[\s\S]*'DEFERRED'[\s\S]*'CONVERTED'/);
    expect(sql).toMatch(/inquiries_conversion_event_check[\s\S]*'SIGNED_PROPOSAL'[\s\S]*'NOTICE_TO_PROCEED'[\s\S]*'EMAIL_AWARD'/);
  });

  it('declares every spec §5 index', () => {
    expect(sql).toContain('inquiries_tenant_number_uidx');
    expect(sql).toContain('inquiries_tenant_state_idx');
    expect(sql).toContain('inquiries_tenant_assigned_state_idx');
    expect(sql).toContain('inquiries_tenant_first_contact_idx');
    expect(sql).toContain('inquiries_tenant_source_idx');
    expect(sql).toContain('inquiries_conversion_targets_idx');
    expect(sql).toContain('inquiries_production_default_idx');
  });

  it('creates the inquiry_state_transitions audit table per spec §15', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.inquiry_state_transitions');
    expect(sql).toContain('inquiry_id uuid NOT NULL REFERENCES public.inquiries (inquiry_id) ON DELETE CASCADE');
    expect(sql).toContain('from_state text');
    expect(sql).toContain('to_state text NOT NULL');
    expect(sql).toMatch(/inquiry_state_transitions_to_state_check[\s\S]*'CONVERTED'/);
  });

  it('does NOT modify field_events.event_type CHECK (BAN-293 protect-list)', () => {
    // Stripping SQL comments before checking; the rationale section in the
    // file header reasonably names the protected surfaces it stays away from.
    const code = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    expect(code).not.toMatch(/ALTER\s+TABLE.*field_events/i);
    expect(code).not.toContain('field_events_event_type_ban293_check');
    expect(code).not.toContain('field_events');
  });

  it('does NOT add new Activity Spine event types in CHECK constraints', () => {
    // The header comment explains the deferral and names the future event
    // types for traceability; what matters is that none of them appears in
    // an executable CHECK constraint or INSERT for field_events.
    const code = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    for (const evt of [
      'INQUIRY_LOGGED',
      'INQUIRY_STATE_CHANGED',
      'INQUIRY_ASSIGNED',
      'INQUIRY_CONVERTED_TO_PROJECT',
      'INQUIRY_CONVERTED_TO_WORK_ORDER',
    ]) {
      expect(code).not.toContain(evt);
    }
  });
});

describe('BAN-376 migration 0038 — engagements.source_inquiry_id', () => {
  const migrationDir = path.join(process.cwd(), 'db/migrations');
  const sql = fs.readFileSync(
    path.join(migrationDir, '0040_ban376_customer_pipeline_p1_engagements_source.sql'),
    'utf8',
  );

  it('adds the source_inquiry_id column with FK to inquiries', () => {
    expect(sql).toContain('ALTER TABLE public.engagements');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS source_inquiry_id uuid');
    expect(sql).toContain('engagements_source_inquiry_id_fk');
    expect(sql).toContain('REFERENCES public.inquiries (inquiry_id)');
    expect(sql).toContain('ON DELETE SET NULL');
  });

  it('adds the tenant + source_inquiry composite index', () => {
    expect(sql).toContain('engagements_tenant_source_inquiry_idx');
  });

  it('is ISOLATED — no engagement_type CHECK touch, no field_events touch', () => {
    // Strip SQL comments before checking; the header explains the rationale
    // for staying off the protected surfaces, which legitimately names them.
    const code = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    expect(code).not.toMatch(/engagement_type/);
    expect(code).not.toMatch(/field_events/);
    expect(code).not.toContain('engagements_engagement_type_check');
    expect(code).not.toMatch(/ALTER\s+TABLE.*field_events/i);
  });
});
