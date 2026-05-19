/**
 * BanyanOS Permission System — SERVER SIDE ONLY
 *
 * Usage in an API route:
 *   const { allowed, role } = await checkPermission(request, 'wo:edit');
 *   if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
 *
 * WARROOM-PERMISSIONS dispatch (2026-05-19): this file also hosts the new
 * uppercase RolePermission system (WARROOM_VIEW, WARROOM_TASK_WRITE, ...).
 * Consolidated here rather than split across lib/permissions{,-config,-gate}.ts
 * to honor the dispatch's STOP rule ("3 permissions files feels excessive —
 * consolidate to 1 or 2 + document the choice").  The new permissions are
 * env-overridable via ROLE_PERMISSIONS_JSON; the legacy kebab-case Permission
 * union remains the call surface for the existing API routes and is unchanged.
 */

import { getServerSession, type Session } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions, getRoleFromEmail } from '@/lib/auth';

// ── Permission Types ──────────────────────────────────────────────────────────

export type Permission =
  | 'wo:create'
  | 'wo:edit'
  | 'wo:dispatch'
  | 'wo:view'
  | 'finance:view'
  | 'dispatch:assign'
  | 'dispatch:create'
  | 'business:admin'
  | 'admin:all'
  | 'admin:backfill'
  // Future modules
  | 'project:view'
  | 'project:edit'
  | 'project:create'
  | 'estimating:view'
  | 'estimating:edit'
  | 'field:log'
  | 'field:photo'
  | 'crew:view'
  | 'crew:edit'
  | 'reports:view';

// ── Role → Permissions Map (hardcoded fallback) ───────────────────────────────

export const ROLE_PERMISSIONS_DEFAULT: Record<string, Permission[]> = {
  super_admin: ['admin:all'],
  gm:         ['admin:all'],
  owner:      ['admin:all'],
  business_admin: ['business:admin'],
  service_pm: ['wo:create', 'wo:edit', 'wo:view', 'project:view', 'crew:view', 'reports:view'],
  super:      ['wo:create', 'wo:edit', 'wo:view', 'dispatch:assign', 'dispatch:create', 'project:view', 'crew:view', 'crew:edit', 'field:log', 'field:photo'],
  pm:         ['wo:view', 'project:view', 'project:edit', 'reports:view', 'crew:view'],
  estimator:  ['wo:view', 'project:view', 'estimating:view', 'estimating:edit'],
  admin_mgr:  ['wo:view', 'finance:view', 'project:view', 'crew:view', 'crew:edit', 'reports:view'],
  admin:      ['wo:view', 'project:view', 'crew:view', 'reports:view'],
  field:      ['wo:view', 'field:log', 'field:photo'],
  pm_track:   ['wo:view', 'project:view', 'reports:view'],
  sales:      ['wo:view', 'estimating:view', 'project:view'],
  none:       [],
};

// ── Legacy alias ──────────────────────────────────────────────────────────────
// Keep ROLE_PERMISSIONS pointing at the default map for any code that imports it directly
export const ROLE_PERMISSIONS = ROLE_PERMISSIONS_DEFAULT;

// ── In-Memory Permissions Cache ───────────────────────────────────────────────

let permissionsCache: Record<string, Permission[]> | null = null;

/** Called by the POST endpoint after saving to sheet */
export function refreshPermissionsCache(): void {
  permissionsCache = null;
}

/** Used internally to update cache after a successful sheet write */
export function setPermissionsCache(data: Record<string, Permission[]>): void {
  permissionsCache = data;
}

/** Returns the current cache, or null if not loaded */
export function getPermissionsCache(): Record<string, Permission[]> | null {
  return permissionsCache;
}

// ── Core Permission Check ─────────────────────────────────────────────────────

export function roleHasPermission(role: string, permission: Permission): boolean {
  const source = permissionsCache || ROLE_PERMISSIONS_DEFAULT;
  const perms = source[role] || [];
  if (perms.includes('admin:all')) return true;
  return perms.includes(permission);
}

export function isBusinessAdmin(role: string): boolean {
  return role === 'business_admin';
}

export async function requireBusinessAdmin(): Promise<{ allowed: boolean; role: string; email: string | null }> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email || null;

  if (!email || !session) {
    return { allowed: false, role: 'none', email: null };
  }

  const sessionUser = session.user as { email: string; role?: string };
  const role = sessionUser.role || getRoleFromEmail(email);

  return { allowed: isBusinessAdmin(role), role, email };
}

