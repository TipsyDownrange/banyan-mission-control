/**
 * BAN-309 Pass 3a.2 PR 3 — by-id GET + PATCH for notarization_sessions.
 *
 * No state transitions through this PATCH — that path goes through the PR 2
 * notarize route. No DELETE (audit / vendor session record).
 *
 * Allowed PATCH fields (non-lifecycle): provider, provider_session_id,
 * provider_session_url, signer_user_id, notary_name, notary_cert_ref,
 * cost_amount.
 *
 * Forbidden fields: state, completed_at, failure_reason, target_kind,
 * pay_app_id, engagement_id, tenant_id — reject with 400.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, notarization_sessions } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/aia/notarization-sessions/[id]';

const PATCHABLE_FIELDS = new Set([
  'provider', 'provider_session_id', 'provider_session_url',
  'signer_user_id', 'notary_name', 'notary_cert_ref', 'cost_amount',
]);

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const rows = await db
    .select()
    .from(notarization_sessions)
    .where(
      and(
        eq(notarization_sessions.session_id, id),
        eq(notarization_sessions.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: `notarization_session ${id} not found` }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!PATCHABLE_FIELDS.has(k)) {
      return NextResponse.json(
        {
          error: `field '${k}' is not patchable through this route; lifecycle changes go through POST /api/aia/pay-applications/[id]/notarize`,
          code: 'FIELD_NOT_PATCHABLE',
        },
        { status: 400 },
      );
    }
    updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no patchable fields provided' }, { status: 400 });
  }
  updates.updated_at = new Date();

  const existing = await db
    .select({ session_id: notarization_sessions.session_id })
    .from(notarization_sessions)
    .where(
      and(
        eq(notarization_sessions.session_id, id),
        eq(notarization_sessions.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: `notarization_session ${id} not found` }, { status: 404 });
  }

  await db
    .update(notarization_sessions)
    .set(updates)
    .where(
      and(
        eq(notarization_sessions.session_id, id),
        eq(notarization_sessions.tenant_id, gate.tenantId),
      ),
    );

  return NextResponse.json({ ok: true, session_id: id });
}
