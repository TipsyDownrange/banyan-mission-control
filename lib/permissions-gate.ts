/**
 * BanyanOS Permission Gate — request / session integration for the
 * env-driven permission system in `lib/permissions-config.ts`.
 *
 * Two entry points:
 *
 *   - `hasPermission(session, permission)` — pure boolean check for use in
 *     server components and page-level redirect guards (e.g.
 *     `app/war-room/page.tsx`).  Accepts the already-resolved next-auth
 *     session so the caller doesn't pay for a second `getServerSession`.
 *
 *   - `passPermissionGate(req, permission)` — mirrors the
 *     `passWarRoomGate(req)` signature so `lib/war-room/api-gate.ts` (and
 *     future peer api-gate.ts modules) can delegate cleanly without
 *     restructuring their call sites.
 *
 * Without-Kai behavior: every check here is a pure config lookup against the
 * memoized map from `getRolePermissions()` plus a role-set membership test.
 * Zero LLM calls, zero network calls, zero DB calls.  Safe defaults apply if
 * the override env var is unset or malformed.
 */

import { NextResponse } from 'next/server';
import { getServerSession, type Session } from 'next-auth';
import { authOptions, getRoleFromEmail } from '@/lib/auth';
import { getRolePermissions, type BanyanPermission } from '@/lib/permissions-config';

type SessionLike = Session | null | undefined;

function roleFromSession(session: NonNullable<SessionLike>): string {
  const sessionUser = session.user as { email?: string; role?: string } | undefined;
  if (sessionUser?.role) return sessionUser.role;
  if (sessionUser?.email) return getRoleFromEmail(sessionUser.email);
  return 'none';
}

/**
 * Pure boolean permission check.  Returns false for any session without an
 * email, an unknown role, or a role whose mapping does not include the
 * requested permission.
 */
export function hasPermission(session: SessionLike, permission: BanyanPermission): boolean {
  if (!session?.user?.email) return false;
  const role = roleFromSession(session);
  const map = getRolePermissions();
  const perms = map[role] || [];
  return perms.includes(permission);
}

export type PermissionGateResult =
  | { ok: true; actorEmail: string; role: string }
  | { ok: false; response: NextResponse };

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function forbidden(permission: BanyanPermission): NextResponse {
  return NextResponse.json(
    { error: `Forbidden: ${permission} permission required` },
    { status: 403 },
  );
}

/**
 * API-route gate.  Returns `{ ok: true, actorEmail, role }` on success or
 * `{ ok: false, response }` with a ready-to-return 401 / 403 NextResponse.
 *
 * The `req` parameter is accepted for signature parity with `passWarRoomGate`
 * and the legacy `checkPermission(req, perm)` wrapper; the underlying session
 * read uses next-auth's request-scoped helpers internally.
 */
export async function passPermissionGate(
  _req: Request,
  permission: BanyanPermission,
): Promise<PermissionGateResult> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email || null;
  if (!session || !email) {
    return { ok: false, response: unauthorized() };
  }
  const role = roleFromSession(session);
  const map = getRolePermissions();
  if (!(map[role] || []).includes(permission)) {
    return { ok: false, response: forbidden(permission) };
  }
  return { ok: true, actorEmail: email, role };
}
