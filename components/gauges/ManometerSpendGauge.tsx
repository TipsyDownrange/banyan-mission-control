/**
 * ManometerSpendGauge — Ship's Bridge vertical liquid-level gauge for $ spend.
 *
 * Visually distinct from the radial quota gauges so the operator can tell
 * "% used" (radial) apart from "$ spent" (vertical column). Pure SVG.
 */

import type { RelayState } from '@/lib/cost/types';

interface ManometerSpendGaugeProps {
  /** Spend amount in USD. */
  amountUsd: number;
  /** Top of the scale (caller chooses a sensible cap, e.g. daily budget × 1.5). */
  scaleMax: number;
  /** Short label shown under the column (e.g. "Today"). */
  label: string;
  /** State of the lane this gauge belongs to. */
  state: RelayState;
  /** Optional width in px (default 92). */
  width?: number;
  /** Optional height in px (default 156). */
  height?: number;
}

const FILL_HIGH = 'var(--color-red-500, #ef4444)';
const FILL_MID = 'var(--color-amber-500, #d97706)';
const FILL_LOW = 'var(--color-teal-500, #14b8a6)';
const BRASS = 'var(--color-brass-400, #d2a85a)';
const BRASS_DARK = 'var(--color-brass-700, #7a571a)';
const NAVY_FACE = 'var(--color-navy-panel, #0a1e2d)';

export function ManometerSpendGauge({
  amountUsd,
  scaleMax,
  label,
  state,
  width = 92,
  height = 156,
}: ManometerSpendGaugeProps) {
  const clampedMax = Math.max(scaleMax, 0.01);
  const pct = Math.max(0, Math.min(1, amountUsd / clampedMax));
  const isBroken = state === 'BROKEN_AUTH' || state === 'BROKEN_SCHEMA';
  const isUnhealthy = isBroken || state === 'STALE' || state === 'DEGRADED' || state === 'NOT_CONFIGURED';
  const fillColor = pct >= 0.85 ? FILL_HIGH : pct >= 0.6 ? FILL_MID : FILL_LOW;

  const columnX = width * 0.32;
  const columnW = width * 0.36;
  const columnTopY = 14;
  const columnBottomY = height - 30;
  const columnH = columnBottomY - columnTopY;
  const fillH = columnH * pct;
  const fillY = columnBottomY - fillH;

  const ariaLabel = `${label}: $${amountUsd.toFixed(2)} of $${scaleMax.toFixed(2)} scale, state ${state}`;

  return (
    <figure
      role="img"
      aria-label={ariaLabel}
      data-manometer-gauge={label.toLowerCase()}
      data-state={state}
      style={{
        margin: 0,
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        opacity: isUnhealthy && !isBroken ? 0.78 : 1,
      }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        {/* Brass bezel rectangle */}
        <rect x={columnX - 6} y={columnTopY - 6} width={columnW + 12} height={columnH + 12} rx={6} fill={NAVY_FACE} stroke={BRASS} strokeWidth={2.5} />
        <rect x={columnX - 8} y={columnTopY - 8} width={columnW + 16} height={columnH + 16} rx={7} fill="none" stroke={BRASS_DARK} strokeWidth={1} />

        {/* Inner column track */}
        <rect x={columnX} y={columnTopY} width={columnW} height={columnH} rx={2} fill="rgba(0,0,0,0.32)" />

        {/* Liquid fill — animates on prop change */}
        <rect
          x={columnX}
          y={fillY}
          width={columnW}
          height={fillH}
          rx={2}
          fill={fillColor}
          opacity={0.85}
          style={{ transition: 'y 600ms cubic-bezier(0.4, 0.0, 0.2, 1), height 600ms cubic-bezier(0.4, 0.0, 0.2, 1)' }}
        />

        {/* Tick marks at 25/50/75% */}
        {[0.25, 0.5, 0.75].map(t => {
          const y = columnBottomY - columnH * t;
          return (
            <g key={t}>
              <line x1={columnX - 4} y1={y} x2={columnX} y2={y} stroke={BRASS} strokeWidth={1.2} opacity={0.7} />
              <line x1={columnX + columnW} y1={y} x2={columnX + columnW + 4} y2={y} stroke={BRASS} strokeWidth={1.2} opacity={0.7} />
            </g>
          );
        })}

        {/* $ readout above column */}
        <text x={width / 2} y={columnTopY - 2} textAnchor="middle" fill="#f8fafc" fontSize={13} fontWeight={950} fontFamily="ui-monospace, SFMono-Regular, monospace" style={{ fontVariantNumeric: 'tabular-nums' }}>
          ${formatAmount(amountUsd)}
        </text>
      </svg>
      <figcaption style={{ color: '#f8fafc', fontSize: 11, fontWeight: 850, letterSpacing: '0.04em' }}>{label}</figcaption>
    </figure>
  );
}

function formatAmount(usd: number): string {
  if (usd >= 1000) return usd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (usd >= 10) return usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
