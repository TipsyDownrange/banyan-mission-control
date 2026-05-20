/**
 * AIA Submission Packet Export — bundle assembly orchestrator.
 *
 * Source: AIA Billing + SOV Trunk v1.1 §17 Six-Stage Loop Coverage Matrix
 * "Submission (Direct) → Email to GC + PDF" row.
 *
 * Inputs are pre-resolved by the route layer (pay app + line items +
 * lien waivers + GC required-docs checklist + billing format config +
 * engagement header). This module's only side effects are PDF/ZIP rendering
 * and an optional Drive fetch via `fetchDriveFileAsBuffer` (passed in so
 * tests can inject a stub).
 *
 * PDF mode merges all sources via pdf-lib with section names recorded in
 * the manifest. ZIP mode emits separate files via the existing pure-Node
 * `buildStoredZip` helper used by BAN-337 Textura bundles.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import { renderToPDF } from '@/lib/pdf-templates';
import { renderPayAppPdf, type PayAppPdfInput } from '@/lib/aia/pay-app-pdf';
import { buildStoredZip, type ZipEntry } from '@/lib/aia/zip-store';

export type SubmissionBundleFormat = 'pdf' | 'zip';

export interface SubmissionBundleHeader {
  project_name: string;
  kid: string;
  pay_app_number: number;
  period_start: string;
  period_end: string;
  gc_name: string | null;
  gc_certifier_name: string | null;
  gc_certifier_email: string | null;
  gc_certifier_title: string | null;
  contractor_name: string | null;
  submitted_by: string;
  current_amount_due: string | number | null;
}

export interface LienWaiverSource {
  waiver_id: string;
  waiver_type:
    | 'CONDITIONAL_PROGRESS'
    | 'UNCONDITIONAL_PROGRESS'
    | 'CONDITIONAL_FINAL'
    | 'UNCONDITIONAL_FINAL';
  state: string;
  pdf_drive_id: string | null;
  notarized_pdf_drive_id: string | null;
  waiver_amount: string | number | null;
}

export interface GcRequiredDocRow {
  label: string;
  required: boolean;
}

export interface SubmissionBundleInputs {
  header: SubmissionBundleHeader;
  /** Notarized pay app PDF Drive id (from latest COMPLETED notarization_session). null → render fresh. */
  notarized_pay_app_drive_id: string | null;
  /** Inputs for the freshly-rendered pay app PDF fallback (when no notarized version). */
  pay_app_pdf_input: PayAppPdfInput;
  lien_waivers: LienWaiverSource[];
  gc_required_docs: GcRequiredDocRow[];
  cover_letter_template: string | null;
  format: SubmissionBundleFormat;
}

export interface ManifestRow {
  section: string;
  source: string;
  status: string;
  pages: number | null;
}

export interface SubmissionBundleResult {
  buffer: Buffer;
  filename: string;
  content_type: string;
  manifest: ManifestRow[];
}

const WAIVER_ORDER: LienWaiverSource['waiver_type'][] = [
  'CONDITIONAL_PROGRESS',
  'UNCONDITIONAL_PROGRESS',
  'CONDITIONAL_FINAL',
  'UNCONDITIONAL_FINAL',
];

const WAIVER_LABEL: Record<LienWaiverSource['waiver_type'], string> = {
  CONDITIONAL_PROGRESS: 'Conditional Lien Waiver (Progress)',
  UNCONDITIONAL_PROGRESS: 'Unconditional Lien Waiver (Progress)',
  CONDITIONAL_FINAL: 'Conditional Lien Waiver (Final)',
  UNCONDITIONAL_FINAL: 'Unconditional Lien Waiver (Final)',
};

const CANONICAL_COVER_LETTER = `Aloha {gc_name},

Please find attached Pay Application #{pay_app_number} for {project_name} (kID {kid}), covering the billing period {period_start} through {period_end}.

Current Amount Due: {current_amount_due}

This packet includes the signed/notarized pay application, the supporting G703 continuation sheet, all lien waivers associated with this pay app, and a manifest listing every enclosed document.

Please reach out with any questions regarding the enclosed.

Mahalo,
{submitted_by}
Kula Glass`;

