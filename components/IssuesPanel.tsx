'use client';
import { useState } from 'react';
import { ISSUES } from '@/lib/data';

export default function IssuesPanel() {
  const [resolved, setResolved] = useState<string[]>([]);
  const open = ISSUES.filter(i => i.status === 'OPEN' && !resolved.includes(i.id));
  const blocking = open.filter(i => i.blocking);

  const SEV_STYLE: Record<string, { color: string; bg: string }> = {
    HIGH:     { color: '#b91c1c', bg: '#fef2f2' },
    MEDIUM:   { color: '#92400e', bg: '#fffbeb' },
    LOW:      { color: '#475569', bg: '#f8fafc' },
  };

  return (
    <div style={{ padding: '32px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Operations</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 8 }}>Issues</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {open.length > 0 && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c2410c', background: '#fff7ed', padding: '4px 12px', borderRadius: 999 }}>{open.length} Open</span>}
          {blocking.length > 0 && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#b91c1c', background: '#fef2f2', padding: '4px 12px', borderRadius: 999 }}>{blocking.length} Blocking</span>}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24,
        padding: 18, borderRadius: 24,
        background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(255,247,237,0.9) 50%,rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {[
          { label: 'Open', value: open.length, helper: 'Requiring action' },
          { label: 'Blocking', value: blocking.length, helper: 'Stopping work on site' },
          { label: 'High severity', value: open.filter(i=>i.severity==='HIGH').length, helper: 'Escalate immediately' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: 34, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {open.map(issue => {
          const sev = SEV_STYLE[issue.severity] || SEV_STYLE.LOW;
          return (
            <div key={issue.id} style={{ background: 'white', borderRadius: 20, border: `1px solid ${issue.blocking ? 'rgba(194,65,12,0.2)' : '#e2e8f0'}`, boxShadow: '0 2px 8px rgba(15,23,42,0.04)', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                {/* Priority bar */}
                <div style={{ width: 3, borderRadius: 4, background: issue.severity === 'HIGH' ? '#ef4444' : issue.severity === 'MEDIUM' ? '#f59e0b' : '#94a3b8', alignSelf: 'stretch', flexShrink: 0, minHeight: 40 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: sev.color, background: sev.bg, padding: '3px 9px', borderRadius: 999 }}>
                      {issue.severity}
                    </span>
                    {issue.blocking && (
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c2410c', background: '#fff7ed', padding: '3px 9px', borderRadius: 999 }}>
                        BLOCKING
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#94a3b8', padding: '3px 9px' }}>{issue.id}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 4, letterSpacing: '-0.01em' }}>{issue.kID}</div>
                  <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginBottom: 10 }}>{issue.description}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Assigned → <strong style={{ color: '#334155' }}>{issue.assignedTo}</strong></span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>Opened {issue.createdAt}</span>
                  </div>
                </div>

                <button
                  onClick={() => setResolved(prev => [...prev, issue.id])}
                  style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 12, fontSize: 12, fontWeight: 700, color: '#0f766e', background: '#f0fdfa', border: '1px solid rgba(15,118,110,0.2)', cursor: 'pointer' }}>
                  Resolve
                </button>
              </div>
            </div>
          );
        })}

        {open.length === 0 && (
          <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}></div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>All clear</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>No open issues</div>
          </div>
        )}
      </div>
    </div>
  );
}
