import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { getDefaultTenantId } from '@/lib/env';

let cache: { data: ManufacturerRecord[]; ts: number; tenantId: string } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type ManufacturerRecord = {
  manufacturer_id: string;
  kid: string;
  name: string;
  primary_trade_role: string | null;
  notes: string | null;
  status: string;
  is_active: boolean;
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get('include_inactive') === 'true';
  const tenantId = getDefaultTenantId();

  if (cache && cache.tenantId === tenantId && !includeInactive && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ data: cache.data, tenant_id: tenantId, fetched_at: new Date(cache.ts).toISOString() });
  }

  const { db, manufacturers } = await import('@/db');

  const condition = includeInactive
    ? eq(manufacturers.tenant_id, tenantId)
    : and(eq(manufacturers.tenant_id, tenantId), eq(manufacturers.is_active, true));

  const rows = await db
    .select({
      manufacturer_id: manufacturers.manufacturer_id,
      kid: manufacturers.kid,
      name: manufacturers.name,
      primary_trade_role: manufacturers.primary_trade_role,
      notes: manufacturers.notes,
      status: manufacturers.status,
      is_active: manufacturers.is_active,
    })
    .from(manufacturers)
    .where(condition)
    .orderBy(manufacturers.kid);

  const fetchedAt = new Date().toISOString();

  if (!includeInactive) {
    cache = { data: rows, ts: Date.now(), tenantId };
  }

  return NextResponse.json({ data: rows, tenant_id: tenantId, fetched_at: fetchedAt });
}
