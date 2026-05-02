/**
 * BAN-93 Gate 4: drift detection tests for PATCH /api/work-breakdown/[jobId] type:'step'.
 * Verifies that editing planned_start_date returns drift_warnings when committed
 * Dispatch_Schedule slots reference the step on a different date.
 * No live Google Sheets writes.
 */

const mockGetServerSession = jest.fn();
const mockSheets = jest.fn();

jest.mock('next-auth', () => ({ getServerSession: () => mockGetServerSession() }));
jest.mock('googleapis', () => ({ google: { sheets: mockSheets } }));
jest.mock('@/lib/gauth', () => ({ getGoogleAuth: jest.fn(() => ({})) }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('@/lib/normalize-kid', () => ({
  normalizeKID: (v: string) => v,
  kidsMatch: (a: string, b: string) => a === b,
}));
jest.mock('@/lib/schemas', () => ({
  validateHeaders: jest.fn(() => ({ valid: true })),
  INSTALL_PLANS_SCHEMA: [],
  INSTALL_STEPS_SCHEMA: [],
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STEP_ID = 'IS-TEST-001';

function makeStepRow(overrides: Partial<string[]> = []): string[] {
  const row = [
    STEP_ID,          // 0  install_step_id
    'IP-001',         // 1  install_plan_id
    '1',              // 2  step_seq
    'Install panel',  // 3  step_name
    '4',              // 4  allotted_hours
    '',               // 5  acceptance_criteria
    'N',              // 6  required_photo_yn
    '',               // 7  notes
    'Installation',   // 8  category
    '2026-05-07',     // 9  planned_start_date
    '2026-05-07',     // 10 planned_end_date
    '',               // 11 assigned_crew
    '',               // 12 predecessor_step_id
    '',               // 13 bid_hours
    '',               // 14 planned_hours
    '',               // 15 actual_hours
  ];
  overrides.forEach((v, i) => { if (v !== undefined) row[i] = v; });
  return row;
}

function makeDispatchRow(slotId: string, slotDate: string, focusStepIds: string): string[] {
  const row = Array(19).fill('');
  row[0] = slotId;
  row[1] = slotDate;
  row[2] = 'WO-26-0001';
  row[18] = focusStepIds;
  return row;
}

function makeRequest(jobId: string, body: Record<string, unknown>) {
  return new Request(`https://example.test/api/work-breakdown/${jobId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

type ValuesClient = {
  valuesGet: jest.Mock;
  valuesUpdate: jest.Mock;
};

function setupSheets(dispatchRows: string[][]): ValuesClient {
  const valuesGet = jest.fn();
  // Call 1: Install_Steps read (find the step)
  valuesGet.mockResolvedValueOnce({ data: { values: [makeStepRow()] } });
  // Call 2: Dispatch_Schedule drift check
  valuesGet.mockResolvedValueOnce({ data: { values: dispatchRows } });

  const valuesUpdate = jest.fn().mockResolvedValue({ data: {} });

  mockSheets.mockReturnValue({
    spreadsheets: { values: { get: valuesGet, update: valuesUpdate, append: jest.fn(), batchUpdate: jest.fn() } },
  });

  return { valuesGet, valuesUpdate };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('work-breakdown PATCH type:step — BAN-93 Gate 4 drift detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockGetServerSession.mockResolvedValue({ user: { email: 'sean@kulaglass.com' } });
  });

  // ── 1. No drift: slot date matches new planned_start_date ─────────────────
  it('returns no drift_warnings when slot date matches new planned_start_date', async () => {
    // Slot on 2026-05-12, step is being moved to 2026-05-12 — no drift
    setupSheets([
      makeDispatchRow('SLOT-001', '2026-05-12', JSON.stringify([STEP_ID])),
    ]);
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');

    const params = Promise.resolve({ jobId: 'WO-26-0001' });
    const res = await PATCH(
      makeRequest('WO-26-0001', { type: 'step', id: STEP_ID, planned_start_date: '2026-05-12' }),
      { params }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.drift_warnings).toBeUndefined();
  });

  // ── 2. Single drift: one slot on a different date ─────────────────────────
  it('returns one drift_warning when a committed slot references the step on a different date', async () => {
    // Slot committed on 2026-05-07; step is being moved to 2026-05-12
    setupSheets([
      makeDispatchRow('SLOT-20260507-001', '2026-05-07', JSON.stringify([STEP_ID])),
    ]);
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');

    const params = Promise.resolve({ jobId: 'WO-26-0001' });
    const res = await PATCH(
      makeRequest('WO-26-0001', { type: 'step', id: STEP_ID, planned_start_date: '2026-05-12' }),
      { params }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.drift_warnings).toHaveLength(1);
    expect(json.drift_warnings[0]).toMatchObject({
      slot_id: 'SLOT-20260507-001',
      slot_date: '2026-05-07',
      step_id: STEP_ID,
      new_planned_date: '2026-05-12',
    });
  });

  // ── 3. Multiple drift: two committed slots on different mismatched dates ──
  it('returns one warning per drifted slot when multiple slots reference the step', async () => {
    // Two slots on different dates; step moved to 2026-05-14 — both drift
    setupSheets([
      makeDispatchRow('SLOT-20260507-001', '2026-05-07', JSON.stringify([STEP_ID, 'IS-OTHER'])),
      makeDispatchRow('SLOT-20260510-001', '2026-05-10', JSON.stringify([STEP_ID])),
    ]);
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');

    const params = Promise.resolve({ jobId: 'WO-26-0001' });
    const res = await PATCH(
      makeRequest('WO-26-0001', { type: 'step', id: STEP_ID, planned_start_date: '2026-05-14' }),
      { params }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.drift_warnings).toHaveLength(2);

    const slotIds = json.drift_warnings.map((w: { slot_id: string }) => w.slot_id);
    expect(slotIds).toContain('SLOT-20260507-001');
    expect(slotIds).toContain('SLOT-20260510-001');

    for (const w of json.drift_warnings) {
      expect(w.step_id).toBe(STEP_ID);
      expect(w.new_planned_date).toBe('2026-05-14');
    }
  });

  // ── 4. Non-date edit: no drift check when fields have no date ─────────────
  it('returns no drift_warnings and does not read Dispatch_Schedule when editing a non-date field', async () => {
    // Only one Sheets call needed (Install_Steps read + update); no dispatch read
    const valuesGet = jest.fn()
      .mockResolvedValueOnce({ data: { values: [makeStepRow()] } }); // Install_Steps
    const valuesUpdate = jest.fn().mockResolvedValue({ data: {} });
    mockSheets.mockReturnValue({
      spreadsheets: { values: { get: valuesGet, update: valuesUpdate, append: jest.fn(), batchUpdate: jest.fn() } },
    });

    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const params = Promise.resolve({ jobId: 'WO-26-0001' });
    const res = await PATCH(
      makeRequest('WO-26-0001', { type: 'step', id: STEP_ID, step_name: 'Renamed step' }),
      { params }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.drift_warnings).toBeUndefined();
    // Dispatch_Schedule should NOT have been read
    const dispatchRead = valuesGet.mock.calls.find(
      (c: unknown[]) => typeof (c[0] as { range?: string }).range === 'string' && (c[0] as { range: string }).range.includes('Dispatch_Schedule')
    );
    expect(dispatchRead).toBeUndefined();
  });

  // ── 5. Legacy comma-separated focus_step_ids are parsed correctly ─────────
  it('detects drift when focus_step_ids is stored as legacy comma-separated string', async () => {
    setupSheets([
      makeDispatchRow('SLOT-20260507-001', '2026-05-07', `${STEP_ID}, IS-OTHER`),
    ]);
    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');

    const params = Promise.resolve({ jobId: 'WO-26-0001' });
    const res = await PATCH(
      makeRequest('WO-26-0001', { type: 'step', id: STEP_ID, planned_start_date: '2026-05-20' }),
      { params }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.drift_warnings).toHaveLength(1);
    expect(json.drift_warnings[0].slot_id).toBe('SLOT-20260507-001');
  });

  // ── 6. Drift check failure is non-fatal ───────────────────────────────────
  it('returns ok:true without drift_warnings when Dispatch_Schedule read throws', async () => {
    const valuesGet = jest.fn()
      .mockResolvedValueOnce({ data: { values: [makeStepRow()] } }) // Install_Steps
      .mockRejectedValueOnce(new Error('Sheets unavailable'));       // Dispatch drift check
    const valuesUpdate = jest.fn().mockResolvedValue({ data: {} });
    mockSheets.mockReturnValue({
      spreadsheets: { values: { get: valuesGet, update: valuesUpdate, append: jest.fn(), batchUpdate: jest.fn() } },
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { PATCH } = await import('@/app/api/work-breakdown/[jobId]/route');
    const params = Promise.resolve({ jobId: 'WO-26-0001' });
    const res = await PATCH(
      makeRequest('WO-26-0001', { type: 'step', id: STEP_ID, planned_start_date: '2026-05-12' }),
      { params }
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.drift_warnings).toBeUndefined();
  });
});

export {};
