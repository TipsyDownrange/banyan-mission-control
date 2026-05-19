/**
 * BAN-355 — Knowledge Base API auth gates.
 *
 * Migrates KB routes off the email-endsWith anti-pattern onto the canonical
 * role-based gate pattern used by the rest of the BanyanOS API surface (see
 * lib/pm/action-items/api-gate.ts and lib/pm/documents/api-gate.ts).
 *
 * Roles:
 *   - WRITE / TRIAGE: pm, business_admin, super_admin, catalog_admin
 *       (article create/patch/delete, feedback triage list)
 *   - SETUP: super_admin only (KB tab bootstrap)
 *   - AUTH: any authenticated kulaglass.com user (feedback POST submit;
 *       parts / product-lines / sources read placeholders)
 */

import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/permissions';

export const KNOWLEDGE_WRITE_ROLES: ReadonlySet<string> = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'catalog_admin',
]);

const SETUP_ROLES: ReadonlySet<string> = new Set([
  'super_admin',
]);

export type KnowledgeGateResult =
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
 * Write gate — required for POST /api/knowledge, PATCH/DELETE
 * /api/knowledge/[articleId].  Allows pm, business_admin, super_admin,
 * catalog_admin.
 */
export async function passKnowledgeWriteGate(req: Request): Promise<KnowledgeGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email) return { ok: false, response: unauthorized() };
  if (!KNOWLEDGE_WRITE_ROLES.has(role)) {
    return {
      ok: false,
      response: forbidden('Forbidden: pm, business_admin, super_admin, or catalog_admin required'),
    };
  }
  return { ok: true, actorEmail: email, role };
}

/**
 * Triage gate — required for GET /api/knowledge/feedback.  Same role set as
 * the write gate; kept as a separate export so the call site documents intent.
 */
export async function passKnowledgeTriageGate(req: Request): Promise<KnowledgeGateResult> {
  return passKnowledgeWriteGate(req);
}

/**
 * Setup gate — required for POST /api/knowledge/setup.  super_admin only;
 * this route bootstraps backend Sheet tabs and must not be reachable by PMs.
 */
export async function passKnowledgeSetupGate(req: Request): Promise<KnowledgeGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email) return { ok: false, response: unauthorized() };
  if (!SETUP_ROLES.has(role)) {
    return { ok: false, response: forbidden('Forbidden: super_admin required') };
  }
  return { ok: true, actorEmail: email, role };
}

/**
 * Authenticated-user gate — required for feedback POST submit and the
 * parts / product-lines / sources read placeholders.  Any signed-in
 * kulaglass.com user with a resolved role (i.e. anything other than
 * 'none') is permitted.
 */
export async function passKnowledgeAuthGate(req: Request): Promise<KnowledgeGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email || role === 'none') {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, actorEmail: email, role };
}

/**
 * Inline helper for GET /api/knowledge — that route preserves anonymous
 * access (published-only) for unauthenticated callers, and only widens to
 * drafts when the caller is a KB manager.  Returns true when the caller
 * holds one of the WRITE roles.
 */
export async function isKnowledgeManager(req: Request): Promise<boolean> {
  const { role } = await resolveRole(req);
  return KNOWLEDGE_WRITE_ROLES.has(role);
}
