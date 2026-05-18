/**
 * BAN-340 PM-V1.0-A — Submittal lifecycle state machine + ball-in-court
 * derivation.
 *
 * Per PM Trunk v1.0 §5.3 lifecycle:
 *
 *   REQUIRED        → IN_PROGRESS   (PM begins work)
 *   IN_PROGRESS     → SUBMITTED     (PM submits to submitted_to party)
 *   SUBMITTED       → UNDER_REVIEW  (acknowledged by submitted_to party)
 *   UNDER_REVIEW    → APPROVED | APPROVED_AS_NOTED | REVISE_RESUBMIT | REJECTED
 *   REVISE_RESUBMIT → IN_PROGRESS   (re-edit + resubmit)
 *   APPROVED        → CLOSED        (manual close after delivery)
 *   APPROVED_AS_NOTED → CLOSED
 *   REJECTED        → CLOSED        (often after RFI clarification)
 */

export const SUBMITTAL_STATES = [
  'REQUIRED',
  'IN_PROGRESS',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'APPROVED_AS_NOTED',
  'REVISE_RESUBMIT',
  'REJECTED',
  'CLOSED',
] as const;
export type SubmittalState = typeof SUBMITTAL_STATES[number];

export const SUBMITTAL_ALLOWED_TRANSITIONS: Record<SubmittalState, SubmittalState[]> = {
  REQUIRED: ['IN_PROGRESS'],
  IN_PROGRESS: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'APPROVED_AS_NOTED', 'REVISE_RESUBMIT', 'REJECTED'],
  UNDER_REVIEW: ['APPROVED', 'APPROVED_AS_NOTED', 'REVISE_RESUBMIT', 'REJECTED'],
  APPROVED: ['CLOSED'],
  APPROVED_AS_NOTED: ['CLOSED'],
  REVISE_RESUBMIT: ['IN_PROGRESS'],
  REJECTED: ['CLOSED'],
  CLOSED: [],
};

export type SubmittalSubmittedTo = 'GC' | 'ARCHITECT' | 'ENGINEER' | 'OWNER';
export type SubmittalBallInCourt = 'SUBCONTRACTOR' | 'GC' | 'ARCHITECT' | 'ENGINEER' | 'OWNER';

export type TransitionValidationResult =
  | { ok: true }
  | { ok: false; reason: 'UNKNOWN_FROM_STATE' | 'UNKNOWN_TO_STATE' | 'TRANSITION_NOT_ALLOWED' | 'NO_OP'; message: string };

export function isSubmittalState(value: unknown): value is SubmittalState {
  return typeof value === 'string' && (SUBMITTAL_STATES as readonly string[]).includes(value);
}

export function validateSubmittalTransition(
  fromState: string,
  toState: string,
): TransitionValidationResult {
  if (!isSubmittalState(fromState)) {
    return { ok: false, reason: 'UNKNOWN_FROM_STATE', message: `Unknown submittal from_state: ${fromState}` };
  }
  if (!isSubmittalState(toState)) {
    return { ok: false, reason: 'UNKNOWN_TO_STATE', message: `Unknown submittal to_state: ${toState}` };
  }
  if (fromState === toState) {
    return { ok: false, reason: 'NO_OP', message: `submittal transition ${fromState} → ${toState} is a no-op` };
  }
  if (!SUBMITTAL_ALLOWED_TRANSITIONS[fromState].includes(toState)) {
    return {
      ok: false,
      reason: 'TRANSITION_NOT_ALLOWED',
      message: `submittal transition ${fromState} → ${toState} is not allowed`,
    };
  }
  return { ok: true };
}

/**
 * Derive ball_in_court from status + submitted_to per spec §5:
 *   DRAFT/REQUIRED/IN_PROGRESS/REVISE_RESUBMIT → SUBCONTRACTOR
 *   SUBMITTED/UNDER_REVIEW                     → whatever submitted_to is
 *                                                (falls back to GC if missing)
 *   APPROVED/APPROVED_AS_NOTED/REJECTED        → SUBCONTRACTOR (review outcome)
 *   CLOSED                                     → null
 */
export function deriveBallInCourt(
  status: SubmittalState,
  submittedTo: SubmittalSubmittedTo | null | undefined,
): SubmittalBallInCourt | null {
  switch (status) {
    case 'REQUIRED':
    case 'IN_PROGRESS':
    case 'REVISE_RESUBMIT':
      return 'SUBCONTRACTOR';
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return (submittedTo ?? 'GC') as SubmittalBallInCourt;
    case 'APPROVED':
    case 'APPROVED_AS_NOTED':
    case 'REJECTED':
      return 'SUBCONTRACTOR';
    case 'CLOSED':
      return null;
  }
}

export type SubmittalType = 'ACTION' | 'PHYSICAL' | 'CLOSEOUT';

/**
 * Outstanding submittals KPI computation per spec §5.4.
 * A submittal counts as "outstanding" iff:
 *  - type=ACTION    AND status NOT IN (APPROVED, APPROVED_AS_NOTED, CLOSED)
 *  - OR type=PHYSICAL AND required_by_date < today AND status != CLOSED
 *  - OR (engagement in IN_CLOSEOUT) AND type=CLOSEOUT AND status != CLOSED
 */
export function isOutstandingSubmittal(
  s: {
    submittal_type: SubmittalType | string;
    status: SubmittalState | string;
    required_by_date?: string | Date | null;
  },
  ctx: { engagementInCloseout: boolean; now?: Date },
): boolean {
  const now = ctx.now ?? new Date();
  const closedish = new Set(['APPROVED', 'APPROVED_AS_NOTED', 'CLOSED']);

  if (s.submittal_type === 'ACTION') {
    return !closedish.has(s.status);
  }
  if (s.submittal_type === 'PHYSICAL') {
    if (s.status === 'CLOSED') return false;
    if (!s.required_by_date) return false;
    const due = typeof s.required_by_date === 'string'
      ? new Date(s.required_by_date)
      : s.required_by_date;
    return due.getTime() < now.getTime();
  }
  if (s.submittal_type === 'CLOSEOUT') {
    if (!ctx.engagementInCloseout) return false;
    return s.status !== 'CLOSED';
  }
  return false;
}
