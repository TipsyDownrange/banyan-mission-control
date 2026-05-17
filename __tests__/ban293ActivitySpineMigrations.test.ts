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
    const sql = fs.readFileSync(path.join(migrationDir, '0012_ban293_activity_spine_event_type_check.sql'), 'utf8');

    expect(sql).toContain('field_events_event_type_ban293_check');
    expect(sql).toContain('event_type IS NULL OR event_type IN');
    for (const eventType of ACTIVITY_SPINE_EVENT_TYPES) {
      expect(sql).toContain(`'${eventType}'`);
    }
  });
});
