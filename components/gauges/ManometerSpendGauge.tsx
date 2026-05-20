'use client';

/**
 * Ship's Bridge War Room — manometer spend gauge. Vertical liquid-level
 * treatment with tabular-figure readout. Used for API dollar spend per scope.
 */

import type { CostSourceState } from '@/lib/cost/stateMachine';

export interface ManometerSpendGaugeProps {
  amountUsd: number;
  scaleMax: number;
  label: string;
  state?: CostSourceState;
  width?: number;
  height?: number;
}

function formatUsd(value: number, digits = 2): string {
  return `$${(value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fillColor(ratio: number): string {
  if (ratio >= 0.85) return '#ef4444';
  if (ratio >= 0.6) return '#fbbf24';
  return '#22c55e';
}

export function ManometerSpendGauge({
  amountUsd,
  scaleMax,
  label,
  state,
  width = 80,
  height = 160,
}: ManometerSpendGaugeProps) {
  const safeMax = scaleMax > 0 ? scaleMax : 1;
  const ratio = Math.max(0, Math.min(1, amountUsd / safeMax));
  const fillHeight = Math.round((height - 16) * ratio);
  const fill = fillColor(ratio);
  const dimmed = state === 'BROKEN_AUTH' || state === 'BROKEN_SCHEMA' || state === 'NOT_CONFIGURED';

  return (
    <div
      data-manometer-spend={label}
      data-state={state || 'LIVE'}
      role="img"
      aria-label={`${label}: ${formatUsd(amountUsd)} of ${formatUsd(safeMax)}${state ? `, state ${state}` : ''}`}
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: dimmed ? 0.55 : 1 }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={`tube-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0c1e2c" />
            <stop offset="50%" stopColor="#1a3346" />
            <stop offset="100%" stopColor="#0c1e2c" />
          </linearGradient>
          <linearGradient id={`brass-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7a5520" />
            <stop offset="50%" stopColor="#c08838" />
            <stop offset="100%" stopColor="#7a5520" />
          </linearGradient>
        </defs>
        <rect x={4} y={4} width={width - 8} height={height - 8} rx={10} ry={10} fill={`url(#tube-${label})`} stroke={`url(#brass-${label})`} strokeWidth={2} />
        <rect
          x={10}
          y={height - 8 - fillHeight}
          width={width - 20}
          height={fillHeight}
          fill={fill}
          opacity={0.85}
          style={{ transition: 'y 600ms cubic-bezier(0.2,0.8,0.2,1), height 600ms cubic-bezier(0.2,0.8,0.2,1)' }}
        />
        {[0.25, 0.5, 0.75].map(t => (
          <line key={t} x1={10} x2={width - 10} y1={height - 8 - (height - 16) * t} y2={height - 8 - (height - 16) * t} stroke="var(--bos-color-ink-tertiary)" strokeWidth={0.6} opacity={0.5} />
        ))}
      </svg>
      <div style={{ color: 'var(--color-surface)', fontSize: 14, fontWeight: 950, fontVariantNumeric: 'tabular-nums' }}>{formatUsd(amountUsd)}</div>
      <div style={{ color: '#cbd5e1', fontSize: 10, fontWeight: 850, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ color: 'var(--bos-color-ink-disabled)', fontSize: 9 }}>of {formatUsd(safeMax, 0)}</div>
    </div>
  );
}

export default ManometerSpendGauge;
