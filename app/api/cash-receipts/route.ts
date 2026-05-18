/**
 * BAN-337 Pay Apps v2b — POST /api/cash-receipts (manual entry)
 *
 * Records a cash receipt against a pay app. When a pay_app_id is provided,
 * applies the standard cumulative-receipt logic: <= due → PAID_PARTIAL,
 * == due → PAID_FULL, > due → PAID_FULL + OVER reconciliation status.
 *
 * Manual entry is the operator-friendly path; QBO-matched receipts live on
 * POST /api/cash-receipts/match-qbo.
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
  engagement_id?: string;
  pay_app_id?: string;
  receipt_date?: string;
  amount?: number | string;
  notes?: string;
}

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, '/api/cash-receipts', 'project:edit');
  if (!gate.ok) return gate.response;

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const engagementId = (body.engagement_id ?? '').trim();
  const payAppId = (body.pay_app_id ?? '').trim();
  const receiptDate = (body.receipt_date ?? '').trim();
  const amountNum = Number(body.amount);

  if (!engagementId) return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
  if (!receiptDate) return NextResponse.json({ error: 'receipt_date is required (YYYY-MM-DD)' }, { status: 400 });
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const engRow = await db
    .select({ is_test: engagements.is_test_project })
    .from(engagements)
    .where(and(
      eq(engagements.engagement_id, engagementId),
      eq(engagements.tenant_id, gate.tenantId),
    ))
    .limit(1);
  if (engRow.length === 0) {
    return NextResponse.json({ error: 'engagement not found' }, { status: 404 });
  }
  const isTest = !!engRow[0].is_test;

  if (payAppId) {
    const payAppCheck = await db
      .select({ engagement_id: pay_applications.engagement_id })
      .from(pay_applications)
      .where(and(
        eq(pay_applications.pay_app_id, payAppId),
        eq(pay_applications.tenant_id, gate.tenantId),
      ))
      .limit(1);
    if (payAppCheck.length === 0) {
      return NextResponse.json({ error: 'pay_app_id not found in this tenant' }, { status: 404 });
    }
    if (payAppCheck[0].engagement_id !== engagementId) {
      return NextResponse.json(
        { error: 'pay_app_id does not belong to engagement_id' },
        { status: 400 },
      );
    }
  }

  // Insert the receipt.
  const inserted = await db
    .insert(cash_receipts)
    .values({
      tenant_id: gate.tenantId,
      engagement_id: engagementId,
      pay_app_id: payAppId || null,
      receipt_date: receiptDate,
      amount: amountNum.toFixed(2),
      source: 'MANUAL',
      reconciliation_status: payAppId ? 'PARTIAL' : 'UNMATCHED',
      notes: body.notes ?? null,
    })
    .returning({ receipt_id: cash_receipts.receipt_id });

  const receiptId = inserted[0].receipt_id;

  // No pay app target → just record. (Common for advance deposit checks
  // that arrive before the first pay app is generated.)
  if (!payAppId) {
    return NextResponse.json({
      ok: true,
      receipt_id: receiptId,
      reconciliation_status: 'UNMATCHED',
      pay_app_id: null,
    });
  }

  const result = await applyCashReceiptToPayApp({
    tenantId: gate.tenantId,
    payAppId,
    receiptId,
    engagementId,
    amount: amountNum,
    source: 'MANUAL',
    actorEmail: gate.actorEmail,
    testData: isTest,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: true,
        receipt_id: receiptId,
        warning: `Receipt recorded but state transition failed: ${result.message}`,
        code: result.code,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    receipt_id: receiptId,
    pay_app_id: payAppId,
    state: result.to_state,
    from_state: result.from_state,
    reconciliation_status: result.reconciliation_status,
    cumulative_received: result.cumulative_received,
    pay_app_due: result.pay_app_due,
    event_id: result.event_id,
  });
}
