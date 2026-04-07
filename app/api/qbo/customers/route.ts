import { checkPermissionServer } from '@/lib/permissions';
import { NextResponse } from 'next/server';
import { qboFetch } from '@/lib/qbo';
import { fireAndForgetCustomerUpdate } from '@/lib/updateCustomerRecord';

export async function GET() {
  // Permission check — finance:view required
  const { allowed: _fa } = await checkPermissionServer("finance:view");
  if (!_fa) return (await import("next/server")).NextResponse.json({ error: "Forbidden: finance:view required" }, { status: 403 });
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
    // Wire QBO customers into the Customer DB (merge/upsert) — non-blocking
    for (const c of customers) {
      fireAndForgetCustomerUpdate({
        name:  String(c.name || ''),
        email: c.email || '',
        phone: c.phone || '',
        source: 'qbo',
      });
    }

    return NextResponse.json({ customers, total: customers.length, synced: customers.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
