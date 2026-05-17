/**
 * BAN-309 Pass 3a.2 PR 3 — list/create for textura_submissions (audit log).
 *
 *   GET  /api/aia/textura-submissions?pay_app_id=&limit=&offset=
 *   POST /api/aia/textura-submissions
 *
 * No DELETE (audit log). No Activity Spine emission (D3 CRUD-only).
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, textura_submissions, pay_applications } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/aia/textura-submissions';

const STATUSES = new Set(['UPLOADED', 'FAILED', 'REJECTED', 'ACCEPTED', 'RESUBMITTED']);

interface CreateBody {
  pay_app_id?: string;
  engagement_id?: string;
  csv_file_ref?: string;
  textura_submission_id?: string;
  submission_status?: string;
  failure_reason?: string;
  created_by?: string;
}

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const payAppId = url.searchParams.get('pay_app_id');
  if (!payAppId) {
    return NextResponse.json({ error: 'pay_app_id query param is required' }, { status: 400 });
  }
  const { limit, offset } = parsePagination(url);

  const rows = await db
    .select()
    .from(textura_submissions)
    .where(
      and(
        eq(textura_submissions.tenant_id, gate.tenantId),
        eq(textura_submissions.pay_app_id, payAppId),
      ),
    )
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ items: rows, limit, offset });
}

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payAppId = (body.pay_app_id ?? '').trim();
  const engagementId = (body.engagement_id ?? '').trim();
  const status = (body.submission_status ?? 'UPLOADED').trim();

  if (!payAppId) {
    return NextResponse.json({ error: 'pay_app_id is required' }, { status: 400 });
  }
  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
  }
  if (!STATUSES.has(status)) {
    return NextResponse.json(
      { error: `submission_status must be one of ${[...STATUSES].join(', ')}` },
      { status: 400 },
    );
  }

  const parent = await db
    .select({ pay_app_id: pay_applications.pay_app_id })
    .from(pay_applications)
    .where(
      and(
        eq(pay_applications.pay_app_id, payAppId),
        eq(pay_applications.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (parent.length === 0) {
    return NextResponse.json(
      { error: `pay_application ${payAppId} not found` },
      { status: 404 },
    );
  }

  const inserted = await db
    .insert(textura_submissions)
    .values({
      tenant_id: gate.tenantId,
      engagement_id: engagementId,
      pay_app_id: payAppId,
      csv_file_ref: body.csv_file_ref ?? null,
      textura_submission_id: body.textura_submission_id ?? null,
      submission_status: status,
      failure_reason: body.failure_reason ?? null,
      created_by: body.created_by ?? null,
    })
    .returning({ submission_id: textura_submissions.submission_id });

  return NextResponse.json(
    { ok: true, submission_id: inserted[0].submission_id },
    { status: 201 },
  );
}
