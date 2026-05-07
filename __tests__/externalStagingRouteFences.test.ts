const mockGetSSToken = jest.fn(() => 'smartsheet-token');
const mockGetServerSession = jest.fn();
const mockGetGoogleAuth = jest.fn(() => ({}));
const mockGoogleSheets = jest.fn();

jest.mock('@/lib/gauth', () => ({
  getSSToken: mockGetSSToken,
  getGoogleAuth: mockGetGoogleAuth,
}));

jest.mock('next-auth', () => ({
  getServerSession: mockGetServerSession,
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: mockGoogleSheets,
  },
}));

describe('BAN-170 external staging route fail-closed fences', () => {
  let prevTargetEnv: string | undefined;
  let prevSmartsheetBidLogId: string | undefined;
  let prevCostInvoiceSheetId: string | undefined;
  let prevManpowerScheduleSheetId: string | undefined;
  let fetchMock: jest.Mock;
  let valuesAppend: jest.Mock;
  let valuesGet: jest.Mock;
  let valuesUpdate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    prevTargetEnv = process.env.VERCEL_TARGET_ENV;
    prevSmartsheetBidLogId = process.env.STAGING_SMARTSHEET_BID_LOG_ID;
    prevCostInvoiceSheetId = process.env.STAGING_COST_INVOICE_SHEET_ID;
    prevManpowerScheduleSheetId = process.env.STAGING_MANPOWER_SCHEDULE_SHEET_ID;

    process.env.VERCEL_TARGET_ENV = 'staging';
    delete process.env.STAGING_SMARTSHEET_BID_LOG_ID;
    delete process.env.STAGING_COST_INVOICE_SHEET_ID;
    delete process.env.STAGING_MANPOWER_SCHEDULE_SHEET_ID;

    fetchMock = jest.fn(() => {
      throw new Error('External Smartsheet call should not run in staging without target config');
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    valuesAppend = jest.fn(() => {
      throw new Error('Google Sheets append should not run in staging without target config');
    });
    valuesGet = jest.fn(() => {
      throw new Error('Google Sheets get should not run in staging without target config');
    });
    valuesUpdate = jest.fn(() => {
      throw new Error('Google Sheets update should not run in staging without target config');
    });
    mockGoogleSheets.mockReturnValue({
      spreadsheets: {
        values: {
          append: valuesAppend,
          get: valuesGet,
          update: valuesUpdate,
        },
      },
    });
    mockGetServerSession.mockResolvedValue({ user: { email: 'pm@kulaglass.com' } });
  });

  afterEach(() => {
    if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
    if (prevSmartsheetBidLogId === undefined) delete process.env.STAGING_SMARTSHEET_BID_LOG_ID;
    else process.env.STAGING_SMARTSHEET_BID_LOG_ID = prevSmartsheetBidLogId;
    if (prevCostInvoiceSheetId === undefined) delete process.env.STAGING_COST_INVOICE_SHEET_ID;
    else process.env.STAGING_COST_INVOICE_SHEET_ID = prevCostInvoiceSheetId;
    if (prevManpowerScheduleSheetId === undefined) delete process.env.STAGING_MANPOWER_SCHEDULE_SHEET_ID;
    else process.env.STAGING_MANPOWER_SCHEDULE_SHEET_ID = prevManpowerScheduleSheetId;
  });

  it('bids/create fails closed before any Smartsheet read or write when STAGING_SMARTSHEET_BID_LOG_ID is missing', async () => {
    const { POST } = await import('@/app/api/bids/create/route');

    const res = await POST(new Request('https://example.test/api/bids/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_name: 'Staging Bid' }),
    }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/STAGING_SMARTSHEET_BID_LOG_ID/);
    expect(json.error).toMatch(/staging/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockGetSSToken).not.toHaveBeenCalled();
  });

  it('cost/invoice fails closed before any Google Sheets append when STAGING_COST_INVOICE_SHEET_ID is missing', async () => {
    const { POST } = await import('@/app/api/cost/invoice/route');

    const res = await POST(new Request('https://example.test/api/cost/invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-05-07', amount: 100, type: 'invoice' }),
    }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/STAGING_COST_INVOICE_SHEET_ID/);
    expect(json.error).toMatch(/staging/i);
    expect(valuesAppend).not.toHaveBeenCalled();
    expect(mockGetGoogleAuth).not.toHaveBeenCalled();
    expect(mockGoogleSheets).not.toHaveBeenCalled();
  });

  it('scheduling PATCH fails closed before any Google Sheets read or write when STAGING_MANPOWER_SCHEDULE_SHEET_ID is missing', async () => {
    const { PATCH } = await import('@/app/api/scheduling/route');

    const res = await PATCH(new Request('https://example.test/api/scheduling', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_number: 'WO', date: '2026-05-08', men: 2 }),
    }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/STAGING_MANPOWER_SCHEDULE_SHEET_ID/);
    expect(json.error).toMatch(/staging/i);
    expect(valuesGet).not.toHaveBeenCalled();
    expect(valuesUpdate).not.toHaveBeenCalled();
    expect(mockGetGoogleAuth).not.toHaveBeenCalled();
    expect(mockGoogleSheets).not.toHaveBeenCalled();
  });
});

