/**
 * BAN-355 follow-up — Organizations API auth gates.
 *
 * ORGANIZATIONS-PERMISSIONS dispatch (2026-05-19, peer migration following
 * WARROOM-PERMISSIONS PR #192 and KB-PERMISSIONS PR #195): migrated from
 * the hardcoded ORGANIZATIONS_WRITE_ROLES set to the env-overridable
 * RolePermission system in lib/permissions.ts.  Widening Organizations
 * access no longer requires a code change + PR + deploy — set
 * ROLE_PERMISSIONS_JSON in Vercel instead.
 *
 * Original (PR #189) rationale, preserved for context:
 *   Migrates /api/organizations (including governance/* and [orgId]/contacts,
 *   [orgId]/sites subroutes) off the email-endsWith anti-pattern onto the
 *   canonical role-based gate pattern (mirrors lib/contacts/api-gate.ts).
 *
 *   Organizations and Contacts are paired CRM entities — the
 *   OrganizationsPanel surface mutates both side-by-side, so the role set
 *   matches /api/contacts.
 *
 *   Roles (preserved exactly by ROLE_PERMISSIONS_DEFAULTS):
 *     - WRITE: pm, business_admin, super_admin, service_pm, estimator, sales
 *         Roles that maintain CRM-style organization/contact data.  Mirrors
 *         /api/contacts WRITE_ROLES exactly so the OrganizationsPanel mutate
 *         paths (PATCH org, POST/PATCH sites, POST/PATCH org-scoped contacts,
 *         POST/PATCH governance relationships, POST governance merge) and the
 *         WODetailPanel POST /api/organizations call site continue to work
 *         across the same operator set that already mutates contacts.
 *     - AUTH: any authenticated kulaglass.com user with a resolved role
 *         (used for GET / preview reads, which feed Organization autocomplete
 *         and merge-preview surfaces consumed by WODetailPanel and field
 *         users).
 *
 *   Note: governance/merge is destructive but is intentionally kept on the
 *   same role set as contacts for the BAN-355 follow-up.  If a tighter
 *   super_admin-only gate is required, it should be tracked as a separate
 *   follow-up rather than diverging from the canonical CRM role set here.
 *
 * Gate → permission mapping:
 *   passOrganizationsWriteGate → ORG_WRITE
 *   passOrganizationsAuthGate  → ORG_VIEW
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { passPermissionGate, type PermissionGateResult } from '@/lib/permissions';

/**
 * @deprecated Use the RolePermission system in lib/permissions.ts (ORG_VIEW /
 * ORG_WRITE).  Retained as a backward-compat export so anything still
 * importing it does not break, but no active call site references it.
 * Organizations access is resolved through ROLE_PERMISSIONS_DEFAULTS
 * (env-overridable via ROLE_PERMISSIONS_JSON), not this constant.
 */
export const ORGANIZATIONS_WRITE_ROLES: ReadonlySet<string> = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'service_pm',
  'estimator',
  'sales',
]);

export type OrganizationsGateResult = PermissionGateResult;

/**
 * Write gate — required for POST / PATCH /api/organizations and its
 * /[orgId], /[orgId]/sites, /[orgId]/contacts, /governance/relationships,
 * /governance/merge subroutes.  Delegates to passPermissionGate(ORG_WRITE).
 */
export async function passOrganizationsWriteGate(_req: Request): Promise<OrganizationsGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'ORG_WRITE');
}

/**
 * Authenticated-user gate — required for GET /api/organizations and the
 * GET previews on /[orgId], /governance/relationships, /governance/merge.
 * Delegates to passPermissionGate(ORG_VIEW).  Default ORG_VIEW grants
 * include every documented role except 'none', preserving the prior
 * "any signed-in kulaglass.com user with a resolved role" behavior.
 */
export async function passOrganizationsAuthGate(_req: Request): Promise<OrganizationsGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'ORG_VIEW');
}
