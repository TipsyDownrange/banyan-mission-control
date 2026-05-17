import fs from 'fs';
import path from 'path';

const migrationPath = path.join(process.cwd(), 'db/migrations/0016_pass3b_closeout_v11_entities.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

function stripSqlComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
}

const sqlNoComments = stripSqlComments(sql);

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

describe('BAN-304 Pass 3b — migration 0016 entity tables', () => {
  it.each(CLOSEOUT_TABLES)('creates table %s idempotently', (table) => {
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
  });

  it('has exactly 10 Closeout CREATE TABLE statements', () => {
    const matches = sql.match(/CREATE TABLE IF NOT EXISTS public\.\w+/g) ?? [];
    expect(matches).toHaveLength(CLOSEOUT_TABLES.length);
  });

  it('orders parent tables before their dependents', () => {
    const idxOf = (t: string) => sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${t}`);
    expect(idxOf('warranties')).toBeLessThan(idxOf('warranty_claims'));
    expect(idxOf('project_lifecycle_states')).toBeLessThan(idxOf('punch_list_items'));
    expect(idxOf('project_lifecycle_states')).toBeLessThan(idxOf('deliverable_documents'));
  });

  it('every table FK-references public.engagements (engagement_id)', () => {
    for (const table of CLOSEOUT_TABLES) {
      const tableStart = sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(tableStart).toBeGreaterThan(-1);
      const tableEnd = sql.indexOf(');', tableStart);
      const body = sql.slice(tableStart, tableEnd);
      expect(body).toMatch(/engagement_id uuid NOT NULL REFERENCES public\.engagements \(engagement_id\)/);
    }
  });

  it('every table FK-references public.tenants (tenant_id)', () => {
    for (const table of CLOSEOUT_TABLES) {
      const tableStart = sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
      const tableEnd = sql.indexOf(');', tableStart);
      const body = sql.slice(tableStart, tableEnd);
      expect(body).toMatch(/tenant_id uuid NOT NULL REFERENCES public\.tenants \(tenant_id\)/);
    }
  });

  it('every table carries created_by, updated_by, created_at, updated_at (spec-locked infra columns)', () => {
    for (const table of CLOSEOUT_TABLES) {
      const tableStart = sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
      const tableEnd = sql.indexOf(');', tableStart);
      const body = sql.slice(tableStart, tableEnd);
      expect(body).toMatch(/created_by uuid REFERENCES public\.users \(user_id\)/);
      expect(body).toMatch(/updated_by uuid REFERENCES public\.users \(user_id\)/);
      expect(body).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/);
      expect(body).toMatch(/updated_at timestamptz NOT NULL DEFAULT now\(\)/);
    }
  });

  it('typed columns reference the 0015 enum types (not text)', () => {
    expect(sql).toContain('state public.project_lifecycle_state NOT NULL');
    expect(sql).toContain('source public.punch_list_item_source NOT NULL');
    expect(sql).toContain('category public.punch_list_item_category NOT NULL');
    expect(sql).toContain('responsible_party public.punch_list_responsible_party NOT NULL');
    expect(sql).toContain('status public.punch_list_item_status NOT NULL');
    expect(sql).toContain('status public.warranty_status NOT NULL');
    expect(sql).toContain('inbound_source public.warranty_claim_inbound_source NOT NULL');
    expect(sql).toContain('triage_result public.warranty_claim_triage_result');
    expect(sql).toContain('resolution public.warranty_claim_resolution');
    expect(sql).toContain('deliverable_type public.deliverable_type NOT NULL');
    expect(sql).toContain('required_for_state public.project_lifecycle_state');
  });

  it('project_lifecycle_states cascades on engagement delete (audit log pattern)', () => {
    const tableStart = sql.indexOf('CREATE TABLE IF NOT EXISTS public.project_lifecycle_states');
    const tableEnd = sql.indexOf(');', tableStart);
    const body = sql.slice(tableStart, tableEnd);
    expect(body).toMatch(/engagement_id uuid NOT NULL REFERENCES public\.engagements \(engagement_id\) ON DELETE CASCADE/);
  });

  it('warranty_claims cascades on warranty delete', () => {
    const tableStart = sql.indexOf('CREATE TABLE IF NOT EXISTS public.warranty_claims');
    const tableEnd = sql.indexOf(');', tableStart);
    const body = sql.slice(tableStart, tableEnd);
    expect(body).toMatch(/warranty_id uuid NOT NULL REFERENCES public\.warranties \(warranty_id\) ON DELETE CASCADE/);
  });

  it('project_search_indexes cascades on engagement delete', () => {
    const tableStart = sql.indexOf('CREATE TABLE IF NOT EXISTS public.project_search_indexes');
    const tableEnd = sql.indexOf(');', tableStart);
    const body = sql.slice(tableStart, tableEnd);
    expect(body).toMatch(/engagement_id uuid NOT NULL REFERENCES public\.engagements \(engagement_id\) ON DELETE CASCADE/);
  });

  it('warranty_claims.service_wo_id is text (no FK — ADR-026 Sheets boundary)', () => {
    const tableStart = sql.indexOf('CREATE TABLE IF NOT EXISTS public.warranty_claims');
    const tableEnd = sql.indexOf(');', tableStart);
    const body = sql.slice(tableStart, tableEnd);
    expect(body).toMatch(/service_wo_id text/);
    expect(body).not.toMatch(/service_wo_id uuid/);
  });

  it('warranty_claims.back_charge_id is uuid without REFERENCES (future Budget module)', () => {
    const tableStart = sql.indexOf('CREATE TABLE IF NOT EXISTS public.warranty_claims');
    const tableEnd = sql.indexOf(');', tableStart);
    const body = sql.slice(tableStart, tableEnd);
    expect(body).toMatch(/back_charge_id uuid,/);
    expect(body).not.toMatch(/back_charge_id uuid REFERENCES/);
  });

  it('notices_of_completion.lien_deadline_days defaults to 45 (HRS §507-43 statutory default)', () => {
    const tableStart = sql.indexOf('CREATE TABLE IF NOT EXISTS public.notices_of_completion');
    const tableEnd = sql.indexOf(');', tableStart);
    const body = sql.slice(tableStart, tableEnd);
    expect(body).toMatch(/lien_deadline_days integer NOT NULL DEFAULT 45/);
  });

  it('punch_list_items has tenant-scoped unique constraint on (tenant_id, engagement_id, item_number)', () => {
    expect(sql).toContain('ADD CONSTRAINT punch_list_items_engagement_number_uidx UNIQUE (tenant_id, engagement_id, item_number)');
  });

  it('substantial_completion_certs is unique per engagement', () => {
    expect(sql).toContain('ADD CONSTRAINT substantial_completion_certs_engagement_uidx UNIQUE (tenant_id, engagement_id)');
  });

  it('warranties is unique per engagement', () => {
    expect(sql).toContain('ADD CONSTRAINT warranties_engagement_uidx UNIQUE (tenant_id, engagement_id)');
  });

  it('notices_of_completion is unique per engagement', () => {
    expect(sql).toContain('ADD CONSTRAINT notices_of_completion_engagement_uidx UNIQUE (tenant_id, engagement_id)');
  });

  it('gold_dataset_entries is unique per engagement', () => {
    expect(sql).toContain('ADD CONSTRAINT gold_dataset_entries_engagement_uidx UNIQUE (tenant_id, engagement_id)');
  });

  it('project_search_indexes is unique per engagement', () => {
    expect(sql).toContain('ADD CONSTRAINT project_search_indexes_engagement_uidx UNIQUE (tenant_id, engagement_id)');
  });

  it('project_lifecycle_states.reopen_pair_check enforces both-or-neither reopen fields', () => {
    expect(sql).toContain('CHECK (');
    expect(sql).toMatch(/reopen_reason IS NULL AND reopen_by IS NULL/);
    expect(sql).toMatch(/reopen_reason IS NOT NULL AND reopen_by IS NOT NULL/);
    expect(sql).toContain('VALIDATE CONSTRAINT project_lifecycle_states_reopen_pair_check');
  });

  it('punch_list_items.photo_evidence is a text array default empty', () => {
    expect(sql).toContain("photo_evidence text[] NOT NULL DEFAULT ARRAY[]::text[]");
  });

  it('every Closeout table has an engagement-scoped index for the primary read path', () => {
    const expectedIndexes = [
      'project_lifecycle_states_engagement_idx',
      'punch_list_items_engagement_status_idx',
      'substantial_completion_certs_walkthrough_idx',
      'warranties_status_idx',
      'warranty_claims_engagement_idx',
      'notices_of_completion_lien_deadline_idx',
      'deliverable_documents_engagement_idx',
      'unified_job_packets_engagement_idx',
      'gold_dataset_entries_production_default_idx',
      'project_search_indexes_last_indexed_idx',
    ];
    for (const idx of expectedIndexes) {
      expect(sql).toContain(`CREATE INDEX IF NOT EXISTS ${idx}`);
    }
  });

  it('does not contain destructive statements against existing schema', () => {
    expect(sqlNoComments).not.toMatch(/DROP TABLE\b/i);
    expect(sqlNoComments).not.toMatch(/DELETE FROM\b/i);
    expect(sqlNoComments).not.toMatch(/TRUNCATE\b/i);
    expect(sqlNoComments).not.toMatch(/DROP COLUMN\b/i);
  });

  it('does not touch BAN-293 protected surfaces', () => {
    expect(sqlNoComments).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.field_events/);
    expect(sqlNoComments).not.toMatch(/field_events_event_type_ban293_check/);
    expect(sqlNoComments).not.toMatch(/ALTER TABLE public\.field_events/);
  });

  it('does not touch the engagements table (D1 — fully additive)', () => {
    expect(sqlNoComments).not.toMatch(/ALTER TABLE public\.engagements/);
    expect(sqlNoComments).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.engagements/);
  });

  it('does not introduce new event_type values (D6)', () => {
    expect(sqlNoComments).not.toMatch(/PROJECT_LIFECYCLE_STATE_CHANGED/);
    expect(sqlNoComments).not.toMatch(/event_type IN/);
  });
});
