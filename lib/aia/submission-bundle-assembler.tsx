/**
 * AIA Submission Packet Export v1 — bundle assembler.
 *
 * Composes a direct-submission packet for non-Textura GCs: cover letter,
 * notarized (or generated) pay-app PDF, SOV reference, all per-pay-app lien
 * waivers, and a manifest page.  Output is either a single merged PDF
 * (default) or a ZIP archive of the individual source PDFs.
 *
 * Read-only: no DB writes, no state transitions, no Activity Spine emits.
 * submit-direct keeps owning PAY_APP_SUBMITTED.
 */

import { google } from 'googleapis';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { and, desc, eq } from 'drizzle-orm';

import {
  db,
  pay_applications,
  pay_app_line_items,
  schedule_of_values,
  sov_versions,
  notarization_sessions,
  lien_waivers,
  billing_format_config,
  engagements,
  organizations,
  gc_required_docs_checklist,
} from '@/db';
import { getGoogleAuth } from '@/lib/gauth';
import { renderToPDF, Letterhead, DocFooter, C, fmt } from '@/lib/pdf-templates';
import {
  renderPayAppPdf,
  type PayAppPdfFormat,
  type PayAppPdfLine,
} from '@/lib/aia/pay-app-pdf';
import { calcG703Line, summarizeG702 } from '@/lib/aia/pay-app-calc';
import { composeNetChangeFootnote } from '@/lib/aia/pay-app-net-change-summary';
import { renderSubmissionBundleCoverLetter } from '@/lib/aia/submission-bundle-cover-letter';
import {
  renderSubmissionBundleManifest,
  type ManifestSection,
  type ManifestChecklistRow,
} from '@/lib/aia/submission-bundle-manifest';

const HI_GET_RATE = 0.04712;

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

export const PAY_APP_STATES_ALLOWED_FOR_BUNDLE = [
  'READY_FOR_SUBMISSION',
  'SUBMITTED',
  'ARCHITECT_CERTIFIED',
  'GC_APPROVED',
] as const;
export type PayAppStateAllowedForBundle = typeof PAY_APP_STATES_ALLOWED_FOR_BUNDLE[number];

export type SubmissionBundleFormat = 'pdf' | 'zip';

export interface BundleSection {
  title: string;
  source: string;
  pdf_bytes: Buffer;
  signed_status: ManifestSection['signed_status'];
  filename_in_zip: string;
}

export interface AssembledBundle {
  buffer: Buffer;
  filename: string;
  content_type: 'application/pdf' | 'application/zip';
  sections: ManifestSection[];
}

export interface SubmissionBundleContext {
  tenantId: string;
  actorEmail: string;
}

export class BundleSizeLimitError extends Error {
  readonly code = 'BUNDLE_SIZE_LIMIT_EXCEEDED';
  readonly section: string;
  readonly bytes: number;
  readonly limit: number;
  constructor(section: string, bytes: number, limit: number) {
    super(`Bundle source "${section}" is ${bytes} bytes, exceeds limit of ${limit}`);
    this.section = section;
    this.bytes = bytes;
    this.limit = limit;
  }
}

export class PayAppNotFoundError extends Error {
  readonly code = 'PAY_APP_NOT_FOUND';
}

export class InvalidPayAppStateError extends Error {
  readonly code = 'INVALID_PAY_APP_STATE_FOR_BUNDLE';
  readonly state: string;
  constructor(state: string) {
    super(`pay app state ${state} is not eligible for submission bundle (allowed: ${PAY_APP_STATES_ALLOWED_FOR_BUNDLE.join(', ')})`);
    this.state = state;
  }
}

// ── Drive helper (mirrors app/api/pay-apps/[id]/assemble-textura-bundle/route.ts:37) ──
export async function downloadDriveFile(driveFileId: string): Promise<Buffer> {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/drive.readonly']);
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

// ── Inline SOV reference PDF (1-page summary; v1 inline; not pulled from a
//    shared lib because none currently exists and we don't want to invent a
//    new module in pay-app-pdf.tsx).  Lists every locked SOV line with display
//    item number, description, scheduled value. ────────────────────────────
const SS = StyleSheet.create({
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 6 },
  meta: { fontSize: 9, color: C.subtext, marginBottom: 14 },
  table: { border: `1 solid ${C.border}`, borderRadius: 8, overflow: 'hidden' },
  thRow: { flexDirection: 'row', backgroundColor: C.navy, padding: '6 10' },
  thCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white, textTransform: 'uppercase' },
  row: { flexDirection: 'row', padding: '5 10', borderTop: `1 solid ${C.border}` },
  rowAlt: { flexDirection: 'row', padding: '5 10', borderTop: `1 solid ${C.border}`, backgroundColor: C.bg },
  cell: { fontSize: 9, color: C.text },
  cellRight: { fontSize: 9, color: C.text, textAlign: 'right' },
  total: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: '8 12', marginTop: 6,
    backgroundColor: C.blueBg, borderRadius: 8,
  },
  totalLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy },
  totalValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy },
});

