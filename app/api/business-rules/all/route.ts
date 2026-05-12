/**
 * GET /api/business-rules/all?include_inactive=false
 * Packet 002.5 — Business Rules Registry v1 (read-only)
 * Returns all rules for the default tenant, active only unless include_inactive=true.
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

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get('include_inactive') === 'true';
  const tenantId = getDefaultTenantId();

  if (!includeInactive && cache && cache.tenantId === tenantId && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ data: cache.data, tenant_id: tenantId, fetched_at: new Date(cache.ts).toISOString() });
  }

  const { db, business_rules } = await import('@/db');

  const condition = includeInactive
    ? eq(business_rules.tenant_id, tenantId)
    : and(eq(business_rules.tenant_id, tenantId), eq(business_rules.is_active, true));

  const rows = await db
    .select({
      rule_id: business_rules.rule_id,
      kid: business_rules.kid,
      rule_key: business_rules.rule_key,
      rule_value: business_rules.rule_value,
      value_type: business_rules.value_type,
      description: business_rules.description,
      effective_start: business_rules.effective_start,
      effective_end: business_rules.effective_end,
      status: business_rules.status,
      is_active: business_rules.is_active,
    })
    .from(business_rules)
    .where(condition)
    .orderBy(business_rules.rule_key, business_rules.effective_start);

  const fetchedAt = new Date().toISOString();

  if (!includeInactive) {
    cache = { data: rows, ts: Date.now(), tenantId };
  }

  return NextResponse.json({ data: rows, tenant_id: tenantId, fetched_at: fetchedAt });
}
