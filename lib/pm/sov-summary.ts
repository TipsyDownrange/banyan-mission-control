export type SOVLineLike = Record<string, string | number | null | undefined>;

export type SOVSummary = {
  totalContract: number;
  previousBilled: number;
  thisPeriod: number;
  billedToDate: number;
  retainageHeld: number;
  percentComplete: number;
  balanceToFinish: number;
  lineCount: number;
};

export function parseCurrency(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function summarizeSOV(lines: SOVLineLike[]): SOVSummary {
  const totalContract = lines.reduce((sum, line) => sum + parseCurrency(line.scheduled_value), 0);
  const previousBilled = lines.reduce((sum, line) => sum + parseCurrency(line.previous_periods), 0);
  const thisPeriod = lines.reduce((sum, line) => sum + parseCurrency(line.this_period), 0);
  const retainageHeld = lines.reduce((sum, line) => {
    const retainage = parseCurrency(line.retainage_pct);
    const billed = parseCurrency(line.previous_periods) + parseCurrency(line.this_period);
    return sum + (billed * (retainage > 1 ? retainage / 100 : retainage));
  }, 0);
  const billedToDate = previousBilled + thisPeriod;
  return {
    totalContract,
    previousBilled,
    thisPeriod,
    billedToDate,
    retainageHeld,
    percentComplete: totalContract > 0 ? Math.round((billedToDate / totalContract) * 100) : 0,
    balanceToFinish: Math.max(totalContract - billedToDate, 0),
    lineCount: lines.length,
  };
}

export function formatCurrency(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
