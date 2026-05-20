/**
 * BAN-376 Customer Pipeline — /api/inquiries/[id]/assign
 *
 *   POST  set assigned_to_user_id + assigned_role and stamp assigned_at.
 *         Manual operator action; suggestion is only a UI default.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  inquiries,
  INQUIRY_ASSIGNED_ROLES,
  type InquiryAssignedRole,
} from '@/db';
import { passInquiryWriteGate } from '@/lib/inquiries/api-gate';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passInquiryWriteGate();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const assignedTo = typeof body.assigned_to_user_id === 'string' && body.assigned_to_user_id
    ? body.assigned_to_user_id
    : null;
  if (!assignedTo) {
    return NextResponse.json({ error: 'assigned_to_user_id is required' }, { status: 400 });
  }

  let assignedRole: InquiryAssignedRole | null = null;
  if ('assigned_role' in body && body.assigned_role !== null && body.assigned_role !== '') {
    if (typeof body.assigned_role !== 'string' ||
        !(INQUIRY_ASSIGNED_ROLES as ReadonlyArray<string>).includes(body.assigned_role)) {
      return NextResponse.json(
        { error: `invalid assigned_role; expected one of ${INQUIRY_ASSIGNED_ROLES.join(', ')}` },
        { status: 400 },
      );
    }
    assignedRole = body.assigned_role as InquiryAssignedRole;
  }

  const updated = await db
    .update(inquiries)
    .set({
      assigned_to_user_id: assignedTo,
      assigned_at: new Date(),
      assigned_role: assignedRole,
      updated_at: new Date(),
    })
    .where(and(eq(inquiries.tenant_id, gate.tenantId), eq(inquiries.inquiry_id, id)))
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: 'inquiry not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, inquiry: updated[0] });
}
