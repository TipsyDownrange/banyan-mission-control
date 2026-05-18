/**
 * Cost & Usage Live Tracking Phase 1 — snapshot cache helper.
 *
 * Verifies:
 * - readLatestLiveClaudeSnapshot returns null when nothing stored
 * - writeLiveClaudeSnapshot populates the cache and attempts a sheet append
 * - 5-minute TTL evicts the cache for read purposes
 * - sheet append failure does not break ingest (cache still readable)
 */

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

import type { LiveClaudeSnapshot } from '@/lib/cost/types';
import {
  readLatestLiveClaudeSnapshot,
  writeLiveClaudeSnapshot,
  __resetLiveClaudeSnapshotCacheForTests,
} from '@/lib/cost/liveClaudeSnapshot';

const snapshot: LiveClaudeSnapshot = {
  sessionPct: 42,
  weeklyPct: 10,
  opusPct: 5,
  extraUsageDollars: { used: 1.25, limit: 25 },
  resetSessionAt: '2026-05-07T15:00:00.000Z',
  resetWeeklyAt: '2026-05-12T00:00:00.000Z',
  sourceApp: 'usage-for-claude-dashboard',
  capturedAt: '2026-05-07T12:00:30.000Z',
};

describe('liveClaudeSnapshot helper', () => {
  beforeEach(() => {
    __resetLiveClaudeSnapshotCacheForTests();
    mockSheetsAppend.mockReset();
    mockSheetsAppend.mockResolvedValue({});
  });

  it('returns null before anything is stored', () => {
    expect(readLatestLiveClaudeSnapshot(new Date('2026-05-07T12:00:00.000Z'))).toBeNull();
  });

  it('stores a snapshot in cache and attempts a sheet append', async () => {
    const now = new Date('2026-05-07T12:00:30.000Z');
    const result = await writeLiveClaudeSnapshot(snapshot, now);

    expect(result.storedAt).toBe(now.toISOString());
    expect(result.sheetPersistAttempted).toBe(true);
    expect(mockSheetsAppend).toHaveBeenCalledTimes(1);
    const call = mockSheetsAppend.mock.calls[0][0];
    expect(call.spreadsheetId).toBe('test-backend-sheet');
    expect(call.range).toBe('Banyan_CostSnapshot!A:K');
    expect(call.valueInputOption).toBe('RAW');
    const row = call.requestBody.values[0];
    expect(row[0]).toBe(snapshot.capturedAt);
    expect(row[1]).toBe(now.toISOString());
    expect(row[2]).toBe(42);
    expect(row[3]).toBe(10);
    expect(row[9]).toBe('usage-for-claude-dashboard');
    expect(JSON.parse(row[10])).toEqual(snapshot);

    const read = readLatestLiveClaudeSnapshot(new Date('2026-05-07T12:00:45.000Z'));
    expect(read).not.toBeNull();
    expect(read?.snapshot).toEqual(snapshot);
    expect(read?.storedAt).toBe(now.toISOString());
    expect(read?.ageSeconds).toBe(15);
  });

  it('returns null after the 5 minute TTL elapses', async () => {
    const storedAt = new Date('2026-05-07T12:00:00.000Z');
    await writeLiveClaudeSnapshot(snapshot, storedAt);

    const justInside = readLatestLiveClaudeSnapshot(new Date('2026-05-07T12:04:59.000Z'));
    expect(justInside).not.toBeNull();

    const justOutside = readLatestLiveClaudeSnapshot(new Date('2026-05-07T12:05:01.000Z'));
    expect(justOutside).toBeNull();
  });

  it('still updates the cache even when sheet append fails', async () => {
    mockSheetsAppend.mockRejectedValueOnce(new Error('quota exceeded'));
    const storedAt = new Date('2026-05-07T12:00:00.000Z');
    const result = await writeLiveClaudeSnapshot(snapshot, storedAt);
    expect(result.sheetPersistAttempted).toBe(true);
    expect(result.storedAt).toBe(storedAt.toISOString());

    const read = readLatestLiveClaudeSnapshot(new Date('2026-05-07T12:00:10.000Z'));
    expect(read?.snapshot).toEqual(snapshot);
  });

  it('blank-encodes optional fields in the sheet row when null', async () => {
    const minimal: LiveClaudeSnapshot = {
      sessionPct: 12,
      weeklyPct: 4,
      opusPct: null,
      extraUsageDollars: null,
      resetSessionAt: null,
      resetWeeklyAt: null,
      sourceApp: 'usage-for-claude-dashboard',
      capturedAt: '2026-05-07T12:01:00.000Z',
    };
    await writeLiveClaudeSnapshot(minimal, new Date('2026-05-07T12:01:30.000Z'));
    const row = mockSheetsAppend.mock.calls[0][0].requestBody.values[0];
    expect(row[4]).toBe('');
    expect(row[5]).toBe('');
    expect(row[6]).toBe('');
    expect(row[7]).toBe('');
    expect(row[8]).toBe('');
  });
});
