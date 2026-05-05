/**
 * BAN-42 Gate 2: service/update dispatch sync tests.
 * Verifies the 19-column A:S writer in the PATCH route.
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
jest.mock('@/lib/hawaii-time', () => ({
  hawaiiNow: jest.fn(() => '2026-05-01T10:00:00'),
}));

jest.mock('googleapis', () => ({ google: { sheets: mockSheets } }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WO_ROW = [
  'WO-26-0001',   // 0  wo_id
  '26-0001',      // 1  wo_number
  'Test Repair',  // 2  name
  'Fix window',   // 3  description
  'scheduled',    // 4  status
  'Maui',         // 5  island
  '',             // 6  area_of_island
  '',             // 7  address
  '',             // 8  contact_person
  '',             // 9  contact_title
  '',             // 10 contact_phone
  '',             // 11 contact_email
  'ACME Corp',    // 12 customer_name
  'glass',        // 13 system_type
  'Alice, Bob',   // 14 assigned_to
  '',             // 15 date_received
  '',             // 16 due_date
  '2026-05-10',   // 17 scheduled_date
];
// Pad to 47 columns to satisfy COL_IDX accesses
while (WO_ROW.length < 47) WO_ROW.push('');

function makeRequest(body: Record<string, unknown>) {
  return new Request('https://example.test/api/service/update', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    woId: 'WO-26-0001',
    status: 'scheduled',
    scheduledDate: '2026-05-10',
    assignedTo: 'Alice, Bob',
    ...overrides,
  };
}

type SheetsClient = {
  valuesGet: jest.Mock;
  valuesUpdate: jest.Mock;
  valuesBatchUpdate: jest.Mock;
  valuesAppend: jest.Mock;
};

function setupSheets(options: {
  noFieldSheet?: boolean;
  existingDispatchRows?: string[][];
  appendFails?: boolean;
  updateFails?: boolean;
  fieldGetFails?: boolean;
} = {}): SheetsClient {
  const {
    noFieldSheet = false,
    existingDispatchRows = [],
    appendFails = false,
    updateFails = false,
    fieldGetFails = false,
  } = options;

  if (noFieldSheet) {
    delete process.env.FIELD_BACKEND_SHEET_ID;
  } else {
    process.env.FIELD_BACKEND_SHEET_ID = 'field-sheet-test';
  }

  const valuesGet = jest.fn();

  // First call: fetch the WO row from Service_Work_Orders
  valuesGet.mockResolvedValueOnce({ data: { values: [WO_ROW] } });

  // deriveWOStatus calls (Install_Plans, Install_Steps, Step_Completions) — return empty
  valuesGet.mockResolvedValueOnce({ data: { values: [] } }); // Install_Plans
  valuesGet.mockResolvedValueOnce({ data: { values: [] } }); // Install_Steps
  valuesGet.mockResolvedValueOnce({ data: { values: [] } }); // Step_Completions

  // Dispatch_Schedule read
  if (fieldGetFails) {
    valuesGet.mockRejectedValueOnce(new Error('Sheets unavailable'));
  } else {
    valuesGet.mockResolvedValueOnce({
      data: { values: existingDispatchRows.length > 0 ? existingDispatchRows : [] },
    });
  }

  const valuesAppend = appendFails
    ? jest.fn().mockRejectedValue(new Error('Append failed'))
    : jest.fn().mockResolvedValue({ data: {} });

  const valuesUpdate = updateFails
    ? jest.fn().mockRejectedValue(new Error('Update failed'))
    : jest.fn().mockResolvedValue({ data: {} });

  const valuesBatchUpdate = jest.fn().mockResolvedValue({ data: {} });

  mockSheets.mockReturnValue({
    spreadsheets: {
      values: {
        get: valuesGet,
        append: valuesAppend,
        update: valuesUpdate,
        batchUpdate: valuesBatchUpdate,
      },
    },
  });

  return { valuesGet, valuesUpdate, valuesBatchUpdate, valuesAppend };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('service/update — Dispatch_Schedule A:S sync (BAN-42 Gate 2)', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockCheckPermission.mockResolvedValue({ allowed: true, email: 'sean@kulaglass.com' });
    mockEmitMCEvent.mockResolvedValue(undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.FIELD_BACKEND_SHEET_ID;
  });

  // ── 1. Creates a full 19-column row ────────────────────────────────────────
  it('creates a full 19-column Dispatch_Schedule row on append', async () => {
    const { valuesAppend } = setupSheets();
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(makeRequest(baseBody()));
    expect(res.status).toBe(200);

    expect(valuesAppend).toHaveBeenCalledTimes(1);
    const appendCall = valuesAppend.mock.calls[0][0];
    const row: string[] = appendCall.requestBody.values[0];
    expect(row).toHaveLength(19);
  });

  // ── 2. Writes A:S not A:J ──────────────────────────────────────────────────
  it('appends to Dispatch_Schedule!A:S, not A:J', async () => {
    const { valuesAppend } = setupSheets();
    const { PATCH } = await import('@/app/api/service/update/route');

    await PATCH(makeRequest(baseBody()));

    expect(valuesAppend).toHaveBeenCalledWith(expect.objectContaining({
      range: 'Dispatch_Schedule!A:S',
    }));
  });

  // ── 3. Reads existing rows from A2:S5000 ───────────────────────────────────
  it('reads existing Dispatch_Schedule rows from A2:S5000', async () => {
    const { valuesGet } = setupSheets();
    const { PATCH } = await import('@/app/api/service/update/route');

    await PATCH(makeRequest(baseBody()));

    const dispatchRead = valuesGet.mock.calls.find(
      (c: unknown[]) =>
        typeof (c[0] as { range?: string }).range === 'string' &&
        (c[0] as { range: string }).range.includes('Dispatch_Schedule!A2:S5000')
    );
    expect(dispatchRead).toBeDefined();
  });

  it('does not backfeed WO snapshot identity into Customers on update', async () => {
    setupSheets();
    const { fireAndForgetCustomerUpdate } = jest.requireMock('@/lib/updateCustomerRecord') as {
      fireAndForgetCustomerUpdate: jest.Mock;
    };
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(makeRequest(baseBody({
      customer_name: 'ACME Corp',
      contact_phone: '(808) 555-0199',
      address: 'WO Jobsite Address',
    })));

    expect(res.status).toBe(200);
    expect(fireAndForgetCustomerUpdate).not.toHaveBeenCalled();
  });

  // ── 4. Updates an existing A:S row without truncating Field App columns ────
  it('updates an existing row as a full A:S row preserving Field App columns', async () => {
    const existingRow = [
      'SVC-26-0001-2026-05-10', // 0  slot_id
      '2026-05-10',              // 1  date
      'SVC-26-0001',             // 2  kID
      'Test Repair',             // 3  project_name
      'Maui',                    // 4  island
      '2',                       // 5  men_required
      '4',                       // 6  hours_estimated
      'Old Crew',                // 7  assigned_crew
      'service/update',          // 8  created_by
      'filled',                  // 9  status
      'Alice:confirmed',         // 10 confirmations  ← Field App owned
      'service',                 // 11 work_type      ← Field App owned
      'Be careful',              // 12 notes          ← Field App owned
      '08:00',                   // 13 start_time     ← Field App owned
      '12:00',                   // 14 end_time       ← Field App owned
      'STEP-1, STEP-2',          // 15 step_ids       ← Field App owned
      '3.5',                     // 16 hours_actual   ← Field App owned
      '2026-05-01T08:00:00.000Z',// 17 last_modified
      '["IS-1"]',                // 18 focus_step_ids ← Field App owned
    ];

    const { valuesUpdate } = setupSheets({ existingDispatchRows: [existingRow] });
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(makeRequest(baseBody({ assignedTo: 'Alice, Bob' })));
    expect(res.status).toBe(200);

    expect(valuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        range: expect.stringMatching(/^Dispatch_Schedule!A\d+:S\d+$/),
      })
    );

    const updateCall = valuesUpdate.mock.calls.find(
      (c: unknown[]) =>
        typeof (c[0] as { range?: string }).range === 'string' &&
        (c[0] as { range: string }).range.startsWith('Dispatch_Schedule!A')
    );
    const updatedRow: string[] = updateCall[0].requestBody.values[0];

    expect(updatedRow).toHaveLength(19);
    // Field App columns preserved
    expect(updatedRow[10]).toBe('Alice:confirmed'); // confirmations
    expect(updatedRow[11]).toBe('service');          // work_type
    expect(updatedRow[12]).toBe('Be careful');       // notes
    expect(updatedRow[13]).toBe('08:00');            // start_time
    expect(updatedRow[14]).toBe('12:00');            // end_time
    expect(updatedRow[15]).toBe('STEP-1, STEP-2');  // step_ids
    expect(updatedRow[16]).toBe('3.5');              // hours_actual
    expect(updatedRow[18]).toBe('["IS-1"]');         // focus_step_ids
    // This route's field updated
    expect(updatedRow[7]).toBe('Alice, Bob');        // assigned_crew
  });

  // ── 4b. Preserves existing men_required when body.men is absent ───────────
  it('preserves existing men_required (col F / index 5) when body.men is absent on update', async () => {
    const existingRow = [
      'SVC-26-0001-2026-05-10', // 0  slot_id
      '2026-05-10',              // 1  date
      'SVC-26-0001',             // 2  kID
      'Test Repair',             // 3  project_name
      'Maui',                    // 4  island
      '3',                       // 5  men_required ← must NOT be overwritten to '1'
      '4',                       // 6  hours_estimated
      'Old Crew',                // 7  assigned_crew
      'service/update',          // 8  created_by
      'filled',                  // 9  status
      '', '', '', '', '', '', '', '', '', // 10-18
    ];

    const { valuesUpdate } = setupSheets({ existingDispatchRows: [existingRow] });
    const { PATCH } = await import('@/app/api/service/update/route');

    // Caller updates assignedTo + scheduledDate but does NOT send body.men
    const res = await PATCH(makeRequest(baseBody({ assignedTo: 'Alice, Bob' })));
    expect(res.status).toBe(200);

    const updateCall = valuesUpdate.mock.calls.find(
      (c: unknown[]) =>
        typeof (c[0] as { range?: string }).range === 'string' &&
        (c[0] as { range: string }).range.startsWith('Dispatch_Schedule!A'),
    );
    const updatedRow: string[] = updateCall[0].requestBody.values[0];

    // Existing '3' must be preserved, not clobbered to '1'
    expect(updatedRow[5]).toBe('3');
  });

  // ── 5. Stamps column R / last_modified on every write ─────────────────────
  it('stamps last_modified (col R / index 17) on create', async () => {
    const { valuesAppend } = setupSheets();
    const { PATCH } = await import('@/app/api/service/update/route');

    const before = new Date().toISOString();
    await PATCH(makeRequest(baseBody()));
    const after = new Date().toISOString();

    const row: string[] = valuesAppend.mock.calls[0][0].requestBody.values[0];
    const lastModified = row[17];
    expect(lastModified).toBeTruthy();
    expect(lastModified >= before).toBe(true);
    expect(lastModified <= after).toBe(true);
  });

  it('stamps last_modified (col R / index 17) on update', async () => {
    const existingRow = Array(19).fill('');
    existingRow[0] = 'SVC-26-0001-2026-05-10';
    existingRow[1] = '2026-05-10';
    existingRow[2] = 'SVC-26-0001';

    const { valuesUpdate } = setupSheets({ existingDispatchRows: [existingRow] });
    const { PATCH } = await import('@/app/api/service/update/route');

    const before = new Date().toISOString();
    await PATCH(makeRequest(baseBody()));
    const after = new Date().toISOString();

    const updateCall = valuesUpdate.mock.calls.find(
      (c: unknown[]) =>
        typeof (c[0] as { range?: string }).range === 'string' &&
        (c[0] as { range: string }).range.startsWith('Dispatch_Schedule!A')
    );
    const row: string[] = updateCall[0].requestBody.values[0];
    const lastModified = row[17];
    expect(lastModified).toBeTruthy();
    expect(lastModified >= before).toBe(true);
    expect(lastModified <= after).toBe(true);
  });

  // ── 6. Returns schedule_sync.status = created on append ───────────────────
  it('returns schedule_sync.status = created when appending a new row', async () => {
    setupSheets();
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(makeRequest(baseBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.schedule_sync).toBeDefined();
    expect(json.schedule_sync.status).toBe('created');
    expect(json.schedule_sync.slot_id).toBe('SVC-26-0001-2026-05-10');
  });

  // ── 7. Returns schedule_sync.status = updated when updating ───────────────
  it('returns schedule_sync.status = updated when an existing row is found', async () => {
    const existingRow = Array(19).fill('');
    existingRow[0] = 'SVC-26-0001-2026-05-10';
    existingRow[1] = '2026-05-10';
    existingRow[2] = 'SVC-26-0001';

    setupSheets({ existingDispatchRows: [existingRow] });
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(makeRequest(baseBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.schedule_sync.status).toBe('updated');
    expect(json.schedule_sync.slot_id).toBe('SVC-26-0001-2026-05-10');
  });

  // ── 8. Returns schedule_sync.status = skipped when FIELD_BACKEND_SHEET_ID missing
  it('returns schedule_sync.status = skipped when FIELD_BACKEND_SHEET_ID is not set', async () => {
    setupSheets({ noFieldSheet: true });
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(makeRequest(baseBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.schedule_sync.status).toBe('skipped');
    expect(json.schedule_sync.warning).toContain('FIELD_BACKEND_SHEET_ID');
  });

  // ── 9. Returns schedule_sync.status = failed when Sheets throws ────────────
  it('returns schedule_sync.status = failed when Google Sheets sync throws, WO update still succeeds', async () => {
    setupSheets({ fieldGetFails: true });
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(makeRequest(baseBody()));
    const json = await res.json();

    // WO update succeeded
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    // Schedule sync failed but is reported, not swallowed
    expect(json.schedule_sync.status).toBe('failed');
    expect(json.schedule_sync.warning).toBeTruthy();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[schedule-sync]'),
      expect.anything(),
    );
  });

  // ── 10. Does not hardcode Joey Ritthaler ──────────────────────────────────
  it('does not hardcode Joey Ritthaler as created_by', async () => {
    const { valuesAppend } = setupSheets();
    const { PATCH } = await import('@/app/api/service/update/route');

    mockCheckPermission.mockResolvedValue({ allowed: true, email: 'nate@kulaglass.com' });

    await PATCH(makeRequest(baseBody()));

    const row: string[] = valuesAppend.mock.calls[0][0].requestBody.values[0];
    const createdBy = row[8]; // col I
    expect(createdBy).not.toBe('Joey Ritthaler');
    expect(createdBy).toBe('nate@kulaglass.com');
  });

  it('falls back to service/update label when userEmail is empty', async () => {
    const { valuesAppend } = setupSheets();
    mockCheckPermission.mockResolvedValue({ allowed: true, email: '' });
    const { PATCH } = await import('@/app/api/service/update/route');

    await PATCH(makeRequest(baseBody()));

    const row: string[] = valuesAppend.mock.calls[0][0].requestBody.values[0];
    expect(row[8]).toBe('service/update');
  });

  // ── Returns not_requested when trigger fields are absent ──────────────────
  it('returns schedule_sync.status = not_requested when scheduledDate and assignedTo are absent', async () => {
    setupSheets();
    const { PATCH } = await import('@/app/api/service/update/route');

    const res = await PATCH(makeRequest({ woId: 'WO-26-0001', status: 'in_progress' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.schedule_sync.status).toBe('not_requested');
  });
});

export {};
