/**
 * BAN-341 PM-V1.0-B — POST /api/rfis/[id]/log-response
 *
 * Records a response received on a submitted RFI. Drives the lifecycle:
 *   SUBMITTED    → ANSWERED
 *   UNDER_REVIEW → ANSWERED
 *
 * Stamps response_received_date (defaults to today) and writes the
 * response_text + optional response_documents[]. The Pattern B emit fires
 * inside the same Drizzle transaction as the UPDATE.
 *
 * After ANSWERED, the PM can either /resolve (accept) or /submit again
 * (follow-up questions — ball returns to the reviewer).
 */

import { NextResponse } from 'next/server';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executeRfiTransition } from '@/lib/pm/rfis/execute-transition';

const ROUTE_PATH = '/api/rfis/[id]/log-response';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: {
    response_text?: string;
    response_received_date?: string;
    response_documents?: unknown;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const responseText = typeof body.response_text === 'string' ? body.response_text : '';
  if (!responseText.trim()) {
    return NextResponse.json({ error: 'response_text is required' }, { status: 400 });
  }
  const responseDate = (body.response_received_date ?? '').trim()
    || new Date().toISOString().slice(0, 10);

  const responseDocs = Array.isArray(body.response_documents)
    ? body.response_documents.filter((x): x is string => typeof x === 'string')
    : [];

  const extraUpdates: Record<string, unknown> = {
    response_text: responseText,
    response_received_date: responseDate,
  };
  if (responseDocs.length > 0) {
    extraUpdates.response_documents = responseDocs;
  }

  const result = await executeRfiTransition({
    rfiId: id,
    tenantId: gate.tenantId,
    toState: 'ANSWERED',
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
    rfi: result.rfi,
  });
}
