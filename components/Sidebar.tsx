'use client';
import { useState } from 'react';
import type { AppView } from '@/app/page';

// Icon mapping — SVG paths for each nav item
const ICONS: Record<string, string> = {
  // Assistant
  Today:       'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  Inbox:       'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  Calendar:    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  // Operations
  Overview:    'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  Forecasting: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  'Schedule': 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  'Dispatch Board': 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  'Event Feed': 'M13 10V3L4 14h7v7l9-11h-7z',
  Issues:      'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  // Projects
  Projects:    'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  Schedules:   'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  Submittals:  'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  Budget:      'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  'Change Orders': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  // People & Assets
  Crew:        'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  Customers:   'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  Assets:      'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  'Org Chart': 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  // Estimating
  'Bid Intake': 'M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76',
  'Bid Queue':  'M4 6h16M4 10h16M4 14h16M4 18h16',
  'My Bids':    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  'Estimating Workspace': 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',

  // Service
  'Work Orders': 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  // AI Command
  'Task Board': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  Approvals:   'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  Workflows:   'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  'Cost & Usage': 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
};

const NAV: { section: string; sectionIcon: string; items: { label: AppView; dot?: string }[] }[] = [
  {
    section: 'Assistant', sectionIcon: '✦',
    items: [
      { label: 'Today', dot: '#14b8a6' },
      { label: 'Inbox', dot: '#f59e0b' },
      { label: 'Calendar' },
    ],
  },
  {
    section: 'Operations', sectionIcon: '◈',
    items: [
      { label: 'Overview' },
      { label: 'Forecasting', dot: '#14b8a6' },
      { label: 'Schedule', dot: '#f59e0b' },
      { label: 'Event Feed' },
      { label: 'Issues' },
    ],
  },
  {
    section: 'Projects', sectionIcon: '⬡',
    items: [
      { label: 'Projects' },

    ],
  },
  {
    section: 'People & Assets', sectionIcon: '◉',
    items: [
      { label: 'Crew' },
      { label: 'Customers' },
      { label: 'Assets', dot: '#14b8a6' },
      { label: 'Org Chart' },
    ],
  },
  {
    section: 'Estimating', sectionIcon: '◎',
    items: [
      { label: 'Bid Intake', dot: '#f59e0b' },
      { label: 'Bid Queue' },
      { label: 'My Bids', dot: '#14b8a6' },
      { label: 'Estimating Workspace' },
    ],
  },
  {
    section: 'Service', sectionIcon: '◇',
    items: [
      { label: 'Work Orders', dot: '#f59e0b' },
    ],
  },
  {
    section: 'Admin & Finance', sectionIcon: '◐',
    items: [
      { label: 'WIP Report', dot: '#14b8a6' },
      { label: 'Financials' },
      { label: 'Vendors' },
      { label: 'Compliance', dot: '#f59e0b' },
      { label: 'HR' },
      { label: 'Safety' },
      { label: 'Fleet' },
    ],
  },
  {
    section: 'AI Command', sectionIcon: '⬥',
    items: [
      { label: 'Task Board' },
      { label: 'Approvals', dot: '#f97316' },
      { label: 'Workflows' },
      { label: 'Cost & Usage' },
    ],
  },
];

const DEFAULT_COLLAPSED_SECTIONS = new Set(['AI Command', 'Operations']);

function NavIcon({ path, size = 15, color }: { path: string; size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={path} />
    </svg>
  );
}

type Props = {
  activeView: AppView;
  onSelect: (v: AppView) => void;
  collapsed: boolean;
  onToggle: () => void;
  demoUser?: string;
  onUserChange?: (u: string) => void;
  visibleSections?: string[];
  hiddenItems?: string[];
  allUsers?: { name: string; role: string; group: string }[];
};

