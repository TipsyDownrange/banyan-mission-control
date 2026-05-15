import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { getDefaultTenantId } from '@/lib/env';

// 5-minute server-side in-memory cache
let cache: { data: FamilyRecord[]; ts: number; tenantId: string } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type FamilyRecord = {
  family_id: string;
  kid: string;
  name: string;
  description: string | null;
  gold_data_rollup: boolean;
  display_order: number;
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

  const { db, families } = await import('@/db');

  const condition = includeInactive
    ? eq(families.tenant_id, tenantId)
    : and(eq(families.tenant_id, tenantId), eq(families.is_active, true));

  const rows = await db
    .select({
      family_id: families.family_id,
      kid: families.kid,
      name: families.name,
      description: families.description,
      gold_data_rollup: families.gold_data_rollup,
      display_order: families.display_order,
      status: families.status,
      is_active: families.is_active,
    })
    .from(families)
    .where(condition)
    .orderBy(families.display_order, families.kid);

  const fetchedAt = new Date().toISOString();

  if (!includeInactive) {
    cache = { data: rows, ts: Date.now(), tenantId };
  }

  return NextResponse.json({ data: rows, tenant_id: tenantId, fetched_at: fetchedAt });
}
