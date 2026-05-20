/**
 * BAN-375 Closeout v1.1.1 Phase 1 — migration content tests.
 *
 * Verifies migrations 0029-0032 ship the expected DDL, in the additive shape
 * (no destructive ops on the BAN-304 / 0015-0016 surfaces).
 */

import fs from 'fs';
import path from 'path';

function readMigration(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'db/migrations', name), 'utf8');
}

const sql0029 = readMigration('0029_closeout_v111_subs_walks_history.sql');
const sql0030 = readMigration('0030_closeout_v111_punch_trade_enum.sql');
const sql0031 = readMigration('0031_closeout_v111_punch_list_items_alters.sql');
const sql0032 = readMigration('0032_closeout_v111_punch_status_waived.sql');

describe('Migration 0029 — subcontractors / punch_walks / punch_list_item_history', () => {
  it('creates subcontractors table idempotently', () => {
    expect(sql0029).toContain('CREATE TABLE IF NOT EXISTS public.subcontractors');
  });

  it('creates punch_walks table idempotently', () => {
    expect(sql0029).toContain('CREATE TABLE IF NOT EXISTS public.punch_walks');
  });

  it('creates punch_list_item_history table idempotently', () => {
    expect(sql0029).toContain('CREATE TABLE IF NOT EXISTS public.punch_list_item_history');
  });

  it('locks subcontractors.trade to framer + waterproofer only (Sean directive)', () => {
    expect(sql0029).toMatch(/subcontractors_trade_check[\s\S]*?CHECK \(trade IN \('framer','waterproofer'\)\)/);
  });

  it('constrains punch_walks.type to the 7 ratified walk types', () => {
    expect(sql0029).toMatch(/punch_walks_type_check/);
    expect(sql0029).toContain("'initial'");
    expect(sql0029).toContain("'reinspection'");
    expect(sql0029).toContain("'substantial_completion'");
    expect(sql0029).toContain("'owner_walkthrough'");
    expect(sql0029).toContain("'architect'");
    expect(sql0029).toContain("'final'");
    expect(sql0029).toContain("'internal_qa'");
  });

  it('constrains punch_walks.status to in_progress | complete', () => {
    expect(sql0029).toMatch(/punch_walks_status_check[\s\S]*?CHECK \(status IN \('in_progress','complete'\)\)/);
  });

  it('punch_list_item_history.punch_item_id is nullable + ON DELETE SET NULL', () => {
    // Codex P1 (PR #209): a CASCADE FK would wipe the just-written
    // 'hard_deleted' audit row when the parent punch item is hard-deleted,
    // defeating the audit-trail intent. SET NULL preserves the row.
    expect(sql0029).toMatch(/punch_item_id uuid REFERENCES public\.punch_list_items \(punch_item_id\) ON DELETE SET NULL/);
    // Must NOT be NOT NULL — that would block the post-delete orphan state.
    expect(sql0029).not.toMatch(/punch_item_id uuid NOT NULL REFERENCES public\.punch_list_items/);
  });

  it('punch_list_item_history.action CHECK lists the 10 ratified actions', () => {
    const expectedActions = [
      'created', 'status_changed', 'assigned', 'completed', 'signed_off',
      'disputed', 'waived', 'hard_deleted', 'reopened', 'photo_added',
    ];
    for (const a of expectedActions) {
      expect(sql0029).toContain(`'${a}'`);
    }
  });

  it('all three tables FK to tenants', () => {
    const tables = ['subcontractors', 'punch_walks', 'punch_list_item_history'];
    for (const t of tables) {
      const start = sql0029.indexOf(`CREATE TABLE IF NOT EXISTS public.${t}`);
      const end = sql0029.indexOf(');', start);
      const body = sql0029.slice(start, end);
      expect(body).toMatch(/tenant_id uuid NOT NULL REFERENCES public\.tenants \(tenant_id\)/);
    }
  });

  it('punch_walks + subcontractors carry created_at / updated_at infra columns', () => {
    for (const t of ['subcontractors', 'punch_walks']) {
      const start = sql0029.indexOf(`CREATE TABLE IF NOT EXISTS public.${t}`);
      const end = sql0029.indexOf(');', start);
      const body = sql0029.slice(start, end);
      expect(body).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/);
      expect(body).toMatch(/updated_at timestamptz NOT NULL DEFAULT now\(\)/);
    }
  });

  it('does not modify BAN-293 protected surfaces (field_events)', () => {
    const noComments = sql0029.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
    expect(noComments).not.toMatch(/field_events/);
    expect(noComments).not.toMatch(/event_type/);
  });
});

