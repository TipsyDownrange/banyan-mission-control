/**
 * BAN-344a PM-V1.0-E (CORE) — POST /api/action-items/[id]/complete
 *
 * Transitions OPEN / IN_PROGRESS / DEFERRED → COMPLETED.  field_super may
 * only complete an action item assigned to themselves; pm / admin roles
 * may complete any row.
 */

import { NextResponse } from 'next/server';
import { passActionItemWriteGate } from '@/lib/pm/action-items/api-gate';
import { executeActionItemTransition } from '@/lib/pm/action-items/state-transitions';
import {
  getActionItemForTenant,
  resolveUserIdByEmail,
} from '@/lib/pm/action-items/route-utils';

const ROUTE_PATH = '/api/action-items/[id]/complete';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passActionItemWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: { reason?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const existing = await getActionItemForTenant(gate.tenantId, id);
  if (!existing) return NextResponse.json({ error: 'action item not found' }, { status: 404 });

  const actorUserId = await resolveUserIdByEmail(gate.actorEmail);

  if (gate.role === 'field_super') {
    if (!actorUserId || existing.assigned_to !== actorUserId) {
      return NextResponse.json(
        { error: 'field_super may only complete action items assigned to them' },
        { status: 403 },
      );
    }
  }

  const extra: Record<string, unknown> = {};
  if (typeof body.notes === 'string' && body.notes.trim()) {
    extra.notes = body.notes.trim();
  }

  const result = await executeActionItemTransition({
    actionItemId: id,
    tenantId: gate.tenantId,
    toState: 'COMPLETED',
    actorEmail: gate.actorEmail,
    actorUserId,
    reason: body.reason ?? null,
    extraUpdates: extra,
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
