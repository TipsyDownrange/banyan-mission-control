import fs from 'fs';
import path from 'path';

import { ACTIVITY_SPINE_EVENT_TYPES } from '@/lib/activity-spine/event-contract';

describe('BAN-293 Activity Spine migrations', () => {
  const migrationDir = path.join(process.cwd(), 'db/migrations');

  it('adds test_data as non-null default false in an isolated migration', () => {
    const sql = fs.readFileSync(path.join(migrationDir, '0011_ban293_activity_spine_test_data.sql'), 'utf8');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS test_data boolean NOT NULL DEFAULT false');
    expect(sql).toContain('SET test_data = false');
    expect(sql).toContain('field_events_production_default_idx');
  });

  it('enforces every ratified canonical event type in the CHECK migration', () => {
    // The BAN-293 CHECK is established in 0012 and additively extended by
    // later migrations as new canonical event types are introduced (e.g.
    // BAN-340 adds SUBMITTAL_STATE_CHANGED via 0017). Aggregate the SQL
    // text from every migration that recreates the CHECK so the assertion
    // matches the cumulative live shape.
    const checkSources = fs.readdirSync(migrationDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => fs.readFileSync(path.join(migrationDir, f), 'utf8'))
      .filter((sql) => sql.includes('field_events_event_type_ban293_check'));

    expect(checkSources.length).toBeGreaterThanOrEqual(1);
    const combined = checkSources.join('\n');

    expect(combined).toContain('field_events_event_type_ban293_check');
    expect(combined).toContain('event_type IS NULL OR event_type IN');
    expect(combined).toContain(`'wo_completion'`);
    for (const eventType of ACTIVITY_SPINE_EVENT_TYPES) {
      expect(combined).toContain(`'${eventType}'`);
    }
  });
});
