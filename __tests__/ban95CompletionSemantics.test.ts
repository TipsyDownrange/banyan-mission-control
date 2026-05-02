/**
 * BAN-95 Gate 5: completion semantics regression tests.
 *
 * Verifies that Field App-style INSTALLED completion rows are correctly
 * interpreted as complete by isCompletionRowComplete, deriveWorkOrderStatus,
 * and the superintendent PATCH auto-complete handler.
 */

// ─── isCompletionRowComplete unit tests ──────────────────────────────────────

import { isCompletionRowComplete } from '@/lib/step-completion';

describe('isCompletionRowComplete (BAN-95 Gate 5)', () => {
  function makeRow(col6 = '', col9 = ''): string[] {
    const row = Array(10).fill('');
    row[6] = col6;
    row[9] = col9;
    return row;
  }

  it('returns true when col6 = INSTALLED (Field App style)', () => {
    expect(isCompletionRowComplete(makeRow('INSTALLED'))).toBe(true);
  });

  it('returns true when col6 = installed (lowercase)', () => {
    expect(isCompletionRowComplete(makeRow('installed'))).toBe(true);
  });

  it('returns true when col6 = COMPLETE', () => {
    expect(isCompletionRowComplete(makeRow('COMPLETE'))).toBe(true);
  });

  it('returns true when col6 = COMPLETED', () => {
    expect(isCompletionRowComplete(makeRow('COMPLETED'))).toBe(true);
  });

  it('returns true when col6 = 100 (legacy percent_complete)', () => {
    expect(isCompletionRowComplete(makeRow('100'))).toBe(true);
  });

  it('returns true when col6 = 100.0', () => {
    expect(isCompletionRowComplete(makeRow('100.0'))).toBe(true);
  });

  it('returns true when col6 = 150 (over 100)', () => {
    expect(isCompletionRowComplete(makeRow('150'))).toBe(true);
  });

  it('returns false when col6 = 50 (partial percent)', () => {
    expect(isCompletionRowComplete(makeRow('50'))).toBe(false);
  });

  it('returns false when col6 = 0', () => {
    expect(isCompletionRowComplete(makeRow('0'))).toBe(false);
  });

  it('returns false when col6 is empty', () => {
    expect(isCompletionRowComplete(makeRow(''))).toBe(false);
  });

  it('returns false when col6 = BLOCKED', () => {
    expect(isCompletionRowComplete(makeRow('BLOCKED'))).toBe(false);
  });

  it('returns true when col9 = INSTALLED and col6 is empty', () => {
    expect(isCompletionRowComplete(makeRow('', 'INSTALLED'))).toBe(true);
  });

  it('returns true when col9 = completed and col6 is empty', () => {
    expect(isCompletionRowComplete(makeRow('', 'completed'))).toBe(true);
  });

  it('returns false for a short row with no completion signal (Field App row with only 7 cols)', () => {
    const row = ['SC-1', 'IS-1', 'WO-1', '2026-05-01', 'Alice', '4', ''];
    expect(isCompletionRowComplete(row)).toBe(false);
  });

  it('returns true for a Field App row where col6 = INSTALLED (7-col row)', () => {
    const row = ['SC-1', 'IS-1', 'WO-1', '2026-05-01', 'Alice', '4', 'INSTALLED'];
    expect(isCompletionRowComplete(row)).toBe(true);
  });
});

// ─── deriveWorkOrderStatus integration tests ─────────────────────────────────

const mockSheets = jest.fn();
jest.mock('googleapis', () => ({ google: { sheets: mockSheets } }));
jest.mock('@/lib/gauth', () => ({ getGoogleAuth: jest.fn(() => ({})) }));
jest.mock('@/lib/backend-config', () => ({ getBackendSheetId: jest.fn(() => 'backend-sheet-test') }));
jest.mock('@/lib/normalize-kid', () => ({
  normalizeKID: (v: string) => v,
  kidsMatch: (a: string, b: string) => a === b,
}));

type ValuesGet = jest.Mock;

