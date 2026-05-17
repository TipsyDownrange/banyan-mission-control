/**
 * BAN-309 Pass 3a.2 PR 3 — shared read gate for AIA CRUD list/GET routes.
 *
 * Read paths only need permission + tenant scoping; they do NOT pass through
 * `isPostgresWriteEnabled` (the write feature flag) or the staging-WO mutation
 * guard. Keeping this separate from `passAiaApiGate` per BAN-309 PR 2 lock
 * (api-gate.ts is consume-only in PR 3).
 */

import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/permissions';
import { getDefaultTenantId } from '@/lib/env';

export type AiaReadGateResult =
  | { ok: true; actorEmail: string; tenantId: string }
  | { ok: false; response: NextResponse };

export async function passAiaReadGate(req: Request): Promise<AiaReadGateResult> {
  const { allowed, email } = await checkPermission(req, 'project:view');
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: project:view required' },
        { status: 403 },
      ),
    };
  }
  return { ok: true, actorEmail: email ?? '', tenantId: getDefaultTenantId() };
}

export interface ListPagination {
  limit: number;
  offset: number;
}

export function parsePagination(url: URL, defaultLimit = 50, maxLimit = 200): ListPagination {
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '', 10);
  const rawOffset = parseInt(url.searchParams.get('offset') ?? '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  return { limit, offset };
}
