'use client';
import { useState } from 'react';

type WODraft = {
  customerName: string; address: string; city: string; island: string;
  contactPerson: string; contactPhone: string; contactEmail: string;
  description: string; systemType: string; urgency: string;
  assignedTo: string; notes: string;
};

const FL = (label: string, auto?: boolean) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b' }}>{label}</span>
    {auto && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,0.1)', color: '#c2410c', border: '1px solid rgba(249,115,22,0.2)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Auto</span>}
  </div>
);

const INP: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, color: '#0f172a', outline: 'none' };
const SEL: React.CSSProperties = { ...INP, cursor: 'pointer', WebkitAppearance: 'none' };

const SYSTEM_TYPES = ['Storefront','Window Wall','Curtainwall','Exterior Doors','Interior Doors','Shower Enclosure','Mirror','Skylights','Railing','Automatic Entrances','Other'];
const ISLANDS = ['Oahu','Maui','Kauai','Hawaii','Molokai','Lanai'];
const CREW = ['Joey Ritthaler','Joey Ritthaler, Nate Nakamura','Joey Ritthaler, Karl Nakamura Sr.','Nate Nakamura','Karl Nakamura Sr.'];

// Known customers for quick lookup
const KNOWN_CUSTOMERS = [
  'Maui Federal Credit Union', 'Westin Maui Resort', 'Marriott', 'Hilton',
  'Bank of Hawaii', 'First Hawaiian Bank', 'Queen\'s Medical Center',
  'Maui Memorial Hospital', 'Alexander & Baldwin', 'Kamehameha Schools',
  'University of Hawaii', 'Iolani School', 'Le Jardin Academy',
];

