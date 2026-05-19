'use client';
/**
 * BAN-348 PM-V1.0-I — Project Health Heat Map widget (senior).
 */

import WidgetShell from './WidgetShell';
import { useWidgetData } from './useWidgetData';
import type { HeatStatus } from '@/lib/pm/dashboard/types';

type Item = {
  engagement_id: string;
  kid: string;
  pm_handoff_state: string;
  overdue_count: number;
  days_since_last_activity: number | null;
  heat: HeatStatus;
};

type Data = {
  items: Item[];
  summary: Record<HeatStatus, number>;
  total: number;
};

const HEAT_STYLE: Record<HeatStatus, { bg: string; border: string; fg: string }> = {
  GREEN: { bg: '#dcfce7', border: '#86efac', fg: '#166534' },
  YELLOW: { bg: '#fef9c3', border: '#fde047', fg: '#854d0e' },
  RED: { bg: '#fee2e2', border: '#fca5a5', fg: '#991b1b' },
};

export default function ProjectHealthHeatMapWidget({ onHide, showHide }: { onHide?: () => void; showHide?: boolean }) {
  const { data, loading, error } = useWidgetData<Data>('PROJECT_HEALTH_HEAT_MAP');
  return (
    <WidgetShell
      kind="PROJECT_HEALTH_HEAT_MAP"
      title="Project Health Heat Map"
      subtitle={data
        ? `${data.summary.RED} red · ${data.summary.YELLOW} yellow · ${data.summary.GREEN} green`
        : 'Activity recency × overdue count'}
      loading={loading}
      error={error}
      onHide={onHide}
      showHide={showHide}
    >
      {!data || data.items.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
          No active projects.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 6,
          }}
        >
          {data.items.map((p) => {
            const s = HEAT_STYLE[p.heat];
            return (
              <div
                key={p.engagement_id}
                title={`${p.kid} — ${p.overdue_count} overdue · ${p.days_since_last_activity ?? '—'}d since activity`}
                style={{
                  padding: '8px 10px',
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                  borderRadius: 8,
                  color: s.fg,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.kid}
                </div>
                <div style={{ fontSize: 10, marginTop: 2 }}>
                  {p.overdue_count} overdue
                  {p.days_since_last_activity !== null && ` · ${p.days_since_last_activity}d`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}
