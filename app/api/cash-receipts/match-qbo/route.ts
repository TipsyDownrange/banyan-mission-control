/**
 * BAN-337 Pay Apps v2b — POST /api/cash-receipts/match-qbo
 *
 * Matches a pre-ingested unmatched QBO cash receipt (source=QBO_FEED,
 * reconciliation_status=UNMATCHED) to a specific pay app. Updates the
 * existing cash_receipts row in place and applies the standard transition
 * logic (PAID_PARTIAL vs PAID_FULL based on cumulative amount vs pay-app
 * balance).
 *
 * IMPORTANT: zero outbound QBO API calls. The QBO data was ingested by a
 * separate cron / sync process; this endpoint only reads + updates the
 * local cash_receipts row.
 *
 * Body: { receipt_id, pay_app_id }
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  cash_receipts,
  pay_applications,
  engagements,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { applyCashReceiptToPayApp } from '@/lib/aia/cash-receipt-transition';

interface Body {
  receipt_id?: string;
  pay_app_id?: string;
}

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, '/api/cash-receipts/match-qbo', 'project:edit');
  if (!gate.ok) return gate.response;

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const receiptId = (body.receipt_id ?? '').trim();
  const payAppId = (body.pay_app_id ?? '').trim();
  if (!receiptId) return NextResponse.json({ error: 'receipt_id is required' }, { status: 400 });
  if (!payAppId) return NextResponse.json({ error: 'pay_app_id is required' }, { status: 400 });

  const receiptRows = await db
    .select()
    .from(cash_receipts)
    .where(and(
      eq(cash_receipts.receipt_id, receiptId),
      eq(cash_receipts.tenant_id, gate.tenantId),
    ))
    .limit(1);
  if (receiptRows.length === 0) {
    return NextResponse.json({ error: 'cash receipt not found' }, { status: 404 });
  }
  const receipt = receiptRows[0];

  if (receipt.source !== 'QBO_FEED') {
    return NextResponse.json(
      { error: 'cash receipt is not a QBO_FEED row', code: 'NOT_QBO_FEED' },
      { status: 409 },
    );
  }
  if (receipt.reconciliation_status !== 'UNMATCHED') {
    return NextResponse.json(
      {
        error: `cash receipt is already reconciled (${receipt.reconciliation_status})`,
        code: 'ALREADY_RECONCILED',
      },
      { status: 409 },
    );
  }

  const payAppRow = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      engagement_id: pay_applications.engagement_id,
    })
    .from(pay_applications)
    .where(and(
      eq(pay_applications.pay_app_id, payAppId),
      eq(pay_applications.tenant_id, gate.tenantId),
    ))
    .limit(1);
  if (payAppRow.length === 0) {
    return NextResponse.json({ error: 'pay app not found' }, { status: 404 });
  }
  if (payAppRow[0].engagement_id !== receipt.engagement_id) {
    return NextResponse.json(
      {
        error: 'pay_app_id belongs to a different engagement than the cash receipt',
        code: 'ENGAGEMENT_MISMATCH',
      },
      { status: 400 },
    );
  }

  const engRow = await db
    .select({ is_test: engagements.is_test_project })
    .from(engagements)
    .where(eq(engagements.engagement_id, receipt.engagement_id))
    .limit(1);
  const isTest = !!engRow[0]?.is_test;

  // Attach the receipt to the pay app + record matched_by.
  await db
    .update(cash_receipts)
    .set({
      pay_app_id: payAppId,
      matched_at: new Date(),
      updated_at: new Date(),
    })
    .where(and(
      eq(cash_receipts.receipt_id, receiptId),
      eq(cash_receipts.tenant_id, gate.tenantId),
    ));

  const result = await applyCashReceiptToPayApp({
    tenantId: gate.tenantId,
    payAppId,
    receiptId,
    engagementId: receipt.engagement_id,
    amount: Number(receipt.amount),
    source: 'QBO_FEED',
    actorEmail: gate.actorEmail,
    testData: isTest,
    qboPaymentRef: receipt.qbo_payment_ref,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: true, receipt_id: receiptId, warning: result.message, code: result.code },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      receipt_id: receiptId,
      pay_app_id: payAppId,
      state: result.to_state,
      from_state: result.from_state,
      reconciliation_status: result.reconciliation_status,
      cumulative_received: result.cumulative_received,
      pay_app_due: result.pay_app_due,
      event_id: result.event_id,
    },
    {
      headers: {
        'x-qbo-outbound-calls': '0',
      },
    },
  );
}
