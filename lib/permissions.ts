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
  | 'admin:all';

// ── Role → Permissions Map ────────────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  gm:         ['admin:all'],
  owner:      ['admin:all'],
  service_pm: ['wo:create', 'wo:edit', 'wo:view'],
  super:      ['wo:edit', 'wo:view', 'dispatch:assign', 'dispatch:create'],
  pm:         ['wo:view'],
  estimator:  ['wo:view'],
  admin_mgr:  ['wo:view', 'finance:view'],
  admin:      ['wo:view'],
  field:      ['wo:view'],
  pm_track:   ['wo:view'],
  sales:      ['wo:view'],
  none:       [],
};

// ── Core Permission Check ─────────────────────────────────────────────────────

export function roleHasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
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
