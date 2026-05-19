/**
 * BAN-344 PM-V1.0-E — Action Item Tracker unit tests.
 *
 * Targets the pure-library logic + migration / contract shape.  Route
 * integration tests live in ban344PmActionItemsRoutes.test.ts.
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
import { deriveSubscriberPlan } from '@/lib/pm/action-items/spine-subscriber';

describe('BAN-344 action item enums', () => {
  it('defines the canon source-entity-type set', () => {
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

  it('defines the status canon including AUTO_CLOSED', () => {
    expect(ACTION_ITEM_STATUSES).toEqual([
      'OPEN', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'CANCELLED', 'AUTO_CLOSED',
    ]);
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
    expect(isActionItemStatus('AUTO_CLOSED')).toBe(true);
    expect(isActionItemStatus('PAUSED')).toBe(false);
    expect(isActionItemSourceEntityType('SUBMITTAL')).toBe(true);
    expect(isActionItemSourceEntityType('FOOBAR')).toBe(false);
  });
});

describe('BAN-344 route-utils parsers', () => {
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

  it('parseActionItemStatus rejects unknown values', () => {
    expect(parseActionItemStatus('OPEN')).toBe('OPEN');
    expect(parseActionItemStatus('UNKNOWN')).toBeNull();
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

  it('isPatchField gates allowed updates', () => {
    expect(isPatchField('title')).toBe(true);
    expect(isPatchField('priority')).toBe(true);
    expect(isPatchField('assigned_to')).toBe(true);
    expect(isPatchField('due_date')).toBe(true);
    expect(isPatchField('notes')).toBe(true);
    expect(isPatchField('description')).toBe(true);
    expect(isPatchField('action_required')).toBe(true);
    // Forbidden direct mutations
    expect(isPatchField('status')).toBe(false);
    expect(isPatchField('source_entity_id')).toBe(false);
    expect(isPatchField('tenant_id')).toBe(false);
  });

  it('defaultActionRequiredFor maps each source entity', () => {
    expect(defaultActionRequiredFor('RFI')).toBe('RESPOND');
    expect(defaultActionRequiredFor('SUBMITTAL')).toBe('REVIEW');
    expect(defaultActionRequiredFor('VERBAL_AGREEMENT')).toBe('CONFIRM');
    expect(defaultActionRequiredFor('MEETING')).toBe('FOLLOW_UP');
    expect(defaultActionRequiredFor('PAY_APP')).toBe('SUBMIT');
    expect(defaultActionRequiredFor('TM_TICKET')).toBe('APPROVE');
    expect(defaultActionRequiredFor('CHANGE_ORDER')).toBe('APPROVE');
    expect(defaultActionRequiredFor('PUNCH_LIST_ITEM')).toBe('CLOSE_OUT');
    expect(defaultActionRequiredFor('EXTERNAL_WAIVER')).toBe('FOLLOW_UP');
    expect(defaultActionRequiredFor('GC_REQUIRED_DOC')).toBe('SUBMIT');
    expect(defaultActionRequiredFor('WARRANTY_CLAIM')).toBe('TRIAGE');
    expect(defaultActionRequiredFor('MANUAL')).toBe('FOLLOW_UP');
  });
});

// ─── Subscriber dispatch rules (Pure, no DB) ────────────────────────────────

const baseEvent = {
  entityKind: 'rfi',
  entityId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  engagementId: '33333333-3333-4333-8333-333333333333',
  kid: 'PRJ-26-0001',
  isTestProject: false,
  actorEmail: 'pm@kulaglass.com',
};

describe('BAN-344 subscriber rules — SUBMITTAL_STATE_CHANGED', () => {
  it('creates a follow-up action on SUBMITTED', () => {
    const plan = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'submittal',
      eventType: 'SUBMITTAL_STATE_CHANGED',
      metadata: { from_state: 'DRAFT', to_state: 'SUBMITTED', submittal_number: 'S-001' },
    });
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].source_entity_type).toBe('SUBMITTAL');
    expect(plan.create[0].action_required).toBe('FOLLOW_UP');
    expect(plan.create[0].title).toContain('S-001');
    expect(plan.autoClose).toBeNull();
  });

  it('creates a SUBMIT action on REVISE_RESUBMIT with HIGH priority', () => {
    const plan = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'submittal',
      eventType: 'SUBMITTAL_STATE_CHANGED',
      metadata: { from_state: 'UNDER_REVIEW', to_state: 'REVISE_RESUBMIT', submittal_number: 'S-002' },
    });
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].action_required).toBe('SUBMIT');
    expect(plan.create[0].priority).toBe('HIGH');
  });

  it('auto-closes when submittal moves to APPROVED', () => {
    const plan = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'submittal',
      eventType: 'SUBMITTAL_STATE_CHANGED',
      metadata: { from_state: 'UNDER_REVIEW', to_state: 'APPROVED' },
    });
    expect(plan.create).toHaveLength(0);
    expect(plan.autoClose).not.toBeNull();
    expect(plan.autoClose?.reason).toContain('APPROVED');
  });

  it('no-ops on intermediate states with no rule', () => {
    const plan = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'submittal',
      eventType: 'SUBMITTAL_STATE_CHANGED',
      metadata: { from_state: 'SUBMITTED', to_state: 'UNDER_REVIEW' },
    });
    expect(plan.create).toHaveLength(0);
    expect(plan.autoClose).toBeNull();
  });
});

describe('BAN-344 subscriber rules — RFI_STATE_CHANGED', () => {
  it('creates a FOLLOW_UP on SUBMITTED', () => {
    const plan = deriveSubscriberPlan({
      ...baseEvent,
      eventType: 'RFI_STATE_CHANGED',
      metadata: { from_state: 'DRAFT', to_state: 'SUBMITTED', rfi_number: 'R-005' },
    });
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].action_required).toBe('FOLLOW_UP');
    expect(plan.create[0].title).toContain('R-005');
  });

  it('creates a HIGH-priority REVIEW on ANSWERED', () => {
    const plan = deriveSubscriberPlan({
      ...baseEvent,
      eventType: 'RFI_STATE_CHANGED',
      metadata: { from_state: 'SUBMITTED', to_state: 'ANSWERED', rfi_number: 'R-005' },
    });
    expect(plan.create[0].action_required).toBe('REVIEW');
    expect(plan.create[0].priority).toBe('HIGH');
  });

  it('auto-closes on RESOLVED', () => {
    const plan = deriveSubscriberPlan({
      ...baseEvent,
      eventType: 'RFI_STATE_CHANGED',
      metadata: { from_state: 'ANSWERED', to_state: 'RESOLVED' },
    });
    expect(plan.create).toHaveLength(0);
    expect(plan.autoClose?.reason).toContain('RESOLVED');
  });
});

describe('BAN-344 subscriber rules — VERBAL_AGREEMENT_*', () => {
  it('creates a CONFIRM action on LOGGED with summary in title', () => {
    const plan = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'verbal_agreement',
      eventType: 'VERBAL_AGREEMENT_LOGGED',
      metadata: { summary: 'Owner approved tinted glass swap' },
    });
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].action_required).toBe('CONFIRM');
    expect(plan.create[0].title).toContain('tinted glass');
  });

  it('auto-closes on FORMALIZED and RESOLVED', () => {
    for (const eventType of ['VERBAL_AGREEMENT_FORMALIZED', 'VERBAL_AGREEMENT_RESOLVED'] as const) {
      const plan = deriveSubscriberPlan({
        ...baseEvent,
        entityKind: 'verbal_agreement',
        eventType,
        metadata: {},
      });
      expect(plan.create).toHaveLength(0);
      expect(plan.autoClose).not.toBeNull();
    }
  });

  it('no-ops on FOLLOWUP_SENT', () => {
    const plan = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'verbal_agreement',
      eventType: 'VERBAL_AGREEMENT_FOLLOWUP_SENT',
      metadata: {},
    });
    expect(plan.create).toHaveLength(0);
    expect(plan.autoClose).toBeNull();
  });
});

describe('BAN-344 subscriber rules — MEETING_LOGGED', () => {
  it('emits one action item per decision', () => {
    const plan = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'meeting',
      eventType: 'MEETING_LOGGED',
      metadata: {
        title: 'OAC',
        decisions_made: ['Sean to update SOV', 'Architect to issue ASI-3'],
      },
    });
    expect(plan.create).toHaveLength(2);
    expect(plan.create[0].source_entity_type).toBe('MEETING');
    expect(plan.create[0].action_required).toBe('FOLLOW_UP');
    expect(plan.create[1].title).toContain('Architect');
  });

  it('no-ops when decisions_made is empty or missing', () => {
    const planEmpty = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'meeting',
      eventType: 'MEETING_LOGGED',
      metadata: { decisions_made: [] },
    });
    expect(planEmpty.create).toHaveLength(0);
    expect(planEmpty.autoClose).toBeNull();

    const planMissing = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'meeting',
      eventType: 'MEETING_LOGGED',
      metadata: {},
    });
    expect(planMissing.create).toHaveLength(0);
  });
});

describe('BAN-344 subscriber rules — PAY_APP / TM_TICKET / CO', () => {
  it('PAY_APP: SUBMITTED → FOLLOW_UP; PAID → auto-close', () => {
    const open = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'pay_application',
      eventType: 'PAY_APP_STATE_CHANGED',
      metadata: { from_state: 'DRAFT', to_state: 'SUBMITTED', pay_app_number: '7' },
    });
    expect(open.create[0].action_required).toBe('FOLLOW_UP');
    expect(open.create[0].priority).toBe('HIGH');

    const closed = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'pay_application',
      eventType: 'PAY_APP_STATE_CHANGED',
      metadata: { from_state: 'SUBMITTED', to_state: 'PAID' },
    });
    expect(closed.autoClose).not.toBeNull();
  });

  it('TM_TICKET: OPEN → APPROVE; CLOSED → auto-close', () => {
    const open = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'tm_ticket',
      eventType: 'TM_TICKET_STATE_CHANGED',
      metadata: { from_state: 'DRAFT', to_state: 'OPEN', ticket_number: '42' },
    });
    expect(open.create[0].action_required).toBe('APPROVE');

    const closed = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'tm_ticket',
      eventType: 'TM_TICKET_STATE_CHANGED',
      metadata: { from_state: 'OPEN', to_state: 'CLOSED' },
    });
    expect(closed.autoClose).not.toBeNull();
  });

  it('CO: PENDING → APPROVE; APPROVED → auto-close', () => {
    const pending = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'change_order',
      eventType: 'CO_STATE_CHANGED',
      metadata: { from_state: 'DRAFT', to_state: 'PENDING', co_number: '3' },
    });
    expect(pending.create[0].source_entity_type).toBe('CHANGE_ORDER');
    expect(pending.create[0].action_required).toBe('APPROVE');

    const approved = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'change_order',
      eventType: 'CO_STATE_CHANGED',
      metadata: { from_state: 'PENDING', to_state: 'APPROVED' },
    });
    expect(approved.autoClose).not.toBeNull();
  });
});

describe('BAN-344 subscriber rules — punch list / waivers / GC docs / warranty', () => {
  it('PUNCH_LIST_ITEM: ASSIGNED → CLOSE_OUT; DISPUTED → REVIEW; RESOLVED → auto-close', () => {
    const assigned = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'punch_list_item',
      eventType: 'PUNCH_LIST_ITEM_STATE_CHANGED',
      metadata: { from_state: 'OPEN', to_state: 'ASSIGNED' },
    });
    expect(assigned.create[0].action_required).toBe('CLOSE_OUT');

    const disputed = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'punch_list_item',
      eventType: 'PUNCH_LIST_ITEM_STATE_CHANGED',
      metadata: { from_state: 'ASSIGNED', to_state: 'DISPUTED' },
    });
    expect(disputed.create[0].priority).toBe('HIGH');

    const resolved = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'punch_list_item',
      eventType: 'PUNCH_LIST_ITEM_STATE_CHANGED',
      metadata: { from_state: 'ASSIGNED', to_state: 'RESOLVED' },
    });
    expect(resolved.autoClose).not.toBeNull();
  });

  it('EXTERNAL_LIEN_WAIVER: OVERDUE → URGENT; RECEIVED → auto-close', () => {
    const overdue = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'external_lien_waiver_request',
      eventType: 'EXTERNAL_LIEN_WAIVER_STATE_CHANGED',
      metadata: { from_state: 'PENDING', to_state: 'OVERDUE' },
    });
    expect(overdue.create[0].priority).toBe('URGENT');

    const received = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'external_lien_waiver_request',
      eventType: 'EXTERNAL_LIEN_WAIVER_STATE_CHANGED',
      metadata: { from_state: 'OVERDUE', to_state: 'RECEIVED' },
    });
    expect(received.autoClose).not.toBeNull();
  });

  it('GC_REQUIRED_DOCS: pending_count > 0 → SUBMIT; pending_count === 0 → auto-close', () => {
    const pending = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'gc_required_docs_checklist',
      eventType: 'GC_REQUIRED_DOCS_CHECKLIST_UPDATED',
      metadata: { pending_count: 3, milestone: 'pre-pour' },
    });
    expect(pending.create).toHaveLength(1);
    expect(pending.create[0].action_required).toBe('SUBMIT');
    expect(pending.create[0].title).toContain('pre-pour');

    const complete = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'gc_required_docs_checklist',
      eventType: 'GC_REQUIRED_DOCS_CHECKLIST_UPDATED',
      metadata: { pending_count: 0 },
    });
    expect(complete.autoClose).not.toBeNull();
  });

  it('WARRANTY: OPEN → TRIAGE; RESOLVED → auto-close', () => {
    const open = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'warranty',
      eventType: 'WARRANTY_STATE_CHANGED',
      metadata: { from_state: 'NEW', to_state: 'OPEN' },
    });
    expect(open.create[0].action_required).toBe('TRIAGE');

    const resolved = deriveSubscriberPlan({
      ...baseEvent,
      entityKind: 'warranty',
      eventType: 'WARRANTY_STATE_CHANGED',
      metadata: { from_state: 'IN_TRIAGE', to_state: 'RESOLVED' },
    });
    expect(resolved.autoClose).not.toBeNull();
  });

  it('returns empty plan for unknown event types', () => {
    const plan = deriveSubscriberPlan({
      ...baseEvent,
      eventType: 'SOMETHING_NEW',
      metadata: { from_state: 'X', to_state: 'Y' },
    });
    expect(plan.create).toHaveLength(0);
    expect(plan.autoClose).toBeNull();
  });
});

describe('BAN-344 Activity Spine registration', () => {
  it('registers ACTION_ITEM_CREATED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('ACTION_ITEM_CREATED');
    expect(isActivitySpineEventType('ACTION_ITEM_CREATED')).toBe(true);
  });

  it('registers ACTION_ITEM_STATE_CHANGED as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('ACTION_ITEM_STATE_CHANGED');
  });

  it('registers ACTION_ITEM_CLOSED_AUTO as Pattern A', () => {
    expect(ACTIVITY_SPINE_PATTERN_A_EVENT_TYPES).toContain('ACTION_ITEM_CLOSED_AUTO');
  });

  it('does not enforce Pattern B payload fields for ACTION_ITEM_* events', () => {
    expect(validateActivitySpinePayload('ACTION_ITEM_CREATED', {}).ok).toBe(true);
    expect(validateActivitySpinePayload('ACTION_ITEM_STATE_CHANGED', {}).ok).toBe(true);
    expect(validateActivitySpinePayload('ACTION_ITEM_CLOSED_AUTO', {}).ok).toBe(true);
  });
});

describe('BAN-344 migration shape (0024_ban344_action_items.sql)', () => {
  const migrationPath = path.join(process.cwd(), 'db/migrations/0024_ban344_action_items.sql');
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

  it('reserves the AUTO_CLOSED status', () => {
    expect(sql).toContain("'AUTO_CLOSED'");
  });

  it('makes engagement_id nullable (MANUAL action items may be cross-project)', () => {
    const tableBlock = sql.match(/CREATE TABLE IF NOT EXISTS public\.action_items[\s\S]*?\);/);
    expect(tableBlock).not.toBeNull();
    expect(tableBlock![0]).toMatch(/engagement_id uuid REFERENCES public\.engagements/);
    expect(tableBlock![0]).not.toMatch(/engagement_id uuid NOT NULL/);
  });

  it('enforces the title length cap', () => {
    expect(sql).toContain('action_items_title_length');
    expect(sql).toContain('char_length(title) <= 300');
  });

  it('creates the four canonical indexes', () => {
    expect(sql).toContain('idx_action_items_tenant_engagement_status');
    expect(sql).toContain('idx_action_items_tenant_assignee_open');
    expect(sql).toContain('idx_action_items_tenant_due_open');
    expect(sql).toContain('idx_action_items_source_entity');
  });

  it('partial indexes filter on OPEN + IN_PROGRESS', () => {
    expect(sql).toMatch(/WHERE status IN \('OPEN','IN_PROGRESS'\)/);
  });

  it('extends the BAN-293 field_events CHECK with ACTION_ITEM_* events', () => {
    expect(sql).toContain("'ACTION_ITEM_CREATED'");
    expect(sql).toContain("'ACTION_ITEM_STATE_CHANGED'");
    expect(sql).toContain("'ACTION_ITEM_CLOSED_AUTO'");
  });

  it('preserves prior canon (MEETING_LOGGED, RFI_STATE_CHANGED, etc.) in the CHECK rewrite', () => {
    expect(sql).toContain("'MEETING_LOGGED'");
    expect(sql).toContain("'RFI_STATE_CHANGED'");
    expect(sql).toContain("'SUBMITTAL_STATE_CHANGED'");
    expect(sql).toContain("'VERBAL_AGREEMENT_LOGGED'");
  });
});
