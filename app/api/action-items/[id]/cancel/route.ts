/**
 * BAN-344a PM-V1.0-E (CORE) — POST /api/action-items/[id]/cancel
 *
 * Transitions OPEN / IN_PROGRESS / DEFERRED → CANCELLED.  Caller supplies
 * a reason; recorded in notes for the audit trail.
 */

import { NextResponse } from 'next/server';
import { passActionItemWriteGate } from '@/lib/pm/action-items/api-gate';
import { executeActionItemTransition } from '@/lib/pm/action-items/state-transitions';
import { resolveUserIdByEmail } from '@/lib/pm/action-items/route-utils';

const ROUTE_PATH = '/api/action-items/[id]/cancel';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passActionItemWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const reason = (body.reason ?? '').trim();
  if (!reason) {
    return NextResponse.json({ error: 'reason is required for cancel' }, { status: 400 });
  }

  const actorUserId = await resolveUserIdByEmail(gate.actorEmail);

  const result = await executeActionItemTransition({
    actionItemId: id,
    tenantId: gate.tenantId,
    toState: 'CANCELLED',
    actorEmail: gate.actorEmail,
    actorUserId,
    reason,
    extraUpdates: { notes: reason },
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
