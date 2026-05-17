import fs from 'fs';
import path from 'path';

const migrationDir = path.join(process.cwd(), 'db/migrations');

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '');
}

const CLOSEOUT_TABLES = [
  'project_lifecycle_states',
  'punch_list_items',
  'substantial_completion_certs',
  'warranties',
  'warranty_claims',
  'notices_of_completion',
  'deliverable_documents',
  'unified_job_packets',
  'gold_dataset_entries',
  'project_search_indexes',
];

const CLOSEOUT_ENUMS = [
  'project_lifecycle_state',
  'punch_list_item_source',
  'punch_list_item_category',
  'punch_list_item_responsible_party',
  'punch_list_item_status',
  'warranty_status',
  'warranty_claim_inbound_source',
  'warranty_claim_triage_result',
  'warranty_claim_resolution',
  'deliverable_type',
];

describe('BAN-304 Pass 3b migrations', () => {
  describe('0015 — Closeout v1.1 enum types (isolated)', () => {
    const rawSql = fs.readFileSync(
      path.join(migrationDir, '0015_pass3b_closeout_v11_enums.sql'),
      'utf8',
    );
    const sqlNoComments = stripSqlComments(rawSql);

    it.each(CLOSEOUT_ENUMS)('creates type %s idempotently', (typeName) => {
      const matcher = new RegExp(`CREATE TYPE public\\.${typeName} AS ENUM`);
      expect(rawSql).toMatch(matcher);
    });

    it('wraps every CREATE TYPE in the duplicate_object idempotency idiom', () => {
      const createCount = (sqlNoComments.match(/CREATE TYPE public\.\w+ AS ENUM/g) ?? []).length;
      const doBlocks = (sqlNoComments.match(/DO \$\$ BEGIN[\s\S]*?EXCEPTION WHEN duplicate_object/g) ?? []).length;
      expect(createCount).toBe(CLOSEOUT_ENUMS.length);
      expect(doBlocks).toBeGreaterThanOrEqual(CLOSEOUT_ENUMS.length);
    });

    it('enumerates project_lifecycle_state members per §5', () => {
      expect(rawSql).toContain("'IN_CLOSEOUT', 'SUBSTANTIALLY_COMPLETE', 'FINAL_COMPLETE', 'ARCHIVED'");
    });

    it('enumerates punch_list_item_source members per §6.2', () => {
      expect(rawSql).toContain("'FIELD_ISSUE'");
      expect(rawSql).toContain("'SUBSTANTIAL_WALKTHROUGH'");
      expect(rawSql).toContain("'GC_TRANSMITTAL'");
      expect(rawSql).toContain("'OWNER_WALKTHROUGH'");
      expect(rawSql).toContain("'ARCHITECT_WALKTHROUGH'");
      expect(rawSql).toContain("'INTERNAL_QA'");
    });

    it('enumerates punch_list_item_category 8 members per §6.2', () => {
      for (const v of ['GLASS','FRAMING','HARDWARE','SEALANT','FINISH','CLEANING','DOCUMENTATION','OTHER']) {
        expect(rawSql).toContain(`'${v}'`);
      }
    });

    it('enumerates warranty_claim_triage_result per §8.6', () => {
      for (const v of ['KULA_RESPONSIBLE','MANUFACTURER_RESPONSIBLE','OTHER_TRADE_RESPONSIBLE','OUT_OF_WARRANTY','DISPUTED']) {
        expect(rawSql).toContain(`'${v}'`);
      }
    });

    it('enumerates deliverable_type per §11.3 + §12', () => {
      for (const v of ['AS_BUILT_DRAWING','OM_MANUAL_COMPONENT','OM_MANUAL_COMPLETE','UNIFIED_JOB_PACKET','OTHER']) {
        expect(rawSql).toContain(`'${v}'`);
      }
    });

    it('contains only enum DDL — no table or alter statements', () => {
      expect(sqlNoComments).not.toMatch(/CREATE TABLE/i);
      expect(sqlNoComments).not.toMatch(/ALTER TABLE/i);
      expect(sqlNoComments).not.toMatch(/DROP TABLE/i);
      expect(sqlNoComments).not.toMatch(/CREATE INDEX/i);
    });
  });

  describe('0016 — Closeout v1.1 entity tables', () => {
    const rawSql = fs.readFileSync(
      path.join(migrationDir, '0016_pass3b_closeout_v11_entities.sql'),
      'utf8',
    );
    const sqlNoComments = stripSqlComments(rawSql);

    it.each(CLOSEOUT_TABLES)('creates table %s idempotently', (table) => {
      expect(sqlNoComments).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    });

    it('has exactly 10 CREATE TABLE statements', () => {
      const matches = sqlNoComments.match(/CREATE TABLE IF NOT EXISTS public\.\w+/g) ?? [];
      expect(matches).toHaveLength(CLOSEOUT_TABLES.length);
    });

    it('orders parent tables before their dependents', () => {
      const indexOf = (t: string) => sqlNoComments.indexOf(`CREATE TABLE IF NOT EXISTS public.${t}`);
      expect(indexOf('warranties')).toBeLessThan(indexOf('warranty_claims'));
    });

    it('every Closeout table FKs engagements (kID inheritance)', () => {
      for (const table of CLOSEOUT_TABLES) {
        const tableBlock = sqlNoComments.split(`CREATE TABLE IF NOT EXISTS public.${table}`)[1] ?? '';
        const truncated = tableBlock.split('CREATE TABLE IF NOT EXISTS')[0];
        expect(truncated).toMatch(/engagement_id uuid NOT NULL REFERENCES public\.engagements/);
      }
    });

    it('every Closeout table carries tenant_id, created_at, updated_at, created_by, updated_by', () => {
      for (const table of CLOSEOUT_TABLES) {
        const tableBlock = sqlNoComments.split(`CREATE TABLE IF NOT EXISTS public.${table}`)[1] ?? '';
        const truncated = tableBlock.split('CREATE TABLE IF NOT EXISTS')[0];
        expect(truncated).toMatch(/tenant_id uuid NOT NULL REFERENCES public\.tenants/);
        expect(truncated).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/);
        expect(truncated).toMatch(/updated_at timestamptz NOT NULL DEFAULT now\(\)/);
        expect(truncated).toMatch(/created_by uuid REFERENCES public\.users/);
        expect(truncated).toMatch(/updated_by uuid REFERENCES public\.users/);
      }
    });

    it('warranty_claims cascades from warranties parent', () => {
      expect(sqlNoComments).toMatch(/warranty_id uuid NOT NULL REFERENCES public\.warranties \(warranty_id\) ON DELETE CASCADE/);
    });

    it('gold_dataset_entries enforces test_project = false via CHECK (TPA §10.3)', () => {
      expect(sqlNoComments).toMatch(/test_project boolean NOT NULL DEFAULT false/);
      expect(sqlNoComments).toMatch(/CHECK \(test_project = false\) NOT VALID/);
      expect(sqlNoComments).toMatch(/VALIDATE CONSTRAINT gold_dataset_entries_test_project_false_check/);
    });

    it('gold_dataset_entries has a valid column-local production-default partial index', () => {
      expect(sqlNoComments).toMatch(/CREATE INDEX IF NOT EXISTS gold_dataset_entries_production_default_idx[\s\S]*?WHERE test_project = false/);
    });

    it('notices_of_completion lien_deadline_days defaults to 45 (HRS §9.4)', () => {
      expect(sqlNoComments).toMatch(/lien_deadline_days integer NOT NULL DEFAULT 45/);
    });

    it('warranties is UNIQUE per engagement (one warranty per project)', () => {
      expect(sqlNoComments).toMatch(/warranties_engagement_uidx UNIQUE \(tenant_id, engagement_id\)/);
    });

    it('punch_list_items unique on (tenant, engagement, item_number)', () => {
      expect(sqlNoComments).toMatch(/punch_list_items_engagement_number_uidx UNIQUE \(tenant_id, engagement_id, item_number\)/);
    });

    it('project_search_indexes is UNIQUE per engagement', () => {
      expect(sqlNoComments).toMatch(/project_search_indexes_engagement_uidx UNIQUE \(tenant_id, engagement_id\)/);
    });

    it('does not modify BAN-293 protected surfaces (field_events, event_type CHECK)', () => {
      expect(sqlNoComments).not.toMatch(/field_events/);
      expect(sqlNoComments).not.toMatch(/field_events_event_type_ban293_check/);
    });

    it('does not modify the engagements table (D1)', () => {
      expect(sqlNoComments).not.toMatch(/ALTER TABLE public\.engagements/);
      expect(sqlNoComments).not.toMatch(/DROP TABLE.*engagements/i);
    });

    it('does not modify Pass 3a AIA tables (D1)', () => {
      for (const aiaTable of ['sov_versions','schedule_of_values','pay_applications','tm_authorizations']) {
        expect(sqlNoComments).not.toMatch(new RegExp(`ALTER TABLE public\\.${aiaTable}`));
        expect(sqlNoComments).not.toMatch(new RegExp(`DROP TABLE.*${aiaTable}`, 'i'));
      }
    });

    it('contains no DELETE / TRUNCATE / DROP TABLE statements', () => {
      expect(sqlNoComments).not.toMatch(/DELETE FROM/i);
      expect(sqlNoComments).not.toMatch(/TRUNCATE/i);
      expect(sqlNoComments).not.toMatch(/DROP TABLE/i);
    });
  });

  describe('protected surfaces (BQS §13)', () => {
    it('migration 0012 (BAN-293 CHECK) is untouched on this branch', () => {
      const sql0012 = fs.readFileSync(path.join(migrationDir, '0012_ban293_activity_spine_event_type_check.sql'), 'utf8');
      expect(sql0012).toContain('field_events_event_type_ban293_check');
      const count = (sql0012.match(/'[A-Za-z_]+'/g) ?? []).length;
      // Existing 11 + 1 wo_completion + 12 Pattern A + 10 Pattern B = 34 quoted event_type values
      expect(count).toBeGreaterThanOrEqual(34);
    });

    it('migration 0013 (BAN-302 TPA engagements) is untouched on this branch', () => {
      const sql0013 = fs.readFileSync(path.join(migrationDir, '0013_pass3a_tpa_engagements_and_resets.sql'), 'utf8');
      expect(sql0013).toContain('is_test_project boolean NOT NULL DEFAULT false');
      expect(sql0013).toContain('test_project_resets');
    });

    it('migration 0014 (BAN-302 AIA v1.1) is untouched on this branch', () => {
      const sql0014 = fs.readFileSync(path.join(migrationDir, '0014_pass3a_aia_v1_1_entities.sql'), 'utf8');
      expect(sql0014).toContain('CREATE TABLE IF NOT EXISTS public.pay_applications');
      expect(sql0014).toContain('CREATE TABLE IF NOT EXISTS public.tm_tickets');
    });
  });
});
