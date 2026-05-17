/**
 * BAN-311 Pass 3b.2 PR 3 — GET /api/closeout/lifecycle-states/{id}
 *
 * Read a single project_lifecycle_states row by its lifecycle_state_id PK.
 * Read-only — writes flow through the PR 1 lifecycle-transition route.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, project_lifecycle_states } from '@/db';
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
    .from(project_lifecycle_states)
    .where(
      and(
        eq(project_lifecycle_states.lifecycle_state_id, id),
        eq(project_lifecycle_states.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: `lifecycle_state ${id} not found` }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}
