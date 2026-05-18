/**
 * BAN-341 PM-V1.0-B — GET /api/rfis/by-kid/[kid]
 *
 * Lists RFIs for a project (engagement kID). Returns the resolved
 * engagement metadata, an overdue KPI per spec §6.5, and a status
 * breakdown alongside the row list. If the kid does not resolve to a
 * Postgres engagement, responds with kIDFound:false and an empty list so
 * the UI can render an empty state without a second round-trip.
 */

import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db, engagements, rfis } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { isOverdueRfi, type RfiState } from '@/lib/pm/rfis/state-machine';

const EMPTY_BY_STATUS = {
  DRAFT: 0,
  SUBMITTED: 0,
  UNDER_REVIEW: 0,
  ANSWERED: 0,
  RESOLVED: 0,
  CLOSED: 0,
  VOID: 0,
} as const;

type RfiRowLite = {
  status: string;
  required_response_by_date: string | null;
};

function summarize(items: RfiRowLite[]) {
  const by_status: Record<string, number> = { ...EMPTY_BY_STATUS };
  let overdue = 0;
  for (const it of items) {
    if (it.status in by_status) by_status[it.status] += 1;
    if (isOverdueRfi({ status: it.status as RfiState, required_response_by_date: it.required_response_by_date })) {
      overdue += 1;
    }
  }
  const openStates = new Set(['SUBMITTED', 'UNDER_REVIEW', 'ANSWERED']);
  const open = items.filter((it) => openStates.has(it.status)).length;
  return {
    total: items.length,
    by_status,
    open,
    overdue,
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ kid: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { kid: rawKid } = await context.params;
  const kid = decodeURIComponent(rawKid).trim();
  if (!kid) {
    return NextResponse.json({ error: 'kid path param is required' }, { status: 400 });
  }

  const engagementRow = await db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
      pm_handoff_state: engagements.pm_handoff_state,
      status: engagements.status,
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

  if (engagementRow.length === 0) {
    return NextResponse.json({
      kIDFound: false,
      engagement: null,
      items: [],
      summary: { total: 0, by_status: { ...EMPTY_BY_STATUS }, open: 0, overdue: 0 },
    });
  }

  const engagement = engagementRow[0];
  const items = await db
    .select()
    .from(rfis)
    .where(
      and(
        eq(rfis.tenant_id, gate.tenantId),
        eq(rfis.engagement_id, engagement.engagement_id),
      ),
    )
    .orderBy(asc(rfis.required_response_by_date), asc(rfis.rfi_number));

  return NextResponse.json({
    kIDFound: true,
    engagement,
    items,
    summary: summarize(items as unknown as RfiRowLite[]),
  });
}
