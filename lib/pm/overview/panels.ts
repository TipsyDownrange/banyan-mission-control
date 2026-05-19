/**
 * BAN-347 PM-V1.0-H — pure helpers for the Project Detail Container
 * Overview tab.  Per PM Trunk v1.0 §12.3.
 *
 * Every helper is a deterministic count rollup over rows already returned by
 * existing route surfaces (no LLM, no schema migrations, no new APIs).  The
 * Overview tab composes the 9 panels by passing fetched arrays through these
 * functions, so Kai integration (Charter Amendment 2) can layer summaries on
 * top without changing the canon defaults.
 */

import { isOutstandingSubmittal, type SubmittalType } from '@/lib/pm/submittals/state-machine';
import { isOverdueRfi, type RfiState } from '@/lib/pm/rfis/state-machine';
import { OPEN_ACTIONABLE_STATUSES, type ActionItemStatus } from '@/lib/pm/action-items/types';
import { PM_HANDOFF_TERMINAL_STATES, type PmHandoffState } from '@/lib/pm/handoff-receipts/types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Day-resolution diff between two timestamps; null if either side missing. */
export function daysSince(when: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!when) return null;
  const t = typeof when === 'string' ? new Date(when) : when;
  if (Number.isNaN(t.getTime())) return null;
  const diff = now.getTime() - t.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

/**
 * Pick the accept/review timestamp the Status Summary panel uses to compute
 * "days since handoff" per §12.3.  Prefers accepted_at, then a synonym some
 * route surfaces expose as `received_at`, then reviewed_at.
 */
export function pickHandoffReferenceTimestamp(
  receipt: { accepted_at?: string | null; received_at?: string | null; reviewed_at?: string | null; submitted_at?: string | null } | null | undefined,
): string | null {
  if (!receipt) return null;
  return receipt.accepted_at || receipt.received_at || receipt.reviewed_at || receipt.submitted_at || null;
}

/** True when the engagement is in the §5.4-defined IN_CLOSEOUT window. */
export function engagementInCloseout(state: PmHandoffState | string | null | undefined): boolean {
  return state === 'closed';
}

export type SubmittalRowLite = {
  status: string;
  submittal_type?: SubmittalType | string;
  required_by_date?: string | null;
};

export type SubmittalKpi = {
  total: number;
  outstanding: number;
  outstandingByType: { ACTION: number; PHYSICAL: number; CLOSEOUT: number };
  approved: number;
  ballInCourtUs: number;
  hasTypeField: boolean;
};

/**
 * Submittals KPI per §5.4.  When source rows omit `submittal_type` (the sheet
 * schema currently does — the migration is queued in a separate trunk), we
 * fall back to a status-only "outstanding = NOT in {APPROVED, APPROVED_AS_NOTED,
 * CLOSED}" rollup and set hasTypeField=false so the UI can flag the partial.
 */
export function computeSubmittalKpi(
  rows: SubmittalRowLite[],
  ctx: { engagementInCloseout: boolean; now?: Date } = { engagementInCloseout: false },
): SubmittalKpi {
  const now = ctx.now ?? new Date();
  const closedish = new Set(['APPROVED', 'APPROVED_AS_NOTED', 'CLOSED']);
  const hasTypeField = rows.some((r) => typeof r.submittal_type === 'string' && r.submittal_type.length > 0);

  let outstanding = 0;
  const byType = { ACTION: 0, PHYSICAL: 0, CLOSEOUT: 0 };
  for (const r of rows) {
    if (hasTypeField) {
      const isOut = isOutstandingSubmittal(
        { status: r.status, submittal_type: r.submittal_type ?? '', required_by_date: r.required_by_date ?? null },
        { engagementInCloseout: ctx.engagementInCloseout, now },
      );
      if (isOut) {
        outstanding += 1;
        if (r.submittal_type === 'ACTION') byType.ACTION += 1;
        else if (r.submittal_type === 'PHYSICAL') byType.PHYSICAL += 1;
        else if (r.submittal_type === 'CLOSEOUT') byType.CLOSEOUT += 1;
      }
    } else if (!closedish.has(r.status)) {
      outstanding += 1;
    }
  }

  return {
    total: rows.length,
    outstanding,
    outstandingByType: byType,
    approved: rows.filter((r) => r.status === 'APPROVED' || r.status === 'APPROVED_AS_NOTED').length,
    ballInCourtUs: rows.filter((r) => (r as { ball_in_court?: string }).ball_in_court === 'KULA_GLASS').length,
    hasTypeField,
  };
}

export type RfiRowLite = {
  status: string;
  required_response_by_date?: string | null;
  required_response_by?: string | null;
  response_required_by?: string | null;
  response_received_at?: string | null;
  responded_at?: string | null;
};

export type RfiKpi = {
  total: number;
  open: number;
  overdue: number;
  recentlyAnswered: number;
};

/** RFI KPI per §6.5 + Overview panel #5 spec. */
export function computeRfiKpi(rows: RfiRowLite[], ctx: { now?: Date; recentDays?: number } = {}): RfiKpi {
  const now = ctx.now ?? new Date();
  const recentDays = ctx.recentDays ?? 7;
  const recentCutoff = new Date(now.getTime() - recentDays * MS_PER_DAY);

  let open = 0;
  let overdue = 0;
  let recentlyAnswered = 0;

  for (const r of rows) {
    const dueRaw = r.required_response_by_date || r.required_response_by || r.response_required_by || null;
    const answeredRaw = r.response_received_at || r.responded_at || null;

    if (r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW' || (r.status === 'OPEN' && !answeredRaw)) {
      open += 1;
    }

    if (isOverdueRfi({ status: r.status as RfiState, required_response_by_date: dueRaw }, { now })) {
      overdue += 1;
    }

    if (r.status === 'ANSWERED' && answeredRaw) {
      const a = new Date(answeredRaw);
      if (!Number.isNaN(a.getTime()) && a.getTime() >= recentCutoff.getTime()) {
        recentlyAnswered += 1;
      }
    }
  }

  return { total: rows.length, open, overdue, recentlyAnswered };
}

