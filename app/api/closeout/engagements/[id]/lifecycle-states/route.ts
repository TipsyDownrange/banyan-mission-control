/**
 * BAN-311 Pass 3b.2 PR 3 — GET /api/closeout/engagements/{id}/lifecycle-states
 *
 * Read-only chronological audit log of project_lifecycle_states for an
 * engagement. Writes go through PR 1's /api/closeout/engagements/[id]/lifecycle-transition
 * route exclusively — this route is consumer-only (admin/debugging,
 * timeline UI, audit views).
 */

import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db, project_lifecycle_states } from '@/db';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { id: engagementId } = await context.params;
  const { limit, offset } = parsePagination(new URL(req.url));

  const rows = await db
    .select()
    .from(project_lifecycle_states)
    .where(
      and(
        eq(project_lifecycle_states.engagement_id, engagementId),
        eq(project_lifecycle_states.tenant_id, gate.tenantId),
      ),
    )
    .orderBy(asc(project_lifecycle_states.entered_at))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ items: rows, limit, offset });
}
