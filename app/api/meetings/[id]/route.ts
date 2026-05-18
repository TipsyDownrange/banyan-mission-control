/**
 * BAN-343 PM-V1.0-D — GET/PATCH /api/meetings/[id]
 *
 * GET returns full meeting metadata + attendees.
 * PATCH applies allowed-field updates and conditionally emits
 * MEETING_SUMMARY_UPDATED if summary/key_topics/decisions_made changed.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, meetings, meeting_attendees } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { passMeetingWriteGate } from '@/lib/pm/meetings/api-gate';
import {
  getMeetingForTenant,
  optionalInteger,
  optionalString,
  optionalStringArray,
  parseMeetingDate,
  parseMeetingType,
  patchTouchesSummary,
  resolveUserIdByEmail,
} from '@/lib/pm/meetings/route-utils';
import { TITLE_MAX } from '@/lib/pm/meetings/types';

const ROUTE_PATH = '/api/meetings/[id]';

const PATCH_ALLOWED_FIELDS = new Set<string>([
  'title',
  'meeting_date',
  'duration_minutes',
  'meeting_type',
  'summary',
  'key_topics',
  'decisions_made',
  'transcript_drive_file_id',
  'source_recording_url',
  'external_visible',
]);

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const meeting = await getMeetingForTenant(gate.tenantId, id);
  if (!meeting) return NextResponse.json({ error: 'meeting not found' }, { status: 404 });

  const attendees = await db
    .select()
    .from(meeting_attendees)
    .where(
      and(
        eq(meeting_attendees.tenant_id, gate.tenantId),
        eq(meeting_attendees.meeting_id, id),
      ),
    );

  return NextResponse.json({ meeting, attendees });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passMeetingWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const existing = await getMeetingForTenant(gate.tenantId, id);
  if (!existing) return NextResponse.json({ error: 'meeting not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!PATCH_ALLOWED_FIELDS.has(k)) continue;
    if (k === 'title') {
      const title = optionalString(v);
      if (!title) return NextResponse.json({ error: 'title cannot be blank' }, { status: 400 });
      if (title.length > TITLE_MAX) {
        return NextResponse.json({ error: `title must be ${TITLE_MAX} characters or fewer` }, { status: 400 });
      }
      updates.title = title;
    } else if (k === 'meeting_date') {
      const d = parseMeetingDate(v);
      if (!d) return NextResponse.json({ error: 'meeting_date must be an ISO timestamp' }, { status: 400 });
      updates.meeting_date = d;
    } else if (k === 'duration_minutes') {
      updates.duration_minutes = optionalInteger(v);
    } else if (k === 'meeting_type') {
      const t = parseMeetingType(v);
      if (!t) return NextResponse.json({ error: 'meeting_type must be a canonical value' }, { status: 400 });
      updates.meeting_type = t;
    } else if (k === 'key_topics' || k === 'decisions_made') {
      updates[k] = optionalStringArray(v);
    } else if (k === 'external_visible') {
      updates.external_visible = v === true;
    } else {
      updates[k] = optionalString(v);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No allowed fields provided in PATCH body' }, { status: 400 });
  }

  const updatedByUserId = await resolveUserIdByEmail(gate.actorEmail);
  updates.updated_at = new Date();
  updates.updated_by = updatedByUserId;

  const emitSummaryEvent = patchTouchesSummary(updates);

  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(meetings)
      .set(updates)
      .where(
        and(
          eq(meetings.meeting_id, id),
          eq(meetings.tenant_id, gate.tenantId),
        ),
      )
      .returning();

    let event_id: string | null = null;
    if (emitSummaryEvent) {
      const event = await emitActivitySpineEvent(tx, {
        event_type: 'MEETING_SUMMARY_UPDATED',
        scope_entity_type: existing.engagement_id ? 'project' : 'internal',
        scope_entity_id: existing.engagement_id ?? existing.meeting_id,
        entity_kind: 'meeting',
        entity_id: existing.meeting_id,
        kid: existing.kid ?? null,
        test_data: existing.is_test_project === true,
        metadata: {
          title: existing.title,
          touched_fields: Object.keys(updates).filter((k) => k === 'summary' || k === 'key_topics' || k === 'decisions_made'),
          actor: gate.actorEmail,
        },
      });
      event_id = event.event_id;
    }

    return { meeting: updated[0], event_id };
  });

  return NextResponse.json({ ok: true, ...result });
}
