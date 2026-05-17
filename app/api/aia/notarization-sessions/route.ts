/**
 * BAN-309 Pass 3a.2 PR 3 — list for notarization_sessions.
 *
 * Creation happens via the PR 2 notarize route
 * (POST /api/aia/pay-applications/[id]/notarize); this PR has GET only on
 * the collection path. PATCH (limited fields) lives on the [id] route.
 *
 *   GET /api/aia/notarization-sessions?engagement_id=&target_kind=&pay_app_id=&state=&limit=&offset=
 *
 * Schema drift note (Charter Rule 12): dispatch said "filter by target_kind +
 * target_id" but the schema has no single `target_id` column — PAY_APP target
 * lives in `pay_app_id`, LIEN_WAIVER target is a reverse FK on lien_waivers.
 * List filter accepts pay_app_id directly; LIEN_WAIVER filtering by waiver_id
 * is deferred to a future PR. PR description carries the drift.
 */

import { NextResponse } from 'next/server';
import { and, eq, type SQL } from 'drizzle-orm';
import { db, notarization_sessions } from '@/db';
import { passAiaReadGate, parsePagination } from '@/lib/aia/read-gate';

const TARGET_KINDS = new Set(['PAY_APP', 'LIEN_WAIVER']);
const STATES = new Set(['CREATED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED']);

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const engagementId = url.searchParams.get('engagement_id');
  const targetKind = url.searchParams.get('target_kind');
  const payAppId = url.searchParams.get('pay_app_id');
  const state = url.searchParams.get('state');
  if (!engagementId && !payAppId) {
    return NextResponse.json(
      { error: 'engagement_id or pay_app_id query param is required' },
      { status: 400 },
    );
  }
  if (targetKind && !TARGET_KINDS.has(targetKind)) {
    return NextResponse.json(
      { error: `target_kind must be one of ${[...TARGET_KINDS].join(', ')}` },
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

  const filters: SQL[] = [eq(notarization_sessions.tenant_id, gate.tenantId)];
  if (engagementId) filters.push(eq(notarization_sessions.engagement_id, engagementId));
  if (payAppId) filters.push(eq(notarization_sessions.pay_app_id, payAppId));
  if (targetKind) filters.push(eq(notarization_sessions.target_kind, targetKind));
  if (state) filters.push(eq(notarization_sessions.state, state));

  const rows = await db
    .select()
    .from(notarization_sessions)
    .where(and(...filters))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ items: rows, limit, offset });
}
