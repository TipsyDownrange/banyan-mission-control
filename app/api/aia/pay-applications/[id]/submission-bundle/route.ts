/**
 * AIA Submission Packet Export — bundle download endpoint.
 *
 *   GET /api/aia/pay-applications/[id]/submission-bundle?format=pdf|zip
 *
 * Returns a merged PDF (default) or a ZIP archive containing the submission
 * packet for a pay application: cover letter, notarized pay-app PDF (or
 * fresh render fallback), all associated lien waivers, and a manifest page.
 *
 * Source: AIA Billing + SOV Trunk v1.1 §17 Six-Stage Loop Coverage Matrix
 * "Submission (Direct) → Email to GC + PDF".
 *
 * Read-only: no field_events emission, no state transition. The existing
 * POST /api/pay-apps/[id]/submit-direct remains the action that records
 * PAY_APP_SUBMITTED. This endpoint is the artifact generator.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import {
  db,
  pay_applications,
  pay_app_line_items,
  billing_format_config,
  engagements,
  schedule_of_values,
  notarization_sessions,
  lien_waivers,
  gc_required_docs_checklist,
} from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { calcG703Line, summarizeG702 } from '@/lib/aia/pay-app-calc';
import {
  buildSubmissionBundle,
  type GcRequiredDocRow,
  type LienWaiverSource,
  type SubmissionBundleFormat,
} from '@/lib/aia/submission-bundle';
import {
  fetchDriveFileAsBuffer,
  DriveFetchTooLargeError,
} from '@/lib/aia/drive-fetch';
import type { PayAppPdfFormat, PayAppPdfLine } from '@/lib/aia/pay-app-pdf';
import { composeNetChangeFootnote } from '@/lib/aia/pay-app-net-change-summary';

const HI_GET_RATE = 0.04712;

const ALLOWED_STATES = new Set([
  'READY_FOR_SUBMISSION',
  'SUBMITTED',
  'ARCHITECT_CERTIFIED',
  'GC_APPROVED',
]);

const PDF_FORMATS = new Set<PayAppPdfFormat>([
  'AIA_G702_G703',
  'CUSTOM_TEMPLATE_AIA_STYLE',
  'CUSTOM_TEMPLATE_SCHEDULE_ABC',
]);

function parseFormat(url: URL): SubmissionBundleFormat | { error: string } {
  const raw = (url.searchParams.get('format') ?? 'pdf').toLowerCase();
  if (raw === 'pdf' || raw === 'zip') return raw;
  return { error: `format must be 'pdf' or 'zip' (got '${raw}')` };
}

function gcRequiredDocsFromChecklist(
  row: typeof gc_required_docs_checklist.$inferSelect | undefined,
): GcRequiredDocRow[] {
  if (!row) return [];
  const rows: GcRequiredDocRow[] = [
    { label: 'Conditional progress waiver from Kula', required: row.requires_conditional_progress_waiver_from_kula },
    { label: 'Unconditional progress waiver from Kula', required: row.requires_unconditional_progress_waiver_from_kula },
    { label: 'Conditional final waiver from Kula', required: row.requires_conditional_final_waiver_from_kula },
    { label: 'Unconditional final waiver from Kula', required: row.requires_unconditional_final_waiver_from_kula },
    { label: 'External waivers from manufacturers', required: row.requires_external_waivers_from_manufacturers },
    { label: 'Joint check agreement', required: row.requires_joint_check_agreement },
    { label: 'Certificate of vendor compliance', required: row.requires_certificate_of_vendor_compliance },
    { label: 'Glaziers union lien clearance', required: row.requires_glaziers_union_lien_clearance },
    { label: 'Certified payroll', required: row.requires_certified_payroll },
    { label: 'Safety documentation', required: row.requires_safety_documentation },
  ];
  const custom = (row.custom_required_docs as unknown[]) ?? [];
  for (const entry of custom) {
    if (typeof entry === 'string') rows.push({ label: entry, required: true });
    else if (entry && typeof entry === 'object' && 'label' in entry) {
      const obj = entry as { label?: unknown; required?: unknown };
      const label = typeof obj.label === 'string' ? obj.label : null;
      const required = obj.required === false ? false : true;
      if (label) rows.push({ label, required });
    }
  }
  return rows;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const url = new URL(req.url);
  const format = parseFormat(url);
  if (typeof format !== 'string') {
    return NextResponse.json({ error: format.error }, { status: 400 });
  }

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

  if (!ALLOWED_STATES.has(payApp.state)) {
    return NextResponse.json(
      {
        error: `pay app state ${payApp.state} cannot generate a submission packet`,
        code: 'INVALID_STATE',
        allowed_states: [...ALLOWED_STATES],
      },
      { status: 409 },
    );
  }

  const payAppFormat = (payApp.billing_format ?? 'AIA_G702_G703') as PayAppPdfFormat;
  if (!PDF_FORMATS.has(payAppFormat)) {
    return NextResponse.json(
      {
        error: `billing_format ${payAppFormat} is not a PDF format (Textura CSV uses a different submission path)`,
        code: 'INVALID_BILLING_FORMAT',
      },
      { status: 422 },
    );
  }

  const [lines, eng, cfgRows, sovLineRows, notarRows, waiverRows, checklistRows] = await Promise.all([
    db
      .select()
      .from(pay_app_line_items)
      .where(and(
        eq(pay_app_line_items.tenant_id, gate.tenantId),
        eq(pay_app_line_items.pay_app_id, id),
      ))
      .orderBy(pay_app_line_items.line_number),
    db
      .select({
        kid: engagements.kid,
        org_id: engagements.org_id,
        drive_folder_id: engagements.drive_folder_id,
      })
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
    db
      .select({
        signed_pdf_drive_id: notarization_sessions.signed_pdf_drive_id,
        completed_at: notarization_sessions.completed_at,
      })
      .from(notarization_sessions)
      .where(and(
        eq(notarization_sessions.tenant_id, gate.tenantId),
        eq(notarization_sessions.pay_app_id, id),
        eq(notarization_sessions.state, 'COMPLETED'),
      ))
      .orderBy(desc(notarization_sessions.completed_at))
      .limit(1),
    db
      .select({
        waiver_id: lien_waivers.waiver_id,
        waiver_type: lien_waivers.waiver_type,
        state: lien_waivers.state,
        pdf_drive_id: lien_waivers.pdf_drive_id,
        notarized_pdf_drive_id: lien_waivers.notarized_pdf_drive_id,
        waiver_amount: lien_waivers.waiver_amount,
      })
      .from(lien_waivers)
      .where(and(
        eq(lien_waivers.tenant_id, gate.tenantId),
        eq(lien_waivers.pay_app_id, id),
      )),
    db
      .select()
      .from(gc_required_docs_checklist)
      .where(and(
        eq(gc_required_docs_checklist.tenant_id, gate.tenantId),
        eq(gc_required_docs_checklist.engagement_id, payApp.engagement_id),
      ))
      .limit(1),
  ]);

  const cfg = cfgRows[0];
  const retainagePct = cfg?.retainage_pct ? Number(cfg.retainage_pct) / 100 : 0.10;
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

  const netChangeSummary = await composeNetChangeFootnote(id, gate.tenantId);
  const summary = summarizeG702({
    lines: pdfLines,
    originalContractSum: Number(payApp.contract_sum_original || 0),
    netChangeByCo: netChangeSummary.total,
    lessPreviousCertificates: Number(payApp.less_previous_certificates || 0),
    retainagePctCompleted: retainagePct,
    retainagePctStored: retainagePct,
  });

  const projectName = eng[0]?.kid ?? 'Project';
  const kid = eng[0]?.kid ?? '';
  const waiverSources: LienWaiverSource[] = waiverRows.map((w) => ({
    waiver_id: w.waiver_id,
    waiver_type: w.waiver_type as LienWaiverSource['waiver_type'],
    state: w.state,
    pdf_drive_id: w.pdf_drive_id ?? null,
    notarized_pdf_drive_id: w.notarized_pdf_drive_id ?? null,
    waiver_amount: w.waiver_amount,
  }));

  try {
    const result = await buildSubmissionBundle(
      {
        header: {
          project_name: projectName,
          kid,
          pay_app_number: payApp.pay_app_number,
          period_start: String(payApp.period_start),
          period_end: String(payApp.period_end),
          gc_name: cfg?.gc_certifier_name ?? null,
          gc_certifier_name: cfg?.gc_certifier_name ?? null,
          gc_certifier_email: cfg?.gc_certifier_email ?? null,
          gc_certifier_title: cfg?.gc_certifier_title ?? null,
          contractor_name: 'Kula Glass',
          submitted_by: gate.actorEmail || 'Kula Glass PM',
          current_amount_due: payApp.current_amount_due,
        },
        notarized_pay_app_drive_id: notarRows[0]?.signed_pdf_drive_id ?? null,
        pay_app_pdf_input: {
          format: payAppFormat,
          header: {
            project_name: projectName,
            kid,
            pay_app_number: payApp.pay_app_number,
            period_start: String(payApp.period_start),
            period_end: String(payApp.period_end),
            gc_name: cfg?.gc_certifier_name ?? undefined,
            contractor_name: 'Kula Glass',
          },
          summary,
          lines: pdfLines,
          net_change_co_footnote: netChangeSummary.footnote,
          ge_tax_summary_line: summary.line8_current_payment_due * HI_GET_RATE,
          retainage_pct_completed: retainagePct,
          retainage_pct_stored: retainagePct,
        },
        lien_waivers: waiverSources,
        gc_required_docs: gcRequiredDocsFromChecklist(checklistRows[0]),
        cover_letter_template: cfg?.submission_cover_letter_template ?? null,
        format,
      },
      fetchDriveFileAsBuffer,
    );

    const ab = result.buffer.buffer.slice(
      result.buffer.byteOffset,
      result.buffer.byteOffset + result.buffer.byteLength,
    );
    return new NextResponse(ab as ArrayBuffer, {
      status: 200,
      headers: {
        'content-type': result.content_type,
        'content-disposition': `attachment; filename="${result.filename}"`,
        'x-pay-app-id': id,
        'x-bundle-format': format,
        'x-bundle-manifest-rows': String(result.manifest.length),
      },
    });
  } catch (err) {
    if (err instanceof DriveFetchTooLargeError) {
      return NextResponse.json(
        {
          error: err.message,
          code: 'DRIVE_FILE_TOO_LARGE',
          drive_file_id: err.fileId,
        },
        { status: 413 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `submission bundle assembly failed: ${msg}`, code: 'BUNDLE_FAILED' },
      { status: 500 },
    );
  }
}
