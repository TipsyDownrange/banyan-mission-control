/**
 * AIA Submission Packet Export v1 — assembler unit tests with mocked
 * DB + Drive + PDF rendering.  Verifies state gate, section ordering,
 * notarized-vs-generated fallback, lien-waiver inclusion, and manifest
 * content.
 */

jest.mock('@react-pdf/renderer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLocal = require('react');
  const component = (name: string) => ({ children, ...props }: { children?: unknown }) =>
    ReactLocal.createElement(name, props, children);
  return {
    Document: component('Document'),
    Page: component('Page'),
    Text: component('Text'),
    View: component('View'),
    Image: component('Image'),
    StyleSheet: { create: (styles: unknown) => styles },
    pdf: () => ({ toBlob: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }) }),
  };
});

import { PDFDocument } from 'pdf-lib';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID    = '00000000-0000-4000-8000-000000000099';
const PAY_APP_ID = '00000000-0000-4000-8000-000000000111';
const SOV_VER_ID = '00000000-0000-4000-8000-000000000222';
const WAIVER_ID_1 = '00000000-0000-4000-8000-000000000301';
const WAIVER_ID_2 = '00000000-0000-4000-8000-000000000302';

const selectQueue: Array<Array<Record<string, unknown>>> = [];
function pushSelect(rows: Array<Record<string, unknown>>) { selectQueue.push(rows); }

type ChainNode = PromiseLike<Array<Record<string, unknown>>> & {
  where: (...args: unknown[]) => ChainNode;
  orderBy: (...args: unknown[]) => ChainNode;
  limit: (...args: unknown[]) => ChainNode;
  innerJoin: (...args: unknown[]) => ChainNode;
};

function chainNode(): ChainNode {
  const node = {} as ChainNode;
  node.then = ((res, rej) =>
    Promise.resolve(selectQueue.shift() ?? []).then(res, rej)) as ChainNode['then'];
  node.where = () => chainNode();
  node.orderBy = () => chainNode();
  node.limit = () => chainNode();
  node.innerJoin = () => chainNode();
  return node;
}

jest.mock('@/db', () => {
  const tbl = (label: string) => {
    const cols = [
      'pay_app_id','tenant_id','engagement_id','pay_app_number','state',
      'period_start','period_end','sov_version_id','billing_format',
      'contract_sum_original','less_previous_certificates','current_amount_due',
      'pdf_drive_id','kid','org_id','drive_folder_id','name',
      'retainage_pct','gc_certifier_name','gc_certifier_email','gc_certifier_title',
      'session_id','signed_pdf_drive_id','completed_at','target_kind',
      'waiver_id','waiver_type','notarized_pdf_drive_id','drive_file_ref',
      'sov_line_id','version_number','display_item_number','line_number','description','scheduled_value','parent_line_id',
      'requires_conditional_progress_waiver_from_kula',
      'requires_unconditional_progress_waiver_from_kula',
      'requires_conditional_final_waiver_from_kula',
      'requires_unconditional_final_waiver_from_kula',
      'requires_external_waivers_from_manufacturers',
      'requires_joint_check_agreement',
      'requires_certificate_of_vendor_compliance',
      'requires_glaziers_union_lien_clearance',
      'requires_certified_payroll',
      'requires_safety_documentation',
      'custom_required_docs',
      'work_completed_previous','work_completed_this_period','stored_materials',
    ];
    const out: Record<string, { name: string }> = {};
    for (const c of cols) out[c] = { name: c };
    return { _label: label, ...out };
  };
  return {
    db: {
      select: jest.fn(() => ({ from: () => chainNode() })),
    },
    pay_applications:           tbl('pay_applications'),
    pay_app_line_items:         tbl('pay_app_line_items'),
    schedule_of_values:         tbl('schedule_of_values'),
    sov_versions:               tbl('sov_versions'),
    notarization_sessions:      tbl('notarization_sessions'),
    lien_waivers:               tbl('lien_waivers'),
    billing_format_config:      tbl('billing_format_config'),
    engagements:                tbl('engagements'),
    organizations:              tbl('organizations'),
    gc_required_docs_checklist: tbl('gc_required_docs_checklist'),
  };
});

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(),
}));

jest.mock('@/lib/aia/pay-app-net-change-summary', () => ({
  composeNetChangeFootnote: jest.fn(async () => ({ total: 0, footnote: '' })),
}));

