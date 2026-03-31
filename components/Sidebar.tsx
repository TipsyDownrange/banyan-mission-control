'use client';
import { useState } from 'react';
import type { AppView } from '@/app/page';

const NAV: { section: string; items: { label: AppView; icon: string }[] }[] = [
  {
    section: 'Operations',
    items: [
      { label: 'Overview', icon: '◈' },
      { label: 'Event Feed', icon: '⚡' },
      { label: 'Issues', icon: '⚠' },
    ],
  },
  {
    section: 'Projects',
    items: [
      { label: 'Projects', icon: '⬡' },
      { label: 'Schedules', icon: '📅' },
      { label: 'Submittals', icon: '📋' },
    ],
  },
  {
    section: 'People',
    items: [
      { label: 'Crew', icon: '👥' },
    ],
  },
  {
    section: 'Estimating',
    items: [
      { label: 'Bid Queue', icon: '📊' },
    ],
  },
  {
    section: 'AI Command',
    items: [
      { label: 'Kai', icon: '◎' },
      { label: 'Approvals', icon: '✓' },
      { label: 'Cost & Usage', icon: '$' },
    ],
  },
];

type Props = { activeView: AppView; onSelect: (v: AppView) => void };

export default function Sidebar({ activeView, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <aside
      className="flex flex-col shrink-0 h-screen overflow-y-auto scrollbar-hide"
      style={{
        width: 260,
        background: 'linear-gradient(180deg, #071722 0%, #0c2330 54%, #102c39 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.05), 10px 0 28px rgba(3,12,18,0.22)',
        padding: '24px 20px',
      }}
    >
      {/* Brand */}
      <div className="mb-8">
        <div className="label-upper text-teal-400 mb-3">Kula Glass</div>
        <h1
          className="m-0 leading-none text-white"
          style={{ fontSize: 38, fontWeight: 950, letterSpacing: '-0.05em', lineHeight: 0.92, textShadow: '0 8px 24px rgba(2,12,20,0.28)' }}
        >
          Mission<br />Control
        </h1>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-6 flex-1">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <div
              className="label-upper mb-2 pl-1"
              style={{ color: 'rgba(148,163,184,0.7)' }}
            >
              {section}
            </div>
            <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
              {items.map(({ label, icon }) => {
                const isActive = activeView === label;
                const isHov = hovered === label;
                return (
                  <li key={label}>
                    <button
                      onClick={() => onSelect(label)}
                      onMouseEnter={() => setHovered(label)}
                      onMouseLeave={() => setHovered(null)}
                      className="w-full text-left flex items-center gap-3 transition-all duration-150"
                      style={{
                        padding: '12px 14px',
                        borderRadius: 14,
                        border: isActive
                          ? '1px solid rgba(251,146,60,0.42)'
                          : '1px solid rgba(255,255,255,0.04)',
                        background: isActive
                          ? 'linear-gradient(180deg, rgba(249,115,22,0.26) 0%, rgba(234,88,12,0.14) 100%)'
                          : isHov
                          ? 'rgba(255,255,255,0.05)'
                          : 'rgba(255,255,255,0.016)',
                        color: isActive ? '#ffedd5' : '#dce7ed',
                        fontSize: 14,
                        fontWeight: isActive ? 800 : 600,
                        letterSpacing: '0.01em',
                        transform: isActive ? 'translateX(2px)' : isHov ? 'translateX(1px)' : 'none',
                        boxShadow: isActive ? '0 12px 24px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 13, opacity: 0.7 }}>{icon}</span>
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="mt-6 pt-5 label-upper"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(94,234,212,0.5)' }}
      >
        BanyanOS v1 · Field Phase
      </div>
    </aside>
  );
}
