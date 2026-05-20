/**
 * AIA Submission Packet Export — ZIP fallback coverage.
 *
 * The ZIP path reuses the existing pure-Node buildStoredZip helper from
 * lib/aia/zip-store.ts (BAN-337 v2b). This test inspects the resulting
 * archive's local-file-header signatures + per-entry filenames to confirm
 * we emit a well-formed ZIP with cover letter, pay app, all waivers with
 * usable buffers, and a manifest entry.
 */

jest.mock('@react-pdf/renderer', () => {
  const React = require('react');
  const component = (name: string) => ({ children, ...props }: { children?: unknown }) =>
    React.createElement(name, props, children);
  return {
    Document: component('Document'),
    Page: component('Page'),
    Text: component('Text'),
    View: component('View'),
    Image: component('Image'),
    StyleSheet: { create: (styles: unknown) => styles },
    pdf: () => ({ toBuffer: async () => Buffer.from('pdf') }),
  };
});

const renderToPDFMock = jest.fn();
jest.mock('@/lib/pdf-templates', () => ({
  __esModule: true,
  renderToPDF: (...args: unknown[]) => renderToPDFMock(...args),
  fmt: (n: number) => '$' + n.toLocaleString('en-US'),
}));

const renderPayAppPdfMock = jest.fn();
jest.mock('@/lib/aia/pay-app-pdf', () => ({
  __esModule: true,
  renderPayAppPdf: (...args: unknown[]) => renderPayAppPdfMock(...args),
}));

const { PDFDocument } = require('pdf-lib') as typeof import('pdf-lib');

async function pdfWithPages(n: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i += 1) doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

import {
  buildSubmissionBundle,
  type LienWaiverSource,
  type SubmissionBundleHeader,
} from '@/lib/aia/submission-bundle';
import type { PayAppPdfInput } from '@/lib/aia/pay-app-pdf';

const HEADER: SubmissionBundleHeader = {
  project_name: 'South Hilo Parks Baseyard',
  kid: 'KGL-2026-003',
  pay_app_number: 1,
  period_start: '2026-05-01',
  period_end: '2026-05-31',
  gc_name: null,
  gc_certifier_name: null,
  gc_certifier_email: null,
  gc_certifier_title: null,
  contractor_name: 'Kula Glass',
  submitted_by: 'pm@kulaglass.example',
  current_amount_due: 10000,
};

const PAY_APP_PDF_INPUT: PayAppPdfInput = {
  format: 'CUSTOM_TEMPLATE_SCHEDULE_ABC',
  header: {
    project_name: HEADER.project_name,
    kid: HEADER.kid,
    pay_app_number: HEADER.pay_app_number,
    period_start: HEADER.period_start,
    period_end: HEADER.period_end,
  },
  summary: {
    line1_original_contract_sum: 0, line2_net_change_by_co: 0, line3_contract_sum_to_date: 0,
    line4_total_completed_and_stored: 0, line5a_retainage_completed_work: 0, line5b_retainage_stored_materials: 0,
    line5_total_retainage: 0, line6_total_earned_less_retainage: 0, line7_less_previous_certificates: 0,
    line8_current_payment_due: 0, line9_balance_to_finish_plus_retainage: 0,
  },
  lines: [],
  retainage_pct_completed: 0.10,
  retainage_pct_stored: 0.10,
};

// Decode ZIP local-file-header filenames. We don't need a full ZIP parser
// here — just enough to enumerate the entry names so the test verifies
// what the bundle emitted.
function listZipFilenames(buf: Buffer): string[] {
  const names: string[] = [];
  let i = 0;
  while (i + 30 <= buf.length) {
    const sig = buf.readUInt32LE(i);
    if (sig !== 0x04034b50) break;
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const compressedSize = buf.readUInt32LE(i + 18);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf-8');
    names.push(name);
    i += 30 + nameLen + extraLen + compressedSize;
  }
  return names;
}

describe('AIA submission packet — ZIP fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    renderToPDFMock.mockImplementation(async () => pdfWithPages(1));
    renderPayAppPdfMock.mockImplementation(async () => pdfWithPages(2));
  });

  it('emits a ZIP with cover, pay app, fetched waivers (in order), and manifest', async () => {
    const waivers: LienWaiverSource[] = [
      { waiver_id: 'w1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', waiver_type: 'CONDITIONAL_PROGRESS', state: 'NOTARIZED', pdf_drive_id: null, notarized_pdf_drive_id: 'd1', waiver_amount: '1' },
      { waiver_id: 'w2bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', waiver_type: 'UNCONDITIONAL_PROGRESS', state: 'NOTARIZED', pdf_drive_id: null, notarized_pdf_drive_id: 'd2', waiver_amount: '2' },
    ];
    const driveFetch = jest.fn(async () => pdfWithPages(1));

    const result = await buildSubmissionBundle(
      {
        header: HEADER,
        notarized_pay_app_drive_id: null,
        pay_app_pdf_input: PAY_APP_PDF_INPUT,
        lien_waivers: waivers,
        gc_required_docs: [],
        cover_letter_template: null,
        format: 'zip',
      },
      driveFetch,
    );

    expect(result.content_type).toBe('application/zip');
    expect(result.filename).toBe('PayApp-1-KGL-2026-003-submission.zip');

    const names = listZipFilenames(result.buffer);
    expect(names[0]).toBe('01-cover-letter.pdf');
    expect(names[1]).toBe('02-pay-app-1.pdf');
    expect(names[2]).toBe('03-01-lien-waiver-conditional_progress-w1aaaaaa.pdf');
    expect(names[3]).toBe('03-02-lien-waiver-unconditional_progress-w2bbbbbb.pdf');
    expect(names[names.length - 1]).toBe('99-manifest.pdf');
  });

  it('skips waivers with no fetched buffer in the ZIP listing', async () => {
    const waivers: LienWaiverSource[] = [
      { waiver_id: 'w-ok', waiver_type: 'CONDITIONAL_PROGRESS', state: 'NOTARIZED', pdf_drive_id: null, notarized_pdf_drive_id: 'd1', waiver_amount: '1' },
      { waiver_id: 'w-no', waiver_type: 'UNCONDITIONAL_PROGRESS', state: 'PENDING', pdf_drive_id: null, notarized_pdf_drive_id: null, waiver_amount: '2' },
    ];
    const driveFetch = jest.fn(async (id: string | null | undefined) => {
      if (id === 'd1') return pdfWithPages(1);
      return null;
    });

    const result = await buildSubmissionBundle(
      {
        header: HEADER,
        notarized_pay_app_drive_id: null,
        pay_app_pdf_input: PAY_APP_PDF_INPUT,
        lien_waivers: waivers,
        gc_required_docs: [],
        cover_letter_template: null,
        format: 'zip',
      },
      driveFetch,
    );

    const names = listZipFilenames(result.buffer);
    expect(names.some((n) => n.includes('conditional_progress'))).toBe(true);
    expect(names.some((n) => n.includes('unconditional_progress'))).toBe(false);
  });

  it('safeKid sanitization keeps the filename portable', async () => {
    const result = await buildSubmissionBundle(
      {
        header: { ...HEADER, kid: 'KID with / weird : chars' },
        notarized_pay_app_drive_id: null,
        pay_app_pdf_input: PAY_APP_PDF_INPUT,
        lien_waivers: [],
        gc_required_docs: [],
        cover_letter_template: null,
        format: 'zip',
      },
      jest.fn(async () => null),
    );
    expect(result.filename).toBe('PayApp-1-KID_with_weird_chars-submission.zip');
  });
});
