/**
 * BAN-322 Pay Apps surface v1 — GET list for schedule_of_values lines.
 *
 * The [id] PATCH route already exists for line edits; this PR adds the read
 * sibling at the collection path. Filters by engagement_id (required) and
 * optionally sov_version_id to fetch one version's lines.
 *
 *   GET /api/aia/schedule-of-values?engagement_id=&sov_version_id=&limit=&offset=
 */

import { NextResponse } from 'next/server';
import { and, asc, eq, type SQL } from 'drizzle-orm';
import { db, schedule_of_values } from '@/db';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementId = url.searchParams.get('engagement_id');
  const sovVersionId = url.searchParams.get('sov_version_id');

  if (!engagementId) {
    return NextResponse.json(
      { error: 'engagement_id query param is required' },
      { status: 400 },
    );
  }
  const { limit, offset } = parsePagination(url);

  const filters: SQL[] = [
    eq(schedule_of_values.tenant_id, gate.tenantId),
    eq(schedule_of_values.engagement_id, engagementId),
  ];
  if (sovVersionId) filters.push(eq(schedule_of_values.sov_version_id, sovVersionId));

  const rows = await db
    .select()
    .from(schedule_of_values)
    .where(and(...filters))
    .orderBy(asc(schedule_of_values.line_number))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ items: rows, limit, offset });
}
