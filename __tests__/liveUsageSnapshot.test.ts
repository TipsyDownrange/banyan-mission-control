/**
 * BAN-319 — Cost & Usage v2 — liveUsageSnapshot cache + sheet persistence.
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

import type { UsageSnapshot } from '@/lib/cost/types';
import {
  readLatestUsageSnapshot,
  readAllLatestUsage,
  writeUsageSnapshot,
  __resetUsageSnapshotCacheForTests,
} from '@/lib/cost/liveUsageSnapshot';

const anthropicSnapshot: UsageSnapshot = {
  snapshot_type: 'usage',
  provider: 'anthropic',
  currentSession: { percentage: 42, resetsAt: '2026-05-18T15:00:00.000Z' },
  weeklyLimit: { percentage: 10, resetsAt: '2026-05-25T00:00:00.000Z' },
  claudeDesign: { percentage: 3, resetsAt: '2026-05-18T15:00:00.000Z' },
  extraUsage: { usedUsd: 1.25, budgetUsd: 25, resetsAt: '2026-05-25T00:00:00.000Z' },
  fetchedAt: '2026-05-18T12:00:30.000Z',
};

const openaiSnapshot: UsageSnapshot = {
  snapshot_type: 'usage',
  provider: 'openai',
  currentSession: { percentage: 20, resetsAt: null },
  weeklyLimit: { percentage: 5, resetsAt: null },
  fetchedAt: '2026-05-18T12:00:45.000Z',
};

describe('liveUsageSnapshot helper', () => {
  beforeEach(() => {
    __resetUsageSnapshotCacheForTests();
    mockSheetsAppend.mockReset();
    mockSheetsAppend.mockResolvedValue({});
  });

  it('returns null before anything is stored', () => {
    expect(readLatestUsageSnapshot('anthropic')).toBeNull();
    expect(readAllLatestUsage()).toEqual([]);
  });

  it('writes to cache + sheet, keyed by provider', async () => {
    const now = new Date('2026-05-18T12:00:30.000Z');
    const result = await writeUsageSnapshot(anthropicSnapshot, now);
    expect(result.storedAt).toBe(now.toISOString());
    expect(result.sheetPersistAttempted).toBe(true);
    expect(mockSheetsAppend).toHaveBeenCalledTimes(1);
    const call = mockSheetsAppend.mock.calls[0][0];
    expect(call.range).toBe('Banyan_CostSnapshot!A:M');
    const row = call.requestBody.values[0];
    // snapshot_type column
    expect(row[11]).toBe('usage');
    // provider column
    expect(row[12]).toBe('anthropic');

    const cached = readLatestUsageSnapshot('anthropic', new Date('2026-05-18T12:00:45.000Z'));
    expect(cached?.snapshot).toEqual(anthropicSnapshot);
    expect(cached?.ageSeconds).toBe(15);
  });

  it('stores anthropic + openai independently', async () => {
    const now1 = new Date('2026-05-18T12:00:30.000Z');
    const now2 = new Date('2026-05-18T12:00:45.000Z');
    await writeUsageSnapshot(anthropicSnapshot, now1);
    await writeUsageSnapshot(openaiSnapshot, now2);

    expect(readLatestUsageSnapshot('anthropic', new Date('2026-05-18T12:00:50.000Z'))?.snapshot.provider).toBe('anthropic');
    expect(readLatestUsageSnapshot('openai', new Date('2026-05-18T12:00:50.000Z'))?.snapshot.provider).toBe('openai');

    const all = readAllLatestUsage(new Date('2026-05-18T12:00:50.000Z'));
    expect(all).toHaveLength(2);
    const providers = all.map(e => e.snapshot.provider).sort();
    expect(providers).toEqual(['anthropic', 'openai']);
  });

  it('TTL evicts after 5 minutes', async () => {
    const storedAt = new Date('2026-05-18T12:00:00.000Z');
    await writeUsageSnapshot(anthropicSnapshot, storedAt);
    expect(readLatestUsageSnapshot('anthropic', new Date('2026-05-18T12:04:59.000Z'))).not.toBeNull();
    expect(readLatestUsageSnapshot('anthropic', new Date('2026-05-18T12:05:01.000Z'))).toBeNull();
  });

  it('sheet append failure still updates cache', async () => {
    mockSheetsAppend.mockRejectedValueOnce(new Error('quota exceeded'));
    const storedAt = new Date('2026-05-18T12:00:00.000Z');
    const result = await writeUsageSnapshot(anthropicSnapshot, storedAt);
    expect(result.sheetPersistAttempted).toBe(true);
    expect(readLatestUsageSnapshot('anthropic', new Date('2026-05-18T12:00:10.000Z'))?.snapshot).toEqual(anthropicSnapshot);
  });
});
