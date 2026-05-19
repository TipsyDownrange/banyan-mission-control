/**
 * BAN-336 follow-up — generated pay-app PDFs upload to Drive when the
 * engagement folder and service-account credentials are configured.
 */

export {};

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ENG_ID = '00000000-0000-4000-8000-000000000099';
const PAY_APP_ID = '00000000-0000-4000-8000-000000000111';

const selectResultQueue: Array<Array<Record<string, unknown>>> = [];
const updateSetSpy = jest.fn();

function pushSelect(result: Array<Record<string, unknown>>) {
  selectResultQueue.push(result);
}

type ChainNode = PromiseLike<Array<Record<string, unknown>>> & {
  where: (...args: unknown[]) => ChainNode;
  orderBy: (...args: unknown[]) => ChainNode;
  limit: (...args: unknown[]) => ChainNode;
  innerJoin: (...args: unknown[]) => ChainNode;
};

function chainNode(): ChainNode {
  const node = {} as ChainNode;
  node.then = ((res, rej) =>
    Promise.resolve(selectResultQueue.shift() ?? []).then(res, rej)) as ChainNode['then'];
  node.where = () => chainNode();
  node.orderBy = () => chainNode();
  node.limit = () => chainNode();
  node.innerJoin = () => chainNode();
  return node;
}

function makeDb() {
  return {
    select: jest.fn(() => ({ from: () => chainNode() })),
    update: jest.fn(() => ({
      set: (vals: Record<string, unknown>) => {
        updateSetSpy(vals);
        return { where: jest.fn(async () => [vals]) };
      },
    })),
  };
}

let db = makeDb();

function tbl(label: string) {
  const cols = [
    'pay_app_id', 'tenant_id', 'engagement_id', 'pay_app_number',
    'period_start', 'period_end', 'sov_version_id', 'contract_sum_original',
    'net_change_by_co', 'less_previous_certificates', 'billing_format',
    'pdf_drive_id', 'line_number', 'scheduled_value',
    'work_completed_previous', 'work_completed_this_period',
    'stored_materials', 'sov_line_id', 'description', 'retainage_pct',
    'kid', 'drive_folder_id', 'drive_folder_url', 'display_item_number',
    'parent_line_id',
  ];
  const out: Record<string, { name: string }> = {};
  for (const c of cols) out[c] = { name: c };
  return { _label: label, ...out };
}

jest.mock('@/db', () => ({
  __esModule: true,
  get db() { return db; },
  pay_applications: tbl('pay_applications'),
  pay_app_line_items: tbl('pay_app_line_items'),
  billing_format_config: tbl('billing_format_config'),
  engagements: tbl('engagements'),
  schedule_of_values: tbl('schedule_of_values'),
}));

jest.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
}));

jest.mock('@/lib/aia/api-gate', () => ({
  passAiaApiGate: jest.fn(async () => ({
    ok: true,
    tenantId: TENANT_ID,
    actorEmail: 'pm@kulaglass.com',
  })),
}));

const renderPayAppPdfMock = jest.fn(async () => Buffer.from('%PDF-test'));
jest.mock('@/lib/aia/pay-app-pdf', () => ({
  renderPayAppPdf: (input: unknown) => (renderPayAppPdfMock as jest.Mock)(input),
}));

jest.mock('@/lib/aia/pay-app-net-change-summary', () => ({
  composeNetChangeFootnote: jest.fn(async () => ({
    items: [],
    total: 0,
    footnote: 'Net Change by Change Orders: $0\nTotal: $0',
  })),
}));

const resolveEngagementDriveFolderIdMock = jest.fn();
const ensurePayAppFoldersMock = jest.fn();
const uploadBufferToDriveMock = jest.fn();
let consoleErrorSpy: jest.SpyInstance;
jest.mock('@/lib/aia/drive-pay-app-folders', () => ({
  resolveEngagementDriveFolderId: (...args: unknown[]) => resolveEngagementDriveFolderIdMock(...args),
  ensurePayAppFolders: (...args: unknown[]) => ensurePayAppFoldersMock(...args),
  uploadBufferToDrive: (...args: unknown[]) => uploadBufferToDriveMock(...args),
}));

const basePayApp = {
  pay_app_id: PAY_APP_ID,
  tenant_id: TENANT_ID,
  engagement_id: ENG_ID,
  pay_app_number: 7,
  period_start: '2026-05-01',
  period_end: '2026-05-31',
  sov_version_id: null,
  contract_sum_original: '1000.00',
  net_change_by_co: '0.00',
  less_previous_certificates: '0.00',
  billing_format: 'AIA_G702_G703',
};