/**
 * Core: check permission from the current server session (no req arg needed).
 */
export async function checkPermissionServer(
  permission: Permission
): Promise<{ allowed: boolean; role: string; email: string | null }> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email || null;

  if (!email || !session) {
    return { allowed: false, role: 'none', email: null };
  }

  // Prefer role stamped in session token (from auth callback)
  const sessionUser = session.user as { email: string; role?: string };
  const role = sessionUser.role || getRoleFromEmail(email);

  const allowed = roleHasPermission(role, permission);
  return { allowed, role, email };
}

/**
 * Convenience wrapper that accepts a Request arg (unused — kept for legacy call sites).
 */
export async function checkPermission(
  _req: Request,
  permission: Permission
): Promise<{ allowed: boolean; role: string; email: string | null }> {
  return checkPermissionServer(permission);
}

// ═══ Role → RolePermission system (WARROOM-PERMISSIONS, 2026-05-19) ═══════════
//
// Separate from the legacy kebab-case `Permission` union above.  This system
// is env-overridable (ROLE_PERMISSIONS_JSON) so widening War Room access — and
// future modules — does NOT require a code change + PR + deploy.  Falls back
// to ROLE_PERMISSIONS_DEFAULTS when the env var is unset or malformed, so the
// auth path is deterministic and offline-capable (no LLM calls, no network).
//
// To add a new module-scoped permission:
//   1. Extend the `RolePermission` union below.
//   2. Add the role-set defaults to ROLE_PERMISSIONS_DEFAULTS.
//   3. Replace the module's hardcoded-role gate with passPermissionGate(...).
//
// Future permissions to add when migrating peer api-gate modules:
//   - CONTACTS_READ / CONTACTS_WRITE  (lib/contacts/api-gate.ts)
//   - ORG_READ / ORG_WRITE            (organizations)
//   - PM_DOC_READ / PM_DOC_WRITE      (lib/pm/documents/api-gate.ts)
//   - SUGGESTION_VIEW / SUGGESTION_WRITE
//   - DAILY_REPORT_VIEW / DAILY_REPORT_WRITE
//
// KB_PERMISSIONS dispatch (2026-05-19, first peer migration following the
// WARROOM-PERMISSIONS template): KB_VIEW / KB_WRITE / KB_TRIAGE / KB_SETUP
// reproduce BAN-355's behavior — KB_WRITE / KB_TRIAGE granted to pm,
// business_admin, super_admin, catalog_admin; KB_SETUP restricted to
// super_admin only (matches BAN-355's setup-route role gate).  KB_VIEW is
// granted broadly so future explicit-view gates remain backward-compat with
// today's any-authenticated-user read pattern; GET /api/knowledge stays
// anonymous-tolerant via the inline isKnowledgeManager helper.

export type RolePermission =
  | 'WARROOM_VIEW'
  | 'WARROOM_TASK_WRITE'
  | 'KB_VIEW'
  | 'KB_WRITE'
  | 'KB_TRIAGE'
  | 'KB_SETUP'
  // Daily Report (peer migration)
  | 'DAILY_REPORT_VIEW'
  | 'DAILY_REPORT_WRITE'
  // Contacts (peer migration)
  | 'CONTACTS_VIEW'
  | 'CONTACTS_WRITE'
  // Organizations (peer migration)
  | 'ORG_VIEW'
  | 'ORG_WRITE'
  // Suggestions (peer migration)
  | 'SUGGESTIONS_VIEW'
  | 'SUGGESTIONS_REVIEW'
  // Work Breakdown (peer migration)
  | 'WORK_BREAKDOWN_VIEW'
  | 'WORK_BREAKDOWN_WRITE'
  // PM Documents (peer migration)
  | 'PM_DOCUMENT_VIEW'
  | 'PM_DOCUMENT_WRITE';

