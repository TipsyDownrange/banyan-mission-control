/**
 * BAN-355 follow-up (MC-AUTH-PHASE2-WARROOM) — War Room API auth gates.
 *
 * Migrates /api/war-room/* off the email-endsWith anti-pattern onto the
 * canonical role-based gate pattern used by the rest of the BanyanOS API
 * surface (see lib/knowledge/api-gate.ts and lib/pm/documents/api-gate.ts).
 *
 * Role set rationale — TIGHT (business_admin | super_admin):
 *
 * War Room is the BanyanOS Ship's Bridge — the leadership cockpit under the
 * "AI Command Center" sidebar section.  Its surfaces include:
 *   - cross-project signal queues with leadership "myWatch" framing,
 *   - cost / runtime / source-health snapshots (financial + ops sensitivity),
 *   - a write endpoint that creates Linear command-board issues.
 *
 * None of those are project-scoped operational reads.  PMs already have
 * project-level surfaces; war-room intentionally surfaces org-level state
 * intended for GM / business_admin / super_admin review and dispatch.  The
 * dispatch packet for this work explicitly identified `business_admin |
 * super_admin only` as the appropriate set for leadership content.
 *
 * The pre-existing email-endsWith gate permitted any @kulaglass.com user;
 * this migration is therefore a tightening as well as a pattern fix.  If
 * `gm` / `owner` roles need access in the future, expand WAR_ROOM_ROLES in
 * one place rather than re-introducing email matching.
 */

import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/permissions';

export const WAR_ROOM_ROLES: ReadonlySet<string> = new Set([
  'business_admin',
  'super_admin',
]);

export type WarRoomGateResult =
  | { ok: true; actorEmail: string; role: string }
  | { ok: false; response: NextResponse };

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function forbidden(): NextResponse {
  return NextResponse.json(
    { error: 'Forbidden: business_admin or super_admin required' },
    { status: 403 },
  );
}

/**
 * War Room gate — required for every /api/war-room/* route (read + write).
 * The leadership surface is uniform: same role set guards dashboard reads,
 * runtime/source-health reads, and the Linear dispatch write.
 */
export async function passWarRoomGate(req: Request): Promise<WarRoomGateResult> {
  const { role, email } = await checkPermission(req, 'project:view');
  if (!email) return { ok: false, response: unauthorized() };
  if (!WAR_ROOM_ROLES.has(role)) {
    return { ok: false, response: forbidden() };
  }
  return { ok: true, actorEmail: email, role };
}
