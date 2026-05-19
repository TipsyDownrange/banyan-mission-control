/**
 * BAN-346 PM-V1.0-G — GET /api/handoff-receipts/by-engagement/[engagement_id]
 *
 * Project-scoped lookup by engagement_id (uuid).  Mirrors by-kid but useful
 * for callers that already have the uuid handy.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, pm_handoff_receipts } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { isUuid, resolveEngagementById } from '@/lib/pm/handoff-receipts/route-utils';
import { PM_HANDOFF_OPEN_STATES } from '@/lib/pm/handoff-receipts/types';

export async function GET(
  req: Request,
  context: { params: Promise<{ engagement_id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { engagement_id: rawId } = await context.params;
  const engagementId = decodeURIComponent(rawId).trim();
  if (!isUuid(engagementId)) {
    return NextResponse.json({ error: 'engagement_id must be a uuid' }, { status: 400 });
  }

  const engagement = await resolveEngagementById(gate.tenantId, engagementId);
  if (!engagement) {
    return NextResponse.json({
      engagementFound: false,
      engagement: null,
      items: [],
      summary: { total: 0, open_count: 0, current: null },
    });
  }

  const items = await db
    .select()
    .from(pm_handoff_receipts)
    .where(
      and(
        eq(pm_handoff_receipts.tenant_id, gate.tenantId),
        eq(pm_handoff_receipts.engagement_id, engagementId),
      ),
    )
    .orderBy(desc(pm_handoff_receipts.submitted_at));

  const openStates = new Set<string>(PM_HANDOFF_OPEN_STATES);
  const open_count = items.filter((r) => openStates.has(r.state)).length;

  return NextResponse.json({
    engagementFound: true,
    engagement,
    items,
    summary: {
      total: items.length,
      open_count,
      current: items[0] ?? null,
    },
  });
}
