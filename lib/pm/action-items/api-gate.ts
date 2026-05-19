/**
 * BAN-344a PM-V1.0-E (CORE) — Action Item Tracker write/read gates.
 *
 * Mirrors lib/pm/meetings/api-gate.ts.  Write gate allows pm /
 * business_admin / super_admin / catalog_admin / field_super to mutate.
 * Cross-project list (My Open Actions) is open to the same set.  The
 * route-level handler additionally checks the assigned_to-vs-actor rule
 * for field_super self-complete.
 */

import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/permissions';
import { getDefaultTenantId, isPostgresWriteEnabled } from '@/lib/env';
import { blockWOStagingPostgresReadOnlyMutation } from '@/lib/service-work-orders/postgres-read-guard';

const WRITE_ROLES = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'catalog_admin',
  'field_super',
  'super',
]);

const CROSS_PROJECT_ROLES = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'catalog_admin',
  'field_super',
  'super',
]);

export type ActionItemWriteGateResult =
  | { ok: true; actorEmail: string; tenantId: string; role: string }
  | { ok: false; response: NextResponse };

export async function passActionItemWriteGate(
  req: Request,
  routePath: string,
): Promise<ActionItemWriteGateResult> {
  const { role, email } = await checkPermission(req, 'project:view');
  if (!WRITE_ROLES.has(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: pm, business_admin, super_admin, catalog_admin, or field_super required' },
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

  return { ok: true, actorEmail: email ?? '', tenantId: getDefaultTenantId(), role };
}

export type ActionItemCrossProjectGateResult =
  | { ok: true; actorEmail: string; tenantId: string; role: string }
  | { ok: false; response: NextResponse };

export async function passActionItemCrossProjectGate(
  req: Request,
): Promise<ActionItemCrossProjectGateResult> {
  const { role, email } = await checkPermission(req, 'project:view');
  if (!CROSS_PROJECT_ROLES.has(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: cross-project action item list requires senior PM or admin role' },
        { status: 403 },
      ),
    };
  }
  return { ok: true, actorEmail: email ?? '', tenantId: getDefaultTenantId(), role };
}
