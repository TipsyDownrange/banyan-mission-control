/**
 * BAN-329 T&M Tickets v1 — state badge.
 *
 * Renders the code-actual 9-state enum from lib/aia/state-transitions.ts
 * (DRAFT, LOGGED, READY_FOR_GC_APPROVAL, GC_APPROVED, DISPUTED, BILLABLE,
 * BILLED, PAID, REJECTED). The spec listed only 5 states — see PR body
 * "Schema/Spec Drift" section. Code wins per packet directive.
 *
 * Inline-style hex per RF1.
 */

import type { TmTicketState } from '@/lib/aia/state-transitions';

type Palette = { bg: string; color: string; label: string };

const STATE_PALETTE: Record<TmTicketState, Palette> = {
  DRAFT:                 { bg: '#f8fafc', color: '#64748b', label: 'Draft' },
  LOGGED:                { bg: '#f1f5f9', color: '#475569', label: 'Logged' },
  READY_FOR_GC_APPROVAL: { bg: '#fffbeb', color: '#92400e', label: 'Ready · GC Approval' },
  GC_APPROVED:           { bg: '#eff6ff', color: '#1d4ed8', label: 'GC Approved' },
  DISPUTED:              { bg: '#fff7ed', color: '#c2410c', label: 'Disputed' },
  BILLABLE:              { bg: '#eff6ff', color: '#1d4ed8', label: 'Billable' },
  BILLED:                { bg: '#f0fdfa', color: '#0f766e', label: 'Billed' },
  PAID:                  { bg: '#ecfdf5', color: '#047857', label: 'Paid' },
  REJECTED:              { bg: '#fef2f2', color: '#b91c1c', label: 'Rejected' },
};

export default function TMTicketStateBadge({ state }: { state: string }) {
  const fallback: Palette = { bg: '#f8fafc', color: '#64748b', label: state.replace(/_/g, ' ') };
  const palette = (STATE_PALETTE as Record<string, Palette>)[state] ?? fallback;
  return (
    <span
      data-testid="tm-state-badge"
      data-state={state}
      style={{
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.04em',
        background: palette.bg,
        color: palette.color,
        border: `1px solid ${palette.color}33`,
        whiteSpace: 'nowrap',
      }}
    >
      {palette.label}
    </span>
  );
}
