/**
 * BAN-345 PM-V1.0-F — Document Hub write/read gates.
 *
 * Mirrors lib/pm/meetings/api-gate.ts.  Write gate allows pm /
 * business_admin / super_admin / catalog_admin to mutate.  field_super is
 * allowed to write but is restricted at the route level to PHOTO_PACKAGE
 * uploads (per dispatch scope).  Cross-project list is open to the same
 * set.
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

// field_super may only upload tagged PHOTO_PACKAGE documents (dispatch scope:
// "field_super uploads tagged FIELD_PHOTO only" — PHOTO_PACKAGE is the canon
// kind for field-captured photo bundles).
const FIELD_SUPER_KIND_ALLOWLIST = new Set(['PHOTO_PACKAGE']);

const CROSS_PROJECT_ROLES = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'catalog_admin',
  'field_super',
  'super',
]);

export type DocumentWriteGateResult =
  | { ok: true; actorEmail: string; tenantId: string; role: string }
  | { ok: false; response: NextResponse };

export async function passDocumentWriteGate(
  req: Request,
  routePath: string,
): Promise<DocumentWriteGateResult> {
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

export type DocumentCrossProjectGateResult =
  | { ok: true; actorEmail: string; tenantId: string; role: string }
  | { ok: false; response: NextResponse };

export async function passDocumentCrossProjectGate(
  req: Request,
): Promise<DocumentCrossProjectGateResult> {
  const { role, email } = await checkPermission(req, 'project:view');
  if (!CROSS_PROJECT_ROLES.has(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: cross-project document list requires senior PM or admin role' },
        { status: 403 },
      ),
    };
  }
  return { ok: true, actorEmail: email ?? '', tenantId: getDefaultTenantId(), role };
}

/**
 * Field-super write restriction — returns true when this role is allowed to
 * upload a document of the given kind.  Other roles are unrestricted.
 */
export function roleMayWriteKind(role: string, kind: string): boolean {
  if (role !== 'field_super') return true;
  return FIELD_SUPER_KIND_ALLOWLIST.has(kind);
}
