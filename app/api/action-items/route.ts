/**
 * BAN-344 PM-V1.0-E — POST /api/action-items + GET /api/action-items
 *
 * POST creates a MANUAL action item (or a derived action item where the
 * caller has supplied source_entity_type + source_entity_id explicitly).
 * Emits ACTION_ITEM_CREATED in the same Drizzle transaction.
 *
 * GET is the cross-project list surface (admin / PM only).  Per-project
 * list lives at /api/action-items/by-kid/[kid].  "My Open Actions" lives
 * at /api/action-items/by-assignee/[user_id].
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, engagements, action_items } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import {
  passActionItemCrossProjectGate,
  passActionItemWriteGate,
} from '@/lib/pm/action-items/api-gate';
import {
  isUuid,
  optionalString,
  parseActionItemPriority,
  parseActionItemSourceEntityType,
  parseActionItemStatus,
  parseDueDate,
  resolveEngagementByKid,
  resolveUserIdByEmail,
  trimString,
  defaultActionRequiredFor,
} from '@/lib/pm/action-items/route-utils';
import { TITLE_MAX } from '@/lib/pm/action-items/types';

const ROUTE_PATH = '/api/action-items';

export async function POST(req: Request) {
  const gate = await passActionItemWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = trimString(body.title);
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  if (title.length > TITLE_MAX) {
    return NextResponse.json({ error: `title must be ${TITLE_MAX} characters or fewer` }, { status: 400 });
  }

  const sourceEntityTypeRaw = trimString(body.source_entity_type) || 'MANUAL';
  const sourceEntityType = parseActionItemSourceEntityType(sourceEntityTypeRaw);
  if (!sourceEntityType) {
    return NextResponse.json({ error: 'source_entity_type is invalid' }, { status: 400 });
  }

  // For MANUAL, generate a new uuid as the source_entity_id so the
  // (source_entity_type, source_entity_id) index entry has a unique value.
  // For derived items, the caller supplies the source entity row id.
  let sourceEntityId = trimString(body.source_entity_id);
  if (sourceEntityType === 'MANUAL' && !sourceEntityId) {
    sourceEntityId = crypto.randomUUID();
  }
  if (!isUuid(sourceEntityId)) {
    return NextResponse.json({ error: 'source_entity_id must be a uuid' }, { status: 400 });
  }

  const sourceEventType = trimString(body.source_event_type) || 'MANUAL_CREATE';

  const priorityRaw = trimString(body.priority) || 'MEDIUM';
  const priority = parseActionItemPriority(priorityRaw);
  if (!priority) return NextResponse.json({ error: 'priority is invalid' }, { status: 400 });

  const dueDate = parseDueDate(body.due_date);
  if (body.due_date !== undefined && body.due_date !== null && body.due_date !== '' && !dueDate) {
    return NextResponse.json({ error: 'due_date must be YYYY-MM-DD' }, { status: 400 });
  }

  const actionRequiredInput = optionalString(body.action_required);
  const actionRequired = actionRequiredInput ?? defaultActionRequiredFor(sourceEntityType);

  const engagementKid = trimString(body.engagement_kid);
  const assignedToRaw = trimString(body.assigned_to);
  if (assignedToRaw && !isUuid(assignedToRaw)) {
    return NextResponse.json({ error: 'assigned_to must be a uuid' }, { status: 400 });
  }

  const createdByUserId = await resolveUserIdByEmail(gate.actorEmail);

  try {
    const result = await db.transaction(async (tx) => {
      let engagementId: string | null = null;
      let engagementKidVal: string | null = null;
      let isTestProject = false;
      if (engagementKid) {
        const engagement = await resolveEngagementByKid(gate.tenantId, engagementKid);
        if (!engagement) return { kind: 'engagement_not_found' as const };
        engagementId = engagement.engagement_id;
        engagementKidVal = engagement.kid ?? null;
        isTestProject = engagement.is_test_project === true;
      }

      const inserted = await tx
        .insert(action_items)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagementId,
          source_event_type: sourceEventType,
          source_entity_type: sourceEntityType,
          source_entity_id: sourceEntityId,
          title,
          description: optionalString(body.description),
          action_required: actionRequired,
          assigned_to: assignedToRaw || null,
          due_date: dueDate,
          priority,
          notes: optionalString(body.notes),
          created_by: createdByUserId,
        })
        .returning();

      const row = inserted[0];

      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'ACTION_ITEM_CREATED',
        scope_entity_type: engagementId ? 'project' : 'internal',
        scope_entity_id: engagementId ?? row.action_item_id,
        entity_kind: 'action_item',
        entity_id: row.action_item_id,
        kid: engagementKidVal,
        test_data: isTestProject,
        metadata: {
          source_event_type: sourceEventType,
          source_entity_type: sourceEntityType,
          source_entity_id: sourceEntityId,
          action_required: actionRequired,
          priority,
          assigned_to: assignedToRaw || null,
          actor: gate.actorEmail,
          auto_created: false,
        },
      });

      return { kind: 'ok' as const, action_item: row, event_id: emit.event_id };
    });

    if (result.kind === 'engagement_not_found') {
      return NextResponse.json({ error: `engagement not found for kid: ${engagementKid}` }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, action_item: result.action_item, event_id: result.event_id },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const gate = await passActionItemCrossProjectGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get('status');
  const priorityRaw = url.searchParams.get('priority');
  const sourceTypeRaw = url.searchParams.get('source_entity_type');
  const assigneeRaw = url.searchParams.get('assigned_to');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);

  const whereParts = [eq(action_items.tenant_id, gate.tenantId)];
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
      auto_closed_reason: action_items.auto_closed_reason,
      created_at: action_items.created_at,
      completed_at: action_items.completed_at,
      notes: action_items.notes,
      kid: engagements.kid,
    })
    .from(action_items)
    .leftJoin(engagements, eq(action_items.engagement_id, engagements.engagement_id))
    .where(and(...whereParts))
    .orderBy(desc(action_items.created_at))
    .limit(limit);

  return NextResponse.json({ items, total: items.length });
}
