'use client';
import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────
type OrgRecord = {
  org_id: string; name: string; types: string[]; entity_type: string;
  default_island: string; notes?: string; primary_contact?: { name:string; email:string; phone:string; title?:string };
  primary_site?: { address_line_1:string; city:string; island:string };
  company: string; contactPerson: string; contactPhone: string; email: string; address: string; island: string;
};
type Contact = { contact_id:string; name:string; title:string; role:string; email:string; phone:string; is_primary:boolean; notes:string };
type Site = { site_id:string; name:string; address_line_1:string; city:string; state:string; zip:string; island:string; site_type:string };
type LinkedWO = { id:string; woNumber:string; name:string; status:string; island:string };
type LinkedProject = { kID:string; type:string; name:string; status:string; role:string };

// ── Type badge colors ─────────────────────────────────────────────────────
const TYPE_COLORS: Record<string,{color:string;bg:string}> = {
  GC:           { color:'#1d4ed8', bg:'#eff6ff' },
  RESIDENTIAL:  { color:'#15803d', bg:'#f0fdf4' },
  COMMERCIAL:   { color:'#0f766e', bg:'#f0fdfa' },
  VENDOR:       { color:'#c2410c', bg:'#fff7ed' },
  ARCHITECT:    { color:'#7c3aed', bg:'#f5f3ff' },
  BUILDER:      { color:'#d97706', bg:'#fffbeb' },
  OWNER:        { color:'#b91c1c', bg:'#fef2f2' },
  GOVERNMENT:   { color:'#0369a1', bg:'#f0f9ff' },
  PROPERTY_MGMT:{ color:'#64748b', bg:'#f8fafc' },
  CONSULTANT:   { color:'#4b5563', bg:'#f9fafb' },
};

const ALL_TYPES = ['GC','RESIDENTIAL','COMMERCIAL','VENDOR','ARCHITECT','OWNER','BUILDER','GOVERNMENT','PROPERTY_MGMT','CONSULTANT'];

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLORS[type] || { color:'#64748b', bg:'#f8fafc' };
  return <span style={{ fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:999, background:c.bg, color:c.color, letterSpacing:'0.04em', textTransform:'uppercase', whiteSpace:'nowrap' }}>{type.replace('_',' ')}</span>;
}

