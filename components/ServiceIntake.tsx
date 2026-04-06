'use client';
import { useState, useEffect, useRef } from 'react';
import type { CustomerRecord } from '@/app/api/service/customers/route';

type WODraft = {
  customerName: string; address: string; city: string; island: string;
  contactPerson: string; contactPhone: string; contactEmail: string;
  description: string; systemType: string; urgency: string;
  assignedTo: string; notes: string;
};

type CrewMember = { user_id: string; name: string; role: string; island: string };

const FL = (label: string, auto?: boolean) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b' }}>{label}</span>
    {auto && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,0.1)', color: '#c2410c', border: '1px solid rgba(249,115,22,0.2)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Auto</span>}
  </div>
);

const INP: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box' };
const SEL: React.CSSProperties = { ...INP, cursor: 'pointer', WebkitAppearance: 'none' };

const SYSTEM_TYPES = [
  // Glass replacement / service
  'IG Unit Replacement',
  'Single Lite Replacement',
  'Laminated Glass Replacement',
  'Tempered Glass Replacement',
  // Storefront & curtainwall
  'Storefront',
  'Storefront Repair',
  'Window Wall',
  'Curtainwall',
  'Curtainwall Repair',
  // Doors
  'Exterior Doors',
  'Interior Doors',
  'Automatic Entrances',
  'Door Hardware / Closer',
  'Sliding Door Repair',
  // Specialty
  'Shower Enclosure',
  'Mirror',
  'Skylights',
  'Railing / Glass Guard',
  'Louvers',
  // Panels & screens
  'Aluminum Composite Panels',
  'Metal Screen Wall',
  // Service-specific
  'Window / Door Adjustment',
  'Sealant / Caulk / Weatherseal',
  'Screen Repair / Replacement',
  'Board-Up / Emergency',
  'Site Assessment / Consultation',
  'Other',
];
const ISLANDS = ['Oahu','Maui','Kauai','Hawaii','Molokai','Lanai'];

