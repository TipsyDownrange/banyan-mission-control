import { NextResponse } from 'next/server';
import { getDefaultTenantId } from '@/lib/env';
import { query } from '@/lib/work-records/db';
import { requireKulaSession, PM_ROLES } from '@/lib/work-records/authz';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireKulaSession();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tenantId = getDefaultTenantId();
  const [sites, users] = await Promise.all([
    query(
      `select s.site_id, s.name as site_name, s.address, s.city, s.island::text as island,
              o.org_id, o.name as org_name, o.kid as org_kid
         from sites s
         left join organizations o on o.org_id = s.org_id
        where coalesce(o.tenant_id, $1) = $1
        order by s.name asc
        limit 500`,
      [tenantId],
    ),
    query(
      `select user_id, name, email, role::text
         from users
        where role::text = any($1) and coalesce(active, true) = true
        order by name asc`,
      [PM_ROLES],
    ),
  ]);
  return NextResponse.json({ sites, pm_users: users });
}
