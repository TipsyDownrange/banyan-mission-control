/**
 * BAN-311 Pass 3b.2 PR 3 — GET /api/closeout/projects/{kID}/search-indexes
 *
 * Admin/debug read of project_search_indexes rows for an engagement, looked
 * up by the engagement's kID (per Closeout v1.1 §20.7 path convention).
 *
 * Per §13.3 search-index rows are written by future search write hooks tied
 * to every entity's create/update — out of scope for PR 3. This route is
 * read-only.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, project_search_indexes, engagements } from '@/db';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

export async function GET(
  req: Request,
  context: { params: Promise<{ kID: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { kID } = await context.params;
  const { limit, offset } = parsePagination(new URL(req.url));

  const eng = await db
    .select({ engagement_id: engagements.engagement_id })
    .from(engagements)
    .where(and(eq(engagements.kid, kID), eq(engagements.tenant_id, gate.tenantId)))
    .limit(1);
  if (eng.length === 0) {
    return NextResponse.json({ error: `engagement with kID ${kID} not found` }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(project_search_indexes)
    .where(
      and(
        eq(project_search_indexes.engagement_id, eng[0].engagement_id),
        eq(project_search_indexes.tenant_id, gate.tenantId),
      ),
    )
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ items: rows, engagement_id: eng[0].engagement_id, limit, offset });
}
