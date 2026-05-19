/**
 * BAN-344a PM-V1.0-E (CORE) — POST /api/action-items/[id]/assign
 *
 * Assigns the action item to a user.  An OPEN row transitions to IN_PROGRESS
 * on first assignment; an IN_PROGRESS row receives the new assignment with
 * no state change.  Emits ACTION_ITEM_STATE_CHANGED.
 */

import { NextResponse } from 'next/server';
import { passActionItemWriteGate } from '@/lib/pm/action-items/api-gate';
import { executeActionItemTransition } from '@/lib/pm/action-items/state-transitions';
import {
  getActionItemForTenant,
  isUuid,
  resolveUserIdByEmail,
} from '@/lib/pm/action-items/route-utils';

const ROUTE_PATH = '/api/action-items/[id]/assign';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passActionItemWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: { assigned_to?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const assignedTo = (body.assigned_to ?? '').trim();
  if (!isUuid(assignedTo)) {
    return NextResponse.json({ error: 'assigned_to is required and must be a uuid' }, { status: 400 });
  }

  const existing = await getActionItemForTenant(gate.tenantId, id);
  if (!existing) return NextResponse.json({ error: 'action item not found' }, { status: 404 });

  const actorUserId = await resolveUserIdByEmail(gate.actorEmail);

  const toState = existing.status === 'OPEN' ? 'IN_PROGRESS' : (existing.status as 'IN_PROGRESS');
  const result = await executeActionItemTransition({
    actionItemId: id,
    tenantId: gate.tenantId,
    toState,
    actorEmail: gate.actorEmail,
    actorUserId,
    reason: body.reason ?? null,
    extraUpdates: { assigned_to: assignedTo },
    allowSameState: existing.status === 'IN_PROGRESS',
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    action_item_id: id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
    action_item: result.action_item,
  });
}
