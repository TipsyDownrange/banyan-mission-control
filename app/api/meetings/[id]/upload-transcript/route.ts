/**
 * BAN-343 PM-V1.0-D — POST /api/meetings/[id]/upload-transcript
 *
 * Records a Drive file ID for the meeting transcript.  v1.0 does not handle
 * Drive uploads server-side; PMs upload to Drive separately and supply the
 * file ID here.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, meetings } from '@/db';
import { passMeetingWriteGate } from '@/lib/pm/meetings/api-gate';
import {
  getMeetingForTenant,
  resolveUserIdByEmail,
  trimString,
} from '@/lib/pm/meetings/route-utils';

const ROUTE_PATH = '/api/meetings/[id]/upload-transcript';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passMeetingWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const meeting = await getMeetingForTenant(gate.tenantId, id);
  if (!meeting) return NextResponse.json({ error: 'meeting not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const driveId = trimString(body.transcript_drive_file_id);
  if (!driveId) return NextResponse.json({ error: 'transcript_drive_file_id is required' }, { status: 400 });

  const updatedByUserId = await resolveUserIdByEmail(gate.actorEmail);
  const updated = await db
    .update(meetings)
    .set({
      transcript_drive_file_id: driveId,
      updated_at: new Date(),
      updated_by: updatedByUserId,
    })
    .where(
      and(
        eq(meetings.meeting_id, id),
        eq(meetings.tenant_id, gate.tenantId),
      ),
    )
    .returning();

  return NextResponse.json({ ok: true, meeting: updated[0] });
}
