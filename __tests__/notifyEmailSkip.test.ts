const mockGetGoogleAuth = jest.fn();
const mockGoogleSheets = jest.fn();
const mockGoogleGmail = jest.fn();
const mockGoogleAuthJWT = jest.fn();

jest.mock('@/lib/gauth', () => ({ getGoogleAuth: mockGetGoogleAuth }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('googleapis', () => ({
  google: {
    sheets: mockGoogleSheets,
    gmail: mockGoogleGmail,
    auth: { JWT: mockGoogleAuthJWT },
  },
}));

function buildSheetsAndGmail() {
  const sheetsValuesGet = jest.fn().mockResolvedValue({
    data: { values: [
      ['WO-26-8482', '26-8482', 'Acme Hotel', 'Lobby pane', 'lead', 'Maui', 'Kihei', '', '', 'Joey Ritthaler'],
    ] },
  });
  // Users_Roles second call:
  sheetsValuesGet
    .mockResolvedValueOnce({
      data: { values: [
        ['WO-26-8482', '26-8482', 'Acme Hotel', 'Lobby pane', 'lead', 'Maui', 'Kihei', '', '', 'Joey Ritthaler'],
      ] },
    })
    .mockResolvedValue({
      data: { values: [
        ['joey@kulaglass.com', 'Joey Ritthaler', 'PM', 'joey@kulaglass.com', '', 'Maui'],
      ] },
    });
  mockGoogleSheets.mockReturnValue({
    spreadsheets: { values: { get: sheetsValuesGet } },
  });
  const gmailMessagesSend = jest.fn().mockResolvedValue({ data: { id: 'gmail-msg', threadId: 'gmail-thread' } });
  const gmailMessagesGet = jest.fn().mockResolvedValue({ data: { raw: Buffer.from('From: a@b\r\nSubject: x\r\n\r\nbody').toString('base64url') } });
  mockGoogleGmail.mockReturnValue({
    users: { messages: { send: gmailMessagesSend, get: gmailMessagesGet } },
  });
  return { sheetsValuesGet, gmailMessagesSend, gmailMessagesGet };
}

function fieldIssueRequest() {
  return new Request('https://example.test/api/notify/field-issue', {
    method: 'POST',
    body: JSON.stringify({
      event_id: 'evt-1', kID: 'WO-26-8482', project_name: 'Acme Lobby',
      severity: 'CRITICAL', blocking: true,
      description: 'Crack on top pane', category: 'damage', responsible_party: 'site',
      reported_by: 'crew', location: 'lobby', photo_count: 2,
      timestamp: '2026-05-07T18:00:00Z',
    }),
    headers: { 'Content-Type': 'application/json' },
  });
}

function crewImpactRequest() {
  return new Request('https://example.test/api/notify/crew-impact', {
    method: 'POST',
    body: JSON.stringify({
      event_id: 'evt-2', issue_event_id: 'evt-1', kID: 'WO-26-8482',
      project_name: 'Acme Lobby', impact_type: 'DEMOBILIZED',
      crew_count: 3, hours_on_site: 4, description: 'Pulled off job',
      directed_by: 'super', going_to: 'home',
      gc_signer_name: '', gc_signer_title: '',
      timestamp: '2026-05-07T18:30:00Z',
    }),
    headers: { 'Content-Type': 'application/json' },
  });
}

function delegateRequest() {
  return new Request('https://example.test/api/inbox/delegate', {
    method: 'POST',
    body: JSON.stringify({
      messageId: 'gmail-msg-id',
      delegateTo: 'Joey',
      delegateEmail: 'joey@kulaglass.com',
      subject: 'Bid request',
      snippet: 'Please bid this',
    }),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Mission Control email senders — staging skip', () => {
  let prevTargetEnv: string | undefined;
  let prevDisable: string | undefined;
  let prevSaKey: string | undefined;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockGetGoogleAuth.mockReturnValue({});
    mockGoogleAuthJWT.mockImplementation(() => ({}));
    prevTargetEnv = process.env.VERCEL_TARGET_ENV;
    prevDisable = process.env.DISABLE_DISPATCH_EMAILS;
    prevSaKey = process.env.GOOGLE_SA_KEY_B64;
    process.env.GOOGLE_SA_KEY_B64 = Buffer.from(JSON.stringify({ client_email: 'sa@x', private_key: 'pk' })).toString('base64');
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
    if (prevDisable === undefined) delete process.env.DISABLE_DISPATCH_EMAILS;
    else process.env.DISABLE_DISPATCH_EMAILS = prevDisable;
    if (prevSaKey === undefined) delete process.env.GOOGLE_SA_KEY_B64;
    else process.env.GOOGLE_SA_KEY_B64 = prevSaKey;
    consoleLogSpy.mockRestore();
    consoleErrSpy.mockRestore();
  });

  describe('VERCEL_TARGET_ENV=staging', () => {
    beforeEach(() => { process.env.VERCEL_TARGET_ENV = 'staging'; });

    it('notify/field-issue skips Gmail send and returns ok+skipped', async () => {
      const m = buildSheetsAndGmail();
      const { POST } = await import('@/app/api/notify/field-issue/route');
      const res = await POST(fieldIssueRequest());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.skipped).toBe(true);
      expect(json.skip_reason).toBe('staging');
      expect(m.gmailMessagesSend).not.toHaveBeenCalled();
    });

    it('notify/crew-impact skips Gmail send and returns ok+skipped', async () => {
      const m = buildSheetsAndGmail();
      const { POST } = await import('@/app/api/notify/crew-impact/route');
      const res = await POST(crewImpactRequest());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.skipped).toBe(true);
      expect(json.skip_reason).toBe('staging');
      expect(m.gmailMessagesSend).not.toHaveBeenCalled();
    });

    it('inbox/delegate skips Gmail send and returns ok+skipped', async () => {
      const m = buildSheetsAndGmail();
      const { POST } = await import('@/app/api/inbox/delegate/route');
      const res = await POST(delegateRequest());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.skipped).toBe(true);
      expect(json.skip_reason).toBe('staging');
      expect(m.gmailMessagesSend).not.toHaveBeenCalled();
      expect(m.gmailMessagesGet).not.toHaveBeenCalled();
    });
  });

  describe('production with DISABLE_DISPATCH_EMAILS=true', () => {
    beforeEach(() => {
      delete process.env.VERCEL_TARGET_ENV;
      process.env.DISABLE_DISPATCH_EMAILS = 'true';
    });

    it('notify/field-issue skips when kill switch is on', async () => {
      const m = buildSheetsAndGmail();
      const { POST } = await import('@/app/api/notify/field-issue/route');
      const res = await POST(fieldIssueRequest());
      const json = await res.json();
      expect(json.skipped).toBe(true);
      expect(json.skip_reason).toBe('disable_dispatch_emails');
      expect(m.gmailMessagesSend).not.toHaveBeenCalled();
    });

    it('notify/crew-impact skips when kill switch is on', async () => {
      const m = buildSheetsAndGmail();
      const { POST } = await import('@/app/api/notify/crew-impact/route');
      const res = await POST(crewImpactRequest());
      const json = await res.json();
      expect(json.skipped).toBe(true);
      expect(m.gmailMessagesSend).not.toHaveBeenCalled();
    });

    it('inbox/delegate skips when kill switch is on', async () => {
      const m = buildSheetsAndGmail();
      const { POST } = await import('@/app/api/inbox/delegate/route');
      const res = await POST(delegateRequest());
      const json = await res.json();
      expect(json.skipped).toBe(true);
      expect(m.gmailMessagesSend).not.toHaveBeenCalled();
    });
  });

  describe('production without kill switch — emails still attempt to send', () => {
    beforeEach(() => {
      delete process.env.VERCEL_TARGET_ENV;
      delete process.env.DISABLE_DISPATCH_EMAILS;
    });

    it('notify/field-issue calls gmail.send in production', async () => {
      const m = buildSheetsAndGmail();
      const { POST } = await import('@/app/api/notify/field-issue/route');
      const res = await POST(fieldIssueRequest());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.skipped).toBeUndefined();
      expect(m.gmailMessagesSend).toHaveBeenCalledTimes(1);
    });

    it('notify/crew-impact calls gmail.send in production', async () => {
      const m = buildSheetsAndGmail();
      const { POST } = await import('@/app/api/notify/crew-impact/route');
      const res = await POST(crewImpactRequest());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.skipped).toBeUndefined();
      expect(m.gmailMessagesSend).toHaveBeenCalledTimes(1);
    });

    it('inbox/delegate calls gmail.send in production', async () => {
      const m = buildSheetsAndGmail();
      const { POST } = await import('@/app/api/inbox/delegate/route');
      const res = await POST(delegateRequest());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.skipped).toBeUndefined();
      expect(m.gmailMessagesSend).toHaveBeenCalledTimes(1);
    });
  });
});

export {};
