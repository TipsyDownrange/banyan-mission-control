'use client';
import React from 'react';

export interface CardListItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  badge?: { label: string; color: string; bg: string };
  priority?: 'critical' | 'high' | 'medium' | 'low';
  /** left border color */
  accentColor?: string;
  rightContent?: React.ReactNode;
  footer?: React.ReactNode;
  onClick?: () => void;
}

const PRIORITY_COLORS = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#2563eb',
  low: '#64748b',
};

interface CardListProps {
  items: CardListItem[];
  emptyMessage?: string;
  loading?: boolean;
  columns?: 1 | 2;
}

export default function CardList({
  items,
  emptyMessage = 'No items to display',
  loading = false,
  columns = 1,
}: CardListProps) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            height: 100,
            borderRadius: 16,
            background: '#f1f5f9',
            border: '1px solid #e2e8f0',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        ))}
        <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`}</style>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{
        padding: '40px 24px',
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: 13,
        background: 'white',
        borderRadius: 16,
        border: '1px dashed #e2e8f0',
      }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: columns === 2 ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr',
      gap: 10,
    }}>
      {items.map((item) => {
        const accentColor = item.accentColor
          ?? (item.priority ? PRIORITY_COLORS[item.priority] : '#14b8a6');

        return (
          <article
            key={item.id}
            onClick={item.onClick}
            style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              padding: '14px 16px',
              paddingLeft: 20,
              cursor: item.onClick ? 'pointer' : 'default',
              position: 'relative',
              overflow: 'hidden',
              transition: 'box-shadow 0.15s, border-color 0.15s',
              boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
            }}
            onMouseEnter={e => {
              if (item.onClick) {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(15,23,42,0.1)';
                (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1';
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(15,23,42,0.04)';
              (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
            }}
          >
            {/* Accent bar */}
            <div style={{
              position: 'absolute',
              left: 0, top: 0, bottom: 0,
              width: 4,
              background: accentColor,
            }} />

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Top row: title + badge */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#0f172a',
                    lineHeight: 1.3,
                    flex: 1,
                    minWidth: 0,
                  }}>
                    {item.title}
                  </div>
                  {item.badge && (
                    <span style={{
                      flexShrink: 0,
                      padding: '3px 8px',
                      borderRadius: 999,
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: item.badge.color,
                      background: item.badge.bg,
                    }}>
                      {item.badge.label}
                    </span>
                  )}
                </div>

                {/* Subtitle */}
                {item.subtitle && (
                  <div style={{
                    fontSize: 11,
                    color: '#64748b',
                    marginBottom: 8,
                    lineHeight: 1.4,
                  }}>
                    {item.subtitle}
                  </div>
                )}

                {/* Meta */}
                {item.meta && (
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {item.meta}
                  </div>
                )}

                {/* Footer */}
                {item.footer && (
                  <div style={{ marginTop: 8 }}>
                    {item.footer}
                  </div>
                )}
              </div>

              {/* Right content */}
              {item.rightContent && (
                <div style={{ flexShrink: 0 }}>
                  {item.rightContent}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
