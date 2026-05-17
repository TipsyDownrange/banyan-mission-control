/**
 * BAN-309 Pass 3a.2 PR 3 — CRUD list/create for pay_app_line_items (G703 lines).
 *
 * No Activity Spine emission (D3 classification: child table, CRUD-only).
 *
 *   GET  /api/aia/pay-app-line-items?pay_app_id=...&limit=&offset=
 *   POST /api/aia/pay-app-line-items
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, pay_app_line_items, pay_applications } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/aia/pay-app-line-items';

interface CreateBody {
  pay_app_id?: string;
  line_number?: number;
  line_type?: string;
  description?: string;
  sov_line_id?: string | null;
  tm_authorization_id?: string | null;
  scheduled_value?: string | number;
  work_completed_previous?: string | number;
  work_completed_this_period?: string | number;
  stored_materials?: string | number;
  total_completed_and_stored?: string | number;
  percent_complete?: string | number;
  retainage_held?: string | number;
  balance_to_finish?: string | number;
}

const ALLOWED_LINE_TYPES = new Set([
  'LUMP_SUM', 'TM_AUTHORIZATION', 'MOBILIZATION', 'RETAINAGE_RELEASE',
  'DEPOSIT_DRAW_DOWN', 'STORED_MATERIALS', 'OTHER',
]);

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const payAppId = url.searchParams.get('pay_app_id');
  if (!payAppId) {
    return NextResponse.json(
      { error: 'pay_app_id query param is required' },
      { status: 400 },
    );
  }
  const { limit, offset } = parsePagination(url);

  const rows = await db
    .select()
    .from(pay_app_line_items)
    .where(
      and(
        eq(pay_app_line_items.tenant_id, gate.tenantId),
        eq(pay_app_line_items.pay_app_id, payAppId),
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
  const description = (body.description ?? '').trim();
  const lineType = (body.line_type ?? 'LUMP_SUM').trim();
  const lineNumber = body.line_number;

  if (!payAppId) {
    return NextResponse.json({ error: 'pay_app_id is required' }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }
  if (!Number.isInteger(lineNumber) || (lineNumber as number) < 1) {
    return NextResponse.json({ error: 'line_number must be a positive integer' }, { status: 400 });
  }
  if (!ALLOWED_LINE_TYPES.has(lineType)) {
    return NextResponse.json(
      { error: `line_type must be one of ${[...ALLOWED_LINE_TYPES].join(', ')}` },
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
    .insert(pay_app_line_items)
    .values({
      tenant_id: gate.tenantId,
      pay_app_id: payAppId,
      line_number: lineNumber as number,
      line_type: lineType,
      description,
      sov_line_id: body.sov_line_id ?? null,
      tm_authorization_id: body.tm_authorization_id ?? null,
      scheduled_value: String(body.scheduled_value ?? '0'),
      work_completed_previous: String(body.work_completed_previous ?? '0'),
      work_completed_this_period: String(body.work_completed_this_period ?? '0'),
      stored_materials: String(body.stored_materials ?? '0'),
      total_completed_and_stored: String(body.total_completed_and_stored ?? '0'),
      percent_complete: String(body.percent_complete ?? '0'),
      retainage_held: String(body.retainage_held ?? '0'),
      balance_to_finish: String(body.balance_to_finish ?? '0'),
    })
    .returning({ pay_app_line_id: pay_app_line_items.pay_app_line_id });

  return NextResponse.json(
    { ok: true, pay_app_line_id: inserted[0].pay_app_line_id },
    { status: 201 },
  );
}
