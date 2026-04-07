/**
 * BanyanOS Permission System — SERVER SIDE ONLY
 *
 * Usage in an API route:
 *   const { allowed, role } = await checkPermission(request, 'wo:edit');
 *   if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
 */

import { getServerSession } from 'next-auth';
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
  | 'admin:all'
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
  gm:         ['admin:all'],
  owner:      ['admin:all'],
  service_pm: ['wo:create', 'wo:edit', 'wo:view', 'project:view', 'crew:view', 'reports:view'],
  super:      ['wo:create', 'wo:edit', 'wo:view', 'dispatch:assign', 'dispatch:create', 'project:view', 'crew:view', 'crew:edit', 'field:log', 'field:photo'],
  pm:         ['wo:view', 'project:view', 'project:edit', 'reports:view', 'crew:view'],
  estimator:  ['wo:view', 'project:view', 'estimating:view', 'estimating:edit'],
  admin_mgr:  ['wo:view', 'finance:view', 'project:view', 'crew:view', 'crew:edit', 'reports:view'],
  admin:      ['wo:view', 'project:view', 'crew:view'],
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
