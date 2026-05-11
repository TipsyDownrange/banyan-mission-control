import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { getDefaultTenantId } from '@/lib/env';

let cache: { data: WorkTypeRecord[]; ts: number; tenantId: string } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type WorkTypeRecord = {
  work_type_id: string;
  kid: string;
  name: string;
  description: string | null;
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

  const { db, work_types } = await import('@/db');

  const condition = includeInactive
    ? eq(work_types.tenant_id, tenantId)
    : and(eq(work_types.tenant_id, tenantId), eq(work_types.is_active, true));

  const rows = await db
    .select({
      work_type_id: work_types.work_type_id,
      kid: work_types.kid,
      name: work_types.name,
      description: work_types.description,
      status: work_types.status,
      is_active: work_types.is_active,
    })
    .from(work_types)
    .where(condition)
    .orderBy(work_types.kid);

  const fetchedAt = new Date().toISOString();

  if (!includeInactive) {
    cache = { data: rows, ts: Date.now(), tenantId };
  }

  return NextResponse.json({ data: rows, tenant_id: tenantId, fetched_at: fetchedAt });
}
