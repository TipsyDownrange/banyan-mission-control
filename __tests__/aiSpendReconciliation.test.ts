/**
 * BAN-319 v2 — Billed To Date aggregator tests.
 */

export {};

const mockGet = jest.fn();

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
        values: { get: mockGet },
      },
    })),
  },
}));

import { readBilledAggregate } from '@/lib/cost/aiSpendReconciliation';

const NOW = new Date('2026-05-18T12:00:00.000Z');

describe('readBilledAggregate', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('returns zeros when both tabs are empty', async () => {
    mockGet.mockResolvedValue({ data: { values: [] } });
    const result = await readBilledAggregate(NOW);
    expect(result.combined.last30d).toBe(0);
    expect(result.combined.thisMonth).toBe(0);
    expect(result.combined.trailing12m).toBe(0);
  });

  it('aggregates receipts by period bucket', async () => {
    mockGet.mockImplementation(({ range }: { range: string }) => {
      if (range.startsWith('Banyan_CostRelayLog')) {
        return Promise.resolve({
          data: {
            values: [
              ['2026-05-15T00:00:00.000Z', '2026-05-15T01:00:00.000Z', 'anthropic', '2026-05-01', '124.55', 'm1', '{}'],
              ['2026-04-15T00:00:00.000Z', '2026-04-15T01:00:00.000Z', 'openai', '2026-04-01', '40.00', 'm2', '{}'],
              ['2025-12-15T00:00:00.000Z', '2025-12-15T01:00:00.000Z', 'anthropic', '2025-12-01', '99.99', 'm3', '{}'],
            ],
          },
        });
      }
      return Promise.resolve({ data: { values: [] } });
    });
    const result = await readBilledAggregate(NOW);
    expect(result.receipts.thisMonth).toBeCloseTo(124.55);
    expect(result.receipts.trailing12m).toBeCloseTo(264.54);
    // 30-day window starts 2026-04-18 → only 2026-05-01 receipt qualifies
    expect(result.receipts.last30d).toBeCloseTo(124.55);
  });

  it('falls back to API spend rollups when no receipts are present', async () => {
    mockGet.mockImplementation(({ range }: { range: string }) => {
      if (range.startsWith('Banyan_AISpend')) {
        return Promise.resolve({
          data: {
            values: [
              ['2026-05-18T11:55:00.000Z', '2026-05-18T11:55:00.000Z', 'anthropic', 'month', '88.40', '{}'],
              ['2026-04-30T23:00:00.000Z', '2026-04-30T23:00:00.000Z', 'anthropic', 'month', '210.00', '{}'],
            ],
          },
        });
      }
      return Promise.resolve({ data: { values: [] } });
    });
    const result = await readBilledAggregate(NOW);
    expect(result.apiSpend.thisMonth).toBeCloseTo(88.40);
    // trailing12m = sum of latest-per-month buckets within window
    expect(result.apiSpend.trailing12m).toBeCloseTo(88.40 + 210.00);
    expect(result.combined.thisMonth).toBeCloseTo(88.40);
  });

  it('tolerates a sheets read failure and returns zeros', async () => {
    mockGet.mockRejectedValue(new Error('sheets down'));
    const result = await readBilledAggregate(NOW);
    expect(result.combined.last30d).toBe(0);
    expect(result.combined.thisMonth).toBe(0);
    expect(result.combined.trailing12m).toBe(0);
  });
});
