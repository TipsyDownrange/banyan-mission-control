'use client';
import React, { useState, useRef, useEffect } from 'react';

export interface WorkspaceTab {
  id: string;
  label: string;
  icon?: string;
  badge?: number | string;
}

interface WorkspaceShellProps {
  tabs: WorkspaceTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  rightPanel?: React.ReactNode;
  children: React.ReactNode;
  /** Optional: hide right panel toggle button */
  hideRightPanelToggle?: boolean;
}

export default function WorkspaceShell({
  tabs,
  activeTab,
  onTabChange,
  rightPanel,
  children,
  hideRightPanelToggle = false,
}: WorkspaceShellProps) {
  const [rightPanelOpen, setRightPanelOpen] = useState(true); // default open on desktop
  const [isMobile, setIsMobile] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Desktop: controlled by rightPanelOpen toggle. Mobile: drawer controlled by rightPanelOpen.
  const showRightPanel = !!rightPanel && rightPanelOpen;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#f8fafc' }}>

      {/* Tab Bar */}
      <div style={{
        background: '#0f172a',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          padding: '0 16px',
          gap: 2,
        }} ref={tabsRef}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #14b8a6' : '2px solid transparent',
                  color: isActive ? '#14b8a6' : 'rgba(148,163,184,0.8)',
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 600,
                  letterSpacing: '0.01em',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s, border-color 0.15s',
                  minHeight: 44, // Touch target
                  flexShrink: 0,
                }}
              >
                {tab.icon && <span style={{ fontSize: 13 }}>{tab.icon}</span>}
                {tab.label}
                {tab.badge !== undefined && tab.badge !== null && (
                  <span style={{
                    background: isActive ? '#14b8a6' : 'rgba(148,163,184,0.3)',
                    color: isActive ? '#0f172a' : 'rgba(148,163,184,0.9)',
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: 999,
                    minWidth: 18,
                    textAlign: 'center',
                  }}>{tab.badge}</span>
                )}
              </button>
            );
          })}

          {/* Right panel toggle on mobile */}
          {rightPanel && !hideRightPanelToggle && isMobile && (
            <button
              onClick={() => setRightPanelOpen(o => !o)}
              style={{
                marginLeft: 'auto',
                padding: '8px 12px',
                background: rightPanelOpen ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: rightPanelOpen ? '#14b8a6' : 'rgba(148,163,184,0.7)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              ✦ Kai
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', position: 'relative' }}>

        {/* Tab Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          minWidth: 0,
          background: '#f8fafc',
        }}>
          {children}
        </div>

        {/* Right Panel (Kai Panel) — desktop: always visible, mobile: overlay */}
        {showRightPanel && (
          <>
            {/* Mobile overlay backdrop */}
            {isMobile && (
              <div
                onClick={() => setRightPanelOpen(false)}
                style={{
                  position: 'fixed', inset: 0,
                  background: 'rgba(15,23,42,0.5)',
                  zIndex: 30,
                }}
              />
            )}

            <div style={{
              width: isMobile ? 320 : 280,
              flexShrink: 0,
              background: 'white',
              borderLeft: '1px solid #e2e8f0',
              overflowY: 'auto',
              position: isMobile ? 'fixed' : 'relative',
              right: isMobile ? 0 : undefined,
              top: isMobile ? 0 : undefined,
              bottom: isMobile ? 0 : undefined,
              zIndex: isMobile ? 40 : undefined,
              boxShadow: isMobile ? '-8px 0 32px rgba(15,23,42,0.12)' : 'none',
            }}>
              {isMobile && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>✦ Kai</span>
                  <button
                    onClick={() => setRightPanelOpen(false)}
                    style={{
                      background: 'none', border: 'none', fontSize: 18,
                      color: '#94a3b8', cursor: 'pointer', padding: '4px 8px',
                    }}
                  >×</button>
                </div>
              )}
              {rightPanel}
            </div>
          </>
        )}

        {/* Desktop Kai toggle */}
        {rightPanel && !isMobile && !hideRightPanelToggle && (
          <button
            onClick={() => setRightPanelOpen(o => !o)}
            title={showRightPanel ? 'Hide Kai panel' : 'Show Kai panel'}
            style={{
              position: 'absolute',
              right: showRightPanel ? 280 : 0,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 48,
              background: '#0f172a',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRight: 'none',
              borderRadius: '8px 0 0 8px',
              color: '#14b8a6',
              fontSize: 10,
              cursor: 'pointer',
              zIndex: 10,
              transition: 'right 0.25s ease',
            }}
          >
            {showRightPanel ? '›' : '‹'}
          </button>
        )}
      </div>
    </div>
  );
}
