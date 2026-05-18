/**
 * Cost & Usage Live Tracking Phase 1 — POST /api/cost/ingest tests.
 *
 * Verifies:
 * - 503 when BANYAN_COST_INGEST_SECRET is not configured
 * - 401 when Authorization header missing or token mismatches
 * - 400 when payload is malformed
 * - 200 + storedAt when payload is valid
 * - Cache is populated and readable after a successful ingest
 */

export {};

const mockSheetsAppend = jest.fn();

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: jest.fn(() => 'test-backend-sheet'),
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({
      spreadsheets: {
        values: { append: mockSheetsAppend },
      },
    })),
  },
}));

const VALID_PAYLOAD = {
  sessionPct: 42,
  weeklyPct: 10,
  opusPct: 5,
  extraUsageDollars: { used: 1.25, limit: 25 },
  resetSessionAt: '2026-05-07T15:00:00.000Z',
  resetWeeklyAt: '2026-05-12T00:00:00.000Z',
  sourceApp: 'usage-for-claude-dashboard',
  capturedAt: '2026-05-07T12:00:30.000Z',
};

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://test.example/api/cost/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const ORIGINAL_SECRET = process.env.BANYAN_COST_INGEST_SECRET;

describe('POST /api/cost/ingest', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSheetsAppend.mockReset();
    mockSheetsAppend.mockResolvedValue({});
    delete process.env.BANYAN_COST_INGEST_SECRET;
  });

  afterAll(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.BANYAN_COST_INGEST_SECRET;
    } else {
      process.env.BANYAN_COST_INGEST_SECRET = ORIGINAL_SECRET;
    }
  });

  it('returns 503 when BANYAN_COST_INGEST_SECRET is not configured', async () => {
    const { POST } = await import('@/app/api/cost/ingest/route');
    const res = await POST(makeRequest(VALID_PAYLOAD, { authorization: 'Bearer anything' }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/BANYAN_COST_INGEST_SECRET/);
    expect(mockSheetsAppend).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is missing', async () => {
    process.env.BANYAN_COST_INGEST_SECRET = 'topsecret';
    const { POST } = await import('@/app/api/cost/ingest/route');
    const res = await POST(makeRequest(VALID_PAYLOAD));
    expect(res.status).toBe(401);
  });

  it('returns 401 when bearer token does not match the secret', async () => {
    process.env.BANYAN_COST_INGEST_SECRET = 'topsecret';
    const { POST } = await import('@/app/api/cost/ingest/route');
    const res = await POST(makeRequest(VALID_PAYLOAD, { authorization: 'Bearer wrong-token' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when JSON body is malformed', async () => {
    process.env.BANYAN_COST_INGEST_SECRET = 'topsecret';
    const { POST } = await import('@/app/api/cost/ingest/route');
    const res = await POST(makeRequest('not-json', { authorization: 'Bearer topsecret' }));
    expect(res.status).toBe(400);
  });

  it.each([
    ['sessionPct missing', { ...VALID_PAYLOAD, sessionPct: undefined }],
    ['sessionPct out of range', { ...VALID_PAYLOAD, sessionPct: 150 }],
    ['weeklyPct non-numeric', { ...VALID_PAYLOAD, weeklyPct: 'high' }],
    ['extraUsageDollars without used', { ...VALID_PAYLOAD, extraUsageDollars: { limit: 25 } }],
    ['resetSessionAt not ISO', { ...VALID_PAYLOAD, resetSessionAt: 'tomorrow' }],
    ['sourceApp empty', { ...VALID_PAYLOAD, sourceApp: '' }],
    ['capturedAt missing', { ...VALID_PAYLOAD, capturedAt: undefined }],
  ])('returns 400 when %s', async (_label, payload) => {
    process.env.BANYAN_COST_INGEST_SECRET = 'topsecret';
    const { POST } = await import('@/app/api/cost/ingest/route');
    const res = await POST(makeRequest(payload, { authorization: 'Bearer topsecret' }));
    expect(res.status).toBe(400);
  });

  it('accepts a valid payload, returns storedAt, and populates the cache', async () => {
    process.env.BANYAN_COST_INGEST_SECRET = 'topsecret';
    const routeModule = await import('@/app/api/cost/ingest/route');
    const snapshotModule = await import('@/lib/cost/liveClaudeSnapshot');
    snapshotModule.__resetLiveClaudeSnapshotCacheForTests();

    const res = await routeModule.POST(makeRequest(VALID_PAYLOAD, { authorization: 'Bearer topsecret' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.storedAt).toBe('string');
    expect(mockSheetsAppend).toHaveBeenCalledTimes(1);

    const cached = snapshotModule.readLatestLiveClaudeSnapshot();
    expect(cached).not.toBeNull();
    expect(cached?.snapshot).toMatchObject({
      sessionPct: 42,
      weeklyPct: 10,
      sourceApp: 'usage-for-claude-dashboard',
    });
  });

  it('accepts null optional fields (opusPct, extras, resets)', async () => {
    process.env.BANYAN_COST_INGEST_SECRET = 'topsecret';
    const { POST } = await import('@/app/api/cost/ingest/route');
    const res = await POST(makeRequest(
      {
        sessionPct: 12,
        weeklyPct: 4,
        opusPct: null,
        extraUsageDollars: null,
        resetSessionAt: null,
        resetWeeklyAt: null,
        sourceApp: 'usage-for-claude-dashboard',
        capturedAt: '2026-05-07T12:01:00.000Z',
      },
      { authorization: 'Bearer topsecret' },
    ));
    expect(res.status).toBe(200);
  });

  it('still returns 200 when sheet persistence fails (best-effort durability)', async () => {
    process.env.BANYAN_COST_INGEST_SECRET = 'topsecret';
    mockSheetsAppend.mockRejectedValueOnce(new Error('sheet down'));
    const routeModule = await import('@/app/api/cost/ingest/route');
    const snapshotModule = await import('@/lib/cost/liveClaudeSnapshot');
    snapshotModule.__resetLiveClaudeSnapshotCacheForTests();
    const res = await routeModule.POST(makeRequest(VALID_PAYLOAD, { authorization: 'Bearer topsecret' }));
    expect(res.status).toBe(200);
    expect(snapshotModule.readLatestLiveClaudeSnapshot()).not.toBeNull();
  });
});
