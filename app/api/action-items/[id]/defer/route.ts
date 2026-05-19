/**
 * BAN-344 PM-V1.0-E — POST /api/action-items/[id]/defer
 *
 * Transitions OPEN / IN_PROGRESS → DEFERRED.  Caller supplies a reason
 * (required for audit) and an optional new due_date.
 */

import { NextResponse } from 'next/server';
import { passActionItemWriteGate } from '@/lib/pm/action-items/api-gate';
import { executeActionItemTransition } from '@/lib/pm/action-items/state-transitions';
import {
  parseDueDate,
  resolveUserIdByEmail,
} from '@/lib/pm/action-items/route-utils';

const ROUTE_PATH = '/api/action-items/[id]/defer';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passActionItemWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: { reason?: string; due_date?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const reason = (body.reason ?? '').trim();
  if (!reason) {
    return NextResponse.json({ error: 'reason is required for defer' }, { status: 400 });
  }

  const extra: Record<string, unknown> = {};
  if (body.due_date !== undefined && body.due_date !== null && body.due_date !== '') {
    const d = parseDueDate(body.due_date);
    if (!d) return NextResponse.json({ error: 'due_date must be YYYY-MM-DD' }, { status: 400 });
    extra.due_date = d;
  }

  const actorUserId = await resolveUserIdByEmail(gate.actorEmail);

  const result = await executeActionItemTransition({
    actionItemId: id,
    tenantId: gate.tenantId,
    toState: 'DEFERRED',
    actorEmail: gate.actorEmail,
    actorUserId,
    reason,
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
