import fs from 'fs';
import path from 'path';

const migrationDir = path.join(process.cwd(), 'db/migrations');

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '');
}

const AIA_TABLES = [
  'sov_versions',
  'schedule_of_values',
  'billing_format_config',
  'deposit_terms',
  'tm_authorizations',
  'pay_applications',
  'pay_app_line_items',
  'pay_app_states',
  'notarization_sessions',
  'lien_waivers',
  'cash_receipts',
  'retainage_holdings',
  'handoff_validations',
  'tm_tickets',
  'textura_submissions',
];

describe('BAN-302 Pass 3a migrations', () => {
  describe('0013 TPA engagements + test_project_resets', () => {
    const rawSql = fs.readFileSync(
      path.join(migrationDir, '0013_pass3a_tpa_engagements_and_resets.sql'),
      'utf8',
    );
    const sql = rawSql;
    const sqlNoComments = stripSqlComments(rawSql);

    it('adds the three D2-authorized engagements columns idempotently', () => {
      expect(sql).toContain('ALTER TABLE public.engagements');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_test_project boolean NOT NULL DEFAULT false');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS test_project_created_by uuid REFERENCES public.users (user_id)');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS test_project_purpose text');
    });

    it('adds the test_project_created_by required CHECK with NOT VALID + VALIDATE', () => {
      expect(sql).toContain('engagements_test_project_created_by_required_check');
      expect(sql).toContain('CHECK (is_test_project = false OR test_project_created_by IS NOT NULL) NOT VALID');
      expect(sql).toContain('VALIDATE CONSTRAINT engagements_test_project_created_by_required_check');
    });

    it('adds the partial production-default index matching the BAN-293 pattern', () => {
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS engagements_production_default_idx');
      expect(sql).toContain('WHERE is_test_project = false');
    });

    it('creates the test_project_resets audit table with engagement cascade', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.test_project_resets');
      expect(sql).toContain('reset_id uuid PRIMARY KEY DEFAULT gen_random_uuid()');
      expect(sql).toContain('engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id) ON DELETE CASCADE');
      expect(sql).toContain('reset_by uuid NOT NULL REFERENCES public.users (user_id)');
      expect(sql).toContain('child_records_deleted jsonb NOT NULL');
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS test_project_resets_engagement_idx');
    });

    it('does not contain destructive statements against existing schema', () => {
      expect(sqlNoComments).not.toMatch(/DROP TABLE\b/i);
      expect(sqlNoComments).not.toMatch(/DELETE FROM\b/i);
      expect(sqlNoComments).not.toMatch(/TRUNCATE\b/i);
      expect(sqlNoComments).not.toMatch(/DROP COLUMN\b/i);
    });
  });

  describe('0014 AIA v1.1 15 entities', () => {
    const rawSql = fs.readFileSync(
      path.join(migrationDir, '0014_pass3a_aia_v1_1_entities.sql'),
      'utf8',
    );
    const sql = rawSql;
    const sqlNoComments = stripSqlComments(rawSql);

    it.each(AIA_TABLES)('creates table %s idempotently', (table) => {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    });

    it('has exactly 15 AIA CREATE TABLE statements', () => {
      const matches = sql.match(/CREATE TABLE IF NOT EXISTS public\.\w+/g) ?? [];
      expect(matches).toHaveLength(AIA_TABLES.length);
    });

    it('orders parent tables before their dependents', () => {
      const indexOf = (table: string) => sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(indexOf('sov_versions')).toBeLessThan(indexOf('schedule_of_values'));
      expect(indexOf('schedule_of_values')).toBeLessThan(indexOf('tm_authorizations'));
      expect(indexOf('tm_authorizations')).toBeLessThan(indexOf('pay_app_line_items'));
      expect(indexOf('pay_applications')).toBeLessThan(indexOf('pay_app_line_items'));
      expect(indexOf('pay_applications')).toBeLessThan(indexOf('pay_app_states'));
      expect(indexOf('pay_applications')).toBeLessThan(indexOf('notarization_sessions'));
      expect(indexOf('notarization_sessions')).toBeLessThan(indexOf('lien_waivers'));
      expect(indexOf('pay_applications')).toBeLessThan(indexOf('retainage_holdings'));
      expect(indexOf('pay_app_line_items')).toBeLessThan(indexOf('retainage_holdings'));
      expect(indexOf('tm_authorizations')).toBeLessThan(indexOf('tm_tickets'));
      expect(indexOf('pay_applications')).toBeLessThan(indexOf('textura_submissions'));
      expect(indexOf('sov_versions')).toBeLessThan(indexOf('handoff_validations'));
      expect(indexOf('sov_versions')).toBeLessThan(indexOf('pay_applications'));
    });

    it('enforces SOV state machine values from AIA spec §4', () => {
      expect(sql).toContain("CHECK (state IN ('NONE','DRAFT_AUTOGENERATED','DRAFT_ESTIMATOR_STRUCTURED','APPROVED_INTERNAL','IN_GC_NEGOTIATION','LOCKED','IN_RECONCILIATION','RETIRED'))");
    });

    it('enforces pay app state machine values from AIA spec §7', () => {
      expect(sql).toContain("CHECK (state IN ('PENDING_DRAFT','READY_FOR_NOTARIZATION','READY_FOR_SUBMISSION','SUBMITTED','ARCHITECT_CERTIFIED','GC_APPROVED','PAID_PARTIAL','PAID_FULL','REJECTED'))");
    });

    it('enforces 4 lien waiver types per HRS Chapter 507 (AIA §10.1)', () => {
      expect(sql).toContain("CHECK (waiver_type IN ('CONDITIONAL_PROGRESS','UNCONDITIONAL_PROGRESS','CONDITIONAL_FINAL','UNCONDITIONAL_FINAL'))");
    });

    it('enforces T&M ticket lifecycle values from AIA §11.3', () => {
      expect(sql).toContain("CHECK (status IN ('DRAFT','LOGGED','READY_FOR_GC_APPROVAL','GC_APPROVED','DISPUTED','BILLABLE','BILLED','PAID','REJECTED'))");
    });

    it('does not contain destructive statements against existing schema', () => {
      expect(sqlNoComments).not.toMatch(/DROP TABLE\b/i);
      expect(sqlNoComments).not.toMatch(/DELETE FROM\b/i);
      expect(sqlNoComments).not.toMatch(/TRUNCATE\b/i);
      expect(sqlNoComments).not.toMatch(/DROP COLUMN\b/i);
    });

    it('does not touch BAN-293 protected surfaces', () => {
      expect(sqlNoComments).not.toMatch(/field_events/);
      expect(sqlNoComments).not.toMatch(/field_events_event_type_ban293_check/);
    });
  });
});
