/**
 * GET /api/business-settings/all
 * Packet 002.5 — Business Settings Registry v1 (read-only)
 * Returns all settings for the default tenant, active only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { getDefaultTenantId } from '@/lib/env';

let cache: { data: unknown[]; ts: number; tenantId: string } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = getDefaultTenantId();

  if (cache && cache.tenantId === tenantId && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ data: cache.data, tenant_id: tenantId, fetched_at: new Date(cache.ts).toISOString() });
  }

  const { db, business_settings } = await import('@/db');

  const rows = await db
    .select({
      setting_id: business_settings.setting_id,
      kid: business_settings.kid,
      setting_key: business_settings.setting_key,
      setting_value: business_settings.setting_value,
      value_type: business_settings.value_type,
      description: business_settings.description,
      status: business_settings.status,
      is_active: business_settings.is_active,
    })
    .from(business_settings)
    .where(and(eq(business_settings.tenant_id, tenantId), eq(business_settings.is_active, true)))
    .orderBy(business_settings.setting_key);

  const fetchedAt = new Date().toISOString();
  cache = { data: rows, ts: Date.now(), tenantId };

  return NextResponse.json({ data: rows, tenant_id: tenantId, fetched_at: fetchedAt });
}
