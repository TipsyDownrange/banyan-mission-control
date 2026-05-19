/**
 * BAN-344a PM-V1.0-E (CORE) — Action Item Tracker unit tests.
 *
 * Targets pure-library logic + migration / contract shape.  Route
 * integration tests live in ban344aPmActionItemsRoutes.test.ts.
 *
 * 344a is the CORE-only split — no subscriber, no auto-close, no
 * AUTO_CLOSED status, no ACTION_ITEM_CLOSED_AUTO event.  Those land in
 * 344b.  Tests here assert the 344a shape, including the negative cases
 * that those 344b things are absent from the contract.
 */

import fs from 'fs';
import path from 'path';

import {
  ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES,
  isActivitySpineEventType,
  validateActivitySpinePayload,
} from '@/lib/activity-spine/event-contract';
import {
  ACTION_ITEM_SOURCE_ENTITY_TYPES,
  ACTION_ITEM_PRIORITIES,
  ACTION_ITEM_STATUSES,
  OPEN_ACTIONABLE_STATUSES,
  TITLE_MAX,
  isActionItemPriority,
  isActionItemSourceEntityType,
  isActionItemStatus,
} from '@/lib/pm/action-items/types';
import {
  defaultActionRequiredFor,
  isPatchField,
  isUuid,
  optionalString,
  parseActionItemPriority,
  parseActionItemSourceEntityType,
  parseActionItemStatus,
  parseDueDate,
  trimString,
} from '@/lib/pm/action-items/route-utils';

describe('BAN-344a action item enums', () => {
  it('defines the canon source-entity-type set (12 incl. MANUAL)', () => {
    expect(ACTION_ITEM_SOURCE_ENTITY_TYPES).toEqual([
      'SUBMITTAL',
      'RFI',
      'VERBAL_AGREEMENT',
      'MEETING',
      'PAY_APP',
      'TM_TICKET',
      'CHANGE_ORDER',
      'PUNCH_LIST_ITEM',
      'EXTERNAL_WAIVER',
      'GC_REQUIRED_DOC',
      'WARRANTY_CLAIM',
      'MANUAL',
    ]);
  });

  it('defines the priority ladder URGENT → LOW', () => {
    expect(ACTION_ITEM_PRIORITIES).toEqual(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);
  });

  it('defines the 344a status set WITHOUT AUTO_CLOSED', () => {
    expect(ACTION_ITEM_STATUSES).toEqual([
      'OPEN', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'CANCELLED',
    ]);
    expect((ACTION_ITEM_STATUSES as readonly string[])).not.toContain('AUTO_CLOSED');
  });

  it('OPEN_ACTIONABLE_STATUSES contains OPEN + IN_PROGRESS only', () => {
    expect(OPEN_ACTIONABLE_STATUSES).toEqual(['OPEN', 'IN_PROGRESS']);
  });

  it('caps title at 300 characters', () => {
    expect(TITLE_MAX).toBe(300);
  });

  it('type guards reject unknown values', () => {
    expect(isActionItemPriority('URGENT')).toBe(true);
    expect(isActionItemPriority('OMG')).toBe(false);
    expect(isActionItemStatus('OPEN')).toBe(true);
    expect(isActionItemStatus('AUTO_CLOSED')).toBe(false); // 344b territory
    expect(isActionItemSourceEntityType('SUBMITTAL')).toBe(true);
    expect(isActionItemSourceEntityType('FOOBAR')).toBe(false);
  });
});

describe('BAN-344a route-utils parsers', () => {
  it('trimString returns empty for non-strings', () => {
    expect(trimString('  hi ')).toBe('hi');
    expect(trimString(undefined)).toBe('');
    expect(trimString(42)).toBe('');
  });

  it('optionalString collapses blanks to null', () => {
    expect(optionalString(' x ')).toBe('x');
    expect(optionalString('   ')).toBeNull();
    expect(optionalString(undefined)).toBeNull();
  });

  it('parseActionItemPriority rejects unknown values', () => {
    expect(parseActionItemPriority('HIGH')).toBe('HIGH');
    expect(parseActionItemPriority('CRITICAL')).toBeNull();
  });

  it('parseActionItemStatus rejects unknown values incl. AUTO_CLOSED in 344a', () => {
    expect(parseActionItemStatus('OPEN')).toBe('OPEN');
    expect(parseActionItemStatus('AUTO_CLOSED')).toBeNull();
  });

  it('parseActionItemSourceEntityType rejects unknown values', () => {
    expect(parseActionItemSourceEntityType('RFI')).toBe('RFI');
    expect(parseActionItemSourceEntityType('xxx')).toBeNull();
  });

  it('parseDueDate accepts ISO YYYY-MM-DD and full ISO timestamps', () => {
    expect(parseDueDate('2026-05-19')).toBe('2026-05-19');
    expect(parseDueDate('2026-05-19T12:00:00Z')).toBe('2026-05-19');
    expect(parseDueDate('not-a-date')).toBeNull();
    expect(parseDueDate('')).toBeNull();
    expect(parseDueDate(null)).toBeNull();
  });

  it('isUuid validates standard uuid form', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('isPatchField gates the allowed PATCH set', () => {
    for (const k of ['title','description','action_required','priority','assigned_to','due_date','notes']) {
      expect(isPatchField(k)).toBe(true);
    }
    expect(isPatchField('status')).toBe(false);
    expect(isPatchField('source_entity_id')).toBe(false);
    expect(isPatchField('tenant_id')).toBe(false);
  });

  it('defaultActionRequiredFor returns a default per source entity', () => {
    expect(defaultActionRequiredFor('RFI')).toBe('RESPOND');
    expect(defaultActionRequiredFor('SUBMITTAL')).toBe('REVIEW');
    expect(defaultActionRequiredFor('PAY_APP')).toBe('SUBMIT');
    expect(defaultActionRequiredFor('MANUAL')).toBe('OTHER');
  });
});

describe('BAN-344a Activity Spine registration', () => {
  it('registers ACTION_ITEM_CREATED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('ACTION_ITEM_CREATED');
    expect(isActivitySpineEventType('ACTION_ITEM_CREATED')).toBe(true);
  });

  it('registers ACTION_ITEM_STATE_CHANGED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('ACTION_ITEM_STATE_CHANGED');
  });

  it('does NOT register ACTION_ITEM_CLOSED_AUTO in 344a (lands in 344b)', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).not.toContain('ACTION_ITEM_CLOSED_AUTO');
    expect(isActivitySpineEventType('ACTION_ITEM_CLOSED_AUTO')).toBe(false);
  });

  it('does not enforce Pattern B payload fields for ACTION_ITEM_* events', () => {
    expect(validateActivitySpinePayload('ACTION_ITEM_CREATED', {}).ok).toBe(true);
    expect(validateActivitySpinePayload('ACTION_ITEM_STATE_CHANGED', {}).ok).toBe(true);
  });
});

