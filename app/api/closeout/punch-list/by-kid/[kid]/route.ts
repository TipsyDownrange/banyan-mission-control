/**
 * BAN-328 Closeout Punch List surface v1 — aggregator for the PunchListTab
 * consumer.
 *
 * Resolves an engagement kid (e.g. "PRJ-26-0001") to engagement_id, then
 * reads punch_list_items + engagement metadata in parallel and returns the
 * combined payload in a single round-trip. When the kid does not resolve
 * to a Postgres engagement (most pre-migration Sheets-only projects), the
 * response is shaped with kIDFound:false / empty arrays so the UI can render
 * the not-yet-migrated empty state without a second request.
 *
 *   GET /api/closeout/punch-list/by-kid/[kid]
 *
 * GC formal signoff flag is intentionally NOT surfaced here — see BAN-332
 * for the schema gap on engagements.gc_formal_signoff.
 */

import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db, engagements, punch_list_items } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const EMPTY_BY_STATUS: Record<string, number> = {
  NEW: 0,
  ASSIGNED: 0,
  IN_PROGRESS: 0,
  COMPLETED: 0,
  SIGNED_OFF: 0,
  DISPUTED: 0,
  DEFERRED_TO_WARRANTY: 0,
};

const EMPTY_PAYLOAD = {
  kIDFound: false,
  engagement: null,
  items: [],
  summary: {
    total: 0,
    by_status: { ...EMPTY_BY_STATUS },
    photos_present_count: 0,
  },
} as const;

type PunchItemRow = {
  status: string;
  photo_evidence: string[] | null;
};

function summarize(items: PunchItemRow[]) {
  const by_status: Record<string, number> = { ...EMPTY_BY_STATUS };
  let photos_present_count = 0;
  for (const item of items) {
    if (item.status in by_status) {
      by_status[item.status] += 1;
    }
    if (Array.isArray(item.photo_evidence) && item.photo_evidence.length > 0) {
      photos_present_count += 1;
    }
  }
  return {
    total: items.length,
    by_status,
    photos_present_count,
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
    return NextResponse.json(
      { error: 'kid path param is required' },
      { status: 400 },
    );
  }

  const engagementRow = await db
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

  if (engagementRow.length === 0) {
    return NextResponse.json(EMPTY_PAYLOAD);
  }

  const engagement = engagementRow[0];
  const engagementId = engagement.engagement_id;

  const items = await db
    .select()
    .from(punch_list_items)
    .where(
      and(
        eq(punch_list_items.tenant_id, gate.tenantId),
        eq(punch_list_items.engagement_id, engagementId),
      ),
    )
    .orderBy(asc(punch_list_items.item_number));

  return NextResponse.json({
    kIDFound: true,
    engagement,
    items,
    summary: summarize(items as PunchItemRow[]),
  });
}
