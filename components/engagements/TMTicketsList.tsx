/**
 * BAN-329 T&M Tickets v1 — list with filter controls.
 *
 * Filters: state (multi-select), date range (work_date), billable
 * status (billed vs. unbilled). All filters apply client-side over the
 * payload returned by the aggregator.
 *
 * Read-only. Inline-style hex per RF1.
 */

'use client';

import { useMemo, useState } from 'react';
import { TM_TICKET_STATES, type TmTicketState } from '@/lib/aia/state-transitions';
import TMTicketDetailCard from './TMTicketDetailCard';

export type TMTicket = {
  ticket_id: string;
  tm_auth_id: string | null;
  engagement_id: string;
  ticket_number: string;
  work_date: string | null;
  description: string | null;
  labor: unknown;
  labor_total: string | number | null;
  materials: unknown;
  materials_subtotal?: string | number | null;
  materials_markup?: string | number | null;
  materials_total: string | number | null;
  equipment: unknown;
  equipment_total: string | number | null;
  ticket_total: string | number | null;
  photos?: unknown;
  field_signoff_at?: string | null;
  gc_signoff_required?: boolean;
  gc_signoff_name?: string | null;
  gc_signoff_at?: string | null;
  gc_signoff_evidence_ref?: string | null;
  status: string;
  pay_app_id?: string | null;
  billed_at?: string | null;
  authorization_reference?: {
    tm_auth_id: string;
    authorization_number: string;
    authorization_method: string;
    authorized_by_name: string | null;
    not_to_exceed_amount: string | null;
  } | null;
  billing_reference?: {
    pay_app_id: string;
    pay_app_number: number;
    period_end: string | null;
  } | null;
};

type BillableFilter = 'all' | 'billed' | 'unbilled';

const BILLED_STATES: ReadonlySet<TmTicketState> = new Set(['BILLED', 'PAID']);

function inDateRange(date: string | null, from: string, to: string): boolean {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export default function TMTicketsList({ tickets }: { tickets: TMTicket[] }) {
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [billable, setBillable] = useState<BillableFilter>('all');

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (selectedStates.size > 0 && !selectedStates.has(t.status)) return false;
      if (fromDate || toDate) {
        if (!inDateRange(t.work_date, fromDate, toDate)) return false;
      }
      if (billable === 'billed' && !BILLED_STATES.has(t.status as TmTicketState)) return false;
      if (billable === 'unbilled' && BILLED_STATES.has(t.status as TmTicketState)) return false;
      return true;
    });
  }, [tickets, selectedStates, fromDate, toDate, billable]);

  function toggleState(state: string) {
    setSelectedStates((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  }

  if (tickets.length === 0) {
    return (
      <div
        data-testid="tm-tickets-empty"
        style={{
          background: 'white',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: '40px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
          No T&amp;M tickets yet
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          The first ticket will appear here once it&apos;s logged against an active T&amp;M authorization.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        data-testid="tm-tickets-filters"
        style={{
          background: 'white',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TM_TICKET_STATES.map((st) => {
            const active = selectedStates.has(st);
            return (
              <button
                key={st}
                type="button"
                onClick={() => toggleState(st)}
                data-testid={`tm-filter-state-${st}`}
                aria-pressed={active}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                  background: active ? '#0f172a' : '#f8fafc',
                  color: active ? '#f8fafc' : '#475569',
                  border: `1px solid ${active ? '#0f172a' : '#e2e8f0'}`,
                }}
              >
                {st.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              data-testid="tm-filter-from"
              style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              data-testid="tm-filter-to"
              style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'billed', 'unbilled'] as BillableFilter[]).map((opt) => {
              const active = billable === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setBillable(opt)}
                  data-testid={`tm-filter-billable-${opt}`}
                  aria-pressed={active}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: active ? '#0f766e' : '#f8fafc',
                    color: active ? '#f8fafc' : '#475569',
                    border: `1px solid ${active ? '#0f766e' : '#e2e8f0'}`,
                    textTransform: 'capitalize',
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
            {filtered.length} of {tickets.length}
          </span>
        </div>
      </div>

      <div data-testid="tm-tickets-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div
            data-testid="tm-tickets-filtered-empty"
            style={{
              padding: 24,
              textAlign: 'center',
              fontSize: 12,
              color: '#94a3b8',
              background: 'white',
              borderRadius: 14,
              border: '1px dashed #e2e8f0',
            }}
          >
            No tickets match the current filters.
          </div>
        ) : (
          filtered.map((t) => <TMTicketDetailCard key={t.ticket_id} ticket={t} />)
        )}
      </div>
    </div>
  );
}
