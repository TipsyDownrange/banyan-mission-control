/**
 * BAN-341 PM-V1.0-B — POST /api/rfis/[id]/resolve
 *
 * Marks an ANSWERED RFI as RESOLVED. Caller may supply:
 *   - generates_change_order: boolean (defaults to existing row value)
 *   - linked_change_order_id: uuid of the CO this RFI generated (optional)
 *
 * When generates_change_order resolves to true, an additional Pattern A
 * RFI_GENERATED_CO event is emitted inside the same transaction (see
 * lib/pm/rfis/execute-transition.ts). The CO entity itself is owned by
 * the AIA Billing trunk; v1.0 only records the linkage on this side.
 */

import { NextResponse } from 'next/server';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executeRfiTransition } from '@/lib/pm/rfis/execute-transition';

const ROUTE_PATH = '/api/rfis/[id]/resolve';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: {
    generates_change_order?: boolean;
    linked_change_order_id?: string | null;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const extraUpdates: Record<string, unknown> = {};
  if (typeof body.generates_change_order === 'boolean') {
    extraUpdates.generates_change_order = body.generates_change_order;
  }
  if (typeof body.linked_change_order_id === 'string' && body.linked_change_order_id.trim()) {
    extraUpdates.linked_change_order_id = body.linked_change_order_id.trim();
  } else if (body.linked_change_order_id === null) {
    extraUpdates.linked_change_order_id = null;
  }

  const result = await executeRfiTransition({
    rfiId: id,
    tenantId: gate.tenantId,
    toState: 'RESOLVED',
    actorEmail: gate.actorEmail,
    reason: body.reason ?? null,
    extraUpdates,
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
    co_event_id: result.co_event_id ?? null,
    rfi: result.rfi,
  });
}
