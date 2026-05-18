/**
 * BAN-336 Pay App Core — POST /api/pay-apps/[id]/generate-pdf
 *
 * Renders the pay app PDF in whichever format the pay_applications row is
 * configured for. Returns the PDF buffer inline (application/pdf). Drive
 * upload happens out-of-band — the response body Content-Disposition
 * filename is the canonical name the caller should use when saving under
 * `Pay Apps/{Pay App #}/`.
 *
 * (Drive folder upload deferred — staging+sandbox don't have the Drive
 * service-account credentials available; the route returns the buffer so
 * the UI can offer "Download" + so the cron lane can upload server-side
 * once Drive is wired.)
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  pay_applications,
  pay_app_line_items,
  billing_format_config,
  engagements,
  schedule_of_values,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { calcG703Line, summarizeG702 } from '@/lib/aia/pay-app-calc';
import {
  renderPayAppPdf,
  type PayAppPdfFormat,
  type PayAppPdfLine,
} from '@/lib/aia/pay-app-pdf';

const HI_GET_RATE = 0.04712;

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, '/api/pay-apps/[id]/generate-pdf', 'project:edit');
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

  const [lines, eng, cfgRows, sovLineRows] = await Promise.all([
    db
      .select()
      .from(pay_app_line_items)
      .where(and(
        eq(pay_app_line_items.tenant_id, gate.tenantId),
        eq(pay_app_line_items.pay_app_id, id),
      ))
      .orderBy(pay_app_line_items.line_number),
    db
      .select({ kid: engagements.kid })
      .from(engagements)
      .where(eq(engagements.engagement_id, payApp.engagement_id))
      .limit(1),
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
          .select({
            sov_line_id: schedule_of_values.sov_line_id,
            display_item_number: schedule_of_values.display_item_number,
            parent_line_id: schedule_of_values.parent_line_id,
          })
          .from(schedule_of_values)
          .where(and(
            eq(schedule_of_values.tenant_id, gate.tenantId),
            eq(schedule_of_values.sov_version_id, payApp.sov_version_id),
          ))
      : Promise.resolve([]),
  ]);

  const retainagePct = cfgRows[0]?.retainage_pct ? Number(cfgRows[0].retainage_pct) / 100 : 0.10;
  const sovById = new Map(sovLineRows.map((s) => [s.sov_line_id, s]));

  const pdfLines: PayAppPdfLine[] = lines.map((l) => {
    const calc = calcG703Line({
      scheduled_value: Number(l.scheduled_value || 0),
      work_completed_previous: Number(l.work_completed_previous || 0),
      work_completed_this_period: Number(l.work_completed_this_period || 0),
      materials_stored_this_period: Number(l.stored_materials || 0),
      retainage_pct: retainagePct,
    });
    const sov = l.sov_line_id ? sovById.get(l.sov_line_id) : undefined;
    return {
      ...calc,
      sov_line_id: l.sov_line_id,
      description: l.description,
      display_item_number: sov?.display_item_number ?? String(l.line_number),
      parent_line_id: sov?.parent_line_id ?? null,
    };
  });

  const summary = summarizeG702({
    lines: pdfLines,
    originalContractSum: Number(payApp.contract_sum_original || 0),
    netChangeByCo: Number(payApp.net_change_by_co || 0),
    lessPreviousCertificates: Number(payApp.less_previous_certificates || 0),
    retainagePctCompleted: retainagePct,
    retainagePctStored: retainagePct,
  });

  const format = (payApp.billing_format ?? 'AIA_G702_G703') as PayAppPdfFormat;
  // Reject TEXTURA_CSV_EXPORT — that's a different artifact (CSV not PDF).
  if (format !== 'AIA_G702_G703' && format !== 'CUSTOM_TEMPLATE_AIA_STYLE' && format !== 'CUSTOM_TEMPLATE_SCHEDULE_ABC') {
    return NextResponse.json(
      { error: `billing_format ${format} does not produce a PDF (use the CSV export route)` },
      { status: 422 },
    );
  }

  const buffer = await renderPayAppPdf({
    format,
    header: {
      project_name: eng[0]?.kid ?? 'Project',
      kid: eng[0]?.kid ?? '',
      pay_app_number: payApp.pay_app_number,
      period_start: String(payApp.period_start),
      period_end: String(payApp.period_end),
    },
    summary,
    lines: pdfLines,
    net_change_co_footnote: 'See change orders + T&M authorization log for itemization.',
    ge_tax_summary_line: summary.line8_current_payment_due * HI_GET_RATE,
    retainage_pct_completed: retainagePct,
    retainage_pct_stored: retainagePct,
  });

  const filename = `PayApp-${eng[0]?.kid ?? ''}-${String(payApp.pay_app_number).padStart(3, '0')}.pdf`;
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new NextResponse(ab as ArrayBuffer, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-pay-app-id': id,
      'x-pay-app-format': format,
      'x-drive-target-path': `Pay Apps/${payApp.pay_app_number}/${filename}`,
    },
  });
}
