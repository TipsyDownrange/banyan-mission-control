// BAN-170: Dispatch Schedule crew-assignment Gmail send must route through
// emailSkipReason() (staging or DISABLE_DISPATCH_EMAILS=true), and the FA
// schedule URL embedded in the email body must be env-driven so staging
// cannot embed the production FA URL.
// Updated for merge: route uses getFieldAppBaseUrl() (reads FA_BASE_URL).

const mockCheckPermission = jest.fn();
const mockSheets = jest.fn();
const mockGmail = jest.fn();
const mockGetGoogleAuth = jest.fn(() => ({}));

jest.mock('@/lib/permissions', () => ({ checkPermission: mockCheckPermission }));
jest.mock('@/lib/gauth', () => ({ getGoogleAuth: mockGetGoogleAuth }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('googleapis', () => ({
  google: { sheets: mockSheets, gmail: mockGmail },
}));

const SLOT_ROW = [
  'SLOT-1', '2026-05-08', 'WO-26-0001', 'Acme Hotel', 'Maui', '2', '4',
  '', // assigned_crew - empty so newlyAdded includes both
  'pm', 'open', '', 'service', 'notes', '08:00', '12:00',
  '', '', '2026-05-08T00:00:00.000Z', '[]',
];

function setup() {
  const valuesGet = jest.fn().mockImplementation(({ range }: { range: string }) => {
    if (range.startsWith('Dispatch_Schedule!A2:S')) {
      return Promise.resolve({ data: { values: [SLOT_ROW] } });
    }
    if (range.startsWith('Users_Roles!')) {
      return Promise.resolve({ data: { values: [
        ['alice@kulaglass.com', 'Alice', 'crew', 'alice@kulaglass.com', '', 'Maui'],
        ['bob@kulaglass.com', 'Bob', 'crew', 'bob@kulaglass.com', '', 'Maui'],
      ] } });
    }
    return Promise.resolve({ data: { values: [] } });
  });
  const valuesUpdate = jest.fn().mockResolvedValue({ data: {} });
  mockSheets.mockReturnValue({
    spreadsheets: { values: { get: valuesGet, update: valuesUpdate } },
  });
  const messagesSend = jest.fn().mockResolvedValue({ data: { id: 'msg-1' } });
  mockGmail.mockReturnValue({ users: { messages: { send: messagesSend } } });
  return { valuesGet, valuesUpdate, messagesSend };
}

function patchReq(extra: Record<string, unknown> = {}) {
  return new Request('https://example.test/api/dispatch-schedule', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot_id: 'SLOT-1', assigned_crew: ['Alice', 'Bob'], status: 'filled', ...extra }),
  });
}

describe('dispatch-schedule PATCH — BAN-170 crew assignment email + FA URL', () => {
  let prevTargetEnv: string | undefined;
  let prevDisable: string | undefined;
  let prevFaBaseUrl: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockCheckPermission.mockResolvedValue({ allowed: true });
    prevTargetEnv = process.env.VERCEL_TARGET_ENV;
    prevDisable = process.env.DISABLE_DISPATCH_EMAILS;
    prevFaBaseUrl = process.env.FA_BASE_URL;
  });

  afterEach(() => {
    if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
    if (prevDisable === undefined) delete process.env.DISABLE_DISPATCH_EMAILS;
    else process.env.DISABLE_DISPATCH_EMAILS = prevDisable;
    if (prevFaBaseUrl === undefined) delete process.env.FA_BASE_URL;
    else process.env.FA_BASE_URL = prevFaBaseUrl;
  });

  it('skips Gmail send entirely when staging (VERCEL_TARGET_ENV=staging) — staging must set FA_BASE_URL', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    process.env.FA_BASE_URL = 'https://banyan-field-app-staging.example.com';
    delete process.env.DISABLE_DISPATCH_EMAILS;
    const m = setup();
    const { PATCH } = await import('@/app/api/dispatch-schedule/route');
    const res = await PATCH(patchReq());
    expect(res.status).toBe(200);
    expect(m.valuesUpdate).toHaveBeenCalledTimes(1);
    expect(m.messagesSend).not.toHaveBeenCalled();
  });

  it('skips Gmail send when DISABLE_DISPATCH_EMAILS=true', async () => {
    delete process.env.VERCEL_TARGET_ENV;
    process.env.DISABLE_DISPATCH_EMAILS = 'true';
    const m = setup();
    const { PATCH } = await import('@/app/api/dispatch-schedule/route');
    await PATCH(patchReq());
    expect(m.messagesSend).not.toHaveBeenCalled();
  });

  it('production with FA_BASE_URL set — sends crew email and embeds that base URL + /schedule', async () => {
    delete process.env.VERCEL_TARGET_ENV;
    delete process.env.DISABLE_DISPATCH_EMAILS;
    process.env.FA_BASE_URL = 'https://banyan-field-app.example.com';
    const m = setup();
    const { PATCH } = await import('@/app/api/dispatch-schedule/route');
    await PATCH(patchReq());
    expect(m.messagesSend).toHaveBeenCalledTimes(2); // Alice and Bob
    const firstCall = m.messagesSend.mock.calls[0][0];
    const raw = Buffer.from(firstCall.requestBody.raw, 'base64url').toString('utf8');
    expect(raw).toContain('https://banyan-field-app.example.com/schedule');
    // Hardcoded legacy FA URL must not appear when FA_BASE_URL overrides it.
    expect(raw).not.toContain('banyan-field-app-525p.vercel.app');
  });

  it('production without FA_BASE_URL — email sends with default FA URL fallback', async () => {
    delete process.env.VERCEL_TARGET_ENV;
    delete process.env.DISABLE_DISPATCH_EMAILS;
    delete process.env.FA_BASE_URL;
    const m = setup();
    const { PATCH } = await import('@/app/api/dispatch-schedule/route');
    await PATCH(patchReq());
    expect(m.messagesSend).toHaveBeenCalled();
    const firstCall = m.messagesSend.mock.calls[0][0];
    const raw = Buffer.from(firstCall.requestBody.raw, 'base64url').toString('utf8');
    // Default fallback URL is used; the FA schedule link is always included.
    expect(raw).toContain('View your schedule in the BanyanOS Field App');
  });
});

export {};
