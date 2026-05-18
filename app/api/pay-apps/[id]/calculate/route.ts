/**
 * BAN-336 Pay App Core — POST /api/pay-apps/[id]/calculate
 *
 * Recompute the pay_applications header totals (lines 1–9 of G702) from the
 * current pay_app_line_items + parent SOV totals + the engagement's
 * billing_format_config. Idempotent; safe to run from the Edit screen on
 * every line change.
 */

import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import {
  db,
  pay_applications,
  pay_app_line_items,
  billing_format_config,
  schedule_of_values,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { calcG703Line, summarizeG702 } from '@/lib/aia/pay-app-calc';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, '/api/pay-apps/[id]/calculate', 'project:edit');
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const row = await db
    .select()
    .from(pay_applications)
    .where(and(
      eq(pay_applications.pay_app_id, id),
      eq(pay_applications.tenant_id, gate.tenantId),
    ))
    .limit(1);
  if (row.length === 0) {
    return NextResponse.json({ error: 'pay app not found' }, { status: 404 });
  }
  const payApp = row[0];

  const [lines, cfgRows, sovTotals] = await Promise.all([
    db
      .select()
      .from(pay_app_line_items)
      .where(and(
        eq(pay_app_line_items.tenant_id, gate.tenantId),
        eq(pay_app_line_items.pay_app_id, id),
      )),
    db
      .select()
      .from(billing_format_config)
      .where(and(
        eq(billing_format_config.tenant_id, gate.tenantId),
        eq(billing_format_config.engagement_id, payApp.engagement_id),
      ))
      .limit(1),
    payApp.sov_version_id
      ? db
          .select({ total: sql<string>`COALESCE(SUM(${schedule_of_values.scheduled_value}), 0)` })
          .from(schedule_of_values)
          .where(and(
            eq(schedule_of_values.tenant_id, gate.tenantId),
            eq(schedule_of_values.sov_version_id, payApp.sov_version_id),
          ))
      : Promise.resolve([{ total: '0' }]),
  ]);

  const retainagePct = cfgRows[0]?.retainage_pct ? Number(cfgRows[0].retainage_pct) / 100 : 0.10;
  const calcs = lines.map((l) => calcG703Line({
    scheduled_value: Number(l.scheduled_value || 0),
    work_completed_previous: Number(l.work_completed_previous || 0),
    work_completed_this_period: Number(l.work_completed_this_period || 0),
    materials_stored_this_period: Number(l.stored_materials || 0),
    retainage_pct: retainagePct,
  }));

  const originalContract = Number(payApp.contract_sum_original ?? sovTotals[0]?.total ?? 0);
  const netChangeByCo = Number(payApp.net_change_by_co ?? 0);
  const lessPrev = Number(payApp.less_previous_certificates ?? 0);

  const g702 = summarizeG702({
    lines: calcs,
    originalContractSum: originalContract,
    netChangeByCo,
    lessPreviousCertificates: lessPrev,
    retainagePctCompleted: retainagePct,
    retainagePctStored: retainagePct,
  });

  await db
    .update(pay_applications)
    .set({
      contract_sum_to_date: g702.line3_contract_sum_to_date.toFixed(2),
      work_completed_to_date: (g702.line4_total_completed_and_stored - calcs.reduce((s, c) => s + c.materials_stored_this_period, 0)).toFixed(2),
      stored_materials_to_date: calcs.reduce((s, c) => s + c.materials_stored_this_period, 0).toFixed(2),
      retainage_held: g702.line5_total_retainage.toFixed(2),
      total_earned_less_retainage: g702.line6_total_earned_less_retainage.toFixed(2),
      current_amount_due: g702.line8_current_payment_due.toFixed(2),
      updated_at: new Date(),
    })
    .where(and(
      eq(pay_applications.pay_app_id, id),
      eq(pay_applications.tenant_id, gate.tenantId),
    ));

  return NextResponse.json({ ok: true, summary: g702 });
}
