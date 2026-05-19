/**
 * BAN-346 PM-V1.0-G — PM Handoff Receipt write/read gates.
 *
 * Mirrors lib/pm/action-items/api-gate.ts.  All write paths require pm /
 * business_admin / super_admin.  POST /api/handoff-receipts is Estimating-
 * side initiation; estimator / super are also permitted to create.
 */

import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/permissions';
import { getDefaultTenantId, isPostgresWriteEnabled } from '@/lib/env';
import { blockWOStagingPostgresReadOnlyMutation } from '@/lib/service-work-orders/postgres-read-guard';

const REVIEW_ROLES = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'super',
]);

const CREATE_ROLES = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'super',
  'estimator',
]);

export type HandoffReceiptWriteGateResult =
  | { ok: true; actorEmail: string; tenantId: string; role: string }
  | { ok: false; response: NextResponse };

async function baseWriteGate(
  req: Request,
  routePath: string,
  allowedRoles: Set<string>,
  forbiddenMessage: string,
): Promise<HandoffReceiptWriteGateResult> {
  const { role, email } = await checkPermission(req, 'project:view');
  if (!allowedRoles.has(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: forbiddenMessage },
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

/**
 * Review / accept / reject / patch gate — PM role required.  Use for all
 * mutations after initial creation.
 */
export function passHandoffReceiptReviewGate(req: Request, routePath: string) {
  return baseWriteGate(
    req,
    routePath,
    REVIEW_ROLES,
    'Forbidden: pm, business_admin, or super_admin required',
  );
}

/**
 * Creation gate — allows estimator in addition to PM roles, since
 * Estimating side initiates the handoff per PM Trunk §11.
 */
export function passHandoffReceiptCreateGate(req: Request, routePath: string) {
  return baseWriteGate(
    req,
    routePath,
    CREATE_ROLES,
    'Forbidden: pm, business_admin, super_admin, or estimator required',
  );
}
