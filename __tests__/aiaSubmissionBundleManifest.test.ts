/**
 * AIA Submission Packet Export — manifest assembly coverage.
 *
 * Exercises buildSubmissionBundle directly with stubbed @react-pdf and
 * stubbed pay-app-pdf renderers so the test stays in-memory and fast.
 * The PDF merge path itself is covered in aiaSubmissionBundlePdfMerge.test.ts
 * with real PDF byte streams.
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

// pdf-lib's PDFDocument.load needs a real PDF byte stream to count pages.
// We build a minimal valid 1-page PDF once and return it from the stubs so
// countPdfPages() returns 1 for every generated section. Page counts from
// real merged inputs come back from the actual PDFDocument calls below.
const { PDFDocument } = require('pdf-lib') as typeof import('pdf-lib');

async function singlePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

async function multiPagePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

import {
  buildSubmissionBundle,
  type LienWaiverSource,
  type SubmissionBundleHeader,
} from '@/lib/aia/submission-bundle';
import type { PayAppPdfInput } from '@/lib/aia/pay-app-pdf';

const HEADER: SubmissionBundleHeader = {
  project_name: 'Hokuala Resort',
  kid: 'KGL-2026-001',
  pay_app_number: 7,
  period_start: '2026-04-01',
  period_end: '2026-04-30',
  gc_name: 'ACME Construction',
  gc_certifier_name: 'Jane Builder',
  gc_certifier_email: 'jane@acme.example',
  gc_certifier_title: 'PM',
  contractor_name: 'Kula Glass',
  submitted_by: 'pm@kulaglass.example',
  current_amount_due: '125000.00',
};

const PAY_APP_PDF_INPUT: PayAppPdfInput = {
  format: 'AIA_G702_G703',
  header: {
    project_name: HEADER.project_name,
    kid: HEADER.kid,
    pay_app_number: HEADER.pay_app_number,
    period_start: HEADER.period_start,
    period_end: HEADER.period_end,
  },
  summary: {
    line1_original_contract_sum: 1_000_000,
    line2_net_change_by_co: 0,
    line3_contract_sum_to_date: 1_000_000,
    line4_total_completed_and_stored: 500_000,
    line5a_retainage_completed_work: 50_000,
    line5b_retainage_stored_materials: 0,
    line5_total_retainage: 50_000,
    line6_total_earned_less_retainage: 450_000,
    line7_less_previous_certificates: 325_000,
    line8_current_payment_due: 125_000,
    line9_balance_to_finish_plus_retainage: 550_000,
  },
  lines: [],
  retainage_pct_completed: 0.10,
  retainage_pct_stored: 0.10,
};

describe('AIA submission packet — manifest assembly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    renderToPDFMock.mockImplementation(async () => singlePagePdf());
    renderPayAppPdfMock.mockImplementation(async () => multiPagePdf(2));
  });

  it('manifest lists cover letter, pay app, every fetched waiver, required-doc rows, and itself', async () => {
    const driveFetch = jest.fn(async (id: string | null | undefined) => {
      if (!id) return null;
      return multiPagePdf(1);
    });

    const waivers: LienWaiverSource[] = [
      { waiver_id: 'w1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', waiver_type: 'CONDITIONAL_PROGRESS', state: 'NOTARIZED', pdf_drive_id: 'drv-cp-pdf', notarized_pdf_drive_id: 'drv-cp-not', waiver_amount: '50000' },
      { waiver_id: 'w2bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', waiver_type: 'UNCONDITIONAL_PROGRESS', state: 'PENDING', pdf_drive_id: 'drv-up-pdf', notarized_pdf_drive_id: null, waiver_amount: '75000' },
    ];

    const result = await buildSubmissionBundle(
      {
        header: HEADER,
        notarized_pay_app_drive_id: 'drv-notarized-payapp',
        pay_app_pdf_input: PAY_APP_PDF_INPUT,
        lien_waivers: waivers,
        gc_required_docs: [
          { label: 'Certificate of vendor compliance', required: true },
          { label: 'Safety documentation', required: true },
          { label: 'Certified payroll', required: false },
        ],
        cover_letter_template: null,
        format: 'pdf',
      },
      driveFetch,
    );

    expect(result.manifest.length).toBeGreaterThanOrEqual(6);

    const sections = result.manifest.map((m) => m.section);
    expect(sections).toContain('Cover Letter');
    expect(sections).toContain('Pay Application #7 (G702 + G703)');
    expect(sections).toContain('Conditional Lien Waiver (Progress)');
    expect(sections).toContain('Unconditional Lien Waiver (Progress)');
    expect(sections).toContain('Certificate of vendor compliance');
    expect(sections).toContain('Safety documentation');
    expect(sections).toContain('Submission Packet Manifest');
    expect(sections).not.toContain('Certified payroll');

    const conditional = result.manifest.find((m) => m.section === 'Conditional Lien Waiver (Progress)')!;
    expect(conditional.source).toBe('drive:drv-cp-not');
    expect(conditional.status).toBe('notarized');

    const unconditional = result.manifest.find((m) => m.section === 'Unconditional Lien Waiver (Progress)')!;
    expect(unconditional.source).toBe('drive:drv-up-pdf');
    expect(unconditional.status).toBe('unsigned');

    const reqDoc = result.manifest.find((m) => m.section === 'Certificate of vendor compliance')!;
    expect(reqDoc.pages).toBeNull();
    expect(reqDoc.status).toBe('informational');
  });

  it('cover letter status switches to canonical when no template is configured', async () => {
    const driveFetch = jest.fn(async () => null);
    const result = await buildSubmissionBundle(
      {
        header: HEADER,
        notarized_pay_app_drive_id: null,
        pay_app_pdf_input: PAY_APP_PDF_INPUT,
        lien_waivers: [],
        gc_required_docs: [],
        cover_letter_template: null,
        format: 'pdf',
      },
      driveFetch,
    );
    const cover = result.manifest.find((m) => m.section === 'Cover Letter')!;
    expect(cover.status).toBe('canonical template');
  });

  it('cover letter status reflects per-GC template when one is configured', async () => {
    const result = await buildSubmissionBundle(
      {
        header: HEADER,
        notarized_pay_app_drive_id: null,
        pay_app_pdf_input: PAY_APP_PDF_INPUT,
        lien_waivers: [],
        gc_required_docs: [],
        cover_letter_template: 'Aloha {gc_name}, here is your custom letter for {project_name}.',
        format: 'pdf',
      },
      jest.fn(async () => null),
    );
    const cover = result.manifest.find((m) => m.section === 'Cover Letter')!;
    expect(cover.status).toBe('per-GC template');
  });

  it('pay app status reads "unsigned" when no notarized id is present and "notarized" when fetched OK', async () => {
    const unsignedResult = await buildSubmissionBundle(
      {
        header: HEADER,
        notarized_pay_app_drive_id: null,
        pay_app_pdf_input: PAY_APP_PDF_INPUT,
        lien_waivers: [],
        gc_required_docs: [],
        cover_letter_template: null,
        format: 'pdf',
      },
      jest.fn(async () => null),
    );
    expect(unsignedResult.manifest.find((m) => m.section.startsWith('Pay Application'))!.status).toBe('unsigned');

    const notarizedResult = await buildSubmissionBundle(
      {
        header: HEADER,
        notarized_pay_app_drive_id: 'drv-not',
        pay_app_pdf_input: PAY_APP_PDF_INPUT,
        lien_waivers: [],
        gc_required_docs: [],
        cover_letter_template: null,
        format: 'pdf',
      },
      jest.fn(async () => multiPagePdf(2)),
    );
    expect(notarizedResult.manifest.find((m) => m.section.startsWith('Pay Application'))!.status).toBe('notarized');
  });
});
