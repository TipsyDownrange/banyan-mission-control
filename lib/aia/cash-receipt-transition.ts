/**
 * BAN-337 Pay Apps v2b — Shared helper that derives the post-receipt
 * pay-app state (PAID_PARTIAL vs PAID_FULL) and applies the transition
 * + CASH_RECEIPT_RECORDED emission inside a Drizzle tx.
 *
 * Used by both POST /api/cash-receipts (manual) and POST
 * /api/cash-receipts/match-qbo (QBO match). The two paths share the same
 * post-write side effects.
 */

import { and, eq, sql } from 'drizzle-orm';
import {
  db,
  pay_applications,
  cash_receipts,
} from '@/db';
import { executePatternBTransition } from './execute-state-transition';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';

export interface ApplyCashReceiptInput {
  tenantId: string;
  payAppId: string;
  receiptId: string;
  engagementId: string;
  amount: number;
  source: 'MANUAL' | 'QBO_FEED';
  actorEmail: string;
  testData: boolean;
  qboPaymentRef?: string | null;
}

export type ApplyCashReceiptResult =
  | {
      ok: true;
      to_state: 'PAID_PARTIAL' | 'PAID_FULL';
      from_state: string;
      reconciliation_status: 'FULL' | 'PARTIAL' | 'OVER';
      cumulative_received: number;
      pay_app_due: number;
      event_id: string;
    }
  | { ok: false; status: number; code: string; message: string };

export async function applyCashReceiptToPayApp(
  input: ApplyCashReceiptInput,
): Promise<ApplyCashReceiptResult> {
  const payAppRows = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      state: pay_applications.state,
      current_amount_due: pay_applications.current_amount_due,
      total_earned_less_retainage: pay_applications.total_earned_less_retainage,
    })
    .from(pay_applications)
    .where(and(
      eq(pay_applications.pay_app_id, input.payAppId),
      eq(pay_applications.tenant_id, input.tenantId),
    ))
    .limit(1);

  if (payAppRows.length === 0) {
    return { ok: false, status: 404, code: 'PAY_APP_NOT_FOUND', message: 'pay app not found' };
  }
  const payApp = payAppRows[0];

  // Cumulative across all receipts for this pay app (including the one we
  // just inserted via the caller).
  const totals = await db
    .select({
      sum: sql<string>`COALESCE(SUM(${cash_receipts.amount}), 0)`,
    })
    .from(cash_receipts)
    .where(and(
      eq(cash_receipts.tenant_id, input.tenantId),
      eq(cash_receipts.pay_app_id, input.payAppId),
    ));
  const cumulative = Number(totals[0]?.sum ?? 0);

  // Prefer current_amount_due; fall back to total_earned_less_retainage.
  const due = Number(payApp.current_amount_due ?? payApp.total_earned_less_retainage ?? 0);

  let reconciliation: 'FULL' | 'PARTIAL' | 'OVER' = 'PARTIAL';
  let toState: 'PAID_PARTIAL' | 'PAID_FULL';
  if (due > 0 && cumulative >= due - 0.005) {
    reconciliation = cumulative > due + 0.005 ? 'OVER' : 'FULL';
    toState = 'PAID_FULL';
  } else {
    toState = 'PAID_PARTIAL';
  }

  // Mark the receipt reconciled before transitioning state.
  await db
    .update(cash_receipts)
    .set({
      reconciliation_status: reconciliation,
      matched_at: new Date(),
      updated_at: new Date(),
    })
    .where(and(
      eq(cash_receipts.receipt_id, input.receiptId),
      eq(cash_receipts.tenant_id, input.tenantId),
    ));

  // CASH_RECEIPT_RECORDED Pattern A emit (audit trail before state change).
  await db.transaction(async (tx) => {
    await emitActivitySpineEvent(tx, {
      event_type: 'CASH_RECEIPT_RECORDED',
      scope_entity_type: 'project',
      scope_entity_id: input.engagementId,
      entity_kind: 'cash_receipt',
      entity_id: input.receiptId,
      notes: `Cash receipt ${input.source} ${input.amount.toFixed(2)} applied to pay app`,
      test_data: input.testData,
      metadata: {
        receipt_id: input.receiptId,
        pay_app_id: input.payAppId,
        amount: input.amount,
        cumulative_received: cumulative,
        pay_app_due: due,
        source: input.source,
        reconciliation_status: reconciliation,
        qbo_payment_ref: input.qboPaymentRef ?? null,
        actor: input.actorEmail,
      },
    });
  });

  // GC_APPROVED is the canonical predecessor for PAID_PARTIAL/PAID_FULL.
  // PAID_PARTIAL → PAID_FULL is also allowed when subsequent receipts fill
  // the balance. Both branches go through executePatternBTransition.
  const transition = await executePatternBTransition({
    entity: 'pay_application',
    table: pay_applications,
    pkColumn: pay_applications.pay_app_id,
    pkValue: input.payAppId,
    tenantColumn: pay_applications.tenant_id,
    tenantId: input.tenantId,
    stateColumn: pay_applications.state,
    toState,
    reason: `Cash receipt applied: $${input.amount.toFixed(2)} (${input.source})`,
    actorEmail: input.actorEmail,
    testData: input.testData,
    engagementId: input.engagementId,
  });

  if (!transition.ok) {
    return {
      ok: false,
      status: transition.status,
      code: transition.code,
      message: transition.message,
    };
  }

  return {
    ok: true,
    to_state: toState,
    from_state: transition.from_state,
    reconciliation_status: reconciliation,
    cumulative_received: cumulative,
    pay_app_due: due,
    event_id: transition.event_id,
  };
}
