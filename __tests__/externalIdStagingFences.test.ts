// BAN-170: External-ID staging fences — bids/create (Smartsheet bid log),
// cost/invoice (Anthropic invoices sheet), scheduling PATCH (manpower sheet).
// Each must fail closed in staging when its env override is missing or
// resolves to the production id, and remain unchanged in production.

const PROD_BID_LOG_ID = '6073963369156484';
const PROD_COST_INVOICE_SHEET_ID = '1EutKs3k0Cp3UwmpmAEDV8FaSSeIklb7Lk7wufRq5YdI';
const PROD_MANPOWER_SHEET_ID = '1099MZ_cGYqNbMKcvoKnwNp0uXnugQPY-jPOpmsJW_wQ';

const mockGetGoogleAuth = jest.fn(() => ({}));
const mockGetSSToken = jest.fn(() => 'ss-token-test');
const mockGoogleSheets = jest.fn();
const mockGetServerSession = jest.fn();

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: mockGetGoogleAuth,
  getSSToken: mockGetSSToken,
}));
jest.mock('googleapis', () => ({
  google: { sheets: mockGoogleSheets },
}));
jest.mock('next-auth', () => ({
  getServerSession: mockGetServerSession,
}));

function buildSheetsMock() {
  const valuesAppend = jest.fn().mockResolvedValue({ data: {} });
  const valuesUpdate = jest.fn().mockResolvedValue({ data: {} });
  const valuesGet = jest.fn().mockResolvedValue({ data: { values: [
    [], [], // first 2 rows ignored by manpower parser
    ['Job No', 'Job Name', 'PM', 'Notes', 'WE 05/08/26'],
    ['26-1234', 'Acme', 'Sean', '', '2'],
  ] } });
  mockGoogleSheets.mockReturnValue({
    spreadsheets: { values: { append: valuesAppend, update: valuesUpdate, get: valuesGet } },
  });
  return { valuesAppend, valuesUpdate, valuesGet };
}

const ENV_KEYS = [
  'VERCEL_TARGET_ENV',
  'SMARTSHEET_BID_LOG_ID',
  'COST_INVOICE_SHEET_ID',
  'MANPOWER_SCHEDULE_SHEET_ID',
];

