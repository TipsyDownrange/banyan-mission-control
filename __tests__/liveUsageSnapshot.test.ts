/**
 * BAN-319 v2 — UsageSnapshot cache + persistence tests.
 */

export {};

const mockSheetsAppend = jest.fn();
const mockSheetsGet = jest.fn();
const mockBatchUpdate = jest.fn();
const mockUpdate = jest.fn();

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
        values: { append: mockSheetsAppend, update: mockUpdate },
        get: mockSheetsGet,
        batchUpdate: mockBatchUpdate,
      },
    })),
  },
}));

import type { UsageSnapshot } from '@/lib/cost/types';
import {
  readLatestUsageSnapshot,
  writeUsageSnapshot,
  getUsageAttemptStatus,
  __resetUsageSnapshotCacheForTests,
} from '@/lib/cost/liveUsageSnapshot';
import { __resetEnsureSheetTabCacheForTests } from '@/lib/cost/ensureSheetTab';

const anthropicSnapshot: UsageSnapshot = {
  provider: 'anthropic',
  currentSession: { pct: 38, resetsAt: '2026-05-18T15:00:00.000Z' },
  weeklyLimit: { pct: 12, resetsAt: '2026-05-25T00:00:00.000Z' },
  claudeDesign: { pct: 5, resetsAt: '2026-05-25T00:00:00.000Z' },
  extraUsage: { used: 1.25, limit: 25 },
  fetchedAt: '2026-05-18T12:00:30.000Z',
  sourceApp: 'kai-oauth-relay',
};

const openaiSnapshot: UsageSnapshot = {
  provider: 'openai',
  currentSession: { pct: 22, resetsAt: '2026-05-18T15:30:00.000Z' },
  weeklyLimit: { pct: 8, resetsAt: '2026-05-25T00:00:00.000Z' },
  fetchedAt: '2026-05-18T12:00:30.000Z',
  sourceApp: 'kai-oauth-relay',
};

describe('liveUsageSnapshot', () => {
  beforeEach(() => {
    __resetUsageSnapshotCacheForTests();
    __resetEnsureSheetTabCacheForTests();
    mockSheetsAppend.mockReset().mockResolvedValue({});
    mockSheetsGet.mockReset().mockResolvedValue({ data: { sheets: [{ properties: { title: 'Banyan_CostSnapshot' } }] } });
    mockBatchUpdate.mockReset().mockResolvedValue({});
    mockUpdate.mockReset().mockResolvedValue({});
  });

  it('returns null when nothing is cached for a provider', () => {
    expect(readLatestUsageSnapshot('anthropic')).toBeNull();
  });

  it('caches per-provider independently', async () => {
    const now = new Date('2026-05-18T12:00:30.000Z');
    await writeUsageSnapshot(anthropicSnapshot, now);
    await writeUsageSnapshot(openaiSnapshot, now);

    const anthropicHit = readLatestUsageSnapshot('anthropic', new Date('2026-05-18T12:00:45.000Z'));
    const openaiHit = readLatestUsageSnapshot('openai', new Date('2026-05-18T12:00:45.000Z'));
    expect(anthropicHit?.snapshot.provider).toBe('anthropic');
    expect(openaiHit?.snapshot.provider).toBe('openai');
    expect(anthropicHit?.snapshot.currentSession.pct).toBe(38);
    expect(openaiHit?.snapshot.currentSession.pct).toBe(22);
  });

  it('appends a row to Banyan_CostSnapshot with the v2 schema', async () => {
    const now = new Date('2026-05-18T12:00:30.000Z');
    await writeUsageSnapshot(anthropicSnapshot, now);
    expect(mockSheetsAppend).toHaveBeenCalledTimes(1);
    const call = mockSheetsAppend.mock.calls[0][0];
    expect(call.spreadsheetId).toBe('test-backend-sheet');
    expect(call.range).toBe('Banyan_CostSnapshot!A:M');
    const row = call.requestBody.values[0];
    expect(row[2]).toBe('anthropic');
    expect(row[3]).toBe('usage');
    expect(row[4]).toBe(38);
    expect(row[5]).toBe(12);
    expect(row[6]).toBe(5);
  });

  it('expires the cache after 5 minutes', async () => {
    const stored = new Date('2026-05-18T12:00:00.000Z');
    await writeUsageSnapshot(anthropicSnapshot, stored);
    const justInside = readLatestUsageSnapshot('anthropic', new Date('2026-05-18T12:04:59.000Z'));
    const justOutside = readLatestUsageSnapshot('anthropic', new Date('2026-05-18T12:05:01.000Z'));
    expect(justInside).not.toBeNull();
    expect(justOutside).toBeNull();
  });

  it('survives a sheet append failure and still serves cache', async () => {
    mockSheetsAppend.mockRejectedValueOnce(new Error('sheet quota'));
    const stored = new Date('2026-05-18T12:00:00.000Z');
    const result = await writeUsageSnapshot(anthropicSnapshot, stored);
    expect(result.sheetPersistAttempted).toBe(true);
    expect(readLatestUsageSnapshot('anthropic', new Date('2026-05-18T12:00:10.000Z'))).not.toBeNull();
  });

  it('reports lastSuccessAt + snapshotPresent through getUsageAttemptStatus', async () => {
    await writeUsageSnapshot(anthropicSnapshot, new Date('2026-05-18T12:00:00.000Z'));
    const status = getUsageAttemptStatus('anthropic');
    expect(status.snapshotPresent).toBe(true);
    expect(status.lastSuccessAt).toBe('2026-05-18T12:00:00.000Z');
    expect(status.lastError).toBeNull();
  });
});