export type ActionItemRowLite = {
  action_item_id: string;
  title: string;
  status: string;
  priority?: string;
  source_entity_type?: string;
  due_date?: string | null;
  created_at?: string;
};

/** Top N Open/In-Progress action items, priority desc then created_at desc. */
export function topOpenActionItems(rows: ActionItemRowLite[], limit = 5): ActionItemRowLite[] {
  const open = rows.filter((r) => OPEN_ACTIONABLE_STATUSES.includes(r.status as ActionItemStatus));
  const prioRank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return [...open]
    .sort((a, b) => {
      const pa = prioRank[a.priority ?? 'MEDIUM'] ?? 2;
      const pb = prioRank[b.priority ?? 'MEDIUM'] ?? 2;
      if (pa !== pb) return pa - pb;
      const ca = a.created_at ?? '';
      const cb = b.created_at ?? '';
      return cb.localeCompare(ca);
    })
    .slice(0, limit);
}

export type DocumentRowLite = {
  document_id: string;
  filename: string;
  kind: string;
  uploaded_at: string;
  is_current?: boolean | null;
};

/** Top N most recent current documents, newest first. */
export function topRecentDocuments(rows: DocumentRowLite[], limit = 5): DocumentRowLite[] {
  return [...rows]
    .filter((d) => d.is_current !== false)
    .sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''))
    .slice(0, limit);
}

export type PayAppRowLite = {
  pay_app_id: string;
  pay_app_number: number;
  state: string;
  contract_sum_to_date?: string | number | null;
  contract_sum_original?: string | number | null;
  total_earned_less_retainage?: string | number | null;
  less_previous_certificates?: string | number | null;
  current_amount_due?: string | number | null;
  period_start?: string | null;
  period_end?: string | null;
};

const PAID_STATES = new Set(['PAID_FULL', 'PAID_PARTIAL']);

function num(v: string | number | null | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  const p = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(p) ? p : 0;
}

export type FinancialSummary = {
  contractSum: number;
  contractSumSource: 'pay_app_to_date' | 'pay_app_original' | 'none';
  currentPayApp: PayAppRowLite | null;
  outstandingAr: number;
  payAppCount: number;
};

/**
 * Financial summary derives from pay_applications rows (newest first by
 * pay_app_number, as returned by /api/aia/billing/by-kid/[kid]).  Approved-CO
 * total is intentionally absent: change_orders is not a Postgres table at the
 * current main SHA, so the UI surfaces a TODO placeholder for that field per
 * task escalation policy ("placeholder + add TODO comment, do NOT escalate").
 */
export function computeFinancialSummary(payApps: PayAppRowLite[]): FinancialSummary {
  if (payApps.length === 0) {
    return { contractSum: 0, contractSumSource: 'none', currentPayApp: null, outstandingAr: 0, payAppCount: 0 };
  }
  const sorted = [...payApps].sort((a, b) => b.pay_app_number - a.pay_app_number);
  const current = sorted[0];

  let contractSum = num(current.contract_sum_to_date);
  let source: FinancialSummary['contractSumSource'] = 'pay_app_to_date';
  if (contractSum === 0) {
    contractSum = num(current.contract_sum_original);
    source = contractSum > 0 ? 'pay_app_original' : 'none';
  }

  const outstandingAr = sorted
    .filter((p) => !PAID_STATES.has(p.state))
    .reduce((sum, p) => sum + num(p.current_amount_due), 0);

  return {
    contractSum,
    contractSumSource: source,
    currentPayApp: current,
    outstandingAr,
    payAppCount: payApps.length,
  };
}

export function formatHandoffStateLabel(state: PmHandoffState | string | null | undefined): string {
  if (!state) return '—';
  return state.replace(/_/g, ' ');
}

export function isHandoffTerminal(state: PmHandoffState | string | null | undefined): boolean {
  if (!state) return false;
  return (PM_HANDOFF_TERMINAL_STATES as readonly string[]).includes(state);
}

export type FieldEventRowLite = {
  id?: string;
  event_id?: string;
  event_type?: string;
  type?: string;
  occurredAt?: string;
  recordedAt?: string;
  event_occurred_at?: string;
  event_recorded_at?: string;
  performedBy?: string;
  notes?: string;
  note?: string;
  kID?: string;
};

export type ActivityTickerEntry = {
  id: string;
  eventType: string;
  occurredAt: string;
  actor: string;
  summary: string;
};

/** Normalize and trim the last N events for the ticker panel. */
export function buildActivityTicker(rows: FieldEventRowLite[], limit = 10): ActivityTickerEntry[] {
  return rows.slice(0, limit).map((e) => ({
    id: e.event_id || e.id || '',
    eventType: e.event_type || e.type || 'EVENT',
    occurredAt: e.event_occurred_at || e.occurredAt || e.event_recorded_at || e.recordedAt || '',
    actor: e.performedBy || '',
    summary: (e.notes || e.note || '').slice(0, 140),
  }));
}
