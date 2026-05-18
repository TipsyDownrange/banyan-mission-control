/**
 * BAN-343 PM-V1.0-D — Meeting log write/read gates.
 *
 * Mirrors lib/pm/verbal-agreements/api-gate.ts.  Senior PM / Service PM are
 * routed through the existing pm role for v1.0; cross-project list access is
 * enforced inline by the GET /api/meetings handler.
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

export type MeetingWriteGateResult =
  | { ok: true; actorEmail: string; tenantId: string; role: string }
  | { ok: false; response: NextResponse };

export async function passMeetingWriteGate(
  req: Request,
  routePath: string,
): Promise<MeetingWriteGateResult> {
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

export type MeetingCrossProjectGateResult =
  | { ok: true; actorEmail: string; tenantId: string; role: string }
  | { ok: false; response: NextResponse };

export async function passMeetingCrossProjectListGate(req: Request): Promise<MeetingCrossProjectGateResult> {
  const { role, email } = await checkPermission(req, 'project:view');
  if (!CROSS_PROJECT_ROLES.has(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: cross-project meeting list requires senior PM or admin role' },
        { status: 403 },
      ),
    };
  }
  return { ok: true, actorEmail: email ?? '', tenantId: getDefaultTenantId(), role };
}
