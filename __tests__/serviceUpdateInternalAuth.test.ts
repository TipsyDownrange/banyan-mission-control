/**
 * BAN-40: service/update dual-auth tests.
 * Covers X-Internal-Key (FA server-to-server) and browser/session (wo:edit) paths.
 */

const mockCheckPermission = jest.fn();
const mockInvalidateCache = jest.fn();
const mockSheets = jest.fn();
const mockEmitMCEvent = jest.fn();
const mockUpsertCrosswalkEntry = jest.fn();

jest.mock('@/lib/permissions', () => ({ checkPermission: mockCheckPermission }));
jest.mock('@/app/api/service/route', () => ({ invalidateCache: mockInvalidateCache }));
jest.mock('@/lib/gauth', () => ({ getGoogleAuth: jest.fn(() => ({})) }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('@/lib/updateCustomerRecord', () => ({ fireAndForgetCustomerUpdate: jest.fn() }));
jest.mock('@/lib/normalize', () => ({
  normalizeAddressComponent: (v: string) => v,
  normalizePhone: (v: string) => v,
  normalizeEmail: (v: string) => v,
  normalizeName: (v: string) => v,
  normalizeContactList: (v: string) => v,
  resolveWorkOrderIsland: (v: string) => v,
}));
jest.mock('@/lib/events', () => ({ emitMCEvent: mockEmitMCEvent }));
jest.mock('@/lib/entityCrosswalk', () => ({ upsertCrosswalkEntry: mockUpsertCrosswalkEntry }));
jest.mock('@/lib/hawaii-time', () => ({ hawaiiNow: jest.fn(() => '2026-05-01T10:00:00') }));
jest.mock('googleapis', () => ({ google: { sheets: mockSheets } }));

// ─── Shared WO fixture ────────────────────────────────────────────────────────

const WO_ROW = [
  'WO-26-9999', // 0  wo_id
  '26-9999',    // 1  wo_number
  'Auth Test',  // 2  name
  '',           // 3  description
  'new',        // 4  status
  'Oahu',       // 5  island
];
while (WO_ROW.length < 47) WO_ROW.push('');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request('https://example.test/api/service/update', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function setupSheets() {
  const valuesGet = jest.fn();
  // Service_Work_Orders fetch
  valuesGet.mockResolvedValueOnce({ data: { values: [WO_ROW] } });
  // deriveWOStatus: Install_Plans, Install_Steps, Step_Completions
  valuesGet.mockResolvedValue({ data: { values: [] } });

  const valuesBatchUpdate = jest.fn().mockResolvedValue({ data: {} });
  const valuesAppend = jest.fn().mockResolvedValue({ data: {} });
  const valuesUpdate = jest.fn().mockResolvedValue({ data: {} });

  mockSheets.mockReturnValue({
    spreadsheets: {
      values: { get: valuesGet, append: valuesAppend, update: valuesUpdate, batchUpdate: valuesBatchUpdate },
    },
  });

  return { valuesGet, valuesBatchUpdate, valuesAppend, valuesUpdate };
}

const VALID_KEY = 'test-internal-key-abc123';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('service/update — BAN-40 internal auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockEmitMCEvent.mockResolvedValue(undefined);
    process.env.INTERNAL_API_KEY = VALID_KEY;
    delete process.env.FIELD_BACKEND_SHEET_ID;
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_KEY;
  });

  // ── 1. Valid key bypasses checkPermission and reaches update logic ─────────
  it('valid X-Internal-Key bypasses checkPermission and reaches update logic', async () => {
    setupSheets();
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(
      makeRequest(
        { woId: 'WO-26-9999', status: 'in_progress' },
        { 'X-Internal-Key': VALID_KEY },
      ),
    );

    expect(res.status).toBe(200);
    expect(mockCheckPermission).not.toHaveBeenCalled();
  });

  // ── 2. Valid key uses field-app-service@internal as actor ─────────────────
  it('valid X-Internal-Key sets field-app-service@internal as submitted_by in event', async () => {
    setupSheets();
    const { PATCH } = await import('@/app/api/service/update/route');

    // Use 'closed' (EXPLICIT_STATUS) so deriveWOStatus cannot override it and a
    // status transition from 'new' → 'closed' fires emitMCEvent.
    const res = await PATCH(
      makeRequest(
        { woId: 'WO-26-9999', status: 'closed' },
        { 'X-Internal-Key': VALID_KEY },
      ),
    );

    expect(res.status).toBe(200);
    expect(mockEmitMCEvent).toHaveBeenCalledWith(
      expect.objectContaining({ submitted_by: 'field-app-service@internal' }),
    );
  });

  // ── 3. Wrong key returns 401 ───────────────────────────────────────────────
  it('wrong X-Internal-Key returns 401', async () => {
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(
      makeRequest(
        { woId: 'WO-26-9999', status: 'in_progress' },
        { 'X-Internal-Key': 'wrong-key' },
      ),
    );

    expect(res.status).toBe(401);
    expect(mockCheckPermission).not.toHaveBeenCalled();
  });

  // ── 4. Empty key string returns 401 ───────────────────────────────────────
  it('empty X-Internal-Key returns 401', async () => {
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(
      makeRequest(
        { woId: 'WO-26-9999', status: 'in_progress' },
        { 'X-Internal-Key': '' },
      ),
    );

    // Empty string is present header — treated as invalid key
    expect(res.status).toBe(401);
    expect(mockCheckPermission).not.toHaveBeenCalled();
  });

  // ── 5. No key falls through to checkPermission with valid session ──────────
  it('missing key uses checkPermission with valid session', async () => {
    setupSheets();
    mockCheckPermission.mockResolvedValue({ allowed: true, email: 'sean@kulaglass.com' });
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(
      makeRequest({ woId: 'WO-26-9999', status: 'in_progress' }),
    );

    expect(res.status).toBe(200);
    expect(mockCheckPermission).toHaveBeenCalledWith(expect.anything(), 'wo:edit');
  });

  // ── 6. No key with denied permission returns 403 ──────────────────────────
  it('missing key with denied permission returns 403', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false, email: null });
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(
      makeRequest({ woId: 'WO-26-9999', status: 'in_progress' }),
    );

    expect(res.status).toBe(403);
  });

  // ── 7. Valid key with INTERNAL_API_KEY unset returns 401 ──────────────────
  it('valid-looking key returns 401 when INTERNAL_API_KEY is not set', async () => {
    delete process.env.INTERNAL_API_KEY;
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(
      makeRequest(
        { woId: 'WO-26-9999', status: 'in_progress' },
        { 'X-Internal-Key': VALID_KEY },
      ),
    );

    expect(res.status).toBe(401);
    expect(mockCheckPermission).not.toHaveBeenCalled();
  });
});

export {};