export const ALL_ROLE_PERMISSIONS: ReadonlyArray<RolePermission> = [
  'WARROOM_VIEW',
  'WARROOM_TASK_WRITE',
  'KB_VIEW',
  'KB_WRITE',
  'KB_TRIAGE',
  'KB_SETUP',
  // Daily Report (peer migration)
  'DAILY_REPORT_VIEW',
  'DAILY_REPORT_WRITE',
  // Contacts (peer migration)
  'CONTACTS_VIEW',
  'CONTACTS_WRITE',
  // Organizations (peer migration)
  'ORG_VIEW',
  'ORG_WRITE',
  // Suggestions (peer migration)
  'SUGGESTIONS_VIEW',
  'SUGGESTIONS_REVIEW',
  // Work Breakdown (peer migration)
  'WORK_BREAKDOWN_VIEW',
  'WORK_BREAKDOWN_WRITE',
  // PM Documents (peer migration)
  'PM_DOCUMENT_VIEW',
  'PM_DOCUMENT_WRITE',
];

/**
 * Default role → permissions map.  Preserves PR #188 / BAN-355 / PR #187 /
 * PR #189 behavior when ROLE_PERMISSIONS_JSON is unset:
 *   - War Room: business_admin + super_admin only.
 *   - KB write/triage: pm, business_admin, super_admin, catalog_admin.
 *   - KB setup: super_admin only.
 *   - KB view: every documented role except 'none'.
 *   - Contacts write: pm, business_admin, super_admin, service_pm, estimator,
 *       sales (preserves PR #187 CONTACTS_WRITE_ROLES exactly).
 *   - Contacts view: every documented role except 'none' (preserves the
 *       passContactsAuthGate behavior — any authenticated non-'none' role).
 *   - Org write: pm, business_admin, super_admin, service_pm, estimator,
 *       sales (preserves PR #189 ORGANIZATIONS_WRITE_ROLES exactly; matches
 *       contacts since OrganizationsPanel mutates both side-by-side).
 *   - Org view: every documented role except 'none' (preserves the
 *       passOrganizationsAuthGate behavior — any authenticated non-'none'
 *       role; ContactAutocomplete / OrganizationAutocomplete rely on this).
 *   - Suggestions view: every documented role except 'none' (preserves the
 *       passSuggestionsAuthGate behavior — universal SuggestionButton).
 *   - Suggestions review: pm, business_admin, super_admin, service_pm
 *       (preserves PR #190 SUGGESTIONS_REVIEW_ROLES exactly; PM/admin
 *       triage queue scope).
 *   - Work Breakdown view: every documented role except 'none' (preserves
 *       passWorkBreakdownAuthGate behavior — multiple read-only panels
 *       render WorkBreakdown).
 *   - Work Breakdown write: pm, service_pm, estimator, business_admin,
 *       super_admin (preserves PR #193 WORK_BREAKDOWN_WRITE_ROLES exactly;
 *       operational PM scope, no field/sales).
 *   - PM Documents view: pm, business_admin, super_admin, catalog_admin,
 *       field_super, super (preserves BAN-345 / PR #181 CROSS_PROJECT_ROLES
 *       exactly).
 *   - PM Documents write: pm, business_admin, super_admin, catalog_admin,
 *       field_super, super (preserves BAN-345 / PR #181 WRITE_ROLES exactly;
 *       field_super is further restricted to PHOTO_PACKAGE at the route
 *       level via roleMayWriteKind).
 *
 * Note: field_super is a Document-Hub-only role with no other module grants;
 * it appears in ROLE_PERMISSIONS_DEFAULTS as an addressable key.
 */
