/**
 * BAN-355 follow-up — Contacts API auth gates.
 *
 * Migrates /api/contacts off the email-endsWith anti-pattern onto the
 * canonical role-based gate pattern (mirrors lib/knowledge/api-gate.ts).
 *
 * Roles:
 *   - WRITE: pm, business_admin, super_admin, service_pm, estimator, sales
 *       Roles that maintain CRM-style organization/contact data. service_pm,
 *       estimator, and sales are the call sites that currently mutate
 *       contacts via OrganizationsPanel + ServiceIntake; the BAN-355 core
 *       set (pm, business_admin, super_admin) is widened to include them.
 *   - AUTH: any authenticated kulaglass.com user with a resolved role
 *       (used for GET, which feeds the ContactAutocomplete on intake forms).
 */

import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/permissions';

export const CONTACTS_WRITE_ROLES: ReadonlySet<string> = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'service_pm',
  'estimator',
  'sales',
]);

export type ContactsGateResult =
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
 * Write gate — required for POST / PATCH / DELETE /api/contacts.  Allows pm,
 * business_admin, super_admin, service_pm, estimator, sales.
 */
export async function passContactsWriteGate(req: Request): Promise<ContactsGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email) return { ok: false, response: unauthorized() };
  if (!CONTACTS_WRITE_ROLES.has(role)) {
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
 * Authenticated-user gate — required for GET /api/contacts.  Any signed-in
 * kulaglass.com user with a resolved role (anything other than 'none') is
 * permitted; ServiceIntake and other read consumers rely on this.
 */
export async function passContactsAuthGate(req: Request): Promise<ContactsGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email || role === 'none') {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, actorEmail: email, role };
}
