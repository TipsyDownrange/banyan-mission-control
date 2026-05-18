/**
 * BAN-341 PM-V1.0-B — RFI lifecycle state machine + ball-in-court
 * derivation.
 *
 * Per PM Trunk v1.0 §6.3 lifecycle:
 *
 *   DRAFT        → SUBMITTED      (PM submits RFI to submitted_to party)
 *   SUBMITTED    → UNDER_REVIEW   (reviewer acknowledges)
 *   UNDER_REVIEW → ANSWERED       (response received from reviewer)
 *   ANSWERED     → RESOLVED       (PM accepts the response)
 *   ANSWERED     → SUBMITTED      (PM has follow-up questions; ball returns
 *                                  to the reviewer)
 *   RESOLVED     → CLOSED         (manual close after any downstream linkage,
 *                                  including CO generation)
 *   <any state>  → VOID           (operator-initiated cancellation)
 */

export const RFI_STATES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ANSWERED',
  'RESOLVED',
  'CLOSED',
  'VOID',
] as const;
export type RfiState = typeof RFI_STATES[number];

export const RFI_ALLOWED_TRANSITIONS: Record<RfiState, RfiState[]> = {
  DRAFT: ['SUBMITTED', 'VOID'],
  SUBMITTED: ['UNDER_REVIEW', 'ANSWERED', 'VOID'],
  UNDER_REVIEW: ['ANSWERED', 'VOID'],
  ANSWERED: ['RESOLVED', 'SUBMITTED', 'VOID'],
  RESOLVED: ['CLOSED', 'VOID'],
  CLOSED: [],
  VOID: [],
};

export type RfiSubmittedTo = 'GC' | 'ARCHITECT' | 'ENGINEER' | 'OWNER';
export type RfiBallInCourt = 'SUBCONTRACTOR' | 'GC' | 'ARCHITECT' | 'ENGINEER' | 'OWNER';

export type TransitionValidationResult =
  | { ok: true }
  | { ok: false; reason: 'UNKNOWN_FROM_STATE' | 'UNKNOWN_TO_STATE' | 'TRANSITION_NOT_ALLOWED' | 'NO_OP'; message: string };

export function isRfiState(value: unknown): value is RfiState {
  return typeof value === 'string' && (RFI_STATES as readonly string[]).includes(value);
}

export function validateRfiTransition(
  fromState: string,
  toState: string,
): TransitionValidationResult {
  if (!isRfiState(fromState)) {
    return { ok: false, reason: 'UNKNOWN_FROM_STATE', message: `Unknown rfi from_state: ${fromState}` };
  }
  if (!isRfiState(toState)) {
    return { ok: false, reason: 'UNKNOWN_TO_STATE', message: `Unknown rfi to_state: ${toState}` };
  }
  if (fromState === toState) {
    return { ok: false, reason: 'NO_OP', message: `rfi transition ${fromState} → ${toState} is a no-op` };
  }
  if (!RFI_ALLOWED_TRANSITIONS[fromState].includes(toState)) {
    return {
      ok: false,
      reason: 'TRANSITION_NOT_ALLOWED',
      message: `rfi transition ${fromState} → ${toState} is not allowed`,
    };
  }
  return { ok: true };
}

/**
 * Derive ball_in_court from status + submitted_to per spec §6.4:
 *   DRAFT                            → SUBCONTRACTOR
 *   SUBMITTED / UNDER_REVIEW         → submitted_to party (falls back to GC)
 *   ANSWERED                         → SUBCONTRACTOR
 *   RESOLVED / CLOSED / VOID         → null
 */
export function deriveBallInCourt(
  status: RfiState,
  submittedTo: RfiSubmittedTo | null | undefined,
): RfiBallInCourt | null {
  switch (status) {
    case 'DRAFT':
      return 'SUBCONTRACTOR';
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return (submittedTo ?? 'GC') as RfiBallInCourt;
    case 'ANSWERED':
      return 'SUBCONTRACTOR';
    case 'RESOLVED':
    case 'CLOSED':
    case 'VOID':
      return null;
  }
}

/**
 * Overdue tracking per spec §6.5. An RFI is "overdue" iff:
 *   required_response_by_date < now AND status IN (SUBMITTED, UNDER_REVIEW)
 */
export function isOverdueRfi(
  r: {
    status: RfiState | string;
    required_response_by_date?: string | Date | null;
  },
  ctx: { now?: Date } = {},
): boolean {
  if (r.status !== 'SUBMITTED' && r.status !== 'UNDER_REVIEW') return false;
  if (!r.required_response_by_date) return false;
  const now = ctx.now ?? new Date();
  const due = typeof r.required_response_by_date === 'string'
    ? new Date(r.required_response_by_date)
    : r.required_response_by_date;
  return due.getTime() < now.getTime();
}