export const ROLE_PERMISSIONS_DEFAULTS: Record<string, RolePermission[]> = {
  // Daily Report + Contacts + Organizations + Suggestions + Work Breakdown +
  // PM Documents (peer migrations).  VIEW grants for the broad-read modules
  // are wide (every documented role except 'none').  Daily Report WRITE: pm,
  // business_admin, super_admin, service_pm, super (PR #191).  Contacts WRITE:
  // pm, business_admin, super_admin, service_pm, estimator, sales (PR #187).
  // Org WRITE: pm, business_admin, super_admin, service_pm, estimator, sales
  // (PR #189 — matches contacts).  Suggestions REVIEW: pm, business_admin,
  // super_admin, service_pm (PR #190).  Work Breakdown WRITE: pm, service_pm,
  // estimator, business_admin, super_admin (PR #193).  PM Document
  // VIEW/WRITE: pm, business_admin, super_admin, catalog_admin, field_super,
  // super (BAN-345 / PR #181 — unlike other modules, the view and write sets
  // match because Document Hub is a PM/admin operational surface, not a
  // broad read surface; non-PM read consumers don't exist).
  super_admin:    ['WARROOM_VIEW', 'WARROOM_TASK_WRITE', 'KB_VIEW', 'KB_WRITE', 'KB_TRIAGE', 'KB_SETUP', 'DAILY_REPORT_VIEW', 'DAILY_REPORT_WRITE', 'CONTACTS_VIEW', 'CONTACTS_WRITE', 'ORG_VIEW', 'ORG_WRITE', 'SUGGESTIONS_VIEW', 'SUGGESTIONS_REVIEW', 'WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE', 'PM_DOCUMENT_VIEW', 'PM_DOCUMENT_WRITE'],
  business_admin: ['WARROOM_VIEW', 'WARROOM_TASK_WRITE', 'KB_VIEW', 'KB_WRITE', 'KB_TRIAGE', 'DAILY_REPORT_VIEW', 'DAILY_REPORT_WRITE', 'CONTACTS_VIEW', 'CONTACTS_WRITE', 'ORG_VIEW', 'ORG_WRITE', 'SUGGESTIONS_VIEW', 'SUGGESTIONS_REVIEW', 'WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE', 'PM_DOCUMENT_VIEW', 'PM_DOCUMENT_WRITE'],
  gm:             ['KB_VIEW', 'DAILY_REPORT_VIEW', 'CONTACTS_VIEW', 'ORG_VIEW', 'SUGGESTIONS_VIEW', 'WORK_BREAKDOWN_VIEW'],
  owner:          ['KB_VIEW', 'DAILY_REPORT_VIEW', 'CONTACTS_VIEW', 'ORG_VIEW', 'SUGGESTIONS_VIEW', 'WORK_BREAKDOWN_VIEW'],
  service_pm:     ['KB_VIEW', 'DAILY_REPORT_VIEW', 'DAILY_REPORT_WRITE', 'CONTACTS_VIEW', 'CONTACTS_WRITE', 'ORG_VIEW', 'ORG_WRITE', 'SUGGESTIONS_VIEW', 'SUGGESTIONS_REVIEW', 'WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE'],
  super:          ['KB_VIEW', 'DAILY_REPORT_VIEW', 'DAILY_REPORT_WRITE', 'CONTACTS_VIEW', 'ORG_VIEW', 'SUGGESTIONS_VIEW', 'WORK_BREAKDOWN_VIEW', 'PM_DOCUMENT_VIEW', 'PM_DOCUMENT_WRITE'],
  pm:             ['KB_VIEW', 'KB_WRITE', 'KB_TRIAGE', 'DAILY_REPORT_VIEW', 'DAILY_REPORT_WRITE', 'CONTACTS_VIEW', 'CONTACTS_WRITE', 'ORG_VIEW', 'ORG_WRITE', 'SUGGESTIONS_VIEW', 'SUGGESTIONS_REVIEW', 'WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE', 'PM_DOCUMENT_VIEW', 'PM_DOCUMENT_WRITE'],
  estimator:      ['KB_VIEW', 'DAILY_REPORT_VIEW', 'CONTACTS_VIEW', 'CONTACTS_WRITE', 'ORG_VIEW', 'ORG_WRITE', 'SUGGESTIONS_VIEW', 'WORK_BREAKDOWN_VIEW', 'WORK_BREAKDOWN_WRITE'],
  admin_mgr:      ['KB_VIEW', 'DAILY_REPORT_VIEW', 'CONTACTS_VIEW', 'ORG_VIEW', 'SUGGESTIONS_VIEW', 'WORK_BREAKDOWN_VIEW'],
  admin:          ['KB_VIEW', 'DAILY_REPORT_VIEW', 'CONTACTS_VIEW', 'ORG_VIEW', 'SUGGESTIONS_VIEW', 'WORK_BREAKDOWN_VIEW'],
  field:          ['KB_VIEW', 'DAILY_REPORT_VIEW', 'CONTACTS_VIEW', 'ORG_VIEW', 'SUGGESTIONS_VIEW', 'WORK_BREAKDOWN_VIEW'],
  pm_track:       ['KB_VIEW', 'DAILY_REPORT_VIEW', 'CONTACTS_VIEW', 'ORG_VIEW', 'SUGGESTIONS_VIEW', 'WORK_BREAKDOWN_VIEW'],
  sales:          ['KB_VIEW', 'DAILY_REPORT_VIEW', 'CONTACTS_VIEW', 'CONTACTS_WRITE', 'ORG_VIEW', 'ORG_WRITE', 'SUGGESTIONS_VIEW', 'WORK_BREAKDOWN_VIEW'],
  catalog_admin:  ['KB_VIEW', 'KB_WRITE', 'KB_TRIAGE', 'DAILY_REPORT_VIEW', 'CONTACTS_VIEW', 'ORG_VIEW', 'SUGGESTIONS_VIEW', 'WORK_BREAKDOWN_VIEW', 'PM_DOCUMENT_VIEW', 'PM_DOCUMENT_WRITE'],
  // field_super is a Document-Hub-specific role (BAN-345); it gets the broad
  // VIEW grants to match the prior "any non-none role" read pattern other
  // modules use, plus PM_DOCUMENT_* (route-level restricted to PHOTO_PACKAGE
  // uploads via roleMayWriteKind).
  field_super:    ['KB_VIEW', 'DAILY_REPORT_VIEW', 'CONTACTS_VIEW', 'ORG_VIEW', 'SUGGESTIONS_VIEW', 'WORK_BREAKDOWN_VIEW', 'PM_DOCUMENT_VIEW', 'PM_DOCUMENT_WRITE'],
  none:           [],
};