// Replace the React-PDF renderer with a deterministic in-process pdf-lib stub
// so the assembler test stays independent of @react-pdf font / canvas paths.
jest.mock('@/lib/pdf-templates', () => {
  const actual = jest.requireActual('@/lib/pdf-templates');
  const { PDFDocument: PDFDocumentReal } = jest.requireActual('pdf-lib');
  return {
    ...actual,
    renderToPDF: jest.fn(async () => {
      const doc = await PDFDocumentReal.create();
      doc.addPage([612, 792]);
      const bytes = await doc.save();
      return Buffer.from(bytes);
    }),
  };
});

// Drive downloader — replaced per-test via the assembler `driveDownloader` opt.

import {
  assembleSubmissionBundle,
  checklistRowsFromDbRow,
  InvalidPayAppStateError,
  PayAppNotFoundError,
  BundleSizeLimitError,
  MAX_SOURCE_BYTES,
} from '@/lib/aia/submission-bundle-assembler';

const BASE_PAY = {
  pay_app_id: PAY_APP_ID,
  pay_app_number: 7,
  state: 'READY_FOR_SUBMISSION',
  period_start: '2026-04-01',
  period_end: '2026-04-30',
  engagement_id: ENG_ID,
  sov_version_id: SOV_VER_ID,
  billing_format: 'AIA_G702_G703',
  contract_sum_original: '1000000',
  less_previous_certificates: '200000',
  current_amount_due: '125000',
  pdf_drive_id: null,
};

const BASE_ENG = { kid: 'K-2026-HOKHTL', org_id: 'org-1', drive_folder_id: null };
const BASE_ORG = { name: 'Hawaiian Dredging Construction Co.' };

const BASE_CFG = {
  retainage_pct: '10',
  gc_certifier_name: 'Karen Asahi',
  gc_certifier_email: 'karen@hdcc.com',
  gc_certifier_title: 'PM',
};

const BASE_CHECKLIST = {
  requires_conditional_progress_waiver_from_kula: true,
  requires_unconditional_progress_waiver_from_kula: true,
  requires_conditional_final_waiver_from_kula: false,
  requires_unconditional_final_waiver_from_kula: false,
  requires_external_waivers_from_manufacturers: false,
  requires_joint_check_agreement: false,
  requires_certificate_of_vendor_compliance: false,
  requires_glaziers_union_lien_clearance: false,
  requires_certified_payroll: true,
  requires_safety_documentation: false,
  custom_required_docs: [],
};

beforeEach(() => {
  selectQueue.length = 0;
});

async function tinyPdf(label = 'x'): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  doc.setTitle(label);
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

