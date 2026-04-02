'use client';
import { useState } from 'react';
import { CREW, ISLAND_EMOJI } from '@/lib/data';

type CrewMember = typeof CREW[0];

export default function CrewPanel() {
  const [crew, setCrew] = useState(CREW.map(c => ({...c})));
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<CrewMember>>({});
  
  const INP: React.CSSProperties = { width: '100%', padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(15,118,110,0.3)', background: 'rgba(240,253,250,0.6)', fontSize: 11, color: '#0f172a', outline: 'none' };
  const management = crew.filter(c => c.type === 'management');
  const supers = crew.filter(c => c.type === 'super');
  const islands = ['Oahu', 'Maui', 'Kauai'];

  const Avatar = ({ name, color }: { name: string; color: string }) => (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'white', flexShrink: 0, letterSpacing: '-0.02em' }}>
      {name.split(' ').map(n => n[0]).join('').slice(0,2)}
    </div>
  );

  const Card = ({ c, color }: { c: CrewMember; color: string }) => {
    const isEditing = editing === c.id;
    return (
      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${isEditing ? 'rgba(15,118,110,0.2)' : 'rgba(226,232,240,0.9)'}`, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
        <Avatar name={c.name} color={color} />
        {isEditing ? (
          <div style={{ flex: 1, display: 'grid', gap: 4 }}>
            <input value={editDraft.name||''} onChange={e => setEditDraft(p=>({...p,name:e.target.value}))} style={INP} placeholder="Name" />
            <input value={editDraft.role||''} onChange={e => setEditDraft(p=>({...p,role:e.target.value}))} style={INP} placeholder="Role" />
            <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
              <button onClick={() => { setCrew(prev => prev.map(m => m.id === c.id ? {...m,...editDraft} : m)); setEditing(null); }} style={{ padding: '3px 10px', borderRadius: 8, background: '#0f766e', color: 'white', border: 'none', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>Save</button>
              <button onClick={() => setEditing(null)} style={{ padding: '3px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>×</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{c.role}</div>
            </div>
            <button onClick={() => { setEditing(c.id); setEditDraft({name:c.name,role:c.role}); }} style={{ padding: '3px 8px', borderRadius: 8, border: '1px solid rgba(15,118,110,0.2)', background: 'rgba(240,253,250,0.8)', color: '#0f766e', fontSize: 9, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>Edit</button>
          </>
        )}
      </div>
    );
  };



  return (
    <div style={{ padding: '32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>People</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Crew</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{CREW.length} people · All islands · Kula Glass Company</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28,
        padding: 18, borderRadius: 24,
        background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {[
          { label: 'Total crew', value: crew.length, helper: 'All islands' },
          { label: 'Management', value: management.length, helper: 'Office & PM team' },
          { label: 'Superintendents', value: supers.length, helper: 'Oahu + Maui' },
          { label: 'Field crew', value: crew.filter(c=>c.type==='field').length, helper: 'Journeymen + apprentices' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: 34, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
          </div>
        ))}
      </div>

      {/* Management */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>Office & Management</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
          {management.map(c => <Card key={c.id} c={c} color="#1d4ed8" />)}
        </div>
      </div>

      {/* Superintendents */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>Superintendents</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
          {supers.map(c => <Card key={c.id} c={c} color="#4338ca" />)}
        </div>
      </div>

      {/* Field crew by island */}
      {islands.map(island => {
        const islandCrew = crew.filter(c => c.type === 'field' && c.island === island);
        if (islandCrew.length === 0) return null;
        const journeymen = islandCrew.filter(c => c.role === 'Journeyman');
        const apprentices = islandCrew.filter(c => c.role === 'Apprentice');
        return (
          <div key={island} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
<div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>
                Field Crew — {island} ({crew.length})
              </div>
            </div>
            {journeymen.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#cbd5e1', marginBottom: 6, marginLeft: 2 }}>Journeymen</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8, marginBottom: 10 }}>
                  {journeymen.map(c => <Card key={c.id} c={c} color="#0f766e" />)}
                </div>
              </>
            )}
            {apprentices.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#cbd5e1', marginBottom: 6, marginLeft: 2 }}>Apprentices</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
                  {apprentices.map(c => <Card key={c.id} c={c} color="#0891b2" />)}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
