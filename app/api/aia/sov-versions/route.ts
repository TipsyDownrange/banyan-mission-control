/**
 * BAN-322 Pay Apps surface v1 — GET list for sov_versions.
 *
 * The [id]/transition route already exists for state changes; this PR adds the
 * read sibling so the UI can pick the active/locked version for an engagement.
 *
 *   GET /api/aia/sov-versions?engagement_id=&limit=&offset=
 *
 * Ordered by version_number desc so the most recent version is first.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, sov_versions } from '@/db';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementId = url.searchParams.get('engagement_id');

  if (!engagementId) {
    return NextResponse.json(
      { error: 'engagement_id query param is required' },
      { status: 400 },
    );
  }
  const { limit, offset } = parsePagination(url);

  const rows = await db
    .select()
    .from(sov_versions)
    .where(
      and(
        eq(sov_versions.tenant_id, gate.tenantId),
        eq(sov_versions.engagement_id, engagementId),
      ),
    )
    .orderBy(desc(sov_versions.version_number))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ items: rows, limit, offset });
}
