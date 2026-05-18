/**
 * BAN-340 PM-V1.0-A — GET/PATCH /api/submittals/[id]
 *
 * GET returns the submittal row.
 *
 * PATCH allows updates to the non-lifecycle fields (description, requirements,
 * required_by_date, lead_time_days, required_quantity, display_label,
 * current_assignee_user_id, external_visible, spec_document_ref). Status
 * changes do NOT flow through PATCH — use the /submit, /log-review, or a
 * dedicated transition route so the Pattern B emit fires atomically. PATCH
 * intentionally rejects `status` to keep state changes single-source.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, submittals } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/submittals/[id]';

const PATCH_ALLOWED_FIELDS = new Set<string>([
  'description',
  'requirements_text',
  'required_quantity',
  'required_by_date',
  'lead_time_days',
  'display_label',
  'current_assignee_user_id',
  'external_visible',
  'spec_document_ref',
  'csi_division',
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
    .from(submittals)
    .where(
      and(
        eq(submittals.submittal_id, id),
        eq(submittals.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'submittal not found' }, { status: 404 });
  }
  return NextResponse.json({ submittal: rows[0] });
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
        error: 'status changes must use /submit, /log-review, or a transition route',
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

  updates.updated_at = new Date();

  const updated = await db
    .update(submittals)
    .set(updates)
    .where(
      and(
        eq(submittals.submittal_id, id),
        eq(submittals.tenant_id, gate.tenantId),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: 'submittal not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, submittal: updated[0] });
}
