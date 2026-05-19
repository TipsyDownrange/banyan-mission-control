/**
 * BAN-355 follow-up (MC-AUTH-PHASE2-SUGGESTIONS) — Suggestions API auth gates.
 *
 * SUGGESTIONS-PERMISSIONS dispatch (2026-05-19, peer migration following the
 * WARROOM-PERMISSIONS / KB-PERMISSIONS / CONTACTS-PERMISSIONS template):
 * migrated from the hardcoded SUGGESTIONS_REVIEW_ROLES set (PR #190) to the
 * env-overridable RolePermission system in lib/permissions.ts.  Widening
 * suggestions review access no longer requires a code change + PR + deploy —
 * set ROLE_PERMISSIONS_JSON in Vercel instead.
 *
 * Original (PR #190) rationale, preserved for context:
 *   Migrates /api/suggestions off the email-endsWith anti-pattern onto the
 *   canonical role-based gate pattern used by the rest of the BanyanOS API
 *   surface (see lib/contacts/api-gate.ts, lib/war-room/api-gate.ts, and
 *   lib/knowledge/api-gate.ts).
 *
 *   Role set rationale (preserved exactly by ROLE_PERMISSIONS_DEFAULTS):
 *
 *     - AUTH (submit):  any signed-in kulaglass.com user with a resolved role.
 *         The SuggestionButton is a universal floating widget mounted on the
 *         Mission Control home page (app/page.tsx) and is intentionally
 *         reachable by everyone in the org — field, sales, estimator, admin,
 *         PMs, leadership.  The submission flow appends to the backend
 *         Suggestions tab and also creates a Task Board row for Kai triage,
 *         so the bar is "you are on the roster", same intent as the existing
 *         email-endsWith gate but expressed via role resolution.
 *
 *     - REVIEW (read list):  pm | business_admin | super_admin | service_pm.
 *         The GET endpoint returns the full unfiltered suggestions table
 *         (every submitter's text, kai_interpretation, status, notes) — i.e.
 *         the triage queue, not a "read your own".  Reviewers approve /
 *         reject / route suggestions into product work, which mirrors the
 *         PM/admin scope used by other phase-2 review surfaces.  This is a
 *         tightening from the previous email-endsWith gate, which let any
 *         @kulaglass.com user list every submission.  If a per-user "my
 *         suggestions" read is ever introduced, route it through
 *         passSuggestionsAuthGate and filter by actorEmail in the handler.
 *
 * Gate → permission mapping:
 *   passSuggestionsAuthGate    → SUGGESTIONS_VIEW
 *   passSuggestionsReviewGate  → SUGGESTIONS_REVIEW
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  passPermissionGate,
  type PermissionGateResult,
} from '@/lib/permissions';

/**
 * @deprecated Use the RolePermission system in lib/permissions.ts
 * (SUGGESTIONS_VIEW / SUGGESTIONS_REVIEW).  Retained as a backward-compat
 * export so anything still importing it does not break, but no active call
 * site references it.  Suggestions access is resolved through
 * ROLE_PERMISSIONS_DEFAULTS (env-overridable via ROLE_PERMISSIONS_JSON), not
 * this constant.
 */
export const SUGGESTIONS_REVIEW_ROLES: ReadonlySet<string> = new Set([
  'pm',
  'business_admin',
  'super_admin',
  'service_pm',
]);

export type SuggestionsGateResult = PermissionGateResult;

/**
 * Authenticated-user gate — required for POST /api/suggestions (submit).
 * Delegates to passPermissionGate(SUGGESTIONS_VIEW).  Default grants every
 * documented role except 'none', preserving the universal SuggestionButton
 * surface (the submission flow is intentionally open to everyone in the org).
 */
export async function passSuggestionsAuthGate(_req: Request): Promise<SuggestionsGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'SUGGESTIONS_VIEW');
}

/**
 * Review gate — required for GET /api/suggestions (full triage list) and any
 * future review/approve/reject mutations.  Delegates to
 * passPermissionGate(SUGGESTIONS_REVIEW).  Default grants pm, business_admin,
 * super_admin, service_pm (preserves PR #190 SUGGESTIONS_REVIEW_ROLES exactly).
 */
export async function passSuggestionsReviewGate(_req: Request): Promise<SuggestionsGateResult> {
  const session = await getServerSession(authOptions);
  return passPermissionGate(session, 'SUGGESTIONS_REVIEW');
}
