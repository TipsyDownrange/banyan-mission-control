/**
 * BAN-376 Customer Pipeline — API gates for /api/inquiries/*.
 *
 * Follows the canonical RolePermission pattern (lib/permissions.ts) used by
 * BAN-374 Scheduling Spine.  INQUIRY_VIEW gates reads; INQUIRY_WRITE gates
 * mutations.  Returns the resolved tenant id + actor email/role for the
 * caller, or a NextResponse to return immediately on 401/403/503.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDefaultTenantId, isPostgresWriteEnabled } from '@/lib/env';
import { passPermissionGate } from '@/lib/permissions';

export type InquiryGateResult =
  | { ok: true; actorEmail: string; role: string; tenantId: string }
  | { ok: false; response: NextResponse };

export async function passInquiryReadGate(): Promise<InquiryGateResult> {
  const session = await getServerSession(authOptions);
  const gate = passPermissionGate(session, 'INQUIRY_VIEW');
  if (!gate.ok) return { ok: false, response: gate.response };
  return {
    ok: true,
    actorEmail: gate.actorEmail,
    role: gate.role,
    tenantId: getDefaultTenantId(),
  };
}

export async function passInquiryWriteGate(): Promise<InquiryGateResult> {
  const session = await getServerSession(authOptions);
  const gate = passPermissionGate(session, 'INQUIRY_WRITE');
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