export interface SovLineForReference {
  display_item_number: string | null;
  line_number: number;
  description: string;
  scheduled_value: number;
}

export interface SovReferenceInput {
  kid: string;
  project_name: string;
  sov_version_number: number | null;
  sov_state: string | null;
  lines: SovLineForReference[];
}

export function SovReferenceDocument(input: SovReferenceInput) {
  const total = input.lines.reduce((s, l) => s + l.scheduled_value, 0);
  return (
    <Document>
      <Page size="LETTER" style={{
        fontFamily: 'Helvetica',
        fontSize: 9,
        color: C.text,
        padding: '44 52 52 52',
        lineHeight: 1.45,
        backgroundColor: C.white,
      }}>
        <Letterhead docNumber={`SOV-${input.kid}`} />
        <Text style={SS.title}>Schedule of Values</Text>
        <Text style={SS.meta}>
          {input.project_name} ({input.kid})
          {input.sov_version_number ? ` · Version ${input.sov_version_number}` : ''}
          {input.sov_state ? ` · ${input.sov_state}` : ''}
        </Text>
        <View style={SS.table}>
          <View style={SS.thRow}>
            <View style={{ width: 40 }}><Text style={SS.thCell}>Item</Text></View>
            <View style={{ flex: 1 }}><Text style={SS.thCell}>Description</Text></View>
            <View style={{ width: 100 }}>
              <Text style={{ ...SS.thCell, textAlign: 'right' }}>Scheduled Value</Text>
            </View>
          </View>
          {input.lines.map((l, i) => {
            const item = l.display_item_number ?? String(l.line_number);
            return (
              <View key={i} style={i % 2 === 0 ? SS.row : SS.rowAlt}>
                <View style={{ width: 40 }}><Text style={SS.cell}>{item}</Text></View>
                <View style={{ flex: 1 }}><Text style={SS.cell}>{l.description}</Text></View>
                <View style={{ width: 100 }}>
                  <Text style={SS.cellRight}>{fmt(l.scheduled_value)}</Text>
                </View>
              </View>
            );
          })}
        </View>
        <View style={SS.total}>
          <Text style={SS.totalLabel}>Total scheduled value</Text>
          <Text style={SS.totalValue}>{fmt(total)}</Text>
        </View>
        <DocFooter docNumber={`SOV — ${input.kid}`} kID={input.kid} />
      </Page>
    </Document>
  );
}

export async function renderSovReferencePdf(input: SovReferenceInput): Promise<Buffer> {
  return renderToPDF(
    SovReferenceDocument(input) as React.ReactElement<import('@react-pdf/renderer').DocumentProps>,
  );
}

// ── PDF merge via pdf-lib.  Bookmarks (outline) are intentionally minimal in
//    v1 — pdf-lib's high-level API does not expose an outline builder; the
//    manifest page already enumerates the sections, which is sufficient for
//    v1.  If a richer outline is needed later we can drop in pdf-lib's
//    low-level PDFDict API. ─────────────────────────────────────────────────
export async function mergeBundlePdf(sections: BundleSection[]): Promise<Buffer> {
  const out = await PDFDocument.create();
  out.setTitle('AIA Pay Application Submission Bundle');
  out.setProducer('BanyanOS Mission Control');
  out.setCreator('Kula Glass Company, Inc.');
  out.setCreationDate(new Date());

  for (const sec of sections) {
    const src = await PDFDocument.load(sec.pdf_bytes, { ignoreEncryption: true });
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const p of copied) out.addPage(p);
  }

  const bytes = await out.save();
  return Buffer.from(bytes);
}

