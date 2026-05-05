const mockCheckPermission = jest.fn();
const mockSheets = jest.fn();

jest.mock('@/lib/permissions', () => ({
  checkPermission: mockCheckPermission,
}));

jest.mock('@/lib/gauth', () => ({
  getGoogleAuth: jest.fn(() => ({})),
}));

jest.mock('@/lib/backend-config', () => ({
  getBackendSheetId: jest.fn(() => 'backend-sheet-test'),
}));

jest.mock('googleapis', () => ({
  google: {
    sheets: mockSheets,
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  process.env.DISABLE_DISPATCH_EMAILS = 'true';
});

describe('dispatch schedule delete permissions', () => {
  it('requires dispatch:create before deleting a slot', async () => {
    mockCheckPermission.mockResolvedValue({ allowed: false });
    const { DELETE } = await import('@/app/api/dispatch-schedule/route');

    const res = await DELETE(new Request('https://example.test/api/dispatch-schedule?slot_id=SLOT-1', { method: 'DELETE' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Forbidden: dispatch:create required');
    expect(mockCheckPermission).toHaveBeenCalledWith(expect.any(Request), 'dispatch:create');
    expect(mockSheets).not.toHaveBeenCalled();
  });
});

// ─── BAN-134: canonical Dispatch_Schedule A:S preservation ───────────────────
//
// The legacy /api/dispatch-schedule route used to read/write A:O, which silently
// truncated columns P:S (step_ids, hours_actual, last_modified, focus_step_ids).
// These tests pin the canonical A:S contract for create / update / delete /
// fetch and prove that legacy PATCHes can no longer destroy focus_step_ids.

const SLOT_WITH_FOCUS_STEPS = [
  'SLOT-20260501-001', // 0  A  slot_id
  '2026-05-01',        // 1  B  date
  'WO-26-0001',        // 2  C  kID
  'Test Repair',       // 3  D  project_name
  'Maui',              // 4  E  island
  '2',                 // 5  F  men_required
  '4',                 // 6  G  hours_estimated
  'Old Crew',          // 7  H  assigned_crew
  'mission-control',   // 8  I  created_by
  'open',              // 9  J  status
  'Alice:confirmed',   // 10 K  confirmations
  'service',           // 11 L  work_type
  'Be careful',        // 12 M  notes
  '08:00',             // 13 N  start_time
  '12:00',             // 14 O  end_time
  'STEP-1, STEP-2',    // 15 P  step_ids        ← Field App / canonical owner
  '3.5',               // 16 Q  hours_actual    ← Field App / canonical owner
  '2026-05-01T08:00:00.000Z', // 17 R  last_modified
  '["IS-7","IS-8"]',   // 18 S  focus_step_ids  ← Superintendent owner
];

function setupSheetsMock(options: {
  existingDispatchRows?: string[][];
  appendFails?: boolean;
  updateFails?: boolean;
} = {}) {
  const { existingDispatchRows = [], appendFails = false, updateFails = false } = options;

  const valuesGet = jest.fn().mockImplementation(({ range }: { range: string }) => {
    if (range.startsWith('Dispatch_Schedule!A2:A')) {
      return Promise.resolve({ data: { values: existingDispatchRows.map(r => [r[0]]) } });
    }
    if (range.startsWith('Dispatch_Schedule!A2:S') || range.startsWith('Dispatch_Schedule!A2:O')) {
      return Promise.resolve({ data: { values: existingDispatchRows } });
    }
    return Promise.resolve({ data: { values: [] } });
  });

  const valuesAppend = appendFails
    ? jest.fn().mockRejectedValue(new Error('append failed'))
    : jest.fn().mockResolvedValue({ data: {} });
  const valuesUpdate = updateFails
    ? jest.fn().mockRejectedValue(new Error('update failed'))
    : jest.fn().mockResolvedValue({ data: {} });
  const valuesClear = jest.fn().mockResolvedValue({ data: {} });

  mockSheets.mockReturnValue({
    spreadsheets: {
      values: {
        get: valuesGet,
        append: valuesAppend,
        update: valuesUpdate,
        clear: valuesClear,
      },
    },
  });

  return { valuesGet, valuesAppend, valuesUpdate, valuesClear };
}

describe('dispatch schedule — BAN-134 canonical A:S preservation', () => {
  describe('PATCH', () => {
    it('preserves columns P:S (step_ids, hours_actual, focus_step_ids) when only legacy fields are sent', async () => {
      mockCheckPermission.mockResolvedValue({ allowed: true });
      const { valuesUpdate } = setupSheetsMock({ existingDispatchRows: [SLOT_WITH_FOCUS_STEPS] });
      const { PATCH } = await import('@/app/api/dispatch-schedule/route');

      const res = await PATCH(new Request('https://example.test/api/dispatch-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: 'SLOT-20260501-001', assigned_crew: ['Alice', 'Bob'], status: 'filled' }),
      }));
      expect(res.status).toBe(200);

      expect(valuesUpdate).toHaveBeenCalledTimes(1);
      const updateCall = valuesUpdate.mock.calls[0][0];
      const writtenRow: string[] = updateCall.requestBody.values[0];

      // Range targets canonical A:S, not A:O.
      expect(updateCall.range).toMatch(/^Dispatch_Schedule!A\d+:S\d+$/);

      // Row is the canonical 19-column shape.
      expect(writtenRow).toHaveLength(19);

      // Legacy fields applied.
      expect(writtenRow[7]).toBe('Alice, Bob');         // assigned_crew
      expect(writtenRow[9]).toBe('filled');             // status

      // Field App / canonical-owner cells survive a legacy PATCH.
      expect(writtenRow[15]).toBe('STEP-1, STEP-2');    // step_ids
      expect(writtenRow[16]).toBe('3.5');               // hours_actual
      expect(writtenRow[18]).toBe('["IS-7","IS-8"]');   // focus_step_ids — BAN-123/134 contract
    });

    it('server-stamps last_modified (col R / 17) on every write', async () => {
      mockCheckPermission.mockResolvedValue({ allowed: true });
      const { valuesUpdate } = setupSheetsMock({ existingDispatchRows: [SLOT_WITH_FOCUS_STEPS] });
      const { PATCH } = await import('@/app/api/dispatch-schedule/route');

      const before = new Date().toISOString();
      const res = await PATCH(new Request('https://example.test/api/dispatch-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: 'SLOT-20260501-001', status: 'filled' }),
      }));
      const after = new Date().toISOString();
      expect(res.status).toBe(200);

      const writtenRow: string[] = valuesUpdate.mock.calls[0][0].requestBody.values[0];
      expect(writtenRow[17] >= before).toBe(true);
      expect(writtenRow[17] <= after).toBe(true);
      expect(writtenRow[17]).not.toBe(SLOT_WITH_FOCUS_STEPS[17]); // changed from prior stamp
    });

    it('reads from Dispatch_Schedule!A2:S5000 (not A2:O5000)', async () => {
      mockCheckPermission.mockResolvedValue({ allowed: true });
      const { valuesGet } = setupSheetsMock({ existingDispatchRows: [SLOT_WITH_FOCUS_STEPS] });
      const { PATCH } = await import('@/app/api/dispatch-schedule/route');

      await PATCH(new Request('https://example.test/api/dispatch-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: 'SLOT-20260501-001', status: 'filled' }),
      }));

      const dispatchRead = valuesGet.mock.calls.find(
        ([arg]: [{ range: string }]) => arg.range === 'Dispatch_Schedule!A2:S5000',
      );
      expect(dispatchRead).toBeDefined();
    });

    it('does not let a caller stomp last_modified by sending it in the body', async () => {
      mockCheckPermission.mockResolvedValue({ allowed: true });
      const { valuesUpdate } = setupSheetsMock({ existingDispatchRows: [SLOT_WITH_FOCUS_STEPS] });
      const { PATCH } = await import('@/app/api/dispatch-schedule/route');

      await PATCH(new Request('https://example.test/api/dispatch-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_id: 'SLOT-20260501-001',
          status: 'filled',
          last_modified: '1999-01-01T00:00:00.000Z',
        }),
      }));

      const writtenRow: string[] = valuesUpdate.mock.calls[0][0].requestBody.values[0];
      expect(writtenRow[17]).not.toBe('1999-01-01T00:00:00.000Z');
    });

    it('returns 404 when slot_id is not found', async () => {
      mockCheckPermission.mockResolvedValue({ allowed: true });
      const { valuesUpdate } = setupSheetsMock({ existingDispatchRows: [SLOT_WITH_FOCUS_STEPS] });
      const { PATCH } = await import('@/app/api/dispatch-schedule/route');

      const res = await PATCH(new Request('https://example.test/api/dispatch-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: 'SLOT-DOES-NOT-EXIST', status: 'filled' }),
      }));
      expect(res.status).toBe(404);
      expect(valuesUpdate).not.toHaveBeenCalled();
    });
  });

  describe('POST', () => {
    it('appends a 19-column row to Dispatch_Schedule!A:S', async () => {
      mockCheckPermission.mockResolvedValue({ allowed: true });
      const { valuesAppend } = setupSheetsMock();
      const { POST } = await import('@/app/api/dispatch-schedule/route');

      const res = await POST(new Request('https://example.test/api/dispatch-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: '2026-05-01',
          project_name: 'New Slot',
          island: 'Maui',
          men_required: '2',
          hours_estimated: '8',
          created_by: 'mission-control',
        }),
      }));
      expect(res.status).toBe(200);

      expect(valuesAppend).toHaveBeenCalledTimes(1);
      const appendCall = valuesAppend.mock.calls[0][0];
      expect(appendCall.range).toBe('Dispatch_Schedule!A:S');
      const row: string[] = appendCall.requestBody.values[0];
      expect(row).toHaveLength(19);
      // focus_step_ids defaults to '[]' so Field App readers see a parsable array.
      expect(row[18]).toBe('[]');
    });
  });

  describe('DELETE', () => {
    it('clears the full A:S row, not just A:O', async () => {
      mockCheckPermission.mockResolvedValue({ allowed: true });
      const { valuesClear } = setupSheetsMock({ existingDispatchRows: [SLOT_WITH_FOCUS_STEPS] });
      const { DELETE } = await import('@/app/api/dispatch-schedule/route');

      const res = await DELETE(new Request('https://example.test/api/dispatch-schedule?slot_id=SLOT-20260501-001', { method: 'DELETE' }));
      expect(res.status).toBe(200);

      expect(valuesClear).toHaveBeenCalledTimes(1);
      const clearCall = valuesClear.mock.calls[0][0];
      expect(clearCall.range).toMatch(/^Dispatch_Schedule!A\d+:S\d+$/);
    });
  });

  describe('GET', () => {
    it('reads canonical A:S range and exposes focus_step_ids on returned slots', async () => {
      const { valuesGet } = setupSheetsMock({ existingDispatchRows: [SLOT_WITH_FOCUS_STEPS] });
      const { GET } = await import('@/app/api/dispatch-schedule/route');

      const res = await GET(new Request('https://example.test/api/dispatch-schedule?from=2026-04-01&days=120'));
      const json = await res.json();
      expect(res.status).toBe(200);

      const dispatchRead = valuesGet.mock.calls.find(
        ([arg]: [{ range: string }]) => arg.range === 'Dispatch_Schedule!A2:S5000',
      );
      expect(dispatchRead).toBeDefined();
      expect(json.slots).toHaveLength(1);
      expect(json.slots[0].focus_step_ids).toBe('["IS-7","IS-8"]');
      expect(json.slots[0].step_ids).toBe('STEP-1, STEP-2');
    });
  });
});

export {};
