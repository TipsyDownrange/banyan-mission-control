/**
 * BAN-336 Pay App Core — Admin SOV-stub lock route.
 *
 * POST /api/admin/sov-stub/[sov_id]/lock
 *
 * Transitions APPROVED_INTERNAL → LOCKED via the canonical Pattern B
 * executor so the Pay App create wizard can fire. Admin-only gate.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, sov_versions, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { executePatternBTransition } from '@/lib/aia/execute-state-transition';
import { checkPermission } from '@/lib/permissions';

const ADMIN_ROLES = new Set(['super_admin', 'business_admin', 'gm', 'owner']);

export async function POST(
  req: Request,
  context: { params: Promise<{ sov_id: string }> },
) {
  const gate = await passAiaApiGate(req, '/api/admin/sov-stub/[sov_id]/lock', 'project:edit');
  if (!gate.ok) return gate.response;
  const { allowed, role } = await checkPermission(req, 'admin:all');
  if (!allowed && !(role && ADMIN_ROLES.has(role))) {
    return NextResponse.json(
      { error: 'Forbidden: super_admin or business_admin role required' },
      { status: 403 },
    );
  }

  const { sov_id } = await context.params;
  if (!sov_id) {
    return NextResponse.json({ error: 'sov_id is required' }, { status: 400 });
  }

  // Look up the version to retrieve engagement_id (needed for spine emit
  // metadata) and verify tenant scope.
  const row = await db
    .select({
      sov_version_id: sov_versions.sov_version_id,
      engagement_id: sov_versions.engagement_id,
      state: sov_versions.state,
    })
    .from(sov_versions)
    .where(and(
      eq(sov_versions.sov_version_id, sov_id),
      eq(sov_versions.tenant_id, gate.tenantId),
    ))
    .limit(1);

  if (row.length === 0) {
    return NextResponse.json({ error: 'sov_version not found' }, { status: 404 });
  }

  const eng = await db
    .select({ is_test: engagements.is_test_project })
    .from(engagements)
    .where(eq(engagements.engagement_id, row[0].engagement_id))
    .limit(1);

  const result = await executePatternBTransition({
    entity: 'sov_version',
    table: sov_versions,
    pkColumn: sov_versions.sov_version_id,
    pkValue: sov_id,
    tenantColumn: sov_versions.tenant_id,
    tenantId: gate.tenantId,
    stateColumn: sov_versions.state,
    toState: 'LOCKED',
    actorEmail: gate.actorEmail,
    testData: !!eng[0]?.is_test,
    engagementId: row[0].engagement_id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status },
    );
  }

  // Update locked_at — the executor only touches `state` + `updated_at`, so
  // we tail-write the locked_at timestamp outside the transition.
  await db
    .update(sov_versions)
    .set({ locked_at: new Date() })
    .where(and(
      eq(sov_versions.sov_version_id, sov_id),
      eq(sov_versions.tenant_id, gate.tenantId),
    ));

  return NextResponse.json({
    ok: true,
    sov_version_id: sov_id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
  });
}