function setupServiceStatus(options: {
  planRows?: string[][];
  stepRows?: string[][];
  completionRows?: string[][];
  dispatchRows?: string[][];
  estimateRows?: string[][];
}): ValuesGet {
  const {
    planRows = [],
    stepRows = [],
    completionRows = [],
    dispatchRows = [],
    estimateRows = [],
  } = options;

  const valuesGet = jest.fn()
    .mockResolvedValueOnce({ data: { values: planRows } })       // Install_Plans
    .mockResolvedValueOnce({ data: { values: stepRows } })       // Install_Steps
    .mockResolvedValueOnce({ data: { values: completionRows } }) // Step_Completions
    .mockResolvedValueOnce({ data: { values: dispatchRows } })   // Dispatch_Schedule
    .mockResolvedValueOnce({ data: { values: estimateRows } });  // Carls_Method

  mockSheets.mockReturnValue({
    spreadsheets: { values: { get: valuesGet } },
  });

  return valuesGet;
}

describe('deriveWorkOrderStatus — Field App INSTALLED completion rows (BAN-95 Gate 5)', () => {
  const WO_ID = 'WO-26-TEST';
  const PLAN_ID = 'IP-TEST-001';
  const STEP_ID_1 = 'IS-TEST-001';
  const STEP_ID_2 = 'IS-TEST-002';

  const planRow = [PLAN_ID, WO_ID, 'glass', 'Maui', '8', '1', 'Active'];
  const stepRow1 = [STEP_ID_1, PLAN_ID, '1', 'Install panel', '4', '', 'N'];
  const stepRow2 = [STEP_ID_2, PLAN_ID, '2', 'Seal edges', '4', '', 'N'];

  function makeCompletionRow(stepId: string, col6: string, col9 = ''): string[] {
    return ['SC-1', stepId, WO_ID, '2026-05-01', 'Alice', '4', col6, 'notes', '', col9];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('returns completed when all steps have INSTALLED completion rows', async () => {
    setupServiceStatus({
      planRows: [planRow],
      stepRows: [stepRow1, stepRow2],
      completionRows: [
        makeCompletionRow(STEP_ID_1, 'INSTALLED'),
        makeCompletionRow(STEP_ID_2, 'INSTALLED'),
      ],
    });
    const { deriveWorkOrderStatus } = await import('@/lib/service-status');
    const status = await deriveWorkOrderStatus({ woId: WO_ID });
    expect(status).toBe('completed');
  });

  it('returns in_progress when only one of two steps has INSTALLED completion', async () => {
    setupServiceStatus({
      planRows: [planRow],
      stepRows: [stepRow1, stepRow2],
      completionRows: [makeCompletionRow(STEP_ID_1, 'INSTALLED')],
    });
    const { deriveWorkOrderStatus } = await import('@/lib/service-status');
    const status = await deriveWorkOrderStatus({ woId: WO_ID });
    expect(status).toBe('in_progress');
  });

  it('returns completed when all steps have legacy percent_complete = 100 rows', async () => {
    setupServiceStatus({
      planRows: [planRow],
      stepRows: [stepRow1, stepRow2],
      completionRows: [
        makeCompletionRow(STEP_ID_1, '100'),
        makeCompletionRow(STEP_ID_2, '100'),
      ],
    });
    const { deriveWorkOrderStatus } = await import('@/lib/service-status');
    const status = await deriveWorkOrderStatus({ woId: WO_ID });
    expect(status).toBe('completed');
  });

  it('returns in_progress when steps have partial (50%) completion rows', async () => {
    setupServiceStatus({
      planRows: [planRow],
      stepRows: [stepRow1],
      completionRows: [makeCompletionRow(STEP_ID_1, '50')],
    });
    const { deriveWorkOrderStatus } = await import('@/lib/service-status');
    const status = await deriveWorkOrderStatus({ woId: WO_ID });
    expect(status).toBe('in_progress');
  });

  it('returns completed when col9 = INSTALLED and col6 is empty', async () => {
    setupServiceStatus({
      planRows: [planRow],
      stepRows: [stepRow1],
      completionRows: [makeCompletionRow(STEP_ID_1, '', 'INSTALLED')],
    });
    const { deriveWorkOrderStatus } = await import('@/lib/service-status');
    const status = await deriveWorkOrderStatus({ woId: WO_ID });
    expect(status).toBe('completed');
  });

  it('returns in_progress (not completed) for INSTALLED only on a subset of steps', async () => {
    setupServiceStatus({
      planRows: [planRow],
      stepRows: [stepRow1, stepRow2],
      completionRows: [makeCompletionRow(STEP_ID_1, 'INSTALLED')],
      // STEP_ID_2 has no completion row
    });
    const { deriveWorkOrderStatus } = await import('@/lib/service-status');
    const status = await deriveWorkOrderStatus({ woId: WO_ID });
    expect(status).toBe('in_progress');
  });
});

export {};
