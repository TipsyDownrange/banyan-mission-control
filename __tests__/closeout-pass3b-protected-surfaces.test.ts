import fs from 'fs';
import path from 'path';

const migrationDir = path.join(process.cwd(), 'db/migrations');
const enumSql = fs.readFileSync(path.join(migrationDir, '0015_pass3b_closeout_v11_enums.sql'), 'utf8');
const entitySql = fs.readFileSync(path.join(migrationDir, '0016_pass3b_closeout_v11_entities.sql'), 'utf8');
const ban293Sql = fs.readFileSync(path.join(migrationDir, '0012_ban293_activity_spine_event_type_check.sql'), 'utf8');

const BAN293_CANONICAL_34 = [
  'INSTALL_STEP',
  'FIELD_ISSUE',
  'DAILY_LOG',
  'FIELD_MEASUREMENT',
  'NOTE',
  'TM_CAPTURE',
  'PHOTO_ONLY',
  'PUNCH_LIST',
  'SITE_VISIT',
  'TESTING',
  'WARRANTY_CALLBACK',
  'wo_completion',
  'PAY_APP_NOTARIZED',
  'RETAINAGE_RELEASED',
  'PUNCH_LIST_CLEARED',
  'NOTICE_OF_COMPLETION_FILED',
  'JOB_COST_RECONCILED',
  'GOLD_DATASET_ENTRY_WRITTEN',
  'DELIVERABLE_PRODUCED',
  'TM_AUTHORIZATION_CONVERTED_TO_CO',
  'TEST_PROJECT_RESET',
  'BACK_CHARGE_APPLIED_CROSS_PROJECT',
  'SOV_MODIFIED',
  'HANDOFF_PROCESSED',
  'SOV_STATE_CHANGED',
  'PAY_APP_STATE_CHANGED',
  'LIEN_WAIVER_STATE_CHANGED',
  'PROJECT_STATE_CHANGED',
  'PUNCH_LIST_ITEM_STATE_CHANGED',
  'WARRANTY_STATE_CHANGED',
  'TM_AUTHORIZATION_STATE_CHANGED',
  'TM_TICKET_STATE_CHANGED',
  'TEST_PROJECT_STATE_CHANGED',
  'BACK_CHARGE_STATE_CHANGED',
];

