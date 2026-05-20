/**
 * AIA Submission Packet Export — route-level coverage.
 *
 * Verifies GET /api/aia/pay-applications/[id]/submission-bundle:
 *   - 403 when permission check fails
 *   - 404 when pay app not found
 *   - 409 when pay app state is not in the allowed gate set
 *   - 400 when format param is invalid
 *   - 422 when billing_format is non-PDF (Textura CSV)
 *   - 413 when a Drive source exceeds the per-file cap
 *   - 200 happy path with the right Content-Disposition + buffer
 *
 * All DB / Drive / permission collaborators are mocked.
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

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID    = '00000000-0000-4000-8000-000000000099';
const PAY_APP_ID = '00000000-0000-4000-8000-000000000111';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];

function pushSelect(result: Array<Record<string, unknown>>) {
  selectResultQueue.push(result);
}

function tbl(label: string) {
  const cols = [
    'pay_app_id', 'tenant_id', 'engagement_id', 'pay_app_number', 'state',
    'period_start', 'period_end', 'billing_format', 'sov_version_id',
    'contract_sum_original', 'less_previous_certificates', 'current_amount_due',
    'kid', 'org_id', 'drive_folder_id',
    'retainage_pct', 'submission_cover_letter_template',
    'gc_certifier_name', 'gc_certifier_email', 'gc_certifier_title',
    'sov_line_id', 'display_item_number', 'parent_line_id',
    'signed_pdf_drive_id', 'completed_at',
    'waiver_id', 'waiver_type', 'pdf_drive_id', 'notarized_pdf_drive_id', 'waiver_amount',
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
    'line_number', 'description', 'scheduled_value',
    'work_completed_previous', 'work_completed_this_period', 'stored_materials',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

type ChainNode = PromiseLike<Array<Record<string, unknown>>> & {
  where: (...args: unknown[]) => ChainNode;
  orderBy: (...args: unknown[]) => ChainNode;
  limit: (...args: unknown[]) => ChainNode;
  offset: (...args: unknown[]) => ChainNode;
  innerJoin: (...args: unknown[]) => ChainNode;
  leftJoin: (...args: unknown[]) => ChainNode;
};

function chainNode(): ChainNode {
  const node = {} as ChainNode;
  node.then = ((res, rej) =>
    Promise.resolve(selectResultQueue.shift() ?? []).then(res, rej)) as ChainNode['then'];
  node.where = () => chainNode();
  node.orderBy = () => chainNode();
  node.limit = () => chainNode();
  node.offset = () => chainNode();
  node.innerJoin = () => chainNode();
  node.leftJoin = () => chainNode();
  return node;
}

function makeChainable() {
  return { from: () => chainNode() };
}

const db = {
  select: jest.fn(() => makeChainable()),
};

jest.mock('@/db', () => ({
  __esModule: true,
  db,
  pay_applications: tbl('pay_applications'),
  pay_app_line_items: tbl('pay_app_line_items'),
  schedule_of_values: tbl('schedule_of_values'),
  engagements: tbl('engagements'),
  billing_format_config: tbl('billing_format_config'),
  notarization_sessions: tbl('notarization_sessions'),
  lien_waivers: tbl('lien_waivers'),
  gc_required_docs_checklist: tbl('gc_required_docs_checklist'),
}));

const mockCheckPermission = jest.fn();
jest.mock('@/lib/permissions', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}));
jest.mock('@/lib/env', () => ({
  getDefaultTenantId: () => TENANT_ID,
  isPostgresWriteEnabled: () => true,
}));

const fetchDriveFileAsBufferMock = jest.fn();
class FakeDriveFetchTooLargeError extends Error {
  fileId: string;
  bytes: number;
  constructor(fileId: string, bytes: number) {
    super('drive too large');
    this.name = 'DriveFetchTooLargeError';
    this.fileId = fileId;
    this.bytes = bytes;
  }
}
jest.mock('@/lib/aia/drive-fetch', () => ({
  __esModule: true,
  fetchDriveFileAsBuffer: (...args: unknown[]) => fetchDriveFileAsBufferMock(...args),
  DriveFetchTooLargeError: FakeDriveFetchTooLargeError,
  MAX_DRIVE_FETCH_BYTES: 25 * 1024 * 1024,
}));

const buildSubmissionBundleMock = jest.fn();
jest.mock('@/lib/aia/submission-bundle', () => ({
  __esModule: true,
  buildSubmissionBundle: (...args: unknown[]) => buildSubmissionBundleMock(...args),
}));

jest.mock('@/lib/aia/pay-app-calc', () => ({
  __esModule: true,
  calcG703Line: jest.fn(() => ({
    scheduled_value: 0, work_completed_previous: 0, work_completed_this_period: 0,
    materials_stored_this_period: 0, total_completed_to_date: 0, pct_complete: 0,
    retainage_held: 0,
  })),
  summarizeG702: jest.fn(() => ({
    line1_original_contract_sum: 0, line2_net_change_by_co: 0, line3_contract_sum_to_date: 0,
    line4_total_completed_and_stored: 0, line5a_retainage_completed_work: 0,
    line5b_retainage_stored_materials: 0, line5_total_retainage: 0,
    line6_total_earned_less_retainage: 0, line7_less_previous_certificates: 0,
    line8_current_payment_due: 0, line9_balance_to_finish_plus_retainage: 0,
  })),
}));

jest.mock('@/lib/aia/pay-app-net-change-summary', () => ({
  __esModule: true,
  composeNetChangeFootnote: jest.fn(async () => ({ total: 0, footnote: '' })),
}));

function makeRequest(format = 'pdf') {
  return new Request(`http://localhost/api/aia/pay-applications/${PAY_APP_ID}/submission-bundle?format=${format}`);
}

async function importRoute() {
  return import('@/app/api/aia/pay-applications/[id]/submission-bundle/route');
}

beforeEach(() => {
  jest.clearAllMocks();
  selectResultQueue.length = 0;
  mockCheckPermission.mockResolvedValue({ allowed: true, role: 'pm', email: 'pm@kulaglass.com' });
  buildSubmissionBundleMock.mockResolvedValue({
    buffer: Buffer.from('FAKEPDF'),
    filename: 'PayApp-7-KID-submission.pdf',
    content_type: 'application/pdf',
    manifest: [{ section: 'Cover Letter', source: 'generated', status: 'canonical template', pages: 1 }],
  });
});

describe('GET /api/aia/pay-applications/[id]/submission-bundle', () => {
  it('returns 403 when the permission gate denies', async () => {
    mockCheckPermission.mockResolvedValueOnce({ allowed: false, role: 'guest', email: null });
    const { GET } = await importRoute();
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: PAY_APP_ID }) });
    expect(res.status).toBe(403);
  });

  it('returns 400 when the format query param is not pdf or zip', async () => {
    const { GET } = await importRoute();
    const res = await GET(makeRequest('docx'), { params: Promise.resolve({ id: PAY_APP_ID }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/format/);
  });

  it('returns 404 when the pay app row is missing', async () => {
    pushSelect([]); // pay_applications query
    const { GET } = await importRoute();
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: PAY_APP_ID }) });
    expect(res.status).toBe(404);
  });

  it('returns 409 when the pay app state is outside the allowed gate set', async () => {
    pushSelect([{
      pay_app_id: PAY_APP_ID, tenant_id: TENANT_ID, engagement_id: ENG_ID,
      state: 'PENDING_DRAFT', billing_format: 'AIA_G702_G703', pay_app_number: 2,
      period_start: '2026-04-01', period_end: '2026-04-30',
    }]);
    const { GET } = await importRoute();
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: PAY_APP_ID }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('INVALID_STATE');
    expect(body.allowed_states).toEqual(expect.arrayContaining(['READY_FOR_SUBMISSION']));
  });

  it('returns 422 when billing_format is the TEXTURA CSV variant', async () => {
    pushSelect([{
      pay_app_id: PAY_APP_ID, tenant_id: TENANT_ID, engagement_id: ENG_ID,
      state: 'READY_FOR_SUBMISSION', billing_format: 'TEXTURA_CSV_EXPORT', pay_app_number: 2,
      period_start: '2026-04-01', period_end: '2026-04-30',
    }]);
    const { GET } = await importRoute();
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: PAY_APP_ID }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('INVALID_BILLING_FORMAT');
  });

  it('returns 200 happy path with attachment Content-Disposition and bundle headers', async () => {
    pushSelect([{
      pay_app_id: PAY_APP_ID, tenant_id: TENANT_ID, engagement_id: ENG_ID,
      state: 'READY_FOR_SUBMISSION', billing_format: 'AIA_G702_G703', pay_app_number: 7,
      period_start: '2026-04-01', period_end: '2026-04-30',
      contract_sum_original: '1000000', less_previous_certificates: '325000',
      sov_version_id: null, current_amount_due: '125000',
    }]);
    // Promise.all order with sov_version_id=null (schedule_of_values short-circuits to Promise.resolve([])):
    pushSelect([]); // pay_app_line_items
    pushSelect([{ kid: 'KGL-2026-001', org_id: 'org-1', drive_folder_id: null }]); // engagements
    pushSelect([{ retainage_pct: '10', submission_cover_letter_template: null, gc_certifier_name: 'Jane', gc_certifier_email: 'jane@gc.com', gc_certifier_title: 'PM' }]); // billing_format_config
    pushSelect([{ signed_pdf_drive_id: 'drv-not', completed_at: new Date() }]); // notarization_sessions
    pushSelect([]); // lien_waivers
    pushSelect([]); // gc_required_docs_checklist

    const { GET } = await importRoute();
    const res = await GET(makeRequest('pdf'), { params: Promise.resolve({ id: PAY_APP_ID }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename=".+\.pdf"$/);
    expect(res.headers.get('x-pay-app-id')).toBe(PAY_APP_ID);
    expect(res.headers.get('x-bundle-format')).toBe('pdf');
    expect(buildSubmissionBundleMock).toHaveBeenCalledTimes(1);
  });

  it('passes through ZIP format to the bundle builder', async () => {
    pushSelect([{
      pay_app_id: PAY_APP_ID, tenant_id: TENANT_ID, engagement_id: ENG_ID,
      state: 'SUBMITTED', billing_format: 'AIA_G702_G703', pay_app_number: 2,
      period_start: '2026-04-01', period_end: '2026-04-30',
      contract_sum_original: '0', less_previous_certificates: '0',
      sov_version_id: null, current_amount_due: '0',
    }]);
    pushSelect([]); // line_items
    pushSelect([{ kid: 'KGL', org_id: 'org-1', drive_folder_id: null }]); // eng
    pushSelect([]); // cfg
    // sov short-circuits
    pushSelect([]); // notar
    pushSelect([]); // waivers
    pushSelect([]); // checklist

    buildSubmissionBundleMock.mockResolvedValueOnce({
      buffer: Buffer.from('PK'),
      filename: 'PayApp-2-KGL-submission.zip',
      content_type: 'application/zip',
      manifest: [],
    });

    const { GET } = await importRoute();
    const res = await GET(makeRequest('zip'), { params: Promise.resolve({ id: PAY_APP_ID }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(buildSubmissionBundleMock.mock.calls[0][0].format).toBe('zip');
  });

  it('returns 413 when the bundle builder throws DriveFetchTooLargeError', async () => {
    pushSelect([{
      pay_app_id: PAY_APP_ID, tenant_id: TENANT_ID, engagement_id: ENG_ID,
      state: 'READY_FOR_SUBMISSION', billing_format: 'AIA_G702_G703', pay_app_number: 1,
      period_start: '2026-04-01', period_end: '2026-04-30',
      contract_sum_original: '0', less_previous_certificates: '0',
      sov_version_id: null, current_amount_due: '0',
    }]);
    pushSelect([]); // line_items
    pushSelect([{ kid: 'k', org_id: 'org', drive_folder_id: null }]); // eng
    pushSelect([]); // cfg
    // sov short-circuits
    pushSelect([]); // notar
    pushSelect([]); // waivers
    pushSelect([]); // checklist

    buildSubmissionBundleMock.mockImplementationOnce(async () => {
      throw new FakeDriveFetchTooLargeError('drv-huge', 50 * 1024 * 1024);
    });

    const { GET } = await importRoute();
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: PAY_APP_ID }) });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.code).toBe('DRIVE_FILE_TOO_LARGE');
    expect(body.drive_file_id).toBe('drv-huge');
  });

  it('reads GC-required-docs checklist and passes the required rows through', async () => {
    pushSelect([{
      pay_app_id: PAY_APP_ID, tenant_id: TENANT_ID, engagement_id: ENG_ID,
      state: 'READY_FOR_SUBMISSION', billing_format: 'AIA_G702_G703', pay_app_number: 4,
      period_start: '2026-04-01', period_end: '2026-04-30',
      contract_sum_original: '0', less_previous_certificates: '0',
      sov_version_id: null, current_amount_due: '0',
    }]);
    pushSelect([]); // line_items
    pushSelect([{ kid: 'k', org_id: 'org', drive_folder_id: null }]); // eng
    pushSelect([{ retainage_pct: '10' }]); // cfg
    // sov short-circuits
    pushSelect([]); // notar
    pushSelect([]); // waivers
    pushSelect([{
      requires_conditional_progress_waiver_from_kula: true,
      requires_unconditional_progress_waiver_from_kula: false,
      requires_conditional_final_waiver_from_kula: false,
      requires_unconditional_final_waiver_from_kula: false,
      requires_external_waivers_from_manufacturers: false,
      requires_joint_check_agreement: false,
      requires_certificate_of_vendor_compliance: true,
      requires_glaziers_union_lien_clearance: false,
      requires_certified_payroll: false,
      requires_safety_documentation: false,
      custom_required_docs: [{ label: 'Custom GC binder', required: true }, 'Plain-string custom doc'],
    }]);

    const { GET } = await importRoute();
    await GET(makeRequest('pdf'), { params: Promise.resolve({ id: PAY_APP_ID }) });
    const args = buildSubmissionBundleMock.mock.calls[0][0];
    const docs = args.gc_required_docs;
    const requiredLabels = docs.filter((d: { required: boolean; label: string }) => d.required).map((d: { label: string }) => d.label);
    expect(requiredLabels).toEqual(expect.arrayContaining([
      'Conditional progress waiver from Kula',
      'Certificate of vendor compliance',
      'Custom GC binder',
      'Plain-string custom doc',
    ]));
    expect(requiredLabels).not.toContain('Unconditional progress waiver from Kula');
  });
});
