/**
 * BAN-355 follow-up — Organizations API auth gates.
 *
 * Migrates /api/organizations (including governance/* and [orgId]/contacts,
 * [orgId]/sites subroutes) off the email-endsWith anti-pattern onto the
 * canonical role-based gate pattern (mirrors lib/contacts/api-gate.ts).
 *
 * Organizations and Contacts are paired CRM entities — the OrganizationsPanel
 * surface mutates both side-by-side, so the role set matches /api/contacts.
 *
 * Roles:
 *   - WRITE: pm, business_admin, super_admin, service_pm, estimator, sales
 *       Roles that maintain CRM-style organization/contact data.  Mirrors
 *       /api/contacts WRITE_ROLES exactly so the OrganizationsPanel mutate
 *       paths (PATCH org, POST/PATCH sites, POST/PATCH org-scoped contacts,
 *       POST/PATCH governance relationships, POST governance merge) and the
 *       WODetailPanel POST /api/organizations call site continue to work
 *       across the same operator set that already mutates contacts.
 *   - AUTH: any authenticated kulaglass.com user with a resolved role
 *       (used for GET / preview reads, which feed Organization autocomplete
 *       and merge-preview surfaces consumed by WODetailPanel and field
 *       users).
 *
 * Note: governance/merge is destructive but is intentionally kept on the
 * same role set as contacts for the BAN-355 follow-up.  If a tighter
 * super_admin-only gate is required, it should be tracked as a separate
 * follow-up rather than diverging from the canonical CRM role set here.
 */

import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/permissions';

export const ORGANIZATIONS_WRITE_ROLES: ReadonlySet<string> = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'service_pm',
  'estimator',
  'sales',
]);

export type OrganizationsGateResult =
  | { ok: true; actorEmail: string; role: string }
  | { ok: false; response: NextResponse };

async function resolveRole(req: Request): Promise<{ role: string; email: string | null }> {
  const { role, email } = await checkPermission(req, 'project:view');
  return { role, email };
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Write gate — required for POST / PATCH /api/organizations and its
 * /[orgId], /[orgId]/sites, /[orgId]/contacts, /governance/relationships,
 * /governance/merge subroutes.  Allows pm, business_admin, super_admin,
 * service_pm, estimator, sales.
 */
export async function passOrganizationsWriteGate(req: Request): Promise<OrganizationsGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email) return { ok: false, response: unauthorized() };
  if (!ORGANIZATIONS_WRITE_ROLES.has(role)) {
    return {
      ok: false,
      response: forbidden(
        'Forbidden: pm, business_admin, super_admin, service_pm, estimator, or sales required',
      ),
    };
  }
  return { ok: true, actorEmail: email, role };
}

/**
 * Authenticated-user gate — required for GET /api/organizations and the
 * GET previews on /[orgId], /governance/relationships, /governance/merge.
 * Any signed-in kulaglass.com user with a resolved role (anything other
 * than 'none') is permitted; ContactAutocomplete / OrganizationAutocomplete
 * and other read consumers rely on this.
 */
export async function passOrganizationsAuthGate(req: Request): Promise<OrganizationsGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email || role === 'none') {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, actorEmail: email, role };
}
