/**
 * BAN-341 PM-V1.0-B — GET/PATCH /api/rfis/[id]
 *
 * GET returns the rfi row.
 *
 * PATCH allows updates to non-lifecycle fields (subject, question,
 * reason_for_rfi, cost/schedule impact, required_response_by_date,
 * external_visible, rfi_pdf_drive_id, submitted_attachments,
 * generates_change_order, linked_change_order_id). Status changes do NOT
 * flow through PATCH — use the /submit, /log-response, /resolve, or /void
 * transition routes so the Pattern B emit fires atomically.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, rfis } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/rfis/[id]';

const PATCH_ALLOWED_FIELDS = new Set<string>([
  'subject',
  'question',
  'reason_for_rfi',
  'cost_or_schedule_impact_anticipated',
  'cost_impact_estimate',
  'schedule_impact_days',
  'required_response_by_date',
  'external_visible',
  'rfi_pdf_drive_id',
  'submitted_attachments',
  'generates_change_order',
  'linked_change_order_id',
]);

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const rows = await db
    .select()
    .from(rfis)
    .where(
      and(
        eq(rfis.rfi_id, id),
        eq(rfis.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'rfi not found' }, { status: 404 });
  }
  return NextResponse.json({ rfi: rows[0] });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if ('status' in body) {
    return NextResponse.json(
      {
        error: 'status changes must use /submit, /log-response, /resolve, or /void',
        code: 'STATUS_PATCH_FORBIDDEN',
      },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (PATCH_ALLOWED_FIELDS.has(k)) updates[k] = v;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No allowed fields provided in PATCH body' },
      { status: 400 },
    );
  }

  if (typeof updates.subject === 'string' && updates.subject.length > 120) {
    return NextResponse.json(
      { error: 'subject must be 120 characters or fewer' },
      { status: 400 },
    );
  }

  updates.updated_at = new Date();

  const updated = await db
    .update(rfis)
    .set(updates)
    .where(
      and(
        eq(rfis.rfi_id, id),
        eq(rfis.tenant_id, gate.tenantId),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: 'rfi not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, rfi: updated[0] });
}