export default function ServiceIntake({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [loading, setLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [draft, setDraft] = useState<WODraft>({
    customerName: '', address: '', city: '', island: '',
    contactPerson: '', contactPhone: '', contactEmail: '',
    description: '', systemType: '', urgency: 'normal',
    assignedTo: 'Joey Ritthaler', notes: '',
  });

  const suggestions = KNOWN_CUSTOMERS.filter(c => customerSearch && c.toLowerCase().includes(customerSearch.toLowerCase()));

  function update(key: keyof WODraft, val: string) {
    setDraft(prev => ({ ...prev, [key]: val }));
  }

  function selectCustomer(name: string) {
    setCustomerSearch(name);
    update('customerName', name);
    setShowSuggestions(false);
  }

  async function enrichWithKai() {
    if (!draft.description) return;
    setLoading(true);
    try {
      const res = await fetch('/api/service/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: draft.description }),
      });
      const data = await res.json();
      if (data.workOrder) {
        const wo = data.workOrder;
        setDraft(prev => ({
          ...prev,
          customerName: wo.customerName || prev.customerName,
          address: wo.address || prev.address,
          city: wo.city || prev.city,
          island: wo.island || prev.island,
          contactPerson: wo.contactPerson || prev.contactPerson,
          contactPhone: wo.contactPhone || prev.contactPhone,
          description: wo.description || prev.description,
          systemType: wo.systemType || prev.systemType,
          urgency: wo.urgency || prev.urgency,
        }));
        setCustomerSearch(wo.customerName || draft.customerName);
      }
    } catch {}
    setLoading(false);
  }

  function submit() {
    // TODO: write to Smartsheet
    setStep('done');
  }

  const canSubmit = draft.customerName && draft.description && draft.island;

  if (step === 'done') return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdfa', border: '2px solid rgba(15,118,110,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Work Order Created</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>{draft.customerName} · {draft.island}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={() => { setStep('form'); setDraft({ customerName:'',address:'',city:'',island:'',contactPerson:'',contactPhone:'',contactEmail:'',description:'',systemType:'',urgency:'normal',assignedTo:'Joey Ritthaler',notes:'' } as WODraft); setCustomerSearch(''); }} style={{ padding: '10px 20px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Another</button>
        <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 12, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Done</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
      {/* Header */}
      <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>Service — New Lead</div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Create Work Order</h2>
        </div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'grid', gap: 14 }}>

        {/* Description first — Kai can extract from this */}
        <div>
          {FL('Job description / scope')}
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea value={draft.description} onChange={e => update('description', e.target.value)}
              placeholder="Describe what they need — Kai will extract customer, contact, island, and system type automatically..."
              rows={3} style={{ ...INP, flex: 1, resize: 'none', lineHeight: 1.5 }} />
            <button onClick={enrichWithKai} disabled={!draft.description || loading}
              style={{ padding: '8px 14px', borderRadius: 10, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: draft.description ? 'pointer' : 'default', background: draft.description ? 'rgba(240,253,250,0.96)' : '#f8fafc', color: draft.description ? '#0f766e' : '#94a3b8', border: draft.description ? '1px solid rgba(15,118,110,0.2)' : '1px solid #e2e8f0', alignSelf: 'flex-start', whiteSpace: 'nowrap' as const }}>
              {loading ? '...' : 'Fill →'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Type a description and hit Fill → to auto-populate the fields below</div>
        </div>

        {/* Customer lookup */}
        <div style={{ position: 'relative' }}>
          {FL('Customer / Company')}
          <input value={customerSearch}
            onChange={e => { setCustomerSearch(e.target.value); update('customerName', e.target.value); setShowSuggestions(true); }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search existing customers or type new..."
            style={INP} />
          {showSuggestions && suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.1)', zIndex: 50, maxHeight: 160, overflowY: 'auto' }}>
              {suggestions.map(s => (
                <div key={s} onClick={() => selectCustomer(s)} style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, color: '#0f172a', borderBottom: '1px solid #f8fafc' }}
                  onMouseEnter={e => (e.target as HTMLElement).style.background = '#f8fafc'}
                  onMouseLeave={e => (e.target as HTMLElement).style.background = 'white'}>
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>{FL('Address')}<input value={draft.address} onChange={e => update('address', e.target.value)} placeholder="Street address" style={INP} /></div>
          <div>{FL('City')}<input value={draft.city} onChange={e => update('city', e.target.value)} placeholder="City" style={INP} /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>{FL('Island')}<select value={draft.island} onChange={e => update('island', e.target.value)} style={SEL}><option value="">Select island</option>{ISLANDS.map(i => <option key={i}>{i}</option>)}</select></div>
          <div>{FL('Urgency')}<select value={draft.urgency} onChange={e => update('urgency', e.target.value)} style={SEL}><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="low">Low priority</option></select></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>{FL('Contact Person')}<input value={draft.contactPerson} onChange={e => update('contactPerson', e.target.value)} placeholder="Name" style={INP} /></div>
          <div>{FL('Contact Phone')}<input value={draft.contactPhone} onChange={e => update('contactPhone', e.target.value)} placeholder="808-XXX-XXXX" style={INP} /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>{FL('System Type')}<select value={draft.systemType} onChange={e => update('systemType', e.target.value)} style={SEL}><option value="">Select type</option>{SYSTEM_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div>{FL('Assign To')}<select value={draft.assignedTo} onChange={e => update('assignedTo', e.target.value)} style={SEL}>{CREW.map(c => <option key={c}>{c}</option>)}</select></div>
        </div>

        <div>{FL('Notes')}<textarea value={draft.notes} onChange={e => update('notes', e.target.value)} placeholder="Any additional notes..." rows={2} style={{ ...INP, resize: 'none' }} /></div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
        <button onClick={submit} disabled={!canSubmit} style={{ flex: 2, padding: '10px', borderRadius: 12, background: canSubmit ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0', color: canSubmit ? 'white' : '#94a3b8', border: 'none', fontSize: 13, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default', boxShadow: canSubmit ? '0 4px 16px rgba(15,118,110,0.3)' : 'none' }}>
          Create Work Order
        </button>
      </div>
    </div>
  );
}