function moneyOrDash(value: string | number | null): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fillTemplate(template: string, header: SubmissionBundleHeader): string {
  const ctx: Record<string, string> = {
    project_name: header.project_name,
    kid: header.kid,
    pay_app_number: String(header.pay_app_number),
    period_start: header.period_start,
    period_end: header.period_end,
    gc_name: header.gc_name ?? 'General Contractor',
    gc_certifier_name: header.gc_certifier_name ?? '',
    contractor_name: header.contractor_name ?? 'Kula Glass',
    submitted_by: header.submitted_by,
    current_amount_due: moneyOrDash(header.current_amount_due),
  };
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => ctx[key] ?? `{${key}}`);
}

const CL = StyleSheet.create({
  page: { padding: 56, fontSize: 11, fontFamily: 'Helvetica', color: '#0f172a' },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 14, color: '#0c2330' },
  meta: { fontSize: 9, color: '#475569', marginBottom: 16 },
  body: { fontSize: 11, lineHeight: 1.5 },
  hr: { borderBottomWidth: 0.5, borderColor: '#cbd5e1', marginTop: 18, marginBottom: 14 },
  docsLabel: { fontSize: 10, fontWeight: 700, color: '#0f172a', marginBottom: 6 },
  docsLine: { fontSize: 9, color: '#334155', marginBottom: 2 },
});

function CoverLetterDocument({
  header,
  bodyText,
  enclosures,
}: {
  header: SubmissionBundleHeader;
  bodyText: string;
  enclosures: string[];
}) {
  return (
    <Document>
      <Page size="LETTER" style={CL.page}>
        <Text style={CL.title}>Pay Application Submission · #{header.pay_app_number}</Text>
        <Text style={CL.meta}>
          {header.project_name} · kID {header.kid} ·{' '}
          Period {header.period_start} → {header.period_end}
        </Text>
        {bodyText.split('\n').map((line, i) => (
          <Text style={CL.body} key={i}>{line || ' '}</Text>
        ))}
        <View style={CL.hr} />
        <Text style={CL.docsLabel}>Enclosures</Text>
        {enclosures.map((line, i) => (
          <Text style={CL.docsLine} key={i}>· {line}</Text>
        ))}
      </Page>
    </Document>
  );
}

const MF = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#0f172a' },
  title: { fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#0c2330' },
  meta: { fontSize: 9, color: '#475569', marginBottom: 14 },
  table: { borderWidth: 0.5, borderColor: '#0f172a' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#cbd5e1' },
  th: { padding: 4, backgroundColor: '#0c2330', color: '#fff', fontSize: 8, fontWeight: 700 },
  td: { padding: 4, fontSize: 8 },
  c1: { width: '34%' },
  c2: { width: '38%' },
  c3: { width: '18%' },
  c4: { width: '10%' },
  note: { fontSize: 8, color: '#64748b', marginTop: 10, fontStyle: 'italic' },
});

function ManifestDocument({
  header,
  rows,
  generatedAt,
  bundleFormat,
}: {
  header: SubmissionBundleHeader;
  rows: ManifestRow[];
  generatedAt: string;
  bundleFormat: SubmissionBundleFormat;
}) {
  return (
    <Document>
      <Page size="LETTER" style={MF.page}>
        <Text style={MF.title}>Submission Packet Manifest</Text>
        <Text style={MF.meta}>
          {header.project_name} · kID {header.kid} · Pay App #{header.pay_app_number} ·{' '}
          Generated {generatedAt} · Format {bundleFormat.toUpperCase()}
        </Text>
        <View style={MF.table}>
          <View style={MF.tr}>
            <View style={MF.c1}><Text style={MF.th}>Section</Text></View>
            <View style={MF.c2}><Text style={MF.th}>Source</Text></View>
            <View style={MF.c3}><Text style={MF.th}>Status</Text></View>
            <View style={MF.c4}><Text style={MF.th}>Pages</Text></View>
          </View>
          {rows.map((r, i) => (
            <View style={MF.tr} key={i}>
              <View style={MF.c1}><Text style={MF.td}>{r.section}</Text></View>
              <View style={MF.c2}><Text style={MF.td}>{r.source}</Text></View>
              <View style={MF.c3}><Text style={MF.td}>{r.status}</Text></View>
              <View style={MF.c4}><Text style={MF.td}>{r.pages === null ? '—' : r.pages}</Text></View>
            </View>
          ))}
        </View>
        <Text style={MF.note}>
          GC-required-docs rows are informational only. Per-pay-app artifact
          attachment is not yet tracked in this repo; required-doc rows
          reflect the engagement&apos;s checklist configuration.
        </Text>
      </Page>
    </Document>
  );
}

