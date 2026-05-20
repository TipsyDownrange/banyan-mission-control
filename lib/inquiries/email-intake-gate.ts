/**
 * BAN-376 Customer Pipeline P2 — webhook-only auth gate for the email
 * intake endpoint. Distinct from passInquiryReadGate / passInquiryWriteGate
 * because the caller is Microsoft Graph (or an Outlook-side forwarding
 * script), not a NextAuth session.
 *
 * Spec §16: POST /api/inquiries/intake-email authenticates with a shared
 * secret header (X-Banyan-Intake-Secret) matched against the server-side
 * env var INTAKE_EMAIL_WEBHOOK_SECRET. The route returns 503 when the env
 * var is unset (so the operator can ship the route and configure the secret
 * separately without producing a hard 500), 401 on mismatch, and a resolved
 * tenant id on success.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, tenants } from '@/db';

export const INTAKE_SECRET_HEADER = 'x-banyan-intake-secret';
export const INTAKE_SECRET_ENV = 'INTAKE_EMAIL_WEBHOOK_SECRET';

export type IntakeSecretCheck =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Read INTAKE_EMAIL_WEBHOOK_SECRET, compare against the incoming header.
 * 503 if env unset (deploy-time gap, not a request error). 401 on mismatch
 * or missing header. Constant-time compare using a length-prefixed byte
 * comparison so the response time does not leak the secret length when
 * a non-empty header is supplied.
 */
export function checkIntakeSecret(headerValue: string | null | undefined): IntakeSecretCheck {
  const expected = String(process.env[INTAKE_SECRET_ENV] || '').trim();
  if (!expected) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `${INTAKE_SECRET_ENV} is not configured on the server.`,
          code: 'INTAKE_SECRET_UNSET',
        },
        { status: 503 },
      ),
    };
  }
  const supplied = String(headerValue || '');
  if (!supplied) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Missing ${INTAKE_SECRET_HEADER} header.` },
        { status: 401 },
      ),
    };
  }
  if (!constantTimeEqual(supplied, expected)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Invalid ${INTAKE_SECRET_HEADER} value.` },
        { status: 401 },
      ),
    };
  }
  return { ok: true };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export type TenantResolution =
  | { ok: true; tenantId: string; tenantKid: string }
  | { ok: false; response: NextResponse };

/**
 * Look up tenants.tenant_id by tenants.kid. The kid is taken from the
 * intake address (intake+{tenant_kid}@banyan-os.app). Returns a 404
 * NextResponse if no active tenant matches. Suspended/archived tenants
 * are intentionally excluded — they cannot accept new inquiries.
 */
export async function resolveTenantByKid(kid: string): Promise<TenantResolution> {
  const trimmed = String(kid || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'tenant kid is required' },
        { status: 400 },
      ),
    };
  }
  const rows = await db
    .select({ tenant_id: tenants.tenant_id, kid: tenants.kid, status: tenants.status })
    .from(tenants)
    .where(and(eq(tenants.kid, trimmed), eq(tenants.status, 'active')))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `No active tenant matches kid "${trimmed}".`, code: 'TENANT_NOT_FOUND' },
        { status: 404 },
      ),
    };
  }
  return { ok: true, tenantId: row.tenant_id as string, tenantKid: row.kid as string };
}
