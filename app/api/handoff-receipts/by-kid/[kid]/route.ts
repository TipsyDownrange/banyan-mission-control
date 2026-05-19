/**
 * BAN-346 PM-V1.0-G — GET /api/handoff-receipts/by-kid/[kid]
 *
 * Project-scoped handoff receipt list for the ProjectsPanel Handoff tab.
 * Returns all receipts for the engagement (typically one, but a re-handoff
 * could create multiple).  Returns kIDFound: false if the engagement is
 * not yet migrated to Postgres so the UI can render a graceful empty state.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, engagements, pm_handoff_receipts } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { PM_HANDOFF_OPEN_STATES } from '@/lib/pm/handoff-receipts/types';

export async function GET(
  req: Request,
  context: { params: Promise<{ kid: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { kid: rawKid } = await context.params;
  const kid = decodeURIComponent(rawKid).trim();
  if (!kid) return NextResponse.json({ error: 'kid path param is required' }, { status: 400 });

  const engagementRows = await db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
      is_test_project: engagements.is_test_project,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenant_id, gate.tenantId),
        eq(engagements.kid, kid),
      ),
    )
    .limit(1);

  if (engagementRows.length === 0) {
    return NextResponse.json({
      kIDFound: false,
      engagement: null,
      items: [],
      summary: { total: 0, open_count: 0, current: null },
    });
  }

  const engagement = engagementRows[0];

  const items = await db
    .select()
    .from(pm_handoff_receipts)
    .where(
      and(
        eq(pm_handoff_receipts.tenant_id, gate.tenantId),
        eq(pm_handoff_receipts.engagement_id, engagement.engagement_id),
      ),
    )
    .orderBy(desc(pm_handoff_receipts.submitted_at));

  const openStates = new Set<string>(PM_HANDOFF_OPEN_STATES);
  const open_count = items.filter((r) => openStates.has(r.state)).length;

  return NextResponse.json({
    kIDFound: true,
    engagement,
    items,
    summary: {
      total: items.length,
      open_count,
      current: items[0] ?? null,
    },
  });
}
