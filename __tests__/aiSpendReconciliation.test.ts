/**
 * BAN-319 — Cost & Usage v2 — Banyan_AISpend aggregation correctness.
 */

import { aggregateBilled } from '@/lib/cost/aiSpendReconciliation';

const NOW = new Date('2026-05-18T12:00:00.000Z');

describe('aggregateBilled', () => {
  it('returns zeros when input is empty', () => {
    const result = aggregateBilled([], NOW);
    expect(result.last30d).toBe(0);
    expect(result.thisMonth).toBe(0);
    expect(result.trailing12mo).toBe(0);
    expect(result.asOf).toBe(NOW.toISOString());
  });

  it('sums rows within last 30 days', () => {
    const rows = [
      { date: '2026-05-15', provider: 'Anthropic', plan: 'Max', amountUsd: 200 },
      { date: '2026-04-20', provider: 'OpenAI', plan: 'ChatGPT Pro', amountUsd: 20 },
      { date: '2026-03-01', provider: 'Anthropic', plan: 'Max', amountUsd: 200 }, // outside 30d
    ];
    const result = aggregateBilled(rows, NOW);
    expect(result.last30d).toBe(220);
  });

  it('thisMonth filters to current calendar month UTC', () => {
    const rows = [
      { date: '2026-05-01', provider: 'A', plan: 'p', amountUsd: 100 },
      { date: '2026-05-18', provider: 'A', plan: 'p', amountUsd: 50 },
      { date: '2026-04-30', provider: 'A', plan: 'p', amountUsd: 75 },
    ];
    const result = aggregateBilled(rows, NOW);
    expect(result.thisMonth).toBe(150);
  });

  it('trailing12mo sums everything in the last year', () => {
    const rows = [
      { date: '2026-05-01', provider: 'A', plan: 'p', amountUsd: 200 },
      { date: '2025-09-15', provider: 'A', plan: 'p', amountUsd: 200 },
      { date: '2025-05-01', provider: 'A', plan: 'p', amountUsd: 200 }, // ~12mo, edge
      { date: '2024-01-01', provider: 'A', plan: 'p', amountUsd: 999 }, // outside 12mo
    ];
    const result = aggregateBilled(rows, NOW);
    expect(result.trailing12mo).toBeGreaterThanOrEqual(400);
    expect(result.trailing12mo).toBeLessThan(999);
  });

  it('ignores rows with unparseable dates', () => {
    const rows = [
      { date: 'not-a-date', provider: 'A', plan: 'p', amountUsd: 100 },
      { date: '2026-05-15', provider: 'A', plan: 'p', amountUsd: 50 },
    ];
    const result = aggregateBilled(rows, NOW);
    expect(result.last30d).toBe(50);
  });

  it('rounds to 2 decimals', () => {
    const rows = [
      { date: '2026-05-15', provider: 'A', plan: 'p', amountUsd: 1.005 },
      { date: '2026-05-16', provider: 'A', plan: 'p', amountUsd: 2.004 },
    ];
    const result = aggregateBilled(rows, NOW);
    expect(result.last30d).toBeCloseTo(3.01, 2);
  });

  it('skips future-dated rows from windows', () => {
    const rows = [
      { date: '2027-01-01', provider: 'A', plan: 'p', amountUsd: 999 },
      { date: '2026-05-10', provider: 'A', plan: 'p', amountUsd: 50 },
    ];
    const result = aggregateBilled(rows, NOW);
    expect(result.last30d).toBe(50);
    expect(result.trailing12mo).toBe(50);
  });
});
