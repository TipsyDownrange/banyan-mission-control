'use client';
import { useState, useEffect, useCallback } from 'react';
import { normalizePhone } from '@/lib/normalize';
import PlacesAutocomplete from '@/components/PlacesAutocomplete';

type CrewMember = {
  user_id: string; name: string; role: string;
  email: string; phone: string; island: string;
  personal_email: string; title: string; department: string;
  departments_multi?: string; roles_multi?: string;
  departments?: string[]; roles?: string[];
  office: string; home_address: string; emergency_contact: string;
  start_date: string; notes: string;
  authority_level: string; career_track: string;
};

type Draft = Partial<CrewMember>;

const ISLAND_COLORS: Record<string, string> = {
  Oahu: '#0369a1', Maui: '#0f766e', Kauai: '#6d28d9', Hawaii: '#92400e',
};
const DEPT_COLORS: Record<string, string> = {
  PM: '#0f766e', Estimating: '#0f766e',
  Service: '#6d28d9', Admin: '#64748b', Superintendent: '#4338ca', Field: '#334155',
};

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
function avatarColor(dept: string, island: string): string {
  return DEPT_COLORS[dept] || ISLAND_COLORS[island] || '#64748b';
}

const INP: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid #e2e8f0', background: 'white',
  fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
};
const LBL: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4, display: 'block',
};
const SEC: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: '#64748b',
  borderBottom: '1px solid #f1f5f9', paddingBottom: 8, marginBottom: 12, marginTop: 2,
};

