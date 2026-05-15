import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { getDefaultTenantId } from '@/lib/env';

// 5-minute server-side in-memory cache (keyed by tenantId+familyId)
const cacheMap = new Map<string, { data: SystemTypeRecord[]; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export type SystemTypeRecord = {
  system_type_id: string;
  kid: string;
  family_id: string;
  family_kid: string | null;
  name: string;
  description: string | null;
  common_aliases: string[];
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
  const familyIdFilter = searchParams.get('family_id') || null;
  const includeInactive = searchParams.get('include_inactive') === 'true';
  const tenantId = getDefaultTenantId();

  const cacheKey = `${tenantId}:${familyIdFilter ?? ''}`;
  const cached = cacheMap.get(cacheKey);
  if (cached && !includeInactive && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({ data: cached.data, tenant_id: tenantId, fetched_at: new Date(cached.ts).toISOString() });
  }

  const { db, system_types, families } = await import('@/db');

  const conditions = [eq(system_types.tenant_id, tenantId)];
  if (!includeInactive) conditions.push(eq(system_types.is_active, true));
  if (familyIdFilter) conditions.push(eq(system_types.family_id, familyIdFilter));

  const rows = await db
    .select({
      system_type_id: system_types.system_type_id,
      kid: system_types.kid,
      family_id: system_types.family_id,
      family_kid: families.kid,
      name: system_types.name,
      description: system_types.description,
      common_aliases: system_types.common_aliases,
      notes: system_types.notes,
      status: system_types.status,
      is_active: system_types.is_active,
    })
    .from(system_types)
    .leftJoin(families, eq(system_types.family_id, families.family_id))
    .where(and(...conditions))
    .orderBy(system_types.kid);

  const fetchedAt = new Date().toISOString();

  if (!includeInactive) {
    cacheMap.set(cacheKey, { data: rows, ts: Date.now() });
  }

  return NextResponse.json({ data: rows, tenant_id: tenantId, fetched_at: fetchedAt });
}
