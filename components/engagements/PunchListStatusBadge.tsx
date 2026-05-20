/**
 * BAN-328 Closeout Punch List v1 — status pill.
 *
 * Mirrors the BAN-322 NotarizationStatusIndicator color palette spirit:
 * blue = in-flight, amber = active work, green/teal = terminal-positive,
 * red = disputed, purple = deferred-out-of-scope, gray = pre-assignment.
 *
 * Per Closeout Trunk Spec v1.1 §6.2 the enum is 7 values (DEFERRED_TO_WARRANTY
 * is the only "deferred" status; the brief's "8" was a typo).
 */

import type { CSSProperties } from 'react';

export type PunchListItemStatus =
  | 'NEW'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SIGNED_OFF'
  | 'DISPUTED'
  | 'DEFERRED_TO_WARRANTY';

const STATUS_BADGE: Record<PunchListItemStatus, { bg: string; color: string; label: string }> = {
  NEW:                  { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-disabled)', label: 'New' },
  ASSIGNED:             { bg: '#eff6ff', color: '#1d4ed8', label: 'Assigned' },
  IN_PROGRESS:          { bg: '#fffbeb', color: '#92400e', label: 'In Progress' },
  COMPLETED:            { bg: '#f0fdf4', color: '#15803d', label: 'Completed' },
  SIGNED_OFF:           { bg: '#f0fdfa', color: 'var(--bos-color-brand-primary-deep)', label: 'Signed Off' },
  DISPUTED:             { bg: '#fef2f2', color: '#b91c1c', label: 'Disputed' },
  DEFERRED_TO_WARRANTY: { bg: '#faf5ff', color: '#7e22ce', label: 'Deferred → Warranty' },
};

const PILL: CSSProperties = {
  padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800,
  letterSpacing: '0.04em', whiteSpace: 'nowrap',
  display: 'inline-block',
};

export default function PunchListStatusBadge({ status }: { status: PunchListItemStatus | string }) {
  const known = STATUS_BADGE[status as PunchListItemStatus];
  const s = known ?? {
    bg: 'var(--color-surface)',
    color: 'var(--bos-color-ink-disabled)',
    label: String(status).replace(/_/g, ' '),
  };
  return (
    <span style={{
      ...PILL,
      background: s.bg, color: s.color,
      border: `1px solid ${s.color}33`,
    }}>
      {s.label}
    </span>
  );
}

export const PUNCH_LIST_STATUS_VALUES: readonly PunchListItemStatus[] = [
  'NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED',
  'SIGNED_OFF', 'DISPUTED', 'DEFERRED_TO_WARRANTY',
] as const;
