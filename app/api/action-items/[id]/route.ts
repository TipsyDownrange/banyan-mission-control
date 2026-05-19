/**
 * BAN-344 PM-V1.0-E — GET/PATCH /api/action-items/[id]
 *
 * GET returns the row + linked source-entity metadata.
 * PATCH applies allowed-field updates (title, description, action_required,
 * priority, assigned_to, due_date, notes).  Emits ACTION_ITEM_STATE_CHANGED
 * when assignment or any actionable field changes.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, action_items } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { passActionItemWriteGate } from '@/lib/pm/action-items/api-gate';
import {
  getActionItemForTenant,
  isPatchField,
  isUuid,
  optionalString,
  parseActionItemPriority,
  parseDueDate,
} from '@/lib/pm/action-items/route-utils';
import { TITLE_MAX } from '@/lib/pm/action-items/types';

const ROUTE_PATH = '/api/action-items/[id]';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const row = await getActionItemForTenant(gate.tenantId, id);
  if (!row) return NextResponse.json({ error: 'action item not found' }, { status: 404 });

  return NextResponse.json({ action_item: row });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passActionItemWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const existing = await getActionItemForTenant(gate.tenantId, id);
  if (!existing) return NextResponse.json({ error: 'action item not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!isPatchField(k)) continue;
    if (k === 'title') {
      const title = optionalString(v);
      if (!title) return NextResponse.json({ error: 'title cannot be blank' }, { status: 400 });
      if (title.length > TITLE_MAX) {
        return NextResponse.json({ error: `title must be ${TITLE_MAX} characters or fewer` }, { status: 400 });
      }
      updates.title = title;
    } else if (k === 'description') {
      updates.description = optionalString(v);
    } else if (k === 'action_required') {
      updates.action_required = optionalString(v);
    } else if (k === 'priority') {
      const p = parseActionItemPriority(v);
      if (!p) return NextResponse.json({ error: 'priority is invalid' }, { status: 400 });
      updates.priority = p;
    } else if (k === 'assigned_to') {
      if (v === null || v === '') {
        updates.assigned_to = null;
      } else if (isUuid(v)) {
        updates.assigned_to = v;
      } else {
        return NextResponse.json({ error: 'assigned_to must be a uuid or null' }, { status: 400 });
      }
    } else if (k === 'due_date') {
      if (v === null || v === '') {
        updates.due_date = null;
      } else {
        const d = parseDueDate(v);
        if (!d) return NextResponse.json({ error: 'due_date must be YYYY-MM-DD' }, { status: 400 });
        updates.due_date = d;
      }
    } else if (k === 'notes') {
      updates.notes = optionalString(v);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no allowed fields supplied' }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const updated = await tx
        .update(action_items)
        .set(updates)
        .where(
          and(
            eq(action_items.action_item_id, id),
            eq(action_items.tenant_id, gate.tenantId),
          ),
        )
        .returning();

      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'ACTION_ITEM_STATE_CHANGED',
        scope_entity_type: existing.engagement_id ? 'project' : 'internal',
        scope_entity_id: existing.engagement_id ?? id,
        entity_kind: 'action_item',
        entity_id: id,
        kid: existing.kid ?? null,
        test_data: existing.is_test_project === true,
        metadata: {
          from_state: existing.status,
          to_state: existing.status,
          patched_fields: Object.keys(updates),
          actor: gate.actorEmail,
        },
      });

      return { row: updated[0], event_id: emit.event_id };
    });
    return NextResponse.json({ ok: true, action_item: result.row, event_id: result.event_id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
