'use client';
import { useEffect, useState } from 'react';

type Project = {
  kID: string; name: string; status: string; pm: string; super: string;
  island: string; eventCount: number; issues: number; lastEventDate?: string;
};

const ISLAND_COLOR: Record<string, string> = {
  Oahu: '#0369a1', Maui: '#0f766e', Kauai: '#6d28d9', Hawaii: '#92400e',
};

interface ProjectsPanelProps {
  onNavigate?: (view: string, params?: Record<string, string>) => void;
}

export default function ProjectsPanel({ onNavigate }: ProjectsPanelProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewEvent, setShowNewEvent] = useState<string | null>(null);
  const [eventDesc, setEventDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => { setProjects(d.projects || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  async function handleNewEvent(kID: string) {
    if (!eventDesc.trim()) return;
    setSubmitting(true);
    try {
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kID, description: eventDesc, type: 'NOTE' }),
      });
      setShowNewEvent(null);
      setEventDesc('');
      setToast('Event logged');
      setTimeout(() => setToast(''), 2000);
    } catch {
      setToast('Failed to log event');
      setTimeout(() => setToast(''), 2000);
    }
    setSubmitting(false);
  }

  function handleProjectClick(kID: string) {
    if (onNavigate) {
      onNavigate('Schedules', { kID });
    }
  }

  const byIsland = ['Oahu', 'Maui', 'Kauai', 'Hawaii'].reduce((acc, isl) => {
    acc[isl] = projects.filter(p => p.island === isl);
    return acc;
  }, {} as Record<string, Project[]>);

  return (
    <div style={{ padding: '32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Projects</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Active Projects</h1>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading projects...</div>
        </div>
      )}

      {error && <div style={{ padding: '12px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', marginBottom: 20 }}>{error}</div>}

      {/* Stats */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 28, padding: 18, borderRadius: 24, background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)', border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
          {[
            { label: 'Active', value: projects.length, helper: 'All islands' },
            { label: 'Open Issues', value: projects.reduce((s, p) => s + p.issues, 0), helper: 'Field issues' },
            ...['Oahu','Maui','Kauai'].map(i => ({ label: i, value: byIsland[i]?.length || 0, helper: 'Active jobs' })),
          ].map(s => (
            <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
              <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
            </div>
          ))}
        </div>
      )}

      {/* Projects by island */}
      {!loading && ['Oahu','Maui','Kauai','Hawaii'].map(island => {
        const iProjects = byIsland[island] || [];
        if (!iProjects.length) return null;
        return (
          <div key={island} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: ISLAND_COLOR[island] || '#64748b' }} />
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>{island} · {iProjects.length}</div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {iProjects.map(p => (
                <div key={p.kID}
                  onClick={() => handleProjectClick(p.kID)}
                  style={{
                    background: 'white', borderRadius: 18, border: '1px solid rgba(226,232,240,0.9)',
                    padding: '16px 20px', boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
                    display: 'flex', alignItems: 'center', gap: 16,
                    cursor: onNavigate ? 'pointer' : 'default',
                    transition: 'box-shadow 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => { if (onNavigate) { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(15,23,42,0.1)'; (e.currentTarget as HTMLElement).style.borderColor = (ISLAND_COLOR[island] || '#64748b') + '44'; } }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(15,23,42,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(226,232,240,0.9)'; }}
                >
                  <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 999, background: ISLAND_COLOR[island] || '#64748b', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em' }}>{p.kID}</span>
                      {p.issues > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: '#fef2f2', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.2)' }}>
                          {p.issues} issue{p.issues > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', marginBottom: 6 }}>{p.name}</div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
                      {p.pm && <span>PM: <strong style={{ color: '#334155' }}>{p.pm}</strong></span>}
                      {p.super && <span>Super: <strong style={{ color: '#334155' }}>{p.super}</strong></span>}
                      {p.eventCount > 0 && <span style={{ color: '#94a3b8' }}>{p.eventCount} event{p.eventCount !== 1 ? 's' : ''}</span>}
                      {p.lastEventDate && <span style={{ color: '#94a3b8' }}>Last: {p.lastEventDate}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowNewEvent(p.kID); }}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: '#f0fdfa', border: '1px solid rgba(15,118,110,0.2)', color: '#0f766e',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>
                      + Event
                    </button>
                    {onNavigate && (
                      <span style={{ fontSize: 14, color: '#94a3b8' }}>→</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!loading && projects.length === 0 && !error && (
        <div style={{ padding: 48, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>No active projects found in Core_Entities sheet.</div>
      )}

      {/* New Event Modal */}
      {showNewEvent && (
        <>
          <div onClick={() => { setShowNewEvent(null); setEventDesc(''); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 300 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'white', borderRadius: 24, padding: 28, zIndex: 301,
            width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(15,23,42,0.15)',
          }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>New Event</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              {projects.find(p => p.kID === showNewEvent)?.name || showNewEvent}
            </div>
            <textarea value={eventDesc} onChange={e => setEventDesc(e.target.value)}
              rows={3} placeholder="What happened?"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'none', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowNewEvent(null); setEventDesc(''); }}
                style={{ flex: 1, padding: 11, borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => handleNewEvent(showNewEvent)} disabled={!eventDesc.trim() || submitting}
                style={{
                  flex: 2, padding: 11, borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: eventDesc.trim() ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0',
                  color: eventDesc.trim() ? 'white' : '#94a3b8',
                }}>
                {submitting ? 'Logging...' : 'Log Event'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', borderRadius: 12,
          background: toast.includes('Failed') ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${toast.includes('Failed') ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.3)'}`,
          color: toast.includes('Failed') ? '#b91c1c' : '#15803d',
          fontSize: 13, fontWeight: 700, zIndex: 500,
          boxShadow: '0 4px 16px rgba(15,23,42,0.1)',
        }}>
          {toast.includes('Failed') ? '⚠️' : '✓'} {toast}
        </div>
      )}
    </div>
  );
}
