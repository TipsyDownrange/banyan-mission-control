/**
 * BAN-311 Pass 3b.2 PR 3 — GET /api/closeout/warranties/{id}/claims
 *
 * List warranty_claims for a parent warranty, ordered by inbound_date.
 * No emissions; CRUD-only support per BAN-311 D3.
 */

import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db, warranty_claims } from '@/db';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { id: warrantyId } = await context.params;
  const { limit, offset } = parsePagination(new URL(req.url));

  const rows = await db
    .select()
    .from(warranty_claims)
    .where(
      and(
        eq(warranty_claims.warranty_id, warrantyId),
        eq(warranty_claims.tenant_id, gate.tenantId),
      ),
    )
    .orderBy(asc(warranty_claims.inbound_date))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ items: rows, limit, offset });
}
