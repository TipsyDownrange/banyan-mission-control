'use client';
import { useState } from 'react';
import { ISSUES } from '@/lib/data';

type IssueRow = typeof ISSUES[0] & { editMode?: boolean };

export default function IssuesPanel() {
  const [issues, setIssues] = useState<IssueRow[]>(ISSUES.map(i => ({ ...i })));
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<IssueRow>>({});
  const [showNew, setShowNew] = useState(false);
  const [newDraft, setNewDraft] = useState({ kID: '', description: '', severity: 'MEDIUM', blocking: false, assignedTo: '' });

  const open = issues.filter(i => i.status === 'OPEN');
  const blocking = open.filter(i => i.blocking);

  const SEV: Record<string, { color: string; bg: string }> = {
    HIGH: { color: '#b91c1c', bg: '#fef2f2' },
    MEDIUM: { color: '#92400e', bg: '#fffbeb' },
    LOW: { color: '#475569', bg: '#f8fafc' },
  };

  const INP: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(15,118,110,0.3)', background: 'rgba(240,253,250,0.6)', fontSize: 12, color: '#0f172a', outline: 'none' };
  const FL = (l: string) => <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#94a3b8', marginBottom: 3 }}>{l}</div>;

  function startEdit(issue: IssueRow) {
    setEditing(issue.id);
    setEditDraft({ ...issue });
  }

  function saveEdit() {
    setIssues(prev => prev.map(i => i.id === editing ? { ...i, ...editDraft } : i));
    setEditing(null);
  }

  function resolve(id: string) {
    setIssues(prev => prev.map(i => i.id === id ? { ...i, status: 'RESOLVED' } : i));
  }

  function addIssue() {
    const id = `ISS-${String(issues.length + 1).padStart(3, '0')}`;
    setIssues(prev => [{ id, project: '', ...newDraft, status: 'OPEN', createdAt: new Date().toISOString().slice(0,10) }, ...prev]);
    setShowNew(false);
    setNewDraft({ kID: '', description: '', severity: 'MEDIUM', blocking: false, assignedTo: '' });
  }

  return (
    <div style={{ padding: '32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Operations</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Issues</h1>
          <button onClick={() => setShowNew(true)} style={{ padding: '9px 20px', borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'linear-gradient(135deg,#c2410c,#f97316)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(194,65,12,0.3)' }}>+ Log Issue</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {open.length > 0 && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c2410c', background: '#fff7ed', padding: '4px 12px', borderRadius: 999 }}>{open.length} Open</span>}
          {blocking.length > 0 && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#b91c1c', background: '#fef2f2', padding: '4px 12px', borderRadius: 999 }}>{blocking.length} Blocking</span>}
        </div>
      </div>

      {/* New issue form */}
      {showNew && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid rgba(249,115,22,0.2)', boxShadow: '0 14px 30px rgba(15,23,42,0.06)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Log New Issue</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>{FL('Project / Job')}<input value={newDraft.kID} onChange={e => setNewDraft(p=>({...p,kID:e.target.value}))} style={INP} placeholder="e.g. Hokuala Hotel" /></div>
            <div>{FL('Assigned To')}<input value={newDraft.assignedTo} onChange={e => setNewDraft(p=>({...p,assignedTo:e.target.value}))} style={INP} placeholder="Name" /></div>
          </div>
          <div style={{ marginBottom: 10 }}>{FL('Description')}<textarea value={newDraft.description} onChange={e => setNewDraft(p=>({...p,description:e.target.value}))} rows={2} style={{ ...INP, resize: 'none' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>{FL('Severity')}
              <select value={newDraft.severity} onChange={e => setNewDraft(p=>({...p,severity:e.target.value}))} style={{ ...INP, cursor: 'pointer' }}>
                <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 18 }}>
              <input type="checkbox" checked={newDraft.blocking} onChange={e => setNewDraft(p=>({...p,blocking:e.target.checked}))} style={{ width: 16, height: 16, accentColor: '#ef4444' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Blocking — stops work</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowNew(false)} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button onClick={addIssue} disabled={!newDraft.description} style={{ padding: '8px 20px', borderRadius: 10, background: newDraft.description ? 'linear-gradient(135deg,#c2410c,#f97316)' : '#e2e8f0', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: newDraft.description ? 'pointer' : 'default' }}>Log Issue</button>
          </div>
        </div>
      )}

      {/* Issue cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {open.map(issue => {
          const sev = SEV[issue.severity] || SEV.LOW;
          const isEditing = editing === issue.id;
          return (
            <div key={issue.id} style={{ background: 'white', borderRadius: 20, border: `1px solid ${issue.blocking ? 'rgba(194,65,12,0.2)' : '#e2e8f0'}`, boxShadow: '0 2px 8px rgba(15,23,42,0.04)', padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 5, background: issue.severity === 'HIGH' ? '#ef4444' : issue.severity === 'MEDIUM' ? '#f59e0b' : '#94a3b8' }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, paddingLeft: 4 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: sev.color, background: sev.bg, padding: '3px 9px', borderRadius: 999 }}>{issue.severity}</span>
                    {issue.blocking && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c2410c', background: '#fff7ed', padding: '3px 9px', borderRadius: 999 }}>BLOCKING</span>}
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8' }}>{issue.id}</span>
                  </div>

                  {isEditing ? (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div>{FL('Project')}<input value={editDraft.kID||''} onChange={e => setEditDraft(p=>({...p,kID:e.target.value}))} style={INP} /></div>
                      <div>{FL('Description')}<textarea value={editDraft.description||''} onChange={e => setEditDraft(p=>({...p,description:e.target.value}))} rows={2} style={{ ...INP, resize: 'none' }} /></div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>{FL('Severity')}<select value={editDraft.severity||'MEDIUM'} onChange={e => setEditDraft(p=>({...p,severity:e.target.value}))} style={{ ...INP, cursor: 'pointer' }}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></div>
                        <div>{FL('Assigned To')}<input value={editDraft.assignedTo||''} onChange={e => setEditDraft(p=>({...p,assignedTo:e.target.value}))} style={INP} /></div>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="checkbox" checked={editDraft.blocking||false} onChange={e => setEditDraft(p=>({...p,blocking:e.target.checked}))} style={{ width: 16, height: 16, accentColor: '#ef4444' }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Blocking</span>
                      </label>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 4, letterSpacing: '-0.01em' }}>{issue.kID}</div>
                      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginBottom: 10 }}>{issue.description}</div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
                        <span>→ <strong style={{ color: '#334155' }}>{issue.assignedTo}</strong></span>
                        <span>Opened {issue.createdAt}</span>
                      </div>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  {isEditing ? (
                    <>
                      <button onClick={saveEdit} style={{ padding: '6px 14px', borderRadius: 10, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditing(null)} style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(issue)} style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid rgba(15,118,110,0.2)', background: 'rgba(240,253,250,0.8)', color: '#0f766e', fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Edit</button>
                      <button onClick={() => resolve(issue.id)} style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid rgba(15,118,110,0.2)', background: 'rgba(240,253,250,0.8)', color: '#0f766e', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Resolve</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {open.length === 0 && (
          <div style={{ background: 'white', borderRadius: 24, border: '1px solid #e2e8f0', padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>All clear</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>No open issues</div>
          </div>
        )}
      </div>
    </div>
  );
}
