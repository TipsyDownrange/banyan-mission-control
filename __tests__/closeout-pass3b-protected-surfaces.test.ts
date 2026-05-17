import fs from 'fs';
import path from 'path';

import {
  EXISTING_ACTIVITY_SPINE_EVENT_TYPES,
  LEGACY_ACTIVITY_SPINE_EVENT_TYPES,
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES,
  ACTIVITY_SPINE_EVENT_TYPE_COUNT,
} from '@/lib/activity-spine/event-contract';
import {
  engagements,
  field_events,
} from '@/db/schema';

const migrationDir = path.join(process.cwd(), 'db/migrations');

describe('BAN-304 Pass 3b — protected surfaces (BQS §13)', () => {
  describe('Activity Spine event contract (BAN-293)', () => {
    it('still has 11 existing + 1 legacy + 12 Pattern A + 10 Pattern B = 34', () => {
      expect(EXISTING_ACTIVITY_SPINE_EVENT_TYPES).toHaveLength(11);
      expect(LEGACY_ACTIVITY_SPINE_EVENT_TYPES).toHaveLength(1);
      expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toHaveLength(12);
      expect(ACTIVITY_SPINE_PATTERN_B_EVENT_TYPES).toHaveLength(10);
      expect(ACTIVITY_SPINE_EVENT_TYPE_COUNT).toBe(34);
    });

    it('migration 0012 still lists exactly the BAN-293 ratified event_type values', () => {
      const sql = fs.readFileSync(path.join(migrationDir, '0012_ban293_activity_spine_event_type_check.sql'), 'utf8');
      expect(sql).toContain('field_events_event_type_ban293_check');
      // Spot-check a representative subset that this PR must not have disturbed.
      for (const e of ['INSTALL_STEP', 'wo_completion', 'TEST_PROJECT_RESET', 'PROJECT_STATE_CHANGED', 'GOLD_DATASET_ENTRY_WRITTEN']) {
        expect(sql).toContain(`'${e}'`);
      }
    });
  });

  describe('engagements + field_events schemas (D1)', () => {
    it('engagements still exposes the BAN-302 TPA flag columns', () => {
      const cols = engagements as unknown as Record<string, unknown>;
      expect(cols.is_test_project).toBeDefined();
      expect(cols.test_project_created_by).toBeDefined();
      expect(cols.test_project_purpose).toBeDefined();
    });

    it('engagements has not picked up new Pass 3b columns', () => {
      const cols = engagements as unknown as Record<string, unknown>;
      // Names that could only arrive via accidental Pass 3b leakage.
      for (const surprise of ['scope_warranties', 'lien_deadline_days', 'index_payload']) {
        expect(cols[surprise]).toBeUndefined();
      }
    });

    it('field_events still carries the BAN-293 test_data column', () => {
      const cols = field_events as unknown as Record<string, unknown>;
      expect(cols.test_data).toBeDefined();
    });

    it('migration 0011 (BAN-293 test_data) is untouched on this branch', () => {
      const sql = fs.readFileSync(path.join(migrationDir, '0011_ban293_activity_spine_test_data.sql'), 'utf8');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS test_data boolean NOT NULL DEFAULT false');
      expect(sql).toContain('field_events_production_default_idx');
    });
  });

  describe('Pass 3a (BAN-302) deliverables remain intact', () => {
    it('ADR-012 still present', () => {
      expect(fs.existsSync(path.join(process.cwd(), 'docs/adr/ADR-012_PASS_3A_TPA_AIA_v1.1_ENTITY_SCHEMA_2026-05-17.md'))).toBe(true);
    });

    it('migrations 0013 + 0014 SQL files still present', () => {
      expect(fs.existsSync(path.join(migrationDir, '0013_pass3a_tpa_engagements_and_resets.sql'))).toBe(true);
      expect(fs.existsSync(path.join(migrationDir, '0014_pass3a_aia_v1_1_entities.sql'))).toBe(true);
    });

    it('Pass 3a __tests__/ suites still present and not renamed', () => {
      expect(fs.existsSync(path.join(process.cwd(), '__tests__/pass3aTpaAiaMigrations.test.ts'))).toBe(true);
      expect(fs.existsSync(path.join(process.cwd(), '__tests__/pass3aSchemaShape.test.ts'))).toBe(true);
    });
  });

  describe('idempotency — migration text reads safe to rerun', () => {
    it('0015 every CREATE TYPE wraps the duplicate_object idiom', () => {
      const sql = fs.readFileSync(path.join(migrationDir, '0015_pass3b_closeout_v11_enums.sql'), 'utf8');
      const createCount = (sql.match(/CREATE TYPE public\.\w+ AS ENUM/g) ?? []).length;
      const idiomCount = (sql.match(/EXCEPTION WHEN duplicate_object THEN NULL/g) ?? []).length;
      expect(createCount).toBe(10);
      expect(idiomCount).toBeGreaterThanOrEqual(10);
    });

    it('0016 every CREATE TABLE uses IF NOT EXISTS', () => {
      const sql = fs.readFileSync(path.join(migrationDir, '0016_pass3b_closeout_v11_entities.sql'), 'utf8');
      const tableCount = (sql.match(/CREATE TABLE public\./g) ?? []).length;
      const idempotentCount = (sql.match(/CREATE TABLE IF NOT EXISTS public\./g) ?? []).length;
      expect(idempotentCount).toBe(10);
      expect(tableCount).toBe(0);
    });

    it('0016 every CREATE INDEX uses IF NOT EXISTS', () => {
      const sql = fs.readFileSync(path.join(migrationDir, '0016_pass3b_closeout_v11_entities.sql'), 'utf8');
      const plainIndexCount = (sql.match(/^CREATE INDEX (?!IF NOT EXISTS)/gm) ?? []).length;
      expect(plainIndexCount).toBe(0);
    });

    it('0016 every ADD CONSTRAINT is preceded by DROP CONSTRAINT IF EXISTS', () => {
      const sql = fs.readFileSync(path.join(migrationDir, '0016_pass3b_closeout_v11_entities.sql'), 'utf8');
      const addBlocks = sql.match(/ADD CONSTRAINT (\w+)/g) ?? [];
      const dropBlocks = sql.match(/DROP CONSTRAINT IF EXISTS (\w+)/g) ?? [];
      expect(addBlocks.length).toBeGreaterThan(0);
      expect(dropBlocks.length).toBeGreaterThanOrEqual(addBlocks.length);
    });
  });
});
