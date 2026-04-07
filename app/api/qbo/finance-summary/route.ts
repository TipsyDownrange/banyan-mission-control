import { checkPermissionServer } from '@/lib/permissions';
/**
 * Consolidated finance summary for AdminPanel.
 * Returns AR summary, AP summary, P&L snapshot, recent invoices, recent bills.
 * Designed for a single fetch to power the Finance panel.
 */
import { NextResponse } from 'next/server';
import { qboFetch, qboReportFetch } from '@/lib/qbo';

function today() { return new Date().toISOString().split('T')[0]; }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function ytdStart() { return `${new Date().getFullYear()}-01-01`; }

function agingBucket(dueDate: string | null): '0-30' | '31-60' | '61-90' | '90+' | 'current' {
  if (!dueDate) return 'current';
  const diff = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
  if (diff <= 0) return 'current';
  if (diff <= 30) return '0-30';
  if (diff <= 60) return '31-60';
  if (diff <= 90) return '61-90';
  return '90+';
}

function invStatus(inv: Record<string, unknown>): string {
  const balance = Number(inv.Balance ?? 0);
  const total = Number(inv.TotalAmt ?? 0);
  if (balance === 0 && total > 0) return 'paid';
  const due = inv.DueDate as string | undefined;
  if (due && new Date(due) < new Date()) return 'overdue';
  return 'unpaid';
}

function billStatus(bill: Record<string, unknown>): string {
  const balance = Number(bill.Balance ?? 0);
  const total = Number(bill.TotalAmt ?? 0);
  if (balance === 0 && total > 0) return 'paid';
  const due = bill.DueDate as string | undefined;
  if (due && new Date(due) < new Date()) return 'overdue';
  return 'unpaid';
}

export async function GET() {
  // Permission check — finance:view required
  const { allowed: _fa } = await checkPermissionServer("finance:view");
  if (!_fa) return (await import("next/server")).NextResponse.json({ error: "Forbidden: finance:view required" }, { status: 403 });
  try {
    const [invRes, billRes, plRes] = await Promise.all([
      qboFetch(`query?query=${encodeURIComponent(`SELECT * FROM Invoice WHERE TxnDate >= '${daysAgo(90)}' ORDERBY TxnDate DESC MAXRESULTS 200`)}`),
      qboFetch(`query?query=${encodeURIComponent(`SELECT * FROM Bill WHERE TxnDate >= '${daysAgo(90)}' ORDERBY DueDate ASC MAXRESULTS 200`)}`),
      qboReportFetch('ProfitAndLoss', { start_date: ytdStart(), end_date: today() }),
    ]);

    const [invData, billData, plData] = await Promise.all([
      invRes.json(),
      billRes.json(),
      plRes.json(),
    ]);

    // ── AR Processing ────────────────────────────────────────────────────────
    const allInvoices: Record<string, unknown>[] = invData.QueryResponse?.Invoice || [];
    const unpaidInvoices = allInvoices.filter(i => Number(i.Balance ?? 0) > 0);
    const arTotal = unpaidInvoices.reduce((s, i) => s + Number(i.Balance), 0);
    const arOverdue = unpaidInvoices.filter(i => {
      const due = i.DueDate as string | undefined;
      return due && new Date(due) < new Date();
    }).reduce((s, i) => s + Number(i.Balance), 0);

    const aging: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, current: 0 };
    unpaidInvoices.forEach(i => {
      const bucket = agingBucket(i.DueDate as string | null);
      aging[bucket] = (aging[bucket] || 0) + Number(i.Balance ?? 0);
    });

    const recentInvoices = allInvoices.slice(0, 10).map(inv => {
      const ref = inv.CustomerRef as Record<string, string> | undefined;
      return {
        id: inv.Id,
        invoiceNumber: inv.DocNumber,
        customer: ref?.name || '',
        amount: inv.TotalAmt,
        balance: inv.Balance,
        dueDate: inv.DueDate || null,
        txnDate: inv.TxnDate,
        status: invStatus(inv),
      };
    });

    // ── AP Processing ────────────────────────────────────────────────────────
    const allBills: Record<string, unknown>[] = billData.QueryResponse?.Bill || [];
    const unpaidBills = allBills.filter(b => Number(b.Balance ?? 0) > 0);
    const apTotal = unpaidBills.reduce((s, b) => s + Number(b.Balance), 0);

    const sevenDays = new Date(); sevenDays.setDate(sevenDays.getDate() + 7);
    const apUpcoming = unpaidBills.filter(b => {
      const due = b.DueDate as string | undefined;
      return due && new Date(due) <= sevenDays;
    }).reduce((s, b) => s + Number(b.Balance), 0);

    const recentBills = allBills.slice(0, 10).map(bill => {
      const ref = bill.VendorRef as Record<string, string> | undefined;
      return {
        id: bill.Id,
        vendor: ref?.name || '',
        amount: bill.TotalAmt,
        balance: bill.Balance,
        dueDate: bill.DueDate || null,
        txnDate: bill.TxnDate,
        status: billStatus(bill),
      };
    });

    // ── P&L Processing ───────────────────────────────────────────────────────
    const plRows: Record<string, unknown>[] = [];
    function flatten(items: unknown[]) {
      for (const item of items) {
        const row = item as Record<string, unknown>;
        const nested = row.Rows as Record<string, unknown> | undefined;
        if (nested?.Row) flatten(nested.Row as unknown[]);
        else plRows.push(row);
      }
    }
    const plTopRows = (plData.Rows as Record<string, unknown> | undefined)?.Row as unknown[] || [];
    flatten(plTopRows);

    let revenueYtd = 0, expensesYtd = 0, netIncomeYtd = 0;
    for (const row of plRows) {
      const type = (row.type as string) || '';
      const cols = (row.ColData as Record<string, string>[]) || [];
      const label = (cols[0]?.value || '').toLowerCase();
      const amount = parseFloat((cols[1]?.value || '0').replace(/,/g, '')) || 0;
      if (type === 'Total' && label.includes('income')) revenueYtd = amount;
      if (type === 'Total' && (label.includes('expense') || label.includes('cost'))) expensesYtd = amount;
      if (type === 'GrandTotal') netIncomeYtd = amount;
    }

    return NextResponse.json({
      ar: {
        total: arTotal,
        overdue: arOverdue,
        aging,
        count: unpaidInvoices.length,
      },
      ap: {
        total: apTotal,
        upcomingDue: apUpcoming,
        count: unpaidBills.length,
      },
      pl: {
        revenueYtd,
        expensesYtd,
        netIncomeYtd,
        period: `YTD ${new Date().getFullYear()}`,
      },
      recentInvoices,
      recentBills,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
