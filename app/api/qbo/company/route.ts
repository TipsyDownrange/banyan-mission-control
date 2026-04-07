import { checkPermissionServer } from '@/lib/permissions';
import { NextResponse } from 'next/server';
import { qboFetch } from '@/lib/qbo';

export async function GET() {
  // Permission check — finance:view required
  const { allowed: _fa } = await checkPermissionServer("finance:view");
  if (!_fa) return (await import("next/server")).NextResponse.json({ error: "Forbidden: finance:view required" }, { status: 403 });
  try {
    const res = await qboFetch('companyinfo/' + process.env.QBO_REALM_ID);
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const data = await res.json();
    const info = data.CompanyInfo || {};
    return NextResponse.json({
      id: info.Id,
      name: info.CompanyName,
      legalName: info.LegalName,
      email: info.Email?.Address,
      phone: info.PrimaryPhone?.FreeFormNumber,
      address: info.CompanyAddr,
      country: info.Country,
      fiscalYearStart: info.FiscalYearStartMonth,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
