/**
 * BAN-336 Pay App Core — GET + PATCH on a single pay_application.
 *
 * GET /api/pay-apps/[id]
 *   Returns the pay app + its line items + the SOV lines (so the G703 grid
 *   has both the hierarchy and the current values).
 *
 * PATCH /api/pay-apps/[id]
 *   Body: { lines: [{ pay_app_line_id, work_completed_this_period,
 *                     materials_stored_this_period }, ...] }
 *   State-gated: only allowed while the pay app is in PENDING_DRAFT.
 *   Validates each line via lib/aia/pay-app-calc.validateG703Line then
 *   recomputes G/H/I and rewrites the row.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  pay_applications,
  pay_app_line_items,
  schedule_of_values,
  billing_format_config,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { calcG703Line, validateG703Line } from '@/lib/aia/pay-app-calc';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const payAppRow = await db
    .select()
    .from(pay_applications)
    .where(and(
      eq(pay_applications.pay_app_id, id),
      eq(pay_applications.tenant_id, gate.tenantId),
    ))
    .limit(1);
  if (payAppRow.length === 0) {
    return NextResponse.json({ error: 'pay app not found' }, { status: 404 });
  }
  const payApp = payAppRow[0];

  const [lines, sovLines, cfg] = await Promise.all([
    db
      .select()
      .from(pay_app_line_items)
      .where(and(
        eq(pay_app_line_items.tenant_id, gate.tenantId),
        eq(pay_app_line_items.pay_app_id, id),
      ))
      .orderBy(pay_app_line_items.line_number),
    payApp.sov_version_id
      ? db
          .select()
          .from(schedule_of_values)
          .where(and(
            eq(schedule_of_values.tenant_id, gate.tenantId),
            eq(schedule_of_values.sov_version_id, payApp.sov_version_id),
          ))
      : Promise.resolve([]),
    db
      .select()
      .from(billing_format_config)
      .where(and(
        eq(billing_format_config.tenant_id, gate.tenantId),
        eq(billing_format_config.engagement_id, payApp.engagement_id),
      ))
      .limit(1),
  ]);

  return NextResponse.json({
    pay_app: payApp,
    line_items: lines,
    sov_lines: sovLines,
    billing_format_config: cfg[0] ?? null,
  });
}

interface PatchLineInput {
  pay_app_line_id: string;
  work_completed_this_period?: number | string;
  materials_stored_this_period?: number | string;
  scheduled_value?: number | string;
  work_completed_previous?: number | string;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, '/api/pay-apps/[id]', 'project:edit');
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: { lines?: PatchLineInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.lines || !Array.isArray(body.lines)) {
    return NextResponse.json({ error: 'lines array is required' }, { status: 400 });
  }

  const payAppRow = await db
    .select({ state: pay_applications.state, engagement_id: pay_applications.engagement_id })
    .from(pay_applications)
    .where(and(
      eq(pay_applications.pay_app_id, id),
      eq(pay_applications.tenant_id, gate.tenantId),
    ))
    .limit(1);
  if (payAppRow.length === 0) {
    return NextResponse.json({ error: 'pay app not found' }, { status: 404 });
  }
  if (payAppRow[0].state !== 'PENDING_DRAFT') {
    return NextResponse.json(
      { error: `pay app must be PENDING_DRAFT to edit (current: ${payAppRow[0].state})` },
      { status: 409 },
    );
  }

  const cfg = await db
    .select({ retainage_pct: billing_format_config.retainage_pct })
    .from(billing_format_config)
    .where(and(
      eq(billing_format_config.tenant_id, gate.tenantId),
      eq(billing_format_config.engagement_id, payAppRow[0].engagement_id),
    ))
    .limit(1);
  const retainagePct = cfg[0]?.retainage_pct ? Number(cfg[0].retainage_pct) / 100 : 0.10;

  // Fetch current rows so we can fill scheduled_value / work_completed_previous
  // if the patch body only carries the editable fields E + F.
  const existingLines = await db
    .select()
    .from(pay_app_line_items)
    .where(and(
      eq(pay_app_line_items.tenant_id, gate.tenantId),
      eq(pay_app_line_items.pay_app_id, id),
    ));
  const byId = new Map(existingLines.map((l) => [l.pay_app_line_id, l]));

  const errors: { pay_app_line_id: string; code: string; message: string }[] = [];
  const updates: { line: typeof existingLines[number]; calc: ReturnType<typeof calcG703Line> }[] = [];

  for (const patch of body.lines) {
    const cur = byId.get(patch.pay_app_line_id);
    if (!cur) {
      errors.push({ pay_app_line_id: patch.pay_app_line_id, code: 'NOT_FOUND', message: 'line not found' });
      continue;
    }
    const c = Number(patch.scheduled_value ?? cur.scheduled_value ?? 0);
    const d = Number(patch.work_completed_previous ?? cur.work_completed_previous ?? 0);
    const e = Number(patch.work_completed_this_period ?? cur.work_completed_this_period ?? 0);
    const f = Number(patch.materials_stored_this_period ?? cur.stored_materials ?? 0);
    const v = validateG703Line({
      scheduled_value: c,
      work_completed_previous: d,
      work_completed_this_period: e,
      materials_stored_this_period: f,
      retainage_pct: retainagePct,
    });
    if (!v.ok) {
      errors.push({ pay_app_line_id: patch.pay_app_line_id, code: v.code, message: v.message });
      continue;
    }
    const calc = calcG703Line({
      scheduled_value: c,
      work_completed_previous: d,
      work_completed_this_period: e,
      materials_stored_this_period: f,
      retainage_pct: retainagePct,
    });
    updates.push({ line: cur, calc });
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'validation_failed', details: errors }, { status: 422 });
  }

  await db.transaction(async (tx) => {
    for (const { line, calc } of updates) {
      await tx
        .update(pay_app_line_items)
        .set({
          scheduled_value: calc.scheduled_value.toFixed(2),
          work_completed_previous: calc.work_completed_previous.toFixed(2),
          work_completed_this_period: calc.work_completed_this_period.toFixed(2),
          stored_materials: calc.materials_stored_this_period.toFixed(2),
          total_completed_and_stored: calc.total_completed_to_date.toFixed(2),
          percent_complete: (calc.pct_complete * 100).toFixed(2),
          retainage_held: calc.retainage_held.toFixed(2),
          balance_to_finish: calc.balance_to_finish.toFixed(2),
          updated_at: new Date(),
        })
        .where(and(
          eq(pay_app_line_items.pay_app_line_id, line.pay_app_line_id),
          eq(pay_app_line_items.tenant_id, gate.tenantId),
        ));
    }
  });

  return NextResponse.json({ ok: true, updated: updates.length });
}
