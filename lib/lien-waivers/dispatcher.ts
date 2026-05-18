/**
 * BAN-338 Pay Apps v2c — Lien waiver auto-generation dispatcher.
 *
 * Subscribed by the pay app lifecycle routes (submit-direct, transition).
 * Given a pay app transition, computes whether a waiver should be created
 * via auto-generation.ts:computeWaiverTypeForTransition, dedupes against
 * existing rows, INSERTs the lien_waivers row, and emits
 * LIEN_WAIVER_GENERATED — all inside the caller's Drizzle tx so the row
 * write and the spine emit commit/rollback together.
 *
 * PDF rendering is intentionally deferred: the dispatcher records the
 * waiver row with state=GENERATED and a placeholder pdf_drive_id slot;
 * the actual PDF render + Drive upload happens in a follow-up job (the
 * v2c manual-PDF path lives in lib/lien-waivers/pdf-render.ts, which is a
 * stub).
 */

import { and, eq } from 'drizzle-orm';
import { lien_waivers } from '@/db/schema';
import {
  emitActivitySpineEvent,
  type ActivitySpineTx,
} from '@/lib/activity-spine/emit';
import {
  computeWaiverTypeForTransition,
  shouldGenerateWaiver,
  type AutoWaiverDecision,
} from './auto-generation';

export interface DispatchAutoWaiverInput {
  tenantId: string;
  engagementId: string;
  payAppId: string;
  payAppNumber: number;
  payAppCurrentAmountDue: string | number | null;
  payAppPeriodEnd: Date | string | null;
  isFinalPayApp: boolean;
  toState: string;
  isTestProject: boolean;
  actorEmail: string;
}

export interface DispatchAutoWaiverResult {
  generated: boolean;
  reason?: 'NOT_AUTO_TRANSITION' | 'ALREADY_EXISTS';
  waiver_id?: string;
  waiver_type?: AutoWaiverDecision['waiver_type'];
  event_id?: string;
}

export async function dispatchAutoLienWaiver(
  tx: ActivitySpineTx,
  input: DispatchAutoWaiverInput,
): Promise<DispatchAutoWaiverResult> {
  const decision = computeWaiverTypeForTransition({
    to_state: input.toState,
    is_final_pay_app: input.isFinalPayApp,
  });
  if (!decision) {
    return { generated: false, reason: 'NOT_AUTO_TRANSITION' };
  }

  const existing = await tx
    .select({
      pay_app_id: lien_waivers.pay_app_id,
      waiver_type: lien_waivers.waiver_type,
      state: lien_waivers.state,
    })
    .from(lien_waivers)
    .where(
      and(
        eq(lien_waivers.tenant_id, input.tenantId),
        eq(lien_waivers.pay_app_id, input.payAppId),
      ),
    );

  const shouldGen = shouldGenerateWaiver({
    payAppId: input.payAppId,
    decision,
    existing: existing.map((e) => ({
      pay_app_id: e.pay_app_id,
      waiver_type: e.waiver_type as AutoWaiverDecision['waiver_type'],
      state: e.state,
    })),
  });
  if (!shouldGen) {
    return { generated: false, reason: 'ALREADY_EXISTS' };
  }

  const amount =
    input.payAppCurrentAmountDue === null || input.payAppCurrentAmountDue === undefined
      ? null
      : String(input.payAppCurrentAmountDue);

  const throughDate =
    input.payAppPeriodEnd === null || input.payAppPeriodEnd === undefined
      ? null
      : input.payAppPeriodEnd instanceof Date
      ? input.payAppPeriodEnd.toISOString().slice(0, 10)
      : String(input.payAppPeriodEnd);

  const now = new Date();
  const inserted = await tx
    .insert(lien_waivers)
    .values({
      tenant_id: input.tenantId,
      engagement_id: input.engagementId,
      pay_app_id: input.payAppId,
      waiver_type: decision.waiver_type,
      waiver_amount: amount,
      through_date: throughDate,
      state: 'GENERATED',
      trigger_source: decision.trigger_source,
      generated_at: now,
    })
    .returning({ waiver_id: lien_waivers.waiver_id });

  const waiverId = inserted[0]?.waiver_id;
  if (!waiverId) {
    throw new Error('lien_waivers INSERT returned no rows');
  }

  const emit = await emitActivitySpineEvent(tx, {
    event_type: 'LIEN_WAIVER_GENERATED',
    scope_entity_type: 'project',
    scope_entity_id: input.engagementId,
    entity_kind: 'lien_waiver',
    entity_id: waiverId,
    notes: `Auto-generated ${decision.waiver_type} for pay app #${input.payAppNumber}`,
    reported_by: input.actorEmail || null,
    test_data: !!input.isTestProject,
    metadata: {
      waiver_type: decision.waiver_type,
      trigger_source: decision.trigger_source,
      pay_app_id: input.payAppId,
      pay_app_number: input.payAppNumber,
      to_state: input.toState,
      is_final_pay_app: input.isFinalPayApp,
      amount,
      through_date: throughDate,
    },
  });

  return {
    generated: true,
    waiver_id: waiverId,
    waiver_type: decision.waiver_type,
    event_id: emit.event_id,
  };
}
