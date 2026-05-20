'use client';
/**
 * BAN-348 PM-V1.0-I — Cross-Project Submittal Pipeline widget.
 */

import { useMemo, useState } from 'react';
import WidgetShell from './WidgetShell';
import { useWidgetData } from './useWidgetData';

type Item = {
  submittal_id: string;
  submittal_number: string;
  display_label: string | null;
  status: string;
  ball_in_court: string | null;
  required_by_date: string | null;
  kid: string | null;
  is_overdue: boolean;
};

type Data = { items: Item[]; total: number };

type SortKey = 'ball' | 'overdue' | 'date';

export default function CrossProjectSubmittalsWidget({ onHide, showHide }: { onHide?: () => void; showHide?: boolean }) {
  const { data, loading, error } = useWidgetData<Data>('CROSS_PROJECT_SUBMITTALS');
  const [sortKey, setSortKey] = useState<SortKey>('overdue');

  const sorted = useMemo(() => {
    if (!data) return [];
    const items = [...data.items];
    items.sort((a, b) => {
      if (sortKey === 'ball') return (a.ball_in_court ?? '').localeCompare(b.ball_in_court ?? '');
      if (sortKey === 'overdue') return Number(b.is_overdue) - Number(a.is_overdue);
      return (a.required_by_date ?? '').localeCompare(b.required_by_date ?? '');
    });
    return items;
  }, [data, sortKey]);

  return (
    <WidgetShell
      kind="CROSS_PROJECT_SUBMITTALS"
      title="Submittal Pipeline"
      subtitle={data ? `${data.total} open across your projects` : 'Cross-project'}
      loading={loading}
      error={error}
      rightSlot={
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--color-surface-border)' }}
        >
          <option value="overdue">Sort: Overdue</option>
          <option value="ball">Sort: Ball-in-court</option>
          <option value="date">Sort: Required date</option>
        </select>
      }
      onHide={onHide}
      showHide={showHide}
    >
      {sorted.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', fontSize: 12 }}>
          No open submittals.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sorted.slice(0, 30).map((s) => (
            <div
              key={s.submittal_id}
              style={{
                display: 'flex',
                gap: 10,
                padding: '6px 10px',
                background: s.is_overdue ? '#fef2f2' : '#f8fafc',
                borderRadius: 6,
                border: `1px solid ${s.is_overdue ? '#fecaca' : 'var(--color-surface-border)'}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-primary)' }}>
                  {s.submittal_number} {s.display_label && `— ${s.display_label}`}
                </div>
                <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)' }}>
                  {s.kid ?? '—'} · BIC: {s.ball_in_court ?? '—'} · {s.required_by_date ?? 'no due date'}
                </div>
              </div>
              <span style={{ fontSize: 10, color: '#475569', alignSelf: 'center' }}>{s.status}</span>
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}
