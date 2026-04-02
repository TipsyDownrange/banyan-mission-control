'use client';
import { useEffect, useState } from 'react';

type Project = { kID: string; name: string; pm: string; island: string; issues: number; eventCount: number };
type Event = { id: string; kID: string; projectName: string; type: string; occurredAt: string; recordedBy: string; note: string; location: string };

const ISLAND_SHORT: Record<string, string> = { Oahu: 'OAH', Maui: 'MAU', Kauai: 'KAU', Hawaii: 'BIG' };
const ISLAND_COLOR: Record<string, string> = { Oahu: '#0369a1', Maui: '#0f766e', Kauai: '#6d28d9', Hawaii: '#92400e' };

const EVENT_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  DAILY_LOG:    { label: 'Daily Log',   color: '#0369a1', bg: 'rgba(239,246,255,0.9)' },
  FIELD_ISSUE:  { label: 'Field Issue', color: '#b91c1c', bg: 'rgba(254,242,242,0.9)' },
  INSTALL_STEP: { label: 'Install',     color: '#0f766e', bg: 'rgba(240,253,250,0.9)' },
  NOTE:         { label: 'Note',        color: '#475569', bg: 'rgba(248,250,252,0.9)' },
};

function displayName(email: string): string {
  if (!email) return '';
  if (email.includes('@')) return email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return email;
}

function formatTime(raw: string): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return raw; }
}

export default function OverviewPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/events?limit=20').then(r => r.json()),
    ]).then(([pd, ed]) => {
      setProjects(pd.projects || []);
      setEvents(ed.events || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const openIssues = projects.reduce((s, p) => s + p.issues, 0);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const stats = [
    { label: 'Active projects', value: projects.length,  helper: 'Across all islands' },
    { label: 'Open issues',     value: openIssues,        helper: 'From field events' },
    { label: 'Field events',    value: events.length,     helper: 'Recent activity' },
    { label: 'Islands active',  value: [...new Set(projects.map(p => p.island))].length, helper: 'Oahu, Maui, Kauai' },
  ];

  return (
    <div style={{ padding: '32px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Operations</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Overview</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{today} · Kula Glass Company</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24, padding: 18, borderRadius: 24, background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)', border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {stats.map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: loading ? 20 : 34, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>
              {loading ? '—' : s.value}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Active Projects */}
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>
              Active Projects · {projects.length}
            </div>
          </div>
          <div style={{ padding: '0 20px 8px', maxHeight: 360, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>Loading...</div>
            ) : projects.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>No active projects</div>
            ) : projects.map(p => (
              <div key={p.kID} style={{ padding: '12px 0', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: ISLAND_COLOR[p.island] || '#94a3b8', flexShrink: 0, width: 32 }}>
                  {ISLAND_SHORT[p.island] || p.island?.slice(0,3).toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{p.pm.split(' ').pop()}</span>
                  </div>
                  {p.issues > 0 && (
                    <div style={{ marginTop: 3, fontSize: 10, fontWeight: 700, color: '#b91c1c' }}>⚠ {p.issues} issue{p.issues > 1 ? 's' : ''}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Events */}
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Recent Field Events</div>
          </div>
          <div style={{ padding: '8px 16px 12px', maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loading ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>Loading...</div>
            ) : events.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>No field events yet</div>
            ) : events.slice(0, 10).map(e => {
              const s = EVENT_STYLE[e.type] || EVENT_STYLE.NOTE;
              return (
                <div key={e.id} style={{ padding: '8px 10px', borderRadius: 10, background: s.bg, border: `1px solid ${s.bg}` }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: s.color }}>{s.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>{e.projectName}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94a3b8' }}>{formatTime(e.occurredAt)}</span>
                  </div>
                  {(e.note || e.location) && <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>{e.note || e.location}</div>}
                  {e.recordedBy && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{displayName(e.recordedBy)}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
