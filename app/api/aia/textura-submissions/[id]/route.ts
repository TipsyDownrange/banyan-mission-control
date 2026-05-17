/**
 * BAN-309 Pass 3a.2 PR 3 — by-id GET + PATCH for textura_submissions.
 *
 * No DELETE (audit log). No Activity Spine emission (D3 CRUD-only).
 *
 * PATCHable: submission_status, textura_submission_id (vendor returns its
 * id), failure_reason, csv_file_ref. Forbidden: pay_app_id, engagement_id,
 * tenant_id, submitted_at, created_by.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, textura_submissions } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/aia/textura-submissions/[id]';

const STATUSES = new Set(['UPLOADED', 'FAILED', 'REJECTED', 'ACCEPTED', 'RESUBMITTED']);

const PATCHABLE_FIELDS = new Set([
  'submission_status', 'textura_submission_id', 'failure_reason', 'csv_file_ref',
]);

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const rows = await db
    .select()
    .from(textura_submissions)
    .where(
      and(
        eq(textura_submissions.submission_id, id),
        eq(textura_submissions.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: `textura_submission ${id} not found` }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!PATCHABLE_FIELDS.has(k)) {
      return NextResponse.json(
        { error: `field '${k}' is not patchable`, code: 'FIELD_NOT_PATCHABLE' },
        { status: 400 },
      );
    }
    if (k === 'submission_status' && typeof v === 'string' && !STATUSES.has(v)) {
      return NextResponse.json(
        { error: `submission_status must be one of ${[...STATUSES].join(', ')}` },
        { status: 400 },
      );
    }
    updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no patchable fields provided' }, { status: 400 });
  }
  updates.updated_at = new Date();

  const existing = await db
    .select({ submission_id: textura_submissions.submission_id })
    .from(textura_submissions)
    .where(
      and(
        eq(textura_submissions.submission_id, id),
        eq(textura_submissions.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: `textura_submission ${id} not found` }, { status: 404 });
  }

  await db
    .update(textura_submissions)
    .set(updates)
    .where(
      and(
        eq(textura_submissions.submission_id, id),
        eq(textura_submissions.tenant_id, gate.tenantId),
      ),
    );

  return NextResponse.json({ ok: true, submission_id: id });
}
