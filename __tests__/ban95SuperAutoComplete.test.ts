/**
 * BAN-95 Gate 5: superintendent PATCH auto-complete regression tests.
 *
 * Verifies that:
 * 1. Auto-complete Step_Completions rows carry the kID at index 2 (not blank).
 * 2. Duplicate completion rows are NOT created when an INSTALLED row already exists.
 * 3. A new completion row IS created when no complete row exists for the step.
 */

const mockSheets = jest.fn();

jest.mock('googleapis', () => ({ google: { sheets: mockSheets } }));
jest.mock('@/lib/gauth', () => ({ getGoogleAuth: jest.fn(() => ({})) }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('@/lib/normalize-kid', () => ({
  normalizeKID: (v: string) => v,
  kidsMatch: (a: string, b: string) => a === b,
}));
jest.mock('@/lib/service-status', () => ({
  deriveWorkOrderStatus: jest.fn().mockResolvedValue('completed'),
}));

const KID = 'WO-26-9999';
const STEP_ID = 'IS-TEST-001';
const SLOT_ID = 'SLOT-20260501-001';

function makeDispatchRow(overrides: Partial<string[]> = []): string[] {
  const row = Array(19).fill('');
  row[0] = SLOT_ID;   // slot_id
  row[1] = '2026-05-01'; // date
  row[2] = KID;          // kID
  row[9] = 'open';       // status (will be set to 'completed' via PATCH body)
  row[18] = JSON.stringify([STEP_ID]); // focus_step_ids
  overrides.forEach((v, i) => { if (v !== undefined) row[i] = v; });
  return row;
}

function makeRequest(body: Record<string, unknown>) {
  return new Request('https://example.test/api/superintendent-scheduling', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

type SheetsClient = {
  valuesGet: jest.Mock;
  valuesUpdate: jest.Mock;
  valuesAppend: jest.Mock;
};

function setupSheets(options: {
  completionRows?: string[][];
  stepRows?: string[][];
} = {}): SheetsClient {
  const {
    completionRows = [],
    stepRows = [['IS-TEST-001', 'IP-TEST-001', '1', 'Install panel', '4']],
  } = options;

  const dispatchRow = makeDispatchRow();

  const valuesGet = jest.fn();
  // Call 1: Dispatch_Schedule!A2:S5000 (find slot by slot_id)
  valuesGet.mockResolvedValueOnce({ data: { values: [dispatchRow] } });
  // Calls 2-4: auto-complete Promise.all (status=completed, focus_step_ids not in body so no validateFocusStepIds)
  valuesGet.mockResolvedValueOnce({ data: { values: stepRows } });                                                 // Install_Steps
  valuesGet.mockResolvedValueOnce({ data: { values: [['IP-TEST-001', KID, 'glass']] } });                         // Install_Plans
  valuesGet.mockResolvedValueOnce({ data: { values: completionRows } });                                           // Step_Completions!A2:J5000
  // Call 5: Service_Work_Orders (for WO status update after completion)
  valuesGet.mockResolvedValueOnce({ data: { values: [['WO-26-9999', '26-9999', '', '', 'in_progress']] } });

  const valuesUpdate = jest.fn().mockResolvedValue({ data: {} });
  const valuesAppend = jest.fn().mockResolvedValue({ data: {} });
  const valuesBatchUpdate = jest.fn().mockResolvedValue({ data: {} });

  mockSheets.mockReturnValue({
    spreadsheets: {
      values: {
        get: valuesGet,
        update: valuesUpdate,
        append: valuesAppend,
        batchUpdate: valuesBatchUpdate,
      },
    },
  });

  return { valuesGet, valuesUpdate, valuesAppend };
}

describe('superintendent PATCH auto-complete — BAN-95 Gate 5', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // ── 1. kID populated at index 2 ────────────────────────────────────────────
  it('writes kID at index 2 of the auto-complete Step_Completions row', async () => {
    const { valuesAppend } = setupSheets({ completionRows: [] });
    const { PATCH } = await import('@/app/api/superintendent-scheduling/route');

    const res = await PATCH(makeRequest({ slot_id: SLOT_ID, status: 'completed' }));
    expect(res.status).toBe(200);

    const appendCall = valuesAppend.mock.calls.find(
      (c: unknown[]) =>
        typeof (c[0] as { range?: string }).range === 'string' &&
        (c[0] as { range: string }).range.startsWith('Step_Completions')
    );
    expect(appendCall).toBeDefined();
    const row: unknown[] = appendCall[0].requestBody.values[0];
    expect(row[2]).toBe(KID); // index 2 = job_id / kID — must not be blank
  });

  // ── 2. index 1 is the step ID ──────────────────────────────────────────────
  it('writes the step ID at index 1 of the auto-complete row', async () => {
    const { valuesAppend } = setupSheets({ completionRows: [] });
    const { PATCH } = await import('@/app/api/superintendent-scheduling/route');

    await PATCH(makeRequest({ slot_id: SLOT_ID, status: 'completed' }));

    const appendCall = valuesAppend.mock.calls.find(
      (c: unknown[]) =>
        typeof (c[0] as { range?: string }).range === 'string' &&
        (c[0] as { range: string }).range.startsWith('Step_Completions')
    );
    const row: unknown[] = appendCall[0].requestBody.values[0];
    expect(row[1]).toBe(STEP_ID);
  });

  // ── 3. No duplicate when INSTALLED row already exists ─────────────────────
  it('does NOT create a completion row when an INSTALLED row already exists for the step', async () => {
    const existingInstalledRow = ['SC-OLD', STEP_ID, KID, '2026-04-30', 'Alice', '4', 'INSTALLED', '', '', ''];
    const { valuesAppend } = setupSheets({ completionRows: [existingInstalledRow] });
    const { PATCH } = await import('@/app/api/superintendent-scheduling/route');

    const res = await PATCH(makeRequest({ slot_id: SLOT_ID, status: 'completed' }));
    expect(res.status).toBe(200);

    const stepCompAppend = valuesAppend.mock.calls.find(
      (c: unknown[]) =>
        typeof (c[0] as { range?: string }).range === 'string' &&
        (c[0] as { range: string }).range.startsWith('Step_Completions')
    );
    expect(stepCompAppend).toBeUndefined();
  });

  // ── 4. No duplicate when pct=100 row already exists (legacy style) ────────
  it('does NOT create a completion row when a percent_complete=100 row already exists', async () => {
    const existingPercentRow = ['SC-OLD', STEP_ID, KID, '2026-04-30', 'Alice', '4', '100', '', '', ''];
    const { valuesAppend } = setupSheets({ completionRows: [existingPercentRow] });
    const { PATCH } = await import('@/app/api/superintendent-scheduling/route');

    const res = await PATCH(makeRequest({ slot_id: SLOT_ID, status: 'completed' }));
    expect(res.status).toBe(200);

    const stepCompAppend = valuesAppend.mock.calls.find(
      (c: unknown[]) =>
        typeof (c[0] as { range?: string }).range === 'string' &&
        (c[0] as { range: string }).range.startsWith('Step_Completions')
    );
    expect(stepCompAppend).toBeUndefined();
  });

  // ── 5. Creates completion row when only partial rows exist ────────────────
  it('creates a completion row when only a partial (50%) completion exists for the step', async () => {
    const partialRow = ['SC-PART', STEP_ID, KID, '2026-04-30', 'Alice', '2', '50', '', '', ''];
    const { valuesAppend } = setupSheets({ completionRows: [partialRow] });
    const { PATCH } = await import('@/app/api/superintendent-scheduling/route');

    const res = await PATCH(makeRequest({ slot_id: SLOT_ID, status: 'completed' }));
    expect(res.status).toBe(200);

    const stepCompAppend = valuesAppend.mock.calls.find(
      (c: unknown[]) =>
        typeof (c[0] as { range?: string }).range === 'string' &&
        (c[0] as { range: string }).range.startsWith('Step_Completions')
    );
    expect(stepCompAppend).toBeDefined();
    const row: unknown[] = stepCompAppend[0].requestBody.values[0];
    expect(row[2]).toBe(KID);
  });

  // ── 6. Step_Completions read uses A2:J5000 range ──────────────────────────
  it('reads Step_Completions from A2:J5000 to capture Field App status column', async () => {
    const { valuesGet } = setupSheets({ completionRows: [] });
    const { PATCH } = await import('@/app/api/superintendent-scheduling/route');

    await PATCH(makeRequest({ slot_id: SLOT_ID, status: 'completed' }));

    const completionsRead = valuesGet.mock.calls.find(
      (c: unknown[]) =>
        typeof (c[0] as { range?: string }).range === 'string' &&
        (c[0] as { range: string }).range === 'Step_Completions!A2:J5000'
    );
    expect(completionsRead).toBeDefined();
  });
});

export {};
