'use client';

/**
 * DashboardHeader — Reusable KPI dashboard strip for top of every section.
 * Pattern: Dashboard KPIs → Action Items → Control Surface (below, in each panel)
 * 
 * Usage:
 *   <DashboardHeader
 *     title="Operations"
 *     subtitle="Company-wide operational health"
 *     kpis={[{ label: 'Active Projects', value: '30', trend: 'up' }]}
 *     actionItems={[{ text: 'RFI overdue', severity: 'high' }]}
 *   />
 */

export type KPI = {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'flat';
  trendLabel?: string;
  color?: string; // accent color
  progress?: number; // 0-100, shows progress bar
};

export type ActionItem = {
  text: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  count?: number;
  link?: string;
};

const SEVERITY_STYLE: Record<string, { bg: string; border: string; color: string; dot: string }> = {
  critical: { bg: '#fef2f2', border: '#fecaca', color: '#991b1b', dot: '#dc2626' },
  high:     { bg: '#fff7ed', border: '#fed7aa', color: '#9a3412', dot: '#ea580c' },
  medium:   { bg: '#fffbeb', border: '#fde68a', color: '#92400e', dot: '#d97706' },
  low:      { bg: '#f0fdfa', border: '#99f6e4', color: '#115e59', dot: '#14b8a6' },
  info:     { bg: '#f0f9ff', border: '#bae6fd', color: '#075985', dot: '#0284c7' },
};

const TREND_ARROW: Record<string, { icon: string; color: string }> = {
  up:   { icon: '↑', color: '#059669' },
  down: { icon: '↓', color: '#dc2626' },
  flat: { icon: '→', color: '#64748b' },
};

export default function DashboardHeader({
  title,
  subtitle,
  kpis = [],
  actionItems = [],
}: {
  title: string;
  subtitle?: string;
  kpis?: KPI[];
  actionItems?: ActionItem[];
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 14, color: '#64748b' }}>{subtitle}</div>
        )}
      </div>

      {/* KPI Cards */}
      {kpis.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(${kpis.length <= 3 ? '200px' : '160px'}, 1fr))`,
          gap: 12,
          marginBottom: actionItems.length > 0 ? 16 : 0,
        }}>
          {kpis.map((kpi, i) => (
            <div key={i} style={{
              background: 'white',
              borderRadius: 16,
              padding: '16px 20px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(15,23,42,0.03)',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#94a3b8',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                marginBottom: 8,
              }}>
                {kpi.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{
                  fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em',
                  color: kpi.color || '#0f172a',
                }}>
                  {kpi.value}
                </div>
                {kpi.trend && (
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: TREND_ARROW[kpi.trend].color,
                  }}>
                    {TREND_ARROW[kpi.trend].icon} {kpi.trendLabel || ''}
                  </span>
                )}
              </div>
              {kpi.subtitle && (
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  {kpi.subtitle}
                </div>
              )}
              {kpi.progress !== undefined && (
                <div style={{
                  marginTop: 10, height: 5, borderRadius: 3,
                  background: '#f1f5f9', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: kpi.color || (kpi.progress >= 75 ? '#059669' : kpi.progress >= 40 ? '#d97706' : '#94a3b8'),
                    width: `${Math.min(100, kpi.progress)}%`,
                    transition: 'width 0.5s',
                  }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8,
        }}>
          {actionItems.map((item, i) => {
            const s = SEVERITY_STYLE[item.severity] || SEVERITY_STYLE.info;
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 10,
                background: s.bg, border: `1px solid ${s.border}`,
                fontSize: 12, fontWeight: 600, color: s.color,
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: s.dot, flexShrink: 0,
                }} />
                {item.text}
                {item.count !== undefined && (
                  <span style={{
                    fontWeight: 800, fontSize: 11,
                    background: `${s.dot}20`, padding: '2px 7px',
                    borderRadius: 6,
                  }}>
                    {item.count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
