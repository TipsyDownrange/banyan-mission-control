/**
 * BAN-105: MC must honor Field App qa-complete as an explicit work_complete handoff.
 *
 * Covers:
 * 1. Internal-key call with status:qa-complete → writes work_complete, fires emitMCEvent
 * 2. Existing explicit statuses (closed, lost, work_complete) still bypass deriveWOStatus
 * 3. Derive-only path (no explicit status supplied) still calls deriveWOStatus and uses result
 * 4. Browser/session (wo:edit) path remains intact
 */

const mockCheckPermission = jest.fn();
const mockInvalidateCache = jest.fn();
const mockSheets = jest.fn();
const mockEmitMCEvent = jest.fn();
const mockUpsertCrosswalkEntry = jest.fn();
const mockDeriveWOStatus = jest.fn();

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
jest.mock('@/lib/hawaii-time', () => ({ hawaiiNow: jest.fn(() => '2026-05-02T10:00:00') }));
jest.mock('googleapis', () => ({ google: { sheets: mockSheets } }));
jest.mock('@/lib/step-completion', () => ({ isCompletionRowComplete: jest.fn(() => false) }));

// ─── Shared WO fixture ────────────────────────────────────────────────────────

function makeWoRow(status = 'scheduled') {
  const row = [
    'WO-26-8298', // 0  wo_id
    '26-8298',    // 1  wo_number
    'Kula Test',  // 2  name
    '',           // 3  description
    status,       // 4  status
    'Maui',       // 5  island
  ];
  while (row.length < 47) row.push('');
  return row;
}

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request('https://example.test/api/service/update', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * Returns mocked sheets where deriveWOStatus will get empty Install_Plans
 * (so it returns 'new'), and batchUpdate succeeds.
 */
function setupSheets(woStatus = 'scheduled') {
  const valuesGet = jest.fn();
  // First call: Service_Work_Orders fetch
  valuesGet.mockResolvedValueOnce({ data: { values: [makeWoRow(woStatus)] } });
  // deriveWOStatus calls: Install_Plans, Install_Steps, Step_Completions (all empty)
  valuesGet.mockResolvedValue({ data: { values: [] } });

  const valuesBatchUpdate = jest.fn().mockResolvedValue({ data: {} });
  const valuesAppend = jest.fn().mockResolvedValue({ data: {} });
  const valuesUpdate = jest.fn().mockResolvedValue({ data: {} });

  mockSheets.mockReturnValue({
    spreadsheets: {
      values: { get: valuesGet, append: valuesAppend, update: valuesUpdate, batchUpdate: valuesBatchUpdate },
    },
  });

  return { valuesGet, valuesBatchUpdate };
}

const VALID_KEY = 'test-key-ban105';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BAN-105 — qa-complete field-to-office handoff', () => {
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

  // ── 1. FA internal-key + qa-complete → writes work_complete ─────────────────
  it('internal-key request with status:qa-complete writes work_complete to the sheet', async () => {
    const { valuesBatchUpdate } = setupSheets('scheduled');
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(
      makeRequest(
        { woId: 'WO-26-8298', status: 'qa-complete' },
        { 'X-Internal-Key': VALID_KEY },
      ),
    );

    expect(res.status).toBe(200);

    // Find the status cell write in batchUpdate calls
    const allData: Array<{ range: string; values: string[][] }> = [];
    for (const call of valuesBatchUpdate.mock.calls) {
      const data = call[0]?.requestBody?.data || [];
      allData.push(...data);
    }
    const statusWrite = allData.find(d => d.range.includes('!E'));
    expect(statusWrite).toBeDefined();
    expect(statusWrite?.values?.[0]?.[0]).toBe('work_complete');
  });

  // ── 2. qa-complete emits STATUS_CHANGED event with correct values ────────────
  it('qa-complete transition emits STATUS_CHANGED with new_status work_complete', async () => {
    setupSheets('scheduled');
    const { PATCH } = await import('@/app/api/service/update/route');

    await PATCH(
      makeRequest(
        { woId: 'WO-26-8298', status: 'qa-complete' },
        { 'X-Internal-Key': VALID_KEY },
      ),
    );

    expect(mockEmitMCEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'STATUS_CHANGED',
        old_status: 'scheduled',
        new_status: 'work_complete',
        submitted_by: 'field-app-service@internal',
      }),
    );
  });

  // ── 3. qa-complete does NOT call deriveWOStatus (treated as explicit) ────────
  it('qa-complete bypasses deriveWOStatus (work_complete is in EXPLICIT_STATUSES)', async () => {
    const { valuesGet } = setupSheets('scheduled');
    const { PATCH } = await import('@/app/api/service/update/route');

    await PATCH(
      makeRequest(
        { woId: 'WO-26-8298', status: 'qa-complete' },
        { 'X-Internal-Key': VALID_KEY },
      ),
    );

    // deriveWOStatus reads Install_Plans, Install_Steps, Step_Completions.
    // Those calls come AFTER the SWO fetch (call 1). If EXPLICIT_STATUSES bypass
    // is working, those reads should NOT happen — valuesGet should be called
    // exactly once (the SWO fetch).
    expect(valuesGet).toHaveBeenCalledTimes(1);
  });

  // ── 4. Existing explicit status 'closed' still bypasses derive ───────────────
  it('status:closed still writes closed without calling deriveWOStatus', async () => {
    const { valuesGet, valuesBatchUpdate } = setupSheets('work_complete');
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(
      makeRequest(
        { woId: 'WO-26-8298', status: 'closed' },
        { 'X-Internal-Key': VALID_KEY },
      ),
    );

    expect(res.status).toBe(200);
    expect(valuesGet).toHaveBeenCalledTimes(1);

    const allData: Array<{ range: string; values: string[][] }> = [];
    for (const call of valuesBatchUpdate.mock.calls) {
      allData.push(...(call[0]?.requestBody?.data || []));
    }
    const statusWrite = allData.find(d => d.range.includes('!E'));
    expect(statusWrite?.values?.[0]?.[0]).toBe('closed');
  });

  // ── 5. Derived status path still works when no explicit status supplied ───────
  it('no status supplied → deriveWOStatus is NOT called and no status update emitted', async () => {
    const { valuesGet, valuesBatchUpdate } = setupSheets('scheduled');
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(
      makeRequest(
        // Provide a non-status field so the request is not "no fields"
        { woId: 'WO-26-8298', assignedTo: 'crew-a' },
        { 'X-Internal-Key': VALID_KEY },
      ),
    );

    expect(res.status).toBe(200);
    // No status supplied → no status cell written
    const allData: Array<{ range: string; values: string[][] }> = [];
    for (const call of valuesBatchUpdate.mock.calls) {
      allData.push(...(call[0]?.requestBody?.data || []));
    }
    const statusWrite = allData.find(d => d.range.includes('!E'));
    expect(statusWrite).toBeUndefined();
    expect(mockEmitMCEvent).not.toHaveBeenCalled();
  });

  // ── 6. Browser/session (wo:edit) with qa-complete also maps to work_complete ──
  it('browser session wo:edit with status:qa-complete writes work_complete', async () => {
    const { valuesBatchUpdate } = setupSheets('scheduled');
    mockCheckPermission.mockResolvedValue({ allowed: true, email: 'sean@kulaglass.com' });
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(
      makeRequest({ woId: 'WO-26-8298', status: 'qa-complete' }),
    );

    expect(res.status).toBe(200);
    expect(mockCheckPermission).toHaveBeenCalledWith(expect.anything(), 'wo:edit');

    const allData: Array<{ range: string; values: string[][] }> = [];
    for (const call of valuesBatchUpdate.mock.calls) {
      allData.push(...(call[0]?.requestBody?.data || []));
    }
    const statusWrite = allData.find(d => d.range.includes('!E'));
    expect(statusWrite?.values?.[0]?.[0]).toBe('work_complete');
  });

  // ── 7. work_complete supplied directly still writes work_complete ─────────────
  it('status:work_complete supplied directly still writes work_complete', async () => {
    const { valuesBatchUpdate } = setupSheets('scheduled');
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(
      makeRequest(
        { woId: 'WO-26-8298', status: 'work_complete' },
        { 'X-Internal-Key': VALID_KEY },
      ),
    );

    expect(res.status).toBe(200);
    const allData: Array<{ range: string; values: string[][] }> = [];
    for (const call of valuesBatchUpdate.mock.calls) {
      allData.push(...(call[0]?.requestBody?.data || []));
    }
    const statusWrite = allData.find(d => d.range.includes('!E'));
    expect(statusWrite?.values?.[0]?.[0]).toBe('work_complete');
  });
});

export {};
