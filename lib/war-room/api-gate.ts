/**
 * WARROOM-PERMISSIONS — War Room API auth gates (permission-based).
 *
 * Originally introduced by BAN-355 follow-up (MC-AUTH-PHASE2-WARROOM) as a
 * hardcoded role-list gate.  This module now delegates to the env-driven
 * permission system in `lib/permissions-gate.ts`:
 *
 *   - `passWarRoomGate(req)`       → `passPermissionGate(req, 'WARROOM_VIEW')`
 *   - `passWarRoomTaskGate(req)`   → `passPermissionGate(req, 'WARROOM_TASK_WRITE')`
 *
 * Default mapping (when `ROLE_PERMISSIONS_JSON` is unset) preserves PR #188
 * behavior: only `business_admin` and `super_admin` hold WARROOM_VIEW and
 * WARROOM_TASK_WRITE.  Widening access is now a Vercel env-var edit, not a
 * code-change-and-deploy.
 *
 * War Room is the canonical prototype for permission-based access.  Future
 * dispatches migrate KB, contacts, organizations, suggestions, daily-report,
 * work-breakdown, and PM documents to the same pattern.
 */

import type { NextResponse } from 'next/server';
import { passPermissionGate } from '@/lib/permissions-gate';

/**
 * @deprecated Kept for backward compatibility with the BAN-355 follow-up
 * dispatch and the `__tests__/mcAuthPhase2WarRoom.test.ts` role-set sanity
 * check.  Active access decisions now flow through `ROLE_PERMISSIONS_DEFAULTS`
 * in `lib/permissions-config.ts` and the `ROLE_PERMISSIONS_JSON` env override.
 * Do not add new call sites; widen access via the env var instead.
 */
export const WAR_ROOM_ROLES: ReadonlySet<string> = new Set([
  'business_admin',
  'super_admin',
]);

export type WarRoomGateResult =
  | { ok: true; actorEmail: string; role: string }
  | { ok: false; response: NextResponse };

/**
 * War Room read gate — required for every `/api/war-room/*` route that
 * serves dashboard / runtime-status / source-health reads.  Delegates to
 * the WARROOM_VIEW permission check.
 */
export async function passWarRoomGate(req: Request): Promise<WarRoomGateResult> {
  return passPermissionGate(req, 'WARROOM_VIEW');
}

/**
 * War Room task-write gate — required for POST `/api/war-room/tasks` (the
 * Linear command-board dispatch write).  Delegates to the
 * WARROOM_TASK_WRITE permission check, which defaults to the same role set
 * as WARROOM_VIEW but can be tightened or widened independently via
 * `ROLE_PERMISSIONS_JSON`.
 */
export async function passWarRoomTaskGate(req: Request): Promise<WarRoomGateResult> {
  return passPermissionGate(req, 'WARROOM_TASK_WRITE');
}
