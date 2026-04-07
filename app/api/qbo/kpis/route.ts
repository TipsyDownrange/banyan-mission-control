import { checkPermissionServer } from '@/lib/permissions';
/**
 * Quick KPI summary for Operations Overview dashboard cards.
 * Returns: revenue this month, AR outstanding, AP outstanding, net income YTD.
 * Lightweight — uses targeted queries, not the full finance-summary.
 */
import { NextResponse } from 'next/server';
import { qboFetch, qboReportFetch } from '@/lib/qbo';

function ytdStart() { return `${new Date().getFullYear()}-01-01`; }
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today() { return new Date().toISOString().split('T')[0]; }

export async function GET() {
  // Permission check — finance:view required
  const { allowed: _fa } = await checkPermissionServer("finance:view");
  if (!_fa) return (await import("next/server")).NextResponse.json({ error: "Forbidden: finance:view required" }, { status: 403 });
  try {
    const [arRes, apRes, plMonthRes, plYtdRes] = await Promise.all([
      // AR: unpaid invoices
      qboFetch(`query?query=${encodeURIComponent("SELECT SUM(Balance) FROM Invoice WHERE Balance > '0'")}`),
      // AP: unpaid bills
      qboFetch(`query?query=${encodeURIComponent("SELECT SUM(Balance) FROM Bill WHERE Balance > '0'")}`),
      // P&L this month
      qboReportFetch('ProfitAndLoss', { start_date: monthStart(), end_date: today() }),
      // P&L YTD
      qboReportFetch('ProfitAndLoss', { start_date: ytdStart(), end_date: today() }),
    ]);

    const [arData, apData, plMonthData, plYtdData] = await Promise.all([
      arRes.json(),
      apRes.json(),
      plMonthRes.json(),
      plYtdRes.json(),
    ]);

    const arOutstanding = parseFloat(arData.QueryResponse?.Invoice?.[0]?.['Balance:sum'] ?? 0) || 0;
    const apOutstanding = parseFloat(apData.QueryResponse?.Bill?.[0]?.['Balance:sum'] ?? 0) || 0;

    function extractNetIncome(plData: Record<string, unknown>): number {
      const rows: Record<string, unknown>[] = [];
      function flatten(items: unknown[]) {
        for (const item of items) {
          const row = item as Record<string, unknown>;
          const nested = row.Rows as Record<string, unknown> | undefined;
          if (nested?.Row) flatten(nested.Row as unknown[]);
          else rows.push(row);
        }
      }
      const topRows = (plData.Rows as Record<string, unknown> | undefined)?.Row as unknown[] || [];
      flatten(topRows);
      for (const row of rows) {
        if ((row.type as string) === 'GrandTotal') {
          const cols = (row.ColData as Record<string, string>[]) || [];
          return parseFloat((cols[1]?.value || '0').replace(/,/g, '')) || 0;
        }
      }
      return 0;
    }

    function extractRevenue(plData: Record<string, unknown>): number {
      const rows: Record<string, unknown>[] = [];
      function flatten(items: unknown[]) {
        for (const item of items) {
          const row = item as Record<string, unknown>;
          const nested = row.Rows as Record<string, unknown> | undefined;
          if (nested?.Row) flatten(nested.Row as unknown[]);
          else rows.push(row);
        }
      }
      const topRows = (plData.Rows as Record<string, unknown> | undefined)?.Row as unknown[] || [];
      flatten(topRows);
      for (const row of rows) {
        if ((row.type as string) === 'Total') {
          const cols = (row.ColData as Record<string, string>[]) || [];
          const label = (cols[0]?.value || '').toLowerCase();
          if (label.includes('income') || label.includes('revenue')) {
            return parseFloat((cols[1]?.value || '0').replace(/,/g, '')) || 0;
          }
        }
      }
      return 0;
    }

    return NextResponse.json({
      revenueThisMonth: extractRevenue(plMonthData),
      netIncomeYtd: extractNetIncome(plYtdData),
      arOutstanding,
      apOutstanding,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