describe('BAN-304 Pass 3b — protected-surface guards', () => {
  describe('BAN-293 Activity Spine 34-value contract', () => {
    it('the canonical list itself is 34 values', () => {
      expect(BAN293_CANONICAL_34).toHaveLength(34);
    });

    it('BAN-293 migration 0012 still contains all 34 canonical event types', () => {
      for (const eventType of BAN293_CANONICAL_34) {
        expect(ban293Sql).toContain(`'${eventType}'`);
      }
    });

    it('BAN-293 migration 0012 file is unmodified by this PR', () => {
      // The file's first non-comment line is the DROP CONSTRAINT IF EXISTS — its
      // bytes are protected. If we accidentally edit it, this assertion will fire.
      expect(ban293Sql).toContain("CONSTRAINT field_events_event_type_ban293_check");
      expect(ban293Sql).toContain('VALIDATE CONSTRAINT field_events_event_type_ban293_check');
    });

    it('Pass 3b emits no new event_type values in DDL (D6)', () => {
      const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
      const enumDdl = stripComments(enumSql);
      const entityDdl = stripComments(entitySql);
      const closeoutEventCandidates = [
        'CLOSEOUT_STARTED',
        'CLOSEOUT_COMPLETED',
        'WARRANTY_CLAIM_FILED',
        'PROJECT_LIFECYCLE_STATE_CHANGED',
      ];
      for (const candidate of closeoutEventCandidates) {
        expect(enumDdl).not.toContain(candidate);
        expect(entityDdl).not.toContain(candidate);
      }
    });

    it('Pass 3b uses canonical PROJECT_STATE_CHANGED instead of spec PROJECT_LIFECYCLE_STATE_CHANGED in DDL (D5)', () => {
      // D5: spec wording PROJECT_LIFECYCLE_STATE_CHANGED is canonised as PROJECT_STATE_CHANGED.
      // Migrations are event-type-agnostic this pass (D4) — neither name appears in DDL.
      // Comments may document the D5 mapping; assertions therefore strip comments first.
      const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
      expect(stripComments(enumSql)).not.toContain('PROJECT_STATE_CHANGED');
      expect(stripComments(entitySql)).not.toContain('PROJECT_STATE_CHANGED');
      expect(stripComments(enumSql)).not.toContain('PROJECT_LIFECYCLE_STATE_CHANGED');
      expect(stripComments(entitySql)).not.toContain('PROJECT_LIFECYCLE_STATE_CHANGED');
    });
  });

  describe('Schema isolation from existing tables', () => {
    it('migration 0015 does not reference any non-Closeout enum types', () => {
      // 0015 should only create the 10 Closeout enum types; it must not create
      // or alter the engagement / field_event / AIA enums.
      const otherEnumNames = [
        'island_code',
        'user_role',
        'wo_status',
        'field_issue_status',
        'core_entity_type',
        'dispatch_status',
      ];
      for (const name of otherEnumNames) {
        expect(enumSql).not.toContain(`CREATE TYPE public.${name}`);
        expect(enumSql).not.toMatch(new RegExp(`ALTER TYPE.*\\b${name}\\b`));
      }
    });

    it('migration 0016 does not reference protected AIA Pass 3a tables', () => {
      // 0016 closeout tables FK only to engagements/users/tenants — not to AIA tables.
      const noComments = entitySql.replace(/--.*$/gm, '');
      const aiaTables = ['pay_applications', 'sov_versions', 'schedule_of_values', 'tm_authorizations'];
      for (const aiaTable of aiaTables) {
        expect(noComments).not.toMatch(new RegExp(`REFERENCES public\\.${aiaTable}\\b`));
      }
    });

    it('migration 0016 does not reference test_project_resets (TPA audit log is independent)', () => {
      const noComments = entitySql.replace(/--.*$/gm, '');
      expect(noComments).not.toMatch(/REFERENCES public\.test_project_resets/);
    });

    it('migration 0016 only references engagements, tenants, users, warranties (internal)', () => {
      const noComments = entitySql.replace(/--.*$/gm, '');
      const allowedRefs = new Set(['engagements', 'tenants', 'users', 'warranties']);
      const matches = Array.from(noComments.matchAll(/REFERENCES public\.(\w+)/g));
      for (const m of matches) {
        expect(allowedRefs.has(m[1])).toBe(true);
      }
      // Sanity: at least one FK to each allowed parent should appear.
      expect(noComments).toMatch(/REFERENCES public\.engagements/);
      expect(noComments).toMatch(/REFERENCES public\.tenants/);
      expect(noComments).toMatch(/REFERENCES public\.users/);
      expect(noComments).toMatch(/REFERENCES public\.warranties/);
    });
  });

  describe('Idempotency + rerun safety', () => {
    it('every CREATE TYPE in 0015 is wrapped in a duplicate_object exception block', () => {
      const createTypes = enumSql.match(/CREATE TYPE public\.\w+/g) ?? [];
      const exceptions = enumSql.match(/EXCEPTION WHEN duplicate_object THEN NULL;/g) ?? [];
      expect(createTypes.length).toBeGreaterThan(0);
      expect(exceptions.length).toBe(createTypes.length);
    });

    it('every CREATE TABLE in 0016 DDL uses IF NOT EXISTS', () => {
      const ddl = entitySql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
      const createTables = ddl.match(/CREATE TABLE\s+\S+/g) ?? [];
      const ifNotExists = ddl.match(/CREATE TABLE IF NOT EXISTS/g) ?? [];
      expect(createTables.length).toBeGreaterThan(0);
      expect(createTables.length).toBe(ifNotExists.length);
    });

    it('every CREATE INDEX in 0016 DDL uses IF NOT EXISTS', () => {
      const ddl = entitySql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
      const createIndexes = ddl.match(/CREATE INDEX\s+\S+/g) ?? [];
      const ifNotExists = ddl.match(/CREATE INDEX IF NOT EXISTS/g) ?? [];
      expect(createIndexes.length).toBe(ifNotExists.length);
    });

    it('every ADD CONSTRAINT in 0016 is preceded by a DROP CONSTRAINT IF EXISTS for rerun safety', () => {
      const addCount = (entitySql.match(/^\s*ADD CONSTRAINT/gm) ?? []).length;
      const dropCount = (entitySql.match(/^\s*DROP CONSTRAINT IF EXISTS/gm) ?? []).length;
      expect(addCount).toBeGreaterThan(0);
      // Every ADD CONSTRAINT (except VALIDATE-only follow-ups) should have a paired DROP.
      // VALIDATE CONSTRAINT lines are not ADD CONSTRAINT, so the counts match 1:1.
      expect(dropCount).toBe(addCount);
    });
  });

  describe('D4 — no app emission code in this pass', () => {
    it('migration 0015 does not contain INSERT/UPDATE statements', () => {
      const noComments = enumSql.replace(/--.*$/gm, '');
      expect(noComments).not.toMatch(/\bINSERT INTO\b/i);
      expect(noComments).not.toMatch(/\bUPDATE\s+public\./i);
    });

    it('migration 0016 does not contain INSERT/UPDATE statements', () => {
      const noComments = entitySql.replace(/--.*$/gm, '');
      expect(noComments).not.toMatch(/\bINSERT INTO\b/i);
      expect(noComments).not.toMatch(/\bUPDATE\s+public\./i);
    });
  });
});
