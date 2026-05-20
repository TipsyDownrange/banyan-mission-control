/**
 * BAN-329 T&M Tickets v1 — summary card.
 *
 * Counts by state, total/billed/unbilled $ value, and date range. Reads
 * the code-actual 9-state enum from lib/aia/state-transitions.ts so new
 * states show up here automatically.
 *
 * Read-only. Inline-style hex per RF1.
 */

import { TM_TICKET_STATES, type TmTicketState } from '@/lib/aia/state-transitions';
import type { TMTicket } from './TMTicketsList';

type Props = {
  tickets: TMTicket[];
  summary?: {
    total_count: number;
    by_state: Record<TmTicketState, number>;
    total_value_usd: number;
    billed_value_usd: number;
    unbilled_value_usd: number;
  } | null;
};

function fmtMoney(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function computeSummary(tickets: TMTicket[]) {
  const by_state = {} as Record<TmTicketState, number>;
  for (const s of TM_TICKET_STATES) by_state[s] = 0;
  let total = 0;
  let billed = 0;
  for (const t of tickets) {
    const state = t.status as TmTicketState;
    if (state in by_state) by_state[state] += 1;
    const value = toNumber(t.ticket_total);
    total += value;
    if (state === 'BILLED' || state === 'PAID') billed += value;
  }
  return {
    total_count: tickets.length,
    by_state,
    total_value_usd: total,
    billed_value_usd: billed,
    unbilled_value_usd: total - billed,
  };
}

function dateRange(tickets: TMTicket[]): { from: string | null; to: string | null } {
  if (tickets.length === 0) return { from: null, to: null };
  let min: string | null = null;
  let max: string | null = null;
  for (const t of tickets) {
    const d = t.work_date;
    if (!d) continue;
    if (min === null || d < min) min = d;
    if (max === null || d > max) max = d;
  }
  return { from: min, to: max };
}

export default function TMTicketsSummaryCard({ tickets, summary }: Props) {
  const s = summary ?? computeSummary(tickets);
  const range = dateRange(tickets);
  const nonZeroStates = TM_TICKET_STATES.filter((st) => s.by_state[st] > 0);

  return (
    <div
      data-testid="tm-summary-card"
      style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid var(--color-surface-border)',
        padding: '18px 22px',
        boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink-primary)' }}>
          T&amp;M Tickets
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)' }}>
            ({s.total_count})
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>
          {range.from ? `${fmtDate(range.from)} – ${fmtDate(range.to)}` : 'No tickets yet'}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-disabled)', letterSpacing: '0.06em' }}>TOTAL VALUE</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-ink-primary)', marginTop: 4 }}>
            {fmtMoney(s.total_value_usd)}
          </div>
        </div>
        <div style={{ background: '#f0fdfa', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-brand-primary-deep)', letterSpacing: '0.06em' }}>BILLED</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--bos-color-brand-primary-deep)', marginTop: 4 }}>
            {fmtMoney(s.billed_value_usd)}
          </div>
        </div>
        <div style={{ background: '#fffbeb', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--color-amber-800)', letterSpacing: '0.06em' }}>UNBILLED</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-amber-800)', marginTop: 4 }}>
            {fmtMoney(s.unbilled_value_usd)}
          </div>
        </div>
      </div>

      {nonZeroStates.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {nonZeroStates.map((st) => (
            <span
              key={st}
              data-testid={`tm-state-count-${st}`}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.04em',
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid var(--color-surface-border)',
              }}
            >
              {st.replace(/_/g, ' ')} · {s.by_state[st]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