// ── Autocomplete helpers ────────────────────────────────────────────────────

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(20,184,166,0.18)', color: '#0f766e', padding: 0, borderRadius: 2 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function AutocompleteInput({
  value, onChange, onSelect, placeholder, style, customers, matchField, subField,
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (c: CustomerRecord) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  customers: CustomerRecord[];
  matchField: keyof CustomerRecord;
  subField?: keyof CustomerRecord;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const fieldVal = (c: CustomerRecord) => String(c[matchField] || '');
  const filtered = value.length >= 2
    ? customers
        .filter(c => fieldVal(c).toLowerCase().includes(value.toLowerCase()) && fieldVal(c) !== '')
        .slice(0, 8)
    : [];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (value.length >= 2) setOpen(true); }}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
        placeholder={placeholder}
        style={style}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'white', borderRadius: 10, border: '1px solid #e2e8f0',
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)', overflow: 'hidden', marginTop: 4,
        }}>
          {filtered.map((c, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(c); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 14px', minHeight: 44, border: 'none', background: 'white',
                cursor: 'pointer',
                borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {highlightMatch(fieldVal(c), value)}
                </span>
                {c.island && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, color: '#0f766e', background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.15)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                    {c.island}
                  </span>
                )}
                <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
                  {c.woCount} past WO{c.woCount !== 1 ? 's' : ''}
                </span>
              </div>
              {subField && c[subField] && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(c[subField])}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Shared auto-fill helper: populate all WO fields from a CustomerRecord
function applyCustomer(prev: WODraft, c: CustomerRecord, primaryField: keyof WODraft): WODraft {
  return {
    ...prev,
    customerName:  primaryField === 'customerName'  ? (c.name || prev.customerName)  : (prev.customerName  || c.name),
    address:       primaryField === 'address'        ? (c.address || prev.address)    : (prev.address       || c.address),
    island:        prev.island       || c.island,
    contactPerson: primaryField === 'contactPerson'  ? (c.contactPerson || prev.contactPerson) : (prev.contactPerson || c.contactPerson),
    contactPhone:  primaryField === 'contactPhone'   ? (c.contactPhone  || prev.contactPhone)  : (prev.contactPhone  || c.contactPhone  || c.contact),
  };
}

const BLANK: WODraft = {
  customerName: '', address: '', city: '', island: '',
  contactPerson: '', contactPhone: '', contactEmail: '',
  description: '', systemType: '', urgency: 'normal',
  assignedTo: '', notes: '',
};

export default function ServiceIntake({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdWO, setCreatedWO] = useState('');
  const [draft, setDraft] = useState<WODraft>({ ...BLANK });
  const [pms, setPms] = useState<CrewMember[]>([]);
  const [fieldCrew, setFieldCrew] = useState<CrewMember[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);

  // Load PMs + customers on mount
  useEffect(() => {
    fetch('/api/crew')
      .then(r => r.json())
      .then(d => {
        setPms(d.pms || []);
        setFieldCrew(d.crew || []);
      })
      .catch(() => {});
    fetch('/api/service/customers')
      .then(r => r.json())
      .then(d => setCustomers(d.customers || []))
      .catch(() => {});
  }, []);

  // When island changes, refresh field crew for that island
  useEffect(() => {
    if (!draft.island) return;
    fetch(`/api/crew?island=${draft.island}`)
      .then(r => r.json())
      .then(d => setFieldCrew(d.crew || []))
      .catch(() => {});
  }, [draft.island]);

  function update(key: keyof WODraft, val: string) {
    setDraft(prev => ({ ...prev, [key]: val }));
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
          customerName:  wo.customerName  || prev.customerName,
          address:       wo.address       || prev.address,
          city:          wo.city          || prev.city,
          island:        wo.island        || prev.island,
          contactPerson: wo.contactPerson || prev.contactPerson,
          contactPhone:  wo.contactPhone  || prev.contactPhone,
          description:   wo.description   || prev.description,
          systemType:    wo.systemType    || prev.systemType,
          urgency:       wo.urgency       || prev.urgency,
        }));
      }
    } catch {}
    setLoading(false);
  }

  async function submit() {
    if (!draft.customerName || !draft.description || !draft.island) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/service/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Failed to create work order');
        setSaving(false);
        return;
      }
      setCreatedWO(data.woNumber || '');
      setStep('done');
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
    setSaving(false);
  }

  const canSubmit = !saving && draft.customerName && draft.description && draft.island;

  // PM options — always available regardless of island
  const pmOptions = pms.filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i);
  // Field crew options — filtered by island
  const crewOptions = fieldCrew.filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i);
  // Combined assign-to list: PMs first, then island crew
  const assignOptions = [
    ...pmOptions.filter(c => c.role.toLowerCase().includes('service') || c.role.toLowerCase().includes('pm')),
    ...crewOptions,
  ].filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i);

  if (step === 'done') return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdfa', border: '2px solid rgba(15,118,110,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Work Order Created</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{draft.customerName} · {draft.island}</div>
      {createdWO && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>WO# {createdWO}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={() => { setStep('form'); setDraft({ ...BLANK }); setCreatedWO(''); }}
          style={{ padding: '10px 20px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Another
        </button>
        <button onClick={onClose}
          style={{ padding: '10px 20px', borderRadius: 12, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Done
        </button>
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
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 16, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'grid', gap: 14 }}>

        {/* Description + Kai fill */}
        <div>
          {FL('Job description / scope')}
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea value={draft.description} onChange={e => update('description', e.target.value)}
              placeholder="Describe what they need — Kai will extract customer, contact, island, and system type automatically..."
              rows={3} style={{ ...INP, flex: 1, resize: 'none', lineHeight: 1.5 }} />
            <button onClick={enrichWithKai} disabled={!draft.description || loading}
              style={{ padding: '8px 14px', borderRadius: 10, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: draft.description && !loading ? 'pointer' : 'default', background: draft.description ? 'rgba(240,253,250,0.96)' : '#f8fafc', color: draft.description ? '#0f766e' : '#94a3b8', border: draft.description ? '1px solid rgba(15,118,110,0.2)' : '1px solid #e2e8f0', alignSelf: 'flex-start', whiteSpace: 'nowrap' as const }}>
              {loading ? '...' : 'Fill →'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Paste a description and hit Fill → to auto-populate fields</div>
        </div>

        {/* Customer */}
        <div>
          {FL('Customer / Company')}
          <AutocompleteInput
            value={draft.customerName}
            onChange={v => update('customerName', v)}
            onSelect={c => setDraft(prev => applyCustomer(prev, c, 'customerName'))}
            placeholder="Customer or company name"
            style={INP}
            customers={customers}
            matchField="name"
            subField="address"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            {FL('Address')}
            <AutocompleteInput
              value={draft.address}
              onChange={v => update('address', v)}
              onSelect={c => setDraft(prev => applyCustomer(prev, c, 'address'))}
              placeholder="Street address"
              style={INP}
              customers={customers}
              matchField="address"
              subField="name"
            />
          </div>
          <div>{FL('City')}<input value={draft.city} onChange={e => update('city', e.target.value)} placeholder="City" style={INP} /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            {FL('Island')}
            <select value={draft.island} onChange={e => update('island', e.target.value)} style={SEL}>
              <option value="">Select island</option>
              {ISLANDS.map(i => <option key={i}>{i}</option>)}
            </select>
          </div>
          <div>
            {FL('Urgency')}
            <select value={draft.urgency} onChange={e => update('urgency', e.target.value)} style={SEL}>
              <option value="normal">Normal</option>
              <option value="urgent">⚡ Urgent</option>
              <option value="low">Low priority</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            {FL('Contact Person', customers.some(c => c.contactPerson))}
            <AutocompleteInput
              value={draft.contactPerson}
              onChange={v => update('contactPerson', v)}
              onSelect={c => setDraft(prev => applyCustomer(prev, c, 'contactPerson'))}
              placeholder="Contact name"
              style={INP}
              customers={customers}
              matchField="contactPerson"
              subField="contactPhone"
            />
          </div>
          <div>
            {FL('Contact Phone', customers.some(c => c.contactPhone))}
            <AutocompleteInput
              value={draft.contactPhone}
              onChange={v => update('contactPhone', v)}
              onSelect={c => setDraft(prev => applyCustomer(prev, c, 'contactPhone'))}
              placeholder="808-XXX-XXXX"
              style={INP}
              customers={customers}
              matchField="contactPhone"
              subField="contactPerson"
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            {FL('System Type')}
            <select value={draft.systemType} onChange={e => update('systemType', e.target.value)} style={SEL}>
              <option value="">Select type</option>
              {SYSTEM_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            {FL('Assign To')}
            <select value={draft.assignedTo} onChange={e => update('assignedTo', e.target.value)} style={SEL}>
              <option value="">Select crew member</option>
              {assignOptions.length > 0
                ? assignOptions.map(c => (
                    <option key={c.user_id} value={c.name}>{c.name} — {c.role}</option>
                  ))
                : <option disabled>Select an island first</option>
              }
            </select>
          </div>
        </div>

        <div>{FL('Notes')}<textarea value={draft.notes} onChange={e => update('notes', e.target.value)} placeholder="Any additional context..." rows={2} style={{ ...INP, resize: 'none' }} /></div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
        <button onClick={submit} disabled={!canSubmit}
          style={{ flex: 2, padding: '11px', borderRadius: 12, background: canSubmit ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0', color: canSubmit ? 'white' : '#94a3b8', border: 'none', fontSize: 13, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default', boxShadow: canSubmit ? '0 4px 16px rgba(15,118,110,0.3)' : 'none' }}>
          {saving ? 'Creating...' : 'Create Work Order'}
        </button>
      </div>
    </div>
  );
}
