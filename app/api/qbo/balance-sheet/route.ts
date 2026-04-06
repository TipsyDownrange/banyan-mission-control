import { NextResponse } from 'next/server';
import { qboReportFetch } from '@/lib/qbo';

function extractBalance(
  rows: Record<string, unknown>[],
  labelKeywords: string[]
): number {
  for (const row of rows) {
    const cols = (row.ColData as Record<string, string>[]) || [];
    const label = (cols[0]?.value || '').toLowerCase();
    const amount = parseFloat((cols[1]?.value || '0').replace(/,/g, '')) || 0;
    if (labelKeywords.some(k => label.includes(k))) return amount;
  }
  return 0;
}

export async function GET() {
  try {
    const now = new Date().toISOString().split('T')[0];
    const res = await qboReportFetch('BalanceSheet', { date: now });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    const rows: Record<string, unknown>[] = [];

    function flattenRows(items: unknown[]) {
      for (const item of items) {
        const row = item as Record<string, unknown>;
        const nested = row.Rows as Record<string, unknown> | undefined;
        if (nested?.Row) flattenRows(nested.Row as unknown[]);
        else rows.push(row);
      }
    }

    const reportRows = data.Rows?.Row || [];
    flattenRows(reportRows);

    const totalAssets = extractBalance(rows, ['total assets']);
    const totalLiabilities = extractBalance(rows, ['total liabilities']);
    const totalEquity = extractBalance(rows, ['total equity', "total stockholder", "total owner"]);

    return NextResponse.json({
      asOf: now,
      totalAssets,
      totalLiabilities,
      totalEquity,
      netWorth: totalAssets - totalLiabilities,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
