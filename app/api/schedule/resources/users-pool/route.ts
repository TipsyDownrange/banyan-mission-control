/**
 * BAN-374 P5 — /api/schedule/resources/users-pool
 *
 *   GET  returns the active Postgres users in the tenant, sorted by name.
 *
 * Used by TaskResourceAssignmentDialog's user dropdown and the
 * UserScheduleView title column.  Intentionally scoped to the schedule
 * resource surface — not a general-purpose users API — so the read gate
 * matches the rest of /api/schedule/*.
 */

import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db, users } from '@/db';
import { passScheduleReadGate } from '@/lib/schedule/api-gate';

export async function GET() {
  const gate = await passScheduleReadGate();
  if (!gate.ok) return gate.response;

  const rows = await db
    .select({
      user_id: users.user_id,
      name: users.name,
      email: users.email,
      active: users.active,
    })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name), asc(users.email));

  // Tenant scoping note: the public.users table has no tenant_id column
  // (single-tenant Kula Glass deployment per BAN-374); the gate validates
  // the actor is part of the tenant before reaching this point.
  void gate.tenantId;

  return NextResponse.json({ items: rows });
}