export async function zipBundle(sections: BundleSection[]): Promise<Buffer> {
  const zip = new JSZip();
  sections.forEach((sec, i) => {
    const num = String(i + 1).padStart(2, '0');
    zip.file(`${num}-${sec.filename_in_zip}`, sec.pdf_bytes);
  });
  const ab = await zip.generateAsync({ type: 'arraybuffer' });
  return Buffer.from(ab);
}

function assertSourceSize(name: string, buf: Buffer) {
  if (buf.byteLength > MAX_SOURCE_BYTES) {
    throw new BundleSizeLimitError(name, buf.byteLength, MAX_SOURCE_BYTES);
  }
}

async function pageCount(buf: Buffer): Promise<number> {
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return 0;
  }
}

// ── Section loaders ────────────────────────────────────────────────────────

interface PayAppRow {
  pay_app_id: string;
  pay_app_number: number;
  state: string;
  period_start: string;
  period_end: string;
  engagement_id: string;
  sov_version_id: string | null;
  billing_format: string;
  contract_sum_original: string | null;
  less_previous_certificates: string | null;
  current_amount_due: string | null;
  pdf_drive_id: string | null;
}

interface EngagementRow {
  kid: string;
  org_id: string;
  drive_folder_id: string | null;
}

interface BillingCfgRow {
  retainage_pct: string | null;
  gc_certifier_name: string | null;
  gc_certifier_email: string | null;
  gc_certifier_title: string | null;
}

interface PreparedBundleContext {
  pay: PayAppRow;
  engagement: EngagementRow;
  gc_name: string;
  billing_cfg: BillingCfgRow | null;
  checklist_rows: ManifestChecklistRow[];
}

async function prepareContext(
  payAppId: string,
  tenantId: string,
): Promise<PreparedBundleContext> {
  const payRows = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      pay_app_number: pay_applications.pay_app_number,
      state: pay_applications.state,
      period_start: pay_applications.period_start,
      period_end: pay_applications.period_end,
      engagement_id: pay_applications.engagement_id,
      sov_version_id: pay_applications.sov_version_id,
      billing_format: pay_applications.billing_format,
      contract_sum_original: pay_applications.contract_sum_original,
      less_previous_certificates: pay_applications.less_previous_certificates,
      current_amount_due: pay_applications.current_amount_due,
      pdf_drive_id: pay_applications.pdf_drive_id,
    })
    .from(pay_applications)
    .where(and(
      eq(pay_applications.pay_app_id, payAppId),
      eq(pay_applications.tenant_id, tenantId),
    ))
    .limit(1);
  if (payRows.length === 0) throw new PayAppNotFoundError(`pay app ${payAppId} not found in tenant ${tenantId}`);
  const pay = payRows[0] as PayAppRow;

  if (!PAY_APP_STATES_ALLOWED_FOR_BUNDLE.includes(pay.state as PayAppStateAllowedForBundle)) {
    throw new InvalidPayAppStateError(pay.state);
  }

  const engRows = await db
    .select({
      kid: engagements.kid,
      org_id: engagements.org_id,
      drive_folder_id: engagements.drive_folder_id,
    })
    .from(engagements)
    .where(and(
      eq(engagements.engagement_id, pay.engagement_id),
      eq(engagements.tenant_id, tenantId),
    ))
    .limit(1);
  if (engRows.length === 0) throw new PayAppNotFoundError(`engagement for pay app ${payAppId} not found`);
  const engagement = engRows[0] as EngagementRow;

  const orgRows = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(and(
      eq(organizations.org_id, engagement.org_id),
      eq(organizations.tenant_id, tenantId),
    ))
    .limit(1);
  const gc_name = orgRows[0]?.name ?? 'General Contractor';

  const cfgRows = await db
    .select({
      retainage_pct: billing_format_config.retainage_pct,
      gc_certifier_name: billing_format_config.gc_certifier_name,
      gc_certifier_email: billing_format_config.gc_certifier_email,
      gc_certifier_title: billing_format_config.gc_certifier_title,
    })
    .from(billing_format_config)
    .where(and(
      eq(billing_format_config.tenant_id, tenantId),
      eq(billing_format_config.engagement_id, pay.engagement_id),
    ))
    .limit(1);
  const billing_cfg = (cfgRows[0] as BillingCfgRow | undefined) ?? null;

  const checklistRows = await db
    .select()
    .from(gc_required_docs_checklist)
    .where(and(
      eq(gc_required_docs_checklist.tenant_id, tenantId),
      eq(gc_required_docs_checklist.engagement_id, pay.engagement_id),
    ))
    .limit(1);
  const checklist_rows = checklistRowsFromDbRow(checklistRows[0] ?? null);

  return { pay, engagement, gc_name, billing_cfg, checklist_rows };
}

