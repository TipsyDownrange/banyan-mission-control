/**
 * BAN-322 Pay Apps v1 — retainage holdings panel (read-only).
 * Lists held vs released amounts per pay app. Inline-style hex per RF1.
 */

import type { CSSProperties } from 'react';

export type RetainageHolding = {
  holding_id: string;
  pay_app_id: string;
  amount_held: string | number | null;
  release_trigger: string;
  released_at: string | null;
  released_pay_app_id: string | null;
};

function parseNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(value: string | number | null | undefined): string {
  const n = parseNum(value);
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

const ROW: CSSProperties = {
  background: 'white', borderRadius: 12, border: '1px solid var(--color-surface-border)',
  padding: '12px 16px', display: 'grid',
  gridTemplateColumns: '1fr 130px 140px 110px',
  gap: 12, alignItems: 'center',
};

export default function RetainagePanel({ retainage }: { retainage: RetainageHolding[] }) {
  if (retainage.length === 0) {
    return (
      <div style={{
        background: 'white', borderRadius: 14, border: '1px solid var(--color-surface-border)',
        padding: '24px 18px', textAlign: 'center', color: 'var(--bos-color-ink-tertiary)',
        fontSize: 13,
      }}>
        No retainage on file for this engagement.
      </div>
    );
  }

  const totalHeld = retainage
    .filter((h) => h.released_at === null)
    .reduce((sum, h) => sum + parseNum(h.amount_held), 0);
  const totalReleased = retainage
    .filter((h) => h.released_at !== null)
    .reduce((sum, h) => sum + parseNum(h.amount_held), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-ink-primary)' }}>
          Retainage Holdings
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)' }}>
            ({retainage.length})
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, fontWeight: 700 }}>
          <span style={{ color: 'var(--bos-color-brand-primary-deep)' }}>Held {fmtMoney(totalHeld)}</span>
          <span style={{ color: 'var(--bos-color-ink-disabled)' }}>Released {fmtMoney(totalReleased)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {retainage.map((h) => {
          const isReleased = h.released_at !== null;
          return (
            <div key={h.holding_id} style={ROW}>
              <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)' }}>
                <div style={{ fontWeight: 700, color: 'var(--color-ink-primary)', fontSize: 13 }}>
                  Pay app <span style={{ fontFamily: 'monospace' }}>{h.pay_app_id.slice(0, 8)}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)', marginTop: 2, letterSpacing: '0.04em' }}>
                  Trigger: {h.release_trigger.replace(/_/g, ' ')}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', textAlign: 'right' }}>
                {fmtMoney(h.amount_held)}
              </div>
              <div style={{ fontSize: 11, color: isReleased ? 'var(--bos-color-brand-primary-deep)' : 'var(--bos-color-ink-tertiary)', textAlign: 'right' }}>
                {isReleased ? fmtDate(h.released_at) : '—'}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                  letterSpacing: '0.04em', whiteSpace: 'nowrap',
                  background: isReleased ? '#f0fdfa' : '#fffbeb',
                  color: isReleased ? 'var(--bos-color-brand-primary-deep)' : 'var(--color-amber-800)',
                  border: isReleased ? '1px solid #0f766e33' : '1px solid #92400e33',
                }}>
                  {isReleased ? 'Released' : 'Held'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
