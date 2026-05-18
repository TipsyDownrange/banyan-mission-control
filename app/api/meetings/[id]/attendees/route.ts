/**
 * BAN-343 PM-V1.0-D — POST /api/meetings/[id]/attendees
 *
 * Appends an attendee to an existing meeting.  Kula vs external is enforced
 * via the meeting_attendees_kula_user_consistency CHECK at the DB layer.
 */

import { NextResponse } from 'next/server';
import { db, meeting_attendees } from '@/db';
import { passMeetingWriteGate } from '@/lib/pm/meetings/api-gate';
import { getMeetingForTenant, parseAttendeeInput } from '@/lib/pm/meetings/route-utils';

const ROUTE_PATH = '/api/meetings/[id]/attendees';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passMeetingWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const meeting = await getMeetingForTenant(gate.tenantId, id);
  if (!meeting) return NextResponse.json({ error: 'meeting not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseAttendeeInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const inserted = await db
    .insert(meeting_attendees)
    .values({
      tenant_id: gate.tenantId,
      meeting_id: meeting.meeting_id,
      name: parsed.attendee.name,
      email: parsed.attendee.email,
      organization: parsed.attendee.organization,
      role: parsed.attendee.role,
      is_kula_user: parsed.attendee.is_kula_user,
      kula_user_id: parsed.attendee.kula_user_id,
      attended: parsed.attendee.attended,
    })
    .returning();

  return NextResponse.json({ ok: true, attendee: inserted[0] }, { status: 201 });
}
