'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────
type OrgRecord = {
  org_id: string;
  name: string;
  types: string[];
  entity_type: string;
  default_island: string;
  notes?: string;
  primary_contact?: { contact_id?: string; name: string; email?: string; phone?: string; title?: string; role?: string };
  primary_site?: { site_id?: string; address_line_1?: string; city?: string; island?: string; site_type?: string };
  company: string;
  contactPerson: string;
  contactPhone: string;
  email: string;
  address: string;
  island: string;
  woCount: number;
};

type Contact = {
  contact_id: string;
  org_id: string;
  name: string;
  title: string;
  role: string;
  email: string;
  phone: string;
  is_primary: boolean;
  notes: string;
};

type Site = {
  site_id: string;
  org_id: string;
  name: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  zip: string;
  island: string;
  site_type: string;
  notes?: string;
};

type LinkedWO = {
  id: string;
  woNumber: string;
  name: string;
  status: string;
  island: string;
};

type LinkedProject = {
  kID: string;
  type: string;
  name: string;
  status: string;
  role: string;
};

type OrgDetail = {
  org: OrgRecord & { tax_id?: string; payment_terms?: string };
  contacts: Contact[];
  sites: Site[];
  linkedWOs: LinkedWO[];
  linkedProjects: LinkedProject[];
};

// ── Constants ─────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  GC:            { color: '#1d4ed8', bg: '#eff6ff' },
  COMMERCIAL:    { color: '#0f766e', bg: '#f0fdfa' },
  RESIDENTIAL:   { color: '#15803d', bg: '#f0fdf4' },
  VENDOR:        { color: '#c2410c', bg: '#fff7ed' },
  ARCHITECT:     { color: '#7c3aed', bg: '#f5f3ff' },
  OWNER:         { color: '#b91c1c', bg: '#fef2f2' },
  BUILDER:       { color: '#d97706', bg: '#fffbeb' },
  GOVERNMENT:    { color: '#0369a1', bg: '#f0f9ff' },
  PROPERTY_MGMT: { color: '#64748b', bg: '#f8fafc' },
  CONSULTANT:    { color: '#4b5563', bg: '#f9fafb' },
};

const ALL_TYPES = ['GC', 'COMMERCIAL', 'RESIDENTIAL', 'VENDOR', 'GOVERNMENT', 'PROPERTY_MGMT'];

const FILTER_LABELS: Record<string, string> = {
  GC: 'GC',
  COMMERCIAL: 'Commercial',
  RESIDENTIAL: 'Residential',
  VENDOR: 'Vendor',
  GOVERNMENT: 'Government',
  PROPERTY_MGMT: 'Property Mgmt',
};

const WO_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  OPEN:          { bg: '#fef2f2', color: '#dc2626' },
  SCHEDULED:     { bg: '#eff6ff', color: '#1d4ed8' },
  IN_PROGRESS:   { bg: '#fffbeb', color: '#d97706' },
  ON_HOLD:       { bg: '#f8fafc', color: '#64748b' },
  COMPLETED:     { bg: '#f0fdf4', color: '#15803d' },
  CANCELLED:     { bg: '#f8fafc', color: '#94a3b8' },
  INVOICED:      { bg: '#f0fdfa', color: '#0f766e' },
  PAID:          { bg: '#f0fdf4', color: '#15803d' },
};

const ISLANDS = ['Oahu', 'Maui', 'Kauai', 'Hawaii', 'Molokai', 'Lanai'];

// ── Helper Components ────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLORS[type] || { color: '#64748b', bg: '#f8fafc' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
      background: c.bg, color: c.color, letterSpacing: '0.04em',
      textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const,
    }}>
      {FILTER_LABELS[type] || type.replace(/_/g, ' ')}
    </span>
  );
}

function WOStatusBadge({ status }: { status: string }) {
  const c = WO_STATUS_COLORS[status] || { bg: '#f8fafc', color: '#64748b' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
      background: c.bg, color: c.color, textTransform: 'uppercase' as const,
      letterSpacing: '0.04em', whiteSpace: 'nowrap' as const,
    }}>
      {status?.replace(/_/g, ' ') || '—'}
    </span>
  );
}

