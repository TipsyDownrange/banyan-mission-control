/**
 * BAN-355 follow-up (MC-AUTH-PHASE2-SUGGESTIONS) — Suggestions API auth gates.
 *
 * Migrates /api/suggestions off the email-endsWith anti-pattern onto the
 * canonical role-based gate pattern used by the rest of the BanyanOS API
 * surface (see lib/contacts/api-gate.ts, lib/war-room/api-gate.ts, and
 * lib/knowledge/api-gate.ts).
 *
 * Role set rationale:
 *
 *   - AUTH (submit):  any signed-in kulaglass.com user with a resolved role.
 *       The SuggestionButton is a universal floating widget mounted on the
 *       Mission Control home page (app/page.tsx) and is intentionally
 *       reachable by everyone in the org — field, sales, estimator, admin,
 *       PMs, leadership.  The submission flow appends to the backend
 *       Suggestions tab and also creates a Task Board row for Kai triage,
 *       so the bar is "you are on the roster", same intent as the existing
 *       email-endsWith gate but expressed via role resolution.
 *
 *   - REVIEW (read list):  pm | business_admin | super_admin | service_pm.
 *       The GET endpoint returns the full unfiltered suggestions table
 *       (every submitter's text, kai_interpretation, status, notes) — i.e.
 *       the triage queue, not a "read your own".  Reviewers approve /
 *       reject / route suggestions into product work, which mirrors the
 *       PM/admin scope used by other phase-2 review surfaces.  This is a
 *       tightening from the previous email-endsWith gate, which let any
 *       @kulaglass.com user list every submission.  If a per-user "my
 *       suggestions" read is ever introduced, route it through
 *       passSuggestionsAuthGate and filter by actorEmail in the handler.
 */

import { NextResponse } from 'next/server';
import { checkPermission } from '@/lib/permissions';

export const SUGGESTIONS_REVIEW_ROLES: ReadonlySet<string> = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'service_pm',
]);

export type SuggestionsGateResult =
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
 * Authenticated-user gate — required for POST /api/suggestions (submit).
 * Any signed-in kulaglass.com user with a resolved role (anything other than
 * 'none') is permitted, matching the universal SuggestionButton surface.
 */
export async function passSuggestionsAuthGate(req: Request): Promise<SuggestionsGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email || role === 'none') {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, actorEmail: email, role };
}

/**
 * Review gate — required for GET /api/suggestions (full triage list) and any
 * future review/approve/reject mutations.  Allows pm, business_admin,
 * super_admin, service_pm.
 */
export async function passSuggestionsReviewGate(req: Request): Promise<SuggestionsGateResult> {
  const { role, email } = await resolveRole(req);
  if (!email) return { ok: false, response: unauthorized() };
  if (!SUGGESTIONS_REVIEW_ROLES.has(role)) {
    return {
      ok: false,
      response: forbidden(
        'Forbidden: pm, business_admin, super_admin, or service_pm required',
      ),
    };
  }
  return { ok: true, actorEmail: email, role };
}
