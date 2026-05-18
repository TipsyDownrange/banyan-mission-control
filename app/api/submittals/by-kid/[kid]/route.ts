/**
 * BAN-340 PM-V1.0-A — GET /api/submittals/by-kid/[kid]
 *
 * Lists submittals for a project (engagement kID). Returns the resolved
 * engagement metadata and the outstanding-submittals KPI per PM Trunk
 * v1.0 §5.4 alongside the row list. If the kid does not resolve to a
 * Postgres engagement (pre-migration Sheets-only project), responds with
 * kIDFound:false and an empty list so the UI can render an empty state
 * without a second round-trip.
 */

import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db, engagements, submittals } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import {
  isOutstandingSubmittal,
  type SubmittalState,
  type SubmittalType,
} from '@/lib/pm/submittals/state-machine';

const EMPTY_BY_STATUS = {
  REQUIRED: 0,
  IN_PROGRESS: 0,
  SUBMITTED: 0,
  UNDER_REVIEW: 0,
  APPROVED: 0,
  APPROVED_AS_NOTED: 0,
  REVISE_RESUBMIT: 0,
  REJECTED: 0,
  CLOSED: 0,
} as const;

type SubmittalRowLite = {
  status: string;
  submittal_type: string;
  required_by_date: string | null;
};

function summarize(items: SubmittalRowLite[], engagementInCloseout: boolean) {
  const by_status: Record<string, number> = { ...EMPTY_BY_STATUS };
  let outstanding = 0;
  for (const it of items) {
    if (it.status in by_status) by_status[it.status] += 1;
    if (
      isOutstandingSubmittal(
        {
          submittal_type: it.submittal_type as SubmittalType,
          status: it.status as SubmittalState,
          required_by_date: it.required_by_date,
        },
        { engagementInCloseout },
      )
    ) {
      outstanding += 1;
    }
  }
  return {
    total: items.length,
    by_status,
    outstanding,
    engagement_in_closeout: engagementInCloseout,
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
      summary: { total: 0, by_status: { ...EMPTY_BY_STATUS }, outstanding: 0, engagement_in_closeout: false },
    });
  }

  const engagement = engagementRow[0];
  const items = await db
    .select()
    .from(submittals)
    .where(
      and(
        eq(submittals.tenant_id, gate.tenantId),
        eq(submittals.engagement_id, engagement.engagement_id),
      ),
    )
    .orderBy(asc(submittals.required_by_date), asc(submittals.submittal_number));

  // Closeout signal: engagement is considered "in closeout" when its
  // pm_handoff_state moves into closeout territory OR Closeout v1.1
  // project_lifecycle_states latest row is IN_CLOSEOUT/SUBSTANTIALLY_COMPLETE/
  // FINAL_COMPLETE. Cheap heuristic here is pm_handoff_state; the formal
  // lifecycle audit log is BAN-311 scope and remains the source of truth.
  const engagementInCloseout = ['closeout', 'in_closeout', 'substantial_complete', 'final_complete']
    .includes((engagement.pm_handoff_state || '').toLowerCase());

  return NextResponse.json({
    kIDFound: true,
    engagement,
    items,
    summary: summarize(
      items as unknown as SubmittalRowLite[],
      engagementInCloseout,
    ),
  });
}
