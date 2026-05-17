/**
 * BAN-309 Pass 3a.2 PR 3 — list/create for cash_receipts.
 *
 *   GET  /api/aia/cash-receipts?engagement_id=&pay_app_id=&limit=&offset=
 *   POST /api/aia/cash-receipts
 *
 * No Activity Spine emission (D3 CRUD-only).
 */

import { NextResponse } from 'next/server';
import { and, eq, type SQL } from 'drizzle-orm';
import { db, cash_receipts, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/aia/cash-receipts';

const SOURCES = new Set(['MANUAL', 'QBO_FEED']);
const RECON_STATUSES = new Set(['UNMATCHED', 'FULL', 'PARTIAL', 'OVER']);

interface CreateBody {
  engagement_id?: string;
  pay_app_id?: string | null;
  receipt_date?: string;
  amount?: string | number;
  source?: string;
  qbo_payment_ref?: string;
  reconciliation_status?: string;
  notes?: string;
}

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementId = url.searchParams.get('engagement_id');
  const payAppId = url.searchParams.get('pay_app_id');
  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id query param is required' }, { status: 400 });
  }
  const { limit, offset } = parsePagination(url);

  const filters: SQL[] = [
    eq(cash_receipts.tenant_id, gate.tenantId),
    eq(cash_receipts.engagement_id, engagementId),
  ];
  if (payAppId) filters.push(eq(cash_receipts.pay_app_id, payAppId));

  const rows = await db
    .select()
    .from(cash_receipts)
    .where(and(...filters))
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

  const engagementId = (body.engagement_id ?? '').trim();
  const receiptDate = (body.receipt_date ?? '').trim();
  const source = (body.source ?? 'MANUAL').trim();
  const reconStatus = (body.reconciliation_status ?? 'UNMATCHED').trim();

  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
  }
  if (!receiptDate) {
    return NextResponse.json({ error: 'receipt_date is required (YYYY-MM-DD)' }, { status: 400 });
  }
  if (body.amount == null || Number.isNaN(Number(body.amount))) {
    return NextResponse.json({ error: 'amount is required (numeric)' }, { status: 400 });
  }
  if (!SOURCES.has(source)) {
    return NextResponse.json(
      { error: `source must be one of ${[...SOURCES].join(', ')}` },
      { status: 400 },
    );
  }
  if (!RECON_STATUSES.has(reconStatus)) {
    return NextResponse.json(
      { error: `reconciliation_status must be one of ${[...RECON_STATUSES].join(', ')}` },
      { status: 400 },
    );
  }

  const eng = await db
    .select({ engagement_id: engagements.engagement_id })
    .from(engagements)
    .where(and(eq(engagements.engagement_id, engagementId), eq(engagements.tenant_id, gate.tenantId)))
    .limit(1);
  if (eng.length === 0) {
    return NextResponse.json({ error: `engagement ${engagementId} not found` }, { status: 404 });
  }

  const inserted = await db
    .insert(cash_receipts)
    .values({
      tenant_id: gate.tenantId,
      engagement_id: engagementId,
      pay_app_id: body.pay_app_id ?? null,
      receipt_date: receiptDate,
      amount: String(body.amount),
      source,
      qbo_payment_ref: body.qbo_payment_ref ?? null,
      reconciliation_status: reconStatus,
      notes: body.notes ?? null,
    })
    .returning({ receipt_id: cash_receipts.receipt_id });

  return NextResponse.json(
    { ok: true, receipt_id: inserted[0].receipt_id },
    { status: 201 },
  );
}
