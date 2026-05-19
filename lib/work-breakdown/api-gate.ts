/**
 * MC-AUTH-PHASE2-WORK-BREAKDOWN (BAN-355 follow-up) — Work Breakdown API auth gates.
 *
 * Migrates /api/work-breakdown/* off the email-endsWith anti-pattern onto the
 * canonical role-based gate pattern shared by lib/contacts/api-gate.ts,
 * lib/daily-report/api-gate.ts, and lib/knowledge/api-gate.ts.
 *
 * Role set rationale — OPERATIONAL PM (not field, not sales):
 *
 * Work breakdown is the canonical Install_Plans / Install_Steps /
 * Step_Completions surface — i.e. the cost-code / line-item / budget /
 * scheduling structure for each WO or project.  The data is created and
 * maintained by office-side PMs and estimators; the field consumes it via
 * the Field App, which writes back through its own server-to-server APIs.
 *
 * Call sites that POST/PATCH/DELETE through this route:
 *   - components/ProjectsPanel.tsx + components/shared/WorkBreakdown.tsx
 *     (projects budget / plan / docs management) — primary consumer is the
 *     project PM (`pm`).
 *   - components/WODetailPanel.tsx + components/shared/WorkBreakdown.tsx
 *     (service WO work breakdown) — primary consumer is the service PM
 *     (`service_pm`); office admins also edit.
 *   - components/WOEstimatePanel.tsx (read during bid, plus seeded plans) —
 *     primary consumer is the `estimator`.
 *
 * Therefore WORK_BREAKDOWN_WRITE_ROLES is:
 *   - pm — project PM, owner of project-side budget/plan in ProjectsPanel.
 *   - service_pm — service PM, owner of service-WO breakdown in WODetailPanel.
 *   - estimator — pre-delivery plan/budget seeding via WOEstimatePanel and
 *     bid hand-off.
 *   - business_admin — cross-cutting admin role.
 *   - super_admin — catch-all admin role.
 *
 * Tightened (removed) vs the prior email-endsWith gate:
 *   - super (field superintendent) — field path writes step completions via
 *     the FA app, not this MC route; mirrors the contacts tightening.
 *   - sales — sales does not own cost-code / budget data.
 *   - field — field uses FA, not MC for write paths.
 *
 * Auth (read) gate matches the BAN-355 broad-read pattern: any signed-in
 * kulaglass.com user with a resolved role (anything other than 'none') is
 * permitted.  WorkBreakdown is rendered in read-only mode inside several
 * read consumer surfaces (SuperSchedulingPanel, ProjectMatrixView, etc.)
 * and the data is operational, not financially sensitive at the read
 * boundary — narrower roles would break those panels.
 */

import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/permissions';

export const WORK_BREAKDOWN_WRITE_ROLES: ReadonlySet<string> = new Set([
  'pm',
  'service_pm',
  'estimator',
  'business_admin',
  'super_admin',
]);

export type WorkBreakdownGateResult =
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
 * Authenticated-user gate — required for GET /api/work-breakdown/[jobId].
 * Any signed-in kulaglass.com user with a resolved role (anything other
 * than 'none') is permitted.  Read consumers include SuperSchedulingPanel,
 * ProjectMatrixView, WOEstimatePanel, and the read-only paths through
 * WorkBreakdown rendered in WODetailPanel.
 */
export async function passWorkBreakdownAuthGate(req: Request): Promise<WorkBreakdownGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email || role === 'none') {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, actorEmail: email, role };
}

/**
 * Write gate — required for POST / PATCH / DELETE /api/work-breakdown/[jobId].
 * Allows pm, service_pm, estimator, business_admin, super_admin.
 */
export async function passWorkBreakdownWriteGate(req: Request): Promise<WorkBreakdownGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email) return { ok: false, response: unauthorized() };
  if (!WORK_BREAKDOWN_WRITE_ROLES.has(role)) {
    return {
      ok: false,
      response: forbidden(
        'Forbidden: pm, service_pm, estimator, business_admin, or super_admin required',
      ),
    };
  }
  return { ok: true, actorEmail: email, role };
}