export function checklistRowsFromDbRow(row: Record<string, unknown> | null): ManifestChecklistRow[] {
  if (!row) return [];
  const out: ManifestChecklistRow[] = [
    { label: 'Conditional progress waiver from Kula', required: !!row.requires_conditional_progress_waiver_from_kula },
    { label: 'Unconditional progress waiver from Kula', required: !!row.requires_unconditional_progress_waiver_from_kula },
    { label: 'Conditional final waiver from Kula', required: !!row.requires_conditional_final_waiver_from_kula },
    { label: 'Unconditional final waiver from Kula', required: !!row.requires_unconditional_final_waiver_from_kula },
    { label: 'External waivers from manufacturers', required: !!row.requires_external_waivers_from_manufacturers },
    { label: 'Joint check agreement', required: !!row.requires_joint_check_agreement },
    { label: 'Certificate of vendor compliance', required: !!row.requires_certificate_of_vendor_compliance },
    { label: 'Glaziers union lien clearance', required: !!row.requires_glaziers_union_lien_clearance },
    { label: 'Certified payroll', required: !!row.requires_certified_payroll },
    { label: 'Safety documentation', required: !!row.requires_safety_documentation },
  ];
  const custom = row.custom_required_docs;
  if (Array.isArray(custom)) {
    for (const entry of custom) {
      if (typeof entry === 'string' && entry.trim()) {
        out.push({ label: entry, required: true });
      } else if (entry && typeof entry === 'object' && 'label' in (entry as Record<string, unknown>)) {
        const lbl = String((entry as Record<string, unknown>).label ?? '').trim();
        if (lbl) out.push({ label: lbl, required: true });
      }
    }
  }
  return out;
}

// ── Resolve notarized OR pre-rendered OR freshly-rendered pay-app PDF ──────
async function loadPayAppPdf(
  pay: PayAppRow,
  engagement: EngagementRow,
  billingCfg: BillingCfgRow | null,
  tenantId: string,
  downloader: typeof downloadDriveFile,
): Promise<{ buffer: Buffer; signed_status: BundleSection['signed_status']; source: string }> {
  const notarRows = await db
    .select({
      session_id: notarization_sessions.session_id,
      signed_pdf_drive_id: notarization_sessions.signed_pdf_drive_id,
      completed_at: notarization_sessions.completed_at,
    })
    .from(notarization_sessions)
    .where(and(
      eq(notarization_sessions.tenant_id, tenantId),
      eq(notarization_sessions.pay_app_id, pay.pay_app_id),
      eq(notarization_sessions.target_kind, 'PAY_APP'),
      eq(notarization_sessions.state, 'COMPLETED'),
    ))
    .orderBy(desc(notarization_sessions.completed_at))
    .limit(1);
  const notar = notarRows[0];
  if (notar?.signed_pdf_drive_id) {
    const buffer = await downloader(notar.signed_pdf_drive_id);
    assertSourceSize('notarized_pay_app_pdf', buffer);
    return {
      buffer,
      signed_status: 'NOTARIZED',
      source: `notarization_sessions.signed_pdf_drive_id (${notar.session_id})`,
    };
  }

  if (pay.pdf_drive_id) {
    try {
      const buffer = await downloader(pay.pdf_drive_id);
      assertSourceSize('pay_app_pdf', buffer);
      return {
        buffer,
        signed_status: 'SIGNED',
        source: `pay_applications.pdf_drive_id (${pay.pdf_drive_id})`,
      };
    } catch {
      // fall through to fresh render
    }
  }

  // Fresh in-process render via existing pay-app-pdf renderer.
  const buffer = await renderFreshPayAppPdf(pay, engagement, billingCfg, tenantId);
  assertSourceSize('pay_app_pdf', buffer);
  return {
    buffer,
    signed_status: 'GENERATED',
    source: 'rendered in-process from pay_app_line_items',
  };
}

