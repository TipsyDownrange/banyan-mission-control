import { summarizeSOV } from '@/lib/pm/sov-summary';

describe('BAN-250 project overview SOV summary', () => {
  it('rolls up contract, billed-to-date, retainage, percent complete, and balance', () => {
    const summary = summarizeSOV([
      { scheduled_value: '100,000', previous_periods: '20,000', this_period: '10,000', retainage_pct: '10' },
      { scheduled_value: '50,000', previous_periods: '5,000', this_period: '0', retainage_pct: '5' },
    ]);
    expect(summary.totalContract).toBe(150000);
    expect(summary.billedToDate).toBe(35000);
    expect(summary.retainageHeld).toBe(3250);
    expect(summary.percentComplete).toBe(23);
    expect(summary.balanceToFinish).toBe(115000);
    expect(summary.lineCount).toBe(2);
  });
});
