/**
 * BAN-343 PM-V1.0-D — PATCH/DELETE /api/meetings/[id]/attendees/[attendee_id]
 *
 * PATCH lets a PM correct an attendee record (mark attended=false, fix
 * contact info, etc.).  DELETE removes an attendee row (no soft-delete in
 * v1.0 — attendee history is preserved through the Activity Spine event).
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, meeting_attendees } from '@/db';
import { passMeetingWriteGate } from '@/lib/pm/meetings/api-gate';
import {
  getMeetingForTenant,
  optionalString,
  trimString,
} from '@/lib/pm/meetings/route-utils';

const ROUTE_PATH = '/api/meetings/[id]/attendees/[attendee_id]';

const PATCH_ALLOWED_FIELDS = new Set<string>([
  'name',
  'email',
  'organization',
  'role',
  'attended',
  'is_kula_user',
  'kula_user_id',
]);

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; attendee_id: string }> },
) {
  const gate = await passMeetingWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id, attendee_id } = await context.params;
  const meeting = await getMeetingForTenant(gate.tenantId, id);
  if (!meeting) return NextResponse.json({ error: 'meeting not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!PATCH_ALLOWED_FIELDS.has(k)) continue;
    if (k === 'name') {
      const name = trimString(v);
      if (!name) return NextResponse.json({ error: 'name cannot be blank' }, { status: 400 });
      updates.name = name;
    } else if (k === 'attended' || k === 'is_kula_user') {
      updates[k] = v === true;
    } else {
      updates[k] = optionalString(v);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No allowed fields provided in PATCH body' }, { status: 400 });
  }

  if ('is_kula_user' in updates || 'kula_user_id' in updates) {
    const existing = await db
      .select()
      .from(meeting_attendees)
      .where(
        and(
          eq(meeting_attendees.meeting_attendee_id, attendee_id),
          eq(meeting_attendees.tenant_id, gate.tenantId),
        ),
      )
      .limit(1);
    if (existing.length === 0) return NextResponse.json({ error: 'attendee not found' }, { status: 404 });
    const isKula = 'is_kula_user' in updates ? updates.is_kula_user === true : existing[0].is_kula_user;
    const kulaUserId = 'kula_user_id' in updates ? (updates.kula_user_id as string | null) : existing[0].kula_user_id;
    if (!isKula && kulaUserId) {
      return NextResponse.json({ error: 'kula_user_id must be null when is_kula_user is false' }, { status: 400 });
    }
  }

  const updated = await db
    .update(meeting_attendees)
    .set(updates)
    .where(
      and(
        eq(meeting_attendees.meeting_attendee_id, attendee_id),
        eq(meeting_attendees.tenant_id, gate.tenantId),
        eq(meeting_attendees.meeting_id, id),
      ),
    )
    .returning();

  if (updated.length === 0) return NextResponse.json({ error: 'attendee not found' }, { status: 404 });
  return NextResponse.json({ ok: true, attendee: updated[0] });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string; attendee_id: string }> },
) {
  const gate = await passMeetingWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id, attendee_id } = await context.params;
  const meeting = await getMeetingForTenant(gate.tenantId, id);
  if (!meeting) return NextResponse.json({ error: 'meeting not found' }, { status: 404 });

  const deleted = await db
    .delete(meeting_attendees)
    .where(
      and(
        eq(meeting_attendees.meeting_attendee_id, attendee_id),
        eq(meeting_attendees.tenant_id, gate.tenantId),
        eq(meeting_attendees.meeting_id, id),
      ),
    )
    .returning({ meeting_attendee_id: meeting_attendees.meeting_attendee_id });

  if (deleted.length === 0) return NextResponse.json({ error: 'attendee not found' }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: deleted[0].meeting_attendee_id });
}
