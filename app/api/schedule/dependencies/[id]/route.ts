/**
 * BAN-374 Scheduling Spine — /api/schedule/dependencies/[id]
 *
 *   DELETE   remove a single dependency edge
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schedule_dependencies } from '@/db';
import { passScheduleWriteGate } from '@/lib/schedule/api-gate';

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passScheduleWriteGate();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const deleted = await db
    .delete(schedule_dependencies)
    .where(
      and(
        eq(schedule_dependencies.tenant_id, gate.tenantId),
        eq(schedule_dependencies.id, id),
      ),
    )
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'dependency not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