describe('BAN-344a migration shape (0026_ban344a_action_items.sql)', () => {
  const migrationPath = path.join(process.cwd(), 'db/migrations/0026_ban344a_action_items.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('creates the action_items table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.action_items');
  });

  it('creates the source-entity-type, priority, and status enums', () => {
    expect(sql).toContain("CREATE TYPE public.action_item_source_entity_type AS ENUM");
    expect(sql).toContain("CREATE TYPE public.action_item_priority AS ENUM");
    expect(sql).toContain("CREATE TYPE public.action_item_status AS ENUM");
  });

  it('enumerates all 12 source entity types including MANUAL', () => {
    for (const t of ACTION_ITEM_SOURCE_ENTITY_TYPES) {
      expect(sql).toContain(`'${t}'`);
    }
  });

  it('does NOT include AUTO_CLOSED in the status enum (344b territory)', () => {
    const statusEnumBlock = sql.match(/CREATE TYPE public\.action_item_status AS ENUM[\s\S]*?\);/);
    expect(statusEnumBlock).not.toBeNull();
    expect(statusEnumBlock![0]).not.toContain("'AUTO_CLOSED'");
  });

  it('source_event_type and source_entity_id are nullable in 344a', () => {
    const tableBlock = sql.match(/CREATE TABLE IF NOT EXISTS public\.action_items[\s\S]*?\);/);
    expect(tableBlock).not.toBeNull();
    // No "NOT NULL" qualifier on these columns.
    expect(tableBlock![0]).toMatch(/source_event_type text,/);
    expect(tableBlock![0]).toMatch(/source_entity_id uuid,/);
  });

  it('makes engagement_id nullable (MANUAL action items may be cross-project)', () => {
    const tableBlock = sql.match(/CREATE TABLE IF NOT EXISTS public\.action_items[\s\S]*?\);/);
    expect(tableBlock).not.toBeNull();
    expect(tableBlock![0]).toMatch(/engagement_id uuid REFERENCES public\.engagements/);
    expect(tableBlock![0]).not.toMatch(/engagement_id uuid NOT NULL/);
  });

  it('enforces title length cap and source_entity_id-vs-MANUAL check', () => {
    expect(sql).toContain('action_items_title_length');
    expect(sql).toContain('char_length(title) <= 300');
    expect(sql).toContain('action_items_manual_source_id_optional');
  });

  it('creates the three canonical indexes (4th source-entity index ships in 344b)', () => {
    expect(sql).toContain('idx_action_items_tenant_engagement_status');
    expect(sql).toContain('idx_action_items_tenant_assignee_open');
    expect(sql).toContain('idx_action_items_tenant_due_open');
  });

  it('partial indexes filter on OPEN + IN_PROGRESS', () => {
    expect(sql).toMatch(/WHERE status IN \('OPEN','IN_PROGRESS'\)/);
  });

  it('extends the BAN-293 field_events CHECK with the 2 ACTION_ITEM_* events', () => {
    expect(sql).toContain("'ACTION_ITEM_CREATED'");
    expect(sql).toContain("'ACTION_ITEM_STATE_CHANGED'");
  });

  it('does NOT extend the CHECK with ACTION_ITEM_CLOSED_AUTO (344b)', () => {
    expect(sql).not.toContain("'ACTION_ITEM_CLOSED_AUTO'");
  });

  it('preserves prior canon (MEETING_LOGGED, RFI_STATE_CHANGED, etc.) in the CHECK rewrite', () => {
    expect(sql).toContain("'MEETING_LOGGED'");
    expect(sql).toContain("'RFI_STATE_CHANGED'");
    expect(sql).toContain("'SUBMITTAL_STATE_CHANGED'");
    expect(sql).toContain("'VERBAL_AGREEMENT_LOGGED'");
  });
});

describe('BAN-344a scope guard — subscriber library is NOT shipped in 344a', () => {
  it('lib/pm/action-items/spine-subscriber.ts does not exist in 344a', () => {
    const subscriberPath = path.join(
      process.cwd(),
      'lib/pm/action-items/spine-subscriber.ts',
    );
    expect(fs.existsSync(subscriberPath)).toBe(false);
  });
});