const line = {
  pay_app_line_id: 'line-1',
  pay_app_id: PAY_APP_ID,
  line_number: 1,
  scheduled_value: '1000.00',
  work_completed_previous: '100.00',
  work_completed_this_period: '200.00',
  stored_materials: '50.00',
  retainage_held: '25.00',
  sov_line_id: null,
  description: 'Glass',
};

function pushGeneratePdfSelects(input: {
  driveFolderId?: string | null;
} = {}) {
  pushSelect([basePayApp]);
  pushSelect([line]);
  pushSelect([{
    kid: 'KID-100',
    drive_folder_id: input.driveFolderId ?? 'eng-folder-1',
  }]);
  pushSelect([{ retainage_pct: '10.00' }]);
}

async function callRoute() {
  const { POST } = await import('@/app/api/pay-apps/[id]/generate-pdf/route');
  return POST(
    new Request('http://localhost/api/pay-apps/x/generate-pdf', { method: 'POST' }),
    { params: Promise.resolve({ id: PAY_APP_ID }) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  selectResultQueue.length = 0;
  db = makeDb();
  process.env.GOOGLE_SA_KEY_B64 = Buffer.from(JSON.stringify({
    client_email: 'svc@kulaglass.com',
    private_key: 'private-key',
  })).toString('base64');
  resolveEngagementDriveFolderIdMock.mockReturnValue('eng-folder-1');
  ensurePayAppFoldersMock.mockResolvedValue({
    pay_apps_folder_id: 'pay-apps-folder',
    pay_app_folder_id: 'pay-app-folder-7',
    notarized_folder_id: 'notarized-folder',
    textura_folder_id: 'textura-folder',
  });
  uploadBufferToDriveMock.mockResolvedValue({
    drive_file_id: 'drive-file-123',
    drive_file_name: 'uploaded.pdf',
  });
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.GOOGLE_SA_KEY_B64;
  consoleErrorSpy.mockRestore();
});

describe('BAN-336 follow-up Drive upload for generated PDFs', () => {
  it('generates and uploads the PDF to the Pay Apps/{number} folder', async () => {
    pushGeneratePdfSelects();

    const res = await callRoute();

    expect(res.status).toBe(200);
    expect(res.headers.get('x-drive-target-path')).toMatch(/^Pay Apps\/7\/.+-pay-app-7\.pdf$/);
    expect(ensurePayAppFoldersMock).toHaveBeenCalledWith('eng-folder-1', 7);
    expect(uploadBufferToDriveMock).toHaveBeenCalledWith(
      'pay-app-folder-7',
      expect.stringMatching(/-pay-app-7\.pdf$/),
      'application/pdf',
      Buffer.from('%PDF-test'),
    );
  });

  it('returns Drive metadata in the response body after upload', async () => {
    pushGeneratePdfSelects();

    const res = await callRoute();
    const body = await res.json();

    expect(body).toEqual(expect.objectContaining({
      ok: true,
      pay_app_id: PAY_APP_ID,
      drive_file_id: 'drive-file-123',
      drive_view_url: 'https://drive.google.com/file/d/drive-file-123/view',
    }));
    expect(body.drive_target_path).toMatch(/^Pay Apps\/7\/.+-pay-app-7\.pdf$/);
  });

  it('persists pay_applications.pdf_drive_id after successful upload', async () => {
    pushGeneratePdfSelects();

    await callRoute();

    expect(updateSetSpy).toHaveBeenCalledWith({ pdf_drive_id: 'drive-file-123' });
  });

  it('returns the PDF with a warning when the engagement has no Drive folder', async () => {
    resolveEngagementDriveFolderIdMock.mockReturnValue(null);
    pushGeneratePdfSelects({ driveFolderId: null });

    const res = await callRoute();
    const bytes = Buffer.from(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('x-drive-warning')).toBe('drive_folder_not_configured');
    expect(bytes.toString()).toBe('%PDF-test');
    expect(uploadBufferToDriveMock).not.toHaveBeenCalled();
  });

  it('returns 503 when Drive service-account credentials are missing', async () => {
    delete process.env.GOOGLE_SA_KEY_B64;
    pushGeneratePdfSelects();

    const res = await callRoute();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe('DRIVE_SERVICE_ACCOUNT_NOT_CONFIGURED');
    expect(uploadBufferToDriveMock).not.toHaveBeenCalled();
  });

  it('returns the PDF with a warning when the Drive upload fails', async () => {
    uploadBufferToDriveMock.mockRejectedValueOnce(new Error('Drive unavailable'));
    pushGeneratePdfSelects();

    const res = await callRoute();
    const bytes = Buffer.from(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('x-drive-warning')).toBe('drive_upload_failed_pdf_returned_only');
    expect(bytes.toString()).toBe('%PDF-test');
    expect(updateSetSpy).not.toHaveBeenCalled();
  });
});
