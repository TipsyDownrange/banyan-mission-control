'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { AppView } from '@/app/page';

const NAV: { section: string; items: { label: AppView; dot?: string }[] }[] = [
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
      { label: 'Bid Queue' },
    ],
  },
  {
    section: 'AI Command',
    items: [
      { label: 'Kai', dot: '#14b8a6' },
      { label: 'Task Board' },
      { label: 'Approvals', dot: '#f97316' },
      { label: 'Workflows' },
      { label: 'Cost & Usage' },
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
        width: 248,
        background: 'linear-gradient(180deg, #071722 0%, #0c2330 54%, #102c39 100%)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        padding: '0 0 24px',
      }}
    >
      {/* Brand header */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ marginBottom: 4 }}>
          <Image
            src="/banyan-logo-white.png"
            alt="BanyanOS"
            width={110}
            height={36}
            style={{ objectFit: 'contain', objectPosition: 'left' }}
          />
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(148,163,184,0.45)', letterSpacing: '0.06em' }}>
          Kula Glass Company
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 12px 0' }}>
        {NAV.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(148,163,184,0.4)',
              padding: '0 8px',
              marginBottom: 4,
            }}>
              {section}
            </div>
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
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '9px 10px',
                        borderRadius: 10,
                        border: `1px solid ${isActive ? 'rgba(251,146,60,0.35)' : 'transparent'}`,
                        background: isActive
                          ? 'linear-gradient(135deg, rgba(249,115,22,0.18) 0%, rgba(234,88,12,0.08) 100%)'
                          : isHov ? 'rgba(255,255,255,0.04)' : 'transparent',
                        color: isActive ? '#ffedd5' : isHov ? '#e8f4f8' : 'rgba(203,213,225,0.7)',
                        fontSize: 13,
                        fontWeight: isActive ? 700 : 500,
                        letterSpacing: '0.01em',
                        cursor: 'pointer',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      {dot && (
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: dot, flexShrink: 0,
                          boxShadow: `0 0 6px ${dot}66`,
                        }} />
                      )}
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
      <div style={{ padding: '16px 20px 0', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(94,234,212,0.3)' }}>
          BanyanOS · Field Phase
        </div>
      </div>
    </aside>
  );
}
