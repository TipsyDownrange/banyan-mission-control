/**
 * BAN-337 Pay Apps v2b — POST /api/pay-apps/[id]/generate-textura-csv
 *
 * Renders the Textura per-pay-app Invoice CSV (byte-exact to
 * InvoiceTemplate.csv). Every numeric column is quoted as a string per the
 * Textura import parser.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  pay_applications,
  pay_app_line_items,
  schedule_of_values,
  engagements,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { generateTexturaInvoiceCsv } from '@/lib/aia/textura-csv';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(
    req,
    '/api/pay-apps/[id]/generate-textura-csv',
    'project:edit',
  );
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const lookup = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      pay_app_number: pay_applications.pay_app_number,
      engagement_id: pay_applications.engagement_id,
      is_test: engagements.is_test_project,
      kid: engagements.kid,
    })
    .from(pay_applications)
    .innerJoin(engagements, eq(pay_applications.engagement_id, engagements.engagement_id))
    .where(and(
      eq(pay_applications.pay_app_id, id),
      eq(pay_applications.tenant_id, gate.tenantId),
    ))
    .limit(1);
  if (lookup.length === 0) {
    return NextResponse.json({ error: 'pay app not found' }, { status: 404 });
  }
  const payApp = lookup[0];

  const lines = await db
    .select({
      line_number: pay_app_line_items.line_number,
      description: pay_app_line_items.description,
      scheduled_value: pay_app_line_items.scheduled_value,
      work_completed_this_period: pay_app_line_items.work_completed_this_period,
      stored_materials: pay_app_line_items.stored_materials,
      retainage_held: pay_app_line_items.retainage_held,
      work_completed_previous: pay_app_line_items.work_completed_previous,
      sov_line_id: pay_app_line_items.sov_line_id,
    })
    .from(pay_app_line_items)
    .where(and(
      eq(pay_app_line_items.tenant_id, gate.tenantId),
      eq(pay_app_line_items.pay_app_id, id),
    ))
    .orderBy(pay_app_line_items.line_number);

  if (lines.length === 0) {
    return NextResponse.json({ error: 'pay app has no line items' }, { status: 422 });
  }

  // Resolve textura_phase_code (preferred Item No.) from SOV lines.
  const sovIds = lines.map((l) => l.sov_line_id).filter((x): x is string => !!x);
  const phaseMap = new Map<string, number>();
  if (sovIds.length > 0) {
    const sovRows = await db
      .select({
        sov_line_id: schedule_of_values.sov_line_id,
        textura_phase_code: schedule_of_values.textura_phase_code,
      })
      .from(schedule_of_values)
      .where(eq(schedule_of_values.tenant_id, gate.tenantId));
    for (const r of sovRows) {
      if (r.sov_line_id && r.textura_phase_code !== null) {
        phaseMap.set(r.sov_line_id, r.textura_phase_code);
      }
    }
  }

  const invoiceRows = lines.map((l) => ({
    item_number: l.sov_line_id && phaseMap.has(l.sov_line_id)
      ? phaseMap.get(l.sov_line_id)!
      : l.line_number,
    description: l.description,
    scheduled_value: l.scheduled_value,
    work_this_period: l.work_completed_this_period,
    material_stored_this_period: l.stored_materials,
    retention_held_this_period: l.retainage_held,
    request_previously_held: l.work_completed_previous,
  }));

  const csv = generateTexturaInvoiceCsv(invoiceRows, {
    is_test_project: !!payApp.is_test,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${payApp.kid}-payapp-${payApp.pay_app_number}-textura-invoice.csv"`,
      'x-test-project': payApp.is_test ? 'true' : 'false',
    },
  });
}
