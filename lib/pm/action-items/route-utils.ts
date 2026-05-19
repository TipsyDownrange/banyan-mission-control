/**
 * BAN-344a PM-V1.0-E (CORE) — Action Item Tracker route helpers (parsers +
 * shared queries).  Mirrors lib/pm/meetings/route-utils.ts.
 */

import { and, eq } from 'drizzle-orm';
import { db, engagements, action_items, users } from '@/db';
import {
  isActionItemPriority,
  isActionItemSourceEntityType,
  isActionItemStatus,
  type ActionItemPriority,
  type ActionItemSourceEntityType,
  type ActionItemStatus,
} from './types';

export function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function optionalString(value: unknown): string | null {
  const trimmed = trimString(value);
  return trimmed || null;
}

export function parseActionItemPriority(value: unknown): ActionItemPriority | null {
  return isActionItemPriority(value) ? value : null;
}

export function parseActionItemStatus(value: unknown): ActionItemStatus | null {
  return isActionItemStatus(value) ? value : null;
}

export function parseActionItemSourceEntityType(value: unknown): ActionItemSourceEntityType | null {
  return isActionItemSourceEntityType(value) ? value : null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns YYYY-MM-DD ISO date, or null. */
export function parseDueDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (ISO_DATE_RE.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export async function resolveEngagementByKid(tenantId: string, kid: string) {
  const rows = await db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
      is_test_project: engagements.is_test_project,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenant_id, tenantId),
        eq(engagements.kid, kid),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getActionItemForTenant(tenantId: string, id: string) {
  const rows = await db
    .select({
      action_item_id: action_items.action_item_id,
      tenant_id: action_items.tenant_id,
      engagement_id: action_items.engagement_id,
      source_event_type: action_items.source_event_type,
      source_entity_type: action_items.source_entity_type,
      source_entity_id: action_items.source_entity_id,
      title: action_items.title,
      description: action_items.description,
      action_required: action_items.action_required,
      assigned_to: action_items.assigned_to,
      due_date: action_items.due_date,
      priority: action_items.priority,
      status: action_items.status,
      created_at: action_items.created_at,
      created_by: action_items.created_by,
      completed_at: action_items.completed_at,
      completed_by: action_items.completed_by,
      notes: action_items.notes,
      kid: engagements.kid,
      is_test_project: engagements.is_test_project,
    })
    .from(action_items)
    .leftJoin(engagements, eq(action_items.engagement_id, engagements.engagement_id))
    .where(
      and(
        eq(action_items.action_item_id, id),
        eq(action_items.tenant_id, tenantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  const rows = await db
    .select({ user_id: users.user_id })
    .from(users)
    .where(eq(users.email, trimmed))
    .limit(1);
  return rows[0]?.user_id ?? null;
}

const PATCH_ALLOWED_FIELDS = new Set<string>([
  'title',
  'description',
  'action_required',
  'priority',
  'assigned_to',
  'due_date',
  'notes',
]);

export function isPatchField(name: string): boolean {
  return PATCH_ALLOWED_FIELDS.has(name);
}

/**
 * Default action_required token by source entity type.  Used when the caller
 * does not specify one explicitly.  Pure function — exported here so unit
 * tests can pin the policy.
 */
export function defaultActionRequiredFor(
  entityType: ActionItemSourceEntityType,
): string {
  switch (entityType) {
    case 'SUBMITTAL': return 'REVIEW';
    case 'RFI': return 'RESPOND';
    case 'VERBAL_AGREEMENT': return 'FOLLOW_UP';
    case 'MEETING': return 'FOLLOW_UP';
    case 'PAY_APP': return 'SUBMIT';
    case 'TM_TICKET': return 'APPROVE';
    case 'CHANGE_ORDER': return 'APPROVE';
    case 'PUNCH_LIST_ITEM': return 'CLOSE_OUT';
    case 'EXTERNAL_WAIVER': return 'FOLLOW_UP';
    case 'GC_REQUIRED_DOC': return 'SUBMIT';
    case 'WARRANTY_CLAIM': return 'OTHER';
    case 'MANUAL': return 'OTHER';
  }
}