// ── Detail Panel ────────────────────────────────────────────────────────
function OrgDetailPanel({
  orgId,
  onClose,
  onNavigate,
}: {
  orgId: string;
  onClose: () => void;
  onNavigate?: (view: string, params?: Record<string, string>) => void;
}) {
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [addingSite, setAddingSite] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', title: '', email: '', phone: '', is_primary: false });
  const [newSite, setNewSite] = useState({ address_line_1: '', city: '', island: '', site_type: 'OFFICE' });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; title: string; phone: string; email: string }>({ name: '', title: '', phone: '', email: '' });
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}`);
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      console.error('[OrgDetailPanel] load', err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  function scheduleSave(fields: Record<string, unknown>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/organizations/${orgId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
      } catch (err) {
        console.error('[OrgDetailPanel] save', err);
      } finally {
        setSaving(false);
      }
    }, 800);
  }

  async function addContact() {
    if (!newContact.name.trim()) return;
    try {
      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newContact, org_id: orgId }),
      });
      await loadDetail();
      setNewContact({ name: '', title: '', email: '', phone: '', is_primary: false });
      setAddingContact(false);
    } catch (err) {
      console.error('[OrgDetailPanel] addContact', err);
    }
  }

  async function setAsPrimary(contactId: string) {
    setMenuOpenId(null);
    try {
      await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, is_primary: true }),
      });
      await loadDetail();
    } catch (err) {
      console.error('[OrgDetailPanel] setAsPrimary', err);
    }
  }

  async function deleteContact(contactId: string) {
    setMenuOpenId(null);
    if (!confirm('Delete this contact?')) return;
    try {
      await fetch(`/api/contacts?contact_id=${contactId}`, { method: 'DELETE' });
      await loadDetail();
    } catch (err) {
      console.error('[OrgDetailPanel] deleteContact', err);
    }
  }

  function startEdit(c: Contact) {
    setEditingContactId(c.contact_id);
    setEditForm({ name: c.name, title: c.title || '', phone: c.phone || '', email: c.email || '' });
    setMenuOpenId(null);
  }

  async function saveContactEdit(contactId: string) {
    try {
      await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, ...editForm }),
      });
      await loadDetail();
      setEditingContactId(null);
    } catch (err) {
      console.error('[OrgDetailPanel] saveContactEdit', err);
    }
  }

  async function addSite() {
    try {
      await fetch(`/api/organizations/${orgId}/sites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSite),
      });
      await loadDetail();
      setNewSite({ address_line_1: '', city: '', island: '', site_type: 'OFFICE' });
      setAddingSite(false);
    } catch (err) {
      console.error('[OrgDetailPanel] addSite', err);
    }
  }

  const INP: React.CSSProperties = {
    fontSize: 13, padding: '6px 10px', borderRadius: 8,
    border: '1px solid #e2e8f0', outline: 'none', background: 'white',
    width: '100%', boxSizing: 'border-box' as const,
  };
  const LBL: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.07em', color: '#94a3b8', marginBottom: 3, display: 'block',
  };
  const SEC: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const,
    letterSpacing: '0.1em', color: '#64748b', marginBottom: 10, marginTop: 20,
    paddingBottom: 6, borderBottom: '1px solid #f1f5f9',
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(15,23,42,0.25)' }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 501,
        width: 'min(700px,100vw)', background: 'white',
        boxShadow: '-4px 0 32px rgba(15,23,42,0.14)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'slideIn 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, padding: '2px 6px', borderRadius: 6, lineHeight: 1 }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading || !detail ? (
              <div style={{ fontSize: 17, fontWeight: 800, color: '#94a3b8' }}>Loading…</div>
            ) : (
              <input
                defaultValue={detail.org.name}
                onBlur={e => { if (e.target.value !== detail.org.name) scheduleSave({ name: e.target.value }); }}
                style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
              />
            )}
          </div>
          {saving && <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 600 }}>Saving…</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        {loading || !detail ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
            Loading organization…
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {/* Types + meta */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
              {detail.org.types.map(t => <TypeBadge key={t} type={t} />)}
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {detail.org.entity_type} · {detail.org.default_island || '—'}
              </span>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 8 }}>
              <label style={LBL}>Notes</label>
              <textarea
                defaultValue={detail.org.notes || ''}
                onBlur={e => scheduleSave({ notes: e.target.value })}
                rows={2}
                placeholder="Internal notes…"
                style={{ ...INP, resize: 'vertical', minHeight: 52 }}
              />
            </div>

            {/* Contacts */}
            <div style={SEC}>Contacts ({detail.contacts.length})</div>
            {detail.contacts.length === 0 && !addingContact && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>No contacts yet.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
              {detail.contacts.map(c => (
                <div key={c.contact_id} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #f1f5f9', background: c.is_primary ? '#f0fdf4' : 'white', position: 'relative' }}>
                  {/* Card header row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                        {c.is_primary && <span style={{ fontSize: 13 }}>⭐</span>}
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{c.name}</span>
                      </div>
                      {c.title && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.title}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => editingContactId === c.contact_id ? setEditingContactId(null) : startEdit(c)}
                        style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: editingContactId === c.contact_id ? '#f1f5f9' : 'white', color: '#64748b', cursor: 'pointer' }}
                      >
                        {editingContactId === c.contact_id ? 'Cancel' : 'Edit'}
                      </button>
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setMenuOpenId(menuOpenId === c.contact_id ? null : c.contact_id)}
                          style={{ fontSize: 14, fontWeight: 700, padding: '2px 7px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer', lineHeight: 1.2 }}
                        >···</button>
                        {menuOpenId === c.contact_id && (
                          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 10, minWidth: 150, overflow: 'hidden' }}>
                            <button
                              onClick={() => setAsPrimary(c.contact_id)}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                            >⭐ Set as Primary</button>
                            <button
                              onClick={() => deleteContact(c.contact_id)}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}
                            >🗑 Delete</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* View mode: phone + email links */}
                  {editingContactId !== c.contact_id && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {c.phone && (
                        <div style={{ fontSize: 12, color: '#334155' }}>
                          📞 <a href={`tel:${c.phone}`} style={{ color: '#0f766e', textDecoration: 'none' }}>{c.phone}</a>
                        </div>
                      )}
                      {c.email && (
                        <div style={{ fontSize: 12, color: '#334155' }}>
                          ✉️ <a href={`mailto:${c.email}`} style={{ color: '#0f766e', textDecoration: 'none' }}>{c.email}</a>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Inline edit mode */}
                  {editingContactId === c.contact_id && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div><label style={LBL}>Name</label><input style={INP} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} /></div>
                        <div><label style={LBL}>Title</label><input style={INP} value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} /></div>
                        <div><label style={LBL}>Phone</label><input style={INP} type="tel" value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} onBlur={e => setEditForm(p => ({ ...p, phone: formatPhone(e.target.value) }))} /></div>
                        <div><label style={LBL}>Email</label><input style={INP} type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} /></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setEditingContactId(null)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                        <button onClick={() => saveContactEdit(c.contact_id)} style={{ flex: 2, padding: '7px', borderRadius: 8, border: 'none', background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {addingContact ? (
              <div style={{ padding: '12px', borderRadius: 10, border: '1.5px dashed #0f766e', marginTop: 8, marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div><label style={LBL}>Name *</label><input style={INP} value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
                  <div><label style={LBL}>Title</label><input style={INP} value={newContact.title} onChange={e => setNewContact(p => ({ ...p, title: e.target.value }))} /></div>
                  <div><label style={LBL}>Phone</label><input style={INP} type="tel" value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} onBlur={e => setNewContact(p => ({ ...p, phone: formatPhone(e.target.value) }))} /></div>
                  <div><label style={LBL}>Email</label><input style={INP} type="email" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#475569' }}>
                    <input type="checkbox" checked={newContact.is_primary} onChange={e => setNewContact(p => ({ ...p, is_primary: e.target.checked }))} />
                    Set as primary contact
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setAddingContact(false)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={addContact} disabled={!newContact.name.trim()} style={{ flex: 2, padding: '7px', borderRadius: 8, border: 'none', background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add Contact</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingContact(true)} style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>+ Add Contact</button>
            )}

            {/* Sites */}
            <div style={SEC}>Sites ({detail.sites.length})</div>
            {detail.sites.length === 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>No sites yet.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
              {detail.sites.map(s => (
                <div key={s.site_id} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #f1f5f9', fontSize: 13, color: '#334155' }}>
                  <div style={{ fontWeight: 700 }}>{s.address_line_1 || '—'}{s.city ? `, ${s.city}` : ''}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {[s.island, s.site_type, s.zip].filter(Boolean).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
            {addingSite ? (
              <div style={{ padding: '12px', borderRadius: 10, border: '1.5px dashed #0f766e', marginTop: 8, marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div><label style={LBL}>Address</label><input style={INP} value={newSite.address_line_1} onChange={e => setNewSite(p => ({ ...p, address_line_1: e.target.value }))} autoFocus /></div>
                  <div><label style={LBL}>City</label><input style={INP} value={newSite.city} onChange={e => setNewSite(p => ({ ...p, city: e.target.value }))} /></div>
                  <div><label style={LBL}>Island</label>
                    <select style={{ ...INP, cursor: 'pointer' }} value={newSite.island} onChange={e => setNewSite(p => ({ ...p, island: e.target.value }))}>
                      <option value="">Select island</option>
                      {ISLANDS.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div><label style={LBL}>Type</label>
                    <select style={{ ...INP, cursor: 'pointer' }} value={newSite.site_type} onChange={e => setNewSite(p => ({ ...p, site_type: e.target.value }))}>
                      {['OFFICE', 'JOBSITE', 'RESIDENCE', 'WAREHOUSE'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setAddingSite(false)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={addSite} style={{ flex: 2, padding: '7px', borderRadius: 8, border: 'none', background: '#0f766e', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Add Site</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingSite(true)} style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>+ Add Site</button>
            )}

            {/* Linked Work Orders */}
            {detail.linkedWOs.length > 0 && (
              <>
                <div style={SEC}>Linked Work Orders ({detail.linkedWOs.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {detail.linkedWOs.map(wo => (
                    <div
                      key={wo.id}
                      onClick={() => onNavigate && onNavigate('workorders', { woId: wo.id })}
                      style={{
                        padding: '9px 12px', borderRadius: 9, border: '1px solid #f1f5f9',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        fontSize: 12, cursor: onNavigate ? 'pointer' : 'default',
                        background: 'white',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (onNavigate) e.currentTarget.style.background = '#f0fdfa'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{wo.name || wo.woNumber}</span>
                        <span style={{ color: '#94a3b8', marginLeft: 8 }}>{wo.woNumber}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {wo.island && <span style={{ fontSize: 10, color: '#94a3b8' }}>{wo.island}</span>}
                        <WOStatusBadge status={wo.status} />
                        {onNavigate && <span style={{ color: '#94a3b8', fontSize: 12 }}>→</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Linked Projects */}
            {detail.linkedProjects.length > 0 && (
              <>
                <div style={SEC}>Linked Projects ({detail.linkedProjects.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {detail.linkedProjects.map(p => (
                    <div key={p.kID} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <div>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{p.name}</span>
                        <span style={{ fontSize: 10, color: '#0891b2', marginLeft: 6 }}>{p.role}</span>
                      </div>
                      <span style={{ color: '#94a3b8' }}>{p.kID}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Empty state */}
            {detail.linkedWOs.length === 0 && detail.linkedProjects.length === 0 && (
              <div style={{ marginTop: 20, padding: '16px', borderRadius: 10, background: '#f8fafc', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
                No linked work orders or projects yet.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Phone formatter ─────────────────────────────────────────────────────
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return raw;
}

// ── New Org Modal ────────────────────────────────────────────────────────
type OrgCategory = 'business' | 'person' | 'gc' | 'vendor';

const ORG_CATEGORIES: { id: OrgCategory; emoji: string; label: string; sublabel: string; types: string[]; entity_type: string }[] = [
  { id: 'business', emoji: '🏢', label: 'Business', sublabel: 'Hotel, retail, property, office', types: ['COMMERCIAL'], entity_type: 'COMPANY' },
  { id: 'person',   emoji: '🏠', label: 'Person / Homeowner', sublabel: 'Individual residential customer', types: ['RESIDENTIAL'], entity_type: 'INDIVIDUAL' },
  { id: 'gc',       emoji: '🔨', label: 'GC / Builder', sublabel: 'General contractor or builder', types: ['GC', 'COMMERCIAL'], entity_type: 'COMPANY' },
  { id: 'vendor',   emoji: '📦', label: 'Vendor / Supplier', sublabel: 'Materials, equipment, subcontractor', types: ['VENDOR'], entity_type: 'COMPANY' },
];

function NewOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<'category' | 'form'>('category');
  const [category, setCategory] = useState<OrgCategory | null>(null);

  // Form fields
  const [firstName, setFirstName] = useState('');  // person only
  const [lastName, setLastName] = useState('');    // person only
  const [companyName, setCompanyName] = useState(''); // business/gc/vendor
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [island, setIsland] = useState('');
  const [isPropMgmt, setIsPropMgmt] = useState(false);
  const [isGovt, setIsGovt] = useState(false);
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [dupWarning, setDupWarning] = useState('');

  const cat = ORG_CATEGORIES.find(c => c.id === category);
  const isPersonal = category === 'person';

  // Derived org name
  const orgName = isPersonal
    ? [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
    : companyName.trim();

  function buildTypes(): string[] {
    const base = cat?.types || ['COMMERCIAL'];
    const extras: string[] = [];
    if (isPropMgmt) extras.push('PROPERTY_MGMT');
    if (isGovt) extras.push('GOVERNMENT');
    return [...new Set([...base, ...extras])];
  }

  // Duplicate check — fires on name blur
  async function checkDuplicate(checkName: string) {
    if (!checkName.trim()) return;
    try {
      const res = await fetch(`/api/organizations?q=${encodeURIComponent(checkName)}&limit=3`);
      if (!res.ok) return;
      const data = await res.json();
      const orgs: OrgRecord[] = data.orgs || [];
      const match = orgs.find(o => o.name.toLowerCase() === checkName.toLowerCase());
      if (match) setDupWarning(`A record named "${match.name}" already exists.`);
      else setDupWarning('');
    } catch { /* non-blocking */ }
  }

  async function create() {
    if (!orgName) return;
    setCreating(true);
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName,
          types: buildTypes(),
          entity_type: cat?.entity_type || 'COMPANY',
          island,
          notes,
          source: 'MANUAL_ENTRY',
          contact_name: (isPersonal ? orgName : contactName.trim()) || undefined,
          contact_phone: phone.trim() || undefined,
          contact_email: email.trim() || undefined,
          address: address.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onCreated();
    } catch (err) {
      console.error('[NewOrgModal] create', err);
    } finally {
      setCreating(false);
    }
  }

  const INP: React.CSSProperties = {
    fontSize: 13, padding: '8px 12px', borderRadius: 9,
    border: '1px solid #e2e8f0', outline: 'none', background: 'white',
    width: '100%', boxSizing: 'border-box' as const,
  };
  const LBL: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.07em', color: '#94a3b8', marginBottom: 4, display: 'block',
  };
  const ROW2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(15,23,42,0.35)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 601, background: 'white', borderRadius: 20, padding: '24px',
        width: 'min(480px, calc(100vw - 32px))', boxShadow: '0 20px 60px rgba(15,23,42,0.2)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>

        {/* ── Step 1: Category picker ── */}
        {step === 'category' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>New Customer</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>What type of customer is this?</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {ORG_CATEGORIES.map(c => (
                <button key={c.id} onClick={() => { setCategory(c.id); setStep('form'); }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 6, padding: '20px 12px', borderRadius: 14, cursor: 'pointer',
                    border: '1.5px solid #e2e8f0', background: '#fafafa',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#0f766e'; (e.currentTarget as HTMLButtonElement).style.background = '#f0fdfa'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLButtonElement).style.background = '#fafafa'; }}
                >
                  <span style={{ fontSize: 28 }}>{c.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{c.label}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.3 }}>{c.sublabel}</span>
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{ width: '100%', marginTop: 16, padding: '10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </>
        )}

        {/* ── Step 2: Type-specific form ── */}
        {step === 'form' && cat && (
          <>
            <div style={{ marginBottom: 18 }}>
              <button onClick={() => setStep('category')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0f766e', fontSize: 12, fontWeight: 700, padding: 0, marginBottom: 8 }}>← Back</button>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>
                {cat.emoji} New {cat.label}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{cat.sublabel}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Person: First + Last name fields */}
              {isPersonal && (
                <div style={ROW2}>
                  <div>
                    <label style={LBL}>First Name *</label>
                    <input style={INP} value={firstName} onChange={e => setFirstName(e.target.value)}
                      onBlur={() => checkDuplicate([firstName.trim(), lastName.trim()].filter(Boolean).join(' '))}
                      placeholder="Bob" autoFocus />
                  </div>
                  <div>
                    <label style={LBL}>Last Name *</label>
                    <input style={INP} value={lastName} onChange={e => setLastName(e.target.value)}
                      onBlur={() => checkDuplicate([firstName.trim(), lastName.trim()].filter(Boolean).join(' '))}
                      placeholder="Campbell" />
                  </div>
                </div>
              )}

              {/* Business/GC/Vendor: Company name */}
              {!isPersonal && (
                <div>
                  <label style={LBL}>Company Name *</label>
                  <input style={INP} value={companyName} onChange={e => setCompanyName(e.target.value)}
                    onBlur={() => checkDuplicate(companyName)}
                    placeholder={cat.id === 'gc' ? 'e.g. Nordic PCL Construction' : cat.id === 'vendor' ? 'e.g. Kawneer Hawaii' : 'e.g. Westin Maui Resort'}
                    autoFocus />
                </div>
              )}

              {/* Duplicate warning */}
              {dupWarning && (
                <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                  ⚠️ {dupWarning}
                </div>
              )}

              {/* Phone + Email — side by side for person, stacked for business */}
              {isPersonal ? (
                <div style={ROW2}>
                  <div>
                    <label style={LBL}>Phone *</label>
                    <input style={INP} type="tel" value={phone}
                      onChange={e => setPhone(e.target.value)}
                      onBlur={e => setPhone(formatPhone(e.target.value))}
                      placeholder="(808) 555-0199" />
                  </div>
                  <div>
                    <label style={LBL}>Email</label>
                    <input style={INP} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="bob@email.com" />
                  </div>
                </div>
              ) : (
                <>
                  <div style={ROW2}>
                    <div>
                      <label style={LBL}>Contact Person</label>
                      <input style={INP} value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Name" />
                    </div>
                    <div>
                      <label style={LBL}>Phone</label>
                      <input style={INP} type="tel" value={phone}
                        onChange={e => setPhone(e.target.value)}
                        onBlur={e => setPhone(formatPhone(e.target.value))}
                        placeholder="(808) 555-0000" />
                    </div>
                  </div>
                  <div>
                    <label style={LBL}>Email</label>
                    <input style={INP} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.com" />
                  </div>
                </>
              )}

              {/* Address */}
              <div>
                <label style={LBL}>Address</label>
                <input style={INP} value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address (optional)" />
              </div>

              {/* Island + optional subcategories */}
              <div style={ROW2}>
                <div>
                  <label style={LBL}>Island</label>
                  <select style={{ ...INP, cursor: 'pointer' }} value={island} onChange={e => setIsland(e.target.value)}>
                    <option value="">Select island</option>
                    {ISLANDS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                {category === 'business' && (
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6, paddingBottom: 2 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#475569' }}>
                      <input type="checkbox" checked={isPropMgmt} onChange={e => setIsPropMgmt(e.target.checked)} />
                      Property Mgmt
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#475569' }}>
                      <input type="checkbox" checked={isGovt} onChange={e => setIsGovt(e.target.checked)} />
                      Government
                    </label>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label style={LBL}>Notes</label>
                <textarea style={{ ...INP, resize: 'none', minHeight: 56 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes (optional)" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={create} disabled={!orgName || creating}
                style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', fontSize: 13, fontWeight: 800, cursor: !orgName ? 'not-allowed' : 'pointer', opacity: !orgName ? 0.6 : 1 }}>
                {creating ? 'Creating…' : isPersonal ? 'Create Customer' : `Create ${cat.label}`}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────
interface Props {
  onNavigate?: (view: string, params?: Record<string, string>) => void;
}

export default function OrganizationsPanel({ onNavigate }: Props) {
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [showNewOrg, setShowNewOrg] = useState(false);

  const load = useCallback(async (opts?: { nocache?: boolean }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (opts?.nocache) params.set('nocache', '1');
      const res = await fetch(`/api/organizations?${params}`);
      const data = await res.json();
      setOrgs(data.organizations || []);
      setTotal(data.total || (data.organizations || []).length);
    } catch (err) {
      console.error('[OrganizationsPanel] load', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Client-side filter (search + type chip)
  const filtered = orgs.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q || q.length < 2 ||
      o.name.toLowerCase().includes(q) ||
      (o.primary_contact?.name || o.contactPerson || '').toLowerCase().includes(q);
    const matchType = typeFilter === 'ALL' || o.types.includes(typeFilter);
    return matchSearch && matchType;
  });

  // Sort: orgs with woCount > 0 first (desc), then alpha
  const sorted = [...filtered].sort((a, b) => {
    if (b.woCount !== a.woCount) return b.woCount - a.woCount;
    return a.name.localeCompare(b.name);
  });

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Left — list */}
      <div style={{
        width: selectedOrgId ? '38%' : '100%',
        maxWidth: selectedOrgId ? 420 : undefined,
        display: 'flex', flexDirection: 'column', borderRight: selectedOrgId ? '1px solid #f1f5f9' : 'none',
        overflow: 'hidden', flexShrink: 0,
        transition: 'width 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>People</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em' }}>Organizations</div>
            <button
              onClick={() => setShowNewOrg(true)}
              style={{ padding: '7px 14px', borderRadius: 9, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              + New Org
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
            {loading ? 'Loading…' : `${sorted.length} of ${total} organizations`}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or contact…"
            style={{
              fontSize: 13, padding: '8px 12px', borderRadius: 10,
              border: '1px solid #e2e8f0', outline: 'none', background: 'white',
              width: '100%', boxSizing: 'border-box', marginBottom: 10,
            }}
          />

          {/* Type chips */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
            <button
              onClick={() => setTypeFilter('ALL')}
              style={{
                fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                border: typeFilter === 'ALL' ? '1.5px solid #0f766e' : '1px solid #e2e8f0',
                background: typeFilter === 'ALL' ? '#f0fdfa' : 'white',
                color: typeFilter === 'ALL' ? '#0f766e' : '#94a3b8',
              }}>All</button>
            {ALL_TYPES.map(t => {
              const active = typeFilter === t;
              const c = TYPE_COLORS[t] || { color: '#64748b', bg: '#f8fafc' };
              return (
                <button key={t}
                  onClick={() => setTypeFilter(active ? 'ALL' : t)}
                  style={{
                    fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                    textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                    border: active ? `1.5px solid ${c.color}` : '1px solid #e2e8f0',
                    background: active ? c.bg : 'white', color: active ? c.color : '#94a3b8',
                  }}>
                  {FILTER_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Org rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 20px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading organizations…</div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No organizations match this filter.</div>
          ) : (
            sorted.map(o => {
              const isSelected = o.org_id === selectedOrgId;
              const displayIsland = o.island || o.default_island || o.primary_site?.island || '';
              return (
                <div
                  key={o.org_id}
                  onClick={() => setSelectedOrgId(isSelected ? null : o.org_id)}
                  style={{
                    padding: '10px 12px', borderRadius: 10, marginBottom: 3, cursor: 'pointer',
                    border: isSelected ? '1.5px solid #0f766e' : '1px solid transparent',
                    background: isSelected ? '#f0fdfa' : 'white',
                    transition: 'background 0.1s, border 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'white'; }}
                >
                  {/* Row top: name + WO count */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', lineHeight: 1.3, flex: 1, minWidth: 0, marginRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.name}
                    </div>
                    {o.woCount > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', flexShrink: 0 }}>
                        {o.woCount} WO{o.woCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {/* Row bottom: badges + island */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {o.types.slice(0, 3).map(t => <TypeBadge key={t} type={t} />)}
                    {displayIsland && (
                      <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 2 }}>{displayIsland}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right — detail */}
      {selectedOrgId && (
        <OrgDetailPanel
          orgId={selectedOrgId}
          onClose={() => setSelectedOrgId(null)}
          onNavigate={onNavigate}
        />
      )}

      {/* New Org Modal */}
      {showNewOrg && (
        <NewOrgModal
          onClose={() => setShowNewOrg(false)}
          onCreated={() => {
            setShowNewOrg(false);
            load({ nocache: true });
          }}
        />
      )}
    </div>
  );
}
