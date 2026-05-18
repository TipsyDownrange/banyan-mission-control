/**
 * BAN-341 PM-V1.0-B — POST /api/rfis/[id]/submit
 *
 * Drives the RFI from DRAFT (or ANSWERED, when the PM has follow-up
 * questions) into SUBMITTED. The caller may supply `submitted_to` (defaults
 * to the existing column value if already set); `submitted_date` defaults
 * to today. The Pattern B RFI_STATE_CHANGED emit fires in the same Drizzle
 * transaction as the UPDATE.
 *
 * PDF generation hook: when this transition lands on SUBMITTED for the
 * first time, the route emits the canonical RFI PDF (lib/pdf-rfi.tsx) and
 * stores the Drive file id on the row. Email delivery is recorded as a
 * downstream notification job and intentionally non-blocking — failures
 * are surfaced in the response without aborting the state change.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, rfis } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executeRfiTransition } from '@/lib/pm/rfis/execute-transition';

const ROUTE_PATH = '/api/rfis/[id]/submit';
const SUBMITTED_TO_VALUES = new Set(['GC', 'ARCHITECT', 'ENGINEER', 'OWNER']);

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: { submitted_to?: string; submitted_date?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const submittedToInput = (body.submitted_to ?? '').trim();
  if (submittedToInput && !SUBMITTED_TO_VALUES.has(submittedToInput)) {
    return NextResponse.json(
      { error: 'submitted_to must be one of GC, ARCHITECT, ENGINEER, OWNER' },
      { status: 400 },
    );
  }

  // Look up the existing submitted_to so callers re-submitting after an
  // ANSWERED follow-up don't have to provide it again.
  const existing = await db
    .select({ submitted_to: rfis.submitted_to, status: rfis.status })
    .from(rfis)
    .where(
      and(
        eq(rfis.rfi_id, id),
        eq(rfis.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: 'rfi not found' }, { status: 404 });
  }
  const effectiveSubmittedTo = submittedToInput || existing[0].submitted_to || '';
  if (!SUBMITTED_TO_VALUES.has(effectiveSubmittedTo)) {
    return NextResponse.json(
      { error: 'submitted_to is required (no prior value on this RFI)' },
      { status: 400 },
    );
  }

  const submittedDate = (body.submitted_date ?? '').trim() || new Date().toISOString().slice(0, 10);

  const result = await executeRfiTransition({
    rfiId: id,
    tenantId: gate.tenantId,
    toState: 'SUBMITTED',
    actorEmail: gate.actorEmail,
    reason: body.reason ?? null,
    extraUpdates: {
      submitted_to: effectiveSubmittedTo,
      submitted_date: submittedDate,
    },
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
