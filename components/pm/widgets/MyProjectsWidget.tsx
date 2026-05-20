'use client';
/**
 * BAN-348 PM-V1.0-I — My Projects widget with KPI roll-ups.
 */

import WidgetShell from './WidgetShell';
import { useWidgetData } from './useWidgetData';

type Item = {
  engagement_id: string;
  kid: string;
  status: string;
  pm_handoff_state: string;
  target_completion_date: string | null;
  open_submittals: number;
  open_rfis: number;
  current_pay_app: {
    pay_app_number: number;
    state: string;
    current_amount_due: string | null;
    period_end: string;
  } | null;
  last_activity_at: string | null;
};

type Data = { items: Item[]; total: number };

export default function MyProjectsWidget({ onHide, showHide }: { onHide?: () => void; showHide?: boolean }) {
  const { data, loading, error } = useWidgetData<Data>('MY_PROJECTS');
  return (
    <WidgetShell
      kind="MY_PROJECTS"
      title="My Projects"
      subtitle={data ? `${data.total} active` : 'Assigned to you'}
      loading={loading}
      error={error}
      onHide={onHide}
      showHide={showHide}
    >
      {!data || data.items.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', fontSize: 12 }}>
          No active projects assigned to you.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.items.map((p) => (
            <div
              key={p.engagement_id}
              style={{
                padding: '10px 12px',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-primary)' }}>{p.kid}</div>
                <div style={{ fontSize: 10, color: 'var(--bos-color-ink-disabled)' }}>{p.pm_handoff_state}</div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: '#475569' }}>
                <span>{p.open_submittals} submittals</span>
                <span>{p.open_rfis} RFIs</span>
                {p.current_pay_app && (
                  <span>
                    Pay #{p.current_pay_app.pay_app_number} ({p.current_pay_app.state})
                  </span>
                )}
              </div>
              {p.last_activity_at && (
                <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)', marginTop: 4 }}>
                  last activity {new Date(p.last_activity_at).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}
