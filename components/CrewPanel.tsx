'use client';
import { useState, useEffect, useCallback, memo } from 'react';

type CrewMember = {
  user_id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  personal_email?: string;
  island: string;
  type: 'management' | 'super' | 'field';
};

type EditDraft = { name: string; role: string; email: string; phone: string; personal_email: string };

const MGMT_ROLES = ['owner', 'gm', 'pm', 'estimator', 'sales', 'admin', 'assistant'];
const SUPER_ROLES = ['superintendent'];

function classifyType(role: string): CrewMember['type'] {
  const r = role.toLowerCase();
  if (SUPER_ROLES.some(s => r.includes(s))) return 'super';
  if (MGMT_ROLES.some(s => r.includes(s))) return 'management';
  return 'field';
}

const ISLAND_COLORS: Record<string, string> = {
  Oahu: '#0369a1', Maui: '#0f766e', Kauai: '#6d28d9', Hawaii: '#92400e',
};
const TYPE_COLORS = {
  management: '#1d4ed8', super: '#4338ca',
  field_journeyman: '#0f766e', field_apprentice: '#0891b2',
};

const INP: React.CSSProperties = {
  width: '100%', padding: '6px 8px', borderRadius: 8,
  border: '1px solid rgba(15,118,110,0.3)', background: 'rgba(240,253,250,0.6)',
  fontSize: 11, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
};

// ── Card is a TOP-LEVEL component — not defined inside CrewPanel ──────────────
// This prevents React from remounting it on parent re-renders, which was
// causing the "one keystroke then lose focus" bug.

type CardProps = {
  c: CrewMember;
  color: string;
  isEditing: boolean;
  draft: EditDraft;
  onEditStart: (id: string, draft: EditDraft) => void;
  onDraftChange: (field: keyof EditDraft, value: string) => void;
  onSave: (id: string) => void;
  onCancel: () => void;
  saving: boolean;
};