async function renderFreshPayAppPdf(
  pay: PayAppRow,
  engagement: EngagementRow,
  billingCfg: BillingCfgRow | null,
  tenantId: string,
): Promise<Buffer> {
  const lines = await db
    .select()
    .from(pay_app_line_items)
    .where(and(
      eq(pay_app_line_items.tenant_id, tenantId),
      eq(pay_app_line_items.pay_app_id, pay.pay_app_id),
    ))
    .orderBy(pay_app_line_items.line_number);

  const sovLineRows = pay.sov_version_id
    ? await db
        .select({
          sov_line_id: schedule_of_values.sov_line_id,
          display_item_number: schedule_of_values.display_item_number,
          parent_line_id: schedule_of_values.parent_line_id,
        })
        .from(schedule_of_values)
        .where(and(
          eq(schedule_of_values.tenant_id, tenantId),
          eq(schedule_of_values.sov_version_id, pay.sov_version_id),
        ))
    : [];
  const sovById = new Map(sovLineRows.map((s) => [s.sov_line_id, s]));

  const retainagePct = billingCfg?.retainage_pct ? Number(billingCfg.retainage_pct) / 100 : 0.10;

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

  const format = (pay.billing_format ?? 'AIA_G702_G703') as PayAppPdfFormat;
  const pdfFormat: PayAppPdfFormat =
    format === 'AIA_G702_G703'
      || format === 'CUSTOM_TEMPLATE_AIA_STYLE'
      || format === 'CUSTOM_TEMPLATE_SCHEDULE_ABC'
      ? format
      : 'AIA_G702_G703';

  const netChangeSummary = await composeNetChangeFootnote(pay.pay_app_id, tenantId);
  const summary = summarizeG702({
    lines: pdfLines,
    originalContractSum: Number(pay.contract_sum_original || 0),
    netChangeByCo: netChangeSummary.total,
    lessPreviousCertificates: Number(pay.less_previous_certificates || 0),
    retainagePctCompleted: retainagePct,
    retainagePctStored: retainagePct,
  });

  return renderPayAppPdf({
    format: pdfFormat,
    header: {
      project_name: engagement.kid,
      kid: engagement.kid,
      pay_app_number: pay.pay_app_number,
      period_start: String(pay.period_start),
      period_end: String(pay.period_end),
    },
    summary,
    lines: pdfLines,
    net_change_co_footnote: netChangeSummary.footnote,
    ge_tax_summary_line: summary.line8_current_payment_due * HI_GET_RATE,
    retainage_pct_completed: retainagePct,
    retainage_pct_stored: retainagePct,
  });
}

async function loadSovReference(
  pay: PayAppRow,
  engagement: EngagementRow,
  tenantId: string,
): Promise<Buffer | null> {
  if (!pay.sov_version_id) return null;
  const [verRow, lineRows] = await Promise.all([
    db
      .select({
        version_number: sov_versions.version_number,
        state: sov_versions.state,
      })
      .from(sov_versions)
      .where(and(
        eq(sov_versions.tenant_id, tenantId),
        eq(sov_versions.sov_version_id, pay.sov_version_id),
      ))
      .limit(1),
    db
      .select({
        display_item_number: schedule_of_values.display_item_number,
        line_number: schedule_of_values.line_number,
        description: schedule_of_values.description,
        scheduled_value: schedule_of_values.scheduled_value,
      })
      .from(schedule_of_values)
      .where(and(
        eq(schedule_of_values.tenant_id, tenantId),
        eq(schedule_of_values.sov_version_id, pay.sov_version_id),
      ))
      .orderBy(schedule_of_values.line_number),
  ]);
  if (lineRows.length === 0) return null;

  const buffer = await renderSovReferencePdf({
    kid: engagement.kid,
    project_name: engagement.kid,
    sov_version_number: verRow[0]?.version_number ?? null,
    sov_state: verRow[0]?.state ?? null,
    lines: lineRows.map((r) => ({
      display_item_number: r.display_item_number,
      line_number: r.line_number,
      description: r.description,
      scheduled_value: Number(r.scheduled_value || 0),
    })),
  });
  assertSourceSize('sov_reference', buffer);
  return buffer;
}

interface LienWaiverArtifact {
  buffer: Buffer;
  source: string;
  signed_status: BundleSection['signed_status'];
  filename_in_zip: string;
  title: string;
}

const WAIVER_ORDER: Record<string, number> = {
  CONDITIONAL_PROGRESS: 1,
  UNCONDITIONAL_PROGRESS: 2,
  CONDITIONAL_FINAL: 3,
  UNCONDITIONAL_FINAL: 4,
};

