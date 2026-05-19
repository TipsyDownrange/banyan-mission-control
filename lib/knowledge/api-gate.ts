/**
 * BAN-355 — Knowledge Base API auth gates.
 *
 * KB-PERMISSIONS dispatch (2026-05-19, first peer migration after
 * WARROOM-PERMISSIONS PR #192): migrated from the hardcoded
 * KNOWLEDGE_WRITE_ROLES / SETUP_ROLES sets to the env-overridable
 * RolePermission system in lib/permissions.ts.  Widening KB access no longer
 * requires a code change + PR + deploy — set ROLE_PERMISSIONS_JSON in Vercel
 * instead.
 *
 * Original (BAN-355) rationale, preserved for context:
 *   Migrates KB routes off the email-endsWith anti-pattern onto the canonical
 *   role-based gate pattern used by the rest of the BanyanOS API surface (see
 *   lib/pm/action-items/api-gate.ts and lib/pm/documents/api-gate.ts).
 *
 *   Roles (preserved exactly by ROLE_PERMISSIONS_DEFAULTS):
 *     - WRITE / TRIAGE: pm, business_admin, super_admin, catalog_admin
 *         (article create/patch/delete, feedback triage list)
 *     - SETUP: super_admin only (KB tab bootstrap)
 *     - AUTH: any authenticated kulaglass.com user (feedback POST submit;
 *         parts / product-lines / sources read placeholders)
 *
 * Gate → permission mapping:
 *   passKnowledgeWriteGate  → KB_WRITE
 *   passKnowledgeTriageGate → KB_TRIAGE
 *   passKnowledgeSetupGate  → KB_SETUP
 *   passKnowledgeAuthGate   → any signed-in kulaglass.com user (no permission;
 *                             retained because submit feedback is intentionally
 *                             open to all authenticated users, not gated on
 *                             KB_VIEW)
 *   isKnowledgeManager      → hasPermission(KB_WRITE) — drives the GET
 *                             /api/knowledge anonymous-tolerant draft widening
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getRoleFromEmail } from '@/lib/auth';
import {
  hasPermission,
  passPermissionGate,
  type PermissionGateResult,
} from '@/lib/permissions';

/**
 * @deprecated Use the RolePermission system in lib/permissions.ts (KB_WRITE /
 * KB_TRIAGE / KB_SETUP).  Retained as a backward-compat export so anything
 * still importing it does not break, but no active call site references it.
 * KB access is resolved through ROLE_PERMISSIONS_DEFAULTS (env-overridable
 * via ROLE_PERMISSIONS_JSON), not this constant.
 */
export const KNOWLEDGE_WRITE_ROLES: ReadonlySet<string> = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'catalog_admin',
]);

export type KnowledgeGateResult = PermissionGateResult;

/**
 * Write gate — required for POST /api/knowledge, PATCH/DELETE
 * /api/knowledge/[articleId].  Delegates to passPermissionGate(KB_WRITE).
 */
export async function passKnowledgeWriteGate(_req: Request): Promise<KnowledgeGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'KB_WRITE');
}

/**
 * Triage gate — required for GET /api/knowledge/feedback.  Delegates to
 * passPermissionGate(KB_TRIAGE).  Same default role set as the write gate, but
 * kept as a separate permission so env-overrides can scope triage and write
 * independently.
 */
export async function passKnowledgeTriageGate(_req: Request): Promise<KnowledgeGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'KB_TRIAGE');
}

/**
 * Setup gate — required for POST /api/knowledge/setup.  Delegates to
 * passPermissionGate(KB_SETUP).  Default is super_admin only — this route
 * bootstraps backend Sheet tabs and must not be reachable by PMs.
 */
export async function passKnowledgeSetupGate(_req: Request): Promise<KnowledgeGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'KB_SETUP');
}

/**
 * Authenticated-user gate — required for feedback POST submit and the
 * parts / product-lines / sources read placeholders.  Any signed-in
 * kulaglass.com user with a resolved role (i.e. anything other than
 * 'none') is permitted.  Not modeled as a RolePermission because the intent
 * is "any signed-in user," not "any role granted a specific capability."
 */
export async function passKnowledgeAuthGate(_req: Request): Promise<KnowledgeGateResult> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const stamped = (session?.user as { role?: string } | undefined)?.role;
  const role = stamped || getRoleFromEmail(email);
  if (role === 'none') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, actorEmail: email, role };
}

/**
 * Inline helper for GET /api/knowledge — that route preserves anonymous
 * access (published-only) for unauthenticated callers, and only widens to
 * drafts when the caller is a KB manager.  Returns true when the caller
 * holds the KB_WRITE permission.
 */
export async function isKnowledgeManager(_req: Request): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return hasPermission(session, 'KB_WRITE');
}
