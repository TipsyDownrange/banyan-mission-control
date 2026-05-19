/**
 * War Room API auth gates.
 *
 * WARROOM-PERMISSIONS dispatch (2026-05-19): migrated from the hardcoded
 * WAR_ROOM_ROLES set to the env-overridable RolePermission system in
 * lib/permissions.ts.  Widening War Room access no longer requires a code
 * change + PR + deploy — set ROLE_PERMISSIONS_JSON in Vercel instead.
 *
 * Original (PR #188) rationale, preserved for context:
 *   War Room is the BanyanOS Ship's Bridge — the leadership cockpit under
 *   the "AI Command Center" sidebar section.  Its surfaces include
 *   cross-project signal queues with leadership "myWatch" framing, cost /
 *   runtime / source-health snapshots (financial + ops sensitivity), and
 *   a write endpoint that creates Linear command-board issues.  Defaults
 *   in ROLE_PERMISSIONS_DEFAULTS continue to grant access only to
 *   business_admin and super_admin to preserve PR #188 behavior.
 *
 * Read gate  (GET /api/war-room, GET /api/war-room/runtime-status,
 *             GET /api/war-room/source-health):
 *   passWarRoomGate → WARROOM_VIEW
 *
 * Write gate (POST /api/war-room/tasks → Linear dispatch):
 *   passWarRoomTaskGate → WARROOM_TASK_WRITE
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { passPermissionGate, type PermissionGateResult } from '@/lib/permissions';

/**
 * @deprecated Use the RolePermission system in lib/permissions.ts.
 *
 * Retained as a backward-compat export so anything still importing it does
 * not break, but no active call site references it.  War Room access is
 * resolved through ROLE_PERMISSIONS_DEFAULTS (env-overridable via
 * ROLE_PERMISSIONS_JSON), not this constant.
 */
export const WAR_ROOM_ROLES: ReadonlySet<string> = new Set([
  'business_admin',
  'super_admin',
]);

export type WarRoomGateResult = PermissionGateResult;

/**
 * War Room read gate — required for GET /api/war-room/*.  Delegates to
 * passPermissionGate(WARROOM_VIEW).
 */
export async function passWarRoomGate(_req: Request): Promise<WarRoomGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'WARROOM_VIEW');
}

/**
 * War Room task-dispatch write gate — required for POST /api/war-room/tasks.
 * Delegates to passPermissionGate(WARROOM_TASK_WRITE).
 */
export async function passWarRoomTaskGate(_req: Request): Promise<WarRoomGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'WARROOM_TASK_WRITE');
}
