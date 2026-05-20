/**
 * BAN-374 Scheduling Spine — Migration + Drizzle schema shape checks.
 */

import fs from 'fs';
import path from 'path';

import {
  schedule_phases,
  schedule_tasks,
  schedule_dependencies,
  schedule_milestones,
  SCHEDULE_PHASE_STATUSES,
  SCHEDULE_TASK_STATUSES,
  SCHEDULE_DEPENDENCY_TYPES,
  SCHEDULE_MILESTONE_TYPES,
  SCHEDULE_MILESTONE_STATUSES,
} from '@/db';

describe('BAN-374 migration 0029 file shape', () => {
  const migrationPath = path.join(
    process.cwd(),
    'db/migrations/0029_ban374_scheduling_spine.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('exists at the expected next-sequential path', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('creates all four schedule_* tables', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.schedule_phases/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.schedule_tasks/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.schedule_dependencies/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.schedule_milestones/);
  });

  it('phases table declares canonical columns', () => {
    expect(sql).toMatch(/id\s+uuid\s+PRIMARY KEY/);
    expect(sql).toMatch(/tenant_id\s+uuid\s+NOT NULL\s+REFERENCES public\.tenants/);
    expect(sql).toMatch(/engagement_id\s+uuid\s+NOT NULL\s+REFERENCES public\.engagements/);
    expect(sql).toMatch(/name\s+text\s+NOT NULL/);
    expect(sql).toMatch(/sort_order\s+integer\s+NOT NULL\s+DEFAULT\s+0/);
  });

  it('tasks table enforces percent_complete range and status set', () => {
    expect(sql).toMatch(/schedule_tasks_percent_complete_check/);
    expect(sql).toMatch(/percent_complete\s+BETWEEN 0 AND 100/i);
    expect(sql).toMatch(/schedule_tasks_status_check/);
    expect(sql).toMatch(/'planned','in_progress','complete','blocked','on_hold'/);
  });

  it('dependencies table guards self-loops and edge uniqueness', () => {
    expect(sql).toMatch(/schedule_dependencies_not_self_loop/);
    expect(sql).toMatch(/predecessor_task_id\s+<>\s+successor_task_id/);
    expect(sql).toMatch(/UNIQUE INDEX IF NOT EXISTS schedule_dependencies_edge_uidx/);
  });

  it('dependency type CHECK matches the four standard relations', () => {
    expect(sql).toMatch(/'finish_to_start','start_to_start','finish_to_finish','start_to_finish'/);
  });

  it('milestone type CHECK includes all six canonical milestone types', () => {
    expect(sql).toMatch(/'substantial_completion','permit','inspection','owner_walkthrough','retainage_release','custom'/);
  });

  it('uses no destructive DROP TABLE statements', () => {
    expect(sql).not.toMatch(/DROP TABLE/);
  });

  it('cascades dependencies on task delete', () => {
    expect(sql).toMatch(/REFERENCES public\.schedule_tasks \(id\) ON DELETE CASCADE/);
  });

  it('cascades tasks/phases on phase/engagement delete', () => {
    expect(sql).toMatch(/REFERENCES public\.schedule_phases \(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/REFERENCES public\.engagements \(engagement_id\) ON DELETE CASCADE/);
  });
});

describe('BAN-374 Drizzle schema parity', () => {
  it('all four schedule tables are exported from @/db', () => {
    expect(schedule_phases).toBeDefined();
    expect(schedule_tasks).toBeDefined();
    expect(schedule_dependencies).toBeDefined();
    expect(schedule_milestones).toBeDefined();
  });

  it('schedule_phases exposes the migration columns', () => {
    const cols = Object.keys(schedule_phases).sort();
    for (const col of [
      'id', 'tenant_id', 'engagement_id', 'name', 'sort_order',
      'planned_start', 'planned_end', 'actual_start', 'actual_end', 'status',
      'created_at', 'updated_at',
    ]) {
      expect(cols).toContain(col);
    }
  });

  it('schedule_tasks exposes the migration columns', () => {
    const cols = Object.keys(schedule_tasks).sort();
    for (const col of [
      'id', 'tenant_id', 'phase_id', 'engagement_id', 'name', 'description',
      'sort_order', 'planned_start', 'planned_end', 'planned_duration_days',
      'actual_start', 'actual_end', 'percent_complete', 'status',
      'assigned_to_user_id', 'created_at', 'updated_at',
    ]) {
      expect(cols).toContain(col);
    }
  });

  it('schedule_dependencies exposes the migration columns', () => {
    const cols = Object.keys(schedule_dependencies).sort();
    for (const col of [
      'id', 'tenant_id', 'predecessor_task_id', 'successor_task_id',
      'type', 'lag_days', 'created_at',
    ]) {
      expect(cols).toContain(col);
    }
  });

  it('schedule_milestones exposes the migration columns', () => {
    const cols = Object.keys(schedule_milestones).sort();
    for (const col of [
      'id', 'tenant_id', 'engagement_id', 'name', 'type',
      'planned_date', 'actual_date', 'status',
      'created_at', 'updated_at',
    ]) {
      expect(cols).toContain(col);
    }
  });

  it('exported status/type constants match the migration CHECK lists', () => {
    expect(SCHEDULE_PHASE_STATUSES).toEqual(['planned', 'in_progress', 'complete', 'on_hold']);
    expect(SCHEDULE_TASK_STATUSES).toEqual(['planned', 'in_progress', 'complete', 'blocked', 'on_hold']);
    expect(SCHEDULE_DEPENDENCY_TYPES).toEqual(['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish']);
    expect(SCHEDULE_MILESTONE_TYPES).toEqual(['substantial_completion', 'permit', 'inspection', 'owner_walkthrough', 'retainage_release', 'custom']);
    expect(SCHEDULE_MILESTONE_STATUSES).toEqual(['pending', 'met', 'missed', 'waived']);
  });
});

describe('BAN-374 migration sequence integrity', () => {
  const dir = path.join(process.cwd(), 'db/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  it('0029 is the highest numbered migration', () => {
    const numbered = files
      .map((f) => /^(\d{4})_/.exec(f)?.[1])
      .filter((m): m is string => !!m)
      .sort();
    expect(numbered[numbered.length - 1]).toBe('0029');
  });

  it('does not collide with another migration prefix', () => {
    const conflicts = files.filter((f) => f.startsWith('0029_') && !f.includes('ban374'));
    expect(conflicts).toEqual([]);
  });
});
