import { checkPermissionServer } from '@/lib/permissions';
import { NextRequest, NextResponse } from 'next/server';
import { qboReportFetch } from '@/lib/qbo';

function getDateRange(period: string): { start_date: string; end_date: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  if (period === 'month') {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    return {
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0],
    };
  }
  if (period === 'quarter') {
    const q = Math.floor(m / 3);
    const start = new Date(y, q * 3, 1);
    const end = new Date(y, q * 3 + 3, 0);
    return {
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0],
    };
  }
  // Default: YTD
  return {
    start_date: `${y}-01-01`,
    end_date: now.toISOString().split('T')[0],
  };
}

function extractSections(rows: Record<string, unknown>[]): {
  income: { label: string; amount: number }[];
  expenses: { label: string; amount: number }[];
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
} {
  const income: { label: string; amount: number }[] = [];
  const expenses: { label: string; amount: number }[] = [];
  let totalIncome = 0;
  let totalExpenses = 0;
  let netIncome = 0;
  let section = '';

  for (const row of rows) {
    const type = (row.type as string) || '';
    const cols = (row.ColData as Record<string, string>[]) || [];
    const label = cols[0]?.value || '';
    const amountStr = cols[1]?.value || '0';
    const amount = parseFloat(amountStr.replace(/,/g, '')) || 0;

    if (type === 'Section') {
      section = label.toLowerCase();
    } else if (type === 'Data') {
      if (section.includes('income') || section.includes('revenue')) {
        income.push({ label, amount });
      } else if (section.includes('expense') || section.includes('cost')) {
        expenses.push({ label, amount });
      }
    } else if (type === 'GrandTotal') {
      netIncome = amount;
    } else if (type === 'Total' && label.toLowerCase().includes('income')) {
      totalIncome = amount;
    } else if (type === 'Total' && (label.toLowerCase().includes('expense') || label.toLowerCase().includes('cost'))) {
      totalExpenses = amount;
    }
  }

  return { income, expenses, totalIncome, totalExpenses, netIncome };
}

export async function GET(req: NextRequest) {
  // Permission check — finance:view required
  const { allowed: _fa } = await checkPermissionServer("finance:view");
  if (!_fa) return (await import("next/server")).NextResponse.json({ error: "Forbidden: finance:view required" }, { status: 403 });
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'ytd';
    const { start_date, end_date } = getDateRange(period);

    const res = await qboReportFetch('ProfitAndLoss', { start_date, end_date });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    const rows: Record<string, unknown>[] = [];

    // Flatten report rows
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

    const result = extractSections(rows);
    return NextResponse.json({ period, start_date, end_date, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
