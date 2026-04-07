import { checkPermissionServer } from '@/lib/permissions';
import { NextResponse } from 'next/server';
import { qboFetch } from '@/lib/qbo';

export async function GET() {
  // Permission check — finance:view required
  const { allowed: _fa } = await checkPermissionServer("finance:view");
  if (!_fa) return (await import("next/server")).NextResponse.json({ error: "Forbidden: finance:view required" }, { status: 403 });
  try {
    // Fetch all customers with balances (jobs)
    const invQuery = encodeURIComponent(
      "SELECT * FROM Invoice WHERE Balance > '0' MAXRESULTS 1000"
    );
    const [invRes, billRes] = await Promise.all([
      qboFetch(`query?query=${invQuery}`),
      qboFetch(`query?query=${encodeURIComponent("SELECT * FROM Bill MAXRESULTS 1000")}`),
    ]);

    const [invData, billData] = await Promise.all([
      invRes.json(),
      billRes.json(),
    ]);

    const invoices: Record<string, unknown>[] = invData.QueryResponse?.Invoice || [];
    const bills: Record<string, unknown>[] = billData.QueryResponse?.Bill || [];

    // Aggregate invoiced by customer
    const invoicedByCustomer: Record<string, { name: string; invoiced: number }> = {};
    for (const inv of invoices) {
      const ref = inv.CustomerRef as Record<string, string> | undefined;
      const id = ref?.value || 'unknown';
      const name = ref?.name || 'Unknown';
      if (!invoicedByCustomer[id]) invoicedByCustomer[id] = { name, invoiced: 0 };
      invoicedByCustomer[id].invoiced += Number(inv.TotalAmt ?? 0);
    }

    // Aggregate costs by customer (from bill lines with customer/job ref)
    const costsByCustomer: Record<string, number> = {};
    for (const bill of bills) {
      const lines = (bill.Line as Record<string, unknown>[]) || [];
      for (const line of lines) {
        const detail = line.AccountBasedExpenseLineDetail as Record<string, unknown> | undefined;
        const ref = detail?.CustomerRef as Record<string, string> | undefined;
        if (ref?.value) {
          if (!costsByCustomer[ref.value]) costsByCustomer[ref.value] = 0;
          costsByCustomer[ref.value] += Number(line.Amount ?? 0);
        }
      }
    }

    const jobs = Object.entries(invoicedByCustomer).map(([id, { name, invoiced }]) => {
      const costs = costsByCustomer[id] || 0;
      const profit = invoiced - costs;
      const margin = invoiced > 0 ? Math.round((profit / invoiced) * 100) : 0;
      return { customerId: id, customerName: name, totalInvoiced: invoiced, totalCosts: costs, profit, marginPct: margin };
    });

    // Sort by invoiced desc
    jobs.sort((a, b) => b.totalInvoiced - a.totalInvoiced);

    return NextResponse.json({ jobs, total: jobs.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