let rolePermissionsCache: Record<string, RolePermission[]> | undefined;

/**
 * Parse a ROLE_PERMISSIONS_JSON string.  Returns the parsed map on success,
 * null on any malformed input (missing object, wrong types, unknown
 * permission strings).  Never throws — the caller falls back to defaults.
 */
export function parseRolePermissions(raw: string | undefined | null): Record<string, RolePermission[]> | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const known = new Set<RolePermission>(ALL_ROLE_PERMISSIONS);
  const result: Record<string, RolePermission[]> = {};
  for (const [role, perms] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(perms)) return null;
    const cleaned: RolePermission[] = [];
    for (const p of perms) {
      if (typeof p !== 'string') return null;
      if (!known.has(p as RolePermission)) return null;
      cleaned.push(p as RolePermission);
    }
    result[role] = cleaned;
  }
  return result;
}

/**
 * Resolve the active role → permissions map.  Memoized for the process
 * lifetime so the env var is parsed once.  Defaults are used when the env
 * var is unset or malformed.
 */
export function getRolePermissions(): Record<string, RolePermission[]> {
  if (rolePermissionsCache) return rolePermissionsCache;
  const parsed = parseRolePermissions(process.env.ROLE_PERMISSIONS_JSON);
  rolePermissionsCache = parsed ?? ROLE_PERMISSIONS_DEFAULTS;
  return rolePermissionsCache;
}

/** Test-only reset hook — used by __tests__/permissions.test.ts. */
export function resetRolePermissionsCacheForTests(): void {
  rolePermissionsCache = undefined;
}

type SessionLike = Session | null | undefined;

function sessionRole(session: SessionLike): { email: string | null; role: string } {
  const email = session?.user?.email ?? null;
  if (!email) return { email: null, role: 'none' };
  const stamped = (session?.user as { role?: string } | undefined)?.role;
  const role = stamped || getRoleFromEmail(email);
  return { email, role };
}

/**
 * Synchronous permission check from a NextAuth session.  Returns false for
 * missing sessions, unknown roles, and roles whose permission list does not
 * include `permission`.  Pure config lookup + role-set membership — no
 * network, no LLM, no DB.
 */
export function hasPermission(session: SessionLike, permission: RolePermission): boolean {
  const { email, role } = sessionRole(session);
  if (!email) return false;
  const perms = getRolePermissions()[role];
  return Array.isArray(perms) && perms.includes(permission);
}

export type PermissionGateResult =
  | { ok: true; actorEmail: string; role: string }
  | { ok: false; response: NextResponse };

/**
 * Generic API-route permission gate — mirrors the shape of passWarRoomGate
 * for drop-in replacement in future module migrations.  Returns 401 when no
 * session, 403 when the resolved role lacks `permission`.
 */
export function passPermissionGate(
  session: SessionLike,
  permission: RolePermission,
): PermissionGateResult {
  const { email, role } = sessionRole(session);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const perms = getRolePermissions()[role];
  if (!Array.isArray(perms) || !perms.includes(permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Forbidden: missing permission ${permission}` },
        { status: 403 },
      ),
    };
  }
  return { ok: true, actorEmail: email, role };
}