// ── Detail Panel ──────────────────────────────────────────────────────────
function OrgDetailPanel({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<{org:OrgRecord&{tax_id?:string;payment_terms?:string};contacts:Contact[];sites:Site[];linkedWOs:LinkedWO[];linkedProjects:LinkedProject[]} | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [addingSite, setAddingSite] = useState(false);
  const [newContact, setNewContact] = useState({ name:'', title:'', role:'PRIMARY', email:'', phone:'' });
  const [newSite, setNewSite] = useState({ address_line_1:'', city:'', island:'', site_type:'OFFICE' });

  useEffect(() => {
    fetch(`/api/organizations/${orgId}`).then(r=>r.json()).then(setDetail).catch(console.error);
  }, [orgId]);

  async function patchOrg(fields: Record<string,unknown>) {
    setSaving(true);
    await fetch(`/api/organizations/${orgId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(fields) }).catch(console.error);
    setSaving(false);
  }

  async function patchContact(contactId: string, fields: Record<string,unknown>) {
    await fetch(`/api/organizations/${orgId}/contacts`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ contactId, ...fields }) }).catch(console.error);
  }

  async function addContact() {
    if (!newContact.name) return;
    await fetch(`/api/organizations/${orgId}/contacts`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(newContact) }).catch(console.error);
    const res = await fetch(`/api/organizations/${orgId}`).then(r=>r.json()).catch(()=>null);
    if (res) setDetail(res);
    setNewContact({ name:'', title:'', role:'PRIMARY', email:'', phone:'' });
    setAddingContact(false);
  }

  async function addSite() {
    await fetch(`/api/organizations/${orgId}/sites`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(newSite) }).catch(console.error);
    const res = await fetch(`/api/organizations/${orgId}`).then(r=>r.json()).catch(()=>null);
    if (res) setDetail(res);
    setNewSite({ address_line_1:'', city:'', island:'', site_type:'OFFICE' });
    setAddingSite(false);
  }

  const INP: React.CSSProperties = { fontSize:13, padding:'5px 8px', borderRadius:7, border:'1px solid #e2e8f0', outline:'none', background:'white', width:'100%', boxSizing:'border-box' };
  const LBL: React.CSSProperties = { fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#94a3b8', marginBottom:2, display:'block' };
  const SEC: React.CSSProperties = { fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'#64748b', marginBottom:8, marginTop:16 };

  if (!detail) return (
    <div style={{ position:'fixed',inset:0,zIndex:600,background:'rgba(15,23,42,0.3)',display:'flex',alignItems:'flex-end' }} onClick={onClose}>
      <div style={{ background:'white',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:680,margin:'0 auto',padding:40,textAlign:'center',color:'#94a3b8',fontSize:13 }}>Loading…</div>
    </div>
  );

  const { org, contacts, sites, linkedWOs, linkedProjects } = detail;

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:500,background:'rgba(15,23,42,0.3)' }}/>
      <div style={{ position:'fixed',top:0,right:0,bottom:0,zIndex:501,width:'min(680px,100vw)',background:'white',boxShadow:'-4px 0 24px rgba(15,23,42,0.12)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
        {/* Header */}
        <div style={{ padding:'16px 20px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:10 }}>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:20,padding:0 }}>←</button>
          <div style={{ flex:1 }}>
            <input defaultValue={org.name} onBlur={e=>e.target.value!==org.name&&patchOrg({name:e.target.value})}
              style={{ fontSize:17,fontWeight:800,color:'#0f172a',border:'none',outline:'none',background:'transparent',width:'100%' }} />
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:18,padding:0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex:1,overflowY:'auto',padding:'16px 20px' }}>

          {/* Types + meta */}
          <div style={{ display:'flex',gap:6,flexWrap:'wrap',marginBottom:12 }}>
            {org.types.map(t=><TypeBadge key={t} type={t}/>)}
            <span style={{ fontSize:11,color:'#94a3b8',alignSelf:'center' }}>{org.entity_type} · {org.default_island||'—'}</span>
          </div>

          {/* Notes */}
          <div style={{ marginBottom:16 }}>
            <label style={LBL}>Notes</label>
            <textarea defaultValue={org.notes||''} onBlur={e=>patchOrg({notes:e.target.value})} rows={2}
              style={{ ...INP,resize:'none',minHeight:50 }} placeholder="Internal notes…"/>
          </div>

          {/* Contacts */}
          <div style={SEC}>Contacts</div>
          {contacts.map((c,i)=>(
            <div key={c.contact_id} style={{ padding:'10px 12px',borderRadius:10,border:'1px solid #f1f5f9',background:i%2===0?'white':'#fafafa',marginBottom:6 }}>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
                <div><label style={LBL}>Name {c.is_primary&&<span style={{ color:'#0f766e' }}>★</span>}</label>
                  <input defaultValue={c.name} onBlur={e=>patchContact(c.contact_id,{name:e.target.value})} style={INP}/></div>
                <div><label style={LBL}>Title</label>
                  <input defaultValue={c.title} onBlur={e=>patchContact(c.contact_id,{title:e.target.value})} style={INP}/></div>
                <div><label style={LBL}>Email</label>
                  <input defaultValue={c.email} onBlur={e=>patchContact(c.contact_id,{email:e.target.value})} style={INP} type="email"/></div>
                <div><label style={LBL}>Phone</label>
                  <input defaultValue={c.phone} onBlur={e=>patchContact(c.contact_id,{phone:e.target.value})} style={INP} type="tel"/></div>
              </div>
            </div>
          ))}
          {addingContact ? (
            <div style={{ padding:'10px 12px',borderRadius:10,border:'1.5px dashed #0f766e',marginBottom:8 }}>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8 }}>
                <div><label style={LBL}>Name *</label><input style={INP} value={newContact.name} onChange={e=>setNewContact(p=>({...p,name:e.target.value}))}/></div>
                <div><label style={LBL}>Title</label><input style={INP} value={newContact.title} onChange={e=>setNewContact(p=>({...p,title:e.target.value}))}/></div>
                <div><label style={LBL}>Email</label><input style={INP} type="email" value={newContact.email} onChange={e=>setNewContact(p=>({...p,email:e.target.value}))}/></div>
                <div><label style={LBL}>Phone</label><input style={INP} type="tel" value={newContact.phone} onChange={e=>setNewContact(p=>({...p,phone:e.target.value}))}/></div>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button onClick={()=>setAddingContact(false)} style={{ flex:1,padding:'7px',borderRadius:8,border:'1px solid #e2e8f0',background:'white',color:'#64748b',fontSize:12,fontWeight:700,cursor:'pointer' }}>Cancel</button>
                <button onClick={addContact} disabled={!newContact.name} style={{ flex:2,padding:'7px',borderRadius:8,border:'none',background:'#0f766e',color:'white',fontSize:12,fontWeight:700,cursor:'pointer' }}>Add Contact</button>
              </div>
            </div>
          ) : (
            <button onClick={()=>setAddingContact(true)} style={{ fontSize:12,fontWeight:700,color:'#0f766e',background:'none',border:'none',cursor:'pointer',padding:'4px 0' }}>+ Add Contact</button>
          )}

          {/* Sites */}
          <div style={SEC}>Sites</div>
          {sites.map((s,i)=>(
            <div key={s.site_id} style={{ padding:'10px 12px',borderRadius:10,border:'1px solid #f1f5f9',background:i%2===0?'white':'#fafafa',marginBottom:6,fontSize:13,color:'#334155' }}>
              <div style={{ fontWeight:700 }}>{s.address_line_1}{s.city?`, ${s.city}`:''}{s.island?` · ${s.island}`:''}</div>
              <div style={{ fontSize:11,color:'#94a3b8',marginTop:2 }}>{s.site_type}{s.zip?` · ${s.zip}`:''}</div>
            </div>
          ))}
          {addingSite ? (
            <div style={{ padding:'10px 12px',borderRadius:10,border:'1.5px dashed #0f766e',marginBottom:8 }}>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8 }}>
                <div><label style={LBL}>Address</label><input style={INP} value={newSite.address_line_1} onChange={e=>setNewSite(p=>({...p,address_line_1:e.target.value}))}/></div>
                <div><label style={LBL}>City</label><input style={INP} value={newSite.city} onChange={e=>setNewSite(p=>({...p,city:e.target.value}))}/></div>
                <div><label style={LBL}>Island</label><input style={INP} value={newSite.island} onChange={e=>setNewSite(p=>({...p,island:e.target.value}))}/></div>
                <div><label style={LBL}>Type</label>
                  <select style={{...INP,cursor:'pointer'}} value={newSite.site_type} onChange={e=>setNewSite(p=>({...p,site_type:e.target.value}))}>
                    {['OFFICE','JOBSITE','RESIDENCE','WAREHOUSE'].map(t=><option key={t}>{t}</option>)}
                  </select></div>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button onClick={()=>setAddingSite(false)} style={{ flex:1,padding:'7px',borderRadius:8,border:'1px solid #e2e8f0',background:'white',color:'#64748b',fontSize:12,fontWeight:700,cursor:'pointer' }}>Cancel</button>
                <button onClick={addSite} style={{ flex:2,padding:'7px',borderRadius:8,border:'none',background:'#0f766e',color:'white',fontSize:12,fontWeight:700,cursor:'pointer' }}>Add Site</button>
              </div>
            </div>
          ) : (
            <button onClick={()=>setAddingSite(true)} style={{ fontSize:12,fontWeight:700,color:'#0f766e',background:'none',border:'none',cursor:'pointer',padding:'4px 0' }}>+ Add Site</button>
          )}

          {/* Linked WOs */}
          {linkedWOs.length > 0 && <>
            <div style={SEC}>Linked Work Orders ({linkedWOs.length})</div>
            {linkedWOs.map(wo=>(
              <div key={wo.id} style={{ padding:'8px 10px',borderRadius:8,border:'1px solid #f1f5f9',marginBottom:4,display:'flex',justifyContent:'space-between',fontSize:12 }}>
                <span style={{ fontWeight:700,color:'#0f172a' }}>{wo.name||wo.woNumber}</span>
                <span style={{ color:'#94a3b8' }}>{wo.id} · {wo.status}</span>
              </div>
            ))}
          </>}

          {/* Linked Projects */}
          {linkedProjects.length > 0 && <>
            <div style={SEC}>Linked Projects ({linkedProjects.length})</div>
            {linkedProjects.map(p=>(
              <div key={p.kID} style={{ padding:'8px 10px',borderRadius:8,border:'1px solid #f1f5f9',marginBottom:4,display:'flex',justifyContent:'space-between',fontSize:12 }}>
                <span style={{ fontWeight:700,color:'#0f172a' }}>{p.name} <span style={{ color:'#0891b2',fontSize:10 }}>{p.role}</span></span>
                <span style={{ color:'#94a3b8' }}>{p.kID}</span>
              </div>
            ))}
          </>}

        </div>
        {saving && <div style={{ padding:'6px',textAlign:'center',fontSize:11,color:'#0f766e',borderTop:'1px solid #f1f5f9' }}>Saving…</div>}
      </div>
    </>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────
export default function OrganizationsPanel() {
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string|null>(null);
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgTypes, setNewOrgTypes] = useState(['RESIDENTIAL']);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/organizations?limit=500');
      const d = await res.json();
      setOrgs(d.organizations || []);
    } catch(e) { console.error('[OrganizationsPanel]', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = orgs.filter(o => {
    if (search.length >= 2 && !o.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter.length > 0 && !typeFilter.some(t => o.types.includes(t))) return false;
    return true;
  });

  async function createOrg() {
    if (!newOrgName.trim()) return;
    setCreating(true);
    await fetch('/api/organizations', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: newOrgName.trim(), types: newOrgTypes }) });
    await load();
    setNewOrgName(''); setNewOrgTypes(['RESIDENTIAL']); setShowAddOrg(false); setCreating(false);
  }

  const INP: React.CSSProperties = { fontSize:13, padding:'8px 12px', borderRadius:10, border:'1px solid #e2e8f0', outline:'none', background:'white', boxSizing:'border-box' };

  return (
    <div style={{ padding:24, maxWidth:1100, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, fontWeight:800, letterSpacing:'0.14em', textTransform:'uppercase', color:'#94a3b8', marginBottom:4 }}>People</div>
        <div style={{ fontSize:24, fontWeight:900, color:'#0f172a', letterSpacing:'-0.03em', marginBottom:6 }}>Organizations</div>
        <div style={{ fontSize:13, color:'#64748b' }}>
          {loading ? 'Loading…' : `${filtered.length} of ${orgs.length} organizations`}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search organizations…"
          style={{ ...INP, flex:'0 0 240px' }} />
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', flex:1 }}>
          {ALL_TYPES.map(t => {
            const active = typeFilter.includes(t);
            const c = TYPE_COLORS[t] || { color:'#64748b', bg:'#f8fafc' };
            return <button key={t} onClick={() => setTypeFilter(p => active ? p.filter(x=>x!==t) : [...p,t])}
              style={{ fontSize:10, fontWeight:800, padding:'4px 10px', borderRadius:999, cursor:'pointer', textTransform:'uppercase', letterSpacing:'0.04em',
                border: active ? `1.5px solid ${c.color}` : '1px solid #e2e8f0',
                background: active ? c.bg : 'white', color: active ? c.color : '#94a3b8' }}>
              {t.replace('_',' ')}
            </button>;
          })}
          {typeFilter.length > 0 && <button onClick={()=>setTypeFilter([])} style={{ fontSize:11, color:'#94a3b8', background:'none', border:'none', cursor:'pointer' }}>Clear</button>}
        </div>
        <button onClick={()=>setShowAddOrg(p=>!p)} style={{ padding:'8px 16px', borderRadius:10, background:'linear-gradient(135deg,#0f766e,#14b8a6)', color:'white', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
          + New Org
        </button>
      </div>

      {/* Add org form */}
      {showAddOrg && (
        <div style={{ background:'white', borderRadius:12, border:'1px solid #e2e8f0', padding:16, marginBottom:16 }}>
          <div style={{ display:'flex', gap:10, marginBottom:10 }}>
            <input style={{ ...INP, flex:1 }} placeholder="Organization name *" value={newOrgName} onChange={e=>setNewOrgName(e.target.value)} autoFocus />
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
            {ALL_TYPES.map(t => {
              const active = newOrgTypes.includes(t);
              const c = TYPE_COLORS[t] || { color:'#64748b', bg:'#f8fafc' };
              return <button key={t} onClick={()=>setNewOrgTypes(p=>active?p.filter(x=>x!==t):[...p,t])}
                style={{ fontSize:10, fontWeight:800, padding:'4px 10px', borderRadius:999, cursor:'pointer', textTransform:'uppercase', letterSpacing:'0.04em', border: active?`1.5px solid ${c.color}`:'1px solid #e2e8f0', background:active?c.bg:'white', color:active?c.color:'#94a3b8' }}>
                {t.replace('_',' ')}
              </button>;
            })}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>setShowAddOrg(false)} style={{ flex:1, padding:'9px', borderRadius:10, border:'1px solid #e2e8f0', background:'white', color:'#64748b', fontSize:13, fontWeight:700, cursor:'pointer' }}>Cancel</button>
            <button onClick={createOrg} disabled={!newOrgName.trim()||creating} style={{ flex:2, padding:'9px', borderRadius:10, border:'none', background:'#0f766e', color:'white', fontSize:13, fontWeight:800, cursor:'pointer' }}>{creating?'Creating…':'Create Organization'}</button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:'center', color:'#94a3b8', padding:40 }}>Loading organizations…</div>
      ) : (
        <div style={{ background:'white', borderRadius:16, border:'1px solid #e2e8f0', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {['Name','Types','Island','Primary Contact','Phone','Email'].map(h=>(
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94a3b8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding:40, textAlign:'center', color:'#94a3b8', fontSize:13 }}>No organizations match this filter.</td></tr>
              ) : filtered.map((o, i) => (
                <tr key={o.org_id} onClick={()=>setSelectedOrgId(o.org_id)}
                  style={{ borderBottom:'1px solid #f1f5f9', cursor:'pointer', background: i%2===0?'white':'#fafafa' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='#f0fdfa')}
                  onMouseLeave={e=>(e.currentTarget.style.background=i%2===0?'white':'#fafafa')}>
                  <td style={{ padding:'10px 14px', fontWeight:700, fontSize:13, color:'#0f172a' }}>{o.name}</td>
                  <td style={{ padding:'10px 14px' }}>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      {o.types.map(t=><TypeBadge key={t} type={t}/>)}
                    </div>
                  </td>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'#64748b' }}>{o.island||o.default_island||'—'}</td>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'#334155' }}>{o.primary_contact?.name||o.contactPerson||'—'}</td>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'#334155' }}>{o.primary_contact?.phone||o.contactPhone||'—'}</td>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'#64748b' }}>{o.primary_contact?.email||o.email||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel */}
      {selectedOrgId && <OrgDetailPanel orgId={selectedOrgId} onClose={()=>setSelectedOrgId(null)} />}
    </div>
  );
}
