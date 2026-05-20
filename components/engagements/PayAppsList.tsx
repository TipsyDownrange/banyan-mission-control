/**
 * BAN-322 Pay Apps v1 — list of pay applications for an engagement.
 * Read-only. Inline-style hex per RF1; mirrors ProjectWorkspace conventions.
 */

import type { CSSProperties } from 'react';

export type PayApp = {
  pay_app_id: string;
  pay_app_number: number;
  period_start: string | null;
  period_end: string | null;
  state: string;
  current_amount_due: string | number | null;
  total_earned_less_retainage: string | number | null;
  retainage_held: string | number | null;
  submitted_at: string | null;
};

const STATE_BADGE: Record<string, { bg: string; color: string; label?: string }> = {
  PENDING_DRAFT:          { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-disabled)', label: 'Draft' },
  READY_FOR_NOTARIZATION: { bg: 'var(--color-amber-50)', color: 'var(--color-amber-800)', label: 'Ready · Notarize' },
  READY_FOR_SUBMISSION:   { bg: 'var(--color-amber-50)', color: 'var(--color-amber-800)', label: 'Ready · Submit' },
  SUBMITTED:              { bg: 'var(--color-blue-50)', color: 'var(--bos-color-accent-data-bright)', label: 'Submitted' },
  ARCHITECT_CERTIFIED:    { bg: 'var(--color-blue-50)', color: 'var(--bos-color-accent-data-bright)', label: 'Architect Cert.' },
  GC_APPROVED:            { bg: 'var(--color-teal-50)', color: 'var(--bos-color-brand-primary-deep)', label: 'GC Approved' },
  PAID_PARTIAL:           { bg: 'var(--color-teal-50)', color: 'var(--bos-color-brand-primary-deep)', label: 'Paid · Partial' },
  PAID_FULL:              { bg: 'var(--color-teal-50)', color: 'var(--bos-color-brand-primary-deep)', label: 'Paid · Full' },
  REJECTED:               { bg: 'var(--color-red-50)', color: 'var(--color-red-700)', label: 'Rejected' },
};

function fmtMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '$0';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return '$0';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function fmtSubmitted(iso: string | null): string {
  if (!iso) return 'Not submitted';
  try {
    return 'Submitted ' + new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Submitted';
  }
}

function StateBadge({ state }: { state: string }) {
  const s = STATE_BADGE[state] ?? { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-disabled)', label: state.replace(/_/g, ' ') };
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800,
      letterSpacing: '0.04em', background: s.bg, color: s.color,
      border: `1px solid ${s.color}33`, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

const ROW: CSSProperties = {
  background: 'white', borderRadius: 14, border: '1px solid var(--color-surface-border)',
  padding: '14px 18px', display: 'grid',
  gridTemplateColumns: '70px 1fr 130px 140px 110px',
  gap: 12, alignItems: 'center',
  boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
};

export default function PayAppsList({ payApps, onOpen }: { payApps: PayApp[]; onOpen?: (payAppId: string) => void }) {
  if (payApps.length === 0) {
    return (
      <div style={{
        background: 'white', borderRadius: 16, border: '1px solid var(--color-surface-border)',
        padding: '40px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink-primary)', marginBottom: 8 }}>
          No pay applications yet
        </div>
        <div style={{ fontSize: 13, color: 'var(--bos-color-ink-tertiary)', marginBottom: 18 }}>
          The first pay app will appear here once it&apos;s created from the SOV.
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          style={{
            padding: '8px 18px', borderRadius: 999, border: '1px solid var(--color-surface-border)',
            background: 'var(--color-surface)', color: 'var(--bos-color-ink-tertiary)', fontSize: 12, fontWeight: 800,
            cursor: 'not-allowed',
          }}
        >
          + Create pay app (v2)
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink-primary)' }}>
          Pay Applications
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)' }}>
            ({payApps.length})
          </span>
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          style={{
            padding: '6px 14px', borderRadius: 999, border: '1px solid var(--color-surface-border)',
            background: 'var(--color-surface)', color: 'var(--bos-color-ink-tertiary)', fontSize: 11, fontWeight: 800,
            cursor: 'not-allowed',
          }}
        >
          + Create pay app (v2)
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {payApps.map((p) => (
          <div
            key={p.pay_app_id}
            style={onOpen ? { ...ROW, cursor: 'pointer' } : ROW}
            onClick={onOpen ? () => onOpen(p.pay_app_id) : undefined}
            role={onOpen ? 'button' : undefined}
            tabIndex={onOpen ? 0 : undefined}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bos-color-brand-primary-deep)', letterSpacing: '0.05em' }}>
              #{p.pay_app_number}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-primary)' }}>
                {fmtPeriod(p.period_start, p.period_end)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
                {fmtSubmitted(p.submitted_at)}
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-secondary)', textAlign: 'right' }}>
              {fmtMoney(p.current_amount_due)}
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
                Due this app
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-secondary)', textAlign: 'right' }}>
              {fmtMoney(p.total_earned_less_retainage)}
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
                Earned · less retainage
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <StateBadge state={p.state} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