const Card = memo(function Card({ c, color, isEditing, draft, onEditStart, onDraftChange, onSave, onCancel, saving }: CardProps) {
  const initials = c.name.split(' ').map(n => n[0]).join('').slice(0, 2);
  return (
    <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${isEditing ? 'rgba(15,118,110,0.2)' : 'rgba(226,232,240,0.9)'}`, padding: '11px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'white', flexShrink: 0 }}>
        {initials}
      </div>
      {isEditing ? (
        <div style={{ flex: 1, display: 'grid', gap: 5 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            <input value={draft.name} onChange={e => onDraftChange('name', e.target.value)} style={INP} placeholder="Name" autoFocus />
            <input value={draft.role} onChange={e => onDraftChange('role', e.target.value)} style={INP} placeholder="Role" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            <input value={draft.email} onChange={e => onDraftChange('email', e.target.value)} style={INP} placeholder="Work email (@kulaglass.com)" />
            <input value={draft.phone} onChange={e => onDraftChange('phone', e.target.value)} style={INP} placeholder="Phone (808-XXX-XXXX)" />
          </div>
          <input value={draft.personal_email} onChange={e => onDraftChange('personal_email', e.target.value)} style={INP} placeholder="Personal email (for account recovery)" />
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button onClick={() => onSave(c.user_id)} disabled={saving}
              style={{ padding: '4px 12px', borderRadius: 8, background: saving ? '#e2e8f0' : '#0f766e', color: saving ? '#94a3b8' : 'white', border: 'none', fontSize: 10, fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={onCancel}
              style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{c.role}</div>
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: 10, color: '#0369a1', textDecoration: 'none' }}>{c.email}</a>}
              {c.personal_email && <span style={{ fontSize: 9, color: '#94a3b8' }}>↳ {c.personal_email}</span>}
              {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize: 10, color: '#0f766e', textDecoration: 'none' }}>{c.phone}</a>}
            </div>
          </div>
          <button onClick={() => onEditStart(c.user_id, { name: c.name, role: c.role, email: c.email || '', phone: c.phone || '', personal_email: c.personal_email || '' })}
            style={{ padding: '3px 8px', borderRadius: 8, border: '1px solid rgba(15,118,110,0.2)', background: 'rgba(240,253,250,0.8)', color: '#0f766e', fontSize: 9, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
            Edit
          </button>
        </>
      )}
    </div>
  );
});

// ── Main panel ────────────────────────────────────────────────────────────────

export default function CrewPanel() {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>({ name: '', role: '', email: '', phone: '', personal_email: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/crew')
      .then(r => r.json())
      .then(d => {
        const all: CrewMember[] = (d.all || []).map((c: Omit<CrewMember, 'type'>) => ({
          ...c, type: classifyType(c.role),
        }));
        setCrew(all);
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  const handleEditStart = useCallback((id: string, d: EditDraft) => {
    setEditing(id);
    setDraft(d);
  }, []);

  const handleDraftChange = useCallback((field: keyof EditDraft, value: string) => {
    setDraft(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(async (userId: string) => {
    setSaving(true);
    // Optimistic update
    setCrew(prev => prev.map(m => m.user_id === userId
      ? { ...m, ...draft, type: classifyType(draft.role) }
      : m
    ));
    // Write to sheet
    try {
      await fetch('/api/crew/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, ...draft }),
      });
    } catch { /* optimistic update stays */ }
    setSaving(false);
    setEditing(null);
  }, [draft]);

  const handleCancel = useCallback(() => setEditing(null), []);

  const management = crew.filter(c => c.type === 'management');
  const supers     = crew.filter(c => c.type === 'super');
  const field      = crew.filter(c => c.type === 'field');
  const islands    = ['Oahu', 'Maui', 'Kauai'];

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading crew...</div>
    </div>
  );

  const renderCard = (c: CrewMember, color: string) => (
    <Card key={c.user_id} c={c} color={color}
      isEditing={editing === c.user_id}
      draft={draft}
      onEditStart={handleEditStart}
      onDraftChange={handleDraftChange}
      onSave={handleSave}
      onCancel={handleCancel}
      saving={saving}
    />
  );

  return (
    <div style={{ padding: '32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>People</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Crew</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{crew.length} people · All islands · Kula Glass Company</p>
      </div>

      {error && <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c' }}>Failed to load crew: {error}</div>}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28, padding: 18, borderRadius: 24, background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)', border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {[
          { label: 'Total crew', value: crew.length, helper: 'All islands' },
          { label: 'Management', value: management.length, helper: 'Office & PM team' },
          { label: 'Superintendents', value: supers.length, helper: islands.join(', ') },
          { label: 'Field crew', value: field.length, helper: 'Journeymen + apprentices' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: 34, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
          </div>
        ))}
      </div>

      {/* Management */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>Office & Management</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
          {management.map(c => renderCard(c, TYPE_COLORS.management))}
        </div>
      </div>

      {/* Superintendents */}
      {supers.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>Superintendents</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
            {supers.map(c => (
              <div key={c.user_id} style={{ position: 'relative' }}>
                {c.island && <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 999, color: ISLAND_COLORS[c.island] || '#64748b', background: 'rgba(255,255,255,0.9)', border: '1px solid currentColor', zIndex: 1 }}>{c.island}</div>}
                {renderCard(c, TYPE_COLORS.super)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Field crew by island */}
      {islands.map(island => {
        const islandCrew = field.filter(c => c.island === island);
        if (!islandCrew.length) return null;
        const journeymen  = islandCrew.filter(c => c.role.toLowerCase().includes('journeyman'));
        const apprentices = islandCrew.filter(c => c.role.toLowerCase().includes('apprentice'));
        return (
          <div key={island} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: ISLAND_COLORS[island] || '#64748b' }} />
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Field Crew — {island} · {islandCrew.length}</div>
            </div>
            {journeymen.length > 0 && (
              <><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#cbd5e1', marginBottom: 6, marginLeft: 2 }}>Journeymen · {journeymen.length}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8, marginBottom: 12 }}>
                {journeymen.map(c => renderCard(c, TYPE_COLORS.field_journeyman))}
              </div></>
            )}
            {apprentices.length > 0 && (
              <><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#cbd5e1', marginBottom: 6, marginLeft: 2 }}>Apprentices · {apprentices.length}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
                {apprentices.map(c => renderCard(c, TYPE_COLORS.field_apprentice))}
              </div></>
            )}
          </div>
        );
      })}
    </div>
  );
}
