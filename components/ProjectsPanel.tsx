'use client';
import { useEffect, useState } from 'react';

type Project = {
  kID: string; name: string; status: string; pm: string; super: string;
  island: string; eventCount: number; issues: number;
};

const ISLAND_COLOR: Record<string, string> = {
  Oahu: '#0369a1', Maui: '#0f766e', Kauai: '#6d28d9', Hawaii: '#92400e',
};

export default function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => { setProjects(d.projects || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

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
                <div key={p.kID} style={{ background: 'white', borderRadius: 18, border: '1px solid rgba(226,232,240,0.9)', padding: '16px 20px', boxShadow: '0 2px 8px rgba(15,23,42,0.04)', display: 'flex', alignItems: 'center', gap: 16 }}>
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
                      {p.eventCount > 0 && <span style={{ color: '#94a3b8' }}>{p.eventCount} field event{p.eventCount !== 1 ? 's' : ''}</span>}
                    </div>
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
    </div>
  );
}
