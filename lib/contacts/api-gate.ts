/**
 * BAN-355 follow-up — Contacts API auth gates.
 *
 * CONTACTS-PERMISSIONS dispatch (2026-05-19, peer migration following the
 * WARROOM-PERMISSIONS / KB-PERMISSIONS template): migrated from the
 * hardcoded CONTACTS_WRITE_ROLES set (PR #187) to the env-overridable
 * RolePermission system in lib/permissions.ts.  Widening contacts access no
 * longer requires a code change + PR + deploy — set ROLE_PERMISSIONS_JSON in
 * Vercel instead.
 *
 * Original (PR #187) rationale, preserved for context:
 *   Migrates /api/contacts off the email-endsWith anti-pattern onto the
 *   canonical role-based gate pattern (mirrors lib/knowledge/api-gate.ts).
 *
 *   Roles (preserved exactly by ROLE_PERMISSIONS_DEFAULTS):
 *     - WRITE: pm, business_admin, super_admin, service_pm, estimator, sales
 *         Roles that maintain CRM-style organization/contact data. service_pm,
 *         estimator, and sales are the call sites that currently mutate
 *         contacts via OrganizationsPanel + ServiceIntake; the BAN-355 core
 *         set (pm, business_admin, super_admin) is widened to include them.
 *     - VIEW: any authenticated kulaglass.com user with a resolved role
 *         (used for GET, which feeds the ContactAutocomplete on intake forms).
 *
 * Gate → permission mapping:
 *   passContactsWriteGate → CONTACTS_WRITE
 *   passContactsAuthGate  → CONTACTS_VIEW
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  passPermissionGate,
  type PermissionGateResult,
} from '@/lib/permissions';

/**
 * @deprecated Use the RolePermission system in lib/permissions.ts
 * (CONTACTS_VIEW / CONTACTS_WRITE).  Retained as a backward-compat export so
 * anything still importing it does not break, but no active call site
 * references it.  Contacts access is resolved through ROLE_PERMISSIONS_DEFAULTS
 * (env-overridable via ROLE_PERMISSIONS_JSON), not this constant.
 */
export const CONTACTS_WRITE_ROLES: ReadonlySet<string> = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'service_pm',
  'estimator',
  'sales',
]);

export type ContactsGateResult = PermissionGateResult;

/**
 * Write gate — required for POST / PATCH / DELETE /api/contacts.  Delegates to
 * passPermissionGate(CONTACTS_WRITE).
 */
export async function passContactsWriteGate(_req: Request): Promise<ContactsGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'CONTACTS_WRITE');
}

/**
 * Authenticated-user gate — required for GET /api/contacts.  Delegates to
 * passPermissionGate(CONTACTS_VIEW).  Default grants every documented role
 * except 'none', preserving the prior "any signed-in kulaglass.com user with
 * a resolved role" behavior; ServiceIntake and other read consumers rely on
 * this.
 */
export async function passContactsAuthGate(_req: Request): Promise<ContactsGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'CONTACTS_VIEW');
}
