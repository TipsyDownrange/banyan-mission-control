'use client';
/**
 * BAN-346 PM-V1.0-G — Critical gaps list (read-only + edit).
 *
 * Renders the critical_gaps array as a structured list with status badges.
 * When editable, exposes inline status updates and remove controls.
 */

import { EmptyState, StatusPill, type StatusPillVariant } from '@/components/design-system';

export type CriticalGap = {
  gap_id: string;
  gap_type: string;
  description: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'WAIVED';
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  OPEN:         { bg: '#fef2f2', fg: '#b91c1c' },
  ACKNOWLEDGED: { bg: '#fef3c7', fg: '#92400e' },
  RESOLVED:     { bg: '#f0fdf4', fg: '#15803d' },
  WAIVED:       { bg: '#f1f5f9', fg: '#475569' },
};

const STATUS_PILL_VARIANT: Record<CriticalGap['status'], StatusPillVariant> = {
  OPEN:         'error',
  ACKNOWLEDGED: 'warn',
  RESOLVED:     'success',
  WAIVED:       'info',
};

export default function CriticalGapsList({
  gaps,
  editable = false,
  onChange,
}: {
  gaps: CriticalGap[];
  editable?: boolean;
  onChange?: (next: CriticalGap[]) => void;
}) {
  if (!gaps || gaps.length === 0) {
    return (
      <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
        <EmptyState
          icon={<span style={{ fontSize: 20 }}>✓</span>}
          heading="No critical gaps reported."
        />
      </div>
    );
  }

  const updateGap = (idx: number, patch: Partial<CriticalGap>) => {
    if (!onChange) return;
    onChange(gaps.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  };
  const removeGap = (idx: number) => {
    if (!onChange) return;
    onChange(gaps.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {gaps.map((g, idx) => {
        const s = STATUS_COLORS[g.status] ?? STATUS_COLORS.OPEN;
        return (
          <div key={g.gap_id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {g.gap_type} <span style={{ color: '#94a3b8', fontWeight: 600 }}>· {g.gap_id}</span>
                </div>
                <div style={{ fontSize: 13, color: '#0f172a', marginTop: 4 }}>{g.description}</div>
              </div>
              {editable && onChange ? (
                <select
                  value={g.status}
                  onChange={(e) => updateGap(idx, { status: e.target.value as CriticalGap['status'] })}
                  style={{ fontSize: 11, padding: '4px 6px', borderRadius: 6, border: `1px solid ${s.fg}33`, color: s.fg, background: s.bg, fontWeight: 800 }}
                >
                  {(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'WAIVED'] as const).map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              ) : (
                <StatusPill variant={STATUS_PILL_VARIANT[g.status] ?? 'info'}>
                  {g.status}
                </StatusPill>
              )}
              {editable && onChange && (
                <button
                  type="button"
                  onClick={() => removeGap(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14 }}
                  aria-label="Remove gap"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
