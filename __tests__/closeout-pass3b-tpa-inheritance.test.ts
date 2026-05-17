import fs from 'fs';
import path from 'path';

const enumSql = fs.readFileSync(path.join(process.cwd(), 'db/migrations/0015_pass3b_closeout_v11_enums.sql'), 'utf8');
const entitySql = fs.readFileSync(path.join(process.cwd(), 'db/migrations/0016_pass3b_closeout_v11_entities.sql'), 'utf8');
const schemaTs = fs.readFileSync(path.join(process.cwd(), 'db/schema.ts'), 'utf8');

const CLOSEOUT_TABLES_FK_ENGAGEMENT = [
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

describe('BAN-304 Pass 3b — TPA inheritance + D2 test-project gating', () => {
  describe('D2 — inheritance via engagements FK (no per-row test_data on parent entities)', () => {
    it.each(
      CLOSEOUT_TABLES_FK_ENGAGEMENT.filter((t) => t !== 'gold_dataset_entries'),
    )('table %s has no test_data or is_test_project column (inherits via FK)', (table) => {
      const tableStart = entitySql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
      const tableEnd = entitySql.indexOf(');', tableStart);
      const body = entitySql.slice(tableStart, tableEnd);
      expect(body).not.toMatch(/\btest_data\b/);
      expect(body).not.toMatch(/\bis_test_project\b/);
    });

    it('gold_dataset_entries is the only documented D2 carve-out — has test_project column', () => {
      const tableStart = entitySql.indexOf('CREATE TABLE IF NOT EXISTS public.gold_dataset_entries');
      const tableEnd = entitySql.indexOf(');', tableStart);
      const body = entitySql.slice(tableStart, tableEnd);
      expect(body).toMatch(/test_project boolean NOT NULL DEFAULT false/);
    });

    it('gold_dataset_entries.test_project has a documenting comment referencing D2', () => {
      expect(entitySql).toContain('COMMENT ON COLUMN public.gold_dataset_entries.test_project');
      expect(entitySql).toContain('BAN-304 D2');
    });
  });

  describe('D3 — partial production-default index on the denormalised flag', () => {
    it('gold_dataset_entries carries production-default partial index WHERE test_project = false', () => {
      expect(entitySql).toContain('CREATE INDEX IF NOT EXISTS gold_dataset_entries_production_default_idx');
      expect(entitySql).toMatch(/WHERE test_project = false/);
    });

    it('matches the BAN-293 / BAN-302 partial-index naming convention', () => {
      expect(entitySql).toMatch(/gold_dataset_entries_production_default_idx/);
    });
  });

  describe('Drizzle schema.ts shape parity with migrations 0015 + 0016', () => {
    it.each(CLOSEOUT_TABLES_FK_ENGAGEMENT)('schema.ts declares pgTable %s', (table) => {
      expect(schemaTs).toContain(`export const ${table} = pgTable('${table}'`);
    });

    it('declares all 10 Closeout pgEnum types', () => {
      const enumExports = [
        "projectLifecycleStateEnum = pgEnum('project_lifecycle_state'",
        "punchListItemSourceEnum = pgEnum('punch_list_item_source'",
        "punchListItemCategoryEnum = pgEnum('punch_list_item_category'",
        "punchListResponsiblePartyEnum = pgEnum('punch_list_responsible_party'",
        "punchListItemStatusEnum = pgEnum('punch_list_item_status'",
        "warrantyStatusEnum = pgEnum('warranty_status'",
        "warrantyClaimInboundSourceEnum = pgEnum('warranty_claim_inbound_source'",
        "warrantyClaimTriageResultEnum = pgEnum('warranty_claim_triage_result'",
        "warrantyClaimResolutionEnum = pgEnum('warranty_claim_resolution'",
        "deliverableTypeEnum = pgEnum('deliverable_type'",
      ];
      for (const decl of enumExports) {
        expect(schemaTs).toContain(decl);
      }
    });

    it('Drizzle gold_dataset_entries has matching production-default partial index', () => {
      expect(schemaTs).toContain('gold_dataset_entries_production_default_idx');
      expect(schemaTs).toMatch(/test_project.*=.*false/);
    });

    it('does not modify the existing engagements pgTable declaration (D1)', () => {
      const engagementsDecl = schemaTs.match(/export const engagements = pgTable\('engagements'/);
      expect(engagementsDecl).not.toBeNull();
      const engagementsBlock = schemaTs.split("export const engagements = pgTable('engagements'")[1].split('export const ')[0];
      expect(engagementsBlock).toContain('is_test_project');
      expect(engagementsBlock).toContain('test_project_created_by');
      expect(engagementsBlock).toContain('test_project_purpose');
    });
  });

  describe('D1 — no modifications to protected tables', () => {
    it('0015 enums migration does not alter or recreate field_events / engagements (DDL only)', () => {
      const enumNoComments = enumSql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
      expect(enumNoComments).not.toMatch(/field_events/);
      expect(enumNoComments).not.toMatch(/ALTER TABLE public\.engagements/);
      expect(enumNoComments).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.engagements/);
    });

    it('0016 entities migration does not alter the engagements table', () => {
      const noComments = entitySql.replace(/--.*$/gm, '');
      expect(noComments).not.toMatch(/ALTER TABLE public\.engagements/);
      expect(noComments).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.engagements\b/);
    });

    it('0016 entities migration does not alter field_events', () => {
      const noComments = entitySql.replace(/--.*$/gm, '');
      expect(noComments).not.toMatch(/field_events/);
    });

    it('0016 does not modify any AIA Pass 3a tables (0014 frozen)', () => {
      const aiaTables = [
        'sov_versions',
        'schedule_of_values',
        'pay_applications',
        'pay_app_line_items',
        'pay_app_states',
        'notarization_sessions',
        'lien_waivers',
        'cash_receipts',
        'retainage_holdings',
        'handoff_validations',
        'tm_tickets',
        'tm_authorizations',
        'textura_submissions',
        'billing_format_config',
        'deposit_terms',
      ];
      for (const table of aiaTables) {
        expect(entitySql).not.toMatch(new RegExp(`ALTER TABLE public\\.${table}\\b`));
        expect(entitySql).not.toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`));
      }
    });
  });
});
