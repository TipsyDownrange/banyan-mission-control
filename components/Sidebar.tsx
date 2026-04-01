'use client';
import { useState } from 'react';
import type { AppView } from '@/app/page';

const NAV: { section: string; items: { label: AppView; dot?: string }[] }[] = [
  {
    section: 'Assistant',
    items: [
      { label: 'Today', dot: '#14b8a6' },
      { label: 'Inbox', dot: '#f59e0b' },
      { label: 'Calendar' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { label: 'Overview' },
      { label: 'Event Feed' },
      { label: 'Issues' },
    ],
  },
  {
    section: 'Projects',
    items: [
      { label: 'Projects' },
      { label: 'Schedules' },
      { label: 'Submittals' },
    ],
  },
  {
    section: 'People',
    items: [
      { label: 'Crew' },
    ],
  },
  {
    section: 'Estimating',
    items: [
      { label: 'Bid Intake', dot: '#f59e0b' },
      { label: 'Bid Queue' },
    ],
  },
  {
    section: 'AI Command',
    items: [
      { label: 'Task Board' },
      { label: 'Approvals', dot: '#f97316' },
      { label: 'Workflows' },
      { label: 'Cost & Usage' },
    ],
  },
];

type Props = { activeView: AppView; onSelect: (v: AppView) => void; collapsed: boolean; onToggle: () => void };

export default function Sidebar({ activeView, onSelect, collapsed, onToggle }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <aside
      style={{
        width: collapsed ? 56 : 240,
        minWidth: collapsed ? 56 : 240,
        flexShrink: 0,
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'linear-gradient(180deg, #071722 0%, #0c2330 54%, #102c39 100%)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        scrollbarWidth: 'none',
      }}
    >
      {/* Brand + collapse toggle */}
      <div style={{
        padding: collapsed ? '20px 0' : '20px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 8,
        flexShrink: 0,
      }}>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.03em', color: '#f8fafc', lineHeight: 1 }}>
              Banyan<span style={{ color: '#14b8a6' }}>OS</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(148,163,184,0.4)', letterSpacing: '0.06em', marginTop: 3 }}>
              Kula Glass
            </div>
          </div>
        )}
        {collapsed && (
          <div style={{ fontSize: 14, fontWeight: 900, color: '#14b8a6', letterSpacing: '-0.02em' }}>B</div>
        )}
        <button
          onClick={onToggle}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            padding: '5px 7px',
            color: 'rgba(148,163,184,0.5)',
            cursor: 'pointer',
            fontSize: 11,
            flexShrink: 0,
            lineHeight: 1,
          }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: collapsed ? '12px 8px 0' : '12px 10px 0' }}>
        {NAV.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 16 }}>
            {!collapsed && (
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'rgba(148,163,184,0.35)', padding: '0 6px', marginBottom: 4,
              }}>
                {section}
              </div>
            )}
            {collapsed && <div style={{ height: 8 }} />}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {items.map(({ label, dot }) => {
                const isActive = activeView === label;
                const isHov = hovered === label;
                return (
                  <li key={label}>
                    <button
                      onClick={() => onSelect(label)}
                      onMouseEnter={() => setHovered(label)}
                      onMouseLeave={() => setHovered(null)}
                      title={collapsed ? label : undefined}
                      style={{
                        width: '100%',
                        textAlign: collapsed ? 'center' : 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        gap: 8,
                        padding: collapsed ? '9px 0' : '8px 10px',
                        borderRadius: 10,
                        border: `1px solid ${isActive ? 'rgba(251,146,60,0.3)' : 'transparent'}`,
                        background: isActive
                          ? 'linear-gradient(135deg, rgba(249,115,22,0.16) 0%, rgba(234,88,12,0.07) 100%)'
                          : isHov ? 'rgba(255,255,255,0.04)' : 'transparent',
                        color: isActive ? '#ffedd5' : isHov ? '#e8f4f8' : 'rgba(203,213,225,0.65)',
                        fontSize: 13,
                        fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.12s ease',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                      }}
                    >
                      {dot && (
                        <span style={{
                          width: collapsed ? 8 : 6,
                          height: collapsed ? 8 : 6,
                          borderRadius: '50%',
                          background: dot,
                          flexShrink: 0,
                          boxShadow: `0 0 5px ${dot}55`,
                        }} />
                      )}
                      {!dot && collapsed && (
                        <span style={{ fontSize: 13, opacity: 0.5 }}>{label.charAt(0)}</span>
                      )}
                      {!collapsed && label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div style={{ padding: '12px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(94,234,212,0.25)' }}>
            BanyanOS · Field Phase
          </div>
        </div>
      )}
    </aside>
  );
}
