'use client';

/**
 * Ship's Bridge War Room — radial quota gauge. Pure SVG (no canvas, no chart
 * libs). 0-60 green, 60-85 amber, 85-100 red. Needle is a CSS-animated SVG
 * transform on the percentage.
 */

import type { CostSourceState } from '@/lib/cost/stateMachine';

export interface RadialQuotaGaugeProps {
  percentage: number;
  label: string;
  resetsAt?: string | null;
  state?: CostSourceState;
  /** Diameter in pixels. Defaults to 140. */
  size?: number;
}

const ARC_START = -135;
const ARC_END = 135;
const ARC_SWEEP = ARC_END - ARC_START;

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function zoneColor(pct: number): string {
  if (pct >= 85) return '#ef4444';
  if (pct >= 60) return '#fbbf24';
  return '#22c55e';
}

function formatResetCountdown(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const deltaMs = t - Date.now();
  if (deltaMs <= 0) return 'resetting now';
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 60) return `resets in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return `resets in ${hours}h ${remMin}m`;
  const days = Math.floor(hours / 24);
  return `resets in ${days}d ${hours % 24}h`;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [sx, sy] = polar(cx, cy, r, startDeg);
  const [ex, ey] = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

export function RadialQuotaGauge({
  percentage,
  label,
  resetsAt,
  state,
  size = 140,
}: RadialQuotaGaugeProps) {
  const pct = clampPct(percentage);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;
  const needleDeg = ARC_START + (pct / 100) * ARC_SWEEP;
  const zone = zoneColor(pct);
  const reset = formatResetCountdown(resetsAt);
  const dimmed = state === 'BROKEN_AUTH' || state === 'BROKEN_SCHEMA' || state === 'NOT_CONFIGURED';

  const greenEndDeg = ARC_START + 0.6 * ARC_SWEEP;
  const amberEndDeg = ARC_START + 0.85 * ARC_SWEEP;
  const tickStep = 25;

  return (
    <div
      data-radial-quota-gauge={label}
      data-state={state || 'LIVE'}
      role="img"
      aria-label={`${label}: ${pct.toFixed(0)}% used${reset ? `, ${reset}` : ''}${state ? `, state ${state}` : ''}`}
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: dimmed ? 0.55 : 1 }}
    >
      <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size * 0.78}`}>
        <defs>
          <linearGradient id={`brass-${label}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#b08438" />
            <stop offset="100%" stopColor="#5a3f15" />
          </linearGradient>
        </defs>
        <path d={arcPath(cx, cy, r, ARC_START, greenEndDeg)} stroke="#22c55e" strokeWidth={10} fill="none" strokeLinecap="round" opacity={0.55} />
        <path d={arcPath(cx, cy, r, greenEndDeg, amberEndDeg)} stroke="#fbbf24" strokeWidth={10} fill="none" opacity={0.55} />
        <path d={arcPath(cx, cy, r, amberEndDeg, ARC_END)} stroke="#ef4444" strokeWidth={10} fill="none" strokeLinecap="round" opacity={0.55} />
        {[0, tickStep, tickStep * 2, tickStep * 3, 100].map(t => {
          const deg = ARC_START + (t / 100) * ARC_SWEEP;
          const [ix, iy] = polar(cx, cy, r - 14, deg);
          const [ox, oy] = polar(cx, cy, r - 4, deg);
          return <line key={t} x1={ix} y1={iy} x2={ox} y2={oy} stroke="var(--bos-color-ink-tertiary)" strokeWidth={1.5} />;
        })}
        <g
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${needleDeg}deg)`,
            transition: 'transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        >
          <line x1={cx} y1={cy} x2={cx} y2={cy - (r - 8)} stroke={zone} strokeWidth={3} strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r={6} fill={`url(#brass-${label})`} stroke="var(--color-ink-primary)" strokeWidth={1.5} />
        <text x={cx} y={cy + r * 0.55} textAnchor="middle" fill="var(--color-surface)" fontSize={size * 0.18} fontWeight={900} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {pct.toFixed(0)}%
        </text>
      </svg>
      <div style={{ color: '#cbd5e1', fontSize: 11, fontWeight: 850, textAlign: 'center', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</div>
      {reset && <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 10 }}>{reset}</div>}
    </div>
  );
}

export default RadialQuotaGauge;
