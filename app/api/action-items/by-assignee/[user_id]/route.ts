/**
 * BAN-344a PM-V1.0-E (CORE) — GET /api/action-items/by-assignee/[user_id]
 *
 * Cross-project "My Open Actions" surface.  Returns every action_items row
 * assigned to the given user across all engagements in the tenant.  Defaults
 * to status IN ('OPEN','IN_PROGRESS'); override with ?status=...
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, engagements, action_items } from '@/db';
import { passActionItemCrossProjectGate } from '@/lib/pm/action-items/api-gate';
import { isUuid, parseActionItemStatus } from '@/lib/pm/action-items/route-utils';
import { OPEN_ACTIONABLE_STATUSES, type ActionItemStatus } from '@/lib/pm/action-items/types';

export async function GET(
  req: Request,
  context: { params: Promise<{ user_id: string }> },
) {
  const gate = await passActionItemCrossProjectGate(req);
  if (!gate.ok) return gate.response;

  const { user_id: rawUserId } = await context.params;
  const userId = decodeURIComponent(rawUserId).trim();
  if (!isUuid(userId)) {
    return NextResponse.json({ error: 'user_id path param must be a uuid' }, { status: 400 });
  }

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get('status');
  let statuses: ActionItemStatus[] = OPEN_ACTIONABLE_STATUSES;
  if (statusRaw) {
    const parsed = statusRaw.split(',').map((s) => s.trim())
      .map(parseActionItemStatus)
      .filter((v): v is ActionItemStatus => v !== null);
    if (parsed.length > 0) statuses = parsed;
  }

  const items = await db
    .select({
      action_item_id: action_items.action_item_id,
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
      completed_at: action_items.completed_at,
      kid: engagements.kid,
    })
    .from(action_items)
    .leftJoin(engagements, eq(action_items.engagement_id, engagements.engagement_id))
    .where(
      and(
        eq(action_items.tenant_id, gate.tenantId),
        eq(action_items.assigned_to, userId),
        inArray(action_items.status, statuses),
      ),
    )
    .orderBy(desc(action_items.created_at));

  const projectsSet = new Set<string>();
  for (const it of items) if (it.kid) projectsSet.add(it.kid);

  return NextResponse.json({
    items,
    total: items.length,
    project_count: projectsSet.size,
  });
}
