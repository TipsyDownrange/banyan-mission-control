/**
 * BAN-376 Customer Pipeline — pure state-machine + routing helpers.
 *
 * Kept free of any @/db / drizzle / pg imports so the UI bundle and jsdom
 * test environment can pull it in without dragging the Postgres driver into
 * the browser / jsdom realm.
 */

export type InquiryAssignedRoleHint = 'PM' | 'SERVICE_PM' | 'ESTIMATOR' | 'GM' | 'ADMIN';

export type InquiryStateName =
  | 'NEW'
  | 'IN_DISCUSSION'
  | 'QUOTED'
  | 'AWARDED'
  | 'LOST'
  | 'DEFERRED'
  | 'CONVERTED';

export const INQUIRY_STATE_TRANSITIONS_LITE: Record<InquiryStateName, ReadonlyArray<InquiryStateName>> = {
  NEW:           ['IN_DISCUSSION', 'QUOTED', 'AWARDED', 'LOST', 'DEFERRED', 'CONVERTED'],
  IN_DISCUSSION: ['QUOTED', 'AWARDED', 'LOST', 'DEFERRED', 'CONVERTED'],
  QUOTED:        ['AWARDED', 'LOST', 'DEFERRED', 'CONVERTED'],
  AWARDED:       ['CONVERTED', 'LOST'],
  DEFERRED:      ['IN_DISCUSSION', 'QUOTED', 'AWARDED', 'LOST', 'CONVERTED'],
  LOST:          [],
  CONVERTED:     [],
};

/**
 * Spec §9 — returns true iff `to` is a valid forward transition from `from`.
 * LOST + CONVERTED are terminal; no transitions out of them.
 */
export function canTransitionLite(from: InquiryStateName, to: InquiryStateName): boolean {
  if (from === to) return false;
  const allowed = INQUIRY_STATE_TRANSITIONS_LITE[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * Suggested assignee role per spec §8.2.  Caller may override; this is a
 * UI / route hint that pre-fills the form.  Returns null when no rule matches.
 */
export function suggestAssignedRole(
  source: string | null | undefined,
  valueBand: string | null | undefined,
): InquiryAssignedRoleHint | null {
  if (source === 'RFP') return 'GM';
  if (source === 'WALK_IN' && (valueBand === 'UNDER_5K' || valueBand === '5K_25K')) {
    return 'SERVICE_PM';
  }
  return null;
}

/**
 * Validate an SRV-prefixed Service WO ID per ADR-026.  Format: SRV-YY-NNNN.
 */
export function isValidServiceWorkOrderId(id: string): boolean {
  return /^SRV-\d{2}-\d{4}$/.test(id);
}
