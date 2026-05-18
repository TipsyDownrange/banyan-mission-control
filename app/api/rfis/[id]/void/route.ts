/**
 * BAN-341 PM-V1.0-B — POST /api/rfis/[id]/void
 *
 * Voids an RFI from any non-terminal state. VOID is a terminal state and
 * cannot be reversed. The Pattern B emit fires inside the same Drizzle
 * transaction as the UPDATE.
 */

import { NextResponse } from 'next/server';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executeRfiTransition } from '@/lib/pm/rfis/execute-transition';

const ROUTE_PATH = '/api/rfis/[id]/void';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const result = await executeRfiTransition({
    rfiId: id,
    tenantId: gate.tenantId,
    toState: 'VOID',
    actorEmail: gate.actorEmail,
    reason: body.reason ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    rfi_id: id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
    rfi: result.rfi,
  });
}
