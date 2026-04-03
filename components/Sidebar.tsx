'use client';
import { useState } from 'react';
import type { AppView } from '@/app/page';

const NAV: { section: string; icon: string; items: { label: AppView; dot?: string }[] }[] = [
  {
    section: 'Assistant',
    icon: '✦',
    items: [
      { label: 'Today', dot: '#14b8a6' },
      { label: 'Inbox', dot: '#f59e0b' },
      { label: 'Calendar' },
    ],
  },
  {
    section: 'Operations',
    icon: '◈',
    items: [
      { label: 'Overview' },
      { label: 'Event Feed' },
      { label: 'Issues' },
    ],
  },
  {
    section: 'Projects',
    icon: '⬡',
    items: [
      { label: 'Projects' },
      { label: 'Schedules', dot: '#14b8a6' },
      { label: 'Submittals', dot: '#14b8a6' },
      { label: 'Budget', dot: '#14b8a6' },
      { label: 'Change Orders', dot: '#14b8a6' },
    ],
  },
  {
    section: 'People & Assets',
    icon: '◉',
    items: [
      { label: 'Crew' },
      { label: 'Customers' },
    ],
  },
  {
    section: 'Estimating',
    icon: '◎',
    items: [
      { label: 'Bid Intake', dot: '#f59e0b' },
      { label: 'Bid Queue' },
      { label: 'My Bids', dot: '#14b8a6' },
    ],
  },
  {
    section: 'Service',
    icon: '◇',
    items: [
      { label: 'Work Orders', dot: '#f59e0b' },
    ],
  },
  {
    section: 'AI Command',
    icon: '⬥',
    items: [
      { label: 'Task Board' },
      { label: 'Approvals', dot: '#f97316' },
      { label: 'Workflows' },
      { label: 'Cost & Usage' },
    ],
  },
];

// Sections collapsed by default to reduce scroll
const DEFAULT_COLLAPSED = new Set(['AI Command', 'Operations']);

type Props = {
  activeView: AppView;
  onSelect: (v: AppView) => void;
  collapsed: boolean;
  onToggle: () => void;
  demoUser?: string;
  onUserChange?: (u: string) => void;
};

export default function Sidebar({ activeView, onSelect, collapsed, onToggle, demoUser, onUserChange }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(DEFAULT_COLLAPSED);

  function toggleSection(section: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  // Auto-expand section containing active view
  const activeSection = NAV.find(n => n.items.some(i => i.label === activeView))?.section;

  return (
    <aside
      style={{
        width: collapsed ? 56 : 224,
        minWidth: collapsed ? 56 : 224,
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
      {/* Brand + collapse */}
      <div style={{
        padding: collapsed ? '20px 0' : '18px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        flexShrink: 0,
      }}>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(148,163,184,0.6)', letterSpacing: '0.04em', marginBottom: 2 }}>
              Kula Glass Company
            </div>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.02em', color: '#f8fafc', lineHeight: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: 'white', letterSpacing: '-0.04em', flexShrink: 0 }}>B</span>
              Banyan<span style={{ color: '#14b8a6' }}>OS</span>
            </div>
          </div>
        )}
        {collapsed && <div style={{ fontSize: 14, fontWeight: 900, color: '#14b8a6' }}>B</div>}
        <button onClick={onToggle}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '4px 6px', color: 'rgba(148,163,184,0.5)', cursor: 'pointer', fontSize: 10, lineHeight: 1 }}>
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: collapsed ? '10px 7px 0' : '10px 8px 0', overflowY: 'auto', scrollbarWidth: 'none' }}>
        {NAV.map(({ section, icon, items }) => {
          const isSectionCollapsed = collapsedSections.has(section) && section !== activeSection;
          const hasActive = items.some(i => i.label === activeView);

          return (
            <div key={section} style={{ marginBottom: 4 }}>
              {/* Section header — clickable to collapse/expand */}
              {!collapsed && (
                <button
                  onClick={() => toggleSection(section)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    marginBottom: isSectionCollapsed ? 4 : 2,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 9, color: hasActive ? '#14b8a6' : 'rgba(148,163,184,0.45)', lineHeight: 1 }}>{icon}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: hasActive ? 'rgba(203,213,225,0.85)' : 'rgba(148,163,184,0.55)' }}>{section}</span>
                  </div>
                  <span style={{ fontSize: 9, color: 'rgba(148,163,184,0.25)', transition: 'transform 0.15s', display: 'inline-block', transform: isSectionCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
                </button>
              )}

              {collapsed && <div style={{ height: 6 }} />}

              {/* Items — hidden when section collapsed */}
              {!isSectionCollapsed && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                            gap: 7,
                            padding: collapsed ? '8px 0' : '7px 9px',
                            borderRadius: 9,
                            border: `1px solid ${isActive ? 'rgba(251,146,60,0.3)' : 'transparent'}`,
                            background: isActive
                              ? 'linear-gradient(135deg, rgba(249,115,22,0.16) 0%, rgba(234,88,12,0.07) 100%)'
                              : isHov ? 'rgba(255,255,255,0.04)' : 'transparent',
                            color: isActive ? '#ffedd5' : isHov ? '#e8f4f8' : 'rgba(203,213,225,0.6)',
                            fontSize: 12.5,
                            fontWeight: isActive ? 700 : 450,
                            cursor: 'pointer',
                            transition: 'all 0.1s ease',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                          }}>
                          {dot && !collapsed && (
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0, boxShadow: `0 0 4px ${dot}66` }} />
                          )}
                          {collapsed
                            ? <span style={{ fontSize: 10, fontWeight: 700, color: dot || 'rgba(203,213,225,0.45)', letterSpacing: '-0.01em' }}>{label.charAt(0)}</span>
                            : label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div style={{ padding: '10px 14px 18px', borderTop: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, display: 'grid', gap: 8 }}>
          {onUserChange && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.35)', marginBottom: 4 }}>Preview as</div>
              <select value={demoUser} onChange={e => onUserChange(e.target.value)}
                style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'rgba(203,213,225,0.7)', cursor: 'pointer', outline: 'none' }}>
                {['Sean Daniels','Kyle Shimizu','Jenny Shimabukuro','Joey Ritthaler','Frank Redondo'].map(u => (
                  <option key={u} style={{ background: '#0c2330' }}>{u}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(94,234,212,0.2)' }}>
            BanyanOS · Field Phase
          </div>
        </div>
      )}
    </aside>
  );
}
