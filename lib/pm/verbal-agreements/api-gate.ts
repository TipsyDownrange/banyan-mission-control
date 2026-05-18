import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/permissions';
import { getDefaultTenantId, isPostgresWriteEnabled } from '@/lib/env';
import { blockWOStagingPostgresReadOnlyMutation } from '@/lib/service-work-orders/postgres-read-guard';

const WRITE_ROLES = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'catalog_admin',
  'field_super',
  'super',
]);

export type VerbalAgreementWriteGateResult =
  | { ok: true; actorEmail: string; tenantId: string; role: string }
  | { ok: false; response: NextResponse };

export async function passVerbalAgreementWriteGate(
  req: Request,
  routePath: string,
): Promise<VerbalAgreementWriteGateResult> {
  const { role, email } = await checkPermission(req, 'project:view');
  if (!WRITE_ROLES.has(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: pm, business_admin, super_admin, catalog_admin, or field_super required' },
        { status: 403 },
      ),
    };
  }

  const blocked = blockWOStagingPostgresReadOnlyMutation(routePath);
  if (blocked) return { ok: false, response: blocked };

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

  return { ok: true, actorEmail: email ?? '', tenantId: getDefaultTenantId(), role };
}
