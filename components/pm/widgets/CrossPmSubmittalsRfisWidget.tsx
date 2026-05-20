'use client';
/**
 * BAN-348 PM-V1.0-I — Cross-PM Submittal/RFI Pipelines widget (senior).
 */

import WidgetShell from './WidgetShell';
import { useWidgetData } from './useWidgetData';

type Bucket = Record<string, number>;
type Pipeline = { total: number; overdue: number; by_ball_in_court: Bucket };
type Data = { submittals: Pipeline; rfis: Pipeline };

function PipelineBlock({ label, p }: { label: string; p: Pipeline }) {
  const entries = Object.entries(p.by_ball_in_court).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ padding: 10, background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-surface-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bos-color-brand-primary-deep)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>
          {p.total} open · <span style={{ color: 'var(--color-red-700)', fontWeight: 700 }}>{p.overdue} overdue</span>
        </div>
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entries.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>None.</div>
        )}
        {entries.map(([bic, n]) => (
          <div key={bic} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--bos-color-ink-tertiary)' }}>{bic}</span>
            <span style={{ fontWeight: 700, color: 'var(--color-ink-primary)' }}>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CrossPmSubmittalsRfisWidget({ onHide, showHide }: { onHide?: () => void; showHide?: boolean }) {
  const { data, loading, error } = useWidgetData<Data>('CROSS_PM_SUBMITTALS_RFIS');
  return (
    <WidgetShell
      kind="CROSS_PM_SUBMITTALS_RFIS"
      title="Cross-PM Pipelines"
      subtitle="Workspace-wide submittals + RFIs"
      loading={loading}
      error={error}
      onHide={onHide}
      showHide={showHide}
    >
      {!data ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PipelineBlock label="Submittals" p={data.submittals} />
          <PipelineBlock label="RFIs" p={data.rfis} />
        </div>
      )}
    </WidgetShell>
  );
}
