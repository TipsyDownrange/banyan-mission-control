/**
 * BAN-343 PM-V1.0-D — Meeting Intelligence unit tests.
 *
 * Targets the pure-library logic + migration / contract shape.  Route
 * integration tests live in ban343PmMeetingsRoutes.test.ts.
 */

import fs from 'fs';
import path from 'path';

import {
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  isActivitySpineEventType,
  validateActivitySpinePayload,
} from '@/lib/activity-spine/event-contract';
import {
  isMeetingType,
  isMeetingSourcePlatform,
  MEETING_TYPES,
  MEETING_SOURCE_PLATFORMS,
  TITLE_MAX,
} from '@/lib/pm/meetings/types';
import {
  optionalInteger,
  optionalString,
  optionalStringArray,
  parseAttendeeInput,
  parseMeetingDate,
  parseMeetingSourcePlatform,
  parseMeetingType,
  patchTouchesSummary,
  trimString,
} from '@/lib/pm/meetings/route-utils';

describe('BAN-343 meeting type / source-platform enums', () => {
  it('defines the canon meeting type set', () => {
    expect(MEETING_TYPES).toEqual([
      'PROJECT_KICKOFF',
      'OAC',
      'DESIGN_REVIEW',
      'CONSTRUCTION_PROGRESS',
      'PRECON',
      'PRE_INSTALL',
      'PUNCHWALK',
      'PROJECT_CLOSEOUT',
      'OTHER',
    ]);
  });

  it('reserves the Connector Framework source platforms (ADR-042)', () => {
    expect(MEETING_SOURCE_PLATFORMS).toEqual([
      'MANUAL',
      'READ_AI',
      'OTTER_AI',
      'FIREFLIES_AI',
      'OTHER',
    ]);
  });

  it('caps title at 200 characters', () => {
    expect(TITLE_MAX).toBe(200);
  });

  it('recognizes valid meeting type values', () => {
    expect(isMeetingType('OAC')).toBe(true);
    expect(isMeetingType('PUNCHWALK')).toBe(true);
    expect(isMeetingType('STANDUP')).toBe(false);
  });

  it('recognizes valid source platform values', () => {
    expect(isMeetingSourcePlatform('MANUAL')).toBe(true);
    expect(isMeetingSourcePlatform('READ_AI')).toBe(true);
    expect(isMeetingSourcePlatform('ZOOM')).toBe(false);
  });
});

describe('BAN-343 route-utils parsers', () => {
  it('trimString returns empty for non-strings', () => {
    expect(trimString('  hi ')).toBe('hi');
    expect(trimString(undefined)).toBe('');
    expect(trimString(42)).toBe('');
  });

  it('optionalString returns null for blanks', () => {
    expect(optionalString('  hello ')).toBe('hello');
    expect(optionalString('   ')).toBeNull();
    expect(optionalString(undefined)).toBeNull();
  });

  it('optionalStringArray filters non-strings and blanks', () => {
    expect(optionalStringArray(['a', ' ', 'b', 5, null, 'c '])).toEqual(['a', 'b', 'c']);
    expect(optionalStringArray('not-array')).toEqual([]);
  });

  it('optionalInteger truncates and rejects NaN', () => {
    expect(optionalInteger('42')).toBe(42);
    expect(optionalInteger('42.9')).toBe(42);
    expect(optionalInteger('')).toBeNull();
    expect(optionalInteger('abc')).toBeNull();
  });

  it('parseMeetingType returns null for unknown values', () => {
    expect(parseMeetingType('OAC')).toBe('OAC');
    expect(parseMeetingType('FOO')).toBeNull();
  });

  it('parseMeetingSourcePlatform defaults to MANUAL', () => {
    expect(parseMeetingSourcePlatform('READ_AI')).toBe('READ_AI');
    expect(parseMeetingSourcePlatform('NONSENSE')).toBe('MANUAL');
    expect(parseMeetingSourcePlatform(undefined)).toBe('MANUAL');
  });

  it('parseMeetingDate accepts ISO and Date, rejects invalid', () => {
    const d = parseMeetingDate('2026-05-18T15:30:00Z');
    expect(d).toBeInstanceOf(Date);
    expect(d?.getUTCFullYear()).toBe(2026);
    expect(parseMeetingDate('not-a-date')).toBeNull();
    expect(parseMeetingDate('')).toBeNull();
    expect(parseMeetingDate(null)).toBeNull();
  });
});

describe('BAN-343 attendee input parser', () => {
  it('requires a non-blank name', () => {
    expect(parseAttendeeInput({ name: '   ' })).toMatchObject({ ok: false });
    expect(parseAttendeeInput(null)).toMatchObject({ ok: false });
  });

  it('accepts an external attendee with no kula_user_id', () => {
    const r = parseAttendeeInput({ name: 'Kai', email: 'kai@gc.com', organization: 'Good GC', role: 'PM', is_kula_user: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.attendee).toEqual({
        name: 'Kai', email: 'kai@gc.com', organization: 'Good GC', role: 'PM',
        is_kula_user: false, kula_user_id: null, attended: true,
      });
    }
  });

  it('accepts a kula attendee without kula_user_id (Sheet sync not yet wired)', () => {
    const r = parseAttendeeInput({ name: 'Sean', is_kula_user: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.attendee.is_kula_user).toBe(true);
      expect(r.attendee.kula_user_id).toBeNull();
    }
  });

  it('rejects external attendee carrying a kula_user_id', () => {
    const r = parseAttendeeInput({ name: 'X', is_kula_user: false, kula_user_id: '11111111-1111-1111-1111-111111111111' });
    expect(r.ok).toBe(false);
  });

  it('defaults attended to true and respects explicit false', () => {
    const r1 = parseAttendeeInput({ name: 'A' });
    expect(r1.ok && r1.attendee.attended).toBe(true);
    const r2 = parseAttendeeInput({ name: 'B', attended: false });
    expect(r2.ok && r2.attendee.attended).toBe(false);
  });
});

