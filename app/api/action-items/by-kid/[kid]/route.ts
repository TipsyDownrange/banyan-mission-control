/**
 * BAN-344a PM-V1.0-E (CORE) — GET /api/action-items/by-kid/[kid]
 *
 * Project-scoped action item list for ProjectsPanel.  Returns row payloads
 * plus a status/source/overdue summary.  Filters:
 *   - ?status=OPEN,IN_PROGRESS  (comma-separated)
 *   - ?priority=URGENT|HIGH|MEDIUM|LOW
 *   - ?source_entity_type=RFI|SUBMITTAL|...
 *   - ?assigned_to=<uuid>
 *   - ?overdue=true  (status in OPEN/IN_PROGRESS and due_date < today)
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { db, engagements, action_items } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import {
  isUuid,
  parseActionItemPriority,
  parseActionItemSourceEntityType,
  parseActionItemStatus,
} from '@/lib/pm/action-items/route-utils';
import {
  ACTION_ITEM_SOURCE_ENTITY_TYPES,
  ACTION_ITEM_STATUSES,
  OPEN_ACTIONABLE_STATUSES,
  type ActionItemStatus,
} from '@/lib/pm/action-items/types';

type RowLite = {
  status: string;
  priority: string;
  source_entity_type: string;
  due_date: string | null;
};

function emptyByStatus(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of ACTION_ITEM_STATUSES) out[s] = 0;
  return out;
}

function emptyBySource(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of ACTION_ITEM_SOURCE_ENTITY_TYPES) out[t] = 0;
  return out;
}

function summarize(items: RowLite[]) {
  const by_status = emptyByStatus();
  const by_source = emptyBySource();
  let open_count = 0;
  let overdue_count = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const it of items) {
    if (it.status in by_status) by_status[it.status] += 1;
    if (it.source_entity_type in by_source) by_source[it.source_entity_type] += 1;
    if (OPEN_ACTIONABLE_STATUSES.includes(it.status as ActionItemStatus)) {
      open_count += 1;
      if (it.due_date && it.due_date < today) overdue_count += 1;
    }
  }
  return { total: items.length, open_count, overdue_count, by_status, by_source };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ kid: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { kid: rawKid } = await context.params;
  const kid = decodeURIComponent(rawKid).trim();
  if (!kid) return NextResponse.json({ error: 'kid path param is required' }, { status: 400 });

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get('status');
  const priorityRaw = url.searchParams.get('priority');
  const sourceTypeRaw = url.searchParams.get('source_entity_type');
  const assigneeRaw = url.searchParams.get('assigned_to');
  const overdueRaw = url.searchParams.get('overdue');

  const engagementRows = await db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
      is_test_project: engagements.is_test_project,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenant_id, gate.tenantId),
        eq(engagements.kid, kid),
      ),
    )
    .limit(1);

  if (engagementRows.length === 0) {
    return NextResponse.json({
      kIDFound: false,
      engagement: null,
      items: [],
      summary: { total: 0, open_count: 0, overdue_count: 0, by_status: emptyByStatus(), by_source: emptyBySource() },
    });
  }

  const engagement = engagementRows[0];

  const whereParts = [
    eq(action_items.tenant_id, gate.tenantId),
    eq(action_items.engagement_id, engagement.engagement_id),
  ];
  if (statusRaw) {
    const statuses = statusRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const valid = statuses.map(parseActionItemStatus).filter((v): v is NonNullable<typeof v> => v !== null);
    if (valid.length > 0) whereParts.push(inArray(action_items.status, valid));
  }
  if (priorityRaw) {
    const p = parseActionItemPriority(priorityRaw);
    if (p) whereParts.push(eq(action_items.priority, p));
  }
  if (sourceTypeRaw) {
    const t = parseActionItemSourceEntityType(sourceTypeRaw);
    if (t) whereParts.push(eq(action_items.source_entity_type, t));
  }
  if (assigneeRaw && isUuid(assigneeRaw)) {
    whereParts.push(eq(action_items.assigned_to, assigneeRaw));
  }
  if (overdueRaw === 'true' || overdueRaw === '1') {
    const today = new Date().toISOString().slice(0, 10);
    whereParts.push(lt(action_items.due_date, today));
    whereParts.push(inArray(action_items.status, OPEN_ACTIONABLE_STATUSES));
  }

  const items = await db
    .select()
    .from(action_items)
    .where(and(...whereParts))
    .orderBy(desc(action_items.created_at));

  return NextResponse.json({
    kIDFound: true,
    engagement,
    items,
    summary: summarize(items as unknown as RowLite[]),
  });
}
