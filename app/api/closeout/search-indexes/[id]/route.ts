/**
 * BAN-311 Pass 3b.2 PR 3 — GET /api/closeout/search-indexes/{id}
 *
 * Admin/debug read of a single project_search_indexes row by PK.
 * Read-only — managed by future search write hooks.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, project_search_indexes } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  const rows = await db
    .select()
    .from(project_search_indexes)
    .where(
      and(
        eq(project_search_indexes.search_index_id, id),
        eq(project_search_indexes.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: `search_index ${id} not found` }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}
