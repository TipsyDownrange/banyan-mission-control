import { NextResponse } from 'next/server';
import { qboFetch } from '@/lib/qbo';

export async function GET() {
  try {
    // QBO query: all active customers
    const query = encodeURIComponent("SELECT * FROM Customer WHERE Active = true MAXRESULTS 1000");
    const res = await qboFetch(`query?query=${query}`);
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const data = await res.json();
    const customers = (data.QueryResponse?.Customer || []).map((c: Record<string, unknown>) => {
      const primary = c.PrimaryEmailAddr as Record<string, string> | undefined;
      const phone = c.PrimaryPhone as Record<string, string> | undefined;
      return {
        id: c.Id,
        name: c.DisplayName || c.CompanyName,
        balance: c.Balance ?? 0,
        email: primary?.Address || '',
        phone: phone?.FreeFormNumber || '',
        active: c.Active,
      };
    });
    return NextResponse.json({ customers, total: customers.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