async function loadLienWaivers(
  payAppId: string,
  tenantId: string,
  downloader: typeof downloadDriveFile,
): Promise<LienWaiverArtifact[]> {
  const waivers = await db
    .select({
      waiver_id: lien_waivers.waiver_id,
      waiver_type: lien_waivers.waiver_type,
      state: lien_waivers.state,
      pdf_drive_id: lien_waivers.pdf_drive_id,
      notarized_pdf_drive_id: lien_waivers.notarized_pdf_drive_id,
      drive_file_ref: lien_waivers.drive_file_ref,
    })
    .from(lien_waivers)
    .where(and(
      eq(lien_waivers.tenant_id, tenantId),
      eq(lien_waivers.pay_app_id, payAppId),
    ));

  const sorted = [...waivers].sort((a, b) =>
    (WAIVER_ORDER[a.waiver_type] ?? 99) - (WAIVER_ORDER[b.waiver_type] ?? 99),
  );

  const out: LienWaiverArtifact[] = [];
  for (const w of sorted) {
    const driveId = w.notarized_pdf_drive_id ?? w.pdf_drive_id ?? w.drive_file_ref;
    if (!driveId) continue;
    let buffer: Buffer;
    try {
      buffer = await downloader(driveId);
    } catch {
      continue;
    }
    assertSourceSize(`lien_waiver_${w.waiver_type}`, buffer);
    const status: BundleSection['signed_status'] = w.notarized_pdf_drive_id
      ? 'NOTARIZED'
      : (w.state === 'NOTARIZED' || w.state === 'FILED' || w.state === 'DELIVERED' || w.state === 'RELEASED')
        ? 'SIGNED'
        : 'GENERATED';
    const typeLabel = w.waiver_type.replace(/_/g, ' ').toLowerCase();
    out.push({
      buffer,
      source: `lien_waivers.${w.notarized_pdf_drive_id ? 'notarized_pdf_drive_id' : 'pdf_drive_id'} (${w.waiver_id})`,
      signed_status: status,
      filename_in_zip: `lien-waiver-${w.waiver_type.toLowerCase()}.pdf`,
      title: `Lien Waiver — ${typeLabel.replace(/\b\w/g, (c) => c.toUpperCase())}`,
    });
  }
  return out;
}

// ── Public entry ──────────────────────────────────────────────────────────

export interface AssembleSubmissionBundleOptions {
  payAppId: string;
  format: SubmissionBundleFormat;
  ctx: SubmissionBundleContext;
  /** Override for tests; defaults to real Drive downloader. */
  driveDownloader?: typeof downloadDriveFile;
  /** Officer name to imprint on the cover letter (defaults to actorEmail). */
  officerName?: string;
  /** Submission timestamp; defaults to now. */
  now?: Date;
}

