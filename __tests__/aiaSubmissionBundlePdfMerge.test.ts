/**
 * AIA Submission Packet Export — PDF merge integration coverage.
 *
 * Uses real pdf-lib to verify the merged output is a valid PDF and the
 * page count equals the sum of source pages (cover + pay app + waivers +
 * manifest). The cover/manifest renders are stubbed (1 page each) so the
 * test stays fast; the pay app PDF stub returns a real 2-page PDF byte
 * stream so the merge has a non-trivial multi-page source to copy.
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
  project_name: 'War Memorial Gym',
  kid: 'KGL-2026-002',
  pay_app_number: 3,
  period_start: '2026-04-01',
  period_end: '2026-04-30',
  gc_name: 'Blazy Construction',
  gc_certifier_name: null,
  gc_certifier_email: null,
  gc_certifier_title: null,
  contractor_name: 'Kula Glass',
  submitted_by: 'pm@kulaglass.example',
  current_amount_due: 88000,
};

const PAY_APP_PDF_INPUT: PayAppPdfInput = {
  format: 'CUSTOM_TEMPLATE_AIA_STYLE',
  header: {
    project_name: HEADER.project_name,
    kid: HEADER.kid,
    pay_app_number: HEADER.pay_app_number,
    period_start: HEADER.period_start,
    period_end: HEADER.period_end,
  },
  summary: {
    line1_original_contract_sum: 0,
    line2_net_change_by_co: 0,
    line3_contract_sum_to_date: 0,
    line4_total_completed_and_stored: 0,
    line5a_retainage_completed_work: 0,
    line5b_retainage_stored_materials: 0,
    line5_total_retainage: 0,
    line6_total_earned_less_retainage: 0,
    line7_less_previous_certificates: 0,
    line8_current_payment_due: 0,
    line9_balance_to_finish_plus_retainage: 0,
  },
  lines: [],
  retainage_pct_completed: 0.05,
  retainage_pct_stored: 0.05,
};

describe('AIA submission packet — PDF merge integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Cover letter + manifest stubs each return a 1-page PDF.
    renderToPDFMock.mockImplementation(async () => pdfWithPages(1));
    renderPayAppPdfMock.mockImplementation(async () => pdfWithPages(2));
  });

  it('returns a PDF buffer whose page count = cover + payApp + fetched waivers + manifest', async () => {
    const waivers: LienWaiverSource[] = [
      { waiver_id: 'w-aaa', waiver_type: 'CONDITIONAL_PROGRESS', state: 'NOTARIZED', pdf_drive_id: null, notarized_pdf_drive_id: 'drv-1', waiver_amount: '50000' },
      { waiver_id: 'w-bbb', waiver_type: 'UNCONDITIONAL_PROGRESS', state: 'NOTARIZED', pdf_drive_id: null, notarized_pdf_drive_id: 'drv-2', waiver_amount: '60000' },
    ];

    const driveFetch = jest.fn(async (id: string | null | undefined) => {
      if (id === 'drv-1') return pdfWithPages(1);
      if (id === 'drv-2') return pdfWithPages(3);
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
        format: 'pdf',
      },
      driveFetch,
    );

    expect(result.content_type).toBe('application/pdf');
    expect(result.filename).toBe('PayApp-3-KGL-2026-002-submission.pdf');

    const merged = await PDFDocument.load(result.buffer, { ignoreEncryption: true });
    // cover(1) + payApp(2) + waivers(1+3=4) + manifest(1) = 8
    expect(merged.getPageCount()).toBe(8);
  });

  it('omits waivers with missing or failed Drive fetches from the merged page count', async () => {
    const waivers: LienWaiverSource[] = [
      { waiver_id: 'w-ok',   waiver_type: 'CONDITIONAL_PROGRESS', state: 'NOTARIZED', pdf_drive_id: null, notarized_pdf_drive_id: 'drv-ok',   waiver_amount: '1' },
      { waiver_id: 'w-fail', waiver_type: 'UNCONDITIONAL_PROGRESS', state: 'NOTARIZED', pdf_drive_id: null, notarized_pdf_drive_id: 'drv-fail', waiver_amount: '2' },
      { waiver_id: 'w-none', waiver_type: 'CONDITIONAL_FINAL', state: 'PENDING', pdf_drive_id: null, notarized_pdf_drive_id: null, waiver_amount: '3' },
    ];

    const driveFetch = jest.fn(async (id: string | null | undefined) => {
      if (id === 'drv-ok') return pdfWithPages(2);
      if (id === 'drv-fail') throw new Error('drive 403');
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
        format: 'pdf',
      },
      driveFetch,
    );

    const merged = await PDFDocument.load(result.buffer, { ignoreEncryption: true });
    // cover(1) + payApp(2) + ok-waiver(2) + manifest(1) = 6
    expect(merged.getPageCount()).toBe(6);

    const failRow = result.manifest.find((m) => m.section === 'Unconditional Lien Waiver (Progress)')!;
    expect(failRow.status).toContain('fetch failed');
    expect(failRow.pages).toBeNull();

    const noneRow = result.manifest.find((m) => m.section === 'Conditional Lien Waiver (Final)')!;
    expect(noneRow.source).toBe('missing');
    expect(noneRow.pages).toBeNull();
  });

  it('orders waivers by waiver_type per the canonical sequence', async () => {
    // Pass waivers out-of-order; expect manifest to reorder.
    const waivers: LienWaiverSource[] = [
      { waiver_id: 'a', waiver_type: 'UNCONDITIONAL_FINAL', state: 'NOTARIZED', pdf_drive_id: null, notarized_pdf_drive_id: 'd1', waiver_amount: '1' },
      { waiver_id: 'b', waiver_type: 'CONDITIONAL_PROGRESS', state: 'NOTARIZED', pdf_drive_id: null, notarized_pdf_drive_id: 'd2', waiver_amount: '1' },
      { waiver_id: 'c', waiver_type: 'CONDITIONAL_FINAL', state: 'NOTARIZED', pdf_drive_id: null, notarized_pdf_drive_id: 'd3', waiver_amount: '1' },
      { waiver_id: 'd', waiver_type: 'UNCONDITIONAL_PROGRESS', state: 'NOTARIZED', pdf_drive_id: null, notarized_pdf_drive_id: 'd4', waiver_amount: '1' },
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
        format: 'pdf',
      },
      driveFetch,
    );
    const waiverSections = result.manifest
      .map((m) => m.section)
      .filter((s) => s.startsWith('Conditional') || s.startsWith('Unconditional'));
    expect(waiverSections).toEqual([
      'Conditional Lien Waiver (Progress)',
      'Unconditional Lien Waiver (Progress)',
      'Conditional Lien Waiver (Final)',
      'Unconditional Lien Waiver (Final)',
    ]);
  });
});
