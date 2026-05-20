'use client';
/**
 * BAN-348 PM-V1.0-I — Recent Activity widget (last 20 events).
 */

import WidgetShell from './WidgetShell';
import { useWidgetData } from './useWidgetData';

type Item = {
  event_id: string;
  event_type: string | null;
  description: string | null;
  created_at: string | null;
};

type Data = { items: Item[]; total: number };

export default function RecentActivityWidget({ onHide, showHide }: { onHide?: () => void; showHide?: boolean }) {
  const { data, loading, error } = useWidgetData<Data>('RECENT_ACTIVITY');
  return (
    <WidgetShell
      kind="RECENT_ACTIVITY"
      title="Recent Activity"
      subtitle={data ? `${data.total} latest events` : 'Across your projects'}
      loading={loading}
      error={error}
      onHide={onHide}
      showHide={showHide}
    >
      {!data || data.items.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', fontSize: 12 }}>
          No recent activity.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.items.map((e) => (
            <div
              key={e.event_id}
              style={{
                padding: '6px 10px',
                background: 'var(--color-surface)',
                borderRadius: 6,
                border: '1px solid var(--color-surface-border)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-ink-primary)' }}>{e.event_type ?? '—'}</div>
              {e.description && (
                <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>{e.description}</div>
              )}
              {e.created_at && (
                <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
                  {new Date(e.created_at).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}
