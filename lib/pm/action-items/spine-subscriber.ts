/**
 * BAN-344 PM-V1.0-E — Action Item Tracker spine subscriber.
 *
 * The subscriber consumes BAN-309 / BAN-339 source-trunk events and folds
 * them into action_items rows.  Source events remain canon; action_items
 * are a derived projection convenient for the PM dashboard and "My Open
 * Actions" view.
 *
 * Design rules (PM Trunk v1.0 §9 + Charter Amendment 2):
 *   - The subscriber MUST run after the source transaction has committed.
 *     A subscriber failure must not roll back the source event.  Callers
 *     wrap dispatchSourceEvent() in try/catch and log; this module never
 *     throws back into the source path.
 *   - Auto-creation and auto-close rules are pure functions of event_type
 *     + metadata (see deriveSubscriberPlan).  Kai may layer urgency
 *     scoring, suggested assignees, and clustering on top — the canon
 *     rules here do not depend on Kai.
 *   - The subscriber dispatches on event_type and folds 11 source trunks
 *     into the same action_items table.  Adding a new source trunk is a
 *     pure data change in SUBSCRIBER_RULES.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db, action_items, engagements } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import {
  OPEN_ACTIONABLE_STATUSES,
  type ActionItemPriority,
  type ActionItemSourceEntityType,
} from './types';

export type SubscriberSourceEvent = {
  /** Source spine event_type (e.g. RFI_STATE_CHANGED). */
  eventType: string;
  /** Inner entity_kind from the spine metadata (e.g. rfi). */
  entityKind: string;
  /** Source row id (the row that emitted the event). */
  entityId: string;
  tenantId: string;
  engagementId: string | null;
  kid: string | null;
  isTestProject: boolean;
  /** Event metadata payload (from / to state, ball-in-court, actor, etc.). */
  metadata: Record<string, unknown>;
  /** Optional override for the canon-actor used as created_by on inserts. */
  actorEmail?: string | null;
  actorUserId?: string | null;
};

export type PlannedCreate = {
  title: string;
  description: string | null;
  action_required: string;
  priority: ActionItemPriority;
  source_entity_type: ActionItemSourceEntityType;
};

export type PlannedAutoClose = {
  reason: string;
};

export type SubscriberPlan = {
  /** Rows to insert (one action_item per entry). */
  create: PlannedCreate[];
  /** When set, auto-close every open action_items row whose
   *  source_entity_type/source_entity_id match the event with this reason. */
  autoClose: PlannedAutoClose | null;
};

export type SubscriberResult = {
  createdActionItemIds: string[];
  autoClosedActionItemIds: string[];
  createdEventIds: string[];
  autoClosedEventIds: string[];
  skipped: boolean;
  reason?: string;
};

const EMPTY_PLAN: SubscriberPlan = { create: [], autoClose: null };