export type DriveFetcher = (fileId: string | null | undefined) => Promise<Buffer | null>;

interface FetchedSource {
  section: string;
  source: string;
  status: string;
  buffer: Buffer | null;
  filename: string;
}

async function safeFetch(
  fetcher: DriveFetcher,
  fileId: string | null,
  label: string,
): Promise<{ buffer: Buffer | null; source: string; status: string }> {
  if (!fileId) return { buffer: null, source: 'missing', status: `${label} (no PDF on file)` };
  try {
    const buf = await fetcher(fileId);
    if (!buf) return { buffer: null, source: `drive:${fileId}`, status: `${label} (drive returned empty)` };
    return { buffer: buf, source: `drive:${fileId}`, status: label };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { buffer: null, source: `drive:${fileId}`, status: `${label} (fetch failed: ${msg})` };
  }
}

function countPdfPages(buf: Buffer): Promise<number> {
  return PDFDocument.load(buf, { ignoreEncryption: true }).then((d) => d.getPageCount());
}

export async function buildSubmissionBundle(
  inputs: SubmissionBundleInputs,
  fetcher: DriveFetcher,
  now: Date = new Date(),
): Promise<SubmissionBundleResult> {
  const { header, format } = inputs;

  // ── §1 Cover letter ─────────────────────────────────────────────────────
  const templateBody = inputs.cover_letter_template ?? CANONICAL_COVER_LETTER;
  const coverBody = fillTemplate(templateBody, header);
  const orderedWaivers = [...inputs.lien_waivers].sort(
    (a, b) => WAIVER_ORDER.indexOf(a.waiver_type) - WAIVER_ORDER.indexOf(b.waiver_type),
  );
  const enclosures: string[] = [
    inputs.notarized_pay_app_drive_id
      ? `Signed / notarized Pay App #${header.pay_app_number} (G702 + G703)`
      : `Pay App #${header.pay_app_number} (G702 + G703, not yet notarized)`,
    ...orderedWaivers.map((w) => WAIVER_LABEL[w.waiver_type] + ` — ${w.state}`),
    ...inputs.gc_required_docs.filter((d) => d.required).map((d) => `${d.label} (required by GC)`),
    'Submission Packet Manifest',
  ];
  const coverDoc = CoverLetterDocument({ header, bodyText: coverBody, enclosures });
  const coverPdf = await renderToPDF(
    coverDoc as React.ReactElement<import('@react-pdf/renderer').DocumentProps>,
  );

  // ── §2 Pay App PDF (notarized fetched OR freshly rendered) ─────────────
  let payAppBuf: Buffer;
  let payAppSource: string;
  let payAppStatus: string;
  if (inputs.notarized_pay_app_drive_id) {
    const fetched = await safeFetch(
      fetcher,
      inputs.notarized_pay_app_drive_id,
      'notarized',
    );
    if (fetched.buffer) {
      payAppBuf = fetched.buffer;
      payAppSource = fetched.source;
      payAppStatus = 'notarized';
    } else {
      payAppBuf = await renderPayAppPdf(inputs.pay_app_pdf_input);
      payAppSource = 'generated (notarized fetch failed)';
      payAppStatus = 'generated (notarized unavailable)';
    }
  } else {
    payAppBuf = await renderPayAppPdf(inputs.pay_app_pdf_input);
    payAppSource = 'generated';
    payAppStatus = 'unsigned';
  }

  // ── §5 Lien waivers ─────────────────────────────────────────────────────
  const waiverFetches: FetchedSource[] = [];
  for (const w of orderedWaivers) {
    const isNotarized = w.state === 'NOTARIZED' || w.state === 'FILED' || w.state === 'DELIVERED' || w.state === 'RELEASED';
    const driveId = isNotarized && w.notarized_pdf_drive_id ? w.notarized_pdf_drive_id : w.pdf_drive_id;
    const fetched = await safeFetch(fetcher, driveId, isNotarized ? 'notarized' : 'unsigned');
    waiverFetches.push({
      section: WAIVER_LABEL[w.waiver_type],
      source: fetched.source,
      status: fetched.status,
      buffer: fetched.buffer,
      filename: `lien-waiver-${w.waiver_type.toLowerCase()}-${w.waiver_id.slice(0, 8)}.pdf`,
    });
  }

  // ── Manifest rows ───────────────────────────────────────────────────────
  const manifest: ManifestRow[] = [];
  manifest.push({
    section: 'Cover Letter',
    source: 'generated',
    status: inputs.cover_letter_template ? 'per-GC template' : 'canonical template',
    pages: await countPdfPages(coverPdf),
  });
  manifest.push({
    section: `Pay Application #${header.pay_app_number} (G702 + G703)`,
    source: payAppSource,
    status: payAppStatus,
    pages: await countPdfPages(payAppBuf),
  });
  for (const w of waiverFetches) {
    manifest.push({
      section: w.section,
      source: w.source,
      status: w.status,
      pages: w.buffer ? await countPdfPages(w.buffer) : null,
    });
  }
  for (const d of inputs.gc_required_docs) {
    if (!d.required) continue;
    manifest.push({
      section: d.label,
      source: 'checklist requirement (no attachment tracked)',
      status: 'informational',
      pages: null,
    });
  }

  // Manifest PDF references its own rows above (it self-includes as the last
  // section, but we render it after we have row data so the table is complete).
  const generatedAtIso = now.toISOString();
  const manifestRowsForRender: ManifestRow[] = [
    ...manifest,
    { section: 'Submission Packet Manifest', source: 'generated', status: 'this page', pages: 1 },
  ];
  const manifestDoc = ManifestDocument({
    header,
    rows: manifestRowsForRender,
    generatedAt: generatedAtIso,
    bundleFormat: format,
  });
  const manifestPdf = await renderToPDF(
    manifestDoc as React.ReactElement<import('@react-pdf/renderer').DocumentProps>,
  );

  const fullManifest: ManifestRow[] = [...manifestRowsForRender];
  const safeKid = header.kid.replace(/[^A-Za-z0-9._-]+/g, '_');

  if (format === 'zip') {
    const entries: ZipEntry[] = [];
    entries.push({ name: '01-cover-letter.pdf', data: coverPdf });
    entries.push({ name: `02-pay-app-${header.pay_app_number}.pdf`, data: payAppBuf });
    let waiverIndex = 0;
    for (const w of waiverFetches) {
      waiverIndex += 1;
      if (w.buffer) {
        entries.push({ name: `03-${String(waiverIndex).padStart(2, '0')}-${w.filename}`, data: w.buffer });
      }
    }
    entries.push({ name: '99-manifest.pdf', data: manifestPdf });
    const zipBuf = buildStoredZip(entries, now);
    return {
      buffer: zipBuf,
      filename: `PayApp-${header.pay_app_number}-${safeKid}-submission.zip`,
      content_type: 'application/zip',
      manifest: fullManifest,
    };
  }

  // ── PDF mode: merge with pdf-lib ────────────────────────────────────────
  const merged = await PDFDocument.create();
  const sources: Buffer[] = [coverPdf, payAppBuf, ...waiverFetches.flatMap((w) => (w.buffer ? [w.buffer] : [])), manifestPdf];
  for (const src of sources) {
    const srcDoc = await PDFDocument.load(src, { ignoreEncryption: true });
    const indices = srcDoc.getPageIndices();
    const pages = await merged.copyPages(srcDoc, indices);
    for (const p of pages) merged.addPage(p);
  }
  merged.setTitle(`Pay App #${header.pay_app_number} — ${header.project_name}`);
  merged.setSubject(`AIA submission packet · kID ${header.kid}`);
  merged.setProducer('Banyan Mission Control · AIA Submission Packet Export');
  const out = await merged.save();
  return {
    buffer: Buffer.from(out),
    filename: `PayApp-${header.pay_app_number}-${safeKid}-submission.pdf`,
    content_type: 'application/pdf',
    manifest: fullManifest,
  };
}
