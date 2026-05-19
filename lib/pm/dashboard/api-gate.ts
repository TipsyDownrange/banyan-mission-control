/**
 * BAN-348 PM-V1.0-I — PM Overview Dashboard read/write gates.
 *
 * Read gate (GET layout, GET widget data) allows any PM-class role.
 * Write gate (PATCH/DELETE layout) requires the same set; layouts are
 * per-user so we don't need the broader admin permission.  Per-widget
 * senior gating is enforced at the route level (see canRoleSeeWidget).
 *
 * Resolves the caller's user_id from the NextAuth session email so we
 * can scope queries to (tenant_id, user_id, dashboard_kind) without
 * trusting any client-supplied identifier.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { authOptions, getRoleFromEmail } from '@/lib/auth';
import { getDefaultTenantId, isPostgresWriteEnabled } from '@/lib/env';
import { db, users } from '@/db';
import {
  PM_DASHBOARD_ROLES,
  canRoleSeeDashboard,
  dashboardKindForRole,
  type DashboardKind,
} from './types';

export type PmDashboardReadGateResult =
  | {
      ok: true;
      actorEmail: string;
      tenantId: string;
      role: string;
      userId: string;
      dashboardKind: DashboardKind;
    }
  | { ok: false; response: NextResponse };

export type PmDashboardWriteGateResult = PmDashboardReadGateResult;

async function resolveCallerUserId(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await db
    .select({ user_id: users.user_id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  return rows[0]?.user_id ?? null;
}

export async function passPmDashboardReadGate(): Promise<PmDashboardReadGateResult> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase() || '';
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const sessionRole = (session!.user as { role?: string } | undefined)?.role;
  const role = sessionRole || getRoleFromEmail(email);
  if (!canRoleSeeDashboard(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Forbidden: PM Overview Dashboard requires one of ${[...PM_DASHBOARD_ROLES].join(', ')}` },
        { status: 403 },
      ),
    };
  }
  const userId = await resolveCallerUserId(email);
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: caller has no users row' },
        { status: 403 },
      ),
    };
  }
  return {
    ok: true,
    actorEmail: email,
    tenantId: getDefaultTenantId(),
    role,
    userId,
    dashboardKind: dashboardKindForRole(role),
  };
}

export async function passPmDashboardWriteGate(): Promise<PmDashboardWriteGateResult> {
  const gate = await passPmDashboardReadGate();
  if (!gate.ok) return gate;
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
  return gate;
}
