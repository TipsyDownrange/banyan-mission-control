/**
 * BAN-346 PM-V1.0-G — PM Handoff Receipt canonical types.
 *
 * PM Trunk v1.0 §11.  Estimating side initiates handoff to PM via POST; PM
 * reviews packet + critical_gaps and accepts/rejects.  Decision lock Q6=A
 * (Critical-Gap Policy) — PMs may always accept; gaps never block.
 *
 * Kai integration is OPTIONAL (Charter Amendment 2): default mode is PM
 * manually reviews packet, types gap notes, clicks accept/reject.  Enhanced
 * mode (future) lets Kai suggest gaps; PM still drives the decision.
 */

export const PM_HANDOFF_STATES = [
  'pending_review',
  'reviewed_complete',
  'accepted',
  'rejected_with_gaps',
  'accepted_with_gaps',
] as const;

export type PmHandoffState = typeof PM_HANDOFF_STATES[number];

export const PM_HANDOFF_TERMINAL_STATES: readonly PmHandoffState[] = [
  'accepted',
  'rejected_with_gaps',
  'accepted_with_gaps',
] as const;

export const PM_HANDOFF_OPEN_STATES: readonly PmHandoffState[] = [
  'pending_review',
  'reviewed_complete',
] as const;

export const CRITICAL_GAP_STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'WAIVED',
] as const;

export type CriticalGapStatus = typeof CRITICAL_GAP_STATUSES[number];

export type CriticalGap = {
  gap_id: string;
  gap_type: string;
  description: string;
  status: CriticalGapStatus;
};

export type PmHandoffReceipt = {
  id: string;
  tenant_id: string;
  kid: string | null;
  engagement_id: string | null;
  estimate_version_id: string | null;
  state: PmHandoffState;
  submitted_by_user_id: string | null;
  submitted_at: string;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  critical_gaps: CriticalGap[];
  reviewer_notes: string | null;
  packet_drive_file_id: string | null;
  is_test_project: boolean;
  created_at: string;
  updated_at: string;
};

export function isPmHandoffState(value: unknown): value is PmHandoffState {
  return typeof value === 'string'
    && (PM_HANDOFF_STATES as readonly string[]).includes(value);
}

export function isCriticalGapStatus(value: unknown): value is CriticalGapStatus {
  return typeof value === 'string'
    && (CRITICAL_GAP_STATUSES as readonly string[]).includes(value);
}

export function isTerminalState(state: PmHandoffState): boolean {
  return (PM_HANDOFF_TERMINAL_STATES as readonly PmHandoffState[]).includes(state);
}

export function isOpenState(state: PmHandoffState): boolean {
  return (PM_HANDOFF_OPEN_STATES as readonly PmHandoffState[]).includes(state);
}

/**
 * Returns the count of critical gaps not in a resolved/waived status.  Used
 * to decide between `accepted` and `accepted_with_gaps` per Q6=A policy.
 */
export function unresolvedGapCount(gaps: readonly CriticalGap[] | null | undefined): number {
  if (!gaps) return 0;
  return gaps.filter((g) => g.status !== 'RESOLVED' && g.status !== 'WAIVED').length;
}

export function hasUnresolvedGaps(gaps: readonly CriticalGap[] | null | undefined): boolean {
  return unresolvedGapCount(gaps) > 0;
}
