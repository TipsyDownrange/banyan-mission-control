/**
 * BAN-374 P4 — Hawaii overlays migration + Drizzle schema parity checks.
 */

import fs from 'fs';
import path from 'path';

import {
  schedule_tasks,
  schedule_milestones,
  tenant_freight_calendar,
  SCHEDULE_MILESTONE_KINDS,
  SCHEDULE_TASK_ISLANDS,
} from '@/db';

describe('BAN-374 P4 migration 0037 file shape', () => {
  const migrationPath = path.join(
    process.cwd(),
    'db/migrations/0037_ban374_p4_hawaii_overlays.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('exists at the expected next-sequential path', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('adds task_island + duration_with_travel_factor to schedule_tasks', () => {
    expect(sql).toMatch(/ALTER TABLE public\.schedule_tasks[\s\S]*ADD COLUMN IF NOT EXISTS task_island text/);
    expect(sql).toMatch(/ALTER TABLE public\.schedule_tasks[\s\S]*ADD COLUMN IF NOT EXISTS duration_with_travel_factor numeric\(6,2\)/);
  });

  it('enforces task_island CHECK matching engagements island_code enum', () => {
    expect(sql).toMatch(/schedule_tasks_task_island_check/);
    expect(sql).toMatch(/'maui','kauai','oahu','big_island','lanai','molokai','unknown'/);
  });

  it('adds milestone_kind + permit_* columns to schedule_milestones', () => {
    expect(sql).toMatch(/ALTER TABLE public\.schedule_milestones[\s\S]*ADD COLUMN IF NOT EXISTS milestone_kind text NOT NULL DEFAULT 'standard'/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS permit_authority text/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS permit_application_date date/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS permit_estimated_approval_date date/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS permit_actual_approval_date date/);
  });

  it('enforces milestone_kind CHECK with all five canonical kinds', () => {
    expect(sql).toMatch(/schedule_milestones_kind_check/);
    expect(sql).toMatch(/'standard','permit','inspection','gc_clearance','matson_freight'/);
  });

  it('creates tenant_freight_calendar table with required columns', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.tenant_freight_calendar/);
    expect(sql).toMatch(/freight_calendar_id uuid PRIMARY KEY/);
    expect(sql).toMatch(/tenant_id uuid NOT NULL REFERENCES public\.tenants/);
    expect(sql).toMatch(/carrier text NOT NULL DEFAULT 'Matson'/);
    expect(sql).toMatch(/route text NOT NULL/);
    expect(sql).toMatch(/sailing_date date NOT NULL/);
    expect(sql).toMatch(/arrival_date date NOT NULL/);
    expect(sql).toMatch(/cutoff_date date NOT NULL/);
    expect(sql).toMatch(/deleted_at timestamptz/);
  });

  it('indexes tenant_freight_calendar for route + sailing date filters', () => {
    expect(sql).toMatch(/tenant_freight_calendar_tenant_route_idx/);
    expect(sql).toMatch(/tenant_freight_calendar_tenant_sailing_idx/);
  });

  it('uses no destructive DROP TABLE statements', () => {
    expect(sql).not.toMatch(/DROP TABLE/);
  });
});

describe('BAN-374 P4 Drizzle schema parity', () => {
  it('schedule_tasks exposes task_island + duration_with_travel_factor', () => {
    const cols = Object.keys(schedule_tasks);
    expect(cols).toContain('task_island');
    expect(cols).toContain('duration_with_travel_factor');
  });

  it('schedule_milestones exposes milestone_kind + permit_* columns', () => {
    const cols = Object.keys(schedule_milestones);
    for (const col of [
      'milestone_kind',
      'permit_authority',
      'permit_application_date',
      'permit_estimated_approval_date',
      'permit_actual_approval_date',
    ]) {
      expect(cols).toContain(col);
    }
  });

  it('tenant_freight_calendar is exported with all migration columns', () => {
    expect(tenant_freight_calendar).toBeDefined();
    const cols = Object.keys(tenant_freight_calendar);
    for (const col of [
      'freight_calendar_id', 'tenant_id', 'carrier', 'route',
      'sailing_date', 'arrival_date', 'cutoff_date', 'notes',
      'deleted_at', 'created_at', 'updated_at',
    ]) {
      expect(cols).toContain(col);
    }
  });

  it('exported milestone-kind + task-island constants match the migration CHECK lists', () => {
    expect(SCHEDULE_MILESTONE_KINDS).toEqual(['standard', 'permit', 'inspection', 'gc_clearance', 'matson_freight']);
    expect(SCHEDULE_TASK_ISLANDS).toEqual(['maui', 'kauai', 'oahu', 'big_island', 'lanai', 'molokai', 'unknown']);
  });
});

describe('BAN-374 P4 migration sequence integrity', () => {
  const dir = path.join(process.cwd(), 'db/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  it('0037 ban374 p4 migration is present', () => {
    const matches = files.filter((f) => f.startsWith('0037_') && f.includes('hawaii'));
    expect(matches.length).toBe(1);
  });

  it('does not collide with another 0037 migration prefix', () => {
    const conflicts = files.filter((f) => f.startsWith('0037_') && !f.includes('hawaii'));
    expect(conflicts).toEqual([]);
  });
});
