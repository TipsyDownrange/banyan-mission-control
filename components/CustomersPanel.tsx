'use client';
import { useEffect, useState } from 'react';

type Rec = Record<string, string>;

const INP: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(15,118,110,0.3)', background: 'rgba(240,253,250,0.6)', fontSize: 12, color: '#0f172a', outline: 'none' };
const FL = (label: string) => <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#94a3b8', marginBottom: 3 }}>{label}</div>;

const GC_EDITABLE = ['Company Name','Primary Contact','Contact Email','Contact Phone','Notes'];
const CUST_EDITABLE = ['Name','Primary Contact','Phone','Email','Address','City','Island','Notes'];

export default function CustomersPanel() {
  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'customers' | 'gc'>('gc');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Rec>({});
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newDraft, setNewDraft] = useState<Rec>({});

  const nameKey = tab === 'gc' ? 'Company Name' : 'Name';
  const contactKey = 'Primary Contact';
  const emailKey = tab === 'gc' ? 'Contact Email' : 'Email';
  const phoneKey = tab === 'gc' ? 'Contact Phone' : 'Phone';
  const countKey = tab === 'gc' ? 'Bid Count' : 'Job Count';
  const idKey = tab === 'gc' ? 'GC ID' : 'Customer ID';
  const editableFields = tab === 'gc' ? GC_EDITABLE : CUST_EDITABLE;

  useEffect(() => {
    setLoading(true);
    fetch(`/api/customers?tab=${tab}&search=${encodeURIComponent(search)}`)
      .then(r => r.json())
      .then(d => { setRecords(d.records || []); setTotal(d.total || 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tab, search]);

  function startEdit(r: Rec) {
    setEditing(r[idKey]);
    setEditDraft({ ...r });
    setExpanded(r[idKey]);
  }

  async function saveEdit(r: Rec) {
    setSaving(true);
    try {
      await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab, id: r[idKey], data: editDraft }),
      });
      setRecords(prev => prev.map(rec => rec[idKey] === r[idKey] ? { ...rec, ...editDraft } : rec));
      setEditing(null);
    } catch { alert('Save failed — try again'); }
    setSaving(false);
  }

  async function addNew() {
    setSaving(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab, data: newDraft }),
      });
      const d = await res.json();
      if (d.record) setRecords(prev => [d.record, ...prev]);
      setShowNew(false);
      setNewDraft({});
    } catch { alert('Save failed'); }
    setSaving(false);
  }

  return (
    <div style={{ padding: '32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Admin</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Customer Database</h1>
          <button onClick={() => setShowNew(true)} style={{ padding: '9px 20px', borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,118,110,0.3)' }}>
            + Add {tab === 'gc' ? 'GC' : 'Customer'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24, padding: 18, borderRadius: 24, background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)', border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {[
          { label: 'Service customers', value: '275', helper: 'From work order history' },
          { label: 'GC contacts', value: '111', helper: 'From 11 years of bids' },
          { label: 'Showing', value: loading ? '...' : String(total), helper: 'Current filter' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
          </div>
        ))}
      </div>

      {/* Tabs + Search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['gc','customers'] as const).map(k => (
          <button key={k} onClick={() => { setTab(k); setSearch(''); setSearchInput(''); setEditing(null); setExpanded(null); }} style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', border: tab === k ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0', background: tab === k ? 'rgba(240,253,250,0.96)' : 'white', color: tab === k ? '#0f766e' : '#64748b', cursor: 'pointer' }}>
            {k === 'gc' ? 'GC Contacts' : 'Service Customers'}
          </button>
        ))}
        <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 200 }}>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && setSearch(searchInput)}
            placeholder="Search name, contact, email, island..." style={{ flex: 1, background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '8px 14px', fontSize: 13, color: '#0f172a', outline: 'none' }} />
          <button onClick={() => setSearch(searchInput)} style={{ padding: '8px 16px', borderRadius: 12, background: 'rgba(240,253,250,0.96)', border: '1px solid rgba(15,118,110,0.2)', color: '#0f766e', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Search</button>
          {search && <button onClick={() => { setSearch(''); setSearchInput(''); }} style={{ padding: '8px 12px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Clear</button>}
        </div>
      </div>

      {/* Add New Form */}
      {showNew && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid rgba(15,118,110,0.2)', boxShadow: '0 14px 30px rgba(15,23,42,0.06)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>New {tab === 'gc' ? 'GC Contact' : 'Customer'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10, marginBottom: 16 }}>
            {editableFields.map(field => (
              <div key={field}>
                {FL(field)}
                <input value={newDraft[field] || ''} onChange={e => setNewDraft(p => ({ ...p, [field]: e.target.value }))}
                  style={{ ...INP, background: 'white', border: '1px solid #e2e8f0' }} placeholder={field} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setShowNew(false); setNewDraft({}); }} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button onClick={addNew} disabled={saving} style={{ padding: '8px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ background: 'white', borderRadius: 20, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading...</div>
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid rgba(226,232,240,0.9)', boxShadow: '0 2px 12px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 150px 150px 60px 80px', padding: '10px 20px', background: 'rgba(248,250,252,0.8)', borderBottom: '1px solid #f1f5f9' }}>
            {['ID', tab === 'gc' ? 'Company' : 'Customer', 'Contact', tab === 'gc' ? 'Email' : 'Island/Email', tab === 'gc' ? 'Bids' : 'Jobs', 'Actions'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>{h}</div>
            ))}
          </div>

          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {records.slice(0, 100).map(r => {
              const id = r[idKey] || '';
              const isExpanded = expanded === id;
              const isEditing = editing === id;
              const count = parseInt(r[countKey] || '0');

              return (
                <div key={id}>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 150px 150px 60px 80px', padding: '10px 20px', borderBottom: '1px solid #f8fafc', background: isExpanded ? 'rgba(240,253,250,0.3)' : 'white' }}>
                    <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>{id}</div>
                    <div onClick={() => !isEditing && setExpanded(isExpanded ? null : id)} style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', paddingRight: 12, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', cursor: 'pointer' }}>{r[nameKey]}</div>
                    <div style={{ fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r[contactKey] || '—'}</div>
                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r[emailKey] || r['Island'] || '—'}</div>
                    <div style={{ fontSize: 12, fontWeight: count > 5 ? 700 : 400, color: count > 10 ? '#0f766e' : '#64748b', display: 'flex', alignItems: 'center' }}>{count || '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {!isEditing ? (
                        <button onClick={() => startEdit(r)} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(15,118,110,0.2)', background: 'rgba(240,253,250,0.8)', color: '#0f766e', fontSize: 10, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Edit</button>
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => saveEdit(r)} disabled={saving} style={{ padding: '4px 8px', borderRadius: 8, border: 'none', background: '#0f766e', color: 'white', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>{saving ? '...' : 'Save'}</button>
                          <button onClick={() => setEditing(null)} style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>×</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded / Edit */}
                  {isExpanded && (
                    <div style={{ padding: '14px 20px', background: 'rgba(248,250,252,0.6)', borderBottom: '1px solid #f1f5f9' }}>
                      {isEditing ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
                          {editableFields.map(field => (
                            <div key={field}>
                              {FL(field)}
                              <input value={editDraft[field] || ''} onChange={e => setEditDraft(p => ({ ...p, [field]: e.target.value }))} style={INP} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
                          {Object.entries(r).filter(([k,v]) => v && k !== idKey).map(([k,v]) => (
                            <div key={k}>
                              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>{k}</div>
                              <div style={{ fontSize: 12, color: '#334155' }}>{v}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {records.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>No records found</div>}
            {records.length > 100 && <div style={{ padding: '12px 20px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Showing first 100 of {records.length} — use search to narrow</div>}
          </div>

          <div style={{ padding: '10px 20px', borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#94a3b8', background: 'rgba(248,250,252,0.5)' }}>
            {total} records · Click row to expand · Edit button to modify · + Add to create new
          </div>
        </div>
      )}
    </div>
  );
}
