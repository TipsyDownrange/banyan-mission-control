import { checkPermissionServer } from '@/lib/permissions';
import { NextRequest, NextResponse } from 'next/server';
import { qboFetch } from '@/lib/qbo';

function getStatus(inv: Record<string, unknown>): string {
  const balance = Number(inv.Balance ?? 0);
  const total = Number(inv.TotalAmt ?? 0);
  if (balance === 0 && total > 0) return 'paid';
  const dueDate = inv.DueDate as string | undefined;
  if (dueDate && new Date(dueDate) < new Date()) return 'overdue';
  return 'unpaid';
}

export async function GET(req: NextRequest) {
  // Permission check — finance:view required
  const { allowed: _fa } = await checkPermissionServer("finance:view");
  if (!_fa) return (await import("next/server")).NextResponse.json({ error: "Forbidden: finance:view required" }, { status: 403 });
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '90');
    const startDate = searchParams.get('start') || (() => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d.toISOString().split('T')[0];
    })();
    const endDate = searchParams.get('end') || new Date().toISOString().split('T')[0];

    const query = encodeURIComponent(
      `SELECT * FROM Invoice WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' ORDERBY TxnDate DESC MAXRESULTS 200`
    );
    const res = await qboFetch(`query?query=${query}`);
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const data = await res.json();
    const invoices = (data.QueryResponse?.Invoice || []).map((inv: Record<string, unknown>) => {
      const customer = inv.CustomerRef as Record<string, string> | undefined;
      return {
        id: inv.Id,
        invoiceNumber: inv.DocNumber,
        customer: customer?.name || customer?.value || '',
        customerId: customer?.value || '',
        amount: inv.TotalAmt,
        balance: inv.Balance,
        dueDate: inv.DueDate || null,
        txnDate: inv.TxnDate,
        status: getStatus(inv),
      };
    });

    return NextResponse.json({ invoices, total: invoices.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
