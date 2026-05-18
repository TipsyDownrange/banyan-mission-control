/**
 * BAN-337 Pay Apps v2b — GET /api/qbo/unmatched-payments
 *
 * Returns unmatched cash_receipts that were ingested from QBO (source=
 * 'QBO_FEED', reconciliation_status='UNMATCHED'). The QBO ingest pipeline
 * lives elsewhere; this read endpoint does NOT call QBO — by spec the
 * BAN-337 cash-receipt loop has ZERO outbound QBO API calls.
 *
 * Query params:
 *   engagement_id  — optional, scope to one engagement
 *   limit, offset  — pagination (default 50)
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { db, cash_receipts } from '@/db';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementId = url.searchParams.get('engagement_id');
  const { limit, offset } = parsePagination(url);

  const filters: SQL[] = [
    eq(cash_receipts.tenant_id, gate.tenantId),
    eq(cash_receipts.source, 'QBO_FEED'),
    eq(cash_receipts.reconciliation_status, 'UNMATCHED'),
  ];
  if (engagementId) filters.push(eq(cash_receipts.engagement_id, engagementId));

  const rows = await db
    .select({
      receipt_id: cash_receipts.receipt_id,
      engagement_id: cash_receipts.engagement_id,
      pay_app_id: cash_receipts.pay_app_id,
      receipt_date: cash_receipts.receipt_date,
      amount: cash_receipts.amount,
      qbo_payment_ref: cash_receipts.qbo_payment_ref,
      notes: cash_receipts.notes,
      created_at: cash_receipts.created_at,
    })
    .from(cash_receipts)
    .where(and(...filters))
    .orderBy(desc(cash_receipts.receipt_date))
    .limit(limit)
    .offset(offset);

  // Header tells observability layers this path doesn't hit QBO.
  return new NextResponse(JSON.stringify({ items: rows, limit, offset }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-qbo-outbound-calls': '0',
      'x-data-source': 'cash_receipts.QBO_FEED.UNMATCHED',
    },
  });
}