describe('Migration 0030 — punch_trade enum', () => {
  it('creates punch_trade enum idempotently via DO block', () => {
    expect(sql0030).toMatch(/DO \$\$ BEGIN[\s\S]*?CREATE TYPE public\.punch_trade AS ENUM/);
    expect(sql0030).toMatch(/EXCEPTION WHEN duplicate_object THEN NULL/);
  });

  it('declares the 10 ratified trade values (Sean delta 1)', () => {
    const expected = [
      'glazier', 'framer', 'waterproofer', 'electrician', 'plumber',
      'hvac', 'drywall', 'paint', 'cleaning', 'other',
    ];
    for (const v of expected) {
      expect(sql0030).toContain(`'${v}'`);
    }
  });

  it('is fully isolated — no DDL beyond the enum DO block', () => {
    expect(sql0030).not.toMatch(/ALTER TABLE/);
    expect(sql0030).not.toMatch(/CREATE TABLE/);
    expect(sql0030).not.toMatch(/DROP TABLE/);
  });
});

describe('Migration 0031 — punch_list_items ALTER ADD COLUMN', () => {
  const expectedColumns = [
    { name: 'trade', shape: /trade public\.punch_trade NOT NULL DEFAULT 'other'/ },
    { name: 'assigned_to_sub_id', shape: /assigned_to_sub_id uuid REFERENCES public\.subcontractors \(subcontractor_id\)/ },
    { name: 'walk_id', shape: /walk_id uuid REFERENCES public\.punch_walks \(walk_id\)/ },
    { name: 'waived_reason', shape: /waived_reason text/ },
  ];

  it.each(expectedColumns)('adds $name with the expected shape (idempotent)', ({ name, shape }) => {
    expect(sql0031).toContain(`ADD COLUMN IF NOT EXISTS ${name}`);
    expect(sql0031).toMatch(shape);
  });

  it('creates partial indexes on the nullable FK columns', () => {
    expect(sql0031).toMatch(/punch_list_items_sub_idx[\s\S]*?WHERE assigned_to_sub_id IS NOT NULL/);
    expect(sql0031).toMatch(/punch_list_items_walk_idx[\s\S]*?WHERE walk_id IS NOT NULL/);
  });

  it('creates a non-partial trade index', () => {
    expect(sql0031).toMatch(/punch_list_items_trade_idx[\s\S]*?ON public\.punch_list_items \(tenant_id, trade\)/);
  });

  it('does not modify the existing punch_list_items_engagement_number_uidx', () => {
    expect(sql0031).not.toContain('punch_list_items_engagement_number_uidx');
  });
});

describe('Migration 0032 — punch_list_item_status += WAIVED', () => {
  it('uses ALTER TYPE ADD VALUE IF NOT EXISTS (idempotent)', () => {
    expect(sql0032).toMatch(/ALTER TYPE public\.punch_list_item_status ADD VALUE IF NOT EXISTS 'WAIVED'/);
  });

  it('is fully isolated per the BAN-293 enum-extension rule', () => {
    expect(sql0032).not.toMatch(/CREATE TABLE/);
    expect(sql0032).not.toMatch(/ALTER TABLE/);
  });
});
