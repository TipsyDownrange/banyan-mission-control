/**
 * RadialQuotaGauge — Ship's Bridge analog dial for a 0-100% quota window.
 *
 * Pure SVG, no canvas, no chart libs. Color zones (BAN-319 packet §4.1):
 *   0-60%   green
 *   60-85%  amber
 *   85-100% red
 *
 * Brass bezel + navy face; needle animates via CSS transform on prop change.
 */

import type { RelayState } from '@/lib/cost/types';

interface RadialQuotaGaugeProps {
  /** 0-100. Clamped to range. */
  percentage: number;
  /** Short label shown under the dial (e.g. "Session"). */
  label: string;
  /** ISO 8601 reset timestamp, or null when unknown. */
  resetsAt: string | null;
  /** State of the lane this gauge belongs to. Dims/marks unhealthy states. */
  state: RelayState;
  /** Optional size in px (default 132). */
  size?: number;
}

const GREEN = 'var(--color-teal-500, #14b8a6)';
const AMBER = 'var(--color-amber-500, #d97706)';
const RED = 'var(--color-red-500, #ef4444)';
const BRASS = 'var(--color-brass-400, #d2a85a)';
const BRASS_DARK = 'var(--color-brass-700, #7a571a)';
const NAVY_FACE = 'var(--color-navy-panel, #0a1e2d)';

export function RadialQuotaGauge({
  percentage,
  label,
  resetsAt,
  state,
  size = 132,
}: RadialQuotaGaugeProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;
  const startAngle = -120;
  const endAngle = 120;
  const needleAngle = startAngle + ((endAngle - startAngle) * clamped) / 100;
  const isBroken = state === 'BROKEN_AUTH' || state === 'BROKEN_SCHEMA';
  const isUnhealthy = isBroken || state === 'STALE' || state === 'DEGRADED' || state === 'NOT_CONFIGURED';
  const needleColor = clamped >= 85 ? RED : clamped >= 60 ? AMBER : GREEN;

  const arcs = [
    { from: 0, to: 60, color: GREEN },
    { from: 60, to: 85, color: AMBER },
    { from: 85, to: 100, color: RED },
  ];

  const ariaLabel = `${label}: ${Math.round(clamped)}% used${resetsAt ? `, resets ${formatRelative(resetsAt)}` : ''}, state ${state}`;

  return (
    <figure
      role="img"
      aria-label={ariaLabel}
      data-radial-gauge={label.toLowerCase()}
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
      <svg
        width={size}
        height={size * 0.78}
        viewBox={`0 0 ${size} ${size * 0.78}`}
        style={{ display: 'block' }}
      >
        {/* Brass bezel */}
        <circle cx={cx} cy={cy} r={radius + 6} fill="none" stroke={BRASS} strokeWidth={3} />
        <circle cx={cx} cy={cy} r={radius + 9} fill="none" stroke={BRASS_DARK} strokeWidth={1} />

        {/* Navy face */}
        <circle cx={cx} cy={cy} r={radius + 3} fill={NAVY_FACE} />

        {/* Color zones */}
        {arcs.map(arc => (
          <path
            key={`${arc.from}-${arc.to}`}
            d={arcPath(cx, cy, radius, valueToAngle(arc.from, startAngle, endAngle), valueToAngle(arc.to, startAngle, endAngle))}
            stroke={arc.color}
            strokeWidth={9}
            fill="none"
            strokeLinecap="butt"
            opacity={0.85}
          />
        ))}

        {/* Tick marks every 10% */}
        {Array.from({ length: 11 }, (_, i) => i * 10).map(tick => {
          const a = (valueToAngle(tick, startAngle, endAngle) * Math.PI) / 180;
          const x1 = cx + (radius - 6) * Math.cos(a);
          const y1 = cy + (radius - 6) * Math.sin(a);
          const x2 = cx + (radius - 2) * Math.cos(a);
          const y2 = cy + (radius - 2) * Math.sin(a);
          return <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} stroke={BRASS} strokeWidth={1.5} opacity={0.7} />;
        })}

        {/* Needle */}
        <g
          style={{
            transform: `rotate(${needleAngle + 90}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: 'transform 600ms cubic-bezier(0.4, 0.0, 0.2, 1)',
          }}
        >
          <line x1={cx} y1={cy} x2={cx} y2={cy - radius + 4} stroke={needleColor} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={5} fill={BRASS} stroke={BRASS_DARK} strokeWidth={1} />
        </g>

        {/* Center readout */}
        <text x={cx} y={cy + radius * 0.55} textAnchor="middle" fill="#f8fafc" fontSize={18} fontWeight={950} fontFamily="ui-monospace, SFMono-Regular, monospace" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(clamped)}%
        </text>
      </svg>
      <figcaption style={{ display: 'grid', gap: 2, textAlign: 'center' }}>
        <span style={{ color: '#f8fafc', fontSize: 12, fontWeight: 850, letterSpacing: '0.04em' }}>{label}</span>
        {resetsAt && (
          <span style={{ color: '#94a3b8', fontSize: 10 }}>resets {formatRelative(resetsAt)}</span>
        )}
      </figcaption>
    </figure>
  );
}

function valueToAngle(value: number, start: number, end: number): number {
  return start + ((end - start) * Math.max(0, Math.min(100, value))) / 100;
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'unknown';
  const deltaMs = t - Date.now();
  if (deltaMs <= 0) return 'now';
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
