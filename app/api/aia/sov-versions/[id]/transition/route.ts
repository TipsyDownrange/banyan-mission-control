/**
 * BAN-309 Pass 3a.2 — POST /api/aia/sov-versions/{id}/transition
 *
 * Emits SOV_STATE_CHANGED (Pattern B) in the same Drizzle tx as the
 * sov_versions.state UPDATE. See ADR-014 Amendment 1.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, sov_versions, engagements } from '@/db';
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
    '/api/aia/sov-versions/[id]/transition',
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

  const sovLookup = await db
    .select({
      sov_version_id: sov_versions.sov_version_id,
      engagement_id: sov_versions.engagement_id,
      is_test_project: engagements.is_test_project,
    })
    .from(sov_versions)
    .innerJoin(
      engagements,
      eq(sov_versions.engagement_id, engagements.engagement_id),
    )
    .where(
      and(
        eq(sov_versions.sov_version_id, id),
        eq(sov_versions.tenant_id, tenantId),
      ),
    )
    .limit(1);

  if (sovLookup.length === 0) {
    return NextResponse.json(
      { error: `sov_version ${id} not found` },
      { status: 404 },
    );
  }

  const result = await executePatternBTransition({
    entity: 'sov_version',
    table: sov_versions,
    pkColumn: sov_versions.sov_version_id,
    pkValue: id,
    tenantColumn: sov_versions.tenant_id,
    tenantId,
    stateColumn: sov_versions.state,
    toState,
    reason: body.reason,
    actorEmail: email ?? '',
    testData: sovLookup[0].is_test_project === true,
    engagementId: sovLookup[0].engagement_id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    sov_version_id: id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
  });
}
