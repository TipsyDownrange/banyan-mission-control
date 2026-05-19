/**
 * BAN-345 PM-V1.0-F — Document Hub write/read gates.
 *
 * PM-DOCUMENTS-PERMISSIONS dispatch (2026-05-19, peer migration following
 * the WARROOM-PERMISSIONS / KB-PERMISSIONS / CONTACTS-PERMISSIONS template):
 * migrated from the hardcoded WRITE_ROLES / CROSS_PROJECT_ROLES sets
 * (BAN-345 / PR #181) to the env-overridable RolePermission system in
 * lib/permissions.ts.  Widening document-hub access no longer requires a
 * code change + PR + deploy — set ROLE_PERMISSIONS_JSON in Vercel instead.
 *
 * Original (BAN-345 / PR #181) rationale, preserved for context:
 *   Mirrors lib/pm/meetings/api-gate.ts.  Write gate allows pm /
 *   business_admin / super_admin / catalog_admin / field_super / super to
 *   mutate.  field_super is allowed to write but is restricted at the route
 *   level to PHOTO_PACKAGE uploads (per dispatch scope).  Cross-project list
 *   is open to the same set.
 *
 * Gate → permission mapping:
 *   passDocumentWriteGate         → PM_DOCUMENT_WRITE (plus postgres checks)
 *   passDocumentCrossProjectGate  → PM_DOCUMENT_VIEW
 *   roleMayWriteKind              — unchanged; route-level field_super
 *                                   PHOTO_PACKAGE restriction (not a gate).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { passPermissionGate } from '@/lib/permissions';
import { getDefaultTenantId, isPostgresWriteEnabled } from '@/lib/env';
import { blockWOStagingPostgresReadOnlyMutation } from '@/lib/service-work-orders/postgres-read-guard';

// field_super may only upload tagged PHOTO_PACKAGE documents (dispatch scope:
// "field_super uploads tagged FIELD_PHOTO only" — PHOTO_PACKAGE is the canon
// kind for field-captured photo bundles).
const FIELD_SUPER_KIND_ALLOWLIST = new Set(['PHOTO_PACKAGE']);

export type DocumentWriteGateResult =
  | { ok: true; actorEmail: string; tenantId: string; role: string }
  | { ok: false; response: NextResponse };

export async function passDocumentWriteGate(
  _req: Request,
  routePath: string,
): Promise<DocumentWriteGateResult> {
  const session = await getServerSession(authOptions);
  const gate = passPermissionGate(session, 'PM_DOCUMENT_WRITE');
  if (!gate.ok) return { ok: false, response: gate.response };

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

  return { ok: true, actorEmail: gate.actorEmail, tenantId: getDefaultTenantId(), role: gate.role };
}

export type DocumentCrossProjectGateResult =
  | { ok: true; actorEmail: string; tenantId: string; role: string }
  | { ok: false; response: NextResponse };

export async function passDocumentCrossProjectGate(
  _req: Request,
): Promise<DocumentCrossProjectGateResult> {
  const session = await getServerSession(authOptions);
  const gate = passPermissionGate(session, 'PM_DOCUMENT_VIEW');
  if (!gate.ok) return { ok: false, response: gate.response };
  return { ok: true, actorEmail: gate.actorEmail, tenantId: getDefaultTenantId(), role: gate.role };
}

/**
 * Field-super write restriction — returns true when this role is allowed to
 * upload a document of the given kind.  Other roles are unrestricted.
 *
 * This is a route-level allowlist that runs AFTER passDocumentWriteGate has
 * already approved the role.  The Document Hub dispatch (BAN-345) intentionally
 * restricts field_super to PHOTO_PACKAGE uploads while granting them the
 * broader PM_DOCUMENT_WRITE permission so they can use the read paths.
 */
export function roleMayWriteKind(role: string, kind: string): boolean {
  if (role !== 'field_super') return true;
  return FIELD_SUPER_KIND_ALLOWLIST.has(kind);
}