describe('External-ID staging fences', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockGetGoogleAuth.mockReturnValue({});
    mockGetSSToken.mockReturnValue('ss-token-test');
    mockGetServerSession.mockResolvedValue({ user: { email: 'sean@kulaglass.com' } });
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    // Suppress fetch noise from any unintended Smartsheet hit (should not be reached on staging).
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ rows: [], columns: [] }), { status: 200 }));
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
    (global.fetch as jest.Mock).mockRestore?.();
  });

  // ── bids/create ────────────────────────────────────────────────────────────
  describe('bids/create POST', () => {
    function req() {
      return new Request('https://example.test/api/bids/create', {
        method: 'POST',
        body: JSON.stringify({ project_name: 'Hilo Lobby' }),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    it('staging without SMARTSHEET_BID_LOG_ID returns 502 and never calls Smartsheet', async () => {
      process.env.VERCEL_TARGET_ENV = 'staging';
      delete process.env.SMARTSHEET_BID_LOG_ID;
      const { POST } = await import('@/app/api/bids/create/route');
      const res = await POST(req());
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.staging).toBe(true);
      expect(json.error).toMatch(/SMARTSHEET_BID_LOG_ID/);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('staging with SMARTSHEET_BID_LOG_ID = production id returns 502', async () => {
      process.env.VERCEL_TARGET_ENV = 'staging';
      process.env.SMARTSHEET_BID_LOG_ID = PROD_BID_LOG_ID;
      const { POST } = await import('@/app/api/bids/create/route');
      const res = await POST(req());
      expect(res.status).toBe(502);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('staging with a non-prod SMARTSHEET_BID_LOG_ID routes Smartsheet calls to that id', async () => {
      process.env.VERCEL_TARGET_ENV = 'staging';
      process.env.SMARTSHEET_BID_LOG_ID = '999999999999';
      const { POST } = await import('@/app/api/bids/create/route');
      await POST(req());
      const calls = (global.fetch as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) {
        expect(String(c[0])).toContain('999999999999');
        expect(String(c[0])).not.toContain(PROD_BID_LOG_ID);
      }
    });

    it('production without env var falls back to canonical prod bid log id (unchanged behavior)', async () => {
      delete process.env.VERCEL_TARGET_ENV;
      delete process.env.SMARTSHEET_BID_LOG_ID;
      const { POST } = await import('@/app/api/bids/create/route');
      await POST(req());
      const calls = (global.fetch as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) {
        expect(String(c[0])).toContain(PROD_BID_LOG_ID);
      }
    });
  });

  // ── cost/invoice ───────────────────────────────────────────────────────────
  describe('cost/invoice POST', () => {
    function req() {
      return new Request('https://example.test/api/cost/invoice', {
        method: 'POST',
        body: JSON.stringify({ date: '2026-05-08', amount: 100, type: 'invoice' }),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    it('staging without COST_INVOICE_SHEET_ID returns 502 and never appends', async () => {
      process.env.VERCEL_TARGET_ENV = 'staging';
      delete process.env.COST_INVOICE_SHEET_ID;
      const m = buildSheetsMock();
      const { POST } = await import('@/app/api/cost/invoice/route');
      const res = await POST(req());
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.staging).toBe(true);
      expect(m.valuesAppend).not.toHaveBeenCalled();
    });

    it('staging with COST_INVOICE_SHEET_ID = production id returns 502', async () => {
      process.env.VERCEL_TARGET_ENV = 'staging';
      process.env.COST_INVOICE_SHEET_ID = PROD_COST_INVOICE_SHEET_ID;
      const m = buildSheetsMock();
      const { POST } = await import('@/app/api/cost/invoice/route');
      const res = await POST(req());
      expect(res.status).toBe(502);
      expect(m.valuesAppend).not.toHaveBeenCalled();
    });

    it('staging with non-prod COST_INVOICE_SHEET_ID appends to that id and never the prod id', async () => {
      process.env.VERCEL_TARGET_ENV = 'staging';
      process.env.COST_INVOICE_SHEET_ID = 'sheet-staging-cost-invoice';
      const m = buildSheetsMock();
      const { POST } = await import('@/app/api/cost/invoice/route');
      const res = await POST(req());
      expect(res.status).toBe(200);
      expect(m.valuesAppend).toHaveBeenCalledTimes(1);
      const arg = m.valuesAppend.mock.calls[0][0];
      expect(arg.spreadsheetId).toBe('sheet-staging-cost-invoice');
      expect(arg.spreadsheetId).not.toBe(PROD_COST_INVOICE_SHEET_ID);
    });

    it('production without env var falls back to canonical prod sheet id (unchanged behavior)', async () => {
      delete process.env.VERCEL_TARGET_ENV;
      delete process.env.COST_INVOICE_SHEET_ID;
      const m = buildSheetsMock();
      const { POST } = await import('@/app/api/cost/invoice/route');
      await POST(req());
      expect(m.valuesAppend).toHaveBeenCalledTimes(1);
      const arg = m.valuesAppend.mock.calls[0][0];
      expect(arg.spreadsheetId).toBe(PROD_COST_INVOICE_SHEET_ID);
    });

    it('still rejects non-@kulaglass.com sessions with 401 (regression — auth precedes fence)', async () => {
      process.env.VERCEL_TARGET_ENV = 'staging';
      process.env.COST_INVOICE_SHEET_ID = 'sheet-staging-cost-invoice';
      mockGetServerSession.mockResolvedValue({ user: { email: 'attacker@example.com' } });
      const m = buildSheetsMock();
      const { POST } = await import('@/app/api/cost/invoice/route');
      const res = await POST(req());
      expect(res.status).toBe(401);
      expect(m.valuesAppend).not.toHaveBeenCalled();
    });
  });

  // ── scheduling PATCH ───────────────────────────────────────────────────────
  describe('scheduling PATCH', () => {
    function req() {
      return new Request('https://example.test/api/scheduling', {
        method: 'PATCH',
        body: JSON.stringify({ job_number: '26-1234', date: '2026-05-08', men: 3 }),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    it('staging without MANPOWER_SCHEDULE_SHEET_ID returns 502 and never reads/writes', async () => {
      process.env.VERCEL_TARGET_ENV = 'staging';
      delete process.env.MANPOWER_SCHEDULE_SHEET_ID;
      const m = buildSheetsMock();
      const { PATCH } = await import('@/app/api/scheduling/route');
      const res = await PATCH(req());
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.staging).toBe(true);
      expect(m.valuesGet).not.toHaveBeenCalled();
      expect(m.valuesUpdate).not.toHaveBeenCalled();
    });

    it('staging with MANPOWER_SCHEDULE_SHEET_ID = production id returns 502', async () => {
      process.env.VERCEL_TARGET_ENV = 'staging';
      process.env.MANPOWER_SCHEDULE_SHEET_ID = PROD_MANPOWER_SHEET_ID;
      const m = buildSheetsMock();
      const { PATCH } = await import('@/app/api/scheduling/route');
      const res = await PATCH(req());
      expect(res.status).toBe(502);
      expect(m.valuesUpdate).not.toHaveBeenCalled();
    });

    it('staging with non-prod MANPOWER_SCHEDULE_SHEET_ID writes only to that id', async () => {
      process.env.VERCEL_TARGET_ENV = 'staging';
      process.env.MANPOWER_SCHEDULE_SHEET_ID = 'sheet-staging-manpower';
      const m = buildSheetsMock();
      const { PATCH } = await import('@/app/api/scheduling/route');
      const res = await PATCH(req());
      expect(res.status).toBe(200);
      expect(m.valuesUpdate).toHaveBeenCalledTimes(1);
      const arg = m.valuesUpdate.mock.calls[0][0];
      expect(arg.spreadsheetId).toBe('sheet-staging-manpower');
      expect(arg.spreadsheetId).not.toBe(PROD_MANPOWER_SHEET_ID);
    });

    it('production without env var falls back to canonical prod manpower id (unchanged)', async () => {
      delete process.env.VERCEL_TARGET_ENV;
      delete process.env.MANPOWER_SCHEDULE_SHEET_ID;
      const m = buildSheetsMock();
      const { PATCH } = await import('@/app/api/scheduling/route');
      await PATCH(req());
      expect(m.valuesUpdate).toHaveBeenCalledTimes(1);
      const arg = m.valuesUpdate.mock.calls[0][0];
      expect(arg.spreadsheetId).toBe(PROD_MANPOWER_SHEET_ID);
    });
  });
});

export {};
