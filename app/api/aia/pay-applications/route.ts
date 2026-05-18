/**
 * BAN-322 Pay Apps surface v1 — GET list for pay_applications.
 *
 * The Pattern B [id]/transition + [id]/notarize routes already exist under
 * this path; this PR adds the read sibling. No new POST. Read gate only,
 * permission scoped to project:view via passAiaReadGate.
 *
 *   GET /api/aia/pay-applications?engagement_id=&state=&limit=&offset=
 *
 * Ordered by pay_app_number desc so the UI can show the most-recent app first.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { db, pay_applications } from '@/db';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

const STATES = new Set([
  'PENDING_DRAFT',
  'READY_FOR_NOTARIZATION',
  'READY_FOR_SUBMISSION',
  'SUBMITTED',
  'ARCHITECT_CERTIFIED',
  'GC_APPROVED',
  'PAID_PARTIAL',
  'PAID_FULL',
  'REJECTED',
]);

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementId = url.searchParams.get('engagement_id');
  const state = url.searchParams.get('state');

  if (!engagementId) {
    return NextResponse.json(
      { error: 'engagement_id query param is required' },
      { status: 400 },
    );
  }
  if (state && !STATES.has(state)) {
    return NextResponse.json(
      { error: `state must be one of ${[...STATES].join(', ')}` },
      { status: 400 },
    );
  }
  const { limit, offset } = parsePagination(url);

  const filters: SQL[] = [
    eq(pay_applications.tenant_id, gate.tenantId),
    eq(pay_applications.engagement_id, engagementId),
  ];
  if (state) filters.push(eq(pay_applications.state, state));

  const rows = await db
    .select()
    .from(pay_applications)
    .where(and(...filters))
    .orderBy(desc(pay_applications.pay_app_number))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ items: rows, limit, offset });
}
