import { NextRequest, NextResponse } from 'next/server';
import { qboFetch } from '@/lib/qbo';

function getBillStatus(bill: Record<string, unknown>): string {
  const balance = Number(bill.Balance ?? 0);
  const total = Number(bill.TotalAmt ?? 0);
  if (balance === 0 && total > 0) return 'paid';
  const dueDate = bill.DueDate as string | undefined;
  if (dueDate && new Date(dueDate) < new Date()) return 'overdue';
  return 'unpaid';
}

export async function GET(req: NextRequest) {
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
      `SELECT * FROM Bill WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' ORDERBY DueDate ASC MAXRESULTS 200`
    );
    const res = await qboFetch(`query?query=${query}`);
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const data = await res.json();
    const bills = (data.QueryResponse?.Bill || []).map((bill: Record<string, unknown>) => {
      const vendor = bill.VendorRef as Record<string, string> | undefined;
      return {
        id: bill.Id,
        vendor: vendor?.name || vendor?.value || '',
        vendorId: vendor?.value || '',
        amount: bill.TotalAmt,
        balance: bill.Balance,
        dueDate: bill.DueDate || null,
        txnDate: bill.TxnDate,
        status: getBillStatus(bill),
      };
    });

    return NextResponse.json({ bills, total: bills.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
