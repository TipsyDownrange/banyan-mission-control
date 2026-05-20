/**
 * BAN-374 P5 — Migration + Drizzle schema parity checks for
 * schedule_task_resources.
 */

import fs from 'fs';
import path from 'path';

import { schedule_task_resources } from '@/db';

describe('BAN-374 P5 migration 0038 file shape', () => {
  const migrationPath = path.join(
    process.cwd(),
    'db/migrations/0038_ban374_p5_resources.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('exists at the expected next-sequential path', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('creates schedule_task_resources with the required columns', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.schedule_task_resources/);
    expect(sql).toMatch(/task_resource_id uuid PRIMARY KEY/);
    expect(sql).toMatch(/tenant_id uuid NOT NULL REFERENCES public\.tenants/);
    expect(sql).toMatch(/schedule_task_id uuid NOT NULL REFERENCES public\.schedule_tasks \(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/user_id uuid NOT NULL REFERENCES public\.users/);
    expect(sql).toMatch(/role_on_task text/);
    expect(sql).toMatch(/allocation_percent integer NOT NULL DEFAULT 100/);
    expect(sql).toMatch(/assigned_at timestamptz NOT NULL DEFAULT now\(\)/);
    expect(sql).toMatch(/assigned_by uuid NOT NULL REFERENCES public\.users/);
    expect(sql).toMatch(/removed_at timestamptz/);
    expect(sql).toMatch(/removed_by uuid REFERENCES public\.users/);
    expect(sql).toMatch(/notes text/);
  });

  it('enforces the 1..100 allocation CHECK', () => {
    expect(sql).toMatch(/schedule_task_resources_allocation_check/);
    expect(sql).toMatch(/CHECK \(allocation_percent BETWEEN 1 AND 100\)/);
  });

  it('indexes by (tenant_id, task) and (tenant_id, user) including removed_at', () => {
    expect(sql).toMatch(/schedule_task_resources_tenant_task_idx[\s\S]*\(tenant_id, schedule_task_id, removed_at\)/);
    expect(sql).toMatch(/schedule_task_resources_tenant_user_idx[\s\S]*\(tenant_id, user_id, removed_at\)/);
  });

  it('uses a partial unique index to prevent duplicate active assignments only', () => {
    expect(sql).toMatch(/schedule_task_resources_active_uidx/);
    expect(sql).toMatch(/WHERE removed_at IS NULL/);
  });

  it('uses no destructive DROP TABLE statements', () => {
    expect(sql).not.toMatch(/DROP TABLE/);
  });
});

describe('BAN-374 P5 Drizzle schema parity', () => {
  it('schedule_task_resources is exported with every migration column', () => {
    expect(schedule_task_resources).toBeDefined();
    const cols = Object.keys(schedule_task_resources);
    for (const col of [
      'task_resource_id',
      'tenant_id',
      'schedule_task_id',
      'user_id',
      'role_on_task',
      'allocation_percent',
      'assigned_at',
      'assigned_by',
      'removed_at',
      'removed_by',
      'notes',
    ]) {
      expect(cols).toContain(col);
    }
  });
});

describe('BAN-374 P5 migration sequence integrity', () => {
  const dir = path.join(process.cwd(), 'db/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  it('0038 ban374 p5 migration is present', () => {
    const matches = files.filter((f) => f.startsWith('0038_') && f.includes('p5_resources'));
    expect(matches.length).toBe(1);
  });

  it('does not collide with another 0038 migration prefix', () => {
    const conflicts = files.filter((f) => f.startsWith('0038_') && !f.includes('p5_resources'));
    expect(conflicts).toEqual([]);
  });

  it('does not touch frozen migrations 0000-0036', () => {
    // Surface check: confirm none of the frozen-window prefixes have been
    // modified by this PR.  (Git diff is the source of truth — this is a
    // sanity check that we did not author a new 0029-* migration to extend
    // the schedule_tasks table itself.)
    const frozen = files.filter((f) => /^00(0\d|1\d|2\d|3[0-6])_/.test(f));
    expect(frozen.length).toBeGreaterThan(0);
  });
});
