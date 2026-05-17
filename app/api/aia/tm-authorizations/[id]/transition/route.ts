/**
 * BAN-309 Pass 3a.2 — POST /api/aia/tm-authorizations/{id}/transition
 *
 * Emits TM_AUTHORIZATION_STATE_CHANGED (Pattern B) in the same Drizzle tx as
 * the tm_authorizations.status UPDATE. tm_authorizations uses `status` rather
 * than `state` as the column name; the state-transition helper carries the
 * column name explicitly so the route still uses the canonical Pattern B
 * machinery. See ADR-014 Amendment 1.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, tm_authorizations, engagements } from '@/db';
import { checkPermission } from '@/lib/permissions';
import { getDefaultTenantId, isPostgresWriteEnabled } from '@/lib/env';
import { blockWOStagingPostgresReadOnlyMutation } from '@/lib/service-work-orders/postgres-read-guard';
import { executePatternBTransition } from '@/lib/aia/execute-state-transition';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { allowed, email } = await checkPermission(req, 'project:edit');
  if (!allowed) {
    return NextResponse.json(
      { error: 'Forbidden: project:edit required' },
      { status: 403 },
    );
  }

  const blocked = blockWOStagingPostgresReadOnlyMutation(
    '/api/aia/tm-authorizations/[id]/transition',
  );
  if (blocked) return blocked;

  if (!isPostgresWriteEnabled()) {
    return NextResponse.json(
      {
        error: 'Postgres writes are disabled in this environment.',
        code: 'POSTGRES_WRITE_DISABLED',
      },
      { status: 503 },
    );
  }

  const { id } = await context.params;
  const tenantId = getDefaultTenantId();

  let body: { to_state?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const toState = (body.to_state ?? '').trim();
  if (!toState) {
    return NextResponse.json(
      { error: 'to_state is required' },
      { status: 400 },
    );
  }

  const tmAuthLookup = await db
    .select({
      tm_auth_id: tm_authorizations.tm_auth_id,
      engagement_id: tm_authorizations.engagement_id,
      is_test_project: engagements.is_test_project,
    })
    .from(tm_authorizations)
    .innerJoin(
      engagements,
      eq(tm_authorizations.engagement_id, engagements.engagement_id),
    )
    .where(
      and(
        eq(tm_authorizations.tm_auth_id, id),
        eq(tm_authorizations.tenant_id, tenantId),
      ),
    )
    .limit(1);

  if (tmAuthLookup.length === 0) {
    return NextResponse.json(
      { error: `tm_authorization ${id} not found` },
      { status: 404 },
    );
  }

  const result = await executePatternBTransition({
    entity: 'tm_authorization',
    table: tm_authorizations,
    pkColumn: tm_authorizations.tm_auth_id,
    pkValue: id,
    tenantColumn: tm_authorizations.tenant_id,
    tenantId,
    stateColumn: tm_authorizations.status,
    toState,
    reason: body.reason,
    actorEmail: email ?? '',
    testData: tmAuthLookup[0].is_test_project === true,
    engagementId: tmAuthLookup[0].engagement_id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    tm_auth_id: id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
  });
}