describe('AIA submission bundle — assembler', () => {
  it('rejects pay apps in PENDING_DRAFT with InvalidPayAppStateError', async () => {
    pushSelect([{ ...BASE_PAY, state: 'PENDING_DRAFT' }]);
    await expect(
      assembleSubmissionBundle({
        payAppId: PAY_APP_ID,
        format: 'pdf',
        ctx: { tenantId: TENANT_ID, actorEmail: 'sean@kula' },
        driveDownloader: async () => Buffer.alloc(0),
      }),
    ).rejects.toBeInstanceOf(InvalidPayAppStateError);
  });

  it('throws PayAppNotFoundError when the pay app row is missing', async () => {
    pushSelect([]); // pay_applications.select returns empty
    await expect(
      assembleSubmissionBundle({
        payAppId: PAY_APP_ID,
        format: 'pdf',
        ctx: { tenantId: TENANT_ID, actorEmail: 'sean@kula' },
        driveDownloader: async () => Buffer.alloc(0),
      }),
    ).rejects.toBeInstanceOf(PayAppNotFoundError);
  });

  it('assembles a PDF bundle in READY_FOR_SUBMISSION using notarized pay app + lien waivers', async () => {
    // prepareContext: pay -> engagement -> organization -> billing_cfg -> checklist
    pushSelect([BASE_PAY]);
    pushSelect([BASE_ENG]);
    pushSelect([BASE_ORG]);
    pushSelect([BASE_CFG]);
    pushSelect([BASE_CHECKLIST]);
    // loadPayAppPdf -> notarization_sessions (found, COMPLETED)
    pushSelect([{ session_id: 'sess-1', signed_pdf_drive_id: 'DRIVE_NOTARIZED', completed_at: '2026-05-10T00:00:00Z' }]);
    // loadSovReference -> sov_versions, then schedule_of_values
    pushSelect([{ version_number: 3, state: 'LOCKED' }]);
    pushSelect([
      { display_item_number: '01', line_number: 1, description: 'Mobilization', scheduled_value: '50000' },
      { display_item_number: '02', line_number: 2, description: 'Glazing',      scheduled_value: '450000' },
    ]);
    // loadLienWaivers
    pushSelect([
      { waiver_id: WAIVER_ID_2, waiver_type: 'UNCONDITIONAL_PROGRESS', state: 'NOTARIZED', pdf_drive_id: 'DRIVE_W2', notarized_pdf_drive_id: 'DRIVE_W2N', drive_file_ref: null },
      { waiver_id: WAIVER_ID_1, waiver_type: 'CONDITIONAL_PROGRESS',   state: 'GENERATED', pdf_drive_id: 'DRIVE_W1', notarized_pdf_drive_id: null,         drive_file_ref: null },
    ]);

    const driveMap: Record<string, Buffer> = {
      DRIVE_NOTARIZED: await tinyPdf('notarized'),
      DRIVE_W1: await tinyPdf('waiver-1'),
      DRIVE_W2N: await tinyPdf('waiver-2-notarized'),
    };
    const result = await assembleSubmissionBundle({
      payAppId: PAY_APP_ID,
      format: 'pdf',
      ctx: { tenantId: TENANT_ID, actorEmail: 'sean@kula' },
      driveDownloader: async (id: string) => driveMap[id] ?? Buffer.alloc(0),
      officerName: 'Sean Daniels',
      now: new Date('2026-05-20T14:00:00Z'),
    });

    expect(result.content_type).toBe('application/pdf');
    expect(result.filename).toBe('PayApp-007-K-2026-HOKHTL-submission.pdf');
    // Sections order: cover, pay-app (notarized), SOV, waiver(conditional progress), waiver(uncond progress), manifest
    const titles = result.sections.map((s) => s.title);
    expect(titles[0]).toBe('Cover Letter');
    expect(titles[1]).toBe('Pay Application No. 7');
    expect(titles[2]).toBe('Schedule of Values reference');
    expect(titles[3]).toContain('Conditional Progress');
    expect(titles[4]).toContain('Unconditional Progress');
    expect(titles[titles.length - 1]).toBe('Submission manifest');
    // Pay-app section status reflects the notarized source
    expect(result.sections[1].signed_status).toBe('NOTARIZED');
    // Output PDF is valid
    const reloaded = await PDFDocument.load(result.buffer);
    expect(reloaded.getPageCount()).toBeGreaterThan(0);
  });

  it('falls back to a freshly-rendered pay-app PDF when no notarization exists and no pdf_drive_id', async () => {
    pushSelect([{ ...BASE_PAY, pdf_drive_id: null }]);
    pushSelect([BASE_ENG]);
    pushSelect([BASE_ORG]);
    pushSelect([BASE_CFG]);
    pushSelect([BASE_CHECKLIST]);
    // notarization_sessions — empty
    pushSelect([]);
    // renderFreshPayAppPdf path: pay_app_line_items, then SOV (sov_lines)
    pushSelect([
      { sov_line_id: null, description: 'A', line_number: 1, scheduled_value: '100', work_completed_previous: '0', work_completed_this_period: '50', stored_materials: '0' },
    ]);
    pushSelect([]); // sovLineRows for the join
    // loadSovReference: sov_versions, schedule_of_values
    pushSelect([{ version_number: 3, state: 'LOCKED' }]);
    pushSelect([
      { display_item_number: '01', line_number: 1, description: 'A', scheduled_value: '100' },
    ]);
    // lien_waivers
    pushSelect([]);

    const result = await assembleSubmissionBundle({
      payAppId: PAY_APP_ID,
      format: 'pdf',
      ctx: { tenantId: TENANT_ID, actorEmail: 'sean@kula' },
      driveDownloader: async () => Buffer.alloc(0),
      now: new Date('2026-05-20T14:00:00Z'),
    });
    // Pay-app section comes from in-process render -> 'GENERATED'
    expect(result.sections[1].signed_status).toBe('GENERATED');
    expect(result.sections[1].source).toMatch(/rendered in-process/);
  });

  it('skips lien waivers that have no drive artifact', async () => {
    pushSelect([BASE_PAY]);
    pushSelect([BASE_ENG]);
    pushSelect([BASE_ORG]);
    pushSelect([BASE_CFG]);
    pushSelect([BASE_CHECKLIST]);
    pushSelect([{ session_id: 'sess-1', signed_pdf_drive_id: 'DRIVE_NOTARIZED', completed_at: '2026-05-10T00:00:00Z' }]);
    pushSelect([{ version_number: 3, state: 'LOCKED' }]);
    pushSelect([{ display_item_number: '01', line_number: 1, description: 'A', scheduled_value: '100' }]);
    pushSelect([
      // Waiver has all-null drive refs -> must be skipped
      { waiver_id: WAIVER_ID_1, waiver_type: 'CONDITIONAL_PROGRESS', state: 'GENERATED', pdf_drive_id: null, notarized_pdf_drive_id: null, drive_file_ref: null },
    ]);
    const driveMap: Record<string, Buffer> = { DRIVE_NOTARIZED: await tinyPdf('n') };
    const result = await assembleSubmissionBundle({
      payAppId: PAY_APP_ID,
      format: 'pdf',
      ctx: { tenantId: TENANT_ID, actorEmail: 'sean@kula' },
      driveDownloader: async (id: string) => driveMap[id] ?? (() => { throw new Error('not found'); })(),
      now: new Date('2026-05-20T14:00:00Z'),
    });
    const titles = result.sections.map((s) => s.title);
    expect(titles.some((t) => t.includes('Lien Waiver'))).toBe(false);
  });

  it('returns ZIP content-type and filename when format=zip', async () => {
    pushSelect([BASE_PAY]);
    pushSelect([BASE_ENG]);
    pushSelect([BASE_ORG]);
    pushSelect([BASE_CFG]);
    pushSelect([BASE_CHECKLIST]);
    pushSelect([{ session_id: 'sess-1', signed_pdf_drive_id: 'DRIVE_NOTARIZED', completed_at: '2026-05-10T00:00:00Z' }]);
    pushSelect([{ version_number: 3, state: 'LOCKED' }]);
    pushSelect([{ display_item_number: '01', line_number: 1, description: 'A', scheduled_value: '100' }]);
    pushSelect([]);

    const driveMap: Record<string, Buffer> = { DRIVE_NOTARIZED: await tinyPdf('n') };
    const result = await assembleSubmissionBundle({
      payAppId: PAY_APP_ID,
      format: 'zip',
      ctx: { tenantId: TENANT_ID, actorEmail: 'sean@kula' },
      driveDownloader: async (id: string) => driveMap[id] ?? Buffer.alloc(0),
      now: new Date('2026-05-20T14:00:00Z'),
    });
    expect(result.content_type).toBe('application/zip');
    expect(result.filename).toBe('PayApp-007-K-2026-HOKHTL-submission.zip');
    // ZIP signature PK\x03\x04
    expect(result.buffer.subarray(0, 4).toString('hex')).toBe('504b0304');
  });

  it('throws BundleSizeLimitError when a single source exceeds 25 MB', async () => {
    pushSelect([BASE_PAY]);
    pushSelect([BASE_ENG]);
    pushSelect([BASE_ORG]);
    pushSelect([BASE_CFG]);
    pushSelect([BASE_CHECKLIST]);
    pushSelect([{ session_id: 'sess-1', signed_pdf_drive_id: 'DRIVE_NOTARIZED', completed_at: '2026-05-10T00:00:00Z' }]);

    // Drive returns a buffer larger than the 25 MB cap (don't actually allocate
    // 25 MB — use a Buffer with manipulated byteLength via Buffer.alloc).
    const oversized = Buffer.alloc(MAX_SOURCE_BYTES + 1);
    await expect(
      assembleSubmissionBundle({
        payAppId: PAY_APP_ID,
        format: 'pdf',
        ctx: { tenantId: TENANT_ID, actorEmail: 'sean@kula' },
        driveDownloader: async () => oversized,
      }),
    ).rejects.toBeInstanceOf(BundleSizeLimitError);
  });
});

describe('checklistRowsFromDbRow', () => {
  it('returns [] for null row', () => {
    expect(checklistRowsFromDbRow(null)).toEqual([]);
  });

  it('emits one row per requires_* boolean plus any string entries in custom_required_docs', () => {
    const rows = checklistRowsFromDbRow({
      ...BASE_CHECKLIST,
      custom_required_docs: ['Bond rider proof', { label: 'OSHA logs', notes: 'last 12 months' }, ''],
    });
    expect(rows.find((r) => r.label === 'Conditional progress waiver from Kula')?.required).toBe(true);
    expect(rows.find((r) => r.label === 'Certified payroll')?.required).toBe(true);
    expect(rows.find((r) => r.label === 'Safety documentation')?.required).toBe(false);
    expect(rows.some((r) => r.label === 'Bond rider proof')).toBe(true);
    expect(rows.some((r) => r.label === 'OSHA logs')).toBe(true);
    // Empty-string entry should be filtered out
    expect(rows.some((r) => r.label === '')).toBe(false);
  });
});
