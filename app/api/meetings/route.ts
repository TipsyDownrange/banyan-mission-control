/**
 * BAN-343 PM-V1.0-D — POST /api/meetings + GET /api/meetings (cross-project)
 *
 * POST creates a meeting (optionally bound to an engagement), inserts any
 * attendees passed inline, and emits MEETING_LOGGED in the same transaction.
 *
 * GET is the cross-project list surface (senior PM / admin only).  The
 * per-project list lives at /api/meetings/by-kid/[kid].
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, engagements, meetings, meeting_attendees } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import {
  passMeetingCrossProjectListGate,
  passMeetingWriteGate,
} from '@/lib/pm/meetings/api-gate';
import {
  optionalInteger,
  optionalString,
  optionalStringArray,
  parseAttendeeInput,
  parseMeetingDate,
  parseMeetingSourcePlatform,
  parseMeetingType,
  resolveEngagementByKid,
  resolveUserIdByEmail,
  trimString,
} from '@/lib/pm/meetings/route-utils';
import { TITLE_MAX } from '@/lib/pm/meetings/types';

const ROUTE_PATH = '/api/meetings';

export async function POST(req: Request) {
  const gate = await passMeetingWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = trimString(body.title);
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  if (title.length > TITLE_MAX) {
    return NextResponse.json({ error: `title must be ${TITLE_MAX} characters or fewer` }, { status: 400 });
  }

  const meetingDate = parseMeetingDate(body.meeting_date);
  if (!meetingDate) return NextResponse.json({ error: 'meeting_date is required (ISO timestamp)' }, { status: 400 });

  const meetingType = parseMeetingType(body.meeting_type);
  if (!meetingType) {
    return NextResponse.json({ error: 'meeting_type is required and must be a canonical value' }, { status: 400 });
  }

  const engagementKid = trimString(body.engagement_kid);
  const sourcePlatform = parseMeetingSourcePlatform(body.source_platform);

  const rawAttendees = Array.isArray(body.attendees) ? body.attendees : [];
  const parsedAttendees: ReturnType<typeof parseAttendeeInput>[] = rawAttendees.map(parseAttendeeInput);
  for (const r of parsedAttendees) {
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  }

  const createdByUserId = await resolveUserIdByEmail(gate.actorEmail);
  if (!createdByUserId) {
    return NextResponse.json(
      { error: 'created_by user could not be resolved from session email', code: 'ACTOR_NOT_FOUND' },
      { status: 400 },
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      let engagementId: string | null = null;
      let engagementKidVal: string | null = null;
      let isTestProject = false;
      if (engagementKid) {
        const engagement = await resolveEngagementByKid(gate.tenantId, engagementKid);
        if (!engagement) return { kind: 'engagement_not_found' as const };
        engagementId = engagement.engagement_id;
        engagementKidVal = engagement.kid ?? null;
        isTestProject = engagement.is_test_project === true;
      }

      const inserted = await tx
        .insert(meetings)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagementId,
          title,
          meeting_date: meetingDate,
          duration_minutes: optionalInteger(body.duration_minutes),
          meeting_type: meetingType,
          summary: optionalString(body.summary),
          key_topics: optionalStringArray(body.key_topics),
          decisions_made: optionalStringArray(body.decisions_made),
          transcript_drive_file_id: optionalString(body.transcript_drive_file_id),
          source_recording_url: optionalString(body.source_recording_url),
          source_platform: sourcePlatform,
          source_external_id: optionalString(body.source_external_id),
          external_visible: body.external_visible === true,
          created_by: createdByUserId,
        })
        .returning();

      const meeting = inserted[0];

      let attendeeRows: typeof meeting_attendees.$inferSelect[] = [];
      const attendeeValues: typeof meeting_attendees.$inferInsert[] = [];
      for (const r of parsedAttendees) {
        if (!r.ok) continue;
        attendeeValues.push({
          tenant_id: gate.tenantId,
          meeting_id: meeting.meeting_id,
          name: r.attendee.name,
          email: r.attendee.email,
          organization: r.attendee.organization,
          role: r.attendee.role,
          is_kula_user: r.attendee.is_kula_user,
          kula_user_id: r.attendee.kula_user_id,
          attended: r.attendee.attended,
        });
      }

      if (attendeeValues.length > 0) {
        attendeeRows = await tx.insert(meeting_attendees).values(attendeeValues).returning();
      }

      const kulaCount = attendeeValues.filter((a) => a.is_kula_user).length;
      const externalCount = attendeeValues.length - kulaCount;

      const event = await emitActivitySpineEvent(tx, {
        event_type: 'MEETING_LOGGED',
        scope_entity_type: engagementId ? 'project' : 'internal',
        scope_entity_id: engagementId ?? meeting.meeting_id,
        entity_kind: 'meeting',
        entity_id: meeting.meeting_id,
        kid: engagementKidVal,
        test_data: isTestProject,
        metadata: {
          title,
          meeting_type: meetingType,
          source_platform: sourcePlatform,
          attendee_count: attendeeValues.length,
          attendee_kula_count: kulaCount,
          attendee_external_count: externalCount,
          actor: gate.actorEmail,
        },
      });

      return { kind: 'ok' as const, meeting, attendees: attendeeRows, event_id: event.event_id };
    });

    if (result.kind === 'engagement_not_found') {
      return NextResponse.json({ error: `engagement not found for kid: ${engagementKid}` }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, meeting: result.meeting, attendees: result.attendees, event_id: result.event_id },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const gate = await passMeetingCrossProjectListGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const meetingType = url.searchParams.get('meeting_type');
  const sourcePlatform = url.searchParams.get('source_platform');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);

  const whereParts = [eq(meetings.tenant_id, gate.tenantId)];
  if (meetingType && parseMeetingType(meetingType)) {
    whereParts.push(eq(meetings.meeting_type, parseMeetingType(meetingType)!));
  }
  if (sourcePlatform) {
    const p = parseMeetingSourcePlatform(sourcePlatform);
    whereParts.push(eq(meetings.source_platform, p));
  }

  const items = await db
    .select({
      meeting_id: meetings.meeting_id,
      engagement_id: meetings.engagement_id,
      title: meetings.title,
      meeting_date: meetings.meeting_date,
      duration_minutes: meetings.duration_minutes,
      meeting_type: meetings.meeting_type,
      summary: meetings.summary,
      key_topics: meetings.key_topics,
      decisions_made: meetings.decisions_made,
      transcript_drive_file_id: meetings.transcript_drive_file_id,
      source_recording_url: meetings.source_recording_url,
      source_platform: meetings.source_platform,
      external_visible: meetings.external_visible,
      created_at: meetings.created_at,
      updated_at: meetings.updated_at,
      kid: engagements.kid,
    })
    .from(meetings)
    .leftJoin(engagements, eq(meetings.engagement_id, engagements.engagement_id))
    .where(and(...whereParts))
    .orderBy(desc(meetings.meeting_date))
    .limit(limit);

  const counts = await db
    .select({
      meeting_id: meeting_attendees.meeting_id,
      total: sql<number>`count(*)::int`,
      kula: sql<number>`count(*) filter (where ${meeting_attendees.is_kula_user})::int`,
    })
    .from(meeting_attendees)
    .where(eq(meeting_attendees.tenant_id, gate.tenantId))
    .groupBy(meeting_attendees.meeting_id);

  const countMap = new Map(counts.map((c) => [c.meeting_id, { total: c.total, kula: c.kula }]));
  const enriched = items.map((m) => ({
    ...m,
    attendee_count_total: countMap.get(m.meeting_id)?.total ?? 0,
    attendee_count_kula: countMap.get(m.meeting_id)?.kula ?? 0,
    attendee_count_external: (countMap.get(m.meeting_id)?.total ?? 0) - (countMap.get(m.meeting_id)?.kula ?? 0),
  }));

  return NextResponse.json({ items: enriched, total: enriched.length });
}
