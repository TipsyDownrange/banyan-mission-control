/**
 * BAN-322 Pay Apps surface v1 — GET list for retainage_holdings.
 *
 * The [id]/release route already exists for release writes; this PR adds the
 * read sibling at the collection path so the UI can show held vs released
 * retainage per engagement.
 *
 *   GET /api/aia/retainage-holdings?engagement_id=&pay_app_id=&limit=&offset=
 */

import { NextResponse } from 'next/server';
import { and, eq, type SQL } from 'drizzle-orm';
import { db, retainage_holdings } from '@/db';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementId = url.searchParams.get('engagement_id');
  const payAppId = url.searchParams.get('pay_app_id');

  if (!engagementId) {
    return NextResponse.json(
      { error: 'engagement_id query param is required' },
      { status: 400 },
    );
  }
  const { limit, offset } = parsePagination(url);

  const filters: SQL[] = [
    eq(retainage_holdings.tenant_id, gate.tenantId),
    eq(retainage_holdings.engagement_id, engagementId),
  ];
  if (payAppId) filters.push(eq(retainage_holdings.pay_app_id, payAppId));

  const rows = await db
    .select()
    .from(retainage_holdings)
    .where(and(...filters))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ items: rows, limit, offset });
}
