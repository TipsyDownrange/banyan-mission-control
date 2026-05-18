/**
 * BAN-343 PM-V1.0-D — GET /api/meetings/by-kid/[kid]
 *
 * Project-scoped meeting log surface for ProjectsPanel.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, engagements, meetings, meeting_attendees } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const EMPTY_BY_TYPE: Record<string, number> = {
  PROJECT_KICKOFF: 0,
  OAC: 0,
  DESIGN_REVIEW: 0,
  CONSTRUCTION_PROGRESS: 0,
  PRECON: 0,
  PRE_INSTALL: 0,
  PUNCHWALK: 0,
  PROJECT_CLOSEOUT: 0,
  OTHER: 0,
};

const EMPTY_BY_PLATFORM: Record<string, number> = {
  MANUAL: 0,
  READ_AI: 0,
  OTTER_AI: 0,
  FIREFLIES_AI: 0,
  OTHER: 0,
};

type MeetingRowLite = {
  meeting_type: string | null;
  source_platform: string;
  transcript_drive_file_id: string | null;
};

function summarize(items: MeetingRowLite[]) {
  const by_type: Record<string, number> = { ...EMPTY_BY_TYPE };
  const by_platform: Record<string, number> = { ...EMPTY_BY_PLATFORM };
  let with_transcript = 0;
  for (const it of items) {
    if (it.meeting_type && it.meeting_type in by_type) by_type[it.meeting_type] += 1;
    if (it.source_platform in by_platform) by_platform[it.source_platform] += 1;
    if (it.transcript_drive_file_id) with_transcript += 1;
  }
  return { total: items.length, by_type, by_platform, with_transcript };
}

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
      summary: { total: 0, by_type: { ...EMPTY_BY_TYPE }, by_platform: { ...EMPTY_BY_PLATFORM }, with_transcript: 0 },
    });
  }

  const engagement = engagementRows[0];
  const items = await db
    .select()
    .from(meetings)
    .where(
      and(
        eq(meetings.tenant_id, gate.tenantId),
        eq(meetings.engagement_id, engagement.engagement_id),
      ),
    )
    .orderBy(desc(meetings.meeting_date));

  const counts = items.length
    ? await db
        .select({
          meeting_id: meeting_attendees.meeting_id,
          total: sql<number>`count(*)::int`,
          kula: sql<number>`count(*) filter (where ${meeting_attendees.is_kula_user})::int`,
        })
        .from(meeting_attendees)
        .where(eq(meeting_attendees.tenant_id, gate.tenantId))
        .groupBy(meeting_attendees.meeting_id)
    : [];

  const countMap = new Map(counts.map((c) => [c.meeting_id, { total: c.total, kula: c.kula }]));
  const enriched = items.map((m) => ({
    ...m,
    attendee_count_total: countMap.get(m.meeting_id)?.total ?? 0,
    attendee_count_kula: countMap.get(m.meeting_id)?.kula ?? 0,
    attendee_count_external: (countMap.get(m.meeting_id)?.total ?? 0) - (countMap.get(m.meeting_id)?.kula ?? 0),
  }));

  return NextResponse.json({
    kIDFound: true,
    engagement,
    items: enriched,
    summary: summarize(items as unknown as MeetingRowLite[]),
  });
}
