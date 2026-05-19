/**
 * MC-AUTH-PHASE2-DAILY-REPORT (BAN-355 follow-up) — Daily Report API auth gates.
 *
 * Migrates /api/daily-report/* off the email-endsWith anti-pattern onto the
 * canonical role-based gate pattern used by the rest of the BanyanOS API
 * surface (mirrors lib/contacts/api-gate.ts and lib/knowledge/api-gate.ts).
 *
 * Role set rationale — BROAD (operational, not leadership):
 *
 * Daily reports are operational PM/field content, not leadership cockpit
 * content.  The PDF generation surface is consumed two ways:
 *
 *   1. MC (browser session): a PM / business_admin / super_admin opens the
 *      ActivityTimeline panel and downloads a Daily Report PDF for review.
 *      This is a read-side artifact regeneration over already-submitted
 *      Field_Events_V1 rows — no new operational data is created here.
 *
 *   2. FA (server-to-server): the Field App auto-triggers PDF generation
 *      after a field super submits a daily report.  That path uses the
 *      shared INTERNAL_API_KEY header and bypasses the session gate by
 *      design (server-to-server, not user-driven).
 *
 * Because the user-facing call path is a read of artifact data, the gate
 * is BROAD: any authenticated kulaglass.com user with a resolved role
 * (anything other than 'none') is permitted.  The route still enforces
 * narrower business rules at the data layer (e.g. event_id presence) and
 * the FA path is gated by the internal key, not by the user gate.
 *
 * DAILY_REPORT_WRITE_ROLES is exported for future write-side endpoints
 * (draft create/edit, manual submission from MC, etc.).  The set includes:
 *
 *   - pm / business_admin / super_admin / service_pm — office-side PMs who
 *     review and finalize daily reports;
 *   - super — the field superintendent who submits daily reports in FA and
 *     may need to correct them from MC.
 *
 * The pre-existing email-endsWith gate permitted any @kulaglass.com user;
 * this migration preserves that behavior for the read path while moving the
 * check onto the role-based gate pattern so future tightening / widening
 * happens in one place.
 */

import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/permissions';

export const DAILY_REPORT_WRITE_ROLES: ReadonlySet<string> = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'service_pm',
  'super',
]);

export type DailyReportGateResult =
  | { ok: true; actorEmail: string; role: string }
  | { ok: false; response: NextResponse };

async function resolveRole(req: Request): Promise<{ role: string; email: string | null }> {
  const { role, email } = await checkPermission(req, 'project:view');
  return { role, email };
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Authenticated-user gate — required for the MC session path on every
 * /api/daily-report/* route.  Any signed-in kulaglass.com user with a
 * resolved role (anything other than 'none') is permitted.  The FA
 * server-to-server path uses the shared INTERNAL_API_KEY header and is
 * checked before this gate at the route level.
 */
export async function passDailyReportAuthGate(req: Request): Promise<DailyReportGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email || role === 'none') {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, actorEmail: email, role };
}

/**
 * Write gate — reserved for future daily-report mutations (draft create/
 * edit, manual submission from MC, correction flows).  Allows pm,
 * business_admin, super_admin, service_pm, super.
 */
export async function passDailyReportWriteGate(req: Request): Promise<DailyReportGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email) return { ok: false, response: unauthorized() };
  if (!DAILY_REPORT_WRITE_ROLES.has(role)) {
    return {
      ok: false,
      response: forbidden(
        'Forbidden: pm, business_admin, super_admin, service_pm, or super required',
      ),
    };
  }
  return { ok: true, actorEmail: email, role };
}
