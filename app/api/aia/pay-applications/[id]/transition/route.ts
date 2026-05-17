/**
 * BAN-309 Pass 3a.2 — POST /api/aia/pay-applications/{id}/transition
 *
 * Emits PAY_APP_STATE_CHANGED (Pattern B) in the same Drizzle tx as the
 * pay_applications.state UPDATE. See ADR-014 Amendment 1.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, pay_applications, engagements } from '@/db';
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
    '/api/aia/pay-applications/[id]/transition',
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

  const payAppLookup = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      engagement_id: pay_applications.engagement_id,
      is_test_project: engagements.is_test_project,
    })
    .from(pay_applications)
    .innerJoin(
      engagements,
      eq(pay_applications.engagement_id, engagements.engagement_id),
    )
    .where(
      and(
        eq(pay_applications.pay_app_id, id),
        eq(pay_applications.tenant_id, tenantId),
      ),
    )
    .limit(1);

  if (payAppLookup.length === 0) {
    return NextResponse.json(
      { error: `pay_application ${id} not found` },
      { status: 404 },
    );
  }

  const result = await executePatternBTransition({
    entity: 'pay_application',
    table: pay_applications,
    pkColumn: pay_applications.pay_app_id,
    pkValue: id,
    tenantColumn: pay_applications.tenant_id,
    tenantId,
    stateColumn: pay_applications.state,
    toState,
    reason: body.reason,
    actorEmail: email ?? '',
    testData: payAppLookup[0].is_test_project === true,
    engagementId: payAppLookup[0].engagement_id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    pay_app_id: id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
  });
}
