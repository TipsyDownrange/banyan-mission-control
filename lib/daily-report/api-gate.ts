/**
 * MC-AUTH-PHASE2-DAILY-REPORT (BAN-355 follow-up) — Daily Report API auth gates.
 *
 * DAILY-REPORT-PERMISSIONS dispatch (2026-05-19, peer migration following the
 * WARROOM-PERMISSIONS / KB-PERMISSIONS template): migrated from the hardcoded
 * DAILY_REPORT_WRITE_ROLES set to the env-overridable RolePermission system in
 * lib/permissions.ts.  Widening daily-report access no longer requires a code
 * change + PR + deploy — set ROLE_PERMISSIONS_JSON in Vercel instead.
 *
 * The X-Internal-Key bypass for FA server-to-server PDF auto-trigger is
 * enforced at the route level (app/api/daily-report/pdf/route.ts) and is
 * intentionally not gated here — server-to-server calls bypass the session
 * gate by design.
 *
 * Original (PR #191) rationale, preserved for context:
 *
 *   Migrates /api/daily-report/* off the email-endsWith anti-pattern onto the
 *   canonical role-based gate pattern used by the rest of the BanyanOS API
 *   surface (mirrors lib/contacts/api-gate.ts and lib/knowledge/api-gate.ts).
 *
 *   Role set rationale — BROAD (operational, not leadership):
 *   Daily reports are operational PM/field content, not leadership cockpit
 *   content.  The PDF generation surface is consumed two ways:
 *     1. MC (browser session): a PM / business_admin / super_admin opens the
 *        ActivityTimeline panel and downloads a Daily Report PDF for review.
 *     2. FA (server-to-server): the Field App auto-triggers PDF generation
 *        after a field super submits a daily report.  That path uses the
 *        shared INTERNAL_API_KEY header and bypasses the session gate by
 *        design (server-to-server, not user-driven).
 *
 *   Because the user-facing call path is a read of artifact data, the gate
 *   is BROAD (DAILY_REPORT_VIEW): any authenticated kulaglass.com user with a
 *   resolved role is permitted.  DAILY_REPORT_WRITE narrows to the office-
 *   side PMs (pm, business_admin, super_admin, service_pm) plus the field
 *   superintendent (super) who submits daily reports in FA and may need to
 *   correct them from MC.
 *
 * Gate → permission mapping:
 *   passDailyReportAuthGate  → DAILY_REPORT_VIEW
 *   passDailyReportWriteGate → DAILY_REPORT_WRITE
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  passPermissionGate,
  type PermissionGateResult,
} from '@/lib/permissions';

/**
 * @deprecated Use the RolePermission system in lib/permissions.ts
 * (DAILY_REPORT_VIEW / DAILY_REPORT_WRITE).  Retained as a backward-compat
 * export so anything still importing it does not break, but no active call
 * site references it.  Daily-report access is resolved through
 * ROLE_PERMISSIONS_DEFAULTS (env-overridable via ROLE_PERMISSIONS_JSON), not
 * this constant.
 */
export const DAILY_REPORT_WRITE_ROLES: ReadonlySet<string> = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'service_pm',
  'super',
]);

export type DailyReportGateResult = PermissionGateResult;

/**
 * Authenticated-user gate — required for the MC session path on every
 * /api/daily-report/* route.  Delegates to passPermissionGate(DAILY_REPORT_VIEW).
 * Any signed-in kulaglass.com user with a resolved role (anything other than
 * 'none') is permitted by the default permission map.  The FA server-to-
 * server path uses the shared INTERNAL_API_KEY header and is checked before
 * this gate at the route level.
 */
export async function passDailyReportAuthGate(_req: Request): Promise<DailyReportGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'DAILY_REPORT_VIEW');
}

/**
 * Write gate — reserved for future daily-report mutations (draft create/
 * edit, manual submission from MC, correction flows).  Delegates to
 * passPermissionGate(DAILY_REPORT_WRITE).  Default role set: pm,
 * business_admin, super_admin, service_pm, super.
 */
export async function passDailyReportWriteGate(_req: Request): Promise<DailyReportGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'DAILY_REPORT_WRITE');
}
