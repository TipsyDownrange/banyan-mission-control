'use client';
/**
 * BAN-348 PM-V1.0-I — All-PM Workload widget (senior).
 */

import WidgetShell from './WidgetShell';
import { useWidgetData } from './useWidgetData';

type Item = {
  pm_user_id: string | null;
  name: string | null;
  email: string | null;
  active_project_count: number;
};

type Data = { items: Item[]; total: number };

export default function AllPmWorkloadWidget({ onHide, showHide }: { onHide?: () => void; showHide?: boolean }) {
  const { data, loading, error } = useWidgetData<Data>('ALL_PM_WORKLOAD');
  const max = data ? Math.max(1, ...data.items.map((i) => i.active_project_count)) : 1;

  return (
    <WidgetShell
      kind="ALL_PM_WORKLOAD"
      title="All-PM Workload"
      subtitle="Active projects per PM"
      loading={loading}
      error={error}
      onHide={onHide}
      showHide={showHide}
    >
      {!data || data.items.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
          No PMs currently assigned.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.items.map((it) => (
            <div key={it.pm_user_id ?? it.email ?? Math.random()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
                <span>{it.name ?? it.email ?? '—'}</span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{it.active_project_count}</span>
              </div>
              <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', marginTop: 2 }}>
                <div
                  style={{
                    width: `${(it.active_project_count / max) * 100}%`,
                    height: '100%',
                    background: '#0f766e',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}
