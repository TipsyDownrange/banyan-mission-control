'use client';
import { useState } from 'react';
import { PROJECTS, ISLAND_EMOJI } from '@/lib/data';

type Project = typeof PROJECTS[0];

const PHASE_COLOR: Record<string, { color: string; bg: string }> = {
  'Installation':  { color: '#0f766e', bg: '#f0fdfa' },
  'QA / Closeout': { color: '#1d4ed8', bg: '#eff6ff' },
  'Submittal':     { color: '#92400e', bg: '#fffbeb' },
  'Procurement':   { color: '#c2410c', bg: '#fff7ed' },
  'Service':       { color: '#475569', bg: '#f8fafc' },
};

const PHASES = ['Pre-Construction','Submittal','Procurement','Fabrication','Installation','QA / Closeout','Closeout','Service'];
const ISLANDS = ['Oahu','Maui','Kauai','Hawaii','Molokai','Lanai'];
const PMs = ['Sean Daniels','Frank Redondo','Kyle Shimizu','Jenny Shimabukuro','Joey Ritthaler'];

const INP: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(15,118,110,0.3)', background: 'rgba(240,253,250,0.6)', fontSize: 12, color: '#0f172a', outline: 'none' };
const FL = (l: string) => <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#94a3b8', marginBottom: 3 }}>{l}</div>;

export default function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>(PROJECTS.filter(p => p.kID.startsWith('PRJ')));
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Project>>({});
  const [showNew, setShowNew] = useState(false);
  const [newDraft, setNewDraft] = useState({ name: '', island: 'Maui', pm: 'Sean Daniels', phase: 'Submittal', budget: 0, spent: 0 });

  function startEdit(p: Project) { setEditing(p.kID); setEditDraft({ ...p }); }
  function saveEdit() {
    setProjects(prev => prev.map(p => p.kID === editing ? { ...p, ...editDraft } : p));
    setEditing(null);
  }

  function addProject() {
    const seq = String(projects.length + 24).padStart(4, '0');
    const newProj: Project = { kID: `PRJ-26-${seq}`, status: 'active', issues: 0, ...newDraft } as Project;
    setProjects(prev => [newProj, ...prev]);
    setShowNew(false);
    setNewDraft({ name: '', island: 'Maui', pm: 'Sean Daniels', phase: 'Submittal', budget: 0, spent: 0 });
  }

  return (
    <div style={{ padding: '32px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Projects</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Active Projects</h1>
          <button onClick={() => setShowNew(true)} style={{ padding: '9px 20px', borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,118,110,0.3)' }}>+ New Project</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24,
        padding: 18, borderRadius: 24, background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {[
          { label: 'Active jobs', value: projects.length, helper: 'Contract work in progress' },
          { label: 'Open issues', value: projects.reduce((s,p) => s+p.issues,0), helper: 'Across all projects' },
          { label: 'Islands', value: [...new Set(projects.map(p=>p.island))].length, helper: 'Active locations' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: 32, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
          </div>
        ))}
      </div>

      {/* New project form */}
      {showNew && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid rgba(15,118,110,0.2)', boxShadow: '0 14px 30px rgba(15,23,42,0.06)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>New Project</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ gridColumn: 'span 2' }}>{FL('Project Name')}<input value={newDraft.name} onChange={e => setNewDraft(p=>({...p,name:e.target.value}))} style={INP} placeholder="e.g. Hilton Waikoloa Phase 2" /></div>
            <div>{FL('Island')}<select value={newDraft.island} onChange={e => setNewDraft(p=>({...p,island:e.target.value}))} style={{ ...INP, cursor: 'pointer' }}>{ISLANDS.map(i=><option key={i}>{i}</option>)}</select></div>
            <div>{FL('PM')}<select value={newDraft.pm} onChange={e => setNewDraft(p=>({...p,pm:e.target.value}))} style={{ ...INP, cursor: 'pointer' }}>{PMs.map(m=><option key={m}>{m}</option>)}</select></div>
            <div>{FL('Phase')}<select value={newDraft.phase} onChange={e => setNewDraft(p=>({...p,phase:e.target.value}))} style={{ ...INP, cursor: 'pointer' }}>{PHASES.map(ph=><option key={ph}>{ph}</option>)}</select></div>
            <div>{FL('Budget ($)')}<input type="number" value={newDraft.budget} onChange={e => setNewDraft(p=>({...p,budget:parseInt(e.target.value)||0}))} style={INP} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowNew(false)} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button onClick={addProject} disabled={!newDraft.name} style={{ padding: '8px 20px', borderRadius: 10, background: newDraft.name ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: newDraft.name ? 'pointer' : 'default' }}>Create Project</button>
          </div>
        </div>
      )}

      {/* Project cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {projects.map(p => {
          const pct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : null;
          const phase = PHASE_COLOR[p.phase] || PHASE_COLOR['Service'];
          const isEditing = editing === p.kID;
          return (
            <div key={p.kID} style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15,23,42,0.04)', padding: '16px 20px' }}>
              {isEditing ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div style={{ gridColumn: 'span 3' }}>{FL('Project Name')}<input value={editDraft.name||''} onChange={e => setEditDraft(p=>({...p,name:e.target.value}))} style={INP} /></div>
                    <div>{FL('Island')}<select value={editDraft.island||''} onChange={e => setEditDraft(p=>({...p,island:e.target.value}))} style={{ ...INP, cursor: 'pointer' }}>{ISLANDS.map(i=><option key={i}>{i}</option>)}</select></div>
                    <div>{FL('PM')}<select value={editDraft.pm||''} onChange={e => setEditDraft(p=>({...p,pm:e.target.value}))} style={{ ...INP, cursor: 'pointer' }}>{PMs.map(m=><option key={m}>{m}</option>)}</select></div>
                    <div>{FL('Phase')}<select value={editDraft.phase||''} onChange={e => setEditDraft(p=>({...p,phase:e.target.value}))} style={{ ...INP, cursor: 'pointer' }}>{PHASES.map(ph=><option key={ph}>{ph}</option>)}</select></div>
                    <div>{FL('Budget ($)')}<input type="number" value={editDraft.budget||0} onChange={e => setEditDraft(p=>({...p,budget:parseInt(e.target.value)||0}))} style={INP} /></div>
                    <div>{FL('Spent ($)')}<input type="number" value={editDraft.spent||0} onChange={e => setEditDraft(p=>({...p,spent:parseInt(e.target.value)||0}))} style={INP} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={saveEdit} style={{ padding: '7px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Save</button>
                    <button onClick={() => setEditing(null)} style={{ padding: '7px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>{p.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: phase.color, background: phase.bg, padding: '3px 9px', borderRadius: 999 }}>{p.phase}</span>
                      {p.issues > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: '#c2410c', background: '#fff7ed', padding: '3px 9px', borderRadius: 999 }}>{p.issues} issue{p.issues > 1 ? 's' : ''}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: pct !== null ? 8 : 0 }}>{p.kID} · {p.island} · PM: {p.pm}</div>
                    {pct !== null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct > 90 ? '#f97316' : '#14b8a6', borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, fontWeight: 700 }}>{pct}%</span>
                      </div>
                    )}
                  </div>
                  <button onClick={() => startEdit(p)} style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid rgba(15,118,110,0.2)', background: 'rgba(240,253,250,0.8)', color: '#0f766e', fontSize: 11, fontWeight: 800, cursor: 'pointer', flexShrink: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Edit</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