export async function assembleSubmissionBundle(
  opts: AssembleSubmissionBundleOptions,
): Promise<AssembledBundle> {
  const { payAppId, format, ctx, now = new Date() } = opts;
  const downloader = opts.driveDownloader ?? downloadDriveFile;
  const officerName = opts.officerName ?? ctx.actorEmail ?? 'Kula Glass Project Officer';
  const submissionTimestamp = now.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');

  const prep = await prepareContext(payAppId, ctx.tenantId);
  const { pay, engagement, gc_name, billing_cfg, checklist_rows } = prep;

  // 1. notarized / pre-rendered / freshly-rendered pay app
  const payAppPdf = await loadPayAppPdf(pay, engagement, billing_cfg, ctx.tenantId, downloader);

  // 2. SOV reference (optional — null if no sov_version_id or no lines)
  const sovBuffer = await loadSovReference(pay, engagement, ctx.tenantId);

  // 3. lien waivers
  const waivers = await loadLienWaivers(payAppId, ctx.tenantId, downloader);

  // 4. cover letter & 5. manifest are computed last so they can reference the
  //    full enclosure list — but the cover letter goes FIRST in the output
  //    order, and the manifest goes LAST.
  const enclosureList: string[] = [
    `Pay Application No. ${pay.pay_app_number} (${payAppPdf.signed_status === 'NOTARIZED' ? 'notarized' : 'generated'})`,
    ...(sovBuffer ? ['Schedule of Values reference'] : []),
    ...waivers.map((w) => w.title),
    'Submission manifest',
  ];

  const coverBuffer = await renderSubmissionBundleCoverLetter({
    gc_name,
    gc_certifier_name: billing_cfg?.gc_certifier_name ?? null,
    gc_certifier_title: billing_cfg?.gc_certifier_title ?? null,
    gc_certifier_email: billing_cfg?.gc_certifier_email ?? null,
    project_name: engagement.kid,
    kid: engagement.kid,
    pay_app_number: pay.pay_app_number,
    period_start: String(pay.period_start),
    period_end: String(pay.period_end),
    submitted_by_officer_name: officerName,
    submission_timestamp: submissionTimestamp,
    included_documents: enclosureList,
    current_amount_due: pay.current_amount_due,
  });
  assertSourceSize('cover_letter', coverBuffer);

  // Assemble the non-manifest sections so we can compute page counts for the
  // manifest before rendering it.
  const preSections: BundleSection[] = [
    {
      title: 'Cover Letter',
      source: 'rendered in-process (canonical Kula template v1)',
      pdf_bytes: coverBuffer,
      signed_status: 'NOT_APPLICABLE',
      filename_in_zip: 'cover-letter.pdf',
    },
    {
      title: `Pay Application No. ${pay.pay_app_number}`,
      source: payAppPdf.source,
      pdf_bytes: payAppPdf.buffer,
      signed_status: payAppPdf.signed_status,
      filename_in_zip: `pay-app-${String(pay.pay_app_number).padStart(3, '0')}.pdf`,
    },
  ];
  if (sovBuffer) {
    preSections.push({
      title: 'Schedule of Values reference',
      source: 'rendered in-process from schedule_of_values',
      pdf_bytes: sovBuffer,
      signed_status: 'GENERATED',
      filename_in_zip: 'sov-reference.pdf',
    });
  }
  for (const w of waivers) {
    preSections.push({
      title: w.title,
      source: w.source,
      pdf_bytes: w.buffer,
      signed_status: w.signed_status,
      filename_in_zip: w.filename_in_zip,
    });
  }

  const manifestSections: ManifestSection[] = await Promise.all(
    preSections.map(async (s) => ({
      title: s.title,
      source: s.source,
      page_count: await pageCount(s.pdf_bytes),
      signed_status: s.signed_status,
    })),
  );

  const manifestBuffer = await renderSubmissionBundleManifest({
    kid: engagement.kid,
    project_name: engagement.kid,
    pay_app_number: pay.pay_app_number,
    period_start: String(pay.period_start),
    period_end: String(pay.period_end),
    submission_timestamp: submissionTimestamp,
    submitted_by_officer_name: officerName,
    sections: manifestSections,
    gc_required_docs_checklist: checklist_rows.length > 0 ? checklist_rows : null,
  });
  assertSourceSize('manifest', manifestBuffer);

  const allSections: BundleSection[] = [
    ...preSections,
    {
      title: 'Submission manifest',
      source: 'rendered in-process',
      pdf_bytes: manifestBuffer,
      signed_status: 'NOT_APPLICABLE',
      filename_in_zip: 'manifest.pdf',
    },
  ];

  // Per-section size already enforced; enforce aggregate.
  const aggregateSourceBytes = allSections.reduce((s, x) => s + x.pdf_bytes.byteLength, 0);
  if (aggregateSourceBytes > MAX_BUNDLE_BYTES) {
    throw new BundleSizeLimitError('aggregate', aggregateSourceBytes, MAX_BUNDLE_BYTES);
  }

  const baseFilename = `PayApp-${String(pay.pay_app_number).padStart(3, '0')}-${engagement.kid}-submission`;
  const finalManifest: ManifestSection[] = await Promise.all(
    allSections.map(async (s) => ({
      title: s.title,
      source: s.source,
      page_count: await pageCount(s.pdf_bytes),
      signed_status: s.signed_status,
    })),
  );

  if (format === 'zip') {
    const buf = await zipBundle(allSections);
    if (buf.byteLength > MAX_BUNDLE_BYTES) {
      throw new BundleSizeLimitError('zip_output', buf.byteLength, MAX_BUNDLE_BYTES);
    }
    return {
      buffer: buf,
      filename: `${baseFilename}.zip`,
      content_type: 'application/zip',
      sections: finalManifest,
    };
  }

  const merged = await mergeBundlePdf(allSections);
  if (merged.byteLength > MAX_BUNDLE_BYTES) {
    throw new BundleSizeLimitError('pdf_output', merged.byteLength, MAX_BUNDLE_BYTES);
  }
  return {
    buffer: merged,
    filename: `${baseFilename}.pdf`,
    content_type: 'application/pdf',
    sections: finalManifest,
  };
}