function metaStr(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function metaArray(meta: Record<string, unknown>, key: string): string[] {
  const v = meta[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/**
 * Pure dispatcher: given a source event, returns the action_items rows to
 * insert and an optional auto-close directive.  No DB access here.
 *
 * Behaviour by source trunk (PM Trunk v1.0 §9):
 *   - SUBMITTAL_STATE_CHANGED: SUBMITTED → review pending; APPROVED|CLOSED → auto-close.
 *   - RFI_STATE_CHANGED: SUBMITTED → respond; ANSWERED → review response;
 *     RESOLVED|VOIDED → auto-close.
 *   - VERBAL_AGREEMENT_LOGGED: needs written confirmation.
 *   - VERBAL_AGREEMENT_FORMALIZED|RESOLVED: auto-close.
 *   - MEETING_LOGGED: one action item per decision in decisions_made[].
 *   - PAY_APP_STATE_CHANGED: SUBMITTED → track receipt; PAID → auto-close.
 *   - TM_TICKET_STATE_CHANGED: OPEN → approve; CLOSED|RESOLVED → auto-close.
 *   - CHANGE_ORDER (CO_STATE_CHANGED): pending approval; APPROVED|EXECUTED → auto-close.
 *     (CO Pattern B not yet emitted in v1.0; dispatcher is ready when it lands.)
 *   - PUNCH_LIST_ITEM_STATE_CHANGED: ASSIGNED → complete; RESOLVED|CLOSED → auto-close.
 *   - EXTERNAL_LIEN_WAIVER_STATE_CHANGED: REQUESTED → track; RECEIVED → auto-close.
 *   - GC_REQUIRED_DOCS_CHECKLIST_UPDATED: pending docs → submit; complete → auto-close.
 *   - WARRANTY_STATE_CHANGED: OPEN|IN_TRIAGE → triage; RESOLVED → auto-close.
 */
export function deriveSubscriberPlan(event: SubscriberSourceEvent): SubscriberPlan {
  const { eventType, metadata } = event;
  const fromState = metaStr(metadata, 'from_state');
  const toState = metaStr(metadata, 'to_state');

  switch (eventType) {
    case 'SUBMITTAL_STATE_CHANGED': {
      const submittalNum = metaStr(metadata, 'submittal_number');
      if (toState === 'SUBMITTED') {
        return {
          create: [{
            title: submittalNum
              ? `Track submittal ${submittalNum} response`
              : 'Track submittal response',
            description: 'Submittal sent for review — track ball-in-court until returned.',
            action_required: 'FOLLOW_UP',
            priority: 'MEDIUM',
            source_entity_type: 'SUBMITTAL',
          }],
          autoClose: null,
        };
      }
      if (toState === 'REVISE_RESUBMIT') {
        return {
          create: [{
            title: submittalNum
              ? `Revise & resubmit submittal ${submittalNum}`
              : 'Revise & resubmit submittal',
            description: null,
            action_required: 'SUBMIT',
            priority: 'HIGH',
            source_entity_type: 'SUBMITTAL',
          }],
          autoClose: null,
        };
      }
      if (toState === 'APPROVED_AS_NOTED') {
        return {
          create: [{
            title: submittalNum
              ? `Review approval notes on submittal ${submittalNum}`
              : 'Review approval notes on submittal',
            description: null,
            action_required: 'REVIEW',
            priority: 'MEDIUM',
            source_entity_type: 'SUBMITTAL',
          }],
          autoClose: null,
        };
      }
      if (toState && (toState === 'APPROVED' || toState === 'CLOSED' || toState === 'VOIDED')) {
        return { create: [], autoClose: { reason: `submittal moved to ${toState}` } };
      }
      return EMPTY_PLAN;
    }

    case 'RFI_STATE_CHANGED': {
      const rfiNum = metaStr(metadata, 'rfi_number');
      if (toState === 'SUBMITTED') {
        return {
          create: [{
            title: rfiNum
              ? `Track response to RFI ${rfiNum}`
              : 'Track response to RFI',
            description: 'RFI submitted — awaiting response from ball-in-court.',
            action_required: 'FOLLOW_UP',
            priority: 'MEDIUM',
            source_entity_type: 'RFI',
          }],
          autoClose: null,
        };
      }
      if (toState === 'ANSWERED') {
        return {
          create: [{
            title: rfiNum
              ? `Review RFI ${rfiNum} response`
              : 'Review RFI response',
            description: 'Response received — review and resolve or follow up.',
            action_required: 'REVIEW',
            priority: 'HIGH',
            source_entity_type: 'RFI',
          }],
          autoClose: null,
        };
      }
      if (toState && (toState === 'RESOLVED' || toState === 'VOIDED' || toState === 'CLOSED')) {
        return { create: [], autoClose: { reason: `RFI moved to ${toState}` } };
      }
      return EMPTY_PLAN;
    }

    case 'VERBAL_AGREEMENT_LOGGED': {
      const summary = metaStr(metadata, 'summary');
      return {
        create: [{
          title: summary
            ? `Confirm verbal agreement in writing: ${summary.slice(0, 200)}`
            : 'Confirm verbal agreement in writing',
          description: 'Verbal agreement captured — send written confirmation to all parties.',
          action_required: 'CONFIRM',
          priority: 'HIGH',
          source_entity_type: 'VERBAL_AGREEMENT',
        }],
        autoClose: null,
      };
    }

    case 'VERBAL_AGREEMENT_FOLLOWUP_SENT':
      // Followup was sent; no new action and no resolution yet.
      return EMPTY_PLAN;

    case 'VERBAL_AGREEMENT_FORMALIZED':
      return { create: [], autoClose: { reason: 'verbal agreement formalized' } };

    case 'VERBAL_AGREEMENT_RESOLVED':
      return { create: [], autoClose: { reason: 'verbal agreement resolved' } };

    case 'MEETING_LOGGED': {
      const decisions = metaArray(metadata, 'decisions_made');
      if (decisions.length === 0) return EMPTY_PLAN;
      return {
        create: decisions.map((d) => ({
          title: `Follow up: ${d.slice(0, 240)}`,
          description: 'Meeting decision recorded — assign owner and due date.',
          action_required: 'FOLLOW_UP',
          priority: 'MEDIUM',
          source_entity_type: 'MEETING' as ActionItemSourceEntityType,
        })),
        autoClose: null,
      };
    }

    case 'PAY_APP_STATE_CHANGED': {
      const periodNum = metaStr(metadata, 'period_number') ?? metaStr(metadata, 'pay_app_number');
      if (toState === 'SUBMITTED' || toState === 'AWAITING_PAYMENT') {
        return {
          create: [{
            title: periodNum
              ? `Track pay app #${periodNum} payment`
              : 'Track pay app payment',
            description: 'Pay app submitted — follow up until paid.',
            action_required: 'FOLLOW_UP',
            priority: 'HIGH',
            source_entity_type: 'PAY_APP',
          }],
          autoClose: null,
        };
      }
      if (toState && (toState === 'PAID' || toState === 'CLOSED' || toState === 'VOIDED')) {
        return { create: [], autoClose: { reason: `pay app moved to ${toState}` } };
      }
      return EMPTY_PLAN;
    }

    case 'TM_TICKET_STATE_CHANGED': {
      const ticketNum = metaStr(metadata, 'ticket_number');
      if (toState === 'OPEN' || toState === 'SUBMITTED') {
        return {
          create: [{
            title: ticketNum
              ? `Approve T&M ticket #${ticketNum}`
              : 'Approve T&M ticket',
            description: 'T&M ticket awaiting approval.',
            action_required: 'APPROVE',
            priority: 'HIGH',
            source_entity_type: 'TM_TICKET',
          }],
          autoClose: null,
        };
      }
      if (toState && (toState === 'CLOSED' || toState === 'RESOLVED' || toState === 'CONVERTED_TO_CO')) {
        return { create: [], autoClose: { reason: `T&M ticket moved to ${toState}` } };
      }
      return EMPTY_PLAN;
    }

    // CO_STATE_CHANGED is reserved for the AIA Billing trunk's CO state
    // machine.  The dispatcher is ready; emission will be added when that
    // Pattern B event ships.
    case 'CO_STATE_CHANGED': {
      const coNum = metaStr(metadata, 'co_number');
      if (toState === 'PENDING' || toState === 'SUBMITTED' || toState === 'IN_NEGOTIATION') {
        return {
          create: [{
            title: coNum ? `Advance change order #${coNum}` : 'Advance change order',
            description: null,
            action_required: 'APPROVE',
            priority: 'HIGH',
            source_entity_type: 'CHANGE_ORDER',
          }],
          autoClose: null,
        };
      }
      if (toState && (toState === 'APPROVED' || toState === 'EXECUTED' || toState === 'VOIDED' || toState === 'REJECTED')) {
        return { create: [], autoClose: { reason: `change order moved to ${toState}` } };
      }
      return EMPTY_PLAN;
    }

    case 'PUNCH_LIST_ITEM_STATE_CHANGED': {
      if (toState === 'ASSIGNED' || toState === 'OPEN' || toState === 'IN_PROGRESS') {
        return {
          create: [{
            title: 'Complete punch list item',
            description: null,
            action_required: 'CLOSE_OUT',
            priority: 'MEDIUM',
            source_entity_type: 'PUNCH_LIST_ITEM',
          }],
          autoClose: null,
        };
      }
      if (toState === 'DISPUTED') {
        return {
          create: [{
            title: 'Resolve disputed punch list item',
            description: null,
            action_required: 'REVIEW',
            priority: 'HIGH',
            source_entity_type: 'PUNCH_LIST_ITEM',
          }],
          autoClose: null,
        };
      }
      if (toState && (toState === 'RESOLVED' || toState === 'CLOSED' || toState === 'CLEARED')) {
        return { create: [], autoClose: { reason: `punch list item moved to ${toState}` } };
      }
      return EMPTY_PLAN;
    }

    case 'EXTERNAL_LIEN_WAIVER_STATE_CHANGED': {
      if (toState === 'REQUESTED' || toState === 'PENDING' || toState === 'OVERDUE') {
        return {
          create: [{
            title: toState === 'OVERDUE'
              ? 'Chase overdue external lien waiver'
              : 'Track external lien waiver',
            description: null,
            action_required: 'FOLLOW_UP',
            priority: toState === 'OVERDUE' ? 'URGENT' : 'MEDIUM',
            source_entity_type: 'EXTERNAL_WAIVER',
          }],
          autoClose: null,
        };
      }
      if (toState && (toState === 'RECEIVED' || toState === 'CLOSED' || toState === 'VOIDED')) {
        return { create: [], autoClose: { reason: `external waiver moved to ${toState}` } };
      }
      return EMPTY_PLAN;
    }

    case 'GC_REQUIRED_DOCS_CHECKLIST_UPDATED': {
      const pendingCount = typeof metadata.pending_count === 'number' ? metadata.pending_count : null;
      const milestone = metaStr(metadata, 'milestone');
      if (pendingCount !== null && pendingCount > 0) {
        return {
          create: [{
            title: milestone
              ? `Submit GC-required docs for ${milestone}`
              : 'Submit GC-required docs',
            description: pendingCount === 1
              ? '1 document still required.'
              : `${pendingCount} documents still required.`,
            action_required: 'SUBMIT',
            priority: 'HIGH',
            source_entity_type: 'GC_REQUIRED_DOC',
          }],
          autoClose: null,
        };
      }
      if (pendingCount === 0) {
        return { create: [], autoClose: { reason: 'GC-required docs complete' } };
      }
      return EMPTY_PLAN;
    }

    case 'WARRANTY_STATE_CHANGED':
    case 'WARRANTY_CALLBACK': {
      if (toState === 'OPEN' || toState === 'IN_TRIAGE' || toState === 'IN_PROGRESS' || (!toState && eventType === 'WARRANTY_CALLBACK')) {
        return {
          create: [{
            title: 'Triage warranty claim',
            description: null,
            action_required: 'TRIAGE',
            priority: 'HIGH',
            source_entity_type: 'WARRANTY_CLAIM',
          }],
          autoClose: null,
        };
      }
      if (toState && (toState === 'RESOLVED' || toState === 'CLOSED')) {
        return { create: [], autoClose: { reason: `warranty claim moved to ${toState}` } };
      }
      return EMPTY_PLAN;
    }

    default:
      return EMPTY_PLAN;
  }

  // Suppress unused-variable warning — fromState is reserved for future
  // delta-aware rules (e.g. emitting on RFI ANSWERED only when transitioning
  // back from RESPONSE_REVIEW, not on re-entry).
  void fromState;
}

/**
 * Run the subscriber against a source event.  Inserts any planned
 * action_items rows and auto-closes existing rows that match the source
 * entity.  Each insert emits ACTION_ITEM_CREATED; each auto-close emits
 * ACTION_ITEM_CLOSED_AUTO.
 *
 * Errors are caught internally and returned as { skipped: true, reason }.
 * Callers (source-trunk routes) must wrap this call in their own try/catch
 * to satisfy the "subscriber failure does not roll back source event"
 * contract; this function is additionally defensive.
 */
export async function dispatchSourceEvent(
  event: SubscriberSourceEvent,
): Promise<SubscriberResult> {
  const empty: SubscriberResult = {
    createdActionItemIds: [],
    autoClosedActionItemIds: [],
    createdEventIds: [],
    autoClosedEventIds: [],
    skipped: false,
  };

  try {
    const plan = deriveSubscriberPlan(event);
    if (plan.create.length === 0 && !plan.autoClose) {
      return { ...empty, skipped: true, reason: 'no-rule-match' };
    }

    return await db.transaction(async (tx) => {
      const createdActionItemIds: string[] = [];
      const createdEventIds: string[] = [];
      const autoClosedActionItemIds: string[] = [];
      const autoClosedEventIds: string[] = [];

      for (const c of plan.create) {
        const inserted = await tx
          .insert(action_items)
          .values({
            tenant_id: event.tenantId,
            engagement_id: event.engagementId,
            source_event_type: event.eventType,
            source_entity_type: c.source_entity_type,
            source_entity_id: event.entityId,
            title: c.title,
            description: c.description,
            action_required: c.action_required,
            priority: c.priority,
            created_by: event.actorUserId ?? null,
          })
          .returning({ action_item_id: action_items.action_item_id });

        const row = inserted[0];
        if (!row) continue;
        createdActionItemIds.push(row.action_item_id);

        const emit = await emitActivitySpineEvent(tx, {
          event_type: 'ACTION_ITEM_CREATED',
          scope_entity_type: event.engagementId ? 'project' : 'internal',
          scope_entity_id: event.engagementId ?? row.action_item_id,
          entity_kind: 'action_item',
          entity_id: row.action_item_id,
          kid: event.kid,
          test_data: event.isTestProject,
          metadata: {
            source_event_type: event.eventType,
            source_entity_type: c.source_entity_type,
            source_entity_id: event.entityId,
            action_required: c.action_required,
            priority: c.priority,
            auto_created: true,
            actor: event.actorEmail ?? null,
          },
        });
        createdEventIds.push(emit.event_id);
      }

      if (plan.autoClose) {
        const stale = await tx
          .select({ action_item_id: action_items.action_item_id })
          .from(action_items)
          .where(
            and(
              eq(action_items.tenant_id, event.tenantId),
              eq(action_items.source_entity_id, event.entityId),
              inArray(action_items.status, OPEN_ACTIONABLE_STATUSES),
            ),
          );

        if (stale.length > 0) {
          const ids = stale.map((r) => r.action_item_id);
          const closed = await tx
            .update(action_items)
            .set({
              status: 'AUTO_CLOSED',
              auto_closed_reason: plan.autoClose.reason,
              completed_at: new Date(),
            })
            .where(
              and(
                eq(action_items.tenant_id, event.tenantId),
                inArray(action_items.action_item_id, ids),
              ),
            )
            .returning({ action_item_id: action_items.action_item_id });

          for (const r of closed) {
            autoClosedActionItemIds.push(r.action_item_id);
            const emit = await emitActivitySpineEvent(tx, {
              event_type: 'ACTION_ITEM_CLOSED_AUTO',
              scope_entity_type: event.engagementId ? 'project' : 'internal',
              scope_entity_id: event.engagementId ?? r.action_item_id,
              entity_kind: 'action_item',
              entity_id: r.action_item_id,
              kid: event.kid,
              test_data: event.isTestProject,
              metadata: {
                source_event_type: event.eventType,
                source_entity_id: event.entityId,
                reason: plan.autoClose.reason,
                actor: event.actorEmail ?? null,
              },
            });
            autoClosedEventIds.push(emit.event_id);
          }
        }
      }

      return {
        createdActionItemIds,
        autoClosedActionItemIds,
        createdEventIds,
        autoClosedEventIds,
        skipped: false,
      };
    });
  } catch (err) {
    // Subscriber failure must never propagate back to the source path.
    return {
      ...empty,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Look up the engagement row given an engagement_id so callers (source
 * executors) can populate kid + is_test_project without re-querying.
 * Returns null if the engagement is not found in the tenant.
 */
export async function resolveEngagementContext(
  tenantId: string,
  engagementId: string,
): Promise<{ kid: string | null; isTestProject: boolean } | null> {
  const rows = await db
    .select({
      kid: engagements.kid,
      is_test_project: engagements.is_test_project,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenant_id, tenantId),
        eq(engagements.engagement_id, engagementId),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  return { kid: rows[0].kid ?? null, isTestProject: rows[0].is_test_project === true };
}
