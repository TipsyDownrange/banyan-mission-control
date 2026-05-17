/**
 * BAN-309 Pass 3a.2 — POST /api/aia/lien-waivers/{id}/transition
 *
 * Emits LIEN_WAIVER_STATE_CHANGED (Pattern B) in the same Drizzle tx as the
 * lien_waivers.state UPDATE. See ADR-014 Amendment 1.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, lien_waivers, engagements } from '@/db';
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
    '/api/aia/lien-waivers/[id]/transition',
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

  const waiverLookup = await db
    .select({
      waiver_id: lien_waivers.waiver_id,
      engagement_id: lien_waivers.engagement_id,
      is_test_project: engagements.is_test_project,
    })
    .from(lien_waivers)
    .innerJoin(
      engagements,
      eq(lien_waivers.engagement_id, engagements.engagement_id),
    )
    .where(
      and(
        eq(lien_waivers.waiver_id, id),
        eq(lien_waivers.tenant_id, tenantId),
      ),
    )
    .limit(1);

  if (waiverLookup.length === 0) {
    return NextResponse.json(
      { error: `lien_waiver ${id} not found` },
      { status: 404 },
    );
  }

  const result = await executePatternBTransition({
    entity: 'lien_waiver',
    table: lien_waivers,
    pkColumn: lien_waivers.waiver_id,
    pkValue: id,
    tenantColumn: lien_waivers.tenant_id,
    tenantId,
    stateColumn: lien_waivers.state,
    toState,
    reason: body.reason,
    actorEmail: email ?? '',
    testData: waiverLookup[0].is_test_project === true,
    engagementId: waiverLookup[0].engagement_id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    waiver_id: id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
  });
}
