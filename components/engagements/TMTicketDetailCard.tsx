/**
 * BAN-329 T&M Tickets v1 — detail card (collapsible).
 *
 * Header (always visible): ticket number, work date, scope summary,
 * state badge, $ total.
 * Body (expanded): labor breakdown (hours × rate by role), materials
 * line items, equipment, authorization reference, signoff evidence,
 * billing reference (RF7) when ticket.pay_app_id is set.
 *
 * Read-only. Inline-style hex per RF1.
 */

'use client';

import { useState } from 'react';
import TMTicketStateBadge from './TMTicketStateBadge';
import type { TMTicket } from './TMTicketsList';

type LaborLine = {
  role?: string;
  worker_name?: string;
  hours?: number | string;
  rate?: number | string;
  total?: number | string;
};

type MaterialLine = {
  description?: string;
  quantity?: number | string;
  unit?: string;
  unit_cost?: number | string;
  total?: number | string;
};

type EquipmentLine = {
  description?: string;
  hours?: number | string;
  rate?: number | string;
  total?: number | string;
};

function fmtMoney(value: unknown): string {
  if (value === null || value === undefined || value === '') return '$0';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return '$0';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-disabled)', letterSpacing: '0.08em', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export default function TMTicketDetailCard({ ticket }: { ticket: TMTicket }) {
  const [expanded, setExpanded] = useState(false);
  const labor = asArray<LaborLine>(ticket.labor);
  const materials = asArray<MaterialLine>(ticket.materials);
  const equipment = asArray<EquipmentLine>(ticket.equipment);
  const auth = ticket.authorization_reference ?? null;
  const billing = ticket.billing_reference ?? null;

  return (
    <div
      data-testid={`tm-ticket-card-${ticket.ticket_id}`}
      style={{
        background: 'white',
        borderRadius: 14,
        border: '1px solid var(--color-surface-border)',
        padding: '14px 18px',
        boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid={`tm-ticket-toggle-${ticket.ticket_id}`}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'grid',
          gridTemplateColumns: '110px 1fr 130px 120px 30px',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bos-color-brand-primary-deep)', letterSpacing: '0.05em' }}>
          #{ticket.ticket_number}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-primary)' }}>
            {ticket.description || 'T&M ticket'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
            {fmtDate(ticket.work_date)}
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#334155', textAlign: 'right' }}>
          {fmtMoney(ticket.ticket_total)}
        </div>
        <div style={{ textAlign: 'right' }}>
          <TMTicketStateBadge state={ticket.status} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textAlign: 'center' }}>
          {expanded ? '▾' : '▸'}
        </div>
      </button>

      {expanded && (
        <div data-testid={`tm-ticket-body-${ticket.ticket_id}`} style={{ borderTop: '1px solid #f1f5f9', marginTop: 12, paddingTop: 4 }}>
          {auth && (
            <Section label="AUTHORIZATION">
              <div style={{ fontSize: 12, color: '#334155' }}>
                Authorized under <strong>TMA-{auth.authorization_number}</strong>
                {auth.authorized_by_name ? ` by ${auth.authorized_by_name}` : ''}
                {` (${auth.authorization_method.replace(/_/g, ' ').toLowerCase()})`}
              </div>
              {auth.not_to_exceed_amount && (
                <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)', marginTop: 2 }}>
                  Not-to-exceed: {fmtMoney(auth.not_to_exceed_amount)}
                </div>
              )}
            </Section>
          )}

          {labor.length > 0 && (
            <Section label={`LABOR · ${fmtMoney(ticket.labor_total)}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {labor.map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 60px 90px 90px',
                      gap: 8,
                      fontSize: 12,
                      color: '#334155',
                      padding: '4px 0',
                      borderBottom: i === labor.length - 1 ? 'none' : '1px dashed #f1f5f9',
                    }}
                  >
                    <div>{row.role || row.worker_name || '—'}</div>
                    <div style={{ textAlign: 'right' }}>{row.hours ?? '—'} hr</div>
                    <div style={{ textAlign: 'right' }}>× {fmtMoney(row.rate)}</div>
                    <div style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(row.total)}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {materials.length > 0 && (
            <Section label={`MATERIALS · ${fmtMoney(ticket.materials_total)}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {materials.map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 70px 90px 90px',
                      gap: 8,
                      fontSize: 12,
                      color: '#334155',
                      padding: '4px 0',
                      borderBottom: i === materials.length - 1 ? 'none' : '1px dashed #f1f5f9',
                    }}
                  >
                    <div>{row.description || '—'}</div>
                    <div style={{ textAlign: 'right' }}>{row.quantity ?? '—'} {row.unit ?? ''}</div>
                    <div style={{ textAlign: 'right' }}>× {fmtMoney(row.unit_cost)}</div>
                    <div style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(row.total)}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {equipment.length > 0 && (
            <Section label={`EQUIPMENT · ${fmtMoney(ticket.equipment_total)}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {equipment.map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 60px 90px 90px',
                      gap: 8,
                      fontSize: 12,
                      color: '#334155',
                      padding: '4px 0',
                    }}
                  >
                    <div>{row.description || '—'}</div>
                    <div style={{ textAlign: 'right' }}>{row.hours ?? '—'} hr</div>
                    <div style={{ textAlign: 'right' }}>× {fmtMoney(row.rate)}</div>
                    <div style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(row.total)}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(ticket.field_signoff_at || ticket.gc_signoff_at || ticket.gc_signoff_required) && (
            <Section label="SIGNOFF">
              <div style={{ fontSize: 12, color: '#334155', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div>
                  Field: {ticket.field_signoff_at ? `signed ${fmtDate(ticket.field_signoff_at)}` : 'pending'}
                </div>
                <div>
                  GC: {ticket.gc_signoff_at
                    ? `signed ${fmtDate(ticket.gc_signoff_at)}${ticket.gc_signoff_name ? ` by ${ticket.gc_signoff_name}` : ''}`
                    : ticket.gc_signoff_required ? 'required · pending' : 'not required'}
                </div>
                {ticket.gc_signoff_evidence_ref && (
                  <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)' }}>
                    Evidence: {ticket.gc_signoff_evidence_ref}
                  </div>
                )}
              </div>
            </Section>
          )}

          {billing && (
            <Section label="BILLED IN">
              <div data-testid={`tm-ticket-billing-${ticket.ticket_id}`} style={{ fontSize: 12, color: 'var(--bos-color-brand-primary-deep)', fontWeight: 700 }}>
                Pay App #{billing.pay_app_number}
                {billing.period_end ? ` (period ending ${fmtDate(billing.period_end)})` : ''}
              </div>
              {ticket.billed_at && (
                <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)', marginTop: 2 }}>
                  Billed {fmtDate(ticket.billed_at)}
                </div>
              )}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