// ── Crew Detail Panel ────────────────────────────────────────────────────────
function CrewDetailPanel({ member, onClose, onSave }: {
  member: CrewMember; onClose: () => void;
  onSave: (id: string, draft: Draft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft({ ...member });
    setDirty(false);
  }, [member]);

  function update(field: keyof CrewMember, value: string) {
    setDraft(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    await onSave(member.user_id, draft);
    setSaving(false);
    setDirty(false);
  }

  const color = avatarColor(draft.department || member.department, draft.island || member.island);
  const islandColor = ISLAND_COLORS[draft.island || member.island] || '#64748b';

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 400, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        height: '90vh', background: '#f8fafc',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -24px 80px rgba(15,23,42,0.18)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 20px 12px', background: 'white', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 36, height: 4, borderRadius: 2, background: '#e2e8f0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: 'white', flexShrink: 0 }}>
              {initials(draft.name || member.name)}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>{draft.name || member.name}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: islandColor, background: `${islandColor}18`, padding: '1px 7px', borderRadius: 999 }}>{draft.island || member.island}</span>
                {(draft.department || member.department) && <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{draft.department || member.department}</span>}
                {(draft.office || member.office) && <span style={{ fontSize: 10, color: '#94a3b8' }}>· {draft.office || member.office}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {dirty && (
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '7px 16px', borderRadius: 10, background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: saving ? '#94a3b8' : 'white', border: 'none', fontSize: 12, fontWeight: 800, cursor: saving ? 'default' : 'pointer', boxShadow: saving ? 'none' : '0 2px 8px rgba(15,118,110,0.3)' }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            )}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 900, margin: '0 auto' }}>

            {/* LEFT */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SEC}>Position</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div>
                    <label style={LBL}>Full Name</label>
                    <input style={INP} value={draft.name || ''} onChange={e => update('name', e.target.value)} />
                  </div>
                  <div>
                    <label style={LBL}>Job Title</label>
                    <input style={INP} value={draft.title || ''} onChange={e => update('title', e.target.value)} placeholder="e.g. Journeyman Glazier" />
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div>
                      <label style={LBL}>Departments (multi)</label>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {['PM','Estimating','Service','Admin','Superintendent','Field','Leadership','Sales'].map(d => {
                          const depts = (draft.departments_multi || draft.department || '').split(',').map((s: string) => s.trim()).filter(Boolean);
                          const active = depts.includes(d);
                          return (
                            <button key={d} type="button" onClick={() => {
                              const next = active ? depts.filter((x: string) => x !== d) : [...depts, d];
                              update('departments_multi' as keyof typeof draft, next.join(','));
                              update('department' as keyof typeof draft, next[0] || '');
                            }} style={{
                              padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer',
                              border: active ? '1.5px solid #0f766e' : '1px solid #e2e8f0',
                              background: active ? '#f0fdfa' : 'white',
                              color: active ? '#0f766e' : '#94a3b8',
                            }}>{d}</button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={LBL}>Island</label>
                      <select style={INP} value={draft.island || ''} onChange={e => update('island', e.target.value)}>
                        <option value="">Select…</option>
                        {['Oahu','Maui','Kauai','Hawaii','Molokai','Lanai'].map(i => <option key={i}>{i}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={LBL}>Office / Location</label>
                      <select style={INP} value={draft.office || ''} onChange={e => update('office', e.target.value)}>
                        <option value="">Select…</option>
                        {['Maui HQ','Oahu','Kauai','Remote — Big Island','Remote','Field'].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={LBL}>Start Date</label>
                    <input type="date" style={INP} value={draft.start_date || ''} onChange={e => update('start_date', e.target.value)} />
                  </div>
                </div>
                {/* Authority & Career Track — drives app permissions */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10, padding: '12px 14px', background: 'rgba(99,102,241,0.04)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.12)' }}>
                  <div>
                    <label style={{ ...LBL, color: '#4338ca' }}>Authority Level</label>
                    <select style={{ ...INP, borderColor: 'rgba(99,102,241,0.25)' }} value={draft.authority_level || ''} onChange={e => update('authority_level' as keyof CrewMember, e.target.value)}>
                      <option value="">Select…</option>
                      {['Executive','Management','Superintendent','Admin','Field'].map(a => <option key={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...LBL, color: '#4338ca' }}>Career Track</label>
                    <select style={{ ...INP, borderColor: 'rgba(99,102,241,0.25)' }} value={draft.career_track || ''} onChange={e => update('career_track' as keyof CrewMember, e.target.value)}>
                      <option value="">Select…</option>
                      {['PM','Estimating','Admin','Field','Field-to-Office'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1/-1', fontSize: 10, color: '#6366f1', fontWeight: 600 }}>
                    ↑ Controls which sections this person sees in Mission Control
                  </div>
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SEC}>Notes (Union, Certs, etc.)</div>
                <textarea rows={4} style={{ ...INP, resize: 'none' }} value={draft.notes || ''} onChange={e => update('notes', e.target.value)} placeholder="Union status, certifications, anything else…" />
              </div>
            </div>

            {/* RIGHT */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SEC}>Contact</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div>
                    <label style={LBL}>Work Email</label>
                    <input style={INP} value={draft.email || ''} onChange={e => update('email', e.target.value)} placeholder="name@kulaglass.com" />
                  </div>
                  <div>
                    <label style={LBL}>Personal Email</label>
                    <input style={INP} value={draft.personal_email || ''} onChange={e => update('personal_email', e.target.value)} placeholder="For account recovery / notifications" />
                  </div>
                  <div>
                    <label style={LBL}>Mobile Phone</label>
                    <input style={INP} value={draft.phone || ''} onChange={e => update('phone', e.target.value)} placeholder="808-XXX-XXXX" />
                  </div>
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SEC}>Address & Emergency</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div>
                    <label style={LBL}>Home Address</label>
                    <textarea rows={2} style={{ ...INP, resize: 'none' }} value={draft.home_address || ''} onChange={e => update('home_address', e.target.value)} placeholder="Street, City, HI ZIP" />
                  </div>
                  <div>
                    <label style={LBL}>Emergency Contact</label>
                    <input style={INP} value={draft.emergency_contact || ''} onChange={e => update('emergency_contact', e.target.value)} placeholder="Name · Relationship · 808-XXX-XXXX" />
                  </div>
                </div>
              </div>

              {/* Read-only ID */}
              <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #f1f5f9', padding: '10px 14px' }}>
                <div style={{ ...LBL, marginBottom: 2 }}>Employee ID</div>
                <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{member.user_id}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom save bar */}
        {dirty && (
          <div style={{ flexShrink: 0, padding: '12px 20px', background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={() => { setDraft({ ...member }); setDirty(false); }}
              style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Discard
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '10px 24px', borderRadius: 10, background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: saving ? '#94a3b8' : 'white', border: 'none', fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', boxShadow: saving ? 'none' : '0 3px 10px rgba(15,118,110,0.3)' }}>
              {saving ? 'Saving…' : '✓ Save All Changes'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Crew Card ────────────────────────────────────────────────────────────────
function CrewCard({ member, onClick, travel }: {
  member: CrewMember;
  onClick: () => void;
  travel?: { type: string; from_code: string; to_code: string; travel_date: string; depart_time: string }[];
}) {
  const color = avatarColor(member.department, member.island);
  const islandColor = ISLAND_COLORS[member.island] || '#64748b';
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const todayTravel = travel?.find(t => t.travel_date === today);
  const tomorrowTravel = travel?.find(t => t.travel_date === tomorrow);
  const activeTravel = todayTravel || tomorrowTravel;
  const isTodayTravel = !!todayTravel;
  const isFerry = activeTravel?.type === 'ferry';

  // Premium SVG icons — no emoji
  const PlaneIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill={color} />
    </svg>
  );

  const FerryIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <path d="M20 21c-1.6 0-3.2-.6-4.4-1.6-1.2 1-2.8 1.6-4.4 1.6S8 20.4 6.8 19.4C5.6 20.4 4 21 2.4 21H2v-2h.4c1 0 2-.4 2.8-1l1.3-1 1.3 1c.8.6 1.8 1 2.8 1s2-.4 2.8-1l1.3-1 1.3 1c.8.6 1.8 1 2.8 1h.4v2H20zM19 7H5l-1 4 8 2 8-2-1-4zM13 3H11v2H7v2h10V5h-4V3z" fill={color} />
    </svg>
  );

  return (
    <div onClick={onClick} style={{
      background: 'white', borderRadius: 14,
      border: isTodayTravel ? '1.5px solid rgba(3,105,161,0.3)' : '1px solid #e2e8f0',
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
      cursor: 'pointer', transition: 'box-shadow 0.1s',
      boxShadow: isTodayTravel ? '0 4px 16px rgba(3,105,161,0.1)' : '0 1px 4px rgba(15,23,42,0.04)',
      position: 'relative',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,23,42,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = isTodayTravel ? '0 4px 16px rgba(3,105,161,0.1)' : '0 1px 4px rgba(15,23,42,0.04)')}>
      {/* Avatar */}
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: 'white', flexShrink: 0, position: 'relative' }}>
        {initials(member.name)}
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: islandColor, border: '1.5px solid white' }} />
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {member.title || member.role}
        </div>
        {/* Travel indicator */}
        {activeTravel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
            {isFerry
              ? <FerryIcon size={11} color={isTodayTravel ? '#0369a1' : '#94a3b8'} />
              : <PlaneIcon size={11} color={isTodayTravel ? '#0369a1' : '#94a3b8'} />}
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '-0.01em', color: isTodayTravel ? '#0369a1' : '#94a3b8' }}>
              {isTodayTravel ? 'In transit today' : 'Departing tomorrow'} · {activeTravel.from_code}
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{display:'inline',verticalAlign:'middle',margin:'0 2px'}}><path d="M5 12h14M14 6l6 6-6 6"/></svg>
              {activeTravel.to_code}
            </span>
          </div>
        )}
        {!activeTravel && (
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {member.email && <span style={{ fontSize: 9, color: '#0369a1' }}>{member.email}</span>}
            {member.phone && <span style={{ fontSize: 9, color: '#0f766e' }}>{member.phone}</span>}
          </div>
        )}
      </div>
      {/* Travel icon badge */}
      {activeTravel && (
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: isTodayTravel ? 'rgba(3,105,161,0.10)' : 'rgba(148,163,184,0.08)',
          border: isTodayTravel ? '1px solid rgba(3,105,161,0.18)' : '1px solid rgba(148,163,184,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {isFerry
            ? <FerryIcon size={15} color={isTodayTravel ? '#0369a1' : '#94a3b8'} />
            : <PlaneIcon size={15} color={isTodayTravel ? '#0369a1' : '#94a3b8'} />}
        </div>
      )}
      {/* Office badge */}
      {!activeTravel && member.office && (
        <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {member.office}
        </div>
      )}
      {/* Arrow */}
      <div style={{ fontSize: 14, color: '#cbd5e1', flexShrink: 0 }}>›</div>
    </div>
  );
}

