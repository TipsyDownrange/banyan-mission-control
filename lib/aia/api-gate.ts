/**
 * BAN-309 Pass 3a.2 PR 2 — shared API gate for AIA write routes.
 *
 * Consolidates the auth → staging-guard → Postgres-write-gate prefix that
 * every AIA Pattern A / Pattern B route shares. Returns either an early
 * NextResponse (caller returns immediately) or the resolved actor email
 * plus tenant id.
 */

import { NextResponse } from 'next/server';
import { checkPermission, type Permission } from '@/lib/permissions';
import { getDefaultTenantId, isPostgresWriteEnabled } from '@/lib/env';
import { blockWOStagingPostgresReadOnlyMutation } from '@/lib/service-work-orders/postgres-read-guard';

export type AiaApiGateResult =
  | { ok: true; actorEmail: string; tenantId: string }
  | { ok: false; response: NextResponse };

export async function passAiaApiGate(
  req: Request,
  routePath: string,
  permission: Permission = 'project:edit',
): Promise<AiaApiGateResult> {
  const { allowed, email } = await checkPermission(req, permission);
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Forbidden: ${permission} required` },
        { status: 403 },
      ),
    };
  }

  const blocked = blockWOStagingPostgresReadOnlyMutation(routePath);
  if (blocked) return { ok: false, response: blocked };

  if (!isPostgresWriteEnabled()) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Postgres writes are disabled in this environment.',
          code: 'POSTGRES_WRITE_DISABLED',
        },
        { status: 503 },
      ),
    };
  }

  return { ok: true, actorEmail: email ?? '', tenantId: getDefaultTenantId() };
}
