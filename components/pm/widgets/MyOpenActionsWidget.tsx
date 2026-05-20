'use client';
/**
 * BAN-348 PM-V1.0-I — My Open Actions widget.
 */

import WidgetShell from './WidgetShell';
import { useWidgetData } from './useWidgetData';

type Item = {
  action_item_id: string;
  title: string;
  priority: string;
  status: string;
  due_date: string | null;
  kid: string | null;
};

type Data = { items: Item[]; total: number; project_count: number };

const PRIORITY_COLOR: Record<string, string> = {
  URGENT: '#b91c1c',
  HIGH: '#c2410c',
  MEDIUM: '#0f766e',
  LOW: '#475569',
};

export default function MyOpenActionsWidget({ onHide, showHide }: { onHide?: () => void; showHide?: boolean }) {
  const { data, loading, error } = useWidgetData<Data>('MY_OPEN_ACTIONS');
  return (
    <WidgetShell
      kind="MY_OPEN_ACTIONS"
      title="My Open Actions"
      subtitle={data ? `${data.total} open · ${data.project_count} projects` : 'Assigned to you'}
      loading={loading}
      error={error}
      onHide={onHide}
      showHide={showHide}
    >
      {!data || data.items.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', fontSize: 12 }}>
          No open actions assigned to you.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.items.slice(0, 20).map((it) => (
            <div
              key={it.action_item_id}
              style={{
                display: 'flex',
                gap: 10,
                padding: '8px 10px',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: PRIORITY_COLOR[it.priority] ?? '#475569',
                  alignSelf: 'center',
                  minWidth: 50,
                }}
              >
                {it.priority}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
                  {it.kid ?? '—'}
                  {it.due_date && ` · due ${it.due_date}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}
