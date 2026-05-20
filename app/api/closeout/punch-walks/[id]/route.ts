/**
 * BAN-375 Closeout v1.1.1 Phase 1 — GET / PATCH /api/closeout/punch-walks/[id]
 *
 * Per-walk read + update. PATCH allows mutating notes, attendees, status
 * (in_progress → complete), and walked_by. type + walk_date + engagement_id
 * are immutable once the walk is created (they define the walk's identity).
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, punch_walks } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/closeout/punch-walks/[id]';

interface PatchBody {
  attendees?: unknown[];
  notes?: string | null;
  status?: string;
  walked_by?: string | null;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const row = await db
    .select()
    .from(punch_walks)
    .where(
      and(
        eq(punch_walks.walk_id, id),
        eq(punch_walks.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (row.length === 0) {
    return NextResponse.json({ error: `punch_walk ${id} not found` }, { status: 404 });
  }
  return NextResponse.json({ punch_walk: row[0] });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updateValues: Record<string, unknown> = { updated_at: new Date() };
  if (body.attendees !== undefined) updateValues.attendees = body.attendees;
  if (body.notes !== undefined) updateValues.notes = body.notes;
  if (body.walked_by !== undefined) updateValues.walked_by = body.walked_by;
  if (body.status !== undefined) {
    if (body.status !== 'in_progress' && body.status !== 'complete') {
      return NextResponse.json(
        { error: "status must be 'in_progress' or 'complete'", code: 'INVALID_STATUS' },
        { status: 400 },
      );
    }
    updateValues.status = body.status;
  }

  const updated = await db
    .update(punch_walks)
    .set(updateValues)
    .where(
      and(
        eq(punch_walks.walk_id, id),
        eq(punch_walks.tenant_id, gate.tenantId),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: `punch_walk ${id} not found` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, punch_walk: updated[0] });
}
