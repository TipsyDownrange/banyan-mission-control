/**
 * BAN-374 Scheduling Spine — API gates for /api/schedule/*.
 *
 * Follows the canonical RolePermission pattern (lib/permissions.ts).
 * SCHEDULE_VIEW gates reads; SCHEDULE_WRITE gates mutations.  Returns the
 * resolved tenant id + actor email/role for the caller, or a NextResponse to
 * return immediately on 401/403.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDefaultTenantId, isPostgresWriteEnabled } from '@/lib/env';
import { passPermissionGate } from '@/lib/permissions';

export type ScheduleGateResult =
  | { ok: true; actorEmail: string; role: string; tenantId: string }
  | { ok: false; response: NextResponse };

export async function passScheduleReadGate(): Promise<ScheduleGateResult> {
  const session = await getServerSession(authOptions);
  const gate = passPermissionGate(session, 'SCHEDULE_VIEW');
  if (!gate.ok) return { ok: false, response: gate.response };
  return {
    ok: true,
    actorEmail: gate.actorEmail,
    role: gate.role,
    tenantId: getDefaultTenantId(),
  };
}

export async function passScheduleWriteGate(): Promise<ScheduleGateResult> {
  const session = await getServerSession(authOptions);
  const gate = passPermissionGate(session, 'SCHEDULE_WRITE');
  if (!gate.ok) return { ok: false, response: gate.response };
  if (!isPostgresWriteEnabled()) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Postgres writes are disabled in this environment.',
          code: 'POSTGRES_WRITE_DISABLED',
        },
        { status: 503 },
      ),
    };
  }
  return {
    ok: true,
    actorEmail: gate.actorEmail,
    role: gate.role,
    tenantId: getDefaultTenantId(),
  };
}