describe('BAN-343 summary-trigger detection for MEETING_SUMMARY_UPDATED', () => {
  it('detects summary field touch', () => {
    expect(patchTouchesSummary({ summary: 'new' })).toBe(true);
  });

  it('detects key_topics touch', () => {
    expect(patchTouchesSummary({ key_topics: ['a'] })).toBe(true);
  });

  it('detects decisions_made touch', () => {
    expect(patchTouchesSummary({ decisions_made: ['x'] })).toBe(true);
  });

  it('returns false for non-summary fields only', () => {
    expect(patchTouchesSummary({ title: 'x', external_visible: true })).toBe(false);
  });
});

describe('BAN-343 Activity Spine registration', () => {
  it('registers MEETING_LOGGED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('MEETING_LOGGED');
    expect(isActivitySpineEventType('MEETING_LOGGED')).toBe(true);
  });

  it('registers MEETING_SUMMARY_UPDATED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('MEETING_SUMMARY_UPDATED');
    expect(isActivitySpineEventType('MEETING_SUMMARY_UPDATED')).toBe(true);
  });

  it('does not enforce Pattern B payload fields for meeting events', () => {
    expect(validateActivitySpinePayload('MEETING_LOGGED', {}).ok).toBe(true);
    expect(validateActivitySpinePayload('MEETING_SUMMARY_UPDATED', {}).ok).toBe(true);
  });
});

describe('BAN-343 migration shape (0023_ban343_pm_meetings.sql)', () => {
  const migrationPath = path.join(process.cwd(), 'db/migrations/0023_ban343_pm_meetings.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('creates the meetings + meeting_attendees tables', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.meetings');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.meeting_attendees');
  });

  it('creates required enums including the Connector Framework reserved platforms', () => {
    expect(sql).toContain("CREATE TYPE public.meeting_type AS ENUM");
    expect(sql).toContain("CREATE TYPE public.meeting_source_platform AS ENUM");
    expect(sql).toContain("'READ_AI'");
    expect(sql).toContain("'OTTER_AI'");
    expect(sql).toContain("'FIREFLIES_AI'");
  });

  it('enforces title length 200', () => {
    expect(sql).toContain('meetings_title_length');
    expect(sql).toContain('char_length(title) <= 200');
  });

  it('indexes meetings on engagement / date / type and attendees on meeting / kula_user', () => {
    expect(sql).toContain('idx_meetings_engagement');
    expect(sql).toContain('idx_meetings_date');
    expect(sql).toContain('idx_meetings_type');
    expect(sql).toContain('idx_meeting_attendees_meeting');
    expect(sql).toContain('idx_meeting_attendees_kula_user');
  });

  it('makes engagement_id nullable (cross-project meetings are allowed)', () => {
    // PM Trunk v1.0 §8 calls out cross-project meetings.  meetings.engagement_id
    // must not be NOT NULL.
    const tableBlock = sql.match(/CREATE TABLE IF NOT EXISTS public\.meetings[\s\S]*?\);/);
    expect(tableBlock).not.toBeNull();
    expect(tableBlock![0]).toMatch(/engagement_id uuid REFERENCES public\.engagements/);
    expect(tableBlock![0]).not.toMatch(/engagement_id uuid NOT NULL/);
  });

  it('cascades attendee deletes when a meeting is removed', () => {
    expect(sql).toContain('REFERENCES public.meetings (meeting_id) ON DELETE CASCADE');
  });

  it('extends the BAN-293 field_events CHECK with MEETING_LOGGED + MEETING_SUMMARY_UPDATED', () => {
    expect(sql).toContain("'MEETING_LOGGED'");
    expect(sql).toContain("'MEETING_SUMMARY_UPDATED'");
  });

  it('restores VERBAL_AGREEMENT_* and RFI_* event types dropped by migration 0022', () => {
    // BAN-338's PR branched before BAN-341/BAN-342 landed and silently dropped
    // their event types from the field_events CHECK constraint; this migration
    // restores them as part of the additive rewrite.
    expect(sql).toContain("'VERBAL_AGREEMENT_LOGGED'");
    expect(sql).toContain("'VERBAL_AGREEMENT_FOLLOWUP_SENT'");
    expect(sql).toContain("'VERBAL_AGREEMENT_FORMALIZED'");
    expect(sql).toContain("'VERBAL_AGREEMENT_RESOLVED'");
    expect(sql).toContain("'RFI_GENERATED_CO'");
    expect(sql).toContain("'RFI_STATE_CHANGED'");
  });

  it('keeps the meeting_attendees kula consistency CHECK', () => {
    expect(sql).toContain('meeting_attendees_kula_user_consistency');
  });
});
