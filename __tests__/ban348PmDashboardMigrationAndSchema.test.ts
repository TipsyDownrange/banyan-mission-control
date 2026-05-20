/**
 * BAN-348 PM-V1.0-I — Migration + Drizzle schema shape checks.
 */

import fs from 'fs';
import path from 'path';

import { user_dashboard_layouts, userDashboardKindEnum } from '@/db';

describe('BAN-348 migration 0028 file shape', () => {
  const migrationPath = path.join(
    process.cwd(),
    'db/migrations/0028_ban348_user_dashboard_layouts.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('exists at the expected next-sequential path', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('creates the user_dashboard_layouts table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.user_dashboard_layouts/);
  });

  it('declares the canonical columns', () => {
    expect(sql).toMatch(/layout_id\s+uuid\s+PRIMARY KEY/);
    expect(sql).toMatch(/tenant_id\s+uuid\s+NOT NULL\s+REFERENCES public\.tenants/);
    expect(sql).toMatch(/user_id\s+uuid\s+NOT NULL\s+REFERENCES public\.users/);
    expect(sql).toMatch(/dashboard_kind\s+text\s+NOT NULL/);
    expect(sql).toMatch(/layout_data\s+jsonb/);
    expect(sql).toMatch(/visible_widgets\s+text\[\]/);
    expect(sql).toMatch(/last_modified\s+timestamptz/);
  });

  it('enforces the dashboard_kind CHECK constraint', () => {
    expect(sql).toMatch(/dashboard_kind IN \('PM_OVERVIEW','SERVICE_PM_OVERVIEW','GM_OVERVIEW'\)/);
  });

  it('enforces the layout_data jsonb-object CHECK constraint', () => {
    expect(sql).toMatch(/jsonb_typeof\(layout_data\) = 'object'/);
  });

  it('creates the (user_id, dashboard_kind) unique index', () => {
    expect(sql).toMatch(/UNIQUE INDEX IF NOT EXISTS user_dashboard_layouts_user_kind_uidx/);
  });

  it('uses no destructive DROP TABLE statements', () => {
    expect(sql).not.toMatch(/DROP TABLE/);
  });
});

describe('BAN-348 Drizzle schema parity', () => {
  it('user_dashboard_layouts table is exported from @/db', () => {
    expect(user_dashboard_layouts).toBeDefined();
  });

  it('exposes all migration columns on the Drizzle table', () => {
    const columnNames = Object.keys(user_dashboard_layouts).sort();
    for (const col of [
      'layout_id',
      'tenant_id',
      'user_id',
      'dashboard_kind',
      'layout_data',
      'visible_widgets',
      'last_modified',
      'created_at',
    ]) {
      expect(columnNames).toContain(col);
    }
  });

  it('userDashboardKindEnum mirrors the migration CHECK list', () => {
    expect(userDashboardKindEnum).toEqual(['PM_OVERVIEW', 'SERVICE_PM_OVERVIEW', 'GM_OVERVIEW']);
  });
});

describe('BAN-348 migration sequence integrity', () => {
  const dir = path.join(process.cwd(), 'db/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  it('0028 ban348 migration file is present in the sequence', () => {
    const ban348Files = files.filter((f) => f.startsWith('0028_') && f.includes('ban348'));
    expect(ban348Files.length).toBe(1);
  });

  it('does not collide with another migration prefix', () => {
    const conflicts = files.filter((f) => f.startsWith('0028_') && !f.includes('ban348'));
    expect(conflicts).toEqual([]);
  });
});
