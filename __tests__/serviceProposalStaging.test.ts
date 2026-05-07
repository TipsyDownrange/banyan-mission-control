const mockGetGoogleAuth = jest.fn();
const mockGoogleSheets = jest.fn();
const mockGoogleDrive = jest.fn();
const mockGoogleGmail = jest.fn();
const mockEmitMCEvent = jest.fn();
const mockGeneratePDF = jest.fn();

jest.mock('@/lib/gauth', () => ({ getGoogleAuth: mockGetGoogleAuth }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('@/lib/events', () => ({ emitMCEvent: mockEmitMCEvent }));
jest.mock('@/lib/hawaii-time', () => ({ hawaiiToday: jest.fn(() => '2026-05-07') }));
jest.mock('@/lib/pdf-service-wo', () => ({
  generateServiceWOPDF: mockGeneratePDF,
}));
jest.mock('googleapis', () => ({
  google: {
    sheets: mockGoogleSheets,
    drive: mockGoogleDrive,
    gmail: mockGoogleGmail,
  },
}));

const BANYAN_DRIVE_ID = '0AKSVpf3AnH7CUk9PVA';
const STAGING_FOLDER_ID = '142jODngww2a4PoNDrf-rjN5O_y40I3ti';

function makeRequest(body: Record<string, unknown>) {
  return new Request('https://example.test/api/service/proposal', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function baseQuoteBody(overrides: Record<string, unknown> = {}) {
  return {
    quote: {
      woNumber: 'WO-26-8482',
      woId: 'WO-26-8482',
      customerName: 'Acme Hotel',
      customerEmail: 'gm@acme.test',
      customerAddress: '1 Acme Way, Kihei',
      island: 'Maui',
      projectDescription: 'Lobby pane replacement',
      total: 1500,
      getAmount: 70.68,
      getRate: 4.712,
      deposit: 750,
      lineItems: [],
      preparedBy: { name: 'Joey Ritthaler', email: 'joey@kulaglass.com', phone: '808-242-8999' },
    },
    sendEmail: true,
    emailTo: 'gm@acme.test',
    ...overrides,
  };
}

function setupSheetsAndDriveAndGmail(opts: {
  woFolderHits?: Array<{ id: string; name: string }>;
  quotesFolderHits?: Array<{ id: string }>;
} = {}) {
  // Sheets get for Service_Work_Orders read
  const sheetsValuesGet = jest.fn().mockResolvedValue({
    data: {
      values: [[
        'WO-26-8482', '26-8482', 'Acme Hotel — Lobby', 'Lobby pane replacement', 'lead',
        'Maui', 'Kihei', '1 Acme Way, Kihei', 'GM Acme', 'Joey Ritthaler',
        '808-555-0001', 'gm@acme.test', 'Acme Hotel',
      ]],
    },
  });
  mockGoogleSheets.mockReturnValue({
    spreadsheets: { values: { get: sheetsValuesGet } },
  });

  let createId = 0;
  const driveFilesList = jest.fn().mockImplementation((params: any) => {
    if (typeof params.q === 'string' && params.q.includes('WO-26-8482')) {
      return Promise.resolve({ data: { files: opts.woFolderHits || [] } });
    }
    if (typeof params.q === 'string' && params.q.includes("name = 'Quotes'")) {
      return Promise.resolve({ data: { files: opts.quotesFolderHits || [] } });
    }
    return Promise.resolve({ data: { files: [] } });
  });
  const driveFilesCreate = jest.fn().mockImplementation(() => {
    createId += 1;
    return Promise.resolve({ data: { id: `created-${createId}`, webViewLink: `https://drive.google.com/file/d/created-${createId}/view` } });
  });
  mockGoogleDrive.mockReturnValue({
    files: { list: driveFilesList, create: driveFilesCreate },
  });

  const gmailMessagesSend = jest.fn().mockResolvedValue({ data: { id: 'gmail-msg', threadId: 'gmail-thread' } });
  mockGoogleGmail.mockReturnValue({
    users: { messages: { send: gmailMessagesSend } },
  });

  return { sheetsValuesGet, driveFilesList, driveFilesCreate, gmailMessagesSend };
}

describe('service/proposal — staging fences', () => {
  let prevTargetEnv: string | undefined;
  let prevStagingId: string | undefined;
  let consoleSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockGetGoogleAuth.mockReturnValue({});
    mockGeneratePDF.mockResolvedValue(Buffer.from('%PDF-test'));
    prevTargetEnv = process.env.VERCEL_TARGET_ENV;
    prevStagingId = process.env.STAGING_DRIVE_FOLDER_ID;
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
    if (prevStagingId === undefined) delete process.env.STAGING_DRIVE_FOLDER_ID;
    else process.env.STAGING_DRIVE_FOLDER_ID = prevStagingId;
    consoleSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('production parents the proposal PDF under BANYAN_DRIVE_ID when no WO folder is found and sends email (regression)', async () => {
    delete process.env.VERCEL_TARGET_ENV;
    const m = setupSheetsAndDriveAndGmail({ woFolderHits: [] });

    const { POST } = await import('@/app/api/service/proposal/route');
    const res = await POST(makeRequest(baseQuoteBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.email_sent).toBe(true);
    expect(json.email_skipped).toBeUndefined();

    // The PDF create call (mimeType application/pdf) is parented at BANYAN_DRIVE_ID.
    const pdfCreate = m.driveFilesCreate.mock.calls.find(c => c[0].requestBody?.mimeType === 'application/pdf');
    expect(pdfCreate).toBeDefined();
    expect(pdfCreate![0].requestBody.parents).toEqual([BANYAN_DRIVE_ID]);

    expect(m.gmailMessagesSend).toHaveBeenCalledTimes(1);
  });

  it('staging never falls back to BANYAN_DRIVE_ID when WO folder is not found — defaults to STAGING_DRIVE_FOLDER_ID', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    process.env.STAGING_DRIVE_FOLDER_ID = STAGING_FOLDER_ID;
    const m = setupSheetsAndDriveAndGmail({ woFolderHits: [] });

    const { POST } = await import('@/app/api/service/proposal/route');
    const res = await POST(makeRequest(baseQuoteBody()));
    expect(res.status).toBe(200);

    const pdfCreate = m.driveFilesCreate.mock.calls.find(c => c[0].requestBody?.mimeType === 'application/pdf');
    expect(pdfCreate).toBeDefined();
    expect(pdfCreate![0].requestBody.parents).toEqual([STAGING_FOLDER_ID]);

    // No Drive create may target BANYAN_DRIVE_ID directly.
    for (const call of m.driveFilesCreate.mock.calls) {
      const parents: string[] = call[0].requestBody.parents || [];
      expect(parents).not.toContain(BANYAN_DRIVE_ID);
    }
  });

  it('staging skips the Gmail send and reports email_skipped:true', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    process.env.STAGING_DRIVE_FOLDER_ID = STAGING_FOLDER_ID;
    const m = setupSheetsAndDriveAndGmail();

    const { POST } = await import('@/app/api/service/proposal/route');
    const res = await POST(makeRequest(baseQuoteBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.email_sent).toBe(false);
    expect(json.email_skipped).toBe(true);
    expect(json.email_skip_reason).toBe('staging');

    expect(m.gmailMessagesSend).not.toHaveBeenCalled();
  });

  it('production with DISABLE_DISPATCH_EMAILS=true also skips email send', async () => {
    delete process.env.VERCEL_TARGET_ENV;
    const prevDisable = process.env.DISABLE_DISPATCH_EMAILS;
    process.env.DISABLE_DISPATCH_EMAILS = 'true';
    try {
      const m = setupSheetsAndDriveAndGmail();
      const { POST } = await import('@/app/api/service/proposal/route');
      const res = await POST(makeRequest(baseQuoteBody()));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.email_sent).toBe(false);
      expect(json.email_skipped).toBe(true);
      expect(json.email_skip_reason).toBe('disable_dispatch_emails');
      expect(m.gmailMessagesSend).not.toHaveBeenCalled();
    } finally {
      if (prevDisable === undefined) delete process.env.DISABLE_DISPATCH_EMAILS;
      else process.env.DISABLE_DISPATCH_EMAILS = prevDisable;
    }
  });

  it('staging with no STAGING_DRIVE_FOLDER_ID does not write to BANYAN_DRIVE_ID — drive_link is null and no Gmail send', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    delete process.env.STAGING_DRIVE_FOLDER_ID;
    const m = setupSheetsAndDriveAndGmail();

    const { POST } = await import('@/app/api/service/proposal/route');
    const res = await POST(makeRequest(baseQuoteBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.drive_link).toBeNull();
    // No production fallback writes occurred.
    expect(m.driveFilesCreate).not.toHaveBeenCalled();
    // Email is also skipped because staging.
    expect(m.gmailMessagesSend).not.toHaveBeenCalled();
  });
});

export {};
