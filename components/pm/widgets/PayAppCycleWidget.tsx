'use client';
/**
 * BAN-348 PM-V1.0-I — Pay App Cycle widget (read-only AIA summary).
 */

import WidgetShell from './WidgetShell';
import { useWidgetData } from './useWidgetData';

type Item = {
  pay_app_id: string;
  pay_app_number: number;
  period_end: string;
  state: string;
  current_amount_due: string | null;
  submitted_at: string | null;
  gc_approved_at: string | null;
  kid: string | null;
};

type Data = { items: Item[]; total: number };

const ACTIVE_STATES = new Set(['PENDING_DRAFT', 'READY_FOR_NOTARIZATION', 'READY_FOR_SUBMISSION', 'SUBMITTED', 'ARCHITECT_CERTIFIED']);

export default function PayAppCycleWidget({ onHide, showHide }: { onHide?: () => void; showHide?: boolean }) {
  const { data, loading, error } = useWidgetData<Data>('PAY_APP_CYCLE');
  const active = data ? data.items.filter((p) => ACTIVE_STATES.has(p.state)) : [];

  return (
    <WidgetShell
      kind="PAY_APP_CYCLE"
      title="Pay App Cycle"
      subtitle={data ? `${active.length} active / ${data.total} total` : 'AIA G702/G703 read-only'}
      loading={loading}
      error={error}
      onHide={onHide}
      showHide={showHide}
    >
      {!data || data.items.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', fontSize: 12 }}>
          No pay applications in your projects.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.items.slice(0, 20).map((p) => (
            <div
              key={p.pay_app_id}
              style={{
                display: 'flex',
                gap: 10,
                padding: '6px 10px',
                background: '#f8fafc',
                borderRadius: 6,
                border: '1px solid var(--color-surface-border)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-primary)' }}>
                  {p.kid ?? '—'} · Pay App #{p.pay_app_number}
                </div>
                <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)' }}>
                  period end {p.period_end} · {p.state}
                </div>
              </div>
              {p.current_amount_due && (
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bos-color-brand-primary-deep)', alignSelf: 'center' }}>
                  ${p.current_amount_due}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}