// ── Add Crew Modal ───────────────────────────────────────────────────────────
function AddCrewModal({ onClose, onAdded }: { onClose: () => void; onAdded: (m: CrewMember) => void }) {
  const [form, setForm] = useState({ first_name:'', last_name:'', role:'Journeyman/Glazier', email:'', phone:'', island:'Maui', department:'Field', classification:'Journeyman', address:'' });
  const [saving, setSaving] = useState(false);
  const u = (k: string, v: string) => setForm(p => ({...p, [k]: v}));
  const canSave = form.first_name.trim() && form.last_name.trim();
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={onClose}>
      <div style={{ background:'white', borderRadius:18, padding:28, width:'100%', maxWidth:520, boxShadow:'0 24px 64px rgba(0,0,0,0.18)', maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ fontSize:18, fontWeight:800, color:'#0f172a', margin:0 }}>Add Crew Member</h2>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid #e2e8f0', background:'white', color:'#64748b', fontSize:18, cursor:'pointer' }}>×</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div><label style={{ fontSize:9, fontWeight:800, textTransform:'uppercase' as const, color:'#94a3b8', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>First Name *</label>
            <input style={{ fontSize:13, padding:'8px 12px', borderRadius:9, border:'1px solid #e2e8f0', outline:'none', width:'100%', boxSizing:'border-box' as const }} value={form.first_name} onChange={e=>u('first_name',e.target.value)} autoFocus /></div>
          <div><label style={{ fontSize:9, fontWeight:800, textTransform:'uppercase' as const, color:'#94a3b8', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>Last Name *</label>
            <input style={{ fontSize:13, padding:'8px 12px', borderRadius:9, border:'1px solid #e2e8f0', outline:'none', width:'100%', boxSizing:'border-box' as const }} value={form.last_name} onChange={e=>u('last_name',e.target.value)} /></div>
          <div><label style={{ fontSize:9, fontWeight:800, textTransform:'uppercase' as const, color:'#94a3b8', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>Role</label>
            <select style={{ fontSize:13, padding:'8px 12px', borderRadius:9, border:'1px solid #e2e8f0', outline:'none', width:'100%', boxSizing:'border-box' as const, background:'white' }} value={form.role} onChange={e=>u('role',e.target.value)}>
              {['Superintendent','Journeyman/Glazier','Apprentice','Laborer','PM','Senior PM','Estimator','Admin','Owner'].map(r=><option key={r} value={r}>{r}</option>)}
            </select></div>
          <div><label style={{ fontSize:9, fontWeight:800, textTransform:'uppercase' as const, color:'#94a3b8', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>Department</label>
            <select style={{ fontSize:13, padding:'8px 12px', borderRadius:9, border:'1px solid #e2e8f0', outline:'none', width:'100%', boxSizing:'border-box' as const, background:'white' }} value={form.department} onChange={e=>u('department',e.target.value)}>
              {['Field','PM','Estimating','Service','Admin','Executive'].map(d=><option key={d} value={d}>{d}</option>)}
            </select></div>
          <div><label style={{ fontSize:9, fontWeight:800, textTransform:'uppercase' as const, color:'#94a3b8', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>Email</label>
            <input type="email" style={{ fontSize:13, padding:'8px 12px', borderRadius:9, border:'1px solid #e2e8f0', outline:'none', width:'100%', boxSizing:'border-box' as const }} value={form.email} onChange={e=>u('email',e.target.value)} /></div>
          <div><label style={{ fontSize:9, fontWeight:800, textTransform:'uppercase' as const, color:'#94a3b8', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>Phone</label>
            <input type="tel" style={{ fontSize:13, padding:'8px 12px', borderRadius:9, border:'1px solid #e2e8f0', outline:'none', width:'100%', boxSizing:'border-box' as const }} value={form.phone} onChange={e=>u('phone',e.target.value)} onBlur={e=>u('phone', normalizePhone(e.target.value))} placeholder="(808) 555-0199" /></div>
          <div><label style={{ fontSize:9, fontWeight:800, textTransform:'uppercase' as const, color:'#94a3b8', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>Island</label>
            <select style={{ fontSize:13, padding:'8px 12px', borderRadius:9, border:'1px solid #e2e8f0', outline:'none', width:'100%', boxSizing:'border-box' as const, background:'white' }} value={form.island} onChange={e=>u('island',e.target.value)}>
              {['Maui','Oahu','Kauai','Hawaii','Molokai','Lanai'].map(i=><option key={i} value={i}>{i}</option>)}
            </select></div>
          <div><label style={{ fontSize:9, fontWeight:800, textTransform:'uppercase' as const, color:'#94a3b8', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>Classification</label>
            <select style={{ fontSize:13, padding:'8px 12px', borderRadius:9, border:'1px solid #e2e8f0', outline:'none', width:'100%', boxSizing:'border-box' as const, background:'white' }} value={form.classification} onChange={e=>u('classification',e.target.value)}>
              {['Journeyman','Apprentice','Superintendent','Foreman','Laborer','PM','Estimator','Admin'].map(c=><option key={c} value={c}>{c}</option>)}
            </select></div>
        </div>
        <div style={{ marginTop:12 }}><label style={{ fontSize:9, fontWeight:800, textTransform:'uppercase' as const, color:'#94a3b8', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>Home Address</label>
          <PlacesAutocomplete value={form.address} onChange={v=>u('address',v)} onSelect={place=>u('address', place.formatted_address||'')} style={{ fontSize:13, padding:'8px 12px', borderRadius:9, border:'1px solid #e2e8f0', outline:'none', width:'100%', boxSizing:'border-box' as const }} placeholder="Street address" /></div>
        <button disabled={!canSave || saving} onClick={async () => {
          setSaving(true);
          try {
            const r = await fetch('/api/crew', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
            const d = await r.json();
            if (d.success) {
              const newMember: CrewMember = { user_id:d.user_id, name:`${form.first_name.trim()} ${form.last_name.trim()}`, role:form.role, email:form.email, phone:form.phone, island:form.island, personal_email:'', title:form.classification, department:form.department, departments_multi:form.department, roles_multi:form.role, departments:[form.department], roles:[form.role], office:'', home_address:form.address, emergency_contact:'', start_date:new Date().toISOString().slice(0,10), notes:'', authority_level:'', career_track:'' };
              onAdded(newMember);
            }
          } catch(err) { console.error('[AddCrewModal] save', err); }
          setSaving(false);
        }} style={{ marginTop:20, width:'100%', padding:'10px', borderRadius:10, border:'none', background: canSave ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0', color: canSave ? 'white' : '#94a3b8', fontSize:14, fontWeight:800, cursor: canSave ? 'pointer' : 'default' }}>
          {saving ? 'Saving…' : 'Add Crew Member'}
        </button>
      </div>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────
export default function CrewPanel() {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selected, setSelected] = useState<CrewMember | null>(null);
  const [travelByName, setTravelByName] = useState<Record<string, { type: string; from_code: string; to_code: string; travel_date: string; depart_time: string }[]>>({});
  const [search, setSearch] = useState('');
  const [filterIsland, setFilterIsland] = useState('All');
  const [filterDept, setFilterDept] = useState('All');

  useEffect(() => {
    fetch('/api/crew?all=true')
      .then(r => r.json())
      .then(d => { setCrew(d.all || []); setLoading(false); })
      .catch(() => setLoading(false));
    // Load travel status
    fetch('/api/travel')
      .then(r => r.json())
      .then(d => setTravelByName(d.byCrewName || {}))
      .catch(() => {});
  }, []);

  const handleSave = useCallback(async (userId: string, draft: Draft) => {
    setCrew(prev => prev.map(m => m.user_id === userId ? { ...m, ...draft } as CrewMember : m));
    try {
      await fetch('/api/crew/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, ...draft }),
      });
      // Refresh selected
      setSelected(prev => prev?.user_id === userId ? { ...prev, ...draft } as CrewMember : prev);
    } catch { /* optimistic stays */ }
  }, []);

  const islands = ['All', 'Oahu', 'Maui', 'Kauai', 'Hawaii'];

  // Department mapping uses departments_multi from sheet (comma-separated, authoritative)
  // Falls back to single department field, then role inference as last resort
  function getDeptTags(m: CrewMember): string[] {
    // Primary: use departments array from API (parsed from departments_multi column)
    if (m.departments && m.departments.length > 0) {
      // Map sheet department names to display names
      const MAP: Record<string, string> = {
        'Executive': 'Executive',
        'Project Management': 'Project Management',
        'Estimating': 'Estimating',
        'Service': 'Service',
        'Admin': 'Admin',
        'Field': 'Field',
      };
      return m.departments.map(d => MAP[d] || d);
    }
    // Fallback: single department column
    if (m.department && m.department !== 'Other') return [m.department];
    // Last resort: infer from role text (legacy)
    const roleLower = (m.role || '').toLowerCase();
    const tags = new Set<string>();
    if (roleLower.includes('owner') || roleLower.includes('gm')) tags.add('Executive');
    if (roleLower.includes('pm') || roleLower.includes('project manager')) tags.add('Project Management');
    if (roleLower.includes('estimator')) tags.add('Estimating');
    if (roleLower.includes('service')) tags.add('Service');
    if (roleLower.includes('admin')) tags.add('Admin');
    if (roleLower.includes('superintendent')) tags.add('Field');
    if (roleLower.includes('journeyman') || roleLower.includes('apprentice') || roleLower.includes('leadman')) tags.add('Field');
    if (tags.size === 0) tags.add('Other');
    return Array.from(tags);
  }

  const DEPT_ORDER = ['Executive', 'Project Management', 'Estimating', 'Service', 'Admin', 'Field', 'Other'];
  const depts = ['All', ...DEPT_ORDER.filter(d => d !== 'Other')];

  const filtered = crew.filter(m => {
    const q = search.toLowerCase();
    const matchSearch = !q || m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
    const matchIsland = filterIsland === 'All' || m.island === filterIsland;
    const memberDepts = getDeptTags(m);
    const matchDept = filterDept === 'All' || memberDepts.includes(filterDept);
    return matchSearch && matchIsland && matchDept;
  });

  // Group by ALL matching departments — people with multi-roles appear in each section
  const groups: Record<string, CrewMember[]> = {};
  filtered.forEach(m => {
    const tags = getDeptTags(m);
    tags.forEach(tag => {
      (groups[tag] = groups[tag] || []).push(m);
    });
  });

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading crew…</div>
    </div>
  );

  return (
    <div style={{ padding: '32px', paddingBottom: '120px', maxWidth: 1100, margin: '0 auto' }}>
      {showAddModal && <AddCrewModal onClose={() => setShowAddModal(false)} onAdded={m => { setCrew(p => [m, ...p]); setShowAddModal(false); }} />}
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>People & Assets</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>
            Crew <span style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8', letterSpacing: 0 }}>{crew.length} people</span>
          </h1>
          <button onClick={() => setShowAddModal(true)} style={{ padding:'9px 18px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0f766e,#14b8a6)', color:'white', fontSize:13, fontWeight:800, cursor:'pointer', boxShadow:'0 2px 8px rgba(15,118,110,0.25)', whiteSpace:'nowrap' as const }}>+ Add Crew Member</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, role, email…"
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, outline: 'none', minWidth: 220 }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {islands.map(isl => (
            <button key={isl} onClick={() => setFilterIsland(isl)}
              style={{ padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: filterIsland === isl ? `1px solid ${ISLAND_COLORS[isl] || '#0f766e'}` : '1px solid #e2e8f0', background: filterIsland === isl ? `${ISLAND_COLORS[isl] || '#0f766e'}12` : 'white', color: filterIsland === isl ? (ISLAND_COLORS[isl] || '#0f766e') : '#64748b' }}>
              {isl}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {depts.map(d => (
            <button key={d} onClick={() => setFilterDept(d)}
              style={{ padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: filterDept === d ? '1px solid rgba(15,118,110,0.4)' : '1px solid #e2e8f0', background: filterDept === d ? 'rgba(15,118,110,0.08)' : 'white', color: filterDept === d ? '#0f766e' : '#64748b' }}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Filter active → flat list, no sections. All → grouped by dept */}
      {filterDept !== 'All' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
          {filtered.map(m => (
            <CrewCard key={m.user_id} member={m} onClick={() => setSelected(m)} travel={travelByName[m.name.toLowerCase()]} />
          ))}
        </div>
      ) : (
        DEPT_ORDER.filter(d => groups[d]?.length > 0).map(dept => (
          <div key={dept} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: DEPT_COLORS[dept] || '#64748b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: DEPT_COLORS[dept] || '#64748b' }} />
              {dept} <span style={{ fontWeight: 600, color: '#94a3b8' }}>({groups[dept].length})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
              {groups[dept].map(m => (
                <CrewCard key={`${dept}-${m.user_id}`} member={m} onClick={() => setSelected(m)} travel={travelByName[m.name.toLowerCase()]} />
              ))}
            </div>
          </div>
        ))
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8', fontSize: 13 }}>No crew members match your filters.</div>
      )}

      {/* Detail panel */}
      {selected && (
        <CrewDetailPanel
          member={selected}
          onClose={() => setSelected(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