export default function Sidebar({ activeView, onSelect, collapsed, onToggle, demoUser, onUserChange, visibleSections, hiddenItems, allUsers }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(DEFAULT_COLLAPSED_SECTIONS);

  const activeSection = NAV.find(n => n.items.some(i => i.label === activeView))?.section;

  function toggleSection(s: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  return (
    <aside style={{
      width: collapsed ? 60 : 232,
      minWidth: collapsed ? 60 : 232,
      flexShrink: 0,
      height: '100vh',
      overflowY: 'auto',
      overflowX: 'hidden',
      background: '#0d1f2d',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s ease, min-width 0.2s ease',
      scrollbarWidth: 'none',
    }}>

      {/* Brand */}
      <div style={{ padding: collapsed ? '16px 0' : '16px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', flexShrink: 0 }}>
        {!collapsed ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#2E6DA4', letterSpacing: '0.05em', marginBottom: 2 }}>Kula Glass Company</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 16, height: 16, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                <img src="/banyan-icon.png" alt="" style={{ width: 16, height: 16, objectFit: 'cover', opacity: 0.9 } as React.CSSProperties}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(248,250,252,0.7)', letterSpacing: '-0.01em' }}>
                Banyan<span style={{ color: 'rgba(20,184,166,0.8)' }}>OS</span>
              </span>
            </div>
          </div>
        ) : (
          <div style={{ width: 28, height: 28, borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
            <img src="/banyan-icon.png" alt="B" style={{ width: 24, height: 24, objectFit: 'cover', opacity: 0.9 } as React.CSSProperties}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="font-size:11px;font-weight:900;color:#14b8a6">B</span>'; }} />
          </div>
        )}
        <button onClick={onToggle} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 6px', color: 'rgba(148,163,184,0.5)', cursor: 'pointer', fontSize: 10, lineHeight: 1, marginLeft: collapsed ? 0 : 0 }}>
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: collapsed ? '8px 6px' : '8px 8px', overflowY: 'auto', scrollbarWidth: 'none' }}>
        {NAV.filter(({ section }) => !visibleSections || visibleSections.includes(section)).map(({ section, sectionIcon, items: allItems }) => {
          const items = hiddenItems ? allItems.filter(i => !hiddenItems.includes(i.label)) : allItems;
          if (items.length === 0) return null;
          const hasActive = items.some(i => i.label === activeView);
          const isSectionCollapsed = collapsedSections.has(section) && !hasActive;

          return (
            <div key={section} style={{ marginBottom: 2 }}>
              {!collapsed && (
                <button onClick={() => toggleSection(section)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 8px', background: 'none', border: 'none', cursor: 'pointer',
                  borderRadius: 6, marginBottom: 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: hasActive ? '#14b8a6' : 'rgba(20,184,166,0.32)' }}>{sectionIcon}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: hasActive ? '#14b8a6' : 'rgba(20,184,166,0.38)' }}>{section}</span>
                  </div>
                  <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.25)', transform: isSectionCollapsed ? 'rotate(-90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▾</span>
                </button>
              )}

              {collapsed && <div style={{ height: 4 }} />}

              {/* Items */}
              {!isSectionCollapsed && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {items.map(({ label, dot }) => {
                    const isActive = activeView === label;
                    const isHov = hovered === label;
                    const iconPath = ICONS[label] || ICONS['Overview'];

                    return (
                      <li key={label}>
                        <button
                          onClick={() => onSelect(label)}
                          onMouseEnter={() => setHovered(label)}
                          onMouseLeave={() => setHovered(null)}
                          title={collapsed ? label : undefined}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: collapsed ? 'center' : 'flex-start',
                            gap: 9,
                            padding: collapsed ? '9px 0' : '7px 9px',
                            borderRadius: 10,
                            border: isActive ? '1px solid rgba(249,115,22,0.35)' : '1px solid transparent',
                            background: isActive
                              ? 'linear-gradient(135deg, rgba(249,115,22,0.18) 0%, rgba(234,88,12,0.08) 100%)'
                              : isHov ? 'rgba(255,255,255,0.05)' : 'transparent',
                            color: isActive ? '#ffedd5' : isHov ? '#e2e8f0' : 'rgba(203,213,225,0.6)',
                            fontSize: 13,
                            fontWeight: isActive ? 700 : 450,
                            cursor: 'pointer',
                            transition: 'all 0.1s ease',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                          }}>
                          {/* Icon */}
                          <NavIcon
                            path={iconPath}
                            size={15}
                            color={isActive ? '#fdba74' : isHov ? '#e2e8f0' : 'rgba(148,163,184,0.6)'}
                          />
                          {/* Label */}
                          {!collapsed && label}
                          {/* Dot indicator */}
                          {dot && !collapsed && isActive && (
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, marginLeft: 'auto', flexShrink: 0, boxShadow: `0 0 5px ${dot}` }} />
                          )}
                          {dot && !collapsed && !isActive && (
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: dot, marginLeft: 'auto', flexShrink: 0, opacity: 0.6 }} />
                          )}
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
        <div style={{ padding: '10px 12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          {onUserChange && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.4)', marginBottom: 4 }}>🧪 Preview as</div>
              <select value={demoUser} onChange={e => onUserChange(e.target.value)}
                style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'rgba(203,213,225,0.8)', cursor: 'pointer', outline: 'none' }}>
                {allUsers ? (
                  // Grouped by department
                  Object.entries(
                    allUsers.reduce((acc, u) => {
                      (acc[u.group] = acc[u.group] || []).push(u);
                      return acc;
                    }, {} as Record<string, typeof allUsers>)
                  ).map(([group, users]) => (
                    <optgroup key={group} label={group} style={{ background: '#0d1f2d' }}>
                      {users.map(u => (
                        <option key={u.name} value={u.name} style={{ background: '#0d1f2d' }}>{u.name}</option>
                      ))}
                    </optgroup>
                  ))
                ) : (
                  ['Sean Daniels','Kyle Shimizu','Jenny Shimabukuro','Mark Olson','Joey Ritthaler','Frank Redondo','Nate Nakamura'].map(u => (
                    <option key={u} style={{ background: '#0d1f2d' }}>{u}</option>
                  ))
                )}
              </select>
            </div>
          )}
          {/* Permissions link — GM/Owner only */}
          {(() => {
            const currentUserRole = allUsers?.find(u => u.name === demoUser)?.role || '';
            if (currentUserRole === 'gm' || currentUserRole === 'owner') {
              return (
                <a
                  href="/admin/permissions"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: '1px solid rgba(20,184,166,0.2)',
                    background: 'rgba(20,184,166,0.06)',
                    color: 'rgba(20,184,166,0.7)',
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: 'none',
                    marginBottom: 8,
                    letterSpacing: '0.01em',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(20,184,166,0.12)'; (e.currentTarget as HTMLAnchorElement).style.color = '#14b8a6'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(20,184,166,0.06)'; (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(20,184,166,0.7)'; }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Permissions
                </a>
              );
            }
            return null;
          })()}
          <div style={{ fontSize: 9, color: 'rgba(94,234,212,0.2)', fontWeight: 600 }}>BanyanOS · Field Phase</div>
        </div>
      )}
    </aside>
  );
}
